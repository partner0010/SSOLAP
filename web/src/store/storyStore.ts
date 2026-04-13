/**
 * storyStore.ts — 스토리 상태 관리
 */
import { create } from 'zustand';
import { api } from '@/lib/api';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface StoryAuthor {
  id:           number;
  username:     string;
  display_name: string;
  avatar_url?:  string | null;
}

export interface Story {
  id:         number;
  media_url:  string;
  media_type: 'image' | 'video';
  caption?:   string | null;
  view_count: number;
  expires_at: string;
  created_at: string;
  author:     StoryAuthor;
  is_viewed:  boolean;
}

export interface UserStoriesGroup {
  user_id:      number;
  username:     string;
  display_name: string;
  avatar_url?:  string | null;
  has_unseen:   boolean;
  stories:      Story[];
}

interface StoryState {
  groups:      UserStoriesGroup[];
  isLoading:   boolean;

  // 뷰어 상태
  viewerOpen:       boolean;
  activeGroupIndex: number;
  activeStoryIndex: number;

  // 액션
  fetchFeedStories: () => Promise<void>;
  openViewer:       (groupIndex: number, storyIndex?: number) => void;
  closeViewer:      () => void;
  nextStory:        () => void;
  prevStory:        () => void;
  nextGroup:        () => void;
  prevGroup:        () => void;
  markViewed:       (storyId: number) => Promise<void>;
  createStory:      (mediaUrl: string, mediaType: 'image' | 'video', caption?: string) => Promise<Story>;
  deleteStory:      (storyId: number) => Promise<void>;
}

// ─── 스토어 ───────────────────────────────────────────────────────────────────

export const useStoryStore = create<StoryState>((set, get) => ({
  groups:    [],
  isLoading: false,

  viewerOpen:       false,
  activeGroupIndex: 0,
  activeStoryIndex: 0,

  // ── 피드 스토리 불러오기 ───────────────────────────────────────────────────
  fetchFeedStories: async () => {
    set({ isLoading: true });
    try {
      const data = await api.get<{ groups: UserStoriesGroup[] }>('/stories/feed');
      set({ groups: data.groups });
    } catch {
      // 스토리 없어도 피드는 정상 동작해야 함
    } finally {
      set({ isLoading: false });
    }
  },

  // ── 뷰어 열기 ──────────────────────────────────────────────────────────────
  openViewer: (groupIndex, storyIndex = 0) => {
    set({ viewerOpen: true, activeGroupIndex: groupIndex, activeStoryIndex: storyIndex });
    const { groups } = get();
    const group = groups[groupIndex];
    if (group?.stories[storyIndex]) {
      const story = group.stories[storyIndex];
      if (!story.is_viewed) {
        get().markViewed(story.id);
      }
    }
  },

  // ── 뷰어 닫기 ──────────────────────────────────────────────────────────────
  closeViewer: () => set({ viewerOpen: false }),

  // ── 다음 스토리 (같은 유저) ────────────────────────────────────────────────
  nextStory: () => {
    const { groups, activeGroupIndex, activeStoryIndex } = get();
    const group = groups[activeGroupIndex];
    if (!group) return;

    if (activeStoryIndex < group.stories.length - 1) {
      const nextIdx = activeStoryIndex + 1;
      set({ activeStoryIndex: nextIdx });
      const story = group.stories[nextIdx];
      if (!story.is_viewed) get().markViewed(story.id);
    } else {
      // 마지막 스토리 → 다음 그룹으로
      get().nextGroup();
    }
  },

  // ── 이전 스토리 ─────────────────────────────────────────────────────────────
  prevStory: () => {
    const { activeStoryIndex } = get();
    if (activeStoryIndex > 0) {
      set({ activeStoryIndex: activeStoryIndex - 1 });
    } else {
      get().prevGroup();
    }
  },

  // ── 다음 그룹 ───────────────────────────────────────────────────────────────
  nextGroup: () => {
    const { groups, activeGroupIndex } = get();
    if (activeGroupIndex < groups.length - 1) {
      const nextGroupIdx = activeGroupIndex + 1;
      set({ activeGroupIndex: nextGroupIdx, activeStoryIndex: 0 });
      const story = groups[nextGroupIdx].stories[0];
      if (story && !story.is_viewed) get().markViewed(story.id);
    } else {
      set({ viewerOpen: false });
    }
  },

  // ── 이전 그룹 ───────────────────────────────────────────────────────────────
  prevGroup: () => {
    const { activeGroupIndex } = get();
    if (activeGroupIndex > 0) {
      set({ activeGroupIndex: activeGroupIndex - 1, activeStoryIndex: 0 });
    }
  },

  // ── 조회 기록 ────────────────────────────────────────────────────────────────
  markViewed: async (storyId: number) => {
    try {
      await api.post(`/stories/${storyId}/view`);
      // 로컬 상태 업데이트
      set((state) => ({
        groups: state.groups.map((g) => ({
          ...g,
          stories: g.stories.map((s) =>
            s.id === storyId ? { ...s, is_viewed: true } : s
          ),
          has_unseen: g.stories.some((s) => s.id !== storyId && !s.is_viewed),
        })),
      }));
    } catch {
      // 무시
    }
  },

  // ── 스토리 생성 ──────────────────────────────────────────────────────────────
  createStory: async (mediaUrl, mediaType, caption) => {
    const params = new URLSearchParams({ media_url: mediaUrl, media_type: mediaType });
    if (caption) params.append('caption', caption);
    const story = await api.post<Story>(`/stories?${params.toString()}`);

    // 내 그룹이 있으면 앞에 추가, 없으면 새 그룹 생성
    set((state) => {
      const myGroups = state.groups.filter((g) => g.user_id === story.author.id);
      if (myGroups.length > 0) {
        return {
          groups: state.groups.map((g) =>
            g.user_id === story.author.id
              ? { ...g, stories: [story, ...g.stories], has_unseen: false }
              : g
          ),
        };
      } else {
        const newGroup: UserStoriesGroup = {
          user_id:      story.author.id,
          username:     story.author.username,
          display_name: story.author.display_name,
          avatar_url:   story.author.avatar_url,
          has_unseen:   false,
          stories:      [story],
        };
        return { groups: [newGroup, ...state.groups] };
      }
    });

    return story;
  },

  // ── 스토리 삭제 ──────────────────────────────────────────────────────────────
  deleteStory: async (storyId: number) => {
    await api.delete(`/stories/${storyId}`);
    set((state) => ({
      groups: state.groups
        .map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) }))
        .filter((g) => g.stories.length > 0),
    }));
  },
}));
