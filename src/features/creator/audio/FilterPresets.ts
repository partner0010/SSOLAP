/**
 * FilterPresets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vocal-X 시그니처 필터 프리셋 정의
 *
 * 각 필터의 시각 디자인 정보(색상, 아이콘)와
 * DSP 파라미터 설명을 함께 관리한다.
 *
 * 색상 기준: SSOLAP 하이엔드 다크 미학
 *   - Vocal Chrome: #8EA4BC (차가운 실버)
 *   - Nebula Echo:  #4A3F7A (딥 퍼플)
 *   - Deep Oracle:  #2A3A2A (다크 그린)
 *   - Glitch:       #00FF41 (매트릭스 그린)
 *   - Dark Chrome:  #1A1A2E (익명의 다크네이비)
 *   - Duet AI:      #FFD700 (골드 — 조화)
 *   - Space Synth:  #0D0D2B (딥 스페이스 네이비)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── 필터 ID 상수 ─────────────────────────────────────────────────────────────
export const FILTER_ID = {
  BYPASS:     'bypass',       // 원음 그대로
  CHROME:     'chrome',       // Vocal Chrome — 메탈릭
  NEBULA:     'nebula',       // Nebula Echo — 우주
  ORACLE:     'oracle',       // Deep Oracle — 권위
  GLITCH:     'glitch',       // Cybernetic Glitch — 사이버펑크
  DARK_CHROME:'darkchrome',   // Dark Chrome — 익명 보호
  DUET_AI:    'duet_ai',      // 듀엣 AI — 자동 화음
  SPACE:      'space',        // 장소 변환 — 공간음 합성
} as const;

export type FilterId = typeof FILTER_ID[keyof typeof FILTER_ID];

// ─── Space Synth 장소 프리셋 ──────────────────────────────────────────────────
export type SpacePreset = 'cathedral' | 'iron_tunnel' | 'rainy_cafe' | 'void' | 'stadium';

// ─── 필터 프리셋 타입 ──────────────────────────────────────────────────────────
export interface FilterPreset {
  id: FilterId;
  name: string;              // 표시 이름 (한/영)
  nameKo: string;
  tagline: string;           // 한 줄 설명 (UI 서브텍스트)
  color: string;             // 다이얼/배지 색상 (HEX)
  glowColor: string;         // 활성 상태 글로우 색상
  icon: string;              // 아이콘 이름 (react-native-vector-icons)
  isPremium: boolean;        // 프리미엄 필터 여부

  // DSP 파라미터 (WorkletNode에 전달)
  dspParams: {
    workletMode: string;     // 워크렛 내부 모드 이름
    intensity: number;       // 기본 강도 (0~1)
    ringFreq?: number;       // 링 모듈레이터 주파수
    reverbDecay?: number;    // 리버브 감쇠 (초)
    delayTaps?: Array<{ ms: number; gain: number }>;
    combDelay?: number;      // 콤 필터 딜레이 (ms)
    pitchSemitones?: number; // 피치 이동 (반음)
    glitchProb?: number;     // 글리치 확률
    eqLow?: number;          // 저역 이득 (dB)
    eqMid?: number;          // 중역 이득 (dB)
    eqHigh?: number;         // 고역 이득 (dB)
  };

  // 보너스 필터용
  spacePreset?: SpacePreset;
}

// ─── 시그니처 필터 프리셋 정의 ────────────────────────────────────────────────
export const FILTER_PRESETS: Record<FilterId, FilterPreset> = {

  // ── Bypass (원음) ──────────────────────────────────────────────────────────
  [FILTER_ID.BYPASS]: {
    id: FILTER_ID.BYPASS,
    name: 'Original',
    nameKo: '원음',
    tagline: '있는 그대로의 목소리',
    color: '#4A4A5A',
    glowColor: '#6A6A7A',
    icon: 'microphone',
    isPremium: false,
    dspParams: { workletMode: 'bypass', intensity: 0 },
  },

  // ── [1] Vocal Chrome ──────────────────────────────────────────────────────
  // 차가운 금속성 공명 — 수은 필터의 청각 버전
  [FILTER_ID.CHROME]: {
    id: FILTER_ID.CHROME,
    name: 'Vocal Chrome',
    nameKo: '보컬 크롬',
    tagline: '차가운 금속이 목소리를 감싸다',
    color: '#8EA4BC',      // 차가운 실버블루
    glowColor: '#B0C4DE',  // 라이트스틸블루 글로우
    icon: 'diamond',
    isPremium: false,      // 기본 제공 시그니처

    dspParams: {
      workletMode: 'chrome',
      intensity: 0.85,
      // 콤 필터 3개로 배음 구조 형성
      combDelay: 2.1,       // ms (주 콤 필터)
      ringFreq: 280,        // Hz 링 변조 (수은 공진)
      eqHigh: 4.5,          // 고역 +4.5dB (금속 빛남)
      eqLow: -2,            // 저역 -2dB (가볍고 차갑게)
      reverbDecay: 0.35,    // 0.35초 짧은 금속 잔향
    },
  },

  // ── [2] Nebula Echo ────────────────────────────────────────────────────────
  // 우주 공간의 몽환적 에코
  [FILTER_ID.NEBULA]: {
    id: FILTER_ID.NEBULA,
    name: 'Nebula Echo',
    nameKo: '네뷸라 에코',
    tagline: '은하 저편에서 울려오는 목소리',
    color: '#4A3F7A',      // 딥 퍼플
    glowColor: '#7B68EE',  // 미디엄 슬레이트블루 글로우
    icon: 'star',
    isPremium: false,

    dspParams: {
      workletMode: 'nebula',
      intensity: 0.9,
      // 4개 딜레이 탭 — 먼 우주 에코 시뮬레이션
      delayTaps: [
        { ms: 180, gain: 0.50 },
        { ms: 340, gain: 0.35 },
        { ms: 520, gain: 0.20 },
        { ms: 780, gain: 0.10 },
      ],
      reverbDecay: 3.5,    // 3.5초 긴 잔향 (우주 공간)
      eqHigh: -4,          // 고역 감쇠 (먼 거리에서 고주파 손실)
      eqLow: -1,           // 저역 약간 감쇠
    },
  },

  // ── [3] Deep Oracle ────────────────────────────────────────────────────────
  // 신탁자 목소리 — 포먼트 시프팅 + 서브 하모닉
  [FILTER_ID.ORACLE]: {
    id: FILTER_ID.ORACLE,
    name: 'Deep Oracle',
    nameKo: '딥 오라클',
    tagline: '신의 목소리. 그 무게를 담다',
    color: '#1A2E1A',      // 다크 포레스트 그린
    glowColor: '#3D7A3D',  // 포레스트 그린 글로우
    icon: 'eye',
    isPremium: true,       // 프리미엄 전용

    dspParams: {
      workletMode: 'oracle',
      intensity: 0.9,
      pitchSemitones: -3,  // 3반음 하강 (성량은 유지, 무게감 추가)
      eqLow: 8,            // 저역 +8dB (묵직함)
      eqMid: 2,            // 중역 +2dB (명확성 유지)
      eqHigh: -3,          // 고역 -3dB (차갑고 어두운 질감)
      reverbDecay: 1.5,    // 1.5초 중간 잔향 (큰 공간)
    },
  },

  // ── [4] Cybernetic Glitch ──────────────────────────────────────────────────
  // 해킹된 안드로이드 — 그레뉼러 + 비트크러셔
  [FILTER_ID.GLITCH]: {
    id: FILTER_ID.GLITCH,
    name: 'Cybernetic Glitch',
    nameKo: '사이버네틱 글리치',
    tagline: 'SYSTEM ERROR: VOICE_CORRUPTED',
    color: '#001A00',      // 매트릭스 다크 그린
    glowColor: '#00FF41',  // 매트릭스 그린 글로우 (네온)
    icon: 'code-braces',
    isPremium: true,

    dspParams: {
      workletMode: 'glitch',
      intensity: 0.8,
      glitchProb: 0.04,    // 4% 확률로 글리치 발생 (너무 많으면 듣기 불편)
      eqMid: -2,           // 중역 약간 감쇠 (디지털 질감)
      eqHigh: 3,           // 고역 강화 (치직거리는 디지털 노이즈)
    },
  },

  // ── [Bonus 1] Dark Chrome ──────────────────────────────────────────────────
  // 익명성 보호 — 원래 목소리 완전 변조
  [FILTER_ID.DARK_CHROME]: {
    id: FILTER_ID.DARK_CHROME,
    name: 'Dark Chrome',
    nameKo: '다크 크롬',
    tagline: '누구도 당신의 목소리를 알아볼 수 없다',
    color: '#0A0A1A',      // 다크 네이비
    glowColor: '#2A2A5A',  // 딥 블루 글로우
    icon: 'shield-lock',
    isPremium: false,      // 제보/익명 기능 — 무료 제공 (사회적 가치)

    dspParams: {
      workletMode: 'darkchrome',
      intensity: 1.0,      // 강도 100% 고정 (보호 목적)
      pitchSemitones: -2,
      ringFreq: 340,       // 더 강한 금속 변조
      reverbDecay: 0.8,
      eqLow: 4,            // 저역 강화 (원래 목소리 패턴 은폐)
      eqHigh: -1,
    },
  },

  // ── [Bonus 2] Duet AI ─────────────────────────────────────────────────────
  // 자동 화음 생성 — 혼자서 합창단
  [FILTER_ID.DUET_AI]: {
    id: FILTER_ID.DUET_AI,
    name: 'Duet AI',
    nameKo: '듀엣 AI',
    tagline: '혼자이지만, 함께 노래한다',
    color: '#2A1A00',      // 다크 앰버
    glowColor: '#FFD700',  // 골드 글로우
    icon: 'music-note-plus',
    isPremium: true,

    dspParams: {
      workletMode: 'bypass', // 원음은 그대로 + DuetAI가 화음 레이어 추가
      intensity: 0.7,
    },
  },

  // ── [Bonus 3] Space Synth ─────────────────────────────────────────────────
  // 장소 변환 — 공간 임펄스 응답 합성
  [FILTER_ID.SPACE]: {
    id: FILTER_ID.SPACE,
    name: 'Space Synth',
    nameKo: '스페이스 신스',
    tagline: '당신이 어디에 있든, 공간을 창조한다',
    color: '#000D1A',      // 딥 스페이스 블랙
    glowColor: '#003366',  // 딥 블루 글로우
    icon: 'earth',
    isPremium: false,
    spacePreset: 'cathedral', // 기본 장소: 대성당

    dspParams: {
      workletMode: 'bypass',
      intensity: 0.75,
    },
  },
};

// ─── 필터 목록 (UI 렌더링용) ─────────────────────────────────────────────────
export const FILTER_LIST: FilterPreset[] = Object.values(FILTER_PRESETS);

/** 무료 필터만 */
export const FREE_FILTERS = FILTER_LIST.filter(f => !f.isPremium);
/** 프리미엄 필터만 */
export const PREMIUM_FILTERS = FILTER_LIST.filter(f => f.isPremium);
