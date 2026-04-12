/**
 * VocalChromeDSP.ts — Mercury Edition
 * ─────────────────────────────────────────────────────────────────────────────
 * Liquid Mercury 필터와 찰떡궁합인 금속성 보이스 변조 시스템
 *
 * 왜 Vocal Chrome이 Liquid Mercury와 어울리는가:
 *   - 시각: 차갑고 유동적인 수은 표면
 *   - 청각: 차갑고 공명하는 크롬 금속 목소리
 *   → 시각과 청각이 동일한 '금속 액체' 테마로 일치 → 몰입감 극대화
 *
 * 오디오 신호 체인:
 *   마이크 입력
 *     ↓ [1] Pitch Shifter    — 목소리를 반음 낮춤 (수은 무게감)
 *     ↓ [2] Ring Modulator   — 280Hz 반송파 × 목소리 (금속 윙윙 울림)
 *     ↓ [3] Resonance Filter — 3.5kHz 공명 피크 (금속 표면 반사음)
 *     ↓ [4] Hi-Shelf Boost   — 고역 강화 (수은 표면 날카로운 찰랑임)
 *     ↓ [5] Pre-delay        — 8ms 딜레이 (금속 챔버 에코)
 *     ↓ [6] Short Reverb     — 작은 금속 공간 잔향 (기존 크롬보다 습식)
 *     ↓ [7] Compressor       — 다이나믹 평탄화 (일정한 금속 질감 유지)
 *   스피커/녹음 출력
 *
 * 기존 VocalChrome 대비 변경점 (Mercury 특화):
 *   - Ring Modulator 반송파: 320Hz → 280Hz (더 낮고 무거운 수은 질감)
 *   - Ring Depth: 0.18 → 0.22 (더 강한 금속 울림)
 *   - Resonance: 4kHz → 3.5kHz (차가운 금속 공명 주파수)
 *   - Delay: 12ms → 8ms (수은 표면의 빠른 반사)
 *   - Reverb 추가 (기존 없음) — 금속 공간감 추가
 *   - Pitch Shift: -1 반음 (수은의 무게감과 깊이)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Mercury 전용 DSP 파라미터 ────────────────────────────────────────────────
const MERCURY_DSP_PARAMS = {
  // [1] 피치 시프트 — 목소리 반음 낮춤 (수은은 무겁고 차가운 물질)
  PITCH_SHIFT_SEMITONES: -1.0,       // -1 반음 (약 5.6% 낮아짐)

  // [2] 링 모듈레이터 — 금속 윙윙 울림의 핵심
  RING_CARRIER_FREQ: 280,            // 반송파 주파수 (Hz) — 수은 공진 주파수 근사
  RING_DEPTH: 0.22,                  // 변조 깊이 (0=원음, 1=완전 변조)
                                     // 0.22 = 원음 78% + 변조음 22% 혼합

  // [3] 공명 필터 — 금속 표면이 특정 주파수를 강하게 반사
  RESONANCE_FREQ: 3500,              // 공명 주파수 (Hz)
  RESONANCE_GAIN_DB: 7.5,            // 공명 강도 (dB)
  RESONANCE_Q: 2.5,                  // Q값 (높을수록 좁고 날카로운 공명)

  // [4] 고역 강화 — 수은 표면의 찰랑이는 금속성 고주파
  HI_SHELF_FREQ: 6000,              // 쉘빙 시작 주파수 (Hz)
  HI_SHELF_GAIN_DB: 4.0,            // 고역 강화 (dB)

  // [5] 프리딜레이 — 금속 챔버의 첫 반사
  PRE_DELAY_MS: 8,                   // 딜레이 시간 (ms) — 짧을수록 단단한 공간
  PRE_DELAY_MIX: 0.15,               // 딜레이 혼합 비율 (15%)

  // [6] 숏 리버브 — 금속 용기 안의 공간감 (Mercury 추가 요소)
  REVERB_DECAY_SEC: 0.35,            // 잔향 감쇠 시간 (초) — 짧은 금속 공간
  REVERB_WET_MIX: 0.18,             // 잔향 혼합 비율 (18%)

  // [7] 컴프레서 — 일정한 크롬 질감 유지
  COMPRESSOR_THRESHOLD_DB: -20,     // 압축 시작 레벨
  COMPRESSOR_RATIO: 5,              // 압축 비율 (5:1)
  COMPRESSOR_ATTACK_MS: 3,          // 압축 반응 속도 (ms)
  COMPRESSOR_RELEASE_MS: 80,        // 압축 해제 속도 (ms)
};

// ─── 피치 시프터 (Phase Vocoder 기반) ────────────────────────────────────────
/**
 * Phase Vocoder 간략 설명:
 *   1. 오디오를 짧은 프레임으로 나눔 (FFT)
 *   2. 각 주파수 빈의 위상(Phase)을 조작해 피치를 변경
 *   3. IFFT로 다시 오디오로 변환
 *   → 재생 속도 변화 없이 피치만 바꿀 수 있음
 */
class PitchShifter {
  private context: AudioContext;
  private scriptProcessor: ScriptProcessorNode;
  private readonly FFT_SIZE = 2048;
  private readonly OVERLAP = 4;     // 프레임 겹침 횟수 (높을수록 품질 ↑)
  private semitones: number;

  // 피치 시프트 비율 계산 (반음 → 배수)
  // 1 반음 = 2^(1/12) ≈ 1.0595
  private get pitchRatio(): number {
    return Math.pow(2, this.semitones / 12);
  }

  constructor(context: AudioContext, semitones: number) {
    this.context = context;
    this.semitones = semitones;

    // ScriptProcessorNode로 커스텀 DSP (실제로는 AudioWorklet 권장)
    this.scriptProcessor = context.createScriptProcessor(this.FFT_SIZE, 1, 1);
    this.scriptProcessor.onaudioprocess = this._processAudio.bind(this);
  }

  private _processAudio(event: AudioProcessingEvent): void {
    const input  = event.inputBuffer.getChannelData(0);
    const output = event.outputBuffer.getChannelData(0);

    // Phase Vocoder 피치 시프팅 알고리즘
    // [간략화]: 실제 구현은 FFT 라이브러리(fft.js) 또는 AudioWorklet 사용
    // 핵심: 각 스펙트럼 빈을 pitchRatio만큼 주파수 축 이동
    for (let i = 0; i < input.length; i++) {
      // 단순 리샘플링 근사 (정확도 낮음, 실제는 Phase Vocoder 필수)
      const srcIdx = Math.min(input.length - 1,
        Math.floor(i / this.pitchRatio)
      );
      output[i] = input[srcIdx];
    }
  }

  getNode(): ScriptProcessorNode {
    return this.scriptProcessor;
  }
}

// ─── 숏 리버브 (Convolution 기반) ─────────────────────────────────────────────
/**
 * Mercury 추가 요소: 수은 금속 용기 안의 짧은 잔향
 * 합성 임펄스 응답(Synthetic IR)으로 작은 금속 공간 시뮬레이션
 */
class ShortMetallicReverb {
  private convolverNode: ConvolverNode;

  constructor(context: AudioContext, decaySec: number) {
    this.convolverNode = context.createConvolver();
    this.convolverNode.buffer = this._createMetallicIR(context, decaySec);
  }

  /**
   * 합성 금속 임펄스 응답 생성
   * 실제 리버브 공간을 녹음하는 대신 수학적으로 생성
   */
  private _createMetallicIR(context: AudioContext, decaySec: number): AudioBuffer {
    const sampleRate = context.sampleRate;
    const length     = Math.floor(sampleRate * decaySec);
    const ir         = context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = ir.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // 지수 감쇠 잡음 → 기본 잔향 형태
        const envelope = Math.exp(-t * (1 / decaySec) * 3);

        // 금속 공진 특성: 특정 주파수 강화 (3500Hz, 6000Hz)
        // cos 파형으로 금속 링잉(Ringing) 효과 추가
        const metalRing = (
          Math.cos(2 * Math.PI * 3500 * t) * 0.3 +
          Math.cos(2 * Math.PI * 6000 * t) * 0.15
        );

        // L/R 채널 미세하게 다르게 (스테레오 공간감)
        const stereoOffset = channel === 0 ? 1.0 : 0.95;
        data[i] = (Math.random() * 2 - 1 + metalRing) * envelope * stereoOffset;
      }
    }

    return ir;
  }

  getNode(): ConvolverNode {
    return this.convolverNode;
  }
}

// ─── 메인 VocalChromeDSP 클래스 ───────────────────────────────────────────────

export class VocalChromeDSP {
  private context: AudioContext | null = null;
  private isRunning: boolean = false;
  private isMuted: boolean = false;

  // 오디오 노드 체인
  private sourceNode:    MediaStreamAudioSourceNode | null = null;
  private pitchShifter:  PitchShifter | null = null;
  private ringOscillator: OscillatorNode | null = null;
  private ringGain:      GainNode | null = null;
  private ringMixDry:    GainNode | null = null;
  private ringMixWet:    GainNode | null = null;
  private resonanceFilter: BiquadFilterNode | null = null;
  private hiShelfFilter:   BiquadFilterNode | null = null;
  private delayNode:     DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private reverb:        ShortMetallicReverb | null = null;
  private reverbGain:    GainNode | null = null;
  private dryGain:       GainNode | null = null;
  private compressor:    DynamicsCompressorNode | null = null;
  private outputGain:    GainNode | null = null;

  // 현재 파라미터 (실시간 조절 가능)
  private params = { ...MERCURY_DSP_PARAMS };

  /**
   * DSP 초기화 + 마이크 연결
   * 카메라 필터 활성화 시 함께 호출
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    // Web Audio API 컨텍스트 생성
    this.context = new AudioContext({ sampleRate: 44100 });

    // 마이크 스트림 요청
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,   // 에코 제거 OFF — DSP가 직접 처리
        noiseSuppression: false,   // 노이즈 제거 OFF — 금속음 변조에 영향
        autoGainControl: false,    // 자동 이득 OFF — 컴프레서가 대신 처리
        sampleRate: 44100,
      }
    });

    this.sourceNode = this.context.createMediaStreamSource(stream);
    this._buildChain();

    this.isRunning = true;
    console.log('[VocalChrome Mercury] DSP started ✓');
    console.log('[VocalChrome Mercury] Chain: Mic → Pitch → Ring → Resonance → HiShelf → Delay → Reverb → Compress → Out');
  }

  /** DSP 신호 체인 구성 */
  private _buildChain(): void {
    const ctx = this.context!;
    const p = this.params;

    // ── [1] 피치 시프터 ───────────────────────────────────────────────────
    // -1 반음으로 목소리를 약간 낮춤 → 수은의 묵직하고 차가운 느낌
    this.pitchShifter = new PitchShifter(ctx, p.PITCH_SHIFT_SEMITONES);

    // ── [2] 링 모듈레이터 ────────────────────────────────────────────────
    // 원리: 목소리 × 280Hz 사인파 = (목소리-280Hz) + (목소리+280Hz) 두 사이드밴드
    // 결과: 목소리에 금속성 윙윙 울림 추가
    this.ringOscillator = ctx.createOscillator();
    this.ringOscillator.frequency.value = p.RING_CARRIER_FREQ; // 280Hz
    this.ringOscillator.type = 'sine'; // 순수 사인파 (깨끗한 금속음)

    this.ringGain    = ctx.createGain();
    this.ringGain.gain.value = p.RING_DEPTH; // 변조 깊이 0.22

    this.ringMixDry  = ctx.createGain();
    this.ringMixWet  = ctx.createGain();
    this.ringMixDry.gain.value = 1 - p.RING_DEPTH; // 78% 원음
    this.ringMixWet.gain.value = p.RING_DEPTH;      // 22% 변조음

    // 오실레이터 → 게인 노드 연결 (오실레이터가 게인을 제어)
    this.ringOscillator.connect(this.ringGain);
    this.ringOscillator.start();

    // ── [3] 공명 필터 ─────────────────────────────────────────────────────
    // 3500Hz에서 강한 피킹 → 금속 표면의 특정 주파수 강반사 시뮬레이션
    this.resonanceFilter = ctx.createBiquadFilter();
    this.resonanceFilter.type = 'peaking';
    this.resonanceFilter.frequency.value = p.RESONANCE_FREQ;     // 3500Hz
    this.resonanceFilter.Q.value         = p.RESONANCE_Q;        // 좁은 공명
    this.resonanceFilter.gain.value      = p.RESONANCE_GAIN_DB;  // +7.5dB

    // ── [4] 고역 강화 쉘빙 필터 ──────────────────────────────────────────
    // 6kHz 이상 고역 부스트 → 수은 표면의 찰랑이는 금속 광택
    this.hiShelfFilter = ctx.createBiquadFilter();
    this.hiShelfFilter.type = 'highshelf';
    this.hiShelfFilter.frequency.value = p.HI_SHELF_FREQ;    // 6000Hz
    this.hiShelfFilter.gain.value      = p.HI_SHELF_GAIN_DB; // +4dB

    // ── [5] 프리딜레이 ────────────────────────────────────────────────────
    // 8ms 딜레이 → 단단한 금속 챔버 첫 반사음 (너무 길면 에코처럼 들림)
    this.delayNode = ctx.createDelay(0.1); // 최대 100ms 딜레이
    this.delayNode.delayTime.value = p.PRE_DELAY_MS / 1000; // ms → 초

    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = p.PRE_DELAY_MIX; // 15% 피드백

    // ── [6] 숏 메탈릭 리버브 ─────────────────────────────────────────────
    // Mercury 신규: 수은 금속 용기 안의 짧은 공간 잔향
    this.reverb     = new ShortMetallicReverb(ctx, p.REVERB_DECAY_SEC);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = p.REVERB_WET_MIX; // 18% 잔향
    this.dryGain    = ctx.createGain();
    this.dryGain.gain.value = 1 - p.REVERB_WET_MIX; // 82% 직접음

    // ── [7] 다이나믹 컴프레서 ────────────────────────────────────────────
    // 크고 작은 소리를 평탄화 → 일정한 금속 질감 유지
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = p.COMPRESSOR_THRESHOLD_DB; // -20dB
    this.compressor.ratio.value     = p.COMPRESSOR_RATIO;        // 5:1
    this.compressor.attack.value    = p.COMPRESSOR_ATTACK_MS / 1000;
    this.compressor.release.value   = p.COMPRESSOR_RELEASE_MS / 1000;
    this.compressor.knee.value      = 3; // 부드러운 시작점

    // ── 출력 게인 ─────────────────────────────────────────────────────────
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 0.9; // 클리핑 방지 헤드룸

    // ── 노드 연결 (신호 체인 완성) ────────────────────────────────────────
    const pitch = this.pitchShifter.getNode();

    // 소스 → 피치 시프터
    this.sourceNode!.connect(pitch);

    // 피치 → 링 모듈레이터 (Dry/Wet 믹스)
    pitch.connect(this.ringMixDry);
    pitch.connect(this.ringGain);      // 링 변조 경로
    this.ringGain.connect(this.ringMixWet);

    // Dry + Wet 합산 → 공명 필터
    this.ringMixDry.connect(this.resonanceFilter);
    this.ringMixWet.connect(this.resonanceFilter);

    // 공명 → 고역 쉘빙
    this.resonanceFilter.connect(this.hiShelfFilter);

    // 고역 → 딜레이 + 직통 경로
    this.hiShelfFilter.connect(this.delayNode);
    this.hiShelfFilter.connect(this.dryGain);

    // 딜레이 피드백 루프
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);

    // 딜레이 → 리버브
    this.delayNode.connect(this.reverb.getNode());
    this.reverb.getNode().connect(this.reverbGain);

    // Dry + Reverb 합산 → 컴프레서
    this.dryGain.connect(this.compressor);
    this.reverbGain.connect(this.compressor);

    // 컴프레서 → 출력
    this.compressor.connect(this.outputGain);
    this.outputGain.connect(ctx.destination);
  }

  /** DSP 중지 및 리소스 해제 */
  async stop(): Promise<void> {
    this.ringOscillator?.stop();
    await this.context?.close();
    this.context   = null;
    this.isRunning = false;
    console.log('[VocalChrome Mercury] DSP stopped');
  }

  /**
   * 실시간 파라미터 조절 — 슬라이더 UI와 연동
   * @param key 파라미터 키
   * @param value 새 값
   */
  setParam(key: keyof typeof MERCURY_DSP_PARAMS, value: number): void {
    this.params[key] = value;

    // 변경된 파라미터를 즉시 오디오 노드에 반영
    // AudioParam은 .setValueAtTime으로 부드럽게 변경
    const t = this.context?.currentTime ?? 0;
    const SMOOTH = 0.05; // 50ms 페이드 (클릭 방지)

    switch (key) {
      case 'RING_CARRIER_FREQ':
        this.ringOscillator?.frequency.linearRampToValueAtTime(value, t + SMOOTH);
        break;
      case 'RING_DEPTH':
        this.ringGain?.gain.linearRampToValueAtTime(value, t + SMOOTH);
        this.ringMixDry?.gain.linearRampToValueAtTime(1 - value, t + SMOOTH);
        this.ringMixWet?.gain.linearRampToValueAtTime(value, t + SMOOTH);
        break;
      case 'RESONANCE_FREQ':
        this.resonanceFilter?.frequency.linearRampToValueAtTime(value, t + SMOOTH);
        break;
      case 'RESONANCE_GAIN_DB':
        if (this.resonanceFilter) this.resonanceFilter.gain.linearRampToValueAtTime(value, t + SMOOTH);
        break;
      case 'PRE_DELAY_MS':
        this.delayNode?.delayTime.linearRampToValueAtTime(value / 1000, t + SMOOTH);
        break;
      case 'REVERB_WET_MIX':
        this.reverbGain?.gain.linearRampToValueAtTime(value, t + SMOOTH);
        this.dryGain?.gain.linearRampToValueAtTime(1 - value, t + SMOOTH);
        break;
    }
  }

  /** 음소거 토글 — 카메라 필터와 동기화 */
  toggleMute(): void {
    this.isMuted = !this.isMuted;
    if (this.outputGain) {
      const t = this.context!.currentTime;
      this.outputGain.gain.linearRampToValueAtTime(
        this.isMuted ? 0 : 0.9,
        t + 0.05 // 50ms 페이드 (갑작스러운 ON/OFF 클릭 방지)
      );
    }
  }

  /**
   * 현재 설정 프리셋으로 내보내기 (사용자가 설정 저장 시)
   */
  exportPreset(): typeof MERCURY_DSP_PARAMS {
    return { ...this.params };
  }

  /**
   * 프리셋 로드 — 저장된 설정 복원
   */
  loadPreset(preset: Partial<typeof MERCURY_DSP_PARAMS>): void {
    for (const [key, value] of Object.entries(preset)) {
      this.setParam(key as keyof typeof MERCURY_DSP_PARAMS, value as number);
    }
  }

  getIsRunning(): boolean { return this.isRunning; }
  getIsMuted():   boolean { return this.isMuted; }
}

// ─── 상수 내보내기 (UI 슬라이더 범위 설정용) ─────────────────────────────────
export const MERCURY_PARAM_RANGES = {
  PITCH_SHIFT_SEMITONES: { min: -6, max: 6, step: 0.5, label: '피치' },
  RING_CARRIER_FREQ:     { min: 100, max: 800, step: 10, label: '링 주파수' },
  RING_DEPTH:            { min: 0, max: 0.8, step: 0.01, label: '금속 강도' },
  RESONANCE_FREQ:        { min: 1000, max: 8000, step: 100, label: '공명 주파수' },
  RESONANCE_GAIN_DB:     { min: 0, max: 15, step: 0.5, label: '공명 강도' },
  PRE_DELAY_MS:          { min: 0, max: 30, step: 1, label: '딜레이' },
  REVERB_WET_MIX:        { min: 0, max: 0.5, step: 0.01, label: '리버브' },
} as const;

export { MERCURY_DSP_PARAMS as MERCURY_DEFAULT_PARAMS };
