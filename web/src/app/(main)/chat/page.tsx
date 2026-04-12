'use client';

/**
 * chat/page.tsx — 채팅 페이지 (Phase 4에서 구현)
 */
export default function ChatPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl text-ssolap-silver/10 mb-5">◧</div>
      <h2 className="text-ssolap-silver text-sm font-bold tracking-[0.3em] uppercase mb-2">
        채팅
      </h2>
      <p className="text-ssolap-muted text-xs leading-relaxed max-w-xs">
        실시간 채팅, 비밀 메시지, AI 비서는<br />
        Phase 4에서 WebSocket과 함께 구현됩니다
      </p>
      <div className="mt-8 px-5 py-2.5 border border-ssolap-border/40 text-ssolap-muted/50 text-xs tracking-widest">
        COMING SOON
      </div>
    </div>
  );
}
