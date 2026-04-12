/**
 * BonusFilters.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vocal-X 보너스 필터 모듈
 *
 * 1. DuetAI       — 혼자 찍어도 AI 자동 화음 (합창단 효과)
 * 2. SpaceSynthesizer — 장소 변환 (대성당 / 철제터널 / 비내리는카페 / etc.)
 *
 * 익명성 보호(Dark Chrome)은 FilterPresets + VocalXProcessor.worklet에 구현됨
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { SpacePreset } from './FilterPresets';

// ─────────────────────────────────────────────────────────────────────────────
// [보너스 1] DuetAI — 자동 화음 생성기
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 원리:
 *   1. 입력 목소리의 기본 주파수(F0) 감지 — 자기상관(Autocorrelation) 알고리즘
 *   2. F0로부터 음악적 화음 주파수 계산
 *      - 3도 화음: F0 × 1.26 (장3도)
 *      - 5도 화음: F0 × 1.498 (완전5도)
 *      - 옥타브:   F0 × 2.0
 *   3. 각 화음 주파수로 피치 시프트된 레이어 생성
 *   4. 원음 + 화음 레이어들을 믹싱
 *
 * 한계:
 *   - 실시간 피치 감지는 부정확 구간 존재 (자음, 무성음 구간)
 *   - 화음 레이어에는 살짝 인위적인 느낌이 있음 (Phase Vocoder 특성)
 *   → 오히려 이게 "AI 합창" 특유의 매력이 됨
 */
export class DuetAI {
  private context: AudioContext;
  private isActive: boolean = false;
  private harmonyNodes: AudioBufferSourceNode[] = [];
  private harmonyGains: GainNode[] = [];
  private analyserNode: AnalyserNode;

  // 화음 구성: [배율, 이득, 팬(좌우위치)]
  // 기본음과 함께 최대 3성부 합창단 구성
  private readonly HARMONY_VOICES = [
    { ratio: 1.26,  gain: 0.35, pan: -0.3 }, // 장3도 화음 (왼쪽)
    { ratio: 1.498, gain: 0.30, pan:  0.3 }, // 완전5도 화음 (오른쪽)
    { ratio: 2.0,   gain: 0.20, pan:  0.0 }, // 옥타브 (가운데)
  ];

  // F0 감지 버퍼 (자기상관 분석용)
  private correlationBuffer: Float32Array;
  private readonly CORRELATION_SIZE = 2048;

  constructor(context: AudioContext) {
    this.context         = context;
    this.correlationBuffer = new Float32Array(this.CORRELATION_SIZE);

    // 분석기 (F0 감지용)
    this.analyserNode = context.createAnalyser();
    this.analyserNode.fftSize = this.CORRELATION_SIZE;
  }

  start(): void {
    this.isActive = true;
    console.log('[DuetAI] 화음 생성 시작 — 3성부 합창 모드');
  }

  stop(): void {
    this.isActive = false;
    this.harmonyNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    this.harmonyNodes = [];
    this.harmonyGains = [];
  }

  /**
   * 매 프레임: F0 감지 → 화음 주파수 → 레이어 생성
   *
   * 연결 방식:
   *   마이크 → AnalyserNode (F0 감지)
   *          ↓
   *   ScriptProcessor (화음 생성) → GainNode (음량) → PannerNode (공간감) → Destination
   */
  connectToChain(source: AudioNode, destination: AudioNode): void {
    source.connect(this.analyserNode);

    // 주기적으로 F0 감지 + 화음 업데이트 (100ms마다)
    setInterval(() => {
      if (!this.isActive) return;
      const f0 = this._detectF0();
      if (f0 > 80 && f0 < 1200) { // 인간 목소리 범위: 80~1200Hz
        this._updateHarmonyVoices(f0, destination);
      }
    }, 100);
  }

  /**
   * 자기상관(Autocorrelation) 기반 기본 주파수 감지
   *
   * 원리:
   *   신호를 자기 자신과 다양한 지연값(lag)으로 상관 계산
   *   최대 상관을 보이는 lag = 기본 주기 → F0 = sampleRate / lag
   */
  private _detectF0(): number {
    this.analyserNode.getFloatTimeDomainData(this.correlationBuffer);

    const buffer     = this.correlationBuffer;
    const sampleRate = this.context.sampleRate;
    const minLag     = Math.floor(sampleRate / 1200); // 최대 1200Hz
    const maxLag     = Math.floor(sampleRate / 80);   // 최소 80Hz

    let maxCorrelation = 0;
    let bestLag = minLag;

    // lag값마다 자기상관 계산
    for (let lag = minLag; lag < maxLag; lag++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - lag; i++) {
        correlation += buffer[i] * buffer[i + lag]; // 내적
      }

      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestLag = lag;
      }
    }

    // 너무 약한 신호 (무성 구간)는 0 반환
    if (maxCorrelation < 0.01) return 0;

    return sampleRate / bestLag; // Hz로 변환
  }

  /** 감지된 F0로 화음 오실레이터 업데이트 */
  private _updateHarmonyVoices(f0: number, destination: AudioNode): void {
    // 기존 노드 정리
    this.harmonyNodes.forEach(n => { try { n.stop(); n.disconnect(); } catch (e) {} });
    this.harmonyNodes = [];
    this.harmonyGains = [];

    // 각 성부별 오실레이터 생성
    for (const voice of this.HARMONY_VOICES) {
      const freq = f0 * voice.ratio; // 화음 주파수

      // 오실레이터 (순수 사인파 → 약간 인위적인 AI 합창 느낌)
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // 음량
      const gain = this.context.createGain();
      gain.gain.value = voice.gain;

      // 스테레오 패닝 (좌/중/우 배치로 공간감)
      const panner = this.context.createStereoPanner();
      panner.pan.value = voice.pan;

      // 연결: 오실레이터 → 음량 → 패닝 → 출력
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(destination);
      osc.start();
      osc.stop(this.context.currentTime + 0.12); // 0.12초 후 자동 정지 (다음 업데이트 시 교체)

      this.harmonyNodes.push(osc);
      this.harmonyGains.push(gain);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [보너스 2] SpaceSynthesizer — 장소 변환 공간음 합성
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 원리 — Convolution Reverb (합성곱 리버브):
 *   실제 공간에서 임펄스 응답(IR: Impulse Response)을 녹음하면
 *   그 공간의 음향 특성이 모두 담긴다.
 *   → 원음 × IR = 그 공간에서 말하는 것 같은 소리
 *
 * 문제: 실제 대성당 IR은 수백 MB → 앱에 포함 불가
 * 해결: 수학적 합성 IR (Synthetic IR) 사용
 *   - 지수 감쇠 잡음 + 공간별 공명 주파수 삽입
 *   - 실제보다는 부정확하지만 충분히 설득력 있는 공간감
 */

interface SpaceConfig {
  name: string;
  nameKo: string;
  decaySec: number;       // 잔향 감쇠 시간 (T60 — 60dB 감쇠까지 시간)
  predelayMs: number;     // 초기 반사 딜레이 (공간 크기 인식)
  lowFreqBoost: number;   // 저역 강화 (큰 공간일수록 저역 울림)
  earlyReflections: Array<{ ms: number; gain: number }>; // 초기 반사
  resonanceFreqs: number[]; // 공간 고유 공명 주파수 (Hz)
  description: string;
  emoji: string;
}

const SPACE_CONFIGS: Record<SpacePreset, SpaceConfig> = {

  cathedral: {
    name: 'Cathedral',
    nameKo: '대성당',
    decaySec: 6.5,          // 6.5초 긴 잔향 (높고 넓은 공간)
    predelayMs: 55,          // 55ms 프리딜레이 (첫 반사까지 거리)
    lowFreqBoost: 4,
    earlyReflections: [
      { ms: 30,  gain: 0.6 },
      { ms: 55,  gain: 0.5 },
      { ms: 80,  gain: 0.4 },
      { ms: 110, gain: 0.3 },
    ],
    resonanceFreqs: [65, 130, 260], // 대성당 저역 공명
    description: '웅장한 대성당 — 성스러운 울림',
    emoji: '⛪',
  },

  iron_tunnel: {
    name: 'Iron Tunnel',
    nameKo: '철제 터널',
    decaySec: 1.8,           // 1.8초 중간 잔향 (긴 터널)
    predelayMs: 25,
    lowFreqBoost: 6,          // 철제 구조물 저역 강화
    earlyReflections: [
      { ms: 12, gain: 0.7 },  // 터널 벽 빠른 반사
      { ms: 25, gain: 0.6 },
      { ms: 50, gain: 0.4 },
      { ms: 95, gain: 0.2 },
    ],
    resonanceFreqs: [120, 240, 480, 960], // 철제 진동 배음
    description: '철제 터널 — 메탈릭 에코',
    emoji: '🚇',
  },

  rainy_cafe: {
    name: 'Rainy Café',
    nameKo: '비 내리는 카페',
    decaySec: 0.8,           // 짧은 잔향 (작은 공간)
    predelayMs: 8,
    lowFreqBoost: 1,
    earlyReflections: [
      { ms: 8,  gain: 0.4 },
      { ms: 18, gain: 0.3 },
      { ms: 35, gain: 0.15 },
    ],
    resonanceFreqs: [250, 500, 1000], // 카페 내부 중역 울림
    description: '비 내리는 카페 — 포근하고 밀착된 울림',
    emoji: '☕',
  },

  void: {
    name: 'The Void',
    nameKo: '허공',
    decaySec: 12.0,          // 12초 (거의 사라지지 않는 잔향)
    predelayMs: 120,
    lowFreqBoost: -2,         // 저역 감쇠 (비어있는 느낌)
    earlyReflections: [
      { ms: 80,  gain: 0.2 },
      { ms: 160, gain: 0.15 },
    ],
    resonanceFreqs: [40, 80],  // 극저역만 (허공의 느낌)
    description: '무한한 허공 — 사라지지 않는 울림',
    emoji: '🌌',
  },

  stadium: {
    name: 'Stadium',
    nameKo: '경기장',
    decaySec: 3.2,
    predelayMs: 40,
    lowFreqBoost: 5,
    earlyReflections: [
      { ms: 20,  gain: 0.5 },
      { ms: 40,  gain: 0.4 },
      { ms: 70,  gain: 0.35 },
      { ms: 120, gain: 0.2 },
      { ms: 200, gain: 0.1 },
    ],
    resonanceFreqs: [80, 160, 320],
    description: '대형 경기장 — 군중 속의 웅장함',
    emoji: '🏟️',
  },
};

export class SpaceSynthesizer {
  private context: AudioContext;
  private convolverNode: ConvolverNode | null = null;
  private predelayNode: DelayNode | null = null;
  private lowBoostFilter: BiquadFilterNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private currentPreset: SpacePreset | null = null;

  constructor(context: AudioContext) {
    this.context = context;
  }

  /**
   * 장소 프리셋 활성화
   * @param preset 장소 종류
   * @param wetMix 잔향 혼합 비율 (0~1)
   */
  activate(preset: SpacePreset, wetMix: number = 0.65): void {
    const config = SPACE_CONFIGS[preset];
    this.currentPreset = preset;

    // 노드 생성
    this.convolverNode   = this.context.createConvolver();
    this.predelayNode    = this.context.createDelay(0.5);
    this.lowBoostFilter  = this.context.createBiquadFilter();
    this.wetGain         = this.context.createGain();
    this.dryGain         = this.context.createGain();

    // 임펄스 응답 생성
    this.convolverNode.buffer = this._synthesizeIR(config);

    // 프리딜레이 설정
    this.predelayNode.delayTime.value = config.predelayMs / 1000;

    // 저역 강화/감쇠
    this.lowBoostFilter.type = 'lowshelf';
    this.lowBoostFilter.frequency.value = 200;
    this.lowBoostFilter.gain.value = config.lowFreqBoost;

    // Wet/Dry 비율
    this.wetGain.gain.value = wetMix;
    this.dryGain.gain.value = 1 - wetMix;

    console.log(`[SpaceSynth] 장소 변환: ${config.emoji} ${config.nameKo} (잔향 ${config.decaySec}초)`);
  }

  deactivate(): void {
    this.convolverNode?.disconnect();
    this.predelayNode?.disconnect();
    this.currentPreset = null;
    console.log('[SpaceSynth] 장소 변환 비활성화');
  }

  getCurrentPresetName(): string {
    if (!this.currentPreset) return '없음';
    return SPACE_CONFIGS[this.currentPreset].nameKo;
  }

  /**
   * 합성 임펄스 응답(Synthetic IR) 생성
   *
   * 구성:
   *   1. 초기 반사(Early Reflections): 배열의 특정 시간에 강한 임펄스
   *   2. 후기 잔향(Late Reverberation): 지수 감쇠 랜덤 노이즈
   *   3. 공명 주파수: 해당 주파수 cos 파형 삽입
   */
  private _synthesizeIR(config: SpaceConfig): AudioBuffer {
    const SR       = this.context.sampleRate;
    const length   = Math.floor(SR * config.decaySec);
    const ir       = this.context.createBuffer(2, length, SR);

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);

      // [1] 후기 잔향 기반: 지수 감쇠 잡음
      for (let i = 0; i < length; i++) {
        const t        = i / SR;
        const envelope = Math.exp(-t * (1 / config.decaySec) * 2.5);
        const stereo   = ch === 0 ? 1.0 : 0.97; // L/R 약간 다르게

        // 랜덤 잡음 × 감쇠
        data[i] = (Math.random() * 2 - 1) * envelope * stereo;
      }

      // [2] 초기 반사 삽입
      for (const ref of config.earlyReflections) {
        const idx = Math.floor(SR * ref.ms / 1000);
        if (idx < length) {
          // 임펄스 + 앞뒤 몇 샘플 가중치 (단순 임펄스는 클릭 노이즈 발생)
          for (let d = -2; d <= 2; d++) {
            if (idx + d >= 0 && idx + d < length) {
              data[idx + d] += ref.gain * Math.exp(-d * d / 2); // 가우시안 모양
            }
          }
        }
      }

      // [3] 공간 고유 공명 주파수 삽입
      for (const freq of config.resonanceFreqs) {
        for (let i = 0; i < length; i++) {
          const t        = i / SR;
          const envelope = Math.exp(-t * 5); // 공명은 앞부분에 집중
          data[i] += Math.cos(2 * Math.PI * freq * t) * 0.15 * envelope;
        }
      }
    }

    return ir;
  }
}

// ─── 장소 목록 (UI 선택 패널용) ─────────────────────────────────────────────
export const SPACE_PRESETS_LIST = Object.entries(SPACE_CONFIGS).map(
  ([id, config]) => ({
    id: id as SpacePreset,
    nameKo: config.nameKo,
    description: config.description,
    emoji: config.emoji,
    decaySec: config.decaySec,
  })
);
