'use client';

/**
 * StoryCreate.tsx — 스토리 업로드 모달
 *
 * 1. 파일 선택 (이미지/영상)
 * 2. /upload API로 업로드 → URL 획득
 * 3. 캡션 입력
 * 4. POST /stories 로 스토리 생성
 */
import { useState, useRef } from 'react';
import { useStoryStore } from '@/store/storyStore';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface StoryCreateProps {
  onClose: () => void;
}

export default function StoryCreate({ onClose }: StoryCreateProps) {
  const { createStory } = useStoryStore();

  const [file,      setFile]      = useState<File | null>(null);
  const [preview,   setPreview]   = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption,   setCaption]   = useState('');
  const [uploading, setUploading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── 파일 선택 ───────────────────────────────────────────────────────────────
  const handleFile = (f: File) => {
    const type: 'image' | 'video' = f.type.startsWith('video/') ? 'video' : 'image';
    setFile(f);
    setMediaType(type);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ── 업로드 & 생성 ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!file) { toast.error('파일을 선택해주세요'); return; }
    setUploading(true);
    try {
      // 1. 파일 업로드 (이미지/영상 분기)
      const formData = new FormData();
      formData.append('file', file);
      const endpoint  = mediaType === 'video' ? '/upload/video' : '/upload/image';
      const uploadRes = await api.post<{ url: string }>(endpoint, formData);
      const mediaUrl  = uploadRes.url;

      // 2. 스토리 생성
      await createStory(mediaUrl, mediaType, caption || undefined);
      toast.success('스토리가 올라갔습니다 ✦');
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '업로드에 실패했습니다';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-ssolap-card border border-ssolap-border w-full max-w-sm rounded-sm overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ssolap-border">
          <h3 className="text-ssolap-silver text-xs font-bold tracking-[0.3em] uppercase">
            새 스토리
          </h3>
          <button onClick={onClose} className="text-ssolap-muted hover:text-ssolap-silver text-lg leading-none transition-colors">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 미리보기 / 드롭존 */}
          {preview ? (
            <div className="relative aspect-[9/16] bg-black rounded-sm overflow-hidden">
              {mediaType === 'video' ? (
                <video src={preview} controls className="w-full h-full object-contain" />
              ) : (
                <img src={preview} alt="preview" className="w-full h-full object-contain" />
              )}
              <button
                onClick={() => { setPreview(null); setFile(null); }}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/80 transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              className="aspect-[9/16] border-2 border-dashed border-ssolap-border hover:border-ssolap-silver/40 transition-colors flex flex-col items-center justify-center gap-3 cursor-pointer rounded-sm"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="text-3xl text-ssolap-silver/20">▲</div>
              <div className="text-center">
                <p className="text-ssolap-silver text-xs font-medium">클릭하거나 드래그</p>
                <p className="text-ssolap-muted text-[10px] mt-1">이미지 · 동영상 (최대 200MB)</p>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          {/* 캡션 */}
          <div>
            <label className="block text-ssolap-muted text-[10px] tracking-widest uppercase mb-1.5">
              캡션 (선택)
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="스토리에 텍스트를 추가하세요..."
              className="w-full bg-ssolap-bg border border-ssolap-border text-ssolap-silver text-sm px-3 py-2 resize-none focus:outline-none focus:border-ssolap-silver/40 placeholder:text-ssolap-muted/40"
            />
            <p className="text-right text-ssolap-muted/40 text-[10px] mt-1">{caption.length}/200</p>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-ssolap-border text-ssolap-muted hover:text-ssolap-silver text-xs tracking-wide transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={!file || uploading}
              className="flex-1 py-2.5 bg-ssolap-silver/10 border border-ssolap-silver/30 text-ssolap-silver hover:bg-ssolap-silver/20 text-xs tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? '업로드 중...' : '공유하기'}
            </button>
          </div>

          {/* 만료 안내 */}
          <p className="text-center text-ssolap-muted/40 text-[10px]">
            스토리는 24시간 후 자동으로 사라집니다
          </p>
        </div>
      </div>
    </div>
  );
}
