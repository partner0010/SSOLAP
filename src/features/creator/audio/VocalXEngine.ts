/**
 * VocalXEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vocal-X 오디오 변조 엔진 — 최상위 오케스트레이터
 *
 * 기존 VocalChromeDSP.ts를 대체하는 통합 엔진
 *
 * 전체 오디오 그래프:
 *
 *   마이크 (MediaStream)
 *     ↓
 *   [MediaStreamSourceNode]         ← 마이크 입력 소스
 *     ↓
 *   [VocalXWorkletNode]             ← 핵심 DSP (별도 오디오 스레드)
 *     ↓                ↓
 *   [AnalyserNode]   [GainNode]     ← 파형 분석 / 출력 음량
 *     ↓                ↓
 *   [시각화기]      [AudioDestination] ← 화면 표시 / 스피커/녹음
 *
 * 지연 경로:
 *   마이크 → ADC → OS 버퍼 → WorkletNode → DAC → 스피커
 *   총 예상 지연: ~8ms (Worklet 버퍼) + ~5ms (OS) = ~13ms ✅
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FILTER_PRESETS, FilterPreset, FILTER_ID, FilterId } from './FilterPresets';
import { OhaengMatcher, OhaengElement } from './OhaengMatcher';
import { SpaceSynthesizer, SpacePreset } from './BonusFilters';
import { DuetAI } from './BonusFilters';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

/** 엔진 상태 */
type EngineState = 'idle' | 'initializing' | 'running' | 'error';

/** Vocal Dial에 표시할 실시간 메트릭 */
export interface VocalXMetrics {
  inputLevel: number;   // 입력 레벨 (0~1)
  outputLevel: number;  // 출력 레벨 (0~1)
  activeFilter: FilterId;
  filterIntensity: number;
  latencyMs: number;    // 측정된 실제 지연 시간
}

/** 파형 시각화기에 전달할 데이터 */
export interface WaveformData {
  timeDomain: Float32Array;   // 시간 도메인 파형 (오실로스코프)
  frequency: Uint8Array;      // 주파수 스펙트럼 (EQ 바)
}

// ─── 메인 클래스 ──────────────────────────────────────────────────────────────

export class VocalXEngine {
  // 오디오 그래프 노드들
  private context: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private outputGain: GainNode | null = null;

  // 보너스 모듈
  private spaceSynth: SpaceSynthesizer | null = null;
  private duetAI: DuetAI | null = null;

  // 현재 상태
  private state: EngineState = 'idle';
  private activeFilter: FilterId = FILTER_ID.BYPASS;
  private filterIntensity: number = 0.8; // 기본 강도 80%
  private ohaengElement: OhaengElement | null = null;

  // 지연 측정 (오디오 컨텍스트 baseLatency + outputLatency)
  private measuredLatencyMs: number = 0;

  // 마이크 스트림 (음소거 토글용)
  private micStream: MediaStream | null = null;
  private isMuted: boolean = false;

  // 상태 변경 콜백
  private onMetricsUpdate: ((metrics: VocalXMetrics) => void) | null = null;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * 엔진 초기화 — Vocal-X 탭 진입 시 호출
   *
   * AudioWorklet은 비동기 모듈 로드가 필요하므로 async 필수
   */
  async initialize(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'initializing';

    console.log('[VocalX] Engine initializing...');

    try {
      // ── [1] AudioContext 생성 ─────────────────────────────────────────
      // latencyHint: 'interactive' → 저지연 우선 (게임/실시간 처리용)
      this.context = new AudioContext({
        sampleRate: 44100,
        latencyHint: 'interactive',
      });

      // ── [2] AudioWorklet 모듈 등록 ───────────────────────────────────
      // 워크렛 파일을 별도 스레드에 로드
      // 실제 경로는 Metro bundler 설정에 따라 다름
      await this.context.audioWorklet.addModule(
        'src/features/creator/audio/worklets/VocalXProcessor.worklet.js'
      );
      console.log('[VocalX] Worklet module loaded ✓');

      // ── [3] 마이크 접근 ──────────────────────────────────────────────
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,   // 자체 DSP가 처리
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,           // 모노 (처리 부하 절반)
          sampleRate: 44100,
        },
      });

      // ── [4] 오디오 그래프 구성 ────────────────────────────────────────
      this.sourceNode  = this.context.createMediaStreamSource(this.micStream);
      this.workletNode = new AudioWorkletNode(this.context, 'vocal-x-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],  // 모노 출력
      });

      // 파형 분석기 (시각화용) — FFT 2048 → 주파수 해상도 ~21.5Hz/bin
      this.analyserNode = this.context.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.85; // 스무딩 (출렁이는 파형)

      // 출력 게인 (마스터 볼륨)
      this.outputGain = this.context.createGain();
      this.outputGain.gain.value = 0.9;

      // 노드 연결
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.analyserNode);
      this.workletNode.connect(this.outputGain);
      this.outputGain.connect(this.context.destination);

      // ── [5] 보너스 모듈 초기화 ───────────────────────────────────────
      this.spaceSynth = new SpaceSynthesizer(this.context);
      this.duetAI     = new DuetAI(this.context);

      // ── [6] 지연 시간 측정 ───────────────────────────────────────────
      this.measuredLatencyMs = (
        (this.context.baseLatency ?? 0) +
        (this.context.outputLatency ?? 0)
      ) * 1000;
      console.log(`[VocalX] Measured latency: ${this.measuredLatencyMs.toFixed(1)}ms`);

      // ── [7] 메트릭 업데이트 루프 (60fps) ─────────────────────────────
      this.metricsInterval = setInterval(() => this._updateMetrics(), 16);

      this.state = 'running';
      console.log('[VocalX] Engine ready ✓');
    } catch (err) {
      this.state = 'error';
      console.error('[VocalX] Init failed:', err);
      throw err;
    }
  }

  // ─── 필터 제어 ──────────────────────────────────────────────────────────────

  /**
   * 활성 필터 변경
   * 다이얼 UI에서 필터 탭 선택 시 호출
   */
  setFilter(filterId: FilterId): void {
    this.activeFilter = filterId;

    // WorkletNode로 메시지 전달 (오디오 스레드에서 필터 변경)
    this.workletNode?.port.postMessage({
      type: 'setFilter',
      value: filterId,
    });

    // 보너스 필터 처리
    const preset = FILTER_PRESETS[filterId];
    if (preset?.spacePreset && this.spaceSynth) {
      this.spaceSynth.activate(preset.spacePreset);
    } else {
      this.spaceSynth?.deactivate();
    }

    if (filterId === FILTER_ID.DUET_AI) {
      this.duetAI?.start();
    } else {
      this.duetAI?.stop();
    }

    console.log(`[VocalX] Filter → ${filterId}`);
  }

  /**
   * 필터 강도 조절 (0~1)
   * Vocal Dial 회전 시 호출
   */
  setIntensity(value: number): void {
    this.filterIntensity = Math.max(0, Math.min(1, value));
    this.workletNode?.port.postMessage({
      type: 'setIntensity',
      value: this.filterIntensity,
    });
  }

  /**
   * 사주 오행 설정 — SajuFilterEngine이 호출
   * @param element 오행 요소
   */
  setOhaengElement(element: OhaengElement): void {
    this.ohaengElement = element;
    const matched = OhaengMatcher.match(element);

    // 오행에 맞는 필터 자동 추천 (강제 변경 아님 — 알림만)
    console.log(`[VocalX] 오행 매칭: ${element} → 추천 필터: ${matched.recommendedFilter}`);

    // 오행 부스트 적용 (현재 필터에 추가 레이어)
    this.workletNode?.port.postMessage({
      type: 'setOhaeng',
      value: matched.workletMode,
    });
  }

  // ─── 파형 데이터 취득 (시각화기가 호출) ──────────────────────────────────────

  getWaveformData(): WaveformData | null {
    if (!this.analyserNode) return null;

    const bufferLen = this.analyserNode.frequencyBinCount;
    const timeDomain = new Float32Array(bufferLen);
    const frequency  = new Uint8Array(bufferLen);

    this.analyserNode.getFloatTimeDomainData(timeDomain); // 파형 (-1~1)
    this.analyserNode.getByteFrequencyData(frequency);    // 스펙트럼 (0~255)

    return { timeDomain, frequency };
  }

  // ─── 음소거 / 마이크 제어 ────────────────────────────────────────────────────

  toggleMute(): void {
    this.isMuted = !this.isMuted;
    const t = this.context?.currentTime ?? 0;
    this.outputGain?.gain.linearRampToValueAtTime(
      this.isMuted ? 0 : 0.9,
      t + 0.05 // 50ms 페이드
    );
  }

  // ─── 리소스 해제 ─────────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    this.duetAI?.stop();
    this.spaceSynth?.deactivate();

    // 마이크 스트림 닫기 (카메라 앱 나갈 때 필수)
    this.micStream?.getTracks().forEach(t => t.stop());

    await this.context?.close();
    this.context = null;
    this.state   = 'idle';
    console.log('[VocalX] Engine destroyed');
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /** 메트릭 수집 및 콜백 호출 */
  private _updateMetrics(): void {
    if (!this.onMetricsUpdate || !this.analyserNode) return;

    const buffer = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(buffer);

    // RMS로 음량 레벨 계산 (VU 미터용)
    let sumSq = 0;
    for (const s of buffer) sumSq += s * s;
    const rms = Math.sqrt(sumSq / buffer.length);

    this.onMetricsUpdate({
      inputLevel:      Math.min(1, rms * 5),
      outputLevel:     Math.min(1, rms * 5 * this.filterIntensity),
      activeFilter:    this.activeFilter,
      filterIntensity: this.filterIntensity,
      latencyMs:       this.measuredLatencyMs,
    });
  }

  // ─── 공개 유틸리티 ──────────────────────────────────────────────────────────
  setOnMetricsUpdate(cb: (m: VocalXMetrics) => void): void { this.onMetricsUpdate = cb; }
  getState(): EngineState { return this.state; }
  getActiveFilter(): FilterId { return this.activeFilter; }
  getFilterIntensity(): number { return this.filterIntensity; }
  getLatencyMs(): number { return this.measuredLatencyMs; }
}

// ─── 싱글턴 내보내기 ─────────────────────────────────────────────────────────
export const vocalXEngine = new VocalXEngine();
