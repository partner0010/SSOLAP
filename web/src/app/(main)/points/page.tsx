'use client';

/**
 * points/page.tsx — S포인트 페이지
 * 잔액 현황 + 출석 체크인 + 샵 + 거래 내역
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { usePointStore, ACTION_LABELS } from '@/store/pointStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface ShopItem {
  id:           string;
  name:         string;
  description:  string;
  price:        number;
  icon:         string;
  category:     string;
  requires_ref: boolean;
}

interface ActiveItem {
  item_id:    string;
  item_name:  string;
  expires_at: string | null;
}

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
    daily_checkin:         '✦',
    post_create:           '◈',
    comment_create:        '◉',
    like_milestone:        '♥',
    purchase:              '◆',
    spend_room_entry:      '◧',
    spend_boost_post:      '▲',
    spend_premium_badge:   '⭐',
    spend_story_boost:     '◈',
    admin_grant:           '★',
    admin_deduct:          '▼',
  };
  return (
    <span className="text-ssolap-silver/60 text-sm">
      {icons[action] ?? '○'}
    </span>
  );
}

// ─── 샵 탭 ───────────────────────────────────────────────────────────────────
function ShopTab({ balance }: { balance: number }) {
  const [items,       setItems]       = useState<ShopItem[]>([]);
  const [activeItems, setActiveItems] = useState<ActiveItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [purchasing,  setPurchasing]  = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [shopData, activeData] = await Promise.all([
          api.get<ShopItem[]>('/shop/items'),
          api.get<{ items: ActiveItem[] }>('/shop/active'),
        ]);
        setItems(shopData);
        setActiveItems(activeData.items);
      } catch {
        toast.error('샵 정보를 불러오지 못했습니다');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handlePurchase = async (item: ShopItem) => {
    if (balance < item.price) {
      toast.error(`S포인트가 부족합니다 (필요: ${item.price} SP)`);
      return;
    }

    // boost_post 는 게시물 URL에서 진행하도록 안내
    if (item.requires_ref) {
      toast('게시물 부스트는 게시물 상세 페이지에서 진행해주세요 ▲', { icon: 'ℹ️', duration: 4000 });
      return;
    }

    setPurchasing(item.id);
    try {
      const result = await api.post<{ message: string; balance_after: number }>(
        `/shop/purchase/${item.id}`,
        {}
      );
      toast.success(result.message);
      // 활성 아이템 새로고침
      const activeData = await api.get<{ items: ActiveItem[] }>('/shop/active');
      setActiveItems(activeData.items);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? '구매에 실패했습니다');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card animate-pulse flex gap-4">
            <div className="w-10 h-10 bg-ssolap-border flex-shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-1/3 bg-ssolap-border mb-2" />
              <div className="h-2.5 w-2/3 bg-ssolap-border/60" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 활성 아이템 */}
      {activeItems.length > 0 && (
        <div>
          <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-3">
            보유 중인 아이템
          </h3>
          <div className="space-y-2">
            {activeItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border border-ssolap-silver/20 bg-ssolap-silver/5">
                <span className="text-ssolap-silver text-sm">✦</span>
                <div className="flex-1 min-w-0">
                  <p className="text-ssolap-silver text-xs font-medium">{item.item_name}</p>
                  {item.expires_at && (
                    <p className="text-ssolap-muted text-[10px]">
                      만료: {format(new Date(item.expires_at), 'yyyy/MM/dd HH:mm', { locale: ko })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 상품 목록 */}
      <div>
        <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-3">
          구매 가능 아이템
        </h3>
        <div className="space-y-3">
          {items.map((item) => {
            const canAfford   = balance >= item.price;
            const isBuying    = purchasing === item.id;

            return (
              <div key={item.id} className="card flex items-center gap-4">
                {/* 아이콘 */}
                <div className="w-12 h-12 bg-ssolap-silver/10 border border-ssolap-border flex items-center justify-center text-xl flex-shrink-0">
                  {item.icon}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <p className="text-ssolap-silver text-sm font-semibold">{item.name}</p>
                  <p className="text-ssolap-muted text-xs leading-relaxed mt-0.5">
                    {item.description}
                  </p>
                </div>

                {/* 가격 + 버튼 */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-ssolap-silver text-sm font-bold font-mono mb-1.5">
                    {item.price.toLocaleString()} SP
                  </p>
                  <button
                    onClick={() => handlePurchase(item)}
                    disabled={!canAfford || isBuying}
                    className={`
                      px-4 py-1.5 text-xs tracking-wide border transition-all
                      ${canAfford
                        ? 'border-ssolap-silver/30 text-ssolap-silver hover:bg-ssolap-silver/10'
                        : 'border-ssolap-border text-ssolap-muted/40 cursor-not-allowed'
                      }
                      ${isBuying ? 'opacity-60 cursor-wait' : ''}
                    `}
                  >
                    {isBuying ? '처리 중...' : item.requires_ref ? '게시물에서' : '구매'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-ssolap-muted/40 text-[10px] pt-2">
        구매한 아이템은 환불되지 않습니다
      </p>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: '현황' },
  { key: 'shop',     label: '샵' },
  { key: 'history',  label: '내역' },
] as const;

export default function PointsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'shop' | 'history'>('overview');

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
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '체크인에 실패했습니다';
      toast.error(msg);
    }
  };

  return (
    <div>
      {/* ── 잔액 카드 (항상 표시) ─────────────────────────────────── */}
      {isLoading && !balance ? (
        <BalanceSkeleton />
      ) : balance ? (
        <div className="card mb-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <StarIcon size={20} />
            <span className="text-4xl font-black text-ssolap-silver font-mono tracking-tight">
              {balance.balance.toLocaleString()}
            </span>
          </div>
          <p className="text-ssolap-muted text-xs tracking-[0.3em] mb-5">S POINT</p>

          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { label: '총 획득',   value: balance.total_earned },
              { label: '총 소비',   value: balance.total_spent },
              { label: '오늘 획득', value: balance.earned_today },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-sm font-bold font-mono text-ssolap-silver">
                  {value.toLocaleString()}
                </p>
                <p className="text-ssolap-muted text-[10px] tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* 한도 바 */}
          <div className="mb-5">
            <div className="flex justify-between text-[10px] text-ssolap-muted mb-1.5">
              <span>오늘 획득 한도</span>
              <span className="font-mono">{balance.earned_today} / {balance.daily_cap} SP</span>
            </div>
            <div className="h-1 bg-ssolap-border w-full">
              <div
                className="h-1 bg-ssolap-silver transition-all duration-500"
                style={{ width: `${Math.min(100, (balance.earned_today / balance.daily_cap) * 100)}%` }}
              />
            </div>
          </div>

          <button
            onClick={handleCheckin}
            disabled={isCheckinLoading}
            className="w-full py-3 border border-ssolap-silver/30 hover:border-ssolap-silver/60 hover:bg-ssolap-silver/5 text-ssolap-silver text-xs font-bold tracking-[0.3em] transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
          >
            <StarIcon size={13} />
            {isCheckinLoading ? '처리 중...' : '출석 체크인 (+10 SP)'}
          </button>
        </div>
      ) : null}

      {/* ── 탭 ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`
              flex-1 py-2 text-xs tracking-wide border transition-all
              ${activeTab === key
                ? 'border-ssolap-silver/40 bg-ssolap-silver/10 text-ssolap-silver'
                : 'border-ssolap-border text-ssolap-muted hover:text-ssolap-silver'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 현황 탭 ──────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-3">
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
      )}

      {/* ── 샵 탭 ───────────────────────────────────────────────────── */}
      {activeTab === 'shop' && (
        <ShopTab balance={balance?.balance ?? 0} />
      )}

      {/* ── 내역 탭 ──────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div>
          {transactions.length === 0 && !isLoading && (
            <div className="text-center py-12 text-ssolap-muted text-xs tracking-widest">
              아직 거래 내역이 없습니다
            </div>
          )}

          <div className="flex flex-col divide-y divide-ssolap-border/30">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 bg-ssolap-silver/5 border border-ssolap-border flex items-center justify-center flex-shrink-0">
                  <TxIcon action={tx.action} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-ssolap-silver text-xs font-medium">
                    {tx.description ?? ACTION_LABELS[tx.action] ?? tx.action}
                  </p>
                  <p className="text-ssolap-muted text-[10px] mt-0.5">
                    {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true, locale: ko })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold font-mono ${tx.amount > 0 ? 'text-ssolap-silver' : 'text-ssolap-muted'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </p>
                  <p className="text-ssolap-muted/50 text-[10px] font-mono">
                    잔액 {tx.balance_after.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div ref={loaderRef} className="py-4 text-center">
            {isLoading && transactions.length > 0 && (
              <span className="text-ssolap-muted text-xs animate-pulse">로딩 중...</span>
            )}
            {!hasNext && transactions.length > 0 && (
              <span className="text-ssolap-muted/30 text-xs tracking-widest">— 끝 —</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
