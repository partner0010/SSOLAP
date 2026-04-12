'use client';

/**
 * admin/page.tsx — 어드민 대시보드
 * 탭: 대시보드(통계) / 유저 관리 / 게시물 관리 / 알림 발송
 * admin role만 접근 가능 (layout.tsx auth guard + 이 페이지 내 체크)
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { formatDistanceToNow, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface PlatformStats {
  total_users:         number;
  active_users:        number;
  total_posts:         number;
  total_rooms:         number;
  total_points_issued: number;
  new_users_today:     number;
  new_posts_today:     number;
}

interface AdminUser {
  id:              number;
  username:        string;
  display_name:    string;
  email:           string;
  role:            string;
  is_active:       boolean;
  is_verified:     boolean;
  follower_count:  number;
  post_count:      number;
  point_balance:   number;
  created_at:      string;
  last_login_at:   string | null;
}

interface AdminPost {
  id:              number;
  author_id:       number;
  author_username: string;
  content:         string | null;
  post_type:       string;
  is_public:       boolean;
  like_count:      number;
  comment_count:   number;
  view_count:      number;
  created_at:      string;
}

const TABS = [
  { key: 'stats',   label: '대시보드' },
  { key: 'users',   label: '유저 관리' },
  { key: 'posts',   label: '게시물 관리' },
  { key: 'broadcast', label: '알림 발송' },
] as const;

// ─── 통계 카드 ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-ssolap-muted text-[10px] tracking-[0.25em] uppercase">{label}</p>
      <p className="text-ssolap-silver font-mono font-bold text-2xl">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-ssolap-muted/60 text-xs">{sub}</p>}
    </div>
  );
}

// ─── 역할 배지 ────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const cls =
    role === 'admin'   ? 'text-red-400 border-red-400/40' :
    role === 'creator' ? 'text-yellow-400 border-yellow-400/40' :
                         'text-ssolap-muted border-ssolap-border';
  return (
    <span className={`text-[9px] border px-1.5 py-0.5 font-mono tracking-wide ${cls}`}>
      {role}
    </span>
  );
}

// ─── 대시보드 탭 ──────────────────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<PlatformStats>('/admin/stats')
      .then(setStats)
      .catch(() => toast.error('통계를 불러오지 못했습니다'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="card h-20 bg-ssolap-border/30" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-4">
          전체 현황
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="총 유저" value={stats.total_users} sub={`활성 ${stats.active_users.toLocaleString()}명`} />
          <StatCard label="총 게시물" value={stats.total_posts} />
          <StatCard label="총 채팅방" value={stats.total_rooms} />
          <StatCard label="총 발행 포인트" value={`${stats.total_points_issued.toLocaleString()} SP`} />
        </div>
      </div>
      <div>
        <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-4">
          오늘 현황
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="신규 유저" value={stats.new_users_today} />
          <StatCard label="신규 게시물" value={stats.new_posts_today} />
        </div>
      </div>
    </div>
  );
}

// ─── 유저 관리 탭 ─────────────────────────────────────────────────────────────
function UsersTab() {
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [hasNext,  setHasNext]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [q,        setQ]        = useState('');
  const [editId,   setEditId]   = useState<number | null>(null);

  // 포인트 지급 모달 상태
  const [grantTarget,  setGrantTarget]  = useState<AdminUser | null>(null);
  const [grantAmount,  setGrantAmount]  = useState(0);
  const [grantDesc,    setGrantDesc]    = useState('');
  const [grantLoading, setGrantLoading] = useState(false);

  const fetchUsers = useCallback(async (p: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), per_page: '20' });
      if (search) params.set('q', search);
      const data = await api.get<{ users: AdminUser[]; total: number; has_next: boolean }>(
        `/admin/users?${params}`
      );
      setUsers(data.users);
      setTotal(data.total);
      setHasNext(data.has_next);
      setPage(p);
    } catch {
      toast.error('유저 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(1, ''); }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1, q);
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      const updated = await api.patch<AdminUser>(`/admin/users/${user.id}`, {
        is_active: !user.is_active,
      });
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      toast.success(updated.is_active ? '계정을 활성화했습니다' : '계정을 정지했습니다');
    } catch {
      toast.error('처리에 실패했습니다');
    }
  };

  const handleSetRole = async (user: AdminUser, role: string) => {
    try {
      const updated = await api.patch<AdminUser>(`/admin/users/${user.id}`, { role });
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      setEditId(null);
      toast.success(`역할을 ${role}로 변경했습니다`);
    } catch {
      toast.error('처리에 실패했습니다');
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`@${user.username} 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setTotal((t) => t - 1);
      toast.success('유저가 삭제됐습니다');
    } catch {
      toast.error('삭제에 실패했습니다');
    }
  };

  const handleGrant = async () => {
    if (!grantTarget || !grantDesc.trim()) return;
    setGrantLoading(true);
    try {
      const res = await api.post<{ new_balance: number }>(
        `/admin/users/${grantTarget.id}/grant-points`,
        { amount: grantAmount, description: grantDesc }
      );
      setUsers((prev) => prev.map((u) =>
        u.id === grantTarget.id ? { ...u, point_balance: res.new_balance } : u
      ));
      toast.success(`포인트 처리 완료 (잔액: ${res.new_balance.toLocaleString()} SP)`);
      setGrantTarget(null);
      setGrantAmount(0);
      setGrantDesc('');
    } catch {
      toast.error('포인트 처리에 실패했습니다');
    } finally {
      setGrantLoading(false);
    }
  };

  return (
    <div>
      {/* 검색 + 총 수 */}
      <div className="flex items-center gap-4 mb-5">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-sm">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="username / email 검색..."
            className="input flex-1 text-xs"
          />
          <button type="submit" className="btn-primary px-4 py-2 text-xs">검색</button>
        </form>
        <span className="text-ssolap-muted text-xs font-mono ml-auto">
          총 {total.toLocaleString()}명
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-ssolap-border text-ssolap-muted tracking-wide">
              <th className="text-left pb-2 pr-4">유저</th>
              <th className="text-left pb-2 pr-4">역할</th>
              <th className="text-right pb-2 pr-4">게시물</th>
              <th className="text-right pb-2 pr-4">포인트</th>
              <th className="text-left pb-2 pr-4">가입일</th>
              <th className="text-left pb-2">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ssolap-border/20">
            {loading && users.length === 0 && (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="py-3">
                    <div className="h-4 bg-ssolap-border/30 rounded" />
                  </td>
                </tr>
              ))
            )}
            {users.map((u) => (
              <tr key={u.id} className={`hover:bg-white/2 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                {/* 유저 정보 */}
                <td className="py-2.5 pr-4">
                  <p className="text-ssolap-silver font-semibold">{u.display_name}</p>
                  <p className="text-ssolap-muted/60">@{u.username}</p>
                </td>
                {/* 역할 */}
                <td className="py-2.5 pr-4">
                  {editId === u.id ? (
                    <div className="flex gap-1">
                      {(['user', 'creator', 'admin'] as const).map((r) => (
                        <button key={r} onClick={() => handleSetRole(u, r)}
                          className={`text-[9px] border px-1.5 py-0.5 transition-colors
                            ${u.role === r ? 'border-ssolap-silver/50 text-ssolap-silver' : 'border-ssolap-border text-ssolap-muted hover:text-ssolap-silver'}`}>
                          {r}
                        </button>
                      ))}
                      <button onClick={() => setEditId(null)} className="text-ssolap-muted/50 hover:text-red-400 text-[9px] ml-1">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setEditId(u.id)}>
                      <RoleBadge role={u.role} />
                    </button>
                  )}
                </td>
                {/* 통계 */}
                <td className="py-2.5 pr-4 text-right font-mono text-ssolap-muted">{u.post_count.toLocaleString()}</td>
                <td className="py-2.5 pr-4 text-right font-mono text-ssolap-muted">
                  <button onClick={() => { setGrantTarget(u); setGrantAmount(0); setGrantDesc(''); }}
                    className="hover:text-ssolap-silver transition-colors">
                    {u.point_balance.toLocaleString()} SP
                  </button>
                </td>
                {/* 가입일 */}
                <td className="py-2.5 pr-4 text-ssolap-muted/60">
                  {format(new Date(u.created_at), 'yy.MM.dd', { locale: ko })}
                </td>
                {/* 액션 */}
                <td className="py-2.5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(u)}
                      className={`text-[10px] transition-colors ${u.is_active ? 'text-ssolap-muted hover:text-red-400' : 'text-green-400/70 hover:text-green-400'}`}
                    >
                      {u.is_active ? '정지' : '활성화'}
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-[10px] text-ssolap-muted/30 hover:text-red-400 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-ssolap-border/30">
          <button
            onClick={() => fetchUsers(page - 1, q)}
            disabled={page <= 1 || loading}
            className="text-ssolap-muted hover:text-ssolap-silver text-xs disabled:opacity-30 transition-colors"
          >
            ← 이전
          </button>
          <span className="text-ssolap-muted/60 text-xs font-mono">{page}</span>
          <button
            onClick={() => fetchUsers(page + 1, q)}
            disabled={!hasNext || loading}
            className="text-ssolap-muted hover:text-ssolap-silver text-xs disabled:opacity-30 transition-colors"
          >
            다음 →
          </button>
        </div>
      )}

      {/* 포인트 지급/차감 모달 */}
      {grantTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[#0D0D1A] border border-ssolap-border w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-ssolap-silver text-sm font-bold tracking-wide">
                포인트 관리 — @{grantTarget.username}
              </h3>
              <button onClick={() => setGrantTarget(null)} className="text-ssolap-muted hover:text-ssolap-silver">✕</button>
            </div>
            <p className="text-ssolap-muted text-xs mb-4">
              현재 잔액: <span className="text-ssolap-silver font-mono">{grantTarget.point_balance.toLocaleString()} SP</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-ssolap-muted text-[10px] tracking-wide block mb-1">금액 (음수 = 차감)</label>
                <input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(Number(e.target.value))}
                  className="input w-full"
                  placeholder="예: 100 또는 -50"
                />
              </div>
              <div>
                <label className="text-ssolap-muted text-[10px] tracking-wide block mb-1">사유</label>
                <input
                  value={grantDesc}
                  onChange={(e) => setGrantDesc(e.target.value)}
                  className="input w-full"
                  placeholder="관리자 지급 사유"
                />
              </div>
              <button
                onClick={handleGrant}
                disabled={grantLoading || !grantDesc.trim() || grantAmount === 0}
                className="btn-primary w-full py-2.5 text-sm disabled:opacity-40"
              >
                {grantLoading ? '처리 중...' : grantAmount >= 0 ? '포인트 지급' : '포인트 차감'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 게시물 관리 탭 ───────────────────────────────────────────────────────────
function PostsTab() {
  const [posts,   setPosts]   = useState<AdminPost[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q,       setQ]       = useState('');

  const fetchPosts = useCallback(async (p: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), per_page: '20' });
      if (search) params.set('q', search);
      const data = await api.get<{ posts: AdminPost[]; total: number; has_next: boolean }>(
        `/admin/posts?${params}`
      );
      setPosts(data.posts);
      setTotal(data.total);
      setHasNext(data.has_next);
      setPage(p);
    } catch {
      toast.error('게시물 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(1, ''); }, [fetchPosts]);

  const handleDelete = async (post: AdminPost) => {
    if (!confirm('이 게시물을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/admin/posts/${post.id}`);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setTotal((t) => t - 1);
      toast.success('게시물이 삭제됐습니다');
    } catch {
      toast.error('삭제에 실패했습니다');
    }
  };

  const TYPE_COLOR: Record<string, string> = {
    text: 'text-ssolap-muted',
    image: 'text-blue-400/70',
    video: 'text-purple-400/70',
    short: 'text-green-400/70',
  };

  return (
    <div>
      {/* 검색 */}
      <div className="flex items-center gap-4 mb-5">
        <form onSubmit={(e) => { e.preventDefault(); fetchPosts(1, q); }} className="flex gap-2 flex-1 max-w-sm">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="내용 검색..."
            className="input flex-1 text-xs"
          />
          <button type="submit" className="btn-primary px-4 py-2 text-xs">검색</button>
        </form>
        <span className="text-ssolap-muted text-xs font-mono ml-auto">총 {total.toLocaleString()}개</span>
      </div>

      <div className="flex flex-col divide-y divide-ssolap-border/20">
        {loading && posts.length === 0 && (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-3 animate-pulse">
              <div className="h-3 bg-ssolap-border/30 w-2/3 mb-1.5" />
              <div className="h-2.5 bg-ssolap-border/20 w-1/3" />
            </div>
          ))
        )}
        {posts.map((p) => (
          <div key={p.id} className="flex items-start gap-4 py-3 hover:bg-white/2 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-mono ${TYPE_COLOR[p.post_type] ?? 'text-ssolap-muted'}`}>
                  [{p.post_type}]
                </span>
                <span className="text-ssolap-muted/50 text-[10px]">@{p.author_username}</span>
                {!p.is_public && (
                  <span className="text-[9px] border border-ssolap-border/40 text-ssolap-muted/50 px-1">비공개</span>
                )}
                <span className="text-ssolap-muted/30 text-[10px] ml-auto">
                  {format(new Date(p.created_at), 'yy.MM.dd HH:mm', { locale: ko })}
                </span>
              </div>
              {p.content && (
                <p className="text-ssolap-silver/80 text-xs line-clamp-2">{p.content}</p>
              )}
              <div className="flex gap-3 mt-1 text-ssolap-muted/50 text-[10px] font-mono">
                <span>♥ {p.like_count}</span>
                <span>◉ {p.comment_count}</span>
                <span>조회 {p.view_count.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={() => handleDelete(p)}
              className="text-[10px] text-ssolap-muted/30 hover:text-red-400 transition-colors flex-shrink-0"
            >
              삭제
            </button>
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {(page > 1 || hasNext) && (
        <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-ssolap-border/30">
          <button onClick={() => fetchPosts(page - 1, q)} disabled={page <= 1 || loading}
            className="text-ssolap-muted hover:text-ssolap-silver text-xs disabled:opacity-30 transition-colors">
            ← 이전
          </button>
          <span className="text-ssolap-muted/60 text-xs font-mono">{page}</span>
          <button onClick={() => fetchPosts(page + 1, q)} disabled={!hasNext || loading}
            className="text-ssolap-muted hover:text-ssolap-silver text-xs disabled:opacity-30 transition-colors">
            다음 →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 알림 발송 탭 ─────────────────────────────────────────────────────────────
function BroadcastTab() {
  const [message,  setMessage]  = useState('');
  const [link,     setLink]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [lastSent, setLastSent] = useState<{ count: number; at: Date } | null>(null);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (!confirm(`모든 유저에게 알림을 발송하시겠습니까?\n\n"${message}"`)) return;

    setLoading(true);
    try {
      const res = await api.post<{ sent: number }>('/admin/notifications/broadcast', {
        message: message.trim(),
        link: link.trim() || undefined,
      });
      setLastSent({ count: res.sent, at: new Date() });
      setMessage('');
      setLink('');
      toast.success(`${res.sent.toLocaleString()}명에게 알림을 발송했습니다`);
    } catch {
      toast.error('알림 발송에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <p className="text-ssolap-muted text-xs mb-6 leading-relaxed">
        활성 상태의 모든 유저(최대 1,000명)에게 시스템 알림을 발송합니다.
        발송된 알림은 취소할 수 없으니 신중히 작성하세요.
      </p>

      <form onSubmit={handleBroadcast} className="space-y-4">
        <div>
          <label className="text-ssolap-muted text-[10px] tracking-wide block mb-1.5">알림 내용 *</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="전체 유저에게 전달할 메시지..."
            rows={4}
            maxLength={500}
            className="input w-full resize-none"
          />
          <p className="text-ssolap-muted/40 text-[10px] text-right mt-1">{message.length}/500</p>
        </div>
        <div>
          <label className="text-ssolap-muted text-[10px] tracking-wide block mb-1.5">연결 링크 (선택)</label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/feed, /points 등..."
            className="input w-full"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="btn-primary w-full py-3 text-sm disabled:opacity-40"
        >
          {loading ? '발송 중...' : '전체 발송'}
        </button>
      </form>

      {lastSent && (
        <div className="mt-5 p-4 border border-green-500/20 bg-green-500/5">
          <p className="text-green-400 text-xs">
            ✓ {lastSent.count.toLocaleString()}명 발송 완료
            <span className="ml-2 text-ssolap-muted/50">
              ({formatDistanceToNow(lastSent.at, { addSuffix: true, locale: ko })})
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuthStore();
  const router   = useRouter();
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'posts' | 'broadcast'>('stats');

  // 어드민 권한 체크
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/feed');
      toast.error('관리자 권한이 필요합니다');
    }
  }, [user, router]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-ssolap-muted text-xs tracking-widest">접근 권한이 없습니다</p>
      </div>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-ssolap-silver font-bold text-sm tracking-[0.3em] uppercase">
          Admin
        </h1>
        <span className="text-red-400 text-[10px] border border-red-400/30 px-1.5 py-0.5">
          @{user.username}
        </span>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-7 border-b border-ssolap-border pb-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`
              px-4 py-2 text-xs tracking-wide transition-all border-b-2 -mb-px
              ${activeTab === key
                ? 'border-ssolap-silver text-ssolap-silver'
                : 'border-transparent text-ssolap-muted hover:text-ssolap-silver'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === 'stats'     && <StatsTab />}
      {activeTab === 'users'     && <UsersTab />}
      {activeTab === 'posts'     && <PostsTab />}
      {activeTab === 'broadcast' && <BroadcastTab />}
    </div>
  );
}
