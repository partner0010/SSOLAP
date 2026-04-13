'use client';

/**
 * FileUpload.tsx — 파일 업로드 컴포넌트 (드래그&드롭 지원)
 * 이미지/영상 업로드 → API에 전송 → URL 반환
 */
import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { PostMedia } from '@/types';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface UploadedFile {
  url:        string;
  media_type: 'image' | 'video';
  name:       string;
  size:       number;
  preview?:   string;  // 이미지 로컬 미리보기
}

interface FileUploadProps {
  type:       'image' | 'video' | 'both';
  maxFiles?:  number;
  onChange:   (files: UploadedFile[]) => void;
  files:      UploadedFile[];
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const ACCEPT_MAP = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  video: 'video/mp4,video/webm,video/quicktime',
  both:  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',
};

const SIZE_LIMIT = {
  image: 10 * 1024 * 1024,   // 10MB
  video: 200 * 1024 * 1024,  // 200MB
};

function formatBytes(bytes: number): string {
  if (bytes < 1024)           return `${bytes}B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── 업로드 함수 ──────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<UploadedFile> {
  const isVideo = file.type.startsWith('video/');
  const endpoint = isVideo ? '/upload/video' : '/upload/image';

  // 크기 검사
  const limit = isVideo ? SIZE_LIMIT.video : SIZE_LIMIT.image;
  if (file.size > limit) {
    throw new Error(`파일 크기가 너무 큽니다 (최대 ${formatBytes(limit)})`);
  }

  const formData = new FormData();
  formData.append('file', file);

  // JWT 토큰 가져오기 (쿠키에서)
  const accessToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('access_token='))
    ?.split('=')[1];

  const res = await fetch(`/api${endpoint}`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? '업로드에 실패했습니다');
  }

  const data = await res.json();

  // 이미지 미리보기 생성
  let preview: string | undefined;
  if (!isVideo) {
    preview = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  return {
    url:        data.url,
    media_type: isVideo ? 'video' : 'image',
    name:       file.name,
    size:       data.size,
    preview,
  };
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function FileUpload({
  type = 'both',
  maxFiles = 4,
  onChange,
  files,
}: FileUploadProps) {
  const [isDragging,  setIsDragging]  = useState(false);
  const [uploading,   setUploading]   = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // ── 파일 처리 ───────────────────────────────────────────────────────────
  const processFiles = useCallback(
    async (rawFiles: FileList | File[]) => {
      const arr = Array.from(rawFiles);
      const remaining = maxFiles - files.length;
      if (remaining <= 0) {
        toast.error(`최대 ${maxFiles}개까지 업로드 가능합니다`);
        return;
      }
      const toUpload = arr.slice(0, remaining);

      const newUploading = new Set(uploading);
      toUpload.forEach((f) => newUploading.add(f.name));
      setUploading(newUploading);

      const results = await Promise.allSettled(
        toUpload.map((f) => uploadFile(f))
      );

      const uploaded: UploadedFile[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          uploaded.push(r.value);
        } else {
          toast.error(`${toUpload[i].name}: ${r.reason?.message ?? '업로드 실패'}`);
        }
        newUploading.delete(toUpload[i].name);
      });

      setUploading(new Set(newUploading));
      if (uploaded.length > 0) {
        onChange([...files, ...uploaded]);
      }
    },
    [files, maxFiles, uploading, onChange]
  );

  // ── 드래그&드롭 ────────────────────────────────────────────────────────
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  // ── 파일 제거 ────────────────────────────────────────────────────────────
  const removeFile = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  const isUploading = uploading.size > 0;
  const canAdd      = files.length < maxFiles;

  return (
    <div className="space-y-3">
      {/* 업로드 영역 */}
      {canAdd && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
          className={`
            border border-dashed py-8 text-center cursor-pointer
            transition-all duration-150 select-none
            ${isDragging
              ? 'border-ssolap-silver bg-ssolap-silver/5'
              : 'border-ssolap-border/60 hover:border-ssolap-border'
            }
            ${isUploading ? 'opacity-60 cursor-wait' : ''}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_MAP[type]}
            multiple={maxFiles > 1}
            className="hidden"
            onChange={(e) => e.target.files && processFiles(e.target.files)}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-ssolap-silver/30 border-t-ssolap-silver animate-spin" />
              <span className="text-ssolap-muted text-xs">업로드 중...</span>
            </div>
          ) : (
            <>
              <svg className="mx-auto mb-2 text-ssolap-muted/60" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-ssolap-muted text-xs">
                파일을 드래그하거나 클릭해서 선택
              </p>
              <p className="text-ssolap-muted/50 text-[10px] mt-1">
                {type === 'image' ? 'JPG, PNG, WEBP, GIF · 최대 10MB' :
                 type === 'video' ? 'MP4, WEBM, MOV · 최대 200MB' :
                 '이미지(10MB) / 영상(200MB)'}
                {maxFiles > 1 && ` · 최대 ${maxFiles}개`}
              </p>
            </>
          )}
        </div>
      )}

      {/* 업로드된 파일 미리보기 */}
      {files.length > 0 && (
        <div className={`grid gap-2 ${files.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {files.map((file, idx) => (
            <div key={idx} className="relative group bg-ssolap-border/30 aspect-square overflow-hidden">
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              ) : file.media_type === 'video' ? (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ssolap-silver/40 mb-2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span className="text-ssolap-muted text-[10px] truncate px-2 max-w-full">
                    {file.name}
                  </span>
                </div>
              ) : null}

              {/* 파일 크기 + 제거 버튼 */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="
                    bg-red-500/80 hover:bg-red-500 text-white
                    text-xs px-3 py-1.5 transition-colors
                  "
                >
                  제거
                </button>
              </div>

              {/* 파일 크기 표시 */}
              <div className="absolute bottom-1 right-1 bg-black/60 text-[9px] text-white/70 px-1.5 py-0.5">
                {formatBytes(file.size)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
