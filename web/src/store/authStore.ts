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
          // FastAPI 기본 OAuth2 폼 방식
          const formData = new FormData();
          formData.append('username', credentials.username);
          formData.append('password', credentials.password);

          const tokens = await api.post<AuthTokens>(
            '/auth/login',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
          );

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
      // 민감 정보(password 등)는 localStorage에 저장 안 함
      // user 정보만 캐시 (토큰은 쿠키에 별도 저장)
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
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
