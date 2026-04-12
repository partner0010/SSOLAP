/**
 * LiquidWaveVisualizer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 액체 금속 파형 시각화 컴포넌트
 *
 * 디자인:
 *   단순한 선 파형이 아닌 '수은이 출렁이는' 3D 질감의 파동 렌더링
 *
 * 시각적 레이어 (뒤 → 앞 순서):
 *   [1] 배경: 딥 블랙 (#0A0A14)
 *   [2] 아래 채움 그라디언트: 파형 아래 수은 웅덩이 느낌
 *   [3] 반사 레이어: 파형 위아래 대칭 (수면 반사)
 *   [4] 메인 파형: 은빛 메탈릭 선
 *   [5] 글로우: 파형 위 발광 효과 (활성 필터 색상)
 *   [6] 하이라이트: 파형 피크에 빛나는 점
 *
 * 렌더링:
 *   Canvas API (react-native-skia 또는 react-native-canvas)
 *   AnalyserNode.getFloatTimeDomainData() → 60fps 업데이트
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { Canvas, Path, LinearGradient, vec, Paint, Skia } from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { WaveformData } from '../audio/VocalXEngine';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const VIZ_WIDTH  = SCREEN_W;
const VIZ_HEIGHT = 120;           // 파형 컴포넌트 높이 (px)
const CENTER_Y   = VIZ_HEIGHT / 2; // 파형 중심선

// 파형 색상 — Cool Tone 수은
const WAVE_SILVER = '#8EA4BC';     // 기본 실버
const WAVE_LIGHT  = '#C8D8E8';     // 하이라이트
const WAVE_GLOW   = '#4A6A8A';     // 발광 색상

// ─── Props ───────────────────────────────────────────────────────────────────
interface LiquidWaveVisualizerProps {
  waveformData: WaveformData | null;
  activeColor?: string;    // 활성 필터 색상 (발광에 사용)
  isActive?: boolean;      // 오디오 활성 여부
  height?: number;
}

// ─── 유틸리티: 파형 데이터 → SVG Path ────────────────────────────────────────

/**
 * 시간 도메인 데이터 → 부드러운 곡선 경로 생성
 * 단순 폴리라인 대신 카디날 스플라인(Cardinal Spline)으로 부드럽게
 *
 * 카디날 스플라인:
 *   각 점을 통과하는 부드러운 곡선
 *   인접 점들의 기울기를 이용해 제어점 자동 계산
 */
function buildWavePath(
  data: Float32Array,
  width: number,
  height: number,
  centerY: number,
  amplitude: number = 0.8  // 진폭 배율 (0~1)
): string {
  const bufferLen = data.length;
  if (bufferLen < 2) return '';

  // 렌더링할 포인트 수 (너무 많으면 느림, 너무 적으면 해상도 낮음)
  const points = Math.min(bufferLen, Math.floor(width / 2));
  const step   = bufferLen / points;

  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i < points; i++) {
    const idx     = Math.floor(i * step);
    const sample  = data[idx];   // -1 ~ 1

    xs.push((i / (points - 1)) * width);
    // 중심에서 위아래로 진폭만큼 이동
    ys.push(centerY - sample * (height / 2 - 8) * amplitude);
  }

  // SVG Path 문자열 생성 (베지어 곡선)
  let path = `M ${xs[0]} ${ys[0]}`;

  for (let i = 1; i < points - 1; i++) {
    // 카디날 스플라인 제어점 계산 (tension = 0.5)
    const tension = 0.5;
    const cp1x = xs[i - 1] + (xs[i] - xs[i > 1 ? i - 2 : 0]) * tension / 2;
    const cp1y = ys[i - 1] + (ys[i] - ys[i > 1 ? i - 2 : 0]) * tension / 2;
    const cp2x = xs[i] - (xs[i + 1] - xs[i - 1]) * tension / 2;
    const cp2y = ys[i] - (ys[i + 1] - ys[i - 1]) * tension / 2;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${xs[i]} ${ys[i]}`;
  }

  // 마지막 점
  path += ` L ${xs[points - 1]} ${ys[points - 1]}`;
  return path;
}

/**
 * 채움 영역 경로 (파형 아래 수은 채움)
 * 파형 경로 + 아랫변으로 닫는 경로
 */
function buildFillPath(wavePath: string, width: number, height: number): string {
  return `${wavePath} L ${width} ${height} L 0 ${height} Z`;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export const LiquidWaveVisualizer: React.FC<LiquidWaveVisualizerProps> = ({
  waveformData,
  activeColor = WAVE_GLOW,
  isActive = false,
  height = VIZ_HEIGHT,
}) => {
  const canvasRef = useRef<any>(null);

  // 유휴 상태 애니메이션 (오디오 없을 때 부드러운 사인파 시뮬레이션)
  const idlePhase = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    // 유휴 파동 애니메이션 루프
    idlePhase.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.linear }),
      -1, // 무한 반복
      false
    );

    // 활성 시 글로우 펄싱
    if (isActive) {
      glowOpacity.value = withRepeat(
        withTiming(0.8, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true // 역방향 반복 → 펄싱
      );
    } else {
      glowOpacity.value = withTiming(0.3);
    }
  }, [isActive]);

  // ── 파형 경로 계산 ─────────────────────────────────────────────────────────

  const getWaveData = (): Float32Array => {
    if (waveformData?.timeDomain && waveformData.timeDomain.length > 0) {
      return waveformData.timeDomain;
    }
    // 유휴 상태: 부드러운 사인파 시뮬레이션
    const idle = new Float32Array(256);
    const t = Date.now() / 1000;
    for (let i = 0; i < 256; i++) {
      const x = i / 256;
      idle[i] = Math.sin(x * 4 * Math.PI + t * 2) * 0.15
              + Math.sin(x * 7 * Math.PI + t * 3) * 0.08;
    }
    return idle;
  };

  const data      = getWaveData();
  const wavePath  = buildWavePath(data, VIZ_WIDTH, height, height / 2);
  const fillPath  = buildFillPath(wavePath, VIZ_WIDTH, height);

  // ── 주파수 바 데이터 (EQ 바 — 파형 아래 소형 표시) ─────────────────────────
  const freqData = waveformData?.frequency;

  // ── Canvas 렌더링 (React Native Skia 기반) ────────────────────────────────

  // Skia Path 객체 생성
  const skWavePath = Skia.Path.MakeFromSVGString(wavePath);
  const skFillPath = Skia.Path.MakeFromSVGString(fillPath);

  return (
    <View style={[styles.container, { height }]}>
      <Canvas style={{ width: VIZ_WIDTH, height }}>

        {/* ── [1] 채움 그라디언트 (수은 웅덩이) ── */}
        {skFillPath && (
          <Path path={skFillPath}>
            <LinearGradient
              start={vec(0, height / 2)}
              end={vec(0, height)}
              colors={[
                `${activeColor}20`,   // 파형 중심선: 약한 색상
                `${activeColor}00`,   // 바닥: 완전 투명
              ]}
            />
          </Path>
        )}

        {/* ── [2] 반사 레이어 (대칭 파형 — 수면 반사) ── */}
        {/* 파형을 X축 기준 대칭 반전, 불투명도 낮게 */}
        {skWavePath && (
          <Path
            path={skWavePath}
            style="stroke"
            strokeWidth={1}
            color={`${WAVE_SILVER}20`}
            transform={[
              { translateY: height },
              { scaleY: -1 },
              { translateY: -height },
            ]}
          />
        )}

        {/* ── [3] 글로우 레이어 (발광) ── */}
        {skWavePath && (
          <Path
            path={skWavePath}
            style="stroke"
            strokeWidth={8}
            color={`${activeColor}25`}
            strokeCap="round"
          />
        )}

        {/* ── [4] 메인 파형 — 메탈릭 실버 ── */}
        {skWavePath && (
          <Path
            path={skWavePath}
            style="stroke"
            strokeWidth={2}
            strokeCap="round"
          >
            {/* 파형에 메탈릭 그라디언트: 피크에서 더 밝게 */}
            <LinearGradient
              start={vec(0, 0)}
              end={vec(VIZ_WIDTH, 0)}
              colors={[
                WAVE_SILVER,
                WAVE_LIGHT,
                WAVE_SILVER,
                WAVE_LIGHT,
                WAVE_SILVER,
              ]}
            />
          </Path>
        )}

        {/* ── [5] 중심선 ── */}
        <Path
          path={`M 0 ${height / 2} L ${VIZ_WIDTH} ${height / 2}`}
          style="stroke"
          strokeWidth={0.5}
          color="#1A1A2A"
          strokeDashArray={[4, 8]}
        />

      </Canvas>

      {/* ── 주파수 바 (미니 EQ 표시) ── */}
      {freqData && (
        <View style={styles.freqBars}>
          {Array.from({ length: 32 }).map((_, i) => {
            const binIdx = Math.floor((i / 32) * (freqData.length / 4));
            const barH   = Math.max(2, (freqData[binIdx] / 255) * 24);
            const hue    = (i / 32) * 60 + 200; // 200~260 블루-퍼플 계열
            return (
              <View
                key={i}
                style={[
                  styles.freqBar,
                  {
                    height: barH,
                    backgroundColor: `hsl(${hue}, 40%, 35%)`,
                  },
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    width: VIZ_WIDTH,
    backgroundColor: '#0A0A14',
    overflow: 'hidden',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1A1A2A',
  },

  // 주파수 바 (파형 컴포넌트 하단)
  freqBars: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    height: 28,
    gap: 1,
  },
  freqBar: {
    flex: 1,
    borderRadius: 0, // SSOLAP: 각진 스타일
    opacity: 0.7,
  },
});

export default LiquidWaveVisualizer;
