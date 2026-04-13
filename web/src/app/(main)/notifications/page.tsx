'use client';

/**
 * notifications/page.tsx — 알림 전체 목록 페이지
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotificationStore, NOTI_ICONS } from '@/store/notificationStore';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications, unreadCount, isLoading, hasNext,
    fetchNotifications, readAll, readOne,
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = async (id: number, link?: string) => {
    await readOne(id);
    if (link) router.push(link);
  };

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-ssolap-silver text-xs font-bold tracking-[0.3em] uppercase">
          알림 {unreadCount > 0 && <span className="text-red-400 ml-1">({unreadCount})</span>}
        </h2>
        {unreadCount > 0 && (
          <button
            onClick={readAll}
            className="text-ssolap-muted hover:text-ssolap-silver text-xs transition-colors"
          >
            전체 읽음
          </button>
        )}
      </div>

      {/* 알림 목록 */}
      {isLoading && notifications.length === 0 && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card animate-pulse flex items-center gap-3">
              <div className="w-9 h-9 bg-ssolap-border flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3 w-3/4 bg-ssolap-border mb-1.5" />
                <div className="h-2.5 w-1/3 bg-ssolap-border/60" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="text-center py-20">
          <div className="text-4xl text-ssolap-silver/10 mb-4">◆</div>
          <p className="text-ssolap-muted text-xs tracking-widest">알림이 없습니다</p>
        </div>
      )}

      <div className="flex flex-col divide-y divide-ssolap-border/30">
        {notifications.map((noti) => (
          <button
            key={noti.id}
            onClick={() => handleClick(noti.id, noti.link)}
            className={`
              flex items-start gap-3 py-4 text-left
              hover:bg-white/2 transition-colors
              ${!noti.is_read ? 'bg-ssolap-silver/2' : ''}
            `}
          >
            {/* 타입 아이콘 */}
            <div className={`
              w-9 h-9 flex-shrink-0 border border-ssolap-border
              flex items-center justify-center
              ${!noti.is_read ? 'bg-ssolap-silver/10' : 'bg-transparent'}
            `}>
              {noti.actor?.avatar_url ? (
                <img src={noti.actor.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-ssolap-silver/50 text-sm">
                  {NOTI_ICONS[noti.noti_type] ?? '○'}
                </span>
              )}
            </div>

            {/* 내용 */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-relaxed ${!noti.is_read ? 'text-ssolap-silver' : 'text-ssolap-muted'}`}>
                {noti.message}
              </p>
              {noti.actor && (
                <p className="text-ssolap-muted/50 text-[10px] mt-0.5">
                  @{noti.actor.username}
                </p>
              )}
              <p className="text-ssolap-muted/40 text-[10px] mt-1">
                {formatDistanceToNow(new Date(noti.created_at), { addSuffix: true, locale: ko })}
              </p>
            </div>

            {/* 미읽음 점 */}
            {!noti.is_read && (
              <div className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0 mt-1" />
            )}
          </button>
        ))}
      </div>

      {/* 더 보기 */}
      {hasNext && (
        <div className="pt-4 text-center">
          <button
            onClick={() => fetchNotifications(false)}
            disabled={isLoading}
            className="text-ssolap-muted hover:text-ssolap-silver text-xs tracking-wide transition-colors disabled:opacity-40"
          >
            {isLoading ? '로딩 중...' : '더 보기'}
          </button>
        </div>
      )}
    </div>
  );
}
