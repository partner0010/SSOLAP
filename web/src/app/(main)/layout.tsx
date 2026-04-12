'use client';

/**
 * (main)/layout.tsx — 로그인 후 메인 레이아웃
 * 사이드바 + 헤더 + 콘텐츠 영역
 * 비인증 유저는 로그인 페이지로 리다이렉트
 */
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { useAuthStore } from '@/store/authStore';

// 각 라우트별 헤더 타이틀 매핑
const PAGE_TITLES: Record<string, string> = {
  '/feed':    '피드',
  '/explore': '탐색',
  '/chat':    '채팅',
  '/points':  'S포인트',
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, isHydrated } = useAuthStore();

  // 인증 가드
  useEffect(() => {
    if (isHydrated && !user) {
      router.replace('/auth/login');
    }
  }, [isHydrated, user, router]);

  // 수화 전 로딩 스피너
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-ssolap-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="text-ssolap-silver font-black text-xl tracking-[0.4em] animate-pulse">
            SSOLAP
          </span>
        </div>
      </div>
    );
  }

  // 인증 전 렌더링 방지
  if (!user) return null;

  // 현재 경로에 해당하는 타이틀
  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    pathname === path || pathname.startsWith(path + '/')
  )?.[1];

  return (
    <div className="min-h-screen bg-ssolap-black">
      {/* 사이드바 */}
      <Sidebar />

      {/* 헤더 */}
      <Header title={title} />

      {/* 메인 콘텐츠 */}
      <main className="ml-[220px] pt-14 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
