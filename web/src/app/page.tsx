/**
 * 랜딩 페이지 (홈)
 * 비로그인 → 이 페이지
 * 로그인 → /feed 로 리다이렉트
 */
import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ssolap-black flex flex-col">

      {/* ── 상단 네비 ──────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-ssolap-border">
        <span className="text-ssolap-silver font-black text-xl tracking-[0.4em]">
          SSOLAP
        </span>
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="btn-secondary text-xs py-2 px-4">
            로그인
          </Link>
          <Link href="/auth/signup" className="btn-primary text-xs py-2 px-4">
            시작하기
          </Link>
        </div>
      </nav>

      {/* ── 히어로 섹션 ────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-8 py-20">

        {/* 배경 그라디언트 장식 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          w-[600px] h-[600px] rounded-full opacity-[0.03]
                          bg-ssolap-silver blur-[120px]" />
        </div>

        {/* 태그라인 */}
        <div className="badge text-ssolap-muted border-ssolap-border text-xs tracking-[0.3em]">
          HYBRID SNS PLATFORM
        </div>

        {/* 메인 타이틀 */}
        <h1 className="text-5xl md:text-7xl font-black leading-none text-metallic">
          SSOLAP
        </h1>

        {/* 서브 타이틀 */}
        <p className="text-ssolap-muted text-base md:text-lg max-w-lg leading-relaxed tracking-wide">
          유튜브의 영상, 인스타의 피드, 카카오톡의 채팅.<br />
          <span className="text-ssolap-silver">하나의 플랫폼에서 모두.</span>
        </p>

        {/* CTA 버튼 */}
        <div className="flex gap-4 mt-4">
          <Link href="/auth/signup" className="btn-primary px-8 py-3 text-sm">
            무료로 시작하기
          </Link>
          <Link href="/auth/login" className="btn-secondary px-8 py-3 text-sm">
            로그인
          </Link>
        </div>

        {/* 피처 카드 3개 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 w-full max-w-3xl">
          {[
            {
              icon: '▶',
              title: '미디어 피드',
              desc: '숏폼부터 롱폼까지. 크리에이터의 모든 콘텐츠를 한 곳에서.',
            },
            {
              icon: '◈',
              title: '채팅 & 커뮤니티',
              desc: '실시간 채팅, 비밀 메시지, AI 비서. 연결의 새로운 형태.',
            },
            {
              icon: '✦',
              title: 'S포인트 경제',
              desc: '콘텐츠로 포인트를 벌고, 플랫폼 내에서 자유롭게 사용.',
            },
          ].map((feature) => (
            <div key={feature.title} className="card hover:border-ssolap-silver/40 transition-colors">
              <div className="text-2xl text-ssolap-silver mb-3">{feature.icon}</div>
              <h3 className="text-ssolap-silver font-bold text-sm tracking-widest mb-2">
                {feature.title}
              </h3>
              <p className="text-ssolap-muted text-xs leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 하단 ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-ssolap-border px-8 py-5">
        <p className="text-ssolap-muted text-xs tracking-[0.2em] text-center">
          © 2026 SSOLAP. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
