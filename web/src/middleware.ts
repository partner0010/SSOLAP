/**
 * middleware.ts — Next.js 서버 사이드 인증 미들웨어
 *
 * 클라이언트 상태(Zustand)에만 의존하지 않고 서버에서도
 * 쿠키 기반으로 인증 여부를 검사 → 인증 우회 방지
 *
 * 보호 경로: /(main) 아래 모든 페이지
 * 공개 경로: /auth/*, / (랜딩)
 */
import { NextRequest, NextResponse } from 'next/server';

// ─── 보호가 필요한 경로 패턴 ─────────────────────────────────────────────────
const PROTECTED_PATHS = [
  '/feed',
  '/explore',
  '/chat',
  '/points',
  '/profile',
  '/shop',
  '/notifications',
  '/settings',
];

// ─── 인증 없이 접근 가능한 경로 ──────────────────────────────────────────────
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/',
  '/health',
];

const ACCESS_TOKEN_KEY = 'ssolap_access';

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // 정적 파일 / Next.js 내부 경로 무시
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api')   ||
    pathname.startsWith('/uploads') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // 쿠키에서 액세스 토큰 확인
  const token = request.cookies.get(ACCESS_TOKEN_KEY)?.value;

  if (!token) {
    // 미인증 → 로그인 페이지로 리다이렉트 (원래 경로 저장)
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 응답 헤더에 캐시 제어 추가 (인증된 페이지는 캐시 금지)
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에 미들웨어 적용:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
