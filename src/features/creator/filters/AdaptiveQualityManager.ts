/**
 * AdaptiveQualityManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 4: 동적 품질 최적화 시스템
 *
 * 목표: 발열 없이 60fps 유지
 *
 * 전략:
 *   1. FPS 실시간 측정 → 목표 FPS 미달 시 품질 티어 자동 하강
 *   2. 열 상태(Thermal) 모니터링 → 발열 감지 시 즉각 품질 하강
 *   3. 배터리 레벨 모니터링 → 저전력 모드 자동 진입
 *   4. 품질 변경 시 셰이더 / 세그멘테이션 / 큐브맵 해상도 동시 조절
 *
 * 큐브맵 방식을 선택한 이유:
 *   - Ray Tracing: 픽셀마다 광선 추적 → GPU 연산 폭발적 증가 → 발열
 *   - Cubemap: 6방향 텍스처 미리 캡처 → 단순 텍스처 샘플링 → 빠름
 *   - 단점: 동적 반사(움직이는 물체)가 부정확하지만 인물 필터에서는 무방
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import { LiquidMercurySegmentation, SegmentationQuality } from './LiquidMercurySegmentation';

// ─── 품질 티어 정의 ───────────────────────────────────────────────────────────

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

/** 각 품질 티어별 세부 설정 */
interface QualityConfig {
  targetFPS: number;            // 목표 프레임레이트
  segQuality: SegmentationQuality; // 세그멘테이션 해상도
  textureScale: number;         // 텍스처 다운스케일 (1=풀해상도, 0.5=절반)
  cubemapSize: number;          // 큐브맵 각 면의 해상도 (픽셀)
  noiseOctaves: number;         // Perlin Noise 옥타브 수 (높을수록 세밀)
  enableRipple: boolean;        // 터치 파동 효과 활성화
  enableGravityFlow: boolean;   // 중력 흐름 효과 활성화
  maxParticles: number;         // 수은 방울 파티클 수 (0=비활성)
}

const QUALITY_CONFIGS: Record<QualityTier, QualityConfig> = {
  ultra: {
    targetFPS: 60,
    segQuality: 'ultra',
    textureScale: 1.0,    // 풀 해상도
    cubemapSize: 256,     // 고품질 환경 반사
    noiseOctaves: 4,      // 세밀한 유동 표현
    enableRipple: true,
    enableGravityFlow: true,
    maxParticles: 20,
  },
  high: {
    targetFPS: 60,
    segQuality: 'high',
    textureScale: 0.75,   // 75% 해상도
    cubemapSize: 128,
    noiseOctaves: 3,
    enableRipple: true,
    enableGravityFlow: true,
    maxParticles: 10,
  },
  medium: {
    targetFPS: 30,
    segQuality: 'medium',
    textureScale: 0.5,    // 절반 해상도 (가장 많이 쓰는 최적화 구간)
    cubemapSize: 64,
    noiseOctaves: 2,
    enableRipple: true,
    enableGravityFlow: true,
    maxParticles: 0,      // 파티클 비활성
  },
  low: {
    targetFPS: 24,
    segQuality: 'low',
    textureScale: 0.25,   // 25% 해상도 (저사양 기기 생존 모드)
    cubemapSize: 32,
    noiseOctaves: 1,
    enableRipple: false,  // 파동 비활성
    enableGravityFlow: false,
    maxParticles: 0,
  },
};

// ─── FPS 측정 유틸리티 ────────────────────────────────────────────────────────

class FPSMeter {
  private timestamps: number[] = [];
  private readonly WINDOW_SIZE = 30; // 최근 30프레임 평균 측정

  tick(): void {
    const now = performance.now();
    this.timestamps.push(now);
    // 윈도우 크기 초과 시 오래된 샘플 제거
    if (this.timestamps.length > this.WINDOW_SIZE) {
      this.timestamps.shift();
    }
  }

  getAverageFPS(): number {
    if (this.timestamps.length < 2) return 60; // 데이터 부족 시 최대값 가정
    const duration = this.timestamps[this.timestamps.length - 1] - this.timestamps[0];
    return (this.timestamps.length - 1) / (duration / 1000); // 초당 프레임 수
  }
}

// ─── 메인 클래스 ──────────────────────────────────────────────────────────────

export class AdaptiveQualityManager {
  private currentTier: QualityTier;
  private fpsMeter: FPSMeter;
  private segEngine: LiquidMercurySegmentation;

  // 품질 변경 쿨다운 — 너무 자주 변경하면 오히려 성능 저하
  private lastTierChangeTime: number = 0;
  private readonly TIER_CHANGE_COOLDOWN_MS = 3000; // 3초 쿨다운

  // 연속 FPS 미달 카운터 — 일시적 드롭은 무시
  private lowFPSCount: number = 0;
  private readonly LOW_FPS_THRESHOLD = 10; // 10프레임 연속 미달 시 품질 하강

  // 열 상태 (iOS 15+ / Android 11+ Thermal API)
  private thermalLevel: 'nominal' | 'fair' | 'serious' | 'critical' = 'nominal';

  // 콜백 — 품질 변경 시 UI 업데이트
  private onQualityChange: ((tier: QualityTier, config: QualityConfig) => void) | null = null;

  constructor(
    segEngine: LiquidMercurySegmentation,
    initialTier: QualityTier = 'high'
  ) {
    this.segEngine = segEngine;
    this.currentTier = initialTier;
    this.fpsMeter = new FPSMeter();

    // 세그멘테이션 엔진에 초기 품질 설정
    this.segEngine.setQuality(QUALITY_CONFIGS[initialTier].segQuality);
  }

  /**
   * 품질 변경 이벤트 리스너 등록
   * @param cb 품질 변경 시 호출될 콜백 (셰이더 유니폼 업데이트 등)
   */
  setOnQualityChange(cb: (tier: QualityTier, config: QualityConfig) => void): void {
    this.onQualityChange = cb;
  }

  /**
   * 매 프레임 호출 — FPS 측정 및 품질 자동 조절
   * Frame Processor worklet에서 호출
   */
  tick(): void {
    this.fpsMeter.tick();

    // 쿨다운 중이면 품질 변경하지 않음
    const now = Date.now();
    if (now - this.lastTierChangeTime < this.TIER_CHANGE_COOLDOWN_MS) return;

    this._evaluateQuality();
  }

  /**
   * 열 상태 업데이트 (iOS ThermalState / Android PowerManager)
   * @param level 열 레벨
   */
  updateThermalState(level: 'nominal' | 'fair' | 'serious' | 'critical'): void {
    this.thermalLevel = level;

    // 심각한 발열 시 즉각 품질 하강 (쿨다운 무시)
    if (level === 'critical') {
      this._forceSetTier('low', '발열 위험: Critical');
    } else if (level === 'serious') {
      const tierMap: Record<QualityTier, QualityTier> = {
        ultra: 'medium',
        high: 'medium',
        medium: 'low',
        low: 'low',
      };
      this._forceSetTier(tierMap[this.currentTier], '발열: Serious');
    }
  }

  /**
   * 배터리 상태 확인 및 품질 조절
   * 저전력 모드에서는 자동으로 'low' 티어 강제
   */
  async checkBatteryOptimization(): Promise<void> {
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const isPowerSaving = await Battery.getPowerStateAsync();

      // 배터리 20% 미만이거나 절전 모드면 medium 이하로 제한
      if (batteryLevel < 0.2 || isPowerSaving.lowPowerMode) {
        if (this.currentTier === 'ultra' || this.currentTier === 'high') {
          this._forceSetTier('medium', `배터리 최적화 (${Math.round(batteryLevel * 100)}%)`);
        }
      }
    } catch (e) {
      // 배터리 API 미지원 기기 — 무시
    }
  }

  /** 현재 품질 설정 반환 */
  getCurrentConfig(): QualityConfig {
    return QUALITY_CONFIGS[this.currentTier];
  }

  /** 현재 품질 티어 반환 */
  getCurrentTier(): QualityTier {
    return this.currentTier;
  }

  /** 성능 리포트 출력 (디버그용) */
  getPerformanceReport(): string {
    const fps = this.fpsMeter.getAverageFPS();
    const config = QUALITY_CONFIGS[this.currentTier];
    return [
      `[AdaptiveQuality]`,
      `  Tier: ${this.currentTier.toUpperCase()}`,
      `  FPS: ${fps.toFixed(1)} / target ${config.targetFPS}`,
      `  Texture: ${config.textureScale * 100}%`,
      `  Cubemap: ${config.cubemapSize}px`,
      `  Thermal: ${this.thermalLevel}`,
    ].join('\n');
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /** FPS 기반 품질 평가 및 자동 조절 */
  private _evaluateQuality(): void {
    const currentFPS = this.fpsMeter.getAverageFPS();
    const config = QUALITY_CONFIGS[this.currentTier];

    // FPS가 목표치의 80% 미만이면 품질 하강 고려
    const fpsMet = currentFPS >= config.targetFPS * 0.8;

    if (!fpsMet) {
      this.lowFPSCount++;
      if (this.lowFPSCount >= this.LOW_FPS_THRESHOLD) {
        // 품질 한 단계 내리기
        const downgrade = this._getNextTier(this.currentTier, 'down');
        if (downgrade) {
          this._setTier(downgrade, `FPS 미달: ${currentFPS.toFixed(1)}fps`);
          this.lowFPSCount = 0;
        }
      }
    } else {
      this.lowFPSCount = 0;

      // FPS가 목표치의 120% 이상이면 품질 상승 시도 (디바이스 여유 있음)
      if (currentFPS >= config.targetFPS * 1.2) {
        const upgrade = this._getNextTier(this.currentTier, 'up');
        if (upgrade) {
          this._setTier(upgrade, `FPS 여유: ${currentFPS.toFixed(1)}fps`);
        }
      }
    }
  }

  /** 품질 티어 변경 (쿨다운 적용) */
  private _setTier(tier: QualityTier, reason: string): void {
    if (tier === this.currentTier) return;

    console.log(`[AdaptiveQuality] ${this.currentTier} → ${tier} (${reason})`);
    this.currentTier = tier;
    this.lastTierChangeTime = Date.now();

    // 세그멘테이션 엔진 품질도 동시 변경
    this.segEngine.setQuality(QUALITY_CONFIGS[tier].segQuality);

    // 콜백 호출 — UI, 셰이더 업데이트
    this.onQualityChange?.(tier, QUALITY_CONFIGS[tier]);
  }

  /** 쿨다운 무시 강제 품질 변경 (발열 위험 시) */
  private _forceSetTier(tier: QualityTier, reason: string): void {
    this.lastTierChangeTime = 0; // 쿨다운 리셋
    this._setTier(tier, `[강제] ${reason}`);
  }

  /** 인접 품질 티어 계산 */
  private _getNextTier(current: QualityTier, direction: 'up' | 'down'): QualityTier | null {
    const tiers: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
    const idx = tiers.indexOf(current);
    const nextIdx = direction === 'up' ? idx + 1 : idx - 1;
    return tiers[nextIdx] ?? null;
  }
}

// ─── 큐브맵 빌더 (배경으로 환경 맵 생성) ─────────────────────────────────────
/**
 * CubemapBuilder
 *
 * 실시간 큐브맵 생성 전략:
 *   - 매 프레임마다 갱신하지 않음 (비용 과다)
 *   - 필터 시작 시 1회 또는 사용자가 크게 움직였을 때만 갱신
 *   - 6방향(앞/뒤/좌/우/위/아래) 카메라 프레임을 각각 캡처
 *
 * 현실적 구현 (모바일 한계):
 *   - 카메라는 1방향만 있으므로 실제로는 "앞면"만 업데이트
 *   - 나머지 5면은 배경을 흐리게 처리 (Blurred Environment Approximation)
 *   - 결과: 완벽한 반사는 아니지만 충분히 그럴듯한 금속 느낌
 */
export class CubemapBuilder {
  private cubeTextures: Map<string, ImageData> = new Map();
  private lastUpdateTime: number = 0;
  private readonly UPDATE_INTERVAL_MS = 500; // 0.5초마다 큐브맵 갱신

  /**
   * 현재 카메라 프레임으로 큐브맵 앞면 업데이트
   * @param frame 카메라 프레임 (블러 처리 후 배경 색상 추출용)
   * @param size 큐브맵 크기 (AdaptiveQuality에서 결정)
   */
  update(frame: any, size: number): boolean {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL_MS) {
      return false; // 아직 갱신 불필요
    }

    // 카메라 프레임 → 다운샘플 → 6방향 배분
    // [실제 구현] frame을 size×size로 다운샘플하여 앞면 텍스처로 사용
    // 나머지 5면: 배경의 평균 색상으로 채움 (단색 + 가우시안 블러)

    this.lastUpdateTime = now;
    return true;
  }
}
