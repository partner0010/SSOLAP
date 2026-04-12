/**
 * VocalXScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Vocal-X 오디오 변조 엔진 메인 화면
 *
 * 레이아웃:
 *   ┌──────────────────────────────┐
 *   │  VOCAL-X            [닫기]   │  ← 헤더
 *   │                              │
 *   │  ~~~~액체금속파형~~~~~        │  ← LiquidWaveVisualizer
 *   │                              │
 *   │  [필터 카드 가로 스크롤]       │  ← FilterCarousel
 *   │  Chrome | Nebula | Oracle... │
 *   │                              │
 *   │       [메탈 다이얼]           │  ← VocalDial
 *   │                              │
 *   │  [오행 사운드 5버튼]           │  ← OhaengSelector
 *   │  金  木  水  火  土           │
 *   │                              │
 *   │  [보너스: Space Synth 바]     │  ← SpacePresetBar
 *   │  ⛪ 🚇 ☕ 🌌 🏟️             │
 *   │                              │
 *   │         [● REC]              │  ← 녹음/영상 적용 버튼
 *   └──────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { vocalXEngine, WaveformData, VocalXMetrics } from './audio/VocalXEngine';
import {
  FILTER_PRESETS,
  FILTER_LIST,
  FILTER_ID,
  FilterId,
  FilterPreset,
  SPACE_PRESETS_LIST,
  SpacePreset,
} from './audio/FilterPresets';
import { OhaengMatcher, OhaengElement, FIVE_ELEMENTS_UI } from './audio/OhaengMatcher';
import { VocalDial } from './ui/VocalDial';
import { LiquidWaveVisualizer } from './ui/LiquidWaveVisualizer';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── 필터 카드 컴포넌트 ───────────────────────────────────────────────────────
interface FilterCardProps {
  preset: FilterPreset;
  isActive: boolean;
  onPress: () => void;
}

const FilterCard: React.FC<FilterCardProps> = ({ preset, isActive, onPress }) => (
  <TouchableOpacity
    style={[
      styles.filterCard,
      isActive && { borderColor: preset.color, backgroundColor: preset.color + '15' },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    {/* 프리미엄 뱃지 */}
    {preset.isPremium && (
      <View style={[styles.premiumBadge, { backgroundColor: preset.color + '33' }]}>
        <Text style={[styles.premiumText, { color: preset.color }]}>PRO</Text>
      </View>
    )}

    {/* 활성 글로우 표시 */}
    {isActive && (
      <View style={[styles.activeGlow, { backgroundColor: preset.glowColor + '30' }]} />
    )}

    {/* 필터 이름 */}
    <Text style={[
      styles.filterCardName,
      { color: isActive ? preset.glowColor : '#5A5A6A' },
    ]}>
      {preset.nameKo}
    </Text>
    <Text style={styles.filterCardEn}>{preset.name}</Text>

    {/* 활성 점 인디케이터 */}
    {isActive && (
      <View style={[styles.activeDot, { backgroundColor: preset.color }]} />
    )}
  </TouchableOpacity>
);

// ─── 오행 버튼 컴포넌트 ───────────────────────────────────────────────────────
interface OhaengButtonProps {
  element: typeof FIVE_ELEMENTS_UI[0];
  isActive: boolean;
  onPress: () => void;
}

const OhaengButton: React.FC<OhaengButtonProps> = ({ element, isActive, onPress }) => (
  <TouchableOpacity
    style={[
      styles.ohaengButton,
      isActive && { borderColor: element.glowColor, backgroundColor: element.color + '20' },
    ]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={[styles.ohaengSymbol, { color: isActive ? element.glowColor : '#4A4A5A' }]}>
      {element.symbol}
    </Text>
    <Text style={[styles.ohaengLabel, { color: isActive ? element.color : '#3A3A4A' }]}>
      {element.label.split(' — ')[1]}
    </Text>
  </TouchableOpacity>
);

// ─── 메인 화면 ────────────────────────────────────────────────────────────────
interface VocalXScreenProps {
  onClose: () => void;
  initialOhaeng?: OhaengElement; // 사주 분석에서 자동 전달
}

export const VocalXScreen: React.FC<VocalXScreenProps> = ({
  onClose,
  initialOhaeng,
}) => {
  // ── 상태 ─────────────────────────────────────────────────────────────────
  const [engineState, setEngineState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeFilter, setActiveFilter]   = useState<FilterId>(FILTER_ID.CHROME);
  const [filterIntensity, setFilterIntensity] = useState(0.8);
  const [activeOhaeng, setActiveOhaeng]   = useState<OhaengElement | null>(initialOhaeng ?? null);
  const [activeSpace, setActiveSpace]     = useState<SpacePreset | null>(null);
  const [metrics, setMetrics]             = useState<VocalXMetrics | null>(null);
  const [waveformData, setWaveformData]   = useState<WaveformData | null>(null);
  const [isMuted, setIsMuted]             = useState(false);

  // 파형 업데이트 루프
  const waveformInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 엔진 초기화 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await vocalXEngine.initialize();

        // 초기 필터 적용
        vocalXEngine.setFilter(FILTER_ID.CHROME);

        // 사주 오행 자동 매칭
        if (initialOhaeng) {
          vocalXEngine.setOhaengElement(initialOhaeng);
        }

        // 메트릭 콜백
        vocalXEngine.setOnMetricsUpdate((m) => setMetrics(m));

        // 파형 60fps 업데이트 루프
        waveformInterval.current = setInterval(() => {
          const data = vocalXEngine.getWaveformData();
          if (data) setWaveformData(data);
        }, 16); // ~60fps

        setEngineState('ready');
      } catch (err) {
        console.error('[VocalXScreen] Engine init error:', err);
        setEngineState('error');
        Alert.alert('마이크 접근 오류', '마이크 권한을 허용해주세요.');
      }
    };

    init();

    return () => {
      // 화면 나갈 때 엔진 정리
      if (waveformInterval.current) clearInterval(waveformInterval.current);
      vocalXEngine.destroy();
    };
  }, []);

  // ── 이벤트 핸들러 ─────────────────────────────────────────────────────────

  const handleFilterSelect = useCallback((filterId: FilterId) => {
    setActiveFilter(filterId);
    vocalXEngine.setFilter(filterId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleIntensityChange = useCallback((value: number) => {
    setFilterIntensity(value);
    // vocalXEngine.setIntensity는 VocalDial 내부에서 직접 호출
  }, []);

  const handleOhaengSelect = useCallback((element: OhaengElement) => {
    if (activeOhaeng === element) {
      // 이미 선택된 오행 재탭 → 해제
      setActiveOhaeng(null);
      vocalXEngine.setOhaengElement('금'); // reset to default
    } else {
      setActiveOhaeng(element);
      vocalXEngine.setOhaengElement(element);
      const match = OhaengMatcher.match(element);
      // 오행 추천 필터 알림 (강제 변경 아님)
      console.log(`추천 필터: ${match.recommendedFilter}`);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeOhaeng]);

  const handleSpaceSelect = useCallback((preset: SpacePreset) => {
    if (activeSpace === preset) {
      setActiveSpace(null);
      setActiveFilter(FILTER_ID.CHROME); // 기본 필터로 복귀
      vocalXEngine.setFilter(FILTER_ID.CHROME);
    } else {
      setActiveSpace(preset);
      setActiveFilter(FILTER_ID.SPACE);
      vocalXEngine.setFilter(FILTER_ID.SPACE);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeSpace]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => !prev);
    vocalXEngine.toggleMute();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  // ── 렌더링 ───────────────────────────────────────────────────────────────

  const activePreset = FILTER_PRESETS[activeFilter];

  if (engineState === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8EA4BC" />
        <Text style={styles.loadingText}>VOCAL-X 초기화 중...</Text>
        <Text style={styles.loadingSubtext}>오디오 엔진 로딩</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>

      {/* ── 헤더 ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>VOCAL-X</Text>
          {metrics && (
            <Text style={styles.headerLatency}>
              ⚡ {metrics.latencyMs.toFixed(1)}ms
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleMuteToggle} style={styles.muteButton}>
          <Text style={[styles.muteIcon, isMuted && styles.muteIconActive]}>
            {isMuted ? '🔇' : '🎙️'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── 액체금속 파형 시각화 ────────────────────────────────────── */}
        <LiquidWaveVisualizer
          waveformData={waveformData}
          activeColor={activePreset.glowColor}
          isActive={!isMuted && engineState === 'ready'}
          height={110}
        />

        {/* ── VU 미터 (레벨 바) ──────────────────────────────────────── */}
        {metrics && (
          <View style={styles.vuMeter}>
            <View style={styles.vuLabel}>
              <Text style={styles.vuText}>IN</Text>
            </View>
            <View style={styles.vuBar}>
              <View style={[
                styles.vuFill,
                { width: `${metrics.inputLevel * 100}%`, backgroundColor: activePreset.color }
              ]} />
            </View>
            <View style={styles.vuLabel}>
              <Text style={styles.vuText}>OUT</Text>
            </View>
            <View style={styles.vuBar}>
              <View style={[
                styles.vuFill,
                {
                  width: `${metrics.outputLevel * 100}%`,
                  backgroundColor: activePreset.glowColor,
                }
              ]} />
            </View>
          </View>
        )}

        {/* ── 필터 카드 가로 스크롤 ─────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>FILTERS</Text>
          <View style={styles.sectionLine} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTER_LIST.map(preset => (
            <FilterCard
              key={preset.id}
              preset={preset}
              isActive={activeFilter === preset.id}
              onPress={() => handleFilterSelect(preset.id)}
            />
          ))}
        </ScrollView>

        {/* ── 메탈 다이얼 ──────────────────────────────────────────── */}
        <VocalDial
          activeFilter={activePreset}
          intensity={filterIntensity}
          onIntensityChange={handleIntensityChange}
          onFilterPress={() => {}} // 필터 모달 (추후 구현)
          latencyMs={metrics?.latencyMs}
        />

        {/* 오행 설명 카드 */}
        {activeOhaeng && (
          <View style={styles.ohaengCard}>
            <Text style={styles.ohaengCardText}>
              {OhaengMatcher.getComboDescription(activeOhaeng, activePreset.nameKo)}
            </Text>
          </View>
        )}

        {/* ── 오행 사운드 셀렉터 ────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>오행 사운드 — 五行</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.ohaengRow}>
          {FIVE_ELEMENTS_UI.map(el => (
            <OhaengButton
              key={el.element}
              element={el}
              isActive={activeOhaeng === el.element}
              onPress={() => handleOhaengSelect(el.element)}
            />
          ))}
        </View>

        {/* ── Space Synth 장소 선택 바 ──────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SPACE SYNTH</Text>
          <View style={styles.sectionLine} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.spaceRow}
        >
          {SPACE_PRESETS_LIST.map(space => (
            <TouchableOpacity
              key={space.id}
              style={[
                styles.spaceCard,
                activeSpace === space.id && styles.spaceCardActive,
              ]}
              onPress={() => handleSpaceSelect(space.id)}
            >
              <Text style={styles.spaceEmoji}>{space.emoji}</Text>
              <Text style={[
                styles.spaceName,
                activeSpace === space.id && styles.spaceNameActive,
              ]}>
                {space.nameKo}
              </Text>
              <Text style={styles.spaceDecay}>{space.decaySec}s</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 여백 */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 하단 고정 버튼 ────────────────────────────────────────────── */}
      <View style={styles.bottomBar}>
        <View style={[styles.statusDot, {
          backgroundColor: isMuted ? '#3A3A4A' : activePreset.color
        }]} />
        <Text style={styles.statusText}>
          {isMuted ? '음소거 중' : `${activePreset.nameKo} 활성`}
        </Text>
        <TouchableOpacity
          style={[styles.applyButton, { borderColor: activePreset.color }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onClose();
          }}
        >
          <Text style={[styles.applyButtonText, { color: activePreset.color }]}>
            영상에 적용
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
};

// ─── 스타일 ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0A0A14',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0A0A14',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8EA4BC',
    fontSize: 16,
    letterSpacing: 3,
    fontWeight: '600',
  },
  loadingSubtext: {
    color: '#3A3A4A',
    fontSize: 11,
    letterSpacing: 2,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2A',
  },
  headerLeft: { flex: 1, gap: 2 },
  headerTitle: {
    color: '#8EA4BC',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 5,
  },
  headerLatency: {
    color: '#3A5A3A',
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  muteButton: { padding: 8, marginRight: 4 },
  muteIcon: { fontSize: 20 },
  muteIconActive: { opacity: 0.4 },
  closeButton: { padding: 8 },
  closeText: { color: '#5A5A6A', fontSize: 16 },

  scrollView: { flex: 1 },

  // VU 미터
  vuMeter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0F0F1A',
  },
  vuLabel: { width: 24 },
  vuText: { color: '#3A3A4A', fontSize: 9, letterSpacing: 1 },
  vuBar: {
    flex: 1, height: 4,
    backgroundColor: '#1A1A2A',
    overflow: 'hidden',
  },
  vuFill: { height: '100%', borderRadius: 0 },

  // 섹션 헤더
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
    gap: 10,
  },
  sectionTitle: {
    color: '#3A3A4A',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
  },
  sectionLine: {
    flex: 1, height: 1,
    backgroundColor: '#1A1A2A',
  },

  // 필터 카드
  filterScroll: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterCard: {
    width: 88,
    height: 80,
    backgroundColor: '#0F0F1A',
    borderWidth: 1,
    borderColor: '#1A1A2A',
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  premiumBadge: {
    position: 'absolute',
    top: 4, right: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  premiumText: {
    fontSize: 7, fontWeight: '800', letterSpacing: 1,
  },
  activeGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  filterCardName: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1, textAlign: 'center',
  },
  filterCardEn: {
    fontSize: 8, color: '#2A2A3A', letterSpacing: 0.5, textAlign: 'center',
  },
  activeDot: {
    width: 4, height: 4, borderRadius: 0,
    position: 'absolute', bottom: 6,
  },

  // 오행 버튼
  ohaengRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
  },
  ohaengButton: {
    flex: 1,
    height: 60,
    backgroundColor: '#0F0F1A',
    borderWidth: 1,
    borderColor: '#1A1A2A',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  ohaengSymbol: {
    fontSize: 18, fontWeight: '700',
  },
  ohaengLabel: {
    fontSize: 9, letterSpacing: 1,
  },

  // 오행 설명 카드
  ohaengCard: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#0F0F1A',
    borderLeftWidth: 2,
    borderLeftColor: '#3A5A3A',
  },
  ohaengCardText: {
    color: '#3A5A3A',
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },

  // Space Synth 카드
  spaceRow: {
    paddingHorizontal: 12,
    gap: 8,
  },
  spaceCard: {
    width: 72,
    height: 72,
    backgroundColor: '#0A0A1A',
    borderWidth: 1,
    borderColor: '#1A1A2A',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  spaceCardActive: {
    borderColor: '#2A4A7A',
    backgroundColor: '#0D0D2B',
  },
  spaceEmoji: { fontSize: 22 },
  spaceName: {
    fontSize: 9, color: '#3A3A4A', letterSpacing: 1, textAlign: 'center',
  },
  spaceNameActive: { color: '#4A7ABF' },
  spaceDecay: {
    fontSize: 8, color: '#2A2A3A', fontFamily: 'monospace',
  },

  // 하단 바
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1A1A2A',
    gap: 10,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 0,
  },
  statusText: {
    flex: 1, color: '#4A4A5A', fontSize: 12, letterSpacing: 1,
  },
  applyButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
  },
  applyButtonText: {
    fontSize: 12, fontWeight: '700', letterSpacing: 2,
  },
});

export default VocalXScreen;
