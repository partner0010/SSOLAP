'use client';

/**
 * CreatePost.tsx — 게시물 작성 컴포넌트 (파일 업로드 통합)
 */
import { useState } from 'react';
import { useFeedStore, type CreatePostData } from '@/store/feedStore';
import { useAuthStore } from '@/store/authStore';
import FileUpload from './FileUpload';
import toast from 'react-hot-toast';

// ─── 게시물 타입 탭 ────────────────────────────────────────────────────────────
const POST_TYPES = [
  { value: 'text',  label: '텍스트',  icon: '✏' },
  { value: 'image', label: '이미지',  icon: '◻' },
  { value: 'video', label: '영상',    icon: '▷' },
  { value: 'short', label: '숏폼',    icon: '↑' },
] as const;

type PostType = (typeof POST_TYPES)[number]['value'];

interface UploadedFile {
  url:        string;
  media_type: 'image' | 'video';
  name:       string;
  size:       number;
  preview?:   string;
}

interface CreatePostProps {
  onSuccess?: () => void;
}

export default function CreatePost({ onSuccess }: CreatePostProps) {
  const [content,     setContent]     = useState('');
  const [postType,    setPostType]    = useState<PostType>('text');
  const [isPublic,    setIsPublic]    = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [isExpanded,  setIsExpanded]  = useState(false);

  const { createPost } = useFeedStore();
  const { user } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (postType === 'text' && !content.trim()) {
      toast.error('내용을 입력해주세요');
      return;
    }
    if (['image', 'video', 'short'].includes(postType) && uploadedFiles.length === 0) {
      toast.error('파일을 업로드해주세요');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: CreatePostData = {
        content:   content.trim() || undefined,
        post_type: postType,
        is_public: isPublic,
        media:     uploadedFiles.map((f) => ({
          url:        f.url,
          media_type: f.media_type,
        })),
      };
      await createPost(data);

      // 초기화
      setContent('');
      setUploadedFiles([]);
      setPostType('text');
      setIsExpanded(false);

      toast.success('게시물이 업로드됐습니다 (+20 SP)');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message ?? '게시물 업로드에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  const fileUploadType = postType === 'image'
    ? 'image'
    : postType === 'video' || postType === 'short'
    ? 'video'
    : 'both';

  return (
    <div className="card mb-6">
      {/* ── 컴팩트 모드 (클릭 전) ─────────────────────────────────── */}
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center gap-3 text-left"
        >
          <div className="
            w-8 h-8 bg-ssolap-silver/10 border border-ssolap-border
            flex items-center justify-center text-ssolap-silver text-xs font-bold flex-shrink-0
          ">
            {user.display_name[0].toUpperCase()}
          </div>
          <span className="text-ssolap-muted/60 text-sm flex-1 border border-ssolap-border/40 px-4 py-2">
            무슨 생각을 하고 있나요?
          </span>
        </button>
      ) : (

      /* ── 확장 모드 (작성 중) ──────────────────────────────────── */
      <form onSubmit={handleSubmit}>
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="
            w-8 h-8 bg-ssolap-silver/10 border border-ssolap-border
            flex items-center justify-center text-ssolap-silver text-xs font-bold flex-shrink-0
          ">
            {user.display_name[0].toUpperCase()}
          </div>
          <span className="text-ssolap-silver text-xs font-medium">@{user.username}</span>

          {/* 닫기 */}
          <button
            type="button"
            onClick={() => { setIsExpanded(false); setContent(''); setUploadedFiles([]); }}
            className="ml-auto text-ssolap-muted hover:text-ssolap-silver text-xs"
          >
            취소
          </button>
        </div>

        {/* 게시물 타입 선택 */}
        <div className="flex gap-1 mb-4">
          {POST_TYPES.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setPostType(value); setUploadedFiles([]); }}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wide transition-all
                ${postType === value
                  ? 'bg-ssolap-silver/15 text-ssolap-silver border border-ssolap-silver/40'
                  : 'text-ssolap-muted hover:text-ssolap-silver border border-transparent'
                }
              `}
            >
              <span>{icon}</span>
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
            postType === 'image' ? '이미지 설명 (선택)' :
            postType === 'video' ? '영상 설명 (선택)' :
                                   '숏폼 설명 (선택)'
          }
          rows={postType === 'text' ? 4 : 2}
          maxLength={2000}
          autoFocus
          className="
            w-full bg-transparent border-none outline-none resize-none
            text-sm text-ssolap-silver placeholder:text-ssolap-muted/60
            leading-relaxed mb-3
          "
        />

        {/* 파일 업로드 (텍스트 게시물 제외) */}
        {postType !== 'text' && (
          <div className="mb-4">
            <FileUpload
              type={fileUploadType}
              maxFiles={postType === 'image' ? 4 : 1}
              files={uploadedFiles}
              onChange={setUploadedFiles}
            />
          </div>
        )}

        {/* 하단 옵션 + 제출 */}
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                전체 공개
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                나만 보기
              </>
            )}
          </button>

          <div className="flex items-center gap-3">
            {content.length > 100 && (
              <span className="text-ssolap-muted text-xs font-mono">
                {content.length}/2000
              </span>
            )}
            <button
              type="submit"
              disabled={
                isSubmitting ||
                (postType === 'text' && !content.trim()) ||
                (['image', 'video', 'short'].includes(postType) && uploadedFiles.length === 0)
              }
              className="btn-primary text-xs py-2 px-5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '업로드 중...' : '게시'}
            </button>
          </div>
        </div>
      </form>
      )}
    </div>
  );
}
