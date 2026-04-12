'use client';

/**
 * search/page.tsx — 검색 결과 페이지
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface UserResult {
  id: number; username: string; display_name: string;
  bio?: string; avatar_url?: string; follower_count: number; is_verified: boolean;
}
interface PostResult {
  id: number; content?: string; post_type: string;
  like_count: number; comment_count: number;
  author_username: string; author_display_name: string; created_at: string;
}
interface RoomResult {
  id: number; name: string; description?: string;
  room_type: string; entry_type: string; entry_fee: number; member_count: number;
}
interface SearchResponse {
  query: string;
  users: UserResult[];  user_total: number;
  posts: PostResult[];  post_total: number;
  rooms: RoomResult[];  room_total: number;
}

const TABS = [
  { key: 'all',  label: '전체' },
  { key: 'user', label: '유저' },
  { key: 'post', label: '게시물' },
  { key: 'room', label: '채팅방' },
] as const;

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="card animate-pulse flex items-center gap-3">
      <div className="w-10 h-10 bg-ssolap-border flex-shrink-0" />
      <div className="flex-1">
        <div className="h-3 w-1/2 bg-ssolap-border mb-1.5" />
        <div className="h-2.5 w-3/4 bg-ssolap-border/60" />
      </div>
    </div>
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const q            = searchParams.get('q') ?? '';

  const [activeTab, setActiveTab] = useState<'all' | 'user' | 'post' | 'room'>('all');
  const [results,   setResults]   = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!q) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<SearchResponse>(
          `/search?q=${encodeURIComponent(q)}&type=${activeTab}`
        );
        setResults(data);
      } catch {
        toast.error('검색에 실패했습니다');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [q, activeTab]);

  const totalCount = results
    ? (results.user_total + results.post_total + results.room_total)
    : 0;

  return (
    <div>
      {/* 검색어 + 결과 수 */}
      <div className="mb-5">
        {q ? (
          <p className="text-ssolap-muted text-sm">
            <span className="text-ssolap-silver font-semibold">"{q}"</span>
            {results && !isLoading && (
              <span className="ml-2 text-xs">— {totalCount.toLocaleString()}개 결과</span>
            )}
          </p>
        ) : (
          <p className="text-ssolap-muted text-xs">검색어를 입력하세요</p>
        )}
      </div>

      {/* 탭 필터 */}
      <div className="flex gap-2 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`
              px-4 py-1.5 text-xs tracking-wide border transition-all
              ${activeTab === key
                ? 'border-ssolap-silver/40 bg-ssolap-silver/10 text-ssolap-silver'
                : 'border-ssolap-border text-ssolap-muted hover:text-ssolap-silver'
              }
            `}
          >
            {label}
            {results && key !== 'all' && (
              <span className="ml-1.5 text-ssolap-muted/60 font-mono text-[10px]">
                {key === 'user' ? results.user_total : key === 'post' ? results.post_total : results.room_total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}
        </div>
      )}

      {!isLoading && q && results && (
        <div className="space-y-8">

          {/* ── 유저 결과 ───────────────────────────────────────── */}
          {(activeTab === 'all' || activeTab === 'user') && results.users.length > 0 && (
            <section>
              {activeTab === 'all' && (
                <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-3">
                  유저 {results.user_total}
                </h3>
              )}
              <div className="flex flex-col gap-3">
                {results.users.map((u) => (
                  <Link key={u.id} href={`/profile/${u.username}`} className="card flex items-center gap-3 hover:border-ssolap-silver/30 transition-colors">
                    <div className="w-10 h-10 bg-ssolap-silver/10 border border-ssolap-border flex items-center justify-center text-ssolap-silver text-sm font-bold flex-shrink-0">
                      {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : u.display_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ssolap-silver text-sm font-semibold">
                        {u.display_name}
                        {u.is_verified && <span className="ml-1 text-xs text-ssolap-silver/60">✦</span>}
                      </p>
                      <p className="text-ssolap-muted text-xs">@{u.username}</p>
                    </div>
                    <p className="text-ssolap-muted text-xs font-mono flex-shrink-0">
                      {u.follower_count.toLocaleString()} 팔로워
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── 게시물 결과 ─────────────────────────────────────── */}
          {(activeTab === 'all' || activeTab === 'post') && results.posts.length > 0 && (
            <section>
              {activeTab === 'all' && (
                <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-3">
                  게시물 {results.post_total}
                </h3>
              )}
              <div className="flex flex-col gap-3">
                {results.posts.map((p) => (
                  <Link key={p.id} href={`/post/${p.id}`} className="card hover:border-ssolap-silver/30 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-ssolap-muted text-xs">@{p.author_username}</span>
                      <span className="text-ssolap-muted/30 text-xs">·</span>
                      <span className="text-ssolap-muted/50 text-[10px]">
                        {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: ko })}
                      </span>
                    </div>
                    {p.content && (
                      <p className="text-ssolap-silver/90 text-sm leading-relaxed line-clamp-3">
                        {p.content}
                      </p>
                    )}
                    <div className="flex gap-4 mt-3 text-ssolap-muted text-xs">
                      <span>♥ {p.like_count}</span>
                      <span>◉ {p.comment_count}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── 채팅방 결과 ─────────────────────────────────────── */}
          {(activeTab === 'all' || activeTab === 'room') && results.rooms.length > 0 && (
            <section>
              {activeTab === 'all' && (
                <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-3">
                  채팅방 {results.room_total}
                </h3>
              )}
              <div className="flex flex-col gap-3">
                {results.rooms.map((r) => (
                  <div key={r.id} className="card flex items-center gap-3">
                    <div className="w-10 h-10 bg-ssolap-silver/10 border border-ssolap-border flex items-center justify-center text-ssolap-silver text-sm font-bold flex-shrink-0">
                      {r.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ssolap-silver text-sm font-semibold truncate">{r.name}</p>
                      <p className="text-ssolap-muted text-xs">
                        {r.member_count}명 · {r.entry_type === 'open' ? '자유 입장' : r.entry_type === 'password' ? '비밀번호' : `${r.entry_fee} SP`}
                      </p>
                    </div>
                    <Link
                      href="/chat"
                      className="btn-primary text-xs py-1.5 px-4 flex-shrink-0"
                    >
                      입장
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 결과 없음 */}
          {totalCount === 0 && (
            <div className="text-center py-16">
              <div className="text-3xl text-ssolap-silver/10 mb-3">◎</div>
              <p className="text-ssolap-muted text-xs tracking-widest">검색 결과가 없습니다</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
