'use client';

/**
 * Header.tsx — 상단 헤더 (검색 + 알림 + 포인트 표시)
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import NotificationBell from './NotificationBell';

export default function Header({ title }: { title?: string }) {
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { user } = useAuthStore();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <header className="
      fixed top-0 right-0 left-[220px]
      h-14 bg-[#0A0A14]/95 backdrop-blur-sm
      border-b border-ssolap-border
      flex items-center px-6 gap-4 z-30
    ">
      {/* 페이지 타이틀 */}
      {title && (
        <h1 className="text-ssolap-silver font-bold text-sm tracking-[0.2em] uppercase mr-2 flex-shrink-0">
          {title}
        </h1>
      )}

      {/* 검색창 */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ssolap-muted"
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색..."
            className="
              w-full bg-white/5 border border-ssolap-border
              pl-9 pr-4 py-2 text-xs text-ssolap-silver
              placeholder:text-ssolap-muted
              focus:outline-none focus:border-ssolap-silver/50
              transition-colors
            "
          />
        </div>
      </form>

      <div className="flex items-center gap-4 ml-auto">
        {/* S포인트 */}
        {user && (
          <Link
            href="/points"
            className="flex items-center gap-1.5 text-xs text-ssolap-silver hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="font-mono font-bold">
              {(user.point_balance ?? 0).toLocaleString()}
            </span>
            <span className="text-ssolap-muted">SP</span>
          </Link>
        )}

        {/* 알림 벨 */}
        <NotificationBell />
      </div>
    </header>
  );
}
