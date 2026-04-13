'use client';

/**
 * StoryViewer.tsx — 전체화면 스토리 뷰어
 *
 * 기능:
 * - 진행 바 (5초 자동 전진)
 * - 좌/우 탭으로 이전/다음 스토리
 * - 상단 X 버튼으로 닫기
 * - 본인 스토리에 삭제 버튼
 * - 동영상 스토리 지원
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useStoryStore } from '@/store/storyStore';
import toast from 'react-hot-toast';

const STORY_DURATION_MS = 5000; // 이미지 스토리 표시 시간

export default function StoryViewer() {
  const { user: me }  = useAuthStore();
  const {
    groups, viewerOpen, activeGroupIndex, activeStoryIndex,
    closeViewer, nextStory, prevStory, nextGroup, prevGroup, deleteStory,
  } = useStoryStore();

  const [progress, setProgress]       = useState(0);
  const [paused,   setPaused]         = useState(false);
  const [deleting, setDeleting]       = useState(false);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);

  const group  = groups[activeGroupIndex];
  const story  = group?.stories[activeStoryIndex];
  const isMyStory = story?.author.id === me?.id;

  // ── 타이머 관리 ──────────────────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (!story || story.media_type === 'video') return; // 영상은 자동 진행 없음
    clearTimer();
    setProgress(0);
    const TICK = 50;
    const steps = STORY_DURATION_MS / TICK;
    let step = 0;
    timerRef.current = setInterval(() => {
      step++;
      setProgress((step / steps) * 100);
      if (step >= steps) {
        clearTimer();
        nextStory();
      }
    }, TICK);
  }, [story, clearTimer, nextStory]);

  useEffect(() => {
    if (!viewerOpen || !story) return;
    if (paused) {
      clearTimer();
      return;
    }
    startTimer();
    return clearTimer;
  }, [viewerOpen, story?.id, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // 뷰어 닫히면 타이머 정리
  useEffect(() => {
    if (!viewerOpen) {
      clearTimer();
      setProgress(0);
    }
  }, [viewerOpen, clearTimer]);

  // 동영상 재생 끝나면 다음 스토리
  const handleVideoEnd = useCallback(() => {
    nextStory();
  }, [nextStory]);

  // 키보드 내비게이션
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextStory();
      if (e.key === 'ArrowLeft')  prevStory();
      if (e.key === 'Escape')     closeViewer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, nextStory, prevStory, closeViewer]);

  // ── 삭제 ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!story) return;
    setDeleting(true);
    try {
      await deleteStory(story.id);
      toast.success('스토리가 삭제되었습니다');
      // 삭제 후 남은 스토리 없으면 닫기, 있으면 다음으로
      const remaining = group.stories.filter((s) => s.id !== story.id);
      if (remaining.length === 0) closeViewer();
      else nextStory();
    } catch {
      toast.error('삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  if (!viewerOpen || !group || !story) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      {/* ── 진행 바 ──────────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-3">
        {group.stories.map((s, idx) => (
          <div key={s.id} className="flex-1 h-0.5 bg-white/30 overflow-hidden rounded-full">
            <div
              className="h-full bg-white transition-none rounded-full"
              style={{
                width: idx < activeStoryIndex
                  ? '100%'
                  : idx === activeStoryIndex
                  ? `${progress}%`
                  : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* ── 상단 헤더 ────────────────────────────────────────────────────────── */}
      <div className="absolute top-8 left-0 right-0 z-10 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* 아바타 */}
          <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
            {story.author.avatar_url ? (
              <img src={story.author.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">{story.author.display_name[0]}</span>
            )}
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{story.author.display_name}</p>
            <p className="text-white/60 text-[10px]">@{story.author.username}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 조회 수 */}
          <span className="text-white/60 text-xs font-mono">
            👁 {story.view_count}
          </span>
          {/* 삭제 (본인만) */}
          {isMyStory && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-white/60 hover:text-red-400 text-lg transition-colors disabled:opacity-40"
            >
              ✕
            </button>
          )}
          {/* 닫기 */}
          <button
            onClick={closeViewer}
            className="text-white/80 hover:text-white text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── 미디어 영역 ──────────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm h-full max-h-[90vh] relative flex items-center justify-center">
        {story.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={story.media_url}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
            onEnded={handleVideoEnd}
          />
        ) : (
          <img
            src={story.media_url}
            alt={story.caption ?? '스토리'}
            className="w-full h-full object-contain select-none"
            draggable={false}
          />
        )}

        {/* 캡션 */}
        {story.caption && (
          <div className="absolute bottom-16 left-0 right-0 px-6">
            <p className="text-white text-sm text-center font-medium drop-shadow-lg leading-relaxed bg-black/30 rounded-lg px-4 py-2">
              {story.caption}
            </p>
          </div>
        )}
      </div>

      {/* ── 좌/우 탭 영역 ────────────────────────────────────────────────────── */}
      {/* 왼쪽 탭: 이전 스토리 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1/3 z-20 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); prevStory(); }}
      />
      {/* 오른쪽 탭: 다음 스토리 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1/3 z-20 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); nextStory(); }}
      />

      {/* ── 좌/우 유저 그룹 이동 화살표 ─────────────────────────────────────── */}
      {activeGroupIndex > 0 && (
        <button
          onClick={prevGroup}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white text-xs transition-colors"
        >
          ‹
        </button>
      )}
      {activeGroupIndex < groups.length - 1 && (
        <button
          onClick={nextGroup}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white text-xs transition-colors"
        >
          ›
        </button>
      )}
    </div>
  );
}
