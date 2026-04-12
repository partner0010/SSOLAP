'use client';

/**
 * StoryBar.tsx — 피드 상단 스토리 바
 *
 * 내 스토리 (첫 번째) + 팔로잉 유저 스토리를 가로 스크롤로 표시.
 * 내 스토리가 없으면 "+ 추가" 원으로 표시.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useStoryStore } from '@/store/storyStore';
import StoryCircle from './StoryCircle';
import StoryViewer from './StoryViewer';
import StoryCreate from './StoryCreate';

export default function StoryBar() {
  const { user: me }  = useAuthStore();
  const { groups, isLoading, fetchFeedStories, openViewer } = useStoryStore();

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (me) fetchFeedStories();
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;

  const myGroupIdx    = groups.findIndex((g) => g.user_id === me.id);
  const hasMyStory    = myGroupIdx !== -1;

  // 스켈레톤
  if (isLoading) {
    return (
      <div className="mb-5 -mx-4 px-4">
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full bg-ssolap-border animate-pulse" />
              <div className="h-2.5 w-10 bg-ssolap-border/60 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-px bg-ssolap-border/30 mt-4" />
      </div>
    );
  }

  // 스토리가 하나도 없고 내 스토리도 없으면 최소 UI
  if (groups.length === 0) {
    return (
      <>
        <div className="mb-5 -mx-4 px-4">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
            {/* 내 스토리 추가 버튼 */}
            <MyStoryAdd onClick={() => setShowCreate(true)} me={me} />
          </div>
          <div className="h-px bg-ssolap-border/30 mt-4" />
        </div>
        {showCreate && <StoryCreate onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="mb-5 -mx-4 px-4">
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">

          {/* ── 내 스토리 (항상 첫 번째) ───────────────────────────────── */}
          {hasMyStory ? (
            <StoryCircle
              username={me.username}
              displayName={me.display_name}
              avatarUrl={me.avatar_url}
              hasUnseen={false}  // 내 스토리는 링 항상 표시 (흰색)
              isMe={true}
              onClick={() => openViewer(myGroupIdx)}
            />
          ) : (
            <MyStoryAdd onClick={() => setShowCreate(true)} me={me} />
          )}

          {/* ── 팔로잉 유저 스토리 ─────────────────────────────────────── */}
          {groups
            .filter((g) => g.user_id !== me.id)
            .map((g, idx) => {
              // 실제 groups 배열에서의 인덱스
              const realIdx = groups.findIndex((gr) => gr.user_id === g.user_id);
              return (
                <StoryCircle
                  key={g.user_id}
                  username={g.username}
                  displayName={g.display_name}
                  avatarUrl={g.avatar_url}
                  hasUnseen={g.has_unseen}
                  onClick={() => openViewer(realIdx)}
                />
              );
            })}
        </div>
        <div className="h-px bg-ssolap-border/30 mt-4" />
      </div>

      {/* 뷰어 */}
      <StoryViewer />

      {/* 생성 모달 */}
      {showCreate && <StoryCreate onClose={() => setShowCreate(false)} />}
    </>
  );
}

// ── 내 스토리 없을 때 + 버튼 ──────────────────────────────────────────────────
function MyStoryAdd({ onClick, me }: { onClick: () => void; me: { username: string; display_name: string; avatar_url?: string | null } }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
    >
      <div className="w-14 h-14 rounded-full ring-2 ring-offset-2 ring-offset-ssolap-bg ring-dashed ring-ssolap-border group-hover:ring-ssolap-silver/50 transition-all flex items-center justify-center bg-ssolap-silver/5">
        <span className="text-ssolap-silver/40 group-hover:text-ssolap-silver text-xl leading-none transition-colors">+</span>
      </div>
      <span className="text-[10px] text-ssolap-muted group-hover:text-ssolap-silver transition-colors">
        내 스토리
      </span>
    </button>
  );
}
