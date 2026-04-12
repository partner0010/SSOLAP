/**
 * LiquidMercuryFilter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Liquid Mercury 필터 통합 오케스트레이터
 *
 * Phase 1~4 + Bonus(VocalChrome)를 하나의 진입점으로 통합
 *
 * 사용법 (VantaLensScreen.tsx에서):
 *   const filter = new LiquidMercuryFilter();
 *   await filter.initialize();
 *   filter.setOnQualityChange((tier) => setQualityLabel(tier));
 *
 *   // Frame Processor에서:
 *   const frameProcessor = useFrameProcessor((frame) => {
 *     'worklet';
 *     filter.processFrame(frame);
 *   }, [filter]);
 *
 *   // 터치 이벤트:
 *   filter.onTouch(x, y, width, height);
 *
 *   // 음성 필터:
 *   await filter.startVoice();
 *   filter.stopVoice();
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Frame } from 'react-native-vision-camera';
import {
  LiquidMercurySegmentation,
  SegmentationResult,
} from './LiquidMercurySegmentation';
import { MercuryPhysics, MercuryPhysicsData } from './MercuryPhysics';
import { AdaptiveQualityManager, QualityTier, CubemapBuilder } from './AdaptiveQualityManager';
import { VocalChromeDSP } from '../audio/VocalChromeDSP';

// ─── GPU에 업로드될 최종 유니폼 구조체 ───────────────────────────────────────
export interface MercuryGPUUniforms {
  time: number;
  gravity: [number, number];
  touchPoint: [number, number];
  touchTime: number;
  touchActive: number;
  qualityLevel: number;       // 0~3 (low=0, medium=1, high=2, ultra=3)
  filterIntensity: number;    // 사용자 슬라이더 값 (0~1)
  displacementScale: number;  // 움직임에 따라 AdaptiveQuality가 조절
}

// ─── 메인 통합 클래스 ─────────────────────────────────────────────────────────
export class LiquidMercuryFilter {
  // Phase 1: 세그멘테이션
  private segmentation: LiquidMercurySegmentation;

  // Phase 3: 물리
  private physics: MercuryPhysics;

  // Phase 4: 품질 관리
  private qualityManager: AdaptiveQualityManager;

  // Bonus: 음성 필터
  private vocalDSP: VocalChromeDSP;

  // 큐브맵 빌더 (배경 → 환경 반사)
  private cubemapBuilder: CubemapBuilder;

  // 상태
  private isActive: boolean = false;
  private startTime: number = 0;
  private filterIntensity: number = 1.0;

  // 현재 프레임 처리 결과 (GPU 업로드용)
  private currentUniforms: MercuryGPUUniforms = {
    time: 0,
    gravity: [0, 0],
    touchPoint: [0.5, 0.5],
    touchTime: 0,
    touchActive: 0,
    qualityLevel: 2,
    filterIntensity: 1.0,
    displacementScale: 0.015,
  };
  private currentSegResult: SegmentationResult | null = null;

  constructor() {
    this.segmentation   = new LiquidMercurySegmentation('high');
    this.physics        = new MercuryPhysics();
    this.qualityManager = new AdaptiveQualityManager(this.segmentation, 'high');
    this.vocalDSP       = new VocalChromeDSP();
    this.cubemapBuilder = new CubemapBuilder();
  }

  /**
   * 필터 초기화 — 앱에서 Liquid Mercury 선택 시 1회 호출
   */
  async initialize(): Promise<void> {
    console.log('[LiquidMercury] Initializing...');

    // Phase 1: 세그멘테이션 엔진 모델 로드
    await this.segmentation.initialize();

    // Phase 4: 품질 변경 이벤트 연결
    this.qualityManager.setOnQualityChange((tier, config) => {
      const tierMap: Record<QualityTier, number> = {
        low: 0, medium: 1, high: 2, ultra: 3
      };
      this.currentUniforms.qualityLevel = tierMap[tier];
      console.log(`[LiquidMercury] Quality: ${tier} | Tex: ${config.textureScale * 100}% | Cube: ${config.cubemapSize}px`);
    });

    // Phase 3: 물리 엔진 시작 (가속도 센서 구독)
    await this.physics.start((physicsData: MercuryPhysicsData) => {
      // 물리 계산 결과를 GPU 유니폼에 반영
      this.currentUniforms.gravity          = physicsData.gravity;
      this.currentUniforms.touchPoint       = physicsData.touchPoint;
      this.currentUniforms.touchTime        = physicsData.touchTime;
      this.currentUniforms.touchActive      = physicsData.touchActive;
      this.currentUniforms.displacementScale = physicsData.displacementScale;
    });

    // 배터리 상태 최초 확인
    await this.qualityManager.checkBatteryOptimization();

    this.startTime = Date.now();
    this.isActive  = true;

    console.log('[LiquidMercury] All systems ready ✓');
    console.log('[LiquidMercury] Pipeline: Seg → Physics → GPU Shader → Output');
  }

  /**
   * 핵심: 매 프레임 처리
   * Vision Camera Frame Processor worklet에서 호출
   *
   * 처리 흐름:
   *   1. FPS 측정 → 품질 자동 조절
   *   2. 세그멘테이션 (60fps)
   *   3. 큐브맵 갱신 (0.5초마다)
   *   4. GPU 유니폼 업데이트
   *   → 셰이더가 이 유니폼으로 렌더링
   */
  processFrame(frame: Frame): {
    uniforms: MercuryGPUUniforms;
    segResult: SegmentationResult;
  } {
    // [1] FPS 측정 + 품질 자동 조절
    this.qualityManager.tick();

    // [2] 현재 시간 업데이트 (셰이더 애니메이션용)
    this.currentUniforms.time = (Date.now() - this.startTime) / 1000;
    this.currentUniforms.filterIntensity = this.filterIntensity;

    // [3] 세그멘테이션 실행 (마스크 추출)
    const segResult = this.segmentation.processFrame(frame);
    this.currentSegResult = segResult;

    // [4] 큐브맵 갱신 (배경으로 환경 반사 업데이트)
    const cubemapSize = this.qualityManager.getCurrentConfig().cubemapSize;
    this.cubemapBuilder.update(frame, cubemapSize);

    return {
      uniforms: { ...this.currentUniforms },
      segResult,
    };
  }

  /**
   * 터치 이벤트 → 파동 효과 트리거
   */
  onTouch(x: number, y: number, screenWidth: number, screenHeight: number): void {
    this.physics.onTouch(x, y, screenWidth, screenHeight);
  }

  /**
   * 음성 필터 시작 (Vocal Chrome Mercury Edition)
   * 시각 필터와 동시에 켜면 완전한 "Liquid Mercury" 경험
   */
  async startVoice(): Promise<void> {
    await this.vocalDSP.start();
    console.log('[LiquidMercury] Voice modulation ON — 금속성 보이스 활성화');
  }

  async stopVoice(): Promise<void> {
    await this.vocalDSP.stop();
  }

  /**
   * 필터 강도 조절 (0~1) — UI 슬라이더 연동
   */
  setFilterIntensity(value: number): void {
    this.filterIntensity = Math.max(0, Math.min(1, value));
  }

  /**
   * 열 상태 업데이트 (네이티브 브릿지에서 호출)
   */
  updateThermalState(level: 'nominal' | 'fair' | 'serious' | 'critical'): void {
    this.qualityManager.updateThermalState(level);
  }

  /**
   * 필터 비활성화 및 리소스 해제
   */
  async destroy(): Promise<void> {
    this.physics.stop();
    await this.vocalDSP.stop();
    this.isActive = false;
    console.log('[LiquidMercury] Filter destroyed, resources released');
  }

  /**
   * 성능 리포트 (디버그 오버레이용)
   */
  getPerformanceReport(): string {
    const segFrames = this.segmentation.getFrameCount();
    const gravity   = this.physics.getCurrentData().gravity;
    const qReport   = this.qualityManager.getPerformanceReport();

    return [
      qReport,
      `  Seg Frames: ${segFrames}`,
      `  Gravity: (${gravity[0].toFixed(2)}, ${gravity[1].toFixed(2)})`,
      `  Voice: ${this.vocalDSP.getIsRunning() ? 'ON' : 'OFF'}`,
    ].join('\n');
  }

  getVocalDSP(): VocalChromeDSP { return this.vocalDSP; }
  getCurrentTier(): QualityTier { return this.qualityManager.getCurrentTier(); }
}
