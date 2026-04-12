import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

// ─── 메타데이터 ───────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: 'SSOLAP',
    template: '%s | SSOLAP',
  },
  description: '유튜브+인스타+카카오톡이 하나로. 다음 세대 하이브리드 SNS',
  keywords: ['SSOLAP', 'SNS', '소셜', '미디어', '채팅'],
  openGraph: {
    title: 'SSOLAP',
    description: '유튜브+인스타+카카오톡이 하나로. 다음 세대 하이브리드 SNS',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A0A14',
};

// ─── 루트 레이아웃 ────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {children}

        {/* 글로벌 토스트 알림 — 다크 메탈릭 스타일 */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1A1A2A',
              color: '#8EA4BC',
              border: '1px solid #2A2A3A',
              borderRadius: '0',
              fontSize: '13px',
              letterSpacing: '0.05em',
            },
            success: {
              iconTheme: { primary: '#3D7A3D', secondary: '#0A0A14' },
            },
            error: {
              iconTheme: { primary: '#7A1A1A', secondary: '#0A0A14' },
            },
          }}
        />
      </body>
    </html>
  );
}
