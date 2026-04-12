'use client';

/**
 * Sidebar.tsx — 메인 사이드바 네비게이션
 * SSOLAP 하이엔드 메탈릭 디자인
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

// ─── 아이콘 (SVG 인라인) ──────────────────────────────────────────────────────
const Icons = {
  Feed: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  Explore: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  Chat: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Profile: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Points: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Create: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  Logout: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

// ─── 네비게이션 메뉴 ──────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/feed',    label: '피드',    Icon: Icons.Feed },
  { href: '/explore', label: '탐색',    Icon: Icons.Explore },
  { href: '/chat',    label: '채팅',    Icon: Icons.Chat },
  { href: '/points',  label: 'S포인트', Icon: Icons.Points },
];

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <aside className="
      fixed left-0 top-0 h-screen w-[220px]
      bg-[#0D0D1A] border-r border-ssolap-border
      flex flex-col z-40
    ">
      {/* 로고 */}
      <div className="px-6 py-6 border-b border-ssolap-border">
        <Link href="/feed">
          <span className="text-ssolap-silver font-black text-lg tracking-[0.4em] hover:text-white transition-colors">
            SSOLAP
          </span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-3 px-4 py-3
                text-sm tracking-wide font-medium
                transition-all duration-150
                ${isActive
                  ? 'bg-ssolap-silver/10 text-ssolap-silver border-l-2 border-ssolap-silver pl-[14px]'
                  : 'text-ssolap-muted hover:bg-white/5 hover:text-ssolap-silver border-l-2 border-transparent pl-[14px]'
                }
              `}
            >
              <Icon />
              {label}
            </Link>
          );
        })}

        {/* 게시물 작성 버튼 */}
        <div className="mt-4 px-1">
          <Link
            href="/feed?create=true"
            className="
              flex items-center justify-center gap-2
              w-full py-3 px-4
              bg-ssolap-silver/10 hover:bg-ssolap-silver/20
              border border-ssolap-silver/30 hover:border-ssolap-silver/60
              text-ssolap-silver text-sm font-semibold tracking-widest
              transition-all duration-150
            "
          >
            <Icons.Create />
            작성하기
          </Link>
        </div>
      </nav>

      {/* 유저 프로필 영역 */}
      {user && (
        <div className="px-3 pb-4 border-t border-ssolap-border pt-4">
          <Link
            href={`/profile/${user.username}`}
            className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors"
          >
            {/* 아바타 */}
            <div className="
              w-8 h-8 bg-ssolap-silver/20 border border-ssolap-border
              flex items-center justify-center text-ssolap-silver text-xs font-bold
              flex-shrink-0
            ">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
              ) : (
                user.display_name[0].toUpperCase()
              )}
            </div>
            {/* 이름 */}
            <div className="flex-1 min-w-0">
              <p className="text-ssolap-silver text-xs font-semibold truncate">
                {user.display_name}
              </p>
              <p className="text-ssolap-muted text-[10px] truncate">@{user.username}</p>
            </div>
          </Link>

          {/* 로그아웃 */}
          <button
            onClick={handleLogout}
            className="
              mt-1 w-full flex items-center gap-2 px-3 py-2
              text-ssolap-muted hover:text-red-400 hover:bg-red-500/5
              text-xs tracking-wide transition-colors
            "
          >
            <Icons.Logout />
            로그아웃
          </button>
        </div>
      )}
    </aside>
  );
}
