'use client';

/**
 * NotificationBell.tsx — 헤더 알림 벨 아이콘 + 드롭다운 패널
 */
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNotificationStore, NOTI_ICONS } from '@/store/notificationStore';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

// 쿠키에서 토큰 읽기
function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  return document.cookie.split('; ').find((r) => r.startsWith('access_token='))?.split('=')[1] ?? null;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router   = useRouter();

  const {
    notifications, unreadCount, isLoading, wsConnected,
    fetchNotifications, fetchUnreadCount, readAll, readOne,
    connectWs, disconnectWs,
  } = useNotificationStore();

  // WebSocket 연결 + 초기 미읽음 카운트
  useEffect(() => {
    const token = getToken();
    if (token) {
      connectWs(token);
      fetchUnreadCount();
    }
    return () => disconnectWs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 패널 열릴 때 알림 목록 로드
  useEffect(() => {
    if (open) fetchNotifications(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNotiClick = async (notiId: number, link?: string) => {
    await readOne(notiId);
    setOpen(false);
    if (link) router.push(link);
  };

  return (
    <div ref={panelRef} className="relative">
      {/* 벨 버튼 */}
      <button
        onClick={() => setOpen(!open)}
        className="relative text-ssolap-muted hover:text-ssolap-silver transition-colors p-1"
        aria-label="알림"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* 미읽음 배지 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 패널 */}
      {open && (
        <div className="
          absolute right-0 top-8 w-[320px] z-50
          bg-[#0D0D1A] border border-ssolap-border shadow-xl
          flex flex-col max-h-[460px]
        ">
          {/* 패널 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ssolap-border flex-shrink-0">
            <span className="text-ssolap-silver text-xs font-bold tracking-[0.2em]">
              알림 {unreadCount > 0 && <span className="text-red-400 ml-1">({unreadCount})</span>}
            </span>
            <div className="flex items-center gap-3">
              {/* WS 연결 상태 */}
              <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-ssolap-muted/30'}`} title={wsConnected ? '실시간 연결됨' : '연결 중...'} />
              {unreadCount > 0 && (
                <button
                  onClick={readAll}
                  className="text-ssolap-muted hover:text-ssolap-silver text-[10px] transition-colors"
                >
                  모두 읽음
                </button>
              )}
            </div>
          </div>

          {/* 알림 목록 */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && notifications.length === 0 && (
              <div className="flex justify-center py-8">
                <span className="text-ssolap-muted text-xs animate-pulse">로딩 중...</span>
              </div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="text-center py-10">
                <p className="text-ssolap-muted/40 text-xs tracking-widest">알림이 없습니다</p>
              </div>
            )}

            {notifications.map((noti) => (
              <button
                key={noti.id}
                onClick={() => handleNotiClick(noti.id, noti.link)}
                className={`
                  w-full flex items-start gap-3 px-4 py-3 text-left
                  hover:bg-white/3 transition-colors border-b border-ssolap-border/30
                  ${!noti.is_read ? 'bg-ssolap-silver/3' : ''}
                `}
              >
                {/* 아이콘 */}
                <div className={`
                  w-8 h-8 flex-shrink-0 flex items-center justify-center text-sm
                  border border-ssolap-border
                  ${!noti.is_read ? 'bg-ssolap-silver/10' : 'bg-transparent'}
                `}>
                  {noti.actor?.avatar_url ? (
                    <img src={noti.actor.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-ssolap-silver/60">{NOTI_ICONS[noti.noti_type] ?? '○'}</span>
                  )}
                </div>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${!noti.is_read ? 'text-ssolap-silver' : 'text-ssolap-muted'}`}>
                    {noti.message}
                  </p>
                  <p className="text-ssolap-muted/40 text-[10px] mt-0.5">
                    {formatDistanceToNow(new Date(noti.created_at), { addSuffix: true, locale: ko })}
                  </p>
                </div>

                {/* 미읽음 점 */}
                {!noti.is_read && (
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0 mt-1" />
                )}
              </button>
            ))}
          </div>

          {/* 전체 보기 링크 */}
          <div className="border-t border-ssolap-border px-4 py-2.5 flex-shrink-0">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-ssolap-muted hover:text-ssolap-silver text-[10px] tracking-widest transition-colors"
            >
              전체 알림 보기 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
