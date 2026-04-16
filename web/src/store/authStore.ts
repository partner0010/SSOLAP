/**
 * authStore.ts — 인증 상태 전역 관리 (Zustand)
 *
 * 관리 데이터:
 *   - 현재 로그인 유저 정보
 *   - 로그인/로그아웃/회원가입 액션
 *   - 인증 상태 초기화 (새로고침 시 쿠키에서 복원)
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api, setTokens, clearTokens, isAuthenticated } from '@/lib/api';
import type { User, LoginRequest, SignupRequest, AuthTokens } from '@/types';

// ─── 상태 타입 ────────────────────────────────────────────────────────────────
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isHydrated: boolean;  // persist 수화(hydration) 완료 여부

  // 액션
  login: (credentials: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
}

// ─── 스토어 ───────────────────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isHydrated: false,

      // ── 로그인 ────────────────────────────────────────────────────────
      login: async (credentials) => {
        set({ isLoading: true });
        try {
          // FastAPI OAuth2PasswordRequestForm: application/x-www-form-urlencoded 필수
          // FormData + 수동 Content-Type 지정 시 boundary 누락으로 파싱 실패
          const params = new URLSearchParams();
          params.append('username', credentials.username);
          params.append('password', credentials.password);

          const tokens = await api.post<AuthTokens>('/auth/login', params);

          setTokens(tokens.access_token, tokens.refresh_token);

          // 토큰 저장 후 내 정보 가져오기
          await get().fetchMe();
        } finally {
          set({ isLoading: false });
        }
      },

      // ── 회원가입 ──────────────────────────────────────────────────────
      signup: async (data) => {
        set({ isLoading: true });
        try {
          // 회원가입 후 자동 로그인
          await api.post('/auth/signup', data);
          await get().login({
            username: data.username,
            password: data.password,
          });
        } finally {
          set({ isLoading: false });
        }
      },

      // ── 로그아웃 ──────────────────────────────────────────────────────
      logout: () => {
        clearTokens();
        set({ user: null });
        // 서버 세션 무효화 (선택적 — 실패해도 로컬은 이미 정리됨)
        api.post('/auth/logout').catch(() => {});
      },

      // ── 내 정보 가져오기 ──────────────────────────────────────────────
      fetchMe: async () => {
        if (!isAuthenticated()) return;
        try {
          const user = await api.get<User>('/auth/me');
          set({ user });
        } catch {
          // 토큰이 유효하지 않으면 자동 로그아웃
          get().logout();
        }
      },

      // ── 부분 업데이트 ─────────────────────────────────────────────────
      updateUser: (partial) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...partial } });
        }
      },
    }),

    {
      name: 'ssolap-auth',
      storage: createJSONStorage(() => localStorage),
      // localStorage 저장 범위 최소화 (개인정보보호 원칙)
      // - email, role 제외 (XSS 탈취 시 노출 최소화)
      // - 토큰은 쿠키에만 저장, 여기서는 제외
      // - password는 절대 저장 안 함
      partialize: (state) => ({
        user: state.user ? {
          id:           state.user.id,
          username:     state.user.username,
          display_name: state.user.display_name,
          avatar_url:   state.user.avatar_url,
          role:         state.user.role,
          point_balance: state.user.point_balance,
          badge:         state.user.badge,
          badge_expires_at: state.user.badge_expires_at,
        } : null,
      }),
      onRehydrateStorage: () => (state) => {
        // 새로고침 시: localStorage에서 user 복원 후 서버에서 최신 정보 재확인
        if (state) {
          state.isHydrated = true;
          if (isAuthenticated()) {
            state.fetchMe();
          }
        }
      },
    }
  )
);
