/**
 * notificationStore.ts — 알림 상태 관리 + WebSocket
 */
import { create } from 'zustand';
import { api } from '@/lib/api';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface NotiActor {
  id:           number;
  username:     string;
  display_name: string;
  avatar_url?:  string;
}

export interface Notification {
  id:         number;
  noti_type:  string;
  message:    string;
  link?:      string;
  is_read:    boolean;
  actor?:     NotiActor;
  created_at: string;
}

// 알림 타입별 이모지
export const NOTI_ICONS: Record<string, string> = {
  follow:        '👤',
  like:          '♥',
  comment:       '◉',
  comment_reply: '↩',
  mention:       '@',
  room_invite:   '◧',
  point_earned:  '✦',
  system:        '◆',
};

interface NotiState {
  notifications:  Notification[];
  unreadCount:    number;
  total:          number;
  hasNext:        boolean;
  isLoading:      boolean;
  wsConnected:    boolean;

  // 액션
  fetchNotifications: (reset?: boolean) => Promise<void>;
  fetchUnreadCount:   () => Promise<void>;
  readAll:            () => Promise<void>;
  readOne:            (id: number) => Promise<void>;
  appendNotification: (noti: Notification) => void;
  setUnreadCount:     (count: number) => void;
  connectWs:          (token: string) => void;
  disconnectWs:       () => void;
}

let ws: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;

const WS_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000')
  : 'ws://localhost:8000';

export const useNotificationStore = create<NotiState>((set, get) => ({
  notifications: [],
  unreadCount:   0,
  total:         0,
  hasNext:       false,
  isLoading:     false,
  wsConnected:   false,

  // ── 알림 목록 로드 ────────────────────────────────────────────────
  fetchNotifications: async (reset = true) => {
    set({ isLoading: true });
    try {
      const page = reset ? 1 : Math.ceil(get().notifications.length / 30) + 1;
      const data = await api.get<{
        notifications: Notification[];
        total: number;
        unread_count: number;
        has_next: boolean;
      }>(`/notifications?page=${page}&per_page=30`);

      set({
        notifications: reset ? data.notifications : [...get().notifications, ...data.notifications],
        total:         data.total,
        unreadCount:   data.unread_count,
        hasNext:       data.has_next,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── 미읽음 카운트만 갱신 ──────────────────────────────────────────
  fetchUnreadCount: async () => {
    try {
      const data = await api.get<{ unread_count: number }>('/notifications/unread');
      set({ unreadCount: data.unread_count });
    } catch { /* 무시 */ }
  },

  // ── 전체 읽음 ─────────────────────────────────────────────────────
  readAll: async () => {
    await api.post('/notifications/read-all');
    set((s) => ({
      unreadCount: 0,
      notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
    }));
  },

  // ── 단건 읽음 ─────────────────────────────────────────────────────
  readOne: async (id) => {
    await api.put(`/notifications/${id}/read`);
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  // ── WebSocket으로 새 알림 추가 ────────────────────────────────────
  appendNotification: (noti) => {
    set((s) => ({
      notifications: [noti, ...s.notifications],
      unreadCount:   s.unreadCount + 1,
      total:         s.total + 1,
    }));
  },

  setUnreadCount: (count) => set({ unreadCount: count }),

  // ── WebSocket 연결 ────────────────────────────────────────────────
  connectWs: (token) => {
    if (ws?.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(`${WS_BASE}/notifications/ws?token=${token}`);

    ws.onopen = () => {
      set({ wsConnected: true });
      retryCount = 0;
    };

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        if (event === 'notification') {
          get().appendNotification(data as Notification);
        } else if (event === 'unread_count') {
          get().setUnreadCount(data.count);
        }
      } catch { /* 무시 */ }
    };

    ws.onclose = (e) => {
      set({ wsConnected: false });
      ws = null;
      // 비정상 종료 시 재연결
      if (e.code !== 1000 && e.code !== 4001 && retryCount < 5) {
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        retryCount++;
        retryTimer = setTimeout(() => get().connectWs(token), delay);
      }
    };

    ws.onerror = () => { ws = null; };
  },

  // ── WebSocket 해제 ────────────────────────────────────────────────
  disconnectWs: () => {
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close(1000);
    ws = null;
    set({ wsConnected: false });
    retryCount = 0;
  },
}));
