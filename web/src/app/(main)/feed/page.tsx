'use client';

/**
 * feed/page.tsx — 메인 피드 페이지
 * 팔로잉 기반 피드 + 게시물 작성
 */
import { useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFeedStore } from '@/store/feedStore';
import PostCard from '@/components/feed/PostCard';
import CreatePost from '@/components/feed/CreatePost';
import StoryBar from '@/components/story/StoryBar';

// ─── 스켈레톤 로딩 ───────────────────────────────────────────────────────────

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
        <div className="h-3 w-4/5 bg-ssolap-border" />
        <div className="h-3 w-3/5 bg-ssolap-border" />
      </div>
      <div className="h-px bg-ssolap-border/50" />
    </div>
  );
}

// ─── 빈 피드 상태 ─────────────────────────────────────────────────────────────

function EmptyFeed() {
  return (
    <div className="text-center py-20">
      <div className="text-4xl text-ssolap-silver/20 mb-4">◈</div>
      <p className="text-ssolap-silver text-sm font-semibold tracking-widest mb-2">
        피드가 비어있습니다
      </p>
      <p className="text-ssolap-muted text-xs leading-relaxed">
        새 게시물을 작성하거나<br />
        다른 유저를 팔로우해보세요
      </p>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function FeedPage() {
  const searchParams = useSearchParams();
  const showCreate   = searchParams.get('create') === 'true';

  const {
    posts, hasNext, isLoading, isFetching, error,
    fetchFeed, loadMore,
  } = useFeedStore();

  // 최초 마운트 시 피드 로드
  useEffect(() => {
    fetchFeed(true);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 무한 스크롤 ────────────────────────────────────────────────────────
  const loaderRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNext && !isFetching) {
        loadMore();
      }
    },
    [hasNext, isFetching, loadMore]
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
      {/* ── 스토리 바 ──────────────────────────────────────────────── */}
      <StoryBar />

      {/* ── 게시물 작성 폼 ─────────────────────────────────────────── */}
      <CreatePost />

      {/* ── 피드 헤더 ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-ssolap-silver text-xs font-bold tracking-[0.3em] uppercase">
          팔로잉 피드
        </h2>
        <button
          onClick={() => fetchFeed(true)}
          className="text-ssolap-muted hover:text-ssolap-silver text-xs transition-colors"
        >
          새로고침
        </button>
      </div>

      {/* ── 에러 ───────────────────────────────────────────────────── */}
      {error && (
        <div className="card border-red-500/30 bg-red-500/5 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => fetchFeed(true)}
            className="mt-2 text-xs text-red-400/70 hover:text-red-400 underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* ── 최초 로딩 스켈레톤 ─────────────────────────────────────── */}
      {isLoading && posts.length === 0 && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ── 게시물 목록 ────────────────────────────────────────────── */}
      {!isLoading && posts.length === 0 && !error && <EmptyFeed />}

      {posts.length > 0 && (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {/* ── 더보기 로딩 인디케이터 ────────────────────────────────── */}
      <div ref={loaderRef} className="py-6 text-center">
        {isFetching && (
          <span className="text-ssolap-muted text-xs tracking-widest animate-pulse">
            로딩 중...
          </span>
        )}
        {!hasNext && posts.length > 0 && (
          <span className="text-ssolap-muted/40 text-xs tracking-widest">
            — 모든 게시물을 불러왔습니다 —
          </span>
        )}
      </div>
    </div>
  );
}
