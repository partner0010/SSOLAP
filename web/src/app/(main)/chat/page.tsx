'use client';

/**
 * chat/page.tsx — 채팅 메인 페이지
 * 좌: 방 목록 / 우: 채팅 화면
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useChatStore, type ChatRoom, type ChatMessage } from '@/store/chatStore';
import { useChat } from '@/hooks/useChat';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── 방 생성 모달 ─────────────────────────────────────────────────────────────
function CreateRoomModal({ onClose }: { onClose: () => void }) {
  const [name,      setName]      = useState('');
  const [desc,      setDesc]      = useState('');
  const [roomType,  setRoomType]  = useState<'group' | 'channel'>('group');
  const [entryType, setEntryType] = useState<'open' | 'password' | 'point'>('open');
  const [password,  setPassword]  = useState('');
  const [fee,       setFee]       = useState(0);
  const [loading,   setLoading]   = useState(false);
  const { createRoom } = useChatStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createRoom({
        name: name.trim(), description: desc || undefined,
        room_type: roomType, entry_type: entryType,
        entry_password: entryType === 'password' ? password : undefined,
        entry_fee: entryType === 'point' ? fee : 0,
      });
      toast.success('채팅방이 생성됐습니다');
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? '생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#0D0D1A] border border-ssolap-border w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-ssolap-silver font-bold tracking-widest text-sm">채팅방 만들기</h3>
          <button onClick={onClose} className="text-ssolap-muted hover:text-ssolap-silver">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="방 이름 *" maxLength={80}
            className="input w-full"
          />
          <textarea
            value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="방 소개 (선택)" rows={2} maxLength={300}
            className="input w-full resize-none"
          />

          {/* 방 유형 */}
          <div className="flex gap-2">
            {(['group', 'channel'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setRoomType(t)}
                className={`flex-1 py-2 text-xs tracking-wide border transition-all
                  ${roomType === t
                    ? 'border-ssolap-silver/40 bg-ssolap-silver/10 text-ssolap-silver'
                    : 'border-ssolap-border text-ssolap-muted hover:text-ssolap-silver'
                  }`}>
                {t === 'group' ? '그룹 채팅' : '채널'}
              </button>
            ))}
          </div>

          {/* 입장 조건 */}
          <div className="flex gap-2">
            {(['open', 'password', 'point'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setEntryType(t)}
                className={`flex-1 py-2 text-xs tracking-wide border transition-all
                  ${entryType === t
                    ? 'border-ssolap-silver/40 bg-ssolap-silver/10 text-ssolap-silver'
                    : 'border-ssolap-border text-ssolap-muted hover:text-ssolap-silver'
                  }`}>
                {t === 'open' ? '자유' : t === 'password' ? '비번' : '포인트'}
              </button>
            ))}
          </div>

          {entryType === 'password' && (
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호" className="input w-full" />
          )}
          {entryType === 'point' && (
            <div className="flex items-center gap-2">
              <input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))}
                min={1} max={10000} className="input flex-1" />
              <span className="text-ssolap-muted text-xs">SP</span>
            </div>
          )}

          <button type="submit" disabled={loading || !name.trim()}
            className="btn-primary w-full py-3 text-sm disabled:opacity-40">
            {loading ? '생성 중...' : '만들기'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── 채팅방 목록 아이템 ───────────────────────────────────────────────────────
function RoomItem({
  room, isActive, onClick,
}: { room: ChatRoom; isActive: boolean; onClick: () => void }) {
  const isDm      = room.room_type === 'direct';
  const partner   = room.dm_partner;
  const roomLabel = isDm && partner ? partner.display_name : room.name;
  const initials  = roomLabel[0]?.toUpperCase() ?? '?';

  return (
    <button onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all
        ${isActive
          ? 'bg-ssolap-silver/10 border-l-2 border-ssolap-silver'
          : 'hover:bg-white/3 border-l-2 border-transparent'
        }`}>
      {/* 아이콘 — DM은 상대방 아바타, 채널/그룹은 이니셜 */}
      <div className="w-9 h-9 bg-ssolap-silver/10 border border-ssolap-border flex items-center justify-center text-ssolap-silver text-xs font-bold flex-shrink-0 overflow-hidden relative">
        {isDm && partner?.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={partner.avatar_url} alt="" className="w-full h-full object-cover" />
          : initials
        }
        {/* DM 배지 */}
        {isDm && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-ssolap-silver/40 flex items-center justify-center text-[7px] leading-none">◧</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ssolap-silver text-xs font-semibold truncate">
            {roomLabel}
            {isDm && partner && (
              <span className="ml-1 text-ssolap-muted/50 text-[10px] font-normal">@{partner.username}</span>
            )}
          </span>
          {room.online_count > 0 && (
            <span className="text-[9px] text-green-400/70 flex-shrink-0">● {room.online_count}</span>
          )}
        </div>
        {room.last_message ? (
          <p className="text-ssolap-muted text-[11px] truncate mt-0.5">
            {isDm ? room.last_message.content : `${room.last_message.sender?.display_name}: ${room.last_message.content}`}
          </p>
        ) : (
          <p className="text-ssolap-muted/40 text-[11px] mt-0.5">메시지 없음</p>
        )}
      </div>
    </button>
  );
}

// ─── 메시지 버블 ──────────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine }: { msg: ChatMessage; isMine: boolean }) {
  const isSecret = msg.message_type === 'secret';
  const timeStr  = formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ko });

  if (msg.message_type === 'system') {
    return (
      <div className="text-center py-1">
        <span className="text-ssolap-muted/50 text-[10px] tracking-wide">{msg.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 mb-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 아바타 */}
      {!isMine && (
        <div className="w-7 h-7 bg-ssolap-silver/10 border border-ssolap-border flex items-center justify-center text-ssolap-silver text-[10px] font-bold flex-shrink-0 mb-0.5">
          {msg.sender?.display_name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}

      <div className={`max-w-[72%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {/* 발신자 이름 (상대방만) */}
        {!isMine && msg.sender && (
          <span className="text-ssolap-muted text-[10px] px-1">
            {msg.sender.display_name}
          </span>
        )}

        {/* 말풍선 */}
        <div className={`
          px-3 py-2 text-sm leading-relaxed break-words
          ${isMine
            ? 'bg-ssolap-silver/15 border border-ssolap-silver/30 text-ssolap-silver'
            : 'bg-white/5 border border-ssolap-border text-ssolap-silver/90'
          }
          ${isSecret ? 'border-dashed border-ssolap-silver/50 bg-ssolap-silver/5' : ''}
          ${msg._pending ? 'opacity-50' : ''}
        `}>
          {isSecret && <span className="text-[9px] text-ssolap-silver/40 mr-1">🔒</span>}
          {msg.content}
        </div>

        {/* 시간 */}
        <span className="text-ssolap-muted/40 text-[9px] px-1">{timeStr}</span>
      </div>
    </div>
  );
}

// ─── 채팅 화면 ────────────────────────────────────────────────────────────────
function ChatWindow({ roomId }: { roomId: number }) {
  const { user } = useAuthStore();
  const {
    rooms, messages, messagesLoading, hasPrevMessages, typingUsers,
    fetchMessages, appendMessage,
  } = useChatStore();
  const room = rooms.find((r) => r.id === roomId);

  const [input,     setInput]     = useState('');
  const [secretTo,  setSecretTo]  = useState<number | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const topRef      = useRef<HTMLDivElement>(null);

  const { isConnected, isConnecting, sendMessage, sendTyping } = useChat(roomId);

  // 최초 메시지 로드 + 아래로 스크롤
  useEffect(() => {
    fetchMessages(roomId);
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 위로 스크롤하면 이전 메시지 로드
  const handleScroll = useCallback(async (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasPrevMessages && !messagesLoading) {
      const firstId = messages[0]?.id;
      if (firstId) await fetchMessages(roomId, firstId);
    }
  }, [hasPrevMessages, messagesLoading, messages, roomId, fetchMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim(), 'text', secretTo ?? undefined);
    setInput('');
    setSecretTo(null);
  };

  // 타이핑 표시 (현재 유저 제외)
  const othersTyping = typingUsers.filter((t) => t.user_id !== user?.id);

  return (
    <div className="flex flex-col h-full">
      {/* ── 헤더 ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-ssolap-border flex-shrink-0">
        {/* 방 이름 / DM 상대 */}
        {room && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {room.room_type === 'direct' && room.dm_partner?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={room.dm_partner.avatar_url} alt="" className="w-7 h-7 object-cover border border-ssolap-border flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 bg-ssolap-silver/10 border border-ssolap-border flex items-center justify-center text-ssolap-silver text-[10px] font-bold flex-shrink-0">
                {room.room_type === 'direct' && room.dm_partner
                  ? room.dm_partner.display_name[0]
                  : room.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-ssolap-silver text-xs font-semibold truncate">
                {room.room_type === 'direct' && room.dm_partner
                  ? room.dm_partner.display_name
                  : room.name}
              </p>
              {room.room_type === 'direct' && room.dm_partner && (
                <p className="text-ssolap-muted/50 text-[10px]">@{room.dm_partner.username}</p>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : isConnecting ? 'bg-yellow-400 animate-pulse' : 'bg-ssolap-muted/40'}`} />
          <span className="text-ssolap-muted text-[10px]">
            {isConnected ? '연결됨' : isConnecting ? '연결 중...' : '연결 끊김'}
          </span>
        </div>
      </div>

      {/* ── 메시지 영역 ────────────────────────────────────────── */}
      <div
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-ssolap-border"
      >
        {/* 이전 메시지 로드 */}
        {hasPrevMessages && (
          <div className="text-center py-2">
            <button onClick={() => fetchMessages(roomId, messages[0]?.id)}
              className="text-ssolap-muted text-[10px] hover:text-ssolap-silver tracking-widest">
              {messagesLoading ? '로딩 중...' : '이전 메시지 더 보기 ↑'}
            </button>
          </div>
        )}

        {/* 초기 로딩 */}
        {messagesLoading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <span className="text-ssolap-muted text-xs animate-pulse">메시지 로딩 중...</span>
          </div>
        )}

        {!messagesLoading && messages.length === 0 && (
          <div className="text-center py-16">
            <p className="text-ssolap-muted/40 text-xs tracking-widest">첫 메시지를 보내보세요</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={msg.sender?.id === user?.id}
          />
        ))}

        {/* 타이핑 표시 */}
        {othersTyping.length > 0 && (
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1.5 h-1.5 bg-ssolap-muted/50 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-ssolap-muted/50 text-[10px]">
              {othersTyping.map((t) => t.username).join(', ')} 입력 중...
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── 비밀 메시지 수신자 표시 ────────────────────────────── */}
      {secretTo && (
        <div className="px-5 py-1.5 bg-ssolap-silver/5 border-t border-ssolap-border/50 flex items-center justify-between">
          <span className="text-ssolap-silver/60 text-[10px]">🔒 비밀 메시지 → 유저 #{secretTo}</span>
          <button onClick={() => setSecretTo(null)} className="text-ssolap-muted hover:text-red-400 text-[10px]">취소</button>
        </div>
      )}

      {/* ── 입력창 ─────────────────────────────────────────────── */}
      <form onSubmit={handleSend}
        className="flex items-center gap-3 px-4 py-3 border-t border-ssolap-border flex-shrink-0">
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); sendTyping(); }}
          placeholder={isConnected ? '메시지 입력...' : '연결 중...'}
          disabled={!isConnected}
          maxLength={2000}
          className="flex-1 bg-white/5 border border-ssolap-border px-4 py-2.5 text-sm text-ssolap-silver placeholder:text-ssolap-muted/50 focus:outline-none focus:border-ssolap-silver/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        />
        <button type="submit" disabled={!input.trim() || !isConnected}
          className="btn-primary px-4 py-2.5 text-xs disabled:opacity-40 flex-shrink-0">
          전송
        </button>
      </form>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [showCreate,   setShowCreate]   = useState(false);
  const [showExplore,  setShowExplore]  = useState(false);

  const {
    rooms, exploreRooms, roomsLoading, activeRoomId,
    fetchMyRooms, fetchExploreRooms, setActiveRoom, joinRoom,
  } = useChatStore();

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  useEffect(() => {
    fetchMyRooms();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExplore = async () => {
    setShowExplore(true);
    await fetchExploreRooms();
  };

  const handleJoin = async (roomId: number) => {
    try {
      await joinRoom(roomId);
      setShowExplore(false);
      setActiveRoom(roomId);
      toast.success('채팅방에 입장했습니다');
    } catch (err: any) {
      toast.error(err?.message ?? '입장에 실패했습니다');
    }
  };

  return (
    // 채팅 전용 레이아웃: max-w 없이 전체 너비 사용
    <div className="fixed inset-0 ml-[220px] mt-14 flex overflow-hidden bg-[#0A0A14]">

      {/* ── 좌: 방 목록 ───────────────────────────────────────── */}
      <div className="w-[260px] border-r border-ssolap-border flex flex-col flex-shrink-0">
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-ssolap-border flex items-center justify-between">
          <h2 className="text-ssolap-silver text-xs font-bold tracking-[0.3em]">채팅</h2>
          <div className="flex gap-2">
            <button onClick={handleExplore}
              className="text-ssolap-muted hover:text-ssolap-silver text-[10px] tracking-wide transition-colors">
              탐색
            </button>
            <button onClick={() => setShowCreate(true)}
              className="text-ssolap-silver hover:text-white text-lg leading-none transition-colors">+</button>
          </div>
        </div>

        {/* 방 목록 */}
        <div className="flex-1 overflow-y-auto">
          {roomsLoading && rooms.length === 0 && (
            <div className="flex flex-col gap-2 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-ssolap-border/30 animate-pulse" />
              ))}
            </div>
          )}
          {!roomsLoading && rooms.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-ssolap-muted/50 text-xs leading-relaxed">
                아직 입장한 채팅방이 없습니다<br />
                방을 만들거나 탐색해보세요
              </p>
            </div>
          )}
          {rooms.map((room) => (
            <RoomItem
              key={room.id}
              room={room}
              isActive={activeRoomId === room.id}
              onClick={() => setActiveRoom(room.id)}
            />
          ))}
        </div>
      </div>

      {/* ── 우: 채팅 화면 ─────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {activeRoomId ? (
          <ChatWindow roomId={activeRoomId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-5xl text-ssolap-silver/10 mb-4">◧</div>
            <p className="text-ssolap-silver text-sm font-bold tracking-[0.2em] mb-2">
              {activeRoom?.name ?? '채팅방을 선택하세요'}
            </p>
            <p className="text-ssolap-muted text-xs">
              좌측에서 채팅방을 선택하거나 새로 만들어보세요
            </p>
          </div>
        )}
      </div>

      {/* ── 방 탐색 오버레이 ──────────────────────────────────── */}
      {showExplore && (
        <div className="absolute inset-0 bg-black/70 z-40 flex items-center justify-center">
          <div className="bg-[#0D0D1A] border border-ssolap-border w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ssolap-border">
              <h3 className="text-ssolap-silver font-bold text-sm tracking-widest">공개 채팅방</h3>
              <button onClick={() => setShowExplore(false)} className="text-ssolap-muted hover:text-ssolap-silver">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {exploreRooms.length === 0 && (
                <p className="text-center text-ssolap-muted text-xs py-8">공개 채팅방이 없습니다</p>
              )}
              {exploreRooms.map((room) => (
                <div key={room.id} className="card flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-ssolap-silver text-sm font-semibold truncate">{room.name}</p>
                    <p className="text-ssolap-muted text-[10px] mt-0.5">
                      {room.member_count}명 · {room.entry_type === 'open' ? '자유 입장' : room.entry_type === 'password' ? '비밀번호' : `${room.entry_fee} SP`}
                    </p>
                  </div>
                  {room.is_member ? (
                    <span className="text-ssolap-muted text-[10px] flex-shrink-0">입장함</span>
                  ) : (
                    <button onClick={() => handleJoin(room.id)}
                      className="btn-primary text-xs py-1.5 px-4 flex-shrink-0">
                      입장
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 방 생성 모달 */}
      {showCreate && <CreateRoomModal onClose={() => { setShowCreate(false); fetchMyRooms(); }} />}
    </div>
  );
}
