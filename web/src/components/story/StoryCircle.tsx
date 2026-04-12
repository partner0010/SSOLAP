'use client';

/**
 * StoryCircle.tsx — 스토리 아바타 원형 (안 본 = 컬러 링, 본 = 회색 링)
 */

interface StoryCircleProps {
  username:     string;
  displayName:  string;
  avatarUrl?:   string | null;
  hasUnseen:    boolean;
  isMe?:        boolean;
  onClick:      () => void;
  size?:        'sm' | 'md';
}

export default function StoryCircle({
  username, displayName, avatarUrl, hasUnseen, isMe = false, onClick, size = 'md',
}: StoryCircleProps) {
  const dim     = size === 'md' ? 'w-14 h-14' : 'w-10 h-10';
  const textSz  = size === 'md' ? 'text-xs' : 'text-[10px]';
  const avatarSz = size === 'md' ? 'w-12 h-12' : 'w-8 h-8';

  // 링 색상: 안 본 = 그라디언트 (인스타 스타일), 본 = 회색
  const ring = hasUnseen
    ? 'ring-2 ring-offset-2 ring-offset-ssolap-bg ring-ssolap-silver/80'
    : 'ring-2 ring-offset-2 ring-offset-ssolap-bg ring-ssolap-border';

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
    >
      {/* 링 + 아바타 */}
      <div className={`${dim} rounded-full flex items-center justify-center ${ring} transition-all group-hover:scale-105`}>
        <div className={`${avatarSz} rounded-full overflow-hidden bg-ssolap-silver/10 flex items-center justify-center relative`}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-ssolap-silver font-bold text-sm">
              {displayName[0]}
            </span>
          )}

          {/* 내 스토리에는 + 뱃지 */}
          {isMe && (
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-ssolap-silver rounded-full flex items-center justify-center -mb-0.5 -mr-0.5">
              <span className="text-ssolap-bg text-[10px] font-bold leading-none">+</span>
            </div>
          )}
        </div>
      </div>

      {/* 이름 */}
      <span className={`${textSz} text-ssolap-muted group-hover:text-ssolap-silver transition-colors truncate w-14 text-center`}>
        {isMe ? '내 스토리' : displayName}
      </span>
    </button>
  );
}
