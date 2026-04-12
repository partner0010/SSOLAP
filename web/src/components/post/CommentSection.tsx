'use client';

/**
 * CommentSection.tsx — 댓글 + 대댓글 스레드 컴포넌트
 * - 최상위 댓글 목록 (페이지네이션)
 * - 대댓글 인라인 표시 (접기/펼치기)
 * - 댓글/대댓글 작성 폼
 * - 댓글 삭제 (작성자 본인)
 */
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface Author {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

interface Reply {
  id: number;
  post_id: number;
  author: Author;
  parent_id: number | null;
  content: string;
  like_count: number;
  created_at: string;
}

interface Comment {
  id: number;
  post_id: number;
  author: Author;
  parent_id: number | null;
  content: string;
  like_count: number;
  replies: Reply[];
  created_at: string;
}

interface CommentsPageResponse {
  comments: Comment[];
  total: number;
  has_next: boolean;
}

// ─── 아바타 ───────────────────────────────────────────────────────────────────
function Avatar({ author, size = 8 }: { author: Author; size?: number }) {
  const cls = `w-${size} h-${size} flex-shrink-0 border border-ssolap-border flex items-center justify-center text-ssolap-silver font-bold bg-ssolap-silver/10 overflow-hidden`;
  return (
    <div className={cls} style={{ fontSize: size < 10 ? '10px' : '14px' }}>
      {author.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={author.avatar_url} alt="" className="w-full h-full object-cover" />
        : author.display_name[0]
      }
    </div>
  );
}

// ─── 댓글 입력 폼 ─────────────────────────────────────────────────────────────
function CommentForm({
  postId,
  parentId,
  placeholder,
  onSubmit,
  onCancel,
  compact,
}: {
  postId: number;
  parentId?: number;
  placeholder?: string;
  onSubmit: (comment: Comment) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (compact) textRef.current?.focus();
  }, [compact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    if (!user) { toast.error('로그인이 필요합니다'); return; }

    setIsSubmitting(true);
    try {
      const comment = await api.post<Comment>(`/posts/${postId}/comments`, {
        content: content.trim(),
        parent_id: parentId ?? null,
      });
      setContent('');
      onSubmit(comment);
    } catch {
      toast.error('댓글 작성에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2.5 ${compact ? '' : 'mt-4'}`}>
      {!compact && <Avatar author={{ id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url }} />}
      <div className="flex-1">
        <textarea
          ref={textRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder ?? '댓글을 입력하세요...'}
          rows={compact ? 2 : 3}
          className="
            w-full bg-white/5 border border-ssolap-border
            px-3 py-2 text-xs text-ssolap-silver resize-none
            placeholder:text-ssolap-muted
            focus:outline-none focus:border-ssolap-silver/50
            transition-colors
          "
        />
        <div className="flex items-center justify-end gap-2 mt-1.5">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-ssolap-muted hover:text-ssolap-silver text-xs transition-colors"
            >
              취소
            </button>
          )}
          <button
            type="submit"
            disabled={!content.trim() || isSubmitting}
            className="btn-primary text-[10px] py-1 px-3 disabled:opacity-40"
          >
            {isSubmitting ? '작성 중...' : parentId ? '답글' : '댓글'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── 대댓글 아이템 ─────────────────────────────────────────────────────────────
function ReplyItem({
  reply, currentUserId, onDelete,
}: {
  reply: Reply;
  currentUserId?: number;
  onDelete: (id: number) => void;
}) {
  const isOwner = currentUserId === reply.author.id;

  return (
    <div className="flex gap-2 mt-3">
      <div className="flex-shrink-0 w-5 flex flex-col items-center pt-1">
        <div className="w-px flex-1 bg-ssolap-border/40" />
      </div>
      <Avatar author={reply.author} size={7} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-ssolap-silver text-[11px] font-semibold">{reply.author.display_name}</span>
          <span className="text-ssolap-muted/50 text-[10px]">@{reply.author.username}</span>
          <span className="text-ssolap-muted/30 text-[10px]">·</span>
          <span className="text-ssolap-muted/40 text-[10px]">
            {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true, locale: ko })}
          </span>
        </div>
        <p className="text-ssolap-silver/80 text-xs mt-0.5 leading-relaxed">{reply.content}</p>
      </div>
      {isOwner && (
        <button
          onClick={() => onDelete(reply.id)}
          className="text-ssolap-muted/30 hover:text-red-400 text-[10px] flex-shrink-0 transition-colors self-start pt-0.5"
        >
          삭제
        </button>
      )}
    </div>
  );
}

// ─── 댓글 아이템 ─────────────────────────────────────────────────────────────
function CommentItem({
  comment, postId, currentUserId, onDelete,
}: {
  comment: Comment;
  postId: number;
  currentUserId?: number;
  onDelete: (id: number, parentId?: number) => void;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(comment.replies.length > 0 && comment.replies.length <= 3);
  const [replies, setReplies] = useState<Reply[]>(comment.replies);
  const isOwner = currentUserId === comment.author.id;

  const handleReplySubmit = (newComment: Comment) => {
    setReplies((prev) => [...prev, newComment as unknown as Reply]);
    setShowReplies(true);
    setShowReplyForm(false);
  };

  const handleDeleteReply = async (replyId: number) => {
    if (!confirm('답글을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/posts/${postId}/comments/${replyId}`);
      setReplies((prev) => prev.filter((r) => r.id !== replyId));
      toast.success('답글이 삭제되었습니다');
    } catch {
      toast.error('삭제에 실패했습니다');
    }
  };

  return (
    <div className="py-4 border-b border-ssolap-border/30">
      {/* 댓글 본문 */}
      <div className="flex gap-3">
        <Avatar author={comment.author} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-ssolap-silver text-xs font-semibold">{comment.author.display_name}</span>
            <span className="text-ssolap-muted/50 text-[10px]">@{comment.author.username}</span>
            <span className="text-ssolap-muted/30 text-[10px]">·</span>
            <span className="text-ssolap-muted/40 text-[10px]">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ko })}
            </span>
          </div>
          <p className="text-ssolap-silver/90 text-sm mt-1 leading-relaxed">{comment.content}</p>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-3 mt-2">
            {/* 답글 토글 */}
            {currentUserId && (
              <button
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="text-ssolap-muted hover:text-ssolap-silver text-[10px] tracking-wide transition-colors"
              >
                답글
              </button>
            )}
            {/* 대댓글 펼치기/접기 */}
            {replies.length > 0 && (
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="text-ssolap-muted hover:text-ssolap-silver text-[10px] tracking-wide transition-colors"
              >
                {showReplies ? `답글 접기` : `답글 ${replies.length}개 보기`}
              </button>
            )}
          </div>

          {/* 대댓글 목록 */}
          {showReplies && replies.length > 0 && (
            <div className="mt-2 space-y-0">
              {replies.map((r) => (
                <ReplyItem
                  key={r.id}
                  reply={r}
                  currentUserId={currentUserId}
                  onDelete={handleDeleteReply}
                />
              ))}
            </div>
          )}

          {/* 대댓글 폼 */}
          {showReplyForm && (
            <div className="mt-3">
              <CommentForm
                postId={postId}
                parentId={comment.id}
                placeholder={`@${comment.author.username}에게 답글...`}
                onSubmit={handleReplySubmit}
                onCancel={() => setShowReplyForm(false)}
                compact
              />
            </div>
          )}
        </div>

        {/* 삭제 버튼 */}
        {isOwner && (
          <button
            onClick={() => onDelete(comment.id)}
            className="text-ssolap-muted/30 hover:text-red-400 text-[10px] flex-shrink-0 transition-colors self-start"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function CommentSection({
  postId, initialCount,
}: {
  postId: number;
  initialCount: number;
}) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(initialCount);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // 초기 로드
  useEffect(() => {
    loadComments(1, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const loadComments = async (p: number, reset = false) => {
    setIsLoading(true);
    try {
      const data = await api.get<CommentsPageResponse>(
        `/posts/${postId}/comments?page=${p}&per_page=20`
      );
      if (reset) {
        setComments(data.comments);
      } else {
        setComments((prev) => [...prev, ...data.comments]);
      }
      setTotal(data.total);
      setHasNext(data.has_next);
      setPage(p);
    } catch {
      toast.error('댓글을 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewComment = (comment: Comment) => {
    setComments((prev) => [...prev, comment]);
    setTotal((t) => t + 1);
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/posts/${postId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((t) => Math.max(0, t - 1));
      toast.success('댓글이 삭제되었습니다');
    } catch {
      toast.error('삭제에 실패했습니다');
    }
  };

  return (
    <div>
      {/* 헤더 */}
      <h3 className="text-ssolap-silver text-[10px] font-bold tracking-[0.3em] uppercase mb-4">
        댓글 {total.toLocaleString()}
      </h3>

      {/* 새 댓글 폼 */}
      <CommentForm postId={postId} onSubmit={handleNewComment} />

      {/* 로딩 스켈레톤 */}
      {isLoading && comments.length === 0 && (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 bg-ssolap-border flex-shrink-0" />
              <div className="flex-1">
                <div className="h-2.5 w-24 bg-ssolap-border mb-2" />
                <div className="h-3 w-3/4 bg-ssolap-border/60" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 댓글 없음 */}
      {!isLoading && comments.length === 0 && (
        <div className="text-center py-10 mt-4">
          <div className="text-2xl text-ssolap-silver/10 mb-2">◉</div>
          <p className="text-ssolap-muted/40 text-xs tracking-widest">첫 댓글을 남겨보세요</p>
        </div>
      )}

      {/* 댓글 목록 */}
      {comments.length > 0 && (
        <div className="mt-4">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              postId={postId}
              currentUserId={user?.id}
              onDelete={handleDeleteComment}
            />
          ))}
        </div>
      )}

      {/* 더 보기 */}
      {hasNext && (
        <div className="pt-4 text-center">
          <button
            onClick={() => loadComments(page + 1)}
            disabled={isLoading}
            className="text-ssolap-muted hover:text-ssolap-silver text-xs tracking-wide transition-colors disabled:opacity-40"
          >
            {isLoading ? '로딩 중...' : '댓글 더 보기'}
          </button>
        </div>
      )}
    </div>
  );
}
