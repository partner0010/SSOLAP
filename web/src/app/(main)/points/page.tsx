'use client';

/**
 * points/page.tsx — S포인트 페이지
 * 잔액 현황 + 오늘 획득량 + 출석 체크인 + 거래 내역
 */
import { useEffect, useRef, useCallback } from 'react';
import { usePointStore, ACTION_LABELS } from '@/store/pointStore';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── 아이콘 ───────────────────────────────────────────────────────────────────
const StarIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────
function BalanceSkeleton() {
  return (
    <div className="card animate-pulse mb-6">
      <div className="h-12 w-40 bg-ssolap-border mx-auto mb-4" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center">
            <div className="h-4 w-12 bg-ssolap-border mx-auto mb-1" />
            <div className="h-3 w-16 bg-ssolap-border/60 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 거래 아이콘 매핑 ─────────────────────────────────────────────────────────
function TxIcon({ action }: { action: string }) {
  const icons: Record<string, string> = {
    daily_checkin:    '✦',
    post_create:      '◈',
    comment_create:   '◉',
    like_milestone:   '♥',
    purchase:         '◆',
    spend_room_entry: '◧',
    spend_boost:      '▲',
    admin_grant:      '★',
    admin_deduct:     '▼',
  };
  return (
    <span className="text-ssolap-silver/60 text-sm">
      {icons[action] ?? '○'}
    </span>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function PointsPage() {
  const {
    balance, transactions, hasNext,
    isLoading, isCheckinLoading,
    fetchBalance, fetchHistory, checkin,
  } = usePointStore();

  useEffect(() => {
    fetchBalance();
    fetchHistory(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 무한 스크롤 ──────────────────────────────────────────────────────
  const loaderRef = useRef<HTMLDivElement>(null);
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNext && !isLoading) {
        fetchHistory(false);
      }
    },
    [hasNext, isLoading, fetchHistory]
  );
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(handleIntersect, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [handleIntersect]);

  // ── 출석 체크인 ──────────────────────────────────────────────────────
  const handleCheckin = async () => {
    try {
      const { rewarded, already } = await checkin();
      if (already) {
        toast('오늘은 이미 출석했습니다', { icon: '✦' });
      } else {
        toast.success(`출석 완료! +${rewarded} SP 획득`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? '체크인에 실패했습니다');
    }
  };

  return (
    <div>
      {/* ── 잔액 카드 ────────────────────────────────────────────── */}
      {isLoading && !balance ? (
        <BalanceSkeleton />
      ) : balance ? (
        <div className="card mb-6 text-center">
          {/* 메인 잔액 */}
          <div className="flex items-center justify-center gap-2 mb-1">
            <StarIcon size={20} />
            <span className="text-4xl font-black text-ssolap-silver font-mono tracking-tight">
              {balance.balance.toLocaleString()}
            </span>
          </div>
          <p className="text-ssolap-muted text-xs tracking-[0.3em] mb-6">S POINT</p>

          {/* 통계 3열 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: '총 획득',  value: balance.total_earned,  color: 'text-ssolap-silver' },
              { label: '총 소비',  value: balance.total_spent,   color: 'text-ssolap-muted' },
              { label: '오늘 획득', value: balance.earned_today,  color: 'text-ssolap-silver' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className={`text-sm font-bold font-mono ${color}`}>
                  {value.toLocaleString()}
                </p>
                <p className="text-ssolap-muted text-[10px] tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* 일일 한도 바 */}
          <div className="mb-6">
            <div className="flex justify-between text-[10px] text-ssolap-muted mb-1.5">
              <span>오늘 획득 한도</span>
              <span className="font-mono">
                {balance.earned_today} / {balance.daily_cap} SP
              </span>
            </div>
            <div className="h-1 bg-ssolap-border w-full">
              <div
                className="h-1 bg-ssolap-silver transition-all duration-500"
                style={{
                  width: `${Math.min(100, (balance.earned_today / balance.daily_cap) * 100)}%`,
                }}
              />
            </div>
            {balance.remaining_cap > 0 ? (
              <p className="text-ssolap-muted/60 text-[10px] mt-1 text-right">
                오늘 {balance.remaining_cap} SP 더 획득 가능
              </p>
            ) : (
              <p className="text-yellow-500/70 text-[10px] mt-1 text-right">
                오늘 한도 달성 — 자정에 초기화
              </p>
            )}
          </div>

          {/* 출석 체크인 버튼 */}
          <button
            onClick={handleCheckin}
            disabled={isCheckinLoading}
            className="
              w-full py-3 border border-ssolap-silver/30
              hover:border-ssolap-silver/60 hover:bg-ssolap-silver/5
              text-ssolap-silver text-xs font-bold tracking-[0.3em]
              transition-all disabled:opacity-50 disabled:cursor-wait
              flex items-center justify-center gap-2
            "
          >
            <StarIcon size={13} />
            {isCheckinLoading ? '처리 중...' : '출석 체크인 (+10 SP)'}
          </button>
        </div>
      ) : null}

      {/* ── 포인트 획득 안내 ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { action: '출석 체크인', reward: '+10',  icon: '✦' },
          { action: '게시물 작성', reward: '+20',  icon: '◈' },
          { action: '댓글 작성',   reward: '+5',   icon: '◉' },
        ].map(({ action, reward, icon }) => (
          <div key={action} className="card text-center py-4">
            <div className="text-xl text-ssolap-silver/40 mb-2">{icon}</div>
            <p className="text-ssolap-silver text-sm font-bold font-mono">{reward}</p>
            <p className="text-ssolap-muted text-[10px] tracking-wide mt-0.5">{action}</p>
          </div>
        ))}
      </div>

      {/* ── 거래 내역 ────────────────────────────────────────────── */}
      <div>
        <h2 className="text-ssolap-silver text-xs font-bold tracking-[0.3em] uppercase mb-4">
          거래 내역
        </h2>

        {transactions.length === 0 && !isLoading && (
          <div className="text-center py-12 text-ssolap-muted text-xs tracking-widest">
            아직 거래 내역이 없습니다
          </div>
        )}

        <div className="flex flex-col divide-y divide-ssolap-border/30">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-3">
              {/* 아이콘 */}
              <div className="w-8 h-8 bg-ssolap-silver/5 border border-ssolap-border flex items-center justify-center flex-shrink-0">
                <TxIcon action={tx.action} />
              </div>

              {/* 설명 + 시간 */}
              <div className="flex-1 min-w-0">
                <p className="text-ssolap-silver text-xs font-medium">
                  {tx.description ?? ACTION_LABELS[tx.action] ?? tx.action}
                </p>
                <p className="text-ssolap-muted text-[10px] mt-0.5">
                  {formatDistanceToNow(new Date(tx.created_at), {
                    addSuffix: true,
                    locale: ko,
                  })}
                </p>
              </div>

              {/* 금액 */}
              <div className="text-right flex-shrink-0">
                <p className={`
                  text-sm font-bold font-mono
                  ${tx.amount > 0 ? 'text-ssolap-silver' : 'text-ssolap-muted'}
                `}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                </p>
                <p className="text-ssolap-muted/50 text-[10px] font-mono">
                  잔액 {tx.balance_after.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 무한 스크롤 로더 */}
        <div ref={loaderRef} className="py-4 text-center">
          {isLoading && transactions.length > 0 && (
            <span className="text-ssolap-muted text-xs animate-pulse">로딩 중...</span>
          )}
          {!hasNext && transactions.length > 0 && (
            <span className="text-ssolap-muted/30 text-xs tracking-widest">— 끝 —</span>
          )}
        </div>
      </div>
    </div>
  );
}
