/**
 * feedStore.ts — 피드 상태 관리 (Zustand)
 */
import { create } from 'zustand';
import { api } from '@/lib/api';
import type { Post, PaginatedResponse } from '@/types';

interface FeedState {
  posts:      Post[];
  total:      number;
  page:       number;
  hasNext:    boolean;
  isLoading:  boolean;
  isFetching: boolean;  // 추가 로딩 (무한 스크롤)
  error:      string | null;

  // 액션
  fetchFeed:    (reset?: boolean) => Promise<void>;
  fetchExplore: (reset?: boolean, postType?: string) => Promise<void>;
  loadMore:     () => void;
  createPost:   (data: CreatePostData) => Promise<Post>;
  deletePost:   (postId: number) => Promise<void>;
  toggleLike:   (postId: number) => Promise<void>;
  prependPost:  (post: Post) => void;
  reset:        () => void;
}

export interface CreatePostData {
  content?:  string;
  post_type: 'text' | 'image' | 'video' | 'short';
  is_public: boolean;
  media?:    Array<{
    url:        string;
    media_type: 'image' | 'video';
    width?:     number;
    height?:    number;
    duration?:  number;
  }>;
}

interface FeedApiResponse {
  posts:    Post[];
  total:    number;
  page:     number;
  per_page: number;
  has_next: boolean;
}

const PER_PAGE = 20;

export const useFeedStore = create<FeedState>((set, get) => ({
  posts:      [],
  total:      0,
  page:       1,
  hasNext:    false,
  isLoading:  false,
  isFetching: false,
  error:      null,

  // ── 팔로잉 피드 가져오기 ───────────────────────────────────────────────
  fetchFeed: async (reset = true) => {
    const state = get();
    if (state.isLoading || state.isFetching) return;

    const nextPage = reset ? 1 : state.page + 1;
    set(reset ? { isLoading: true, error: null } : { isFetching: true });

    try {
      const data = await api.get<FeedApiResponse>(
        `/posts/feed?page=${nextPage}&per_page=${PER_PAGE}`
      );
      set({
        posts:   reset ? data.posts : [...state.posts, ...data.posts],
        total:   data.total,
        page:    nextPage,
        hasNext: data.has_next,
      });
    } catch (err: any) {
      set({ error: err?.message ?? '피드를 불러오지 못했습니다' });
    } finally {
      set({ isLoading: false, isFetching: false });
    }
  },

  // ── 탐색 피드 가져오기 ─────────────────────────────────────────────────
  fetchExplore: async (reset = true, postType?: string) => {
    const state = get();
    if (state.isLoading || state.isFetching) return;

    const nextPage = reset ? 1 : state.page + 1;
    set(reset ? { isLoading: true, error: null } : { isFetching: true });

    try {
      const params = new URLSearchParams({
        page:     String(nextPage),
        per_page: String(PER_PAGE),
        ...(postType ? { post_type: postType } : {}),
      });
      const data = await api.get<FeedApiResponse>(`/posts/explore?${params}`);
      set({
        posts:   reset ? data.posts : [...state.posts, ...data.posts],
        total:   data.total,
        page:    nextPage,
        hasNext: data.has_next,
      });
    } catch (err: any) {
      set({ error: err?.message ?? '탐색 피드를 불러오지 못했습니다' });
    } finally {
      set({ isLoading: false, isFetching: false });
    }
  },

  // ── 다음 페이지 로드 (무한 스크롤용) ──────────────────────────────────
  loadMore: () => {
    const { hasNext } = get();
    if (hasNext) get().fetchFeed(false);
  },

  // ── 게시물 작성 ────────────────────────────────────────────────────────
  createPost: async (data: CreatePostData) => {
    const newPost = await api.post<Post>('/posts', data);
    // 새 게시물을 피드 맨 앞에 추가
    set((s) => ({ posts: [newPost, ...s.posts], total: s.total + 1 }));
    return newPost;
  },

  // ── 게시물 삭제 ────────────────────────────────────────────────────────
  deletePost: async (postId: number) => {
    await api.delete(`/posts/${postId}`);
    set((s) => ({
      posts: s.posts.filter((p) => p.id !== postId),
      total: Math.max(0, s.total - 1),
    }));
  },

  // ── 좋아요 토글 ────────────────────────────────────────────────────────
  toggleLike: async (postId: number) => {
    const { liked, like_count } = await api.post<{ liked: boolean; like_count: number }>(
      `/posts/${postId}/like`
    );
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, is_liked: liked, like_count } : p
      ),
    }));
  },

  // ── 외부에서 게시물 추가 (낙관적 업데이트 등) ─────────────────────────
  prependPost: (post: Post) => {
    set((s) => ({ posts: [post, ...s.posts] }));
  },

  // ── 스토어 초기화 ──────────────────────────────────────────────────────
  reset: () => {
    set({ posts: [], total: 0, page: 1, hasNext: false, isLoading: false, error: null });
  },
}));
