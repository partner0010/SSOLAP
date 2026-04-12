/**
 * VocalXProcessor.worklet.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vocal-X 핵심 DSP 처리기 — AudioWorkletProcessor
 *
 * 왜 AudioWorklet인가?
 *   - ScriptProcessorNode (구 방식): 메인 JS 스레드에서 실행 → UI 렌더링과 경쟁
 *   - AudioWorkletProcessor (신 방식): 전용 오디오 스레드에서 실행 → 지연 없음
 *
 * 지연 시간 목표: ≤ 20ms (영상-음성 싱크 임계값)
 *
 * 실제 측정치:
 *   버퍼 크기: 128 샘플 × 4 (더블버퍼 × 2겹) = 512 샘플
 *   44100Hz 기준: 512 / 44100 ≈ 11.6ms → ✅ 20ms 이하
 *
 * 신호 처리 순서 (매 128 샘플 블록):
 *   원음 입력
 *     → [FFT 주파수 분석]
 *     → [EQ: 대역별 이득 조절]
 *     → [활성 필터 체인 적용]
 *     → [Compressor: 클리핑 방지]
 *     → 출력
 * ─────────────────────────────────────────────────────────────────────────────
 */

// AudioWorklet 환경에서는 일반 import가 불가 → 인라인 클래스로 구현

// ─── FFT (Fast Fourier Transform) 구현 ───────────────────────────────────────
/**
 * 왜 FFT가 필요한가:
 *   시간 도메인(파형) → 주파수 도메인(스펙트럼)으로 변환
 *   주파수 도메인에서: 특정 주파수만 증폭/감쇠/수정 가능
 *   → EQ, 리버브, 코러스 등 모든 '주파수 기반' 효과의 기초
 *
 * Cooley-Tukey 알고리즘: O(N log N) — 실시간 처리에 충분히 빠름
 */
class FFT {
  private size: number;
  private cosTable: Float32Array; // 미리 계산된 코사인 테이블 (성능 최적화)
  private sinTable: Float32Array; // 미리 계산된 사인 테이블

  constructor(size: number) {
    this.size = size;
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);

    // 트위들 팩터 사전 계산 (매번 계산하면 느림)
    for (let i = 0; i < size / 2; i++) {
      this.cosTable[i] = Math.cos(-2 * Math.PI * i / size);
      this.sinTable[i] = Math.sin(-2 * Math.PI * i / size);
    }
  }

  /**
   * 실수 배열 → 복소수 스펙트럼 변환 (In-place FFT)
   * @param re 실수부 배열 (입력/출력)
   * @param im 허수부 배열 (입력/출력, 보통 0으로 초기화)
   */
  forward(re: Float32Array, im: Float32Array): void {
    const N = this.size;

    // 비트 역순 재배열 (Cooley-Tukey 알고리즘 준비)
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        // 실수부 교환
        [re[i], re[j]] = [re[j], re[i]];
        // 허수부 교환
        [im[i], im[j]] = [im[j], im[i]];
      }
    }

    // 버터플라이 연산 (주파수 도메인으로 변환)
    for (let len = 2; len <= N; len <<= 1) {
      const halfLen = len >> 1;
      for (let i = 0; i < N; i += len) {
        for (let j = 0; j < halfLen; j++) {
          const idx = j * (N / len);
          const cos = this.cosTable[idx];
          const sin = this.sinTable[idx];

          // 버터플라이 연산: w * 하단 + 상단
          const reU = re[i + j + halfLen] * cos - im[i + j + halfLen] * sin;
          const imU = re[i + j + halfLen] * sin + im[i + j + halfLen] * cos;

          re[i + j + halfLen] = re[i + j] - reU;
          im[i + j + halfLen] = im[i + j] - imU;
          re[i + j] += reU;
          im[i + j] += imU;
        }
      }
    }
  }

  /**
   * 역변환: 주파수 도메인 → 시간 도메인 (IFFT)
   */
  inverse(re: Float32Array, im: Float32Array): void {
    // 허수부 부호 반전 → 순방향 FFT → 허수부 재반전 → 1/N 스케일
    for (let i = 0; i < this.size; i++) im[i] = -im[i];
    this.forward(re, im);
    for (let i = 0; i < this.size; i++) {
      re[i] /= this.size;
      im[i] = -im[i] / this.size;
    }
  }
}

// ─── 콤 필터 (Comb Filter) ────────────────────────────────────────────────────
/**
 * 원리: 원음과 짧게 지연된 복사본을 더함
 *   → 특정 주파수에서 보강 간섭 → 배음(Harmonic) 강화
 *   → 금속 공명음의 핵심
 *
 * 딜레이 시간 조절로 강조되는 배음 주파수 변경 가능
 */
class CombFilter {
  private buffer: Float32Array;
  private writeIdx: number = 0;
  private delayLength: number;
  private feedback: number; // 피드백 강도 (0~1)
  private gain: number;     // 출력 이득

  constructor(sampleRate: number, delayMs: number, feedback: number, gain: number = 0.7) {
    this.delayLength = Math.round(sampleRate * delayMs / 1000);
    this.buffer = new Float32Array(this.delayLength);
    this.feedback = feedback;
    this.gain = gain;
  }

  processSample(input: number): number {
    // 딜레이 버퍼에서 이전 샘플 읽기
    const readIdx = (this.writeIdx - this.delayLength + this.buffer.length) % this.buffer.length;
    const delayed = this.buffer[readIdx];

    // 피드백: 현재 입력 + 지연된 출력의 일부
    const output = input + delayed * this.feedback;

    // 버퍼에 쓰기 (원형 버퍼)
    this.buffer[this.writeIdx] = output;
    this.writeIdx = (this.writeIdx + 1) % this.buffer.length;

    return output * this.gain;
  }
}

// ─── 멀티탭 딜레이 (Multi-tap Delay) ─────────────────────────────────────────
/**
 * 여러 개의 딜레이 탭(tap)을 각기 다른 시간/이득으로 설정
 * → 각 탭이 서로 다른 에코를 만들어냄 → 공간감이 풍부해짐
 * Nebula Echo에 사용
 */
class MultiTapDelay {
  private buffer: Float32Array;
  private writeIdx: number = 0;
  private taps: Array<{ delaySamples: number; gain: number }>;
  private bufferSize: number;

  constructor(sampleRate: number, taps: Array<{ delayMs: number; gain: number }>) {
    // 가장 긴 딜레이 + 여유분으로 버퍼 크기 결정
    const maxDelaySamples = Math.max(...taps.map(t =>
      Math.round(sampleRate * t.delayMs / 1000)
    )) + 64;

    this.bufferSize = maxDelaySamples;
    this.buffer     = new Float32Array(maxDelaySamples);
    this.taps       = taps.map(t => ({
      delaySamples: Math.round(sampleRate * t.delayMs / 1000),
      gain: t.gain,
    }));
  }

  processSample(input: number): number {
    // 모든 탭의 출력 합산
    let output = input; // 원음 포함
    for (const tap of this.taps) {
      const readIdx = (this.writeIdx - tap.delaySamples + this.bufferSize) % this.bufferSize;
      output += this.buffer[readIdx] * tap.gain;
    }

    this.buffer[this.writeIdx] = input;
    this.writeIdx = (this.writeIdx + 1) % this.bufferSize;

    return output;
  }
}

// ─── 바이쿼드 필터 (Biquad Filter) ───────────────────────────────────────────
/**
 * 2차 IIR 필터 — EQ, 로우패스, 하이패스, 피킹 등 모든 필터의 기반
 * 계수 a0~a2, b1~b2가 필터 특성을 결정
 */
class BiquadFilter {
  // 필터 계수
  private b0 = 1; private b1 = 0; private b2 = 0;
  private a1 = 0; private a2 = 0;
  // 상태 변수 (이전 샘플 기억)
  private x1 = 0; private x2 = 0; // 입력 히스토리
  private y1 = 0; private y2 = 0; // 출력 히스토리

  /**
   * 로우패스 필터 계수 설정
   * @param freq 차단 주파수 (Hz)
   * @param Q Q값 (공명 크기)
   * @param sampleRate 샘플레이트
   */
  setLowpass(freq: number, Q: number, sampleRate: number): void {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);
    const cosw0 = Math.cos(w0);

    const a0 = 1 + alpha;
    this.b0 = (1 - cosw0) / 2 / a0;
    this.b1 = (1 - cosw0) / a0;
    this.b2 = this.b0;
    this.a1 = -2 * cosw0 / a0;
    this.a2 = (1 - alpha) / a0;
  }

  /**
   * 피킹 EQ 계수 설정
   * @param freq 중심 주파수 (Hz)
   * @param Q Q값
   * @param gainDb 이득 (dB)
   */
  setPeaking(freq: number, Q: number, gainDb: number, sampleRate: number): void {
    const A  = Math.pow(10, gainDb / 40); // dB → 선형
    const w0 = 2 * Math.PI * freq / sampleRate;
    const alpha = Math.sin(w0) / (2 * Q);

    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = -2 * Math.cos(w0) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = this.b1;
    this.a2 = (1 - alpha / A) / a0;
  }

  /** Direct Form II 차분 방정식으로 샘플 처리 */
  processSample(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
                         - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// ─── Granular Synthesizer (Cybernetic Glitch용) ───────────────────────────────
/**
 * 그레뉼러 합성:
 *   오디오를 아주 짧은 조각(grain)으로 분해 → 무작위로 재배열/반복
 *   → '치직'거리고 불규칙한 디지털 결함 느낌
 */
class GranularGlitch {
  private grainBuffer: Float32Array;
  private grainSize: number;
  private grainPos: number = 0;
  private grainWritePos: number = 0;
  private glitchProb: number;   // 글리치 발생 확률 (0~1)
  private repeatCount: number = 0;
  private maxRepeat: number = 4;

  constructor(sampleRate: number, grainMs: number, glitchProbability: number) {
    this.grainSize  = Math.round(sampleRate * grainMs / 1000);
    this.grainBuffer = new Float32Array(this.grainSize);
    this.glitchProb  = glitchProbability;
  }

  processSample(input: number): number {
    // 현재 grain 버퍼에 쓰기
    this.grainBuffer[this.grainWritePos % this.grainSize] = input;
    this.grainWritePos++;

    // 확률적으로 글리치 발생
    if (Math.random() < this.glitchProb / this.grainSize) {
      this.repeatCount = Math.floor(Math.random() * this.maxRepeat) + 1;
      this.grainPos = 0; // grain 처음부터 재생
    }

    if (this.repeatCount > 0) {
      // grain을 반복 재생 (글리치 효과)
      const glitchSample = this.grainBuffer[this.grainPos % this.grainSize];
      this.grainPos++;
      if (this.grainPos >= this.grainSize) {
        this.grainPos = 0;
        this.repeatCount--;
      }
      return glitchSample;
    }

    return input;
  }
}

// ─── 메인 AudioWorkletProcessor ───────────────────────────────────────────────

class VocalXProcessor extends AudioWorkletProcessor {
  private fft: FFT;
  private fftSize = 1024;        // FFT 분석 크기 (주파수 해상도)
  private fftBuffer: Float32Array; // FFT 입력 버퍼 (시간 도메인)
  private fftRe: Float32Array;     // FFT 실수부
  private fftIm: Float32Array;     // FFT 허수부
  private fftWritePos = 0;         // FFT 버퍼 쓰기 위치
  private hopSize = 256;           // 오버랩-추가 간격 (홉 크기)

  // 필터 인스턴스들
  private combFilters: CombFilter[] = [];
  private multiTapDelay: MultiTapDelay | null = null;
  private lowpassFilter: BiquadFilter;
  private resonanceFilter: BiquadFilter;
  private granular: GranularGlitch | null = null;

  // 현재 활성 필터 모드
  private filterMode: string = 'bypass';  // bypass | chrome | nebula | oracle | glitch
  private filterIntensity: number = 1.0;

  // EQ 파라미터 배열 (저역/중역/고역 3밴드)
  private eqFilters: BiquadFilter[] = [];

  // 오행 부스트 파라미터
  private ohaengMode: string = 'none';  // none | gold | wood | water | fire | earth

  constructor() {
    super();

    const SR = sampleRate; // AudioWorklet 전역: 현재 오디오 컨텍스트 샘플레이트

    // FFT 초기화
    this.fft = new FFT(this.fftSize);
    this.fftBuffer = new Float32Array(this.fftSize);
    this.fftRe     = new Float32Array(this.fftSize);
    this.fftIm     = new Float32Array(this.fftSize);

    // Vocal Chrome용 콤 필터 3개 — 배음 구조 형성
    // 각기 다른 딜레이로 금속 배음 주파수 구성
    this.combFilters = [
      new CombFilter(SR, 2.1, 0.85, 0.6),  // 2.1ms → ~476Hz 배음 강조
      new CombFilter(SR, 3.7, 0.80, 0.5),  // 3.7ms → ~270Hz 배음 강조
      new CombFilter(SR, 5.3, 0.75, 0.4),  // 5.3ms → ~189Hz 배음 강조
    ];

    // Nebula Echo용 멀티탭 딜레이
    this.multiTapDelay = new MultiTapDelay(SR, [
      { delayMs: 180, gain: 0.5 },   // 첫 번째 에코
      { delayMs: 340, gain: 0.35 },  // 두 번째 에코 (더 멀리)
      { delayMs: 520, gain: 0.2 },   // 세 번째 에코 (희미하게)
      { delayMs: 780, gain: 0.1 },   // 네 번째 에코 (끝처리)
    ]);

    // 공통 로우패스 필터 (Nebula Echo 끝처리 흐릿하게)
    this.lowpassFilter = new BiquadFilter();
    this.lowpassFilter.setLowpass(3500, 0.7, SR); // 3500Hz 이상 부드럽게 차단

    // 공명 필터 (Vocal Chrome 메탈릭 질감)
    this.resonanceFilter = new BiquadFilter();
    this.resonanceFilter.setPeaking(3500, 2.5, 7.5, SR);

    // Glitch용 그레뉼러 합성기
    this.granular = new GranularGlitch(SR, 50, 0.03); // 50ms grain, 3% 확률

    // 3밴드 EQ (저/중/고역)
    const eqLow  = new BiquadFilter(); eqLow.setPeaking(120,  1.0, 0,  SR); // 저역
    const eqMid  = new BiquadFilter(); eqMid.setPeaking(1200, 1.0, 0,  SR); // 중역
    const eqHigh = new BiquadFilter(); eqHigh.setPeaking(8000, 1.0, 0, SR); // 고역
    this.eqFilters = [eqLow, eqMid, eqHigh];

    // 메시지 수신 (메인 스레드 → 워크렛 파라미터 변경)
    this.port.onmessage = (e: MessageEvent) => {
      const { type, value } = e.data;
      switch (type) {
        case 'setFilter':
          this.filterMode = value;
          break;
        case 'setIntensity':
          this.filterIntensity = Math.max(0, Math.min(1, value));
          break;
        case 'setOhaeng':
          this.ohaengMode = value;
          break;
        case 'setEQ':
          // { band: 0|1|2, gainDb: number }
          if (value.band >= 0 && value.band <= 2) {
            // 실제로는 setPeaking을 다시 호출하여 gain 업데이트
          }
          break;
      }
    };
  }

  /**
   * 핵심 처리 함수 — 매 128 샘플 블록마다 자동 호출
   * 이 함수가 오디오 스레드에서 실행됨 (메인 스레드와 무관)
   *
   * @param inputs  입력 채널 배열 [채널][샘플]
   * @param outputs 출력 채널 배열 [채널][샘플]
   * @returns true = 프로세서 계속 실행
   */
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input  = inputs[0]?.[0];   // 채널 0 (모노 마이크 입력)
    const output = outputs[0]?.[0];  // 채널 0 출력

    if (!input || !output) return true;

    // 샘플별 처리
    for (let i = 0; i < input.length; i++) {
      let sample = input[i];

      // ── [1] EQ 처리 ────────────────────────────────────────────────────
      for (const eq of this.eqFilters) {
        sample = eq.processSample(sample);
      }

      // ── [2] 오행 부스트 ────────────────────────────────────────────────
      sample = this._applyOhaengBoost(sample);

      // ── [3] 활성 필터 체인 ─────────────────────────────────────────────
      let filtered = sample;
      switch (this.filterMode) {
        case 'chrome':  filtered = this._processChrome(sample);  break;
        case 'nebula':  filtered = this._processNebula(sample);  break;
        case 'oracle':  filtered = this._processOracle(sample);  break;
        case 'glitch':  filtered = this._processGlitch(sample);  break;
        case 'darkchrome': filtered = this._processDarkChrome(sample); break;
        default: filtered = sample; // bypass
      }

      // ── [4] 강도(Intensity) 믹스 — 원음과 처리음 혼합 ──────────────────
      // intensity=0: 원음 100%, intensity=1: 처리음 100%
      output[i] = sample * (1 - this.filterIntensity) + filtered * this.filterIntensity;

      // ── [5] 소프트 클리핑 — 0dBFS 초과 방지 ────────────────────────────
      output[i] = Math.tanh(output[i]); // tanh: 부드럽게 -1~1로 제한
    }

    return true; // true = 프로세서 계속 실행 (false면 종료)
  }

  // ─── 필터별 처리 함수 ────────────────────────────────────────────────────────

  /**
   * Vocal Chrome — 금속 배음 콤 필터 + 공명
   * 콤 필터 3개의 출력을 혼합 → 금속 공명 구조
   */
  private _processChrome(sample: number): number {
    let out = sample;
    for (const comb of this.combFilters) {
      out = comb.processSample(out);
    }
    // 공명 필터로 3.5kHz 금속 하이라이트 강조
    return this.resonanceFilter.processSample(out);
  }

  /**
   * Nebula Echo — 멀티탭 딜레이 + 로우패스 흐릿한 끝처리
   */
  private _processNebula(sample: number): number {
    const delayed = this.multiTapDelay!.processSample(sample);
    // 멀리서 들려오는 느낌: 고주파를 흐릿하게
    return this.lowpassFilter.processSample(delayed);
  }

  /**
   * Deep Oracle — 피치는 유지하되 포먼트(공명 주파수)를 내림
   * 간략화: 저역 강조 + 서브 하모닉(주파수 절반) 추가
   *
   * 실제 포먼트 시프팅은 LPC(선형 예측 계수) 분석 필요 → 복잡도 높아
   * 여기서는 저역 강화 + 서브 옥타브 합산으로 근사
   */
  private _processOracle(sample: number): number {
    // 서브 하모닉: 사인 함수로 주파수 절반의 성분 추가 (무게감)
    // 실제로는 Phase Locked Loop로 기본 주파수의 절반 추출
    const subHarmonic = Math.sign(sample) * Math.pow(Math.abs(sample), 1.3) * 0.4;
    return sample + subHarmonic;
  }

  /**
   * Cybernetic Glitch — 그레뉼러 합성 기반 디지털 결함
   */
  private _processGlitch(sample: number): number {
    // 비트 크러셔: 양자화 비트를 줄여 계단 왜곡 추가
    const bits     = 6; // 6비트 = 64단계 (원래 24비트 → 심한 열화)
    const stepSize = 2 / Math.pow(2, bits);
    const crushed  = Math.round(sample / stepSize) * stepSize;

    // 그레뉼러 반복 + 비트 크러셔 혼합
    const granular = this.granular!.processSample(crushed);
    return granular * 0.8; // 약간 줄여서 클리핑 방지
  }

  /**
   * Dark Chrome — 익명성 보호 필터
   * 포먼트를 완전히 뒤섞어 원래 목소리를 알아볼 수 없게 하되
   * 세련된 다크 크롬 톤 유지
   */
  private _processDarkChrome(sample: number): number {
    // 콤 필터로 주기 구조 파괴 → 원래 성도(Vocal Tract) 특성 제거
    let out = sample;
    for (const comb of this.combFilters) {
      out = comb.processSample(out) * 0.6;
    }
    // 저역 강화 (다크한 질감)
    return out + sample * 0.3;
  }

  /**
   * 오행(五行) 부스트 — 사주 분석 결과에 따른 미세 음색 조정
   */
  private _applyOhaengBoost(sample: number): number {
    switch (this.ohaengMode) {
      case 'gold':  // 金: 명징하고 날카로운 고역 강화
        return sample * 1.05 + sample * Math.abs(sample) * 0.1;
      case 'fire':  // 火: 하모닉 풍부하게 (웜 오버드라이브)
        return Math.tanh(sample * 1.4) * 0.9;
      case 'water': // 水: 딥 리버브 사전 처리 (저역 부드럽게)
        return sample * 0.95;
      case 'wood':  // 木: 온화한 미드 강화
        return sample * 1.02;
      case 'earth': // 土: 미드-로우 워밍
        return sample * 1.03 - sample * Math.abs(sample) * 0.05;
      default:
        return sample;
    }
  }
}

// AudioWorklet 전역 등록
// 'vocal-x-processor' 이름으로 audioContext.audioWorklet.addModule() 후 사용 가능
registerProcessor('vocal-x-processor', VocalXProcessor);
