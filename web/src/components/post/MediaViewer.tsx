'use client';

/**
 * MediaViewer.tsx — 게시물 미디어 뷰어
 * - 이미지: 그리드 프리뷰 + 라이트박스 (클릭 확대)
 * - 영상 (video/short): HTML5 video 플레이어
 */
import { useState, useCallback } from 'react';

interface MediaItem {
  id: number;
  url: string;
  media_type: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  display_order: number;
}

interface Props {
  media: MediaItem[];
  postType: string;
}

// ── 라이트박스 ────────────────────────────────────────────────────────────────
function Lightbox({
  items, index, onClose, onPrev, onNext,
}: {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const item = items[index];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 이전 버튼 */}
      {items.length > 1 && index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-3xl transition-colors z-10 p-2"
        >
          ‹
        </button>
      )}

      {/* 이미지 */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {item.media_type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt=""
            className="max-w-full max-h-[90vh] object-contain"
          />
        ) : (
          <video
            src={item.url}
            controls
            autoPlay
            className="max-w-full max-h-[90vh]"
          />
        )}
      </div>

      {/* 다음 버튼 */}
      {items.length > 1 && index < items.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-3xl transition-colors z-10 p-2"
        >
          ›
        </button>
      )}

      {/* 닫기 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white text-xl transition-colors"
      >
        ✕
      </button>

      {/* 인덱스 표시 */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {items.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 이미지 그리드 ─────────────────────────────────────────────────────────────
function ImageGrid({ images, onOpen }: { images: MediaItem[]; onOpen: (i: number) => void }) {
  const count = images.length;

  if (count === 1) {
    return (
      <div
        className="cursor-pointer overflow-hidden border border-ssolap-border"
        onClick={() => onOpen(0)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0].url} alt="" className="w-full max-h-[480px] object-cover hover:scale-[1.01] transition-transform duration-300" />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-0.5">
        {images.map((img, i) => (
          <div key={img.id} className="cursor-pointer overflow-hidden border border-ssolap-border aspect-square" onClick={() => onOpen(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
          </div>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="grid grid-cols-2 gap-0.5">
        <div className="cursor-pointer overflow-hidden border border-ssolap-border row-span-2" onClick={() => onOpen(0)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0].url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" style={{ minHeight: '200px' }} />
        </div>
        {images.slice(1).map((img, i) => (
          <div key={img.id} className="cursor-pointer overflow-hidden border border-ssolap-border aspect-square" onClick={() => onOpen(i + 1)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
          </div>
        ))}
      </div>
    );
  }

  // 4개 이상: 2×2 그리드 + 나머지 표시
  const displayed = images.slice(0, 4);
  const extra = count - 4;

  return (
    <div className="grid grid-cols-2 gap-0.5">
      {displayed.map((img, i) => (
        <div
          key={img.id}
          className="relative cursor-pointer overflow-hidden border border-ssolap-border aspect-square"
          onClick={() => onOpen(i)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
          {i === 3 && extra > 0 && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white text-2xl font-bold">+{extra}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function MediaViewer({ media, postType }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((i: number) => setLightboxIndex(i), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevImage = useCallback(() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i)), []);
  const nextImage = useCallback(() =>
    setLightboxIndex((i) => (i !== null && i < media.length - 1 ? i + 1 : i)), [media.length]);

  if (!media.length) return null;

  const images = media.filter((m) => m.media_type === 'image');
  const videos = media.filter((m) => m.media_type === 'video');

  return (
    <div className="mt-3 space-y-2">
      {/* 이미지 그리드 */}
      {images.length > 0 && (
        <>
          <ImageGrid images={images} onOpen={openLightbox} />
          {lightboxIndex !== null && (
            <Lightbox
              items={images}
              index={lightboxIndex}
              onClose={closeLightbox}
              onPrev={prevImage}
              onNext={nextImage}
            />
          )}
        </>
      )}

      {/* 영상 플레이어 */}
      {videos.map((v) => (
        <div key={v.id} className={`border border-ssolap-border overflow-hidden ${postType === 'short' ? 'max-w-[320px] mx-auto' : 'w-full'}`}>
          <video
            src={v.url}
            controls
            className={`w-full ${postType === 'short' ? 'aspect-[9/16]' : 'max-h-[480px]'} object-contain bg-black`}
          />
          {v.duration && (
            <div className="px-3 py-1.5 border-t border-ssolap-border bg-ssolap-surface">
              <span className="text-ssolap-muted text-[10px] font-mono">
                {Math.floor(v.duration / 60)}:{String(Math.floor(v.duration % 60)).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
