/**
 * VocalDial.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Vocal-X 메탈 다이얼 UI 컴포넌트
 *
 * 디자인:
 *   - 건메탈/실버 금속 질감의 원형 다이얼
 *   - 손으로 돌리면 필터 강도 실시간 변경
 *   - 외곽 링: 활성 필터 색상으로 발광 (Glow)
 *   - 중앙: 현재 필터 이름 + 강도 수치 표시
 *   - 눈금: 30° 간격 (총 12개) — 고급 오디오 장비 스타일
 *   - 포인터: 날카로운 금속 삼각형
 *
 * 인터랙션:
 *   - PanGestureHandler: 원형 드래그로 각도 변환 → 강도 (0~1)
 *   - 탭: 중앙 탭 → 필터 선택 모달 열기
 *   - 진동: 눈금 위치마다 햅틱 피드백
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Path,
  Line,
  Text as SvgText,
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { FilterPreset, FILTER_ID, FilterId } from '../audio/FilterPresets';
import { vocalXEngine } from '../audio/VocalXEngine';

// ─── 다이얼 상수 ─────────────────────────────────────────────────────────────
const DIAL_SIZE   = 220;             // 다이얼 전체 지름 (px)
const DIAL_RADIUS = DIAL_SIZE / 2;   // 반지름
const CENTER      = DIAL_RADIUS;     // 중심 좌표

const MIN_ANGLE   = -135;  // 최소 회전 각도 (왼쪽 끝)
const MAX_ANGLE   =  135;  // 최대 회전 각도 (오른쪽 끝)
const TOTAL_SWEEP = MAX_ANGLE - MIN_ANGLE; // 270°

const TICK_COUNT  = 13; // 눈금 개수 (0~12, 양 끝 포함)

// ─── Props ───────────────────────────────────────────────────────────────────
interface VocalDialProps {
  activeFilter: FilterPreset;
  intensity: number;       // 0~1
  onIntensityChange: (v: number) => void;
  onFilterPress: () => void; // 중앙 탭 → 필터 선택 모달
  latencyMs?: number;
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

/** 강도(0~1) → 각도(-135~135) */
function intensityToAngle(intensity: number): number {
  return MIN_ANGLE + intensity * TOTAL_SWEEP;
}

/** 각도(-135~135) → 강도(0~1) */
function angleToIntensity(angle: number): number {
  return Math.max(0, Math.min(1, (angle - MIN_ANGLE) / TOTAL_SWEEP));
}

/** 극좌표 → 직교 좌표 */
function polarToXY(angleDeg: number, radius: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180); // 12시 방향이 0°
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

// ─── 서브 컴포넌트: 다이얼 SVG 렌더러 ────────────────────────────────────────

interface DialFaceProps {
  rotationDeg: number;
  activeColor: string;
  glowColor: string;
  filterName: string;
  intensityPct: number; // 0~100
}

const DialFace: React.FC<DialFaceProps> = ({
  rotationDeg, activeColor, glowColor, filterName, intensityPct
}) => {
  const pointerEnd = polarToXY(0, DIAL_RADIUS * 0.7); // 포인터 끝 (12시 방향)

  // 진행 호(Arc) — 현재 강도까지의 활성 구간
  const arcAngleStart = MIN_ANGLE + 90; // SVG 각도 변환
  const arcAngleEnd   = intensityToAngle(intensityPct / 100) + 90;
  const arcRadius     = DIAL_RADIUS - 10;

  // SVG Path로 호 그리기 (d 속성)
  function arcPath(startDeg: number, endDeg: number, r: number): string {
    const start  = polarToXY(startDeg, r);
    const end    = polarToXY(endDeg, r);
    const large  = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  return (
    <Svg width={DIAL_SIZE} height={DIAL_SIZE}>
      <Defs>
        {/* 배경 방사형 그라디언트 — 메탈 질감 */}
        <RadialGradient id="dialBg" cx="45%" cy="35%" r="65%">
          <Stop offset="0%"   stopColor="#3A3A4A" />
          <Stop offset="50%"  stopColor="#1A1A2A" />
          <Stop offset="100%" stopColor="#0A0A14" />
        </RadialGradient>

        {/* 포인터 그라디언트 */}
        <LinearGradient id="pointer" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#E0E8F0" />
          <Stop offset="100%" stopColor="#8EA4BC" />
        </LinearGradient>
      </Defs>

      {/* 배경 원 */}
      <Circle
        cx={CENTER} cy={CENTER}
        r={DIAL_RADIUS - 2}
        fill="url(#dialBg)"
        stroke="#2A2A3A"
        strokeWidth={2}
      />

      {/* 외곽 글로우 링 — 활성 필터 색상 */}
      <Circle
        cx={CENTER} cy={CENTER}
        r={DIAL_RADIUS - 4}
        fill="none"
        stroke={glowColor}
        strokeWidth={3}
        opacity={0.4}
      />

      {/* 배경 호 (전체 270° 범위 — 회색) */}
      <Path
        d={arcPath(MIN_ANGLE + 90, MAX_ANGLE + 90, arcRadius)}
        fill="none"
        stroke="#2A2A3A"
        strokeWidth={6}
        strokeLinecap="round"
      />

      {/* 활성 호 (현재 강도까지 — 컬러) */}
      {intensityPct > 0 && (
        <Path
          d={arcPath(MIN_ANGLE + 90, arcAngleEnd, arcRadius)}
          fill="none"
          stroke={activeColor}
          strokeWidth={6}
          strokeLinecap="round"
        />
      )}

      {/* 눈금 마크 */}
      {Array.from({ length: TICK_COUNT }).map((_, i) => {
        const angle = MIN_ANGLE + (i / (TICK_COUNT - 1)) * TOTAL_SWEEP;
        const isMajor = i % 3 === 0;
        const inner  = DIAL_RADIUS - (isMajor ? 26 : 20);
        const outer  = DIAL_RADIUS - 12;
        const p1     = polarToXY(angle + 90, inner);
        const p2     = polarToXY(angle + 90, outer);
        const isActive = i <= Math.round(intensityPct / 100 * (TICK_COUNT - 1));

        return (
          <Line
            key={i}
            x1={p1.x} y1={p1.y}
            x2={p2.x} y2={p2.y}
            stroke={isActive ? activeColor : '#3A3A4A'}
            strokeWidth={isMajor ? 2 : 1}
            strokeLinecap="round"
          />
        );
      })}

      {/* 내부 장식 원 — 두 겹의 링 */}
      <Circle cx={CENTER} cy={CENTER} r={60} fill="none" stroke="#2A2A3A" strokeWidth={1} />
      <Circle cx={CENTER} cy={CENTER} r={55} fill="none" stroke="#1A1A2A" strokeWidth={1} />

      {/* 포인터 삼각형 — 금속 바늘 */}
      <Path
        d={`M ${CENTER} ${CENTER - 45} L ${CENTER - 5} ${CENTER - 20} L ${CENTER + 5} ${CENTER - 20} Z`}
        fill="url(#pointer)"
        transform={`rotate(${rotationDeg}, ${CENTER}, ${CENTER})`}
      />

      {/* 포인터 중심 원 */}
      <Circle cx={CENTER} cy={CENTER} r={8} fill="#1A1A2A" stroke={activeColor} strokeWidth={2} />
      <Circle cx={CENTER} cy={CENTER} r={3} fill={activeColor} />

      {/* 필터 이름 (6시 방향 아래) */}
      <SvgText
        x={CENTER} y={CENTER + 72}
        textAnchor="middle"
        fill={activeColor}
        fontSize={11}
        fontWeight="600"
        letterSpacing={2}
      >
        {filterName.toUpperCase()}
      </SvgText>

      {/* 강도 수치 */}
      <SvgText
        x={CENTER} y={CENTER + 88}
        textAnchor="middle"
        fill="#5A5A6A"
        fontSize={9}
        letterSpacing={1}
      >
        {intensityPct}%
      </SvgText>
    </Svg>
  );
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export const VocalDial: React.FC<VocalDialProps> = ({
  activeFilter,
  intensity,
  onIntensityChange,
  onFilterPress,
  latencyMs,
}) => {
  // 다이얼 회전 각도 (Animated)
  const rotation = useSharedValue(intensityToAngle(intensity));
  const prevStep = useRef(-1); // 이전 눈금 위치 (햅틱 중복 방지)

  // 강도를 UI 퍼센트로 변환
  const intensityPct = Math.round(intensity * 100);

  /** 눈금 단계 계산 (0~12) */
  const getTickStep = (angle: number) => {
    return Math.round((angle - MIN_ANGLE) / TOTAL_SWEEP * (TICK_COUNT - 1));
  };

  /** 메인 스레드 콜백 (runOnJS 경유) */
  const handleIntensityChange = useCallback((value: number) => {
    onIntensityChange(value);
    vocalXEngine.setIntensity(value);
  }, [onIntensityChange]);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ── 제스처 핸들러 ──────────────────────────────────────────────────────────
  /**
   * 드래그 → 원형 각도 계산 → 강도 업데이트
   *
   * 원리:
   *   드래그 시작점을 기준으로 각도 변화량(Δθ)을 계산
   *   atan2(y, x)로 절대 각도 구함
   */
  const gestureHandler = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    { startAngle: number; startRotation: number }
  >({
    onStart: (event, ctx) => {
      // 제스처 시작: 터치 위치의 다이얼 중심 대비 각도
      const dx = event.x - CENTER;
      const dy = event.y - CENTER;
      ctx.startAngle    = Math.atan2(dy, dx) * (180 / Math.PI);
      ctx.startRotation = rotation.value;
    },

    onActive: (event, ctx) => {
      // 현재 터치 각도
      const dx  = event.x - CENTER;
      const dy  = event.y - CENTER;
      const now = Math.atan2(dy, dx) * (180 / Math.PI);

      // 각도 변화량 → 회전값에 더함
      let delta = now - ctx.startAngle;
      // 각도 랩어라운드 처리 (-180~180 범위 유지)
      if (delta > 180)  delta -= 360;
      if (delta < -180) delta += 360;

      // 새 회전값 클램핑
      const newRotation = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE,
        ctx.startRotation + delta
      ));
      rotation.value = newRotation;

      // 강도 계산 + 엔진 업데이트
      const newIntensity = angleToIntensity(newRotation);
      runOnJS(handleIntensityChange)(newIntensity);

      // 눈금 위치 변경 시 햅틱
      const step = getTickStep(newRotation);
      if (step !== prevStep.current) {
        prevStep.current = step;
        runOnJS(triggerHaptic)();
      }
    },

    onEnd: () => {
      // 스프링으로 가장 가까운 눈금에 스냅
      const step = getTickStep(rotation.value);
      const snapAngle = MIN_ANGLE + (step / (TICK_COUNT - 1)) * TOTAL_SWEEP;
      rotation.value = withSpring(snapAngle, {
        damping: 20,
        stiffness: 300,
      });
      const snappedIntensity = angleToIntensity(snapAngle);
      runOnJS(handleIntensityChange)(snappedIntensity);
    },
  });

  // ── 애니메이션 스타일 ─────────────────────────────────────────────────────
  const dialContainerStyle = useAnimatedStyle(() => ({
    // 다이얼 전체 컨테이너는 움직이지 않음 (SVG 내부에서 포인터만 회전)
  }));

  return (
    <View style={styles.container}>

      {/* 필터 레이블 (다이얼 위) */}
      <View style={styles.filterLabel}>
        <View style={[styles.filterBadge, { backgroundColor: activeFilter.color + '33' }]}>
          <Text style={[styles.filterBadgeText, { color: activeFilter.glowColor }]}>
            {activeFilter.nameKo}
          </Text>
        </View>
        <Text style={styles.filterTagline}>{activeFilter.tagline}</Text>
      </View>

      {/* 다이얼 본체 */}
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View style={[styles.dialWrapper, dialContainerStyle]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onFilterPress}
            style={styles.dialTouchArea}
          >
            <DialFace
              rotationDeg={rotation.value}   // 포인터 각도
              activeColor={activeFilter.color}
              glowColor={activeFilter.glowColor}
              filterName={activeFilter.name}
              intensityPct={intensityPct}
            />
          </TouchableOpacity>
        </Animated.View>
      </PanGestureHandler>

      {/* 강도 레이블 (다이얼 양옆) */}
      <View style={styles.intensityLabels}>
        <Text style={styles.intensityLabelL}>MIN</Text>
        <Text style={styles.intensityLabelR}>MAX</Text>
      </View>

      {/* 지연 시간 표시 */}
      {latencyMs !== undefined && (
        <View style={styles.latencyBadge}>
          <Text style={styles.latencyText}>
            ⚡ {latencyMs.toFixed(1)}ms
          </Text>
        </View>
      )}

    </View>
  );
};

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },

  filterLabel: {
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  filterBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 0, // SSOLAP: 각진 모서리
    borderWidth: 1,
    borderColor: '#2A2A3A',
  },
  filterBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  filterTagline: {
    fontSize: 11,
    color: '#4A4A5A',
    letterSpacing: 1,
  },

  dialWrapper: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
  },
  dialTouchArea: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  intensityLabels: {
    flexDirection: 'row',
    width: DIAL_SIZE,
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  intensityLabelL: {
    fontSize: 9,
    color: '#3A3A4A',
    letterSpacing: 2,
  },
  intensityLabelR: {
    fontSize: 9,
    color: '#3A3A4A',
    letterSpacing: 2,
  },

  latencyBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#0A1A0A',
    borderWidth: 1,
    borderColor: '#1A3A1A',
  },
  latencyText: {
    fontSize: 10,
    color: '#3A7A3A',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
});

export default VocalDial;
