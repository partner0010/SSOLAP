/**
 * chatStore.ts — 채팅 상태 관리 (Zustand)
 */
import { create } from 'zustand';
import { api } from '@/lib/api';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface SenderBrief {
  id:           number;
  username:     string;
  display_name: string;
  avatar_url?:  string;
}

export interface ChatMessage {
  id:                   number;
  room_id:              number;
  sender:               SenderBrief | null;
  message_type:         string;
  content:              string;
  media_url?:           string;
  secret_recipient_id?: number;
  is_deleted:           boolean;
  created_at:           string;
  // 클라이언트 전용 (낙관적 업데이트)
  _pending?:            boolean;
}

export interface ChatRoom {
  id:           number;
  name:         string;
  description?: string;
  room_type:    string;
  entry_type:   string;
  entry_fee:    number;
  max_members:  number;
  member_count: number;
  is_public:    boolean;
  is_member:    boolean;
  online_count: number;
  last_message?: ChatMessage;
  created_at:   string;
}

export interface TypingUser {
  user_id:  number;
  username: string;
  at:       number;  // timestamp — 3초 후 제거
}

interface ChatState {
  // 방 목록
  rooms:          ChatRoom[];
  exploreRooms:   ChatRoom[];
  roomsLoading:   boolean;

  // 현재 열린 방
  activeRoomId:   number | null;
  messages:       ChatMessage[];
  messagesLoading: boolean;
  hasPrevMessages: boolean;

  // 타이핑 상태
  typingUsers:    TypingUser[];

  // 액션
  fetchMyRooms:     () => Promise<void>;
  fetchExploreRooms: () => Promise<void>;
  createRoom:       (data: CreateRoomData) => Promise<ChatRoom>;
  joinRoom:         (roomId: number, password?: string) => Promise<void>;
  leaveRoom:        (roomId: number) => Promise<void>;
  fetchMessages:    (roomId: number, beforeId?: number) => Promise<void>;
  setActiveRoom:    (roomId: number | null) => void;
  appendMessage:    (msg: ChatMessage) => void;
  addTypingUser:    (user: { user_id: number; username: string }) => void;
  removeTypingUser: (userId: number) => void;
  updateRoomOnline: (roomId: number, count: number) => void;
  reset:            () => void;
}

export interface CreateRoomData {
  name:           string;
  description?:   string;
  room_type:      'group' | 'channel';
  entry_type:     'open' | 'password' | 'point' | 'invite';
  entry_password?: string;
  entry_fee?:     number;
  max_members?:   number;
  is_public?:     boolean;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms:           [],
  exploreRooms:    [],
  roomsLoading:    false,
  activeRoomId:    null,
  messages:        [],
  messagesLoading: false,
  hasPrevMessages: false,
  typingUsers:     [],

  // ── 내 방 목록 ────────────────────────────────────────────────────
  fetchMyRooms: async () => {
    set({ roomsLoading: true });
    try {
      const rooms = await api.get<ChatRoom[]>('/chat/rooms');
      set({ rooms });
    } finally {
      set({ roomsLoading: false });
    }
  },

  // ── 공개 방 탐색 ──────────────────────────────────────────────────
  fetchExploreRooms: async () => {
    const rooms = await api.get<ChatRoom[]>('/chat/rooms/explore');
    set({ exploreRooms: rooms });
  },

  // ── 방 생성 ───────────────────────────────────────────────────────
  createRoom: async (data) => {
    const room = await api.post<ChatRoom>('/chat/rooms', data);
    set((s) => ({ rooms: [room, ...s.rooms] }));
    return room;
  },

  // ── 방 입장 ───────────────────────────────────────────────────────
  joinRoom: async (roomId, password) => {
    await api.post(`/chat/rooms/${roomId}/join`, { password });
    // 방 목록 갱신
    await get().fetchMyRooms();
  },

  // ── 방 퇴장 ───────────────────────────────────────────────────────
  leaveRoom: async (roomId) => {
    await api.post(`/chat/rooms/${roomId}/leave`);
    set((s) => ({
      rooms: s.rooms.filter((r) => r.id !== roomId),
      activeRoomId: s.activeRoomId === roomId ? null : s.activeRoomId,
    }));
  },

  // ── 메시지 히스토리 ───────────────────────────────────────────────
  fetchMessages: async (roomId, beforeId) => {
    set({ messagesLoading: true });
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (beforeId) params.set('before_id', String(beforeId));

      const data = await api.get<{
        messages: ChatMessage[];
        total: number;
        has_prev: boolean;
      }>(`/chat/rooms/${roomId}/messages?${params}`);

      set((s) => ({
        messages: beforeId
          ? [...data.messages, ...s.messages]
          : data.messages,
        hasPrevMessages: data.has_prev,
      }));
    } finally {
      set({ messagesLoading: false });
    }
  },

  // ── 활성 방 설정 ──────────────────────────────────────────────────
  setActiveRoom: (roomId) => {
    set({ activeRoomId: roomId, messages: [], hasPrevMessages: false, typingUsers: [] });
  },

  // ── 메시지 추가 (WebSocket 수신 시) ──────────────────────────────
  appendMessage: (msg) => {
    set((s) => {
      // 중복 방지
      if (s.messages.some((m) => m.id === msg.id)) return s;
      // 방 목록의 last_message 업데이트
      const rooms = s.rooms.map((r) =>
        r.id === msg.room_id ? { ...r, last_message: msg } : r
      );
      return { messages: [...s.messages, msg], rooms };
    });
  },

  // ── 타이핑 표시 ───────────────────────────────────────────────────
  addTypingUser: ({ user_id, username }) => {
    set((s) => {
      const filtered = s.typingUsers.filter((t) => t.user_id !== user_id);
      return { typingUsers: [...filtered, { user_id, username, at: Date.now() }] };
    });
    // 3초 후 자동 제거
    setTimeout(() => get().removeTypingUser(user_id), 3000);
  },

  removeTypingUser: (userId) => {
    set((s) => ({ typingUsers: s.typingUsers.filter((t) => t.user_id !== userId) }));
  },

  // ── 온라인 수 업데이트 ────────────────────────────────────────────
  updateRoomOnline: (roomId, count) => {
    set((s) => ({
      rooms: s.rooms.map((r) =>
        r.id === roomId ? { ...r, online_count: count } : r
      ),
    }));
  },

  reset: () => {
    set({
      rooms: [], exploreRooms: [], activeRoomId: null,
      messages: [], typingUsers: [], hasPrevMessages: false,
    });
  },
}));
