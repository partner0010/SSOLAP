/**
 * useChat.ts — WebSocket 채팅 훅
 *
 * 연결 → 메시지 수신 → 전송 → 재연결(backoff) → 연결 해제
 */
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import type { ChatMessage } from '@/store/chatStore';

// 쿠키에서 access_token 읽기
function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((r) => r.startsWith('access_token='));
  return match ? match.split('=')[1] : null;
}

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
const MAX_RETRIES = 5;

export interface UseChatReturn {
  isConnected:  boolean;
  isConnecting: boolean;
  sendMessage:  (content: string, type?: string, recipientId?: number) => void;
  sendTyping:   () => void;
  connect:      (roomId: number) => void;
  disconnect:   () => void;
}

export function useChat(roomId: number | null): UseChatReturn {
  const wsRef          = useRef<WebSocket | null>(null);
  const retryCount     = useRef(0);
  const retryTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isConnected,  setIsConnected]  = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const { appendMessage, addTypingUser, removeTypingUser, updateRoomOnline } = useChatStore();

  // ── WebSocket 연결 ────────────────────────────────────────────────
  const connect = useCallback((id: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = getToken();
    if (!token) return;

    setIsConnecting(true);
    const url = `${WS_BASE}/chat/ws/${id}?token=${token}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      retryCount.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        switch (event) {
          case 'message':
            appendMessage(data as ChatMessage);
            break;
          case 'typing':
            addTypingUser(data);
            break;
          case 'join':
          case 'leave':
            if (data.online_count !== undefined) {
              updateRoomOnline(id, data.online_count);
            }
            break;
          case 'error':
            console.warn('[WS] error:', data.detail);
            break;
        }
      } catch {
        // JSON parse error — ignore
      }
    };

    ws.onclose = (e) => {
      setIsConnected(false);
      setIsConnecting(false);
      wsRef.current = null;

      // 비정상 종료 시 자동 재연결 (지수 백오프)
      if (e.code !== 1000 && e.code !== 4001 && e.code !== 4003) {
        if (retryCount.current < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
          retryCount.current++;
          retryTimer.current = setTimeout(() => connect(id), delay);
        }
      }
    };

    ws.onerror = () => {
      setIsConnecting(false);
    };
  }, [appendMessage, addTypingUser, updateRoomOnline]);

  // ── 연결 해제 ─────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (wsRef.current) {
      wsRef.current.close(1000, 'user left');
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    retryCount.current = 0;
  }, []);

  // ── roomId가 바뀌면 재연결 ────────────────────────────────────────
  useEffect(() => {
    if (!roomId) { disconnect(); return; }
    connect(roomId);
    return () => disconnect();
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 메시지 전송 ───────────────────────────────────────────────────
  const sendMessage = useCallback(
    (content: string, type = 'text', recipientId?: number) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({
        type:                recipientId ? 'secret' : 'message',
        content,
        message_type:        type,
        secret_recipient_id: recipientId,
      }));
    },
    []
  );

  // ── 타이핑 전송 (500ms 스로틀) ────────────────────────────────────
  const sendTyping = useCallback(() => {
    if (typingThrottle.current) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'typing' }));
    typingThrottle.current = setTimeout(() => {
      typingThrottle.current = null;
    }, 500);
  }, []);

  return { isConnected, isConnecting, sendMessage, sendTyping, connect, disconnect };
}
