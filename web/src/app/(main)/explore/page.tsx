'use client';

/**
 * explore/page.tsx — 탐색 페이지 (전체 공개 게시물)
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFeedStore } from '@/store/feedStore';
import PostCard from '@/components/feed/PostCard';

const FILTERS = [
  { value: '',       label: '전체' },
  { value: 'text',   label: '텍스트' },
  { value: 'image',  label: '이미지' },
  { value: 'video',  label: '영상' },
  { value: 'short',  label: '숏폼' },
] as const;

function PostSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-ssolap-border" />
        <div className="flex-1">
          <div className="h-3 w-28 bg-ssolap-border mb-1.5" />
          <div className="h-2.5 w-20 bg-ssolap-border/60" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full bg-ssolap-border" />
        <div className="h-3 w-3/4 bg-ssolap-border" />
      </div>
      <div className="h-px bg-ssolap-border/50" />
    </div>
  );
}

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const query        = searchParams.get('q') ?? '';
  const [activeFilter, setActiveFilter] = useState('');

  const { posts, hasNext, isLoading, isFetching, fetchExplore, loadMore, reset } = useFeedStore();

  useEffect(() => {
    reset();
    fetchExplore(true, activeFilter || undefined);
  }, [activeFilter]);  // eslint-disable-line react-hooks/exhaustive-deps

  const loaderRef = useRef<HTMLDivElement>(null);
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNext && !isFetching) {
        fetchExplore(false, activeFilter || undefined);
      }
    },
    [hasNext, isFetching, activeFilter, fetchExplore]
  );

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <div>
      {/* ── 검색 결과 표시 ────────────────────────────────────────── */}
      {query && (
        <div className="mb-5 px-1">
          <p className="text-ssolap-muted text-xs">
            <span className="text-ssolap-silver font-semibold">"{query}"</span> 검색 결과
          </p>
        </div>
      )}

      {/* ── 타입 필터 ─────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveFilter(value)}
            className={`
              flex-shrink-0 px-4 py-2 text-xs tracking-wide transition-all
              ${activeFilter === value
                ? 'bg-ssolap-silver/15 text-ssolap-silver border border-ssolap-silver/40'
                : 'text-ssolap-muted hover:text-ssolap-silver border border-ssolap-border hover:border-ssolap-border/80'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 스켈레톤 ──────────────────────────────────────────────── */}
      {isLoading && posts.length === 0 && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => <PostSkeleton key={i} />)}
        </div>
      )}

      {/* ── 게시물 목록 ────────────────────────────────────────────── */}
      {!isLoading && posts.length === 0 && (
        <div className="text-center py-20">
          <div className="text-4xl text-ssolap-silver/20 mb-4">◎</div>
          <p className="text-ssolap-muted text-xs tracking-widest">게시물이 없습니다</p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <div ref={loaderRef} className="py-6 text-center">
        {isFetching && (
          <span className="text-ssolap-muted text-xs tracking-widest animate-pulse">
            로딩 중...
          </span>
        )}
        {!hasNext && posts.length > 0 && (
          <span className="text-ssolap-muted/40 text-xs tracking-widest">
            — 끝 —
          </span>
        )}
      </div>
    </div>
  );
}
