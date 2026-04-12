'use client';

/**
 * PostCard.tsx — 피드 게시물 카드
 * SSOLAP 메탈릭 디자인 시스템
 */
import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useFeedStore } from '@/store/feedStore';
import { useAuthStore } from '@/store/authStore';
import type { Post } from '@/types';
import toast from 'react-hot-toast';

// ─── 아이콘 ───────────────────────────────────────────────────────────────────
const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="1.5"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const CommentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const MoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
  </svg>
);

// ─── PostCard ─────────────────────────────────────────────────────────────────

interface PostCardProps {
  post:        Post;
  onDeleted?:  () => void;
}

export default function PostCard({ post, onDeleted }: PostCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const { toggleLike, deletePost } = useFeedStore();
  const { user } = useAuthStore();

  const isOwn = user?.id === post.author.id;

  const handleLike = async () => {
    try {
      await toggleLike(post.id);
    } catch {
      toast.error('좋아요 처리에 실패했습니다');
    }
  };

  const handleDelete = async () => {
    if (!confirm('게시물을 삭제하시겠습니까?')) return;
    try {
      await deletePost(post.id);
      onDeleted?.();
      toast.success('게시물이 삭제됐습니다');
    } catch {
      toast.error('삭제에 실패했습니다');
    }
    setShowMenu(false);
  };

  const timeAgo = formatDistanceToNow(new Date(post.created_at), {
    addSuffix: true,
    locale: ko,
  });

  return (
    <article className="card hover:border-ssolap-silver/20 transition-all duration-150 group">
      {/* ── 헤더: 작성자 + 시간 ───────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4">
        <Link
          href={`/profile/${post.author.username}`}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {/* 아바타 */}
          <div className="
            w-9 h-9 bg-ssolap-silver/10 border border-ssolap-border
            flex items-center justify-center text-ssolap-silver text-xs font-bold
            flex-shrink-0
          ">
            {post.author.avatar_url ? (
              <img
                src={post.author.avatar_url}
                alt={post.author.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              post.author.display_name[0].toUpperCase()
            )}
          </div>
          {/* 이름 */}
          <div>
            <p className="text-ssolap-silver text-sm font-semibold leading-none">
              {post.author.display_name}
            </p>
            <p className="text-ssolap-muted text-xs mt-0.5">
              @{post.author.username} · {timeAgo}
            </p>
          </div>
        </Link>

        {/* 더보기 메뉴 */}
        {isOwn && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-ssolap-muted hover:text-ssolap-silver p-1 transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreIcon />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="
                  absolute right-0 top-6 z-20
                  bg-[#141420] border border-ssolap-border
                  min-w-[120px] shadow-lg
                ">
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 콘텐츠 ────────────────────────────────────────────────────── */}
      {post.content && (
        <p className="text-ssolap-silver/90 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
          {post.content}
        </p>
      )}

      {/* ── 미디어 (이미지) ────────────────────────────────────────────── */}
      {post.media && post.media.length > 0 && (
        <div className={`mb-4 grid gap-1 ${post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {post.media.slice(0, 4).map((m) => (
            <div key={m.id} className="relative overflow-hidden bg-ssolap-border aspect-square">
              {m.media_type === 'image' ? (
                <img
                  src={m.url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <video
                  src={m.url}
                  className="w-full h-full object-cover"
                  controls={false}
                  muted
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 액션 버튼 ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 pt-3 border-t border-ssolap-border/50">
        {/* 좋아요 */}
        <button
          onClick={handleLike}
          className={`
            flex items-center gap-1.5 text-xs transition-all
            ${post.is_liked
              ? 'text-red-400'
              : 'text-ssolap-muted hover:text-red-400'
            }
          `}
        >
          <HeartIcon filled={post.is_liked} />
          {post.like_count > 0 && (
            <span className="font-mono">{post.like_count.toLocaleString()}</span>
          )}
        </button>

        {/* 댓글 */}
        <Link
          href={`/post/${post.id}`}
          className="flex items-center gap-1.5 text-xs text-ssolap-muted hover:text-ssolap-silver transition-colors"
        >
          <CommentIcon />
          {post.comment_count > 0 && (
            <span className="font-mono">{post.comment_count.toLocaleString()}</span>
          )}
        </Link>

        {/* 공유 */}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(`${window.location.origin}/post/${post.id}`);
            toast.success('링크가 복사됐습니다');
          }}
          className="flex items-center gap-1.5 text-xs text-ssolap-muted hover:text-ssolap-silver transition-colors ml-auto"
        >
          <ShareIcon />
        </button>
      </div>
    </article>
  );
}
