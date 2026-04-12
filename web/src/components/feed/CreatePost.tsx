'use client';

/**
 * CreatePost.tsx — 게시물 작성 컴포넌트
 */
import { useState, useRef } from 'react';
import { useFeedStore, type CreatePostData } from '@/store/feedStore';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

// ─── 타입 탭 ──────────────────────────────────────────────────────────────────
const POST_TYPES = [
  { value: 'text',  label: '텍스트' },
  { value: 'image', label: '이미지' },
  { value: 'video', label: '영상' },
  { value: 'short', label: '숏폼' },
] as const;

type PostType = (typeof POST_TYPES)[number]['value'];

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface CreatePostProps {
  onSuccess?: () => void;
}

export default function CreatePost({ onSuccess }: CreatePostProps) {
  const [content,  setContent]  = useState('');
  const [postType, setPostType] = useState<PostType>('text');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createPost } = useFeedStore();
  const { user } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && postType === 'text') {
      toast.error('내용을 입력해주세요');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: CreatePostData = {
        content:   content.trim() || undefined,
        post_type: postType,
        is_public: isPublic,
        media:     [],
      };
      await createPost(data);
      setContent('');
      setPostType('text');
      toast.success('게시물이 업로드됐습니다');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message ?? '게시물 업로드에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="card mb-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="
          w-8 h-8 bg-ssolap-silver/10 border border-ssolap-border
          flex items-center justify-center text-ssolap-silver text-xs font-bold flex-shrink-0
        ">
          {user.display_name[0].toUpperCase()}
        </div>
        <span className="text-ssolap-muted text-xs">@{user.username}</span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 게시물 타입 선택 */}
        <div className="flex gap-1 mb-3">
          {POST_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPostType(value)}
              className={`
                px-3 py-1.5 text-xs tracking-wide transition-all
                ${postType === value
                  ? 'bg-ssolap-silver/15 text-ssolap-silver border border-ssolap-silver/40'
                  : 'text-ssolap-muted hover:text-ssolap-silver border border-transparent'
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 텍스트 입력 */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            postType === 'text'  ? '무슨 생각을 하고 있나요?' :
            postType === 'image' ? '이미지에 대한 설명을 입력하세요...' :
            postType === 'video' ? '영상에 대한 설명을 입력하세요...' :
                                   '숏폼 설명을 입력하세요...'
          }
          rows={3}
          maxLength={2000}
          className="
            w-full bg-transparent border-none outline-none resize-none
            text-sm text-ssolap-silver placeholder:text-ssolap-muted/60
            leading-relaxed mb-3
          "
        />

        {/* 이미지/영상 업로드 (향후 구현 안내) */}
        {postType !== 'text' && (
          <div className="
            border border-dashed border-ssolap-border/60
            py-6 text-center mb-3
            text-ssolap-muted text-xs tracking-wide
          ">
            <svg className="mx-auto mb-2 opacity-40" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="0" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            파일 업로드 (Phase 3에서 구현 예정)
          </div>
        )}

        {/* 하단: 공개 설정 + 제출 버튼 */}
        <div className="flex items-center justify-between pt-3 border-t border-ssolap-border/50">
          {/* 공개 설정 */}
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`
              flex items-center gap-1.5 text-xs transition-colors
              ${isPublic ? 'text-ssolap-silver' : 'text-ssolap-muted'}
            `}
          >
            {isPublic ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                전체 공개
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="0"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                나만 보기
              </>
            )}
          </button>

          {/* 글자 수 + 제출 */}
          <div className="flex items-center gap-3">
            {content.length > 0 && (
              <span className="text-ssolap-muted text-xs font-mono">
                {content.length}/2000
              </span>
            )}
            <button
              type="submit"
              disabled={isSubmitting || (!content.trim() && postType === 'text')}
              className="btn-primary text-xs py-2 px-5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '업로드 중...' : '게시'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
