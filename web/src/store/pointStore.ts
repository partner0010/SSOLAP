/**
 * pointStore.ts — S포인트 상태 관리 (Zustand)
 */
import { create } from 'zustand';
import { api } from '@/lib/api';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface PointBalance {
  balance:       number;
  total_earned:  number;
  total_spent:   number;
  earned_today:  number;
  daily_cap:     number;
  remaining_cap: number;
}

interface PointTransaction {
  id:            number;
  action:        string;
  amount:        number;
  balance_after: number;
  description:   string | null;
  created_at:    string;
}

interface PointState {
  balance:      PointBalance | null;
  transactions: PointTransaction[];
  total:        number;
  page:         number;
  hasNext:      boolean;
  isLoading:    boolean;
  isCheckinLoading: boolean;

  // 액션
  fetchBalance:  () => Promise<void>;
  fetchHistory:  (reset?: boolean) => Promise<void>;
  checkin:       () => Promise<{ rewarded: number; already: boolean }>;
  reset:         () => void;
}

const PER_PAGE = 30;

// 액션 한국어 라벨
export const ACTION_LABELS: Record<string, string> = {
  daily_checkin:    '출석 체크인',
  post_create:      '게시물 작성',
  comment_create:   '댓글 작성',
  like_milestone:   '좋아요 이정표',
  purchase:         '포인트 구매',
  spend_room_entry: '채팅방 입장',
  spend_boost:      '게시물 부스트',
  admin_grant:      '관리자 지급',
  admin_deduct:     '관리자 차감',
};

export const usePointStore = create<PointState>((set, get) => ({
  balance:      null,
  transactions: [],
  total:        0,
  page:         1,
  hasNext:      false,
  isLoading:    false,
  isCheckinLoading: false,

  // ── 잔액 조회 ────────────────────────────────────────────────────────
  fetchBalance: async () => {
    set({ isLoading: true });
    try {
      const balance = await api.get<PointBalance>('/points/balance');
      set({ balance });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── 거래 내역 조회 ───────────────────────────────────────────────────
  fetchHistory: async (reset = true) => {
    const { page, isLoading } = get();
    if (isLoading) return;

    const nextPage = reset ? 1 : page + 1;
    set({ isLoading: true });

    try {
      const data = await api.get<{
        transactions: PointTransaction[];
        total: number;
        page: number;
        has_next: boolean;
      }>(`/points/history?page=${nextPage}&per_page=${PER_PAGE}`);

      set({
        transactions: reset ? data.transactions : [...get().transactions, ...data.transactions],
        total:   data.total,
        page:    nextPage,
        hasNext: data.has_next,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── 출석 체크인 ──────────────────────────────────────────────────────
  checkin: async () => {
    set({ isCheckinLoading: true });
    try {
      const result = await api.post<{
        already_checked_in: boolean;
        rewarded: number;
        balance: number;
        next_checkin_at: string;
      }>('/points/checkin');

      // 잔액 업데이트
      const current = get().balance;
      if (current && !result.already_checked_in) {
        set({
          balance: {
            ...current,
            balance:      result.balance,
            earned_today: current.earned_today + result.rewarded,
            remaining_cap: Math.max(0, current.remaining_cap - result.rewarded),
          },
        });
      }

      return {
        rewarded: result.rewarded,
        already:  result.already_checked_in,
      };
    } finally {
      set({ isCheckinLoading: false });
    }
  },

  // ── 스토어 초기화 ────────────────────────────────────────────────────
  reset: () => {
    set({
      balance: null, transactions: [], total: 0,
      page: 1, hasNext: false, isLoading: false,
    });
  },
}));
