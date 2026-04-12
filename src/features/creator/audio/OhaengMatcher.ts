/**
 * OhaengMatcher.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 사주 오행(五行) → Vocal-X 사운드 자동 매칭
 *
 * 오행 원리:
 *   金(금): 단단함, 명징함, 차가운 빛
 *   木(목): 성장, 부드러움, 생동감
 *   水(수): 깊이, 유동성, 신비
 *   火(화): 에너지, 열정, 강렬함
 *   土(토): 중후함, 안정, 포용
 *
 * 각 오행이 보완 또는 강화하는 소리의 성질:
 *   금(金) → 고역 명징함 강화  → Vocal Chrome + Clarity Booster
 *   목(木) → 자연스러운 배음   → Nebula Echo (부드러운 잔향)
 *   수(水) → 깊고 유동적       → Nebula Echo (깊은 리버브)
 *   화(火) → 에너지 풍부       → Overdrive + 배음 강화
 *   토(土) → 묵직한 중역       → Deep Oracle (저역 강화)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FilterId, FILTER_ID } from './FilterPresets';

// ─── 오행 타입 ───────────────────────────────────────────────────────────────
export type OhaengElement = '금' | '목' | '수' | '화' | '토';

/** 오행 매칭 결과 */
export interface OhaengMatch {
  element: OhaengElement;
  recommendedFilter: FilterId;   // 추천 필터 (알림용, 강제 변경 아님)
  workletMode: string;           // 워크렛 오행 부스트 모드
  description: string;           // 사용자에게 보여줄 설명
  soundCharacter: string;        // 사운드 특성 키워드
  dspAdjustment: {
    eqLow?: number;    // 저역 조정 (dB)
    eqMid?: number;    // 중역 조정 (dB)
    eqHigh?: number;   // 고역 조정 (dB)
    saturation?: number; // 고조파 포화도 (0~1)
    reverbMix?: number;  // 리버브 혼합 비율 (0~1)
  };
}

// ─── 오행 매칭 테이블 ──────────────────────────────────────────────────────────
const OHAENG_TABLE: Record<OhaengElement, OhaengMatch> = {

  // ── 金 (금) — 차갑고 명징한 금속 ──────────────────────────────────────────
  '금': {
    element: '금',
    recommendedFilter: FILTER_ID.CHROME,  // Vocal Chrome과 찰떡
    workletMode: 'gold',
    description: '금(金)의 기운: 목소리에 날카롭고 투명한 빛을 더합니다',
    soundCharacter: '명징 · 투명 · 날카로운 공명',
    dspAdjustment: {
      eqHigh: 3.5,    // 고역 +3.5dB (금속의 빛남)
      eqMid:  1,      // 중역 약간 강화 (존재감)
      eqLow:  -1,     // 저역 약간 감쇠 (무게 제거 → 더 날카롭게)
      saturation: 0.1, // 미세한 배음 추가
    },
  },

  // ── 木 (목) — 부드럽고 자연스러운 생동감 ──────────────────────────────────
  '목': {
    element: '목',
    recommendedFilter: FILTER_ID.NEBULA,
    workletMode: 'wood',
    description: '목(木)의 기운: 목소리에 자연스럽고 따뜻한 생동감을 불어넣습니다',
    soundCharacter: '온화 · 자연스러운 배음 · 생기',
    dspAdjustment: {
      eqMid:  2.5,    // 중역 강화 (목소리 자연스러운 존재감)
      eqHigh: 1.5,    // 고역 약간 (공기감 추가)
      eqLow:  1,      // 저역 약간 (따뜻함)
      saturation: 0.15,
    },
  },

  // ── 水 (수) — 깊고 신비로운 유동성 ────────────────────────────────────────
  '수': {
    element: '수',
    recommendedFilter: FILTER_ID.NEBULA,  // 깊은 리버브와 궁합 최고
    workletMode: 'water',
    description: '수(水)의 기운: 목소리에 깊고 신비로운 울림을 더합니다',
    soundCharacter: '깊이 · 유동성 · 신비로운 잔향',
    dspAdjustment: {
      eqLow:  2,      // 저역 강화 (깊이감)
      eqMid:  0,      // 중역 유지
      eqHigh: -1.5,   // 고역 감쇠 (신비감, 흐릿한 끝처리)
      reverbMix: 0.25, // 잔향 +25% (유동성 표현)
    },
  },

  // ── 火 (화) — 뜨겁고 에너지 넘치는 강렬함 ─────────────────────────────────
  '화': {
    element: '화',
    recommendedFilter: FILTER_ID.ORACLE, // Deep Oracle의 웜 오버드라이브
    workletMode: 'fire',
    description: '화(火)의 기운: 목소리에 타오르는 에너지와 배음을 더합니다',
    soundCharacter: '에너지 · 배음 풍부 · 따뜻한 왜곡',
    dspAdjustment: {
      eqLow:  3,      // 저역 강화 (화의 힘)
      eqMid:  3,      // 중역 강화 (전달력)
      eqHigh: 2,      // 고역 강화 (에너지 방출)
      saturation: 0.3, // 배음 풍부하게 (Overdrive)
    },
  },

  // ── 土 (토) — 묵직하고 안정적인 중후함 ────────────────────────────────────
  '토': {
    element: '토',
    recommendedFilter: FILTER_ID.ORACLE, // Deep Oracle의 무게감
    workletMode: 'earth',
    description: '토(土)의 기운: 목소리에 깊은 안정감과 포용력을 더합니다',
    soundCharacter: '중후함 · 안정 · 포용적 울림',
    dspAdjustment: {
      eqLow:  5,      // 저역 강화 (땅의 무게)
      eqMid:  3,      // 중역 강화 (인간적 온기)
      eqHigh: -1,     // 고역 약간 감쇠 (차분함)
      saturation: 0.2,
    },
  },
};

// ─── 오행 매처 클래스 ─────────────────────────────────────────────────────────
export class OhaengMatcher {

  /**
   * 오행 요소 → 사운드 매칭 결과 반환
   * @param element 사주 오행 분석 결과
   */
  static match(element: OhaengElement): OhaengMatch {
    return OHAENG_TABLE[element];
  }

  /**
   * 복수 오행 → 우세 원소 결정 (사주는 보통 4개 기둥)
   * @param counts 각 오행의 개수 (사주 분석 결과)
   * @returns 가장 부족한 원소 (보완 원리) 또는 가장 많은 원소 (강화 원리)
   */
  static matchFromCounts(
    counts: Record<OhaengElement, number>,
    mode: 'boost' | 'supplement' = 'supplement' // 강화 vs 보완
  ): OhaengMatch {
    const entries = Object.entries(counts) as [OhaengElement, number][];

    if (mode === 'supplement') {
      // 보완 모드: 가장 부족한 오행을 채워줌 (균형 원리)
      const weakest = entries.reduce((a, b) => a[1] <= b[1] ? a : b)[0];
      return OHAENG_TABLE[weakest];
    } else {
      // 강화 모드: 가장 강한 오행을 더 키움
      const strongest = entries.reduce((a, b) => a[1] >= b[1] ? a : b)[0];
      return OHAENG_TABLE[strongest];
    }
  }

  /**
   * 현재 활성 필터 + 오행 보완을 합성한 설명 텍스트
   * Vocal Dial 하단 정보 카드에 표시
   */
  static getComboDescription(element: OhaengElement, activeFilter: string): string {
    const match = OHAENG_TABLE[element];
    return [
      `${match.element}(${match.element}) 기운 활성`,
      `› ${match.soundCharacter}`,
      `› ${match.description}`,
      `› 현재 필터 [${activeFilter}]와 시너지 중`,
    ].join('\n');
  }
}

// ─── Five Elements Sound — 오행 사운드 라인업 UI 데이터 ──────────────────────
export const FIVE_ELEMENTS_UI = [
  {
    element: '금' as OhaengElement,
    symbol: '金',
    color: '#C0C0C0',       // 실버 (金 = 금속)
    glowColor: '#E0E8F0',
    label: '金 — 명징',
  },
  {
    element: '목' as OhaengElement,
    symbol: '木',
    color: '#2D7A2D',        // 포레스트 그린
    glowColor: '#4CAF50',
    label: '木 — 생동',
  },
  {
    element: '수' as OhaengElement,
    symbol: '水',
    color: '#1A3A5C',        // 딥 블루
    glowColor: '#4A90D9',
    label: '水 — 신비',
  },
  {
    element: '화' as OhaengElement,
    symbol: '火',
    color: '#5C1A00',        // 다크 레드
    glowColor: '#FF4500',
    label: '火 — 에너지',
  },
  {
    element: '토' as OhaengElement,
    symbol: '土',
    color: '#3A2E1A',        // 어스 브라운
    glowColor: '#8B6914',
    label: '土 — 중후',
  },
];
