/**
 * API 클라이언트
 * ─────────────────────────────────────────────────────────────────────────────
 * axios 기반 HTTP 클라이언트
 * - 자동 JWT 헤더 첨부
 * - 401 시 토큰 자동 갱신
 * - 에러 응답 표준화
 * ─────────────────────────────────────────────────────────────────────────────
 */
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import Cookies from 'js-cookie';
import { ApiError } from '@/types';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const ACCESS_TOKEN_KEY  = 'ssolap_access';
const REFRESH_TOKEN_KEY = 'ssolap_refresh';

// ─── Axios 인스턴스 생성 ──────────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,        // 30초 타임아웃
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── 요청 인터셉터: JWT 헤더 자동 첨부 ──────────────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get(ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── 응답 인터셉터: 에러 처리 + 토큰 갱신 ────────────────────────────────────
let isRefreshing = false;
let waitingQueue: Array<(token: string) => void> = [];

apiClient.interceptors.response.use(
  // 성공: 그대로 반환
  (response: AxiosResponse) => response,

  // 실패: 에러 처리
  async (error: AxiosError<ApiError>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // ── 401: 토큰 만료 → 자동 갱신 시도 ────────────────────────────────
    if (error.response?.status === 401 && !original._retry) {
      const refreshToken = Cookies.get(REFRESH_TOKEN_KEY);

      if (!refreshToken) {
        // 리프레시 토큰도 없으면 로그아웃
        clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        return Promise.reject(error);
      }

      // 여러 요청이 동시에 401을 받으면 갱신 요청은 1번만
      if (isRefreshing) {
        return new Promise((resolve) => {
          waitingQueue.push((newToken) => {
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${API_BASE}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token } = res.data;
        setAccessToken(access_token);

        // 대기 중인 요청들 재시도
        waitingQueue.forEach((cb) => cb(access_token));
        waitingQueue = [];

        original.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(original);
      } catch (refreshError) {
        clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ── 그 외 에러: 표준 형식으로 변환 ──────────────────────────────────
    const apiError: ApiError = {
      detail: error.response?.data?.detail ?? '요청 처리 중 오류가 발생했습니다.',
      code:   error.response?.data?.code,
      field:  error.response?.data?.field,
    };

    return Promise.reject(apiError);
  }
);

// ─── 토큰 관리 유틸리티 ──────────────────────────────────────────────────────
export function setTokens(accessToken: string, refreshToken: string): void {
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, {
    expires: 1,       // 1일 (실제 만료 60분이지만 자동 갱신으로 연장)
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, {
    expires: 30,      // 30일
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

export function setAccessToken(token: string): void {
  Cookies.set(ACCESS_TOKEN_KEY, token, { expires: 1, sameSite: 'lax' });
}

export function clearTokens(): void {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
}

export function getAccessToken(): string | undefined {
  return Cookies.get(ACCESS_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!Cookies.get(ACCESS_TOKEN_KEY);
}

// ─── 편의 래퍼 함수 ──────────────────────────────────────────────────────────
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    apiClient.get<T>(url, config).then((r) => r.data),

  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.post<T>(url, data, config).then((r) => r.data),

  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.put<T>(url, data, config).then((r) => r.data),

  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    apiClient.patch<T>(url, data, config).then((r) => r.data),

  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    apiClient.delete<T>(url, config).then((r) => r.data),
};

export default apiClient;
