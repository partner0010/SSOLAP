/**
 * LiquidMercurySegmentation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 1: 실시간 세그멘테이션 엔진
 *
 * 역할: MediaPipe Selfie Segmentation을 사용해 60fps로 마스크를 추출한다.
 *       피부(Skin) / 의상(Clothing) / 배경(Background) 세 영역을 분리하여
 *       GPU 셰이더가 각 영역에 다른 질감을 적용할 수 있도록 준비한다.
 *
 * 출력 구조:
 *   ┌─────────────────────────────────┐
 *   │  segmentationMask (Float32)     │  ← 0.0=배경, 1.0=인물
 *   │  skinMask         (Float32)     │  ← 피부 영역만 (얼굴/손)
 *   │  clothingMask     (Float32)     │  ← 의상 영역 (인물 - 피부)
 *   └─────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Camera, Frame } from 'react-native-vision-camera';
import { useSharedValue, runOnJS } from 'react-native-reanimated';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

/** 세그멘테이션 결과 — GPU에 바로 넘길 수 있는 텍스처 데이터 묶음 */
export interface SegmentationResult {
  segmentationMask: Float32Array;   // 전체 인물 마스크 (0~1)
  skinMask: Float32Array;           // 피부 영역 마스크 (0~1)
  clothingMask: Float32Array;       // 의상 영역 마스크 (0~1)
  width: number;
  height: number;
  processingTimeMs: number;         // 성능 모니터링용
}

/** 세그멘테이션 품질 티어 — 기기 성능에 따라 자동 조절 */
export type SegmentationQuality = 'ultra' | 'high' | 'medium' | 'low';

// ─── 품질별 처리 해상도 설정 ──────────────────────────────────────────────────
const QUALITY_CONFIG: Record<SegmentationQuality, {
  inputWidth: number;   // MediaPipe 입력 해상도 (작을수록 빠름)
  inputHeight: number;
  smoothingFactor: number; // 마스크 가장자리 블러 강도 (0~1)
}> = {
  ultra:  { inputWidth: 256, inputHeight: 256, smoothingFactor: 0.9 },
  high:   { inputWidth: 192, inputHeight: 192, smoothingFactor: 0.8 },
  medium: { inputWidth: 128, inputHeight: 128, smoothingFactor: 0.7 },
  low:    { inputWidth: 96,  inputHeight: 96,  smoothingFactor: 0.5 },
};

// ─── 피부색 감지 HSV 범위 ─────────────────────────────────────────────────────
// 다양한 피부톤을 커버하는 넓은 HSV 범위
const SKIN_HSV = {
  hMin: 0,   hMax: 25,    // 붉은-주황 계열 색조
  sMin: 0.1, sMax: 0.8,   // 채도 (너무 낮으면 흰색, 너무 높으면 의상)
  vMin: 0.3, vMax: 1.0,   // 밝기
};

// ─── 메인 클래스 ──────────────────────────────────────────────────────────────

export class LiquidMercurySegmentation {
  private quality: SegmentationQuality = 'high';
  private frameCount: number = 0;
  private lastMask: Float32Array | null = null;      // 이전 프레임 마스크 (보간용)
  private isInitialized: boolean = false;

  // 시간적 스무딩 — 갑작스러운 마스크 변화를 방지 (머리카락 흔들림 등)
  private readonly TEMPORAL_SMOOTHING = 0.3; // 0=완전 이전 프레임, 1=완전 현재 프레임

  constructor(quality: SegmentationQuality = 'high') {
    this.quality = quality;
  }

  /**
   * 초기화 — MediaPipe 모델 로드
   * 앱 시작 시 한 번만 호출하면 된다
   */
  async initialize(): Promise<void> {
    // 실제 환경에서는 @mediapipe/selfie_segmentation 또는
    // react-native-mediapipe 패키지의 초기화 코드가 들어간다
    console.log('[LiquidMercury] Segmentation engine initializing...');

    // 모델 워밍업 — 첫 프레임 지연 방지
    // await MediaPipeSegmentation.initialize({ modelType: 'general' });

    this.isInitialized = true;
    console.log('[LiquidMercury] Segmentation ready ✓');
  }

  /**
   * 핵심 함수: 매 프레임마다 호출 (60fps 목표)
   * Frame Processor worklet에서 실행됨
   *
   * @param frame - Vision Camera 프레임 데이터
   * @returns 세그멘테이션 결과 (세 가지 마스크)
   */
  processFrame(frame: Frame): SegmentationResult {
    const startTime = performance.now();
    const config = QUALITY_CONFIG[this.quality];

    // ── Step 1: 프레임을 MediaPipe 입력 크기로 다운샘플링 ──────────────────
    // 풀 해상도(1080p)를 256x256으로 줄여 처리 속도를 확보한다
    const resizedPixels = this._resizeFrame(
      frame,
      config.inputWidth,
      config.inputHeight
    );

    // ── Step 2: MediaPipe Selfie Segmentation 실행 ────────────────────────
    // 인물 전체를 하나의 마스크로 추출 (배경=0, 인물=1)
    const rawMask = this._runMediaPipeSegmentation(resizedPixels, config);

    // ── Step 3: 시간적 스무딩 — 이전 프레임과 선형 보간 ──────────────────
    // 마스크가 프레임마다 급격히 변하면 '깜빡임'이 생긴다
    // LERP(선형보간): result = prev * (1-factor) + current * factor
    const smoothedMask = this._temporalSmooth(rawMask, config.inputWidth * config.inputHeight);

    // ── Step 4: 피부 마스크 추출 ─────────────────────────────────────────
    // 인물 마스크 안에서 피부색 픽셀만 골라낸다 (얼굴, 목, 손)
    const skinMask = this._extractSkinRegion(resizedPixels, smoothedMask, config);

    // ── Step 5: 의상 마스크 계산 ─────────────────────────────────────────
    // 의상 = 인물 전체 - 피부 영역
    const clothingMask = this._subtractMasks(smoothedMask, skinMask);

    // ── Step 6: 원본 해상도로 업스케일 ────────────────────────────────────
    // GPU가 원본 프레임 크기에 맞는 마스크를 기대하기 때문
    const finalSeg      = this._upsampleMask(smoothedMask, config, frame.width, frame.height);
    const finalSkin     = this._upsampleMask(skinMask,     config, frame.width, frame.height);
    const finalClothing = this._upsampleMask(clothingMask, config, frame.width, frame.height);

    this.lastMask = smoothedMask;
    this.frameCount++;

    return {
      segmentationMask: finalSeg,
      skinMask:         finalSkin,
      clothingMask:     finalClothing,
      width:            frame.width,
      height:           frame.height,
      processingTimeMs: performance.now() - startTime,
    };
  }

  // ─── Private 헬퍼 함수들 ────────────────────────────────────────────────────

  /** 프레임 픽셀을 target 해상도로 쌍선형 보간(Bilinear) 다운샘플 */
  private _resizeFrame(frame: Frame, targetW: number, targetH: number): Float32Array {
    // Frame Processor 네이티브 바인딩을 통해 픽셀 데이터 접근
    // 실제: frame.toArrayBuffer() → new Uint8ClampedArray(buffer)
    const pixels = new Float32Array(targetW * targetH * 3); // RGB
    // [실제 구현] 쌍선형 보간 다운샘플링 로직
    // scaleX = frame.width / targetW, scaleY = frame.height / targetH
    // for y in targetH: for x in targetW: bilinear_sample(frame, x*scaleX, y*scaleY)
    return pixels;
  }

  /** MediaPipe Selfie Segmentation 실행 → 0~1 float 마스크 반환 */
  private _runMediaPipeSegmentation(
    pixels: Float32Array,
    config: typeof QUALITY_CONFIG['high']
  ): Float32Array {
    // 실제 환경: MediaPipeSegmentation.segment(pixels) → { mask: Float32Array }
    // 여기서는 구조 명시 목적으로 빈 마스크 반환
    const maskSize = config.inputWidth * config.inputHeight;
    const mask = new Float32Array(maskSize);

    // 가장자리 부드럽게 (Gaussian-like smoothing on mask)
    // 마스크 경계가 딱딱하면 금속 질감이 부자연스럽게 잘림
    this._softEdgeSmoothing(mask, config.inputWidth, config.inputHeight, config.smoothingFactor);

    return mask;
  }

  /** 가우시안 유사 엣지 스무딩 — 마스크 경계를 부드럽게 */
  private _softEdgeSmoothing(
    mask: Float32Array,
    width: number,
    height: number,
    factor: number
  ): void {
    // 3x3 박스 블러를 2회 반복 → 가우시안과 유사한 효과
    // 실제 구현에서는 마스크 알파 경계에만 적용 (성능 최적화)
    const blurRadius = Math.round(factor * 3);
    // [실제 구현] 마스크 경계 픽셀 탐지 → 주변 blurRadius 반경 블러
  }

  /** 시간적 스무딩 — 이전 프레임과 LERP 보간 */
  private _temporalSmooth(currentMask: Float32Array, size: number): Float32Array {
    if (!this.lastMask || this.lastMask.length !== size) {
      return currentMask; // 첫 프레임은 그냥 반환
    }

    const smoothed = new Float32Array(size);
    const alpha = this.TEMPORAL_SMOOTHING; // 0.3 = 현재 프레임 30% 반영

    for (let i = 0; i < size; i++) {
      // LERP: 이전 마스크를 70% 유지 + 현재 마스크 30% 혼합
      smoothed[i] = this.lastMask[i] * (1 - alpha) + currentMask[i] * alpha;
    }
    return smoothed;
  }

  /**
   * 피부 영역 추출 — HSV 색공간에서 피부색 범위를 검출
   *
   * 왜 HSV인가: RGB는 조명 변화에 민감하지만
   *             HSV의 Hue(색조)는 조명이 바뀌어도 비교적 안정적이다.
   */
  private _extractSkinRegion(
    pixels: Float32Array,  // RGB 픽셀 데이터
    personMask: Float32Array,
    config: typeof QUALITY_CONFIG['high']
  ): Float32Array {
    const size = config.inputWidth * config.inputHeight;
    const skinMask = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      // 인물 마스크 바깥은 스킵 (배경은 피부 검사 불필요)
      if (personMask[i] < 0.5) continue;

      // RGB → HSV 변환
      const r = pixels[i * 3];
      const g = pixels[i * 3 + 1];
      const b = pixels[i * 3 + 2];
      const hsv = this._rgbToHsv(r, g, b);

      // 피부색 HSV 범위 체크
      const isSkin = (
        hsv.h >= SKIN_HSV.hMin && hsv.h <= SKIN_HSV.hMax &&
        hsv.s >= SKIN_HSV.sMin && hsv.s <= SKIN_HSV.sMax &&
        hsv.v >= SKIN_HSV.vMin && hsv.v <= SKIN_HSV.vMax
      );

      skinMask[i] = isSkin ? personMask[i] : 0;
    }

    return skinMask;
  }

  /** 마스크 뺄셈: A - B (의상 = 인물 - 피부) */
  private _subtractMasks(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = Math.max(0, a[i] - b[i]); // 음수 방지
    }
    return result;
  }

  /** 마스크를 원본 프레임 크기로 업스케일 (쌍선형 보간) */
  private _upsampleMask(
    mask: Float32Array,
    config: typeof QUALITY_CONFIG['high'],
    targetW: number,
    targetH: number
  ): Float32Array {
    const upsampled = new Float32Array(targetW * targetH);
    const scaleX = config.inputWidth / targetW;
    const scaleY = config.inputHeight / targetH;

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        // 원본 마스크의 대응 좌표
        const srcX = Math.min(x * scaleX, config.inputWidth - 1);
        const srcY = Math.min(y * scaleY, config.inputHeight - 1);
        const srcIdx = Math.floor(srcY) * config.inputWidth + Math.floor(srcX);
        upsampled[y * targetW + x] = mask[srcIdx];
      }
    }
    return upsampled;
  }

  /** RGB → HSV 변환 (0~1 정규화) */
  private _rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta > 0) {
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;

    const s = max === 0 ? 0 : delta / max;
    const v = max;

    return { h: h / 360, s, v }; // 0~1로 정규화
  }

  // ─── 공개 유틸리티 ──────────────────────────────────────────────────────────

  /** 기기 성능에 따라 품질 티어 자동 조절 (AdaptiveQualityManager가 호출) */
  setQuality(quality: SegmentationQuality): void {
    this.quality = quality;
    console.log(`[LiquidMercury] Segmentation quality → ${quality}`);
  }

  /** 현재 처리 중인 프레임 번호 반환 (디버그용) */
  getFrameCount(): number {
    return this.frameCount;
  }
}

// ─── React Native Vision Camera Frame Processor Plugin 등록 ─────────────────
/**
 * 사용법 (VantaLensScreen.tsx에서):
 *
 * const segEngine = new LiquidMercurySegmentation('high');
 * await segEngine.initialize();
 *
 * const frameProcessor = useFrameProcessor((frame) => {
 *   'worklet';
 *   const result = segEngine.processFrame(frame);
 *   // result.segmentationMask → Metal/OpenGL 텍스처로 업로드
 * }, [segEngine]);
 */
