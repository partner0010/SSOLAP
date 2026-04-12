'use client';

/**
 * post/[id]/page.tsx — 게시물 상세 페이지
 * - 게시물 전체 내용 표시
 * - 미디어 뷰어 (이미지 갤러리 / 영상 플레이어)
 * - 좋아요 토글 (낙관적 업데이트)
 * - 댓글 스레드
 */
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import MediaViewer from '@/components/post/MediaViewer';
import CommentSection from '@/components/post/CommentSection';
import { formatDistanceToNow, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface Author {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

interface MediaItem {
  id: number;
  url: string;
  media_type: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  display_order: number;
}

interface PostDetail {
  id: number;
  author: Author;
  content?: string;
  post_type: string;
  is_public: boolean;
  like_count: number;
  comment_count: number;
  view_count: number;
  media: MediaItem[];
  is_liked: boolean;
  created_at: string;
  updated_at: string;
}

// ─── POST_TYPE 배지 ───────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  text: '텍스트',
  image: '이미지',
  video: '영상',
  short: '숏폼',
};

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────
function PostSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-ssolap-border" />
        <div className="flex-1">
          <div className="h-3 w-32 bg-ssolap-border mb-1.5" />
          <div className="h-2.5 w-20 bg-ssolap-border/60" />
        </div>
      </div>
      <div className="space-y-2 mb-5">
        <div className="h-3 bg-ssolap-border w-full" />
        <div className="h-3 bg-ssolap-border w-5/6" />
        <div className="h-3 bg-ssolap-border w-4/6" />
      </div>
      <div className="h-[240px] bg-ssolap-border/40" />
    </div>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<PostDetail>(`/posts/${id}`);
        setPost(data);
      } catch (err: unknown) {
        if ((err as { status?: number })?.status === 404) setNotFound(true);
        else toast.error('게시물을 불러오지 못했습니다');
      } finally {
        setIsLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  const handleLike = async () => {
    if (!user) { toast.error('로그인이 필요합니다'); return; }
    if (!post || likeLoading) return;

    // 낙관적 업데이트
    const wasLiked = post.is_liked;
    setPost((p) => p ? {
      ...p,
      is_liked: !p.is_liked,
      like_count: p.is_liked ? p.like_count - 1 : p.like_count + 1,
    } : p);
    setLikeLoading(true);
    try {
      const res = await api.post<{ liked: boolean; like_count: number }>(`/posts/${post.id}/like`);
      setPost((p) => p ? { ...p, is_liked: res.liked, like_count: res.like_count } : p);
    } catch {
      // 실패 시 롤백
      setPost((p) => p ? {
        ...p,
        is_liked: wasLiked,
        like_count: wasLiked ? p.like_count + 1 : p.like_count - 1,
      } : p);
      toast.error('좋아요 처리에 실패했습니다');
    } finally {
      setLikeLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    try {
      await api.delete(`/posts/${post.id}`);
      toast.success('게시물이 삭제되었습니다');
      router.back();
    } catch {
      toast.error('삭제에 실패했습니다');
    }
  };

  // ── 404 ────────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="text-center py-24">
        <div className="text-4xl text-ssolap-silver/10 mb-4">◎</div>
        <p className="text-ssolap-muted text-xs tracking-widest mb-6">게시물을 찾을 수 없습니다</p>
        <button onClick={() => router.back()} className="text-ssolap-muted hover:text-ssolap-silver text-xs transition-colors">
          ← 뒤로가기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* 뒤로가기 + 제목 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="text-ssolap-muted hover:text-ssolap-silver transition-colors text-lg leading-none"
        >
          ←
        </button>
        <h2 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase">
          게시물
        </h2>
      </div>

      {/* 로딩 */}
      {isLoading && <PostSkeleton />}

      {/* 게시물 본문 */}
      {!isLoading && post && (
        <>
          <article className="card mb-6">
            {/* 작성자 헤더 */}
            <div className="flex items-start gap-3 mb-4">
              <Link href={`/profile/${post.author.username}`} className="flex-shrink-0">
                <div className="w-10 h-10 border border-ssolap-border bg-ssolap-silver/10 flex items-center justify-center text-ssolap-silver font-bold overflow-hidden hover:border-ssolap-silver/40 transition-colors">
                  {post.author.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={post.author.avatar_url} alt="" className="w-full h-full object-cover" />
                    : post.author.display_name[0]
                  }
                </div>
              </Link>

              <div className="flex-1 min-w-0">
                <Link href={`/profile/${post.author.username}`}>
                  <p className="text-ssolap-silver text-sm font-semibold hover:underline leading-none mb-0.5">
                    {post.author.display_name}
                  </p>
                </Link>
                <p className="text-ssolap-muted text-xs">@{post.author.username}</p>
              </div>

              {/* 게시물 타입 배지 */}
              <span className="text-ssolap-muted/50 text-[10px] border border-ssolap-border/50 px-1.5 py-0.5 flex-shrink-0">
                {TYPE_LABEL[post.post_type] ?? post.post_type}
              </span>

              {/* 삭제 메뉴 (본인만) */}
              {user?.id === post.author.id && (
                <div className="relative flex-shrink-0">
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDelete}
                        className="text-red-400 hover:text-red-300 text-[10px] transition-colors"
                      >
                        삭제 확인
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="text-ssolap-muted hover:text-ssolap-silver text-[10px] transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-ssolap-muted/40 hover:text-ssolap-muted text-base transition-colors"
                    >
                      ···
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 내용 */}
            {post.content && (
              <p className="text-ssolap-silver/90 text-sm leading-relaxed whitespace-pre-wrap mb-1">
                {post.content}
              </p>
            )}

            {/* 미디어 */}
            {post.media.length > 0 && (
              <MediaViewer media={post.media} postType={post.post_type} />
            )}

            {/* 타임스탬프 */}
            <div className="mt-4 pt-3 border-t border-ssolap-border/30">
              <time
                dateTime={post.created_at}
                className="text-ssolap-muted/40 text-[10px]"
                title={format(new Date(post.created_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
              >
                {format(new Date(post.created_at), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
                <span className="ml-2 text-ssolap-muted/20">
                  ({formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ko })})
                </span>
              </time>
            </div>

            {/* 통계 + 액션 */}
            <div className="mt-3 pt-3 border-t border-ssolap-border/30 flex items-center gap-5">
              {/* 좋아요 */}
              <button
                onClick={handleLike}
                disabled={likeLoading}
                className={`
                  flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50
                  ${post.is_liked ? 'text-red-400' : 'text-ssolap-muted hover:text-red-400'}
                `}
              >
                <span>{post.is_liked ? '♥' : '♡'}</span>
                <span className="text-xs font-mono">{post.like_count.toLocaleString()}</span>
              </button>

              {/* 댓글 수 */}
              <div className="flex items-center gap-1.5 text-ssolap-muted text-sm">
                <span>◉</span>
                <span className="text-xs font-mono">{post.comment_count.toLocaleString()}</span>
              </div>

              {/* 조회수 */}
              <div className="flex items-center gap-1.5 text-ssolap-muted/40 text-sm ml-auto">
                <span className="text-[10px]">조회</span>
                <span className="text-xs font-mono">{post.view_count.toLocaleString()}</span>
              </div>

              {/* 공개/비공개 */}
              {!post.is_public && (
                <span className="text-ssolap-muted/40 text-[10px] border border-ssolap-border/40 px-1.5 py-0.5">
                  비공개
                </span>
              )}
            </div>
          </article>

          {/* 댓글 섹션 */}
          <section className="card">
            <CommentSection postId={post.id} initialCount={post.comment_count} />
          </section>
        </>
      )}
    </div>
  );
}
