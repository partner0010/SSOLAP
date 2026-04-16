import withPWA from 'next-pwa';

// Docker 프로덕션 빌드 여부
const isDocker = process.env.DOCKER_BUILD === 'true';
const isDev    = process.env.NODE_ENV === 'development';

// ─── HTTP 보안 헤더 ──────────────────────────────────────────────────────────
const securityHeaders = [
  // Clickjacking 방어
  { key: 'X-Frame-Options',          value: 'DENY' },
  // MIME 스니핑 방어
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  // XSS 필터 (레거시 브라우저)
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  // Referrer 정보 최소화
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  // 권한 정책 — 불필요한 브라우저 기능 차단
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  // CSP (Content Security Policy) — XSS 공격 완화
  // 개발: 'unsafe-eval' 허용 (Next.js dev 서버 필요)
  // 프로덕션: 엄격 모드
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: http://localhost:8000 https:",
      "media-src 'self' blob: http://localhost:8000 https:",
      "font-src 'self'",
      "connect-src 'self' http://localhost:8000 ws://localhost:8000 wss://localhost:8000 https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // 개발 환경에서는 SW 비활성화
  disable: isDev,
  runtimeCaching: [
    // API 응답 — Network First (항상 최신 데이터)
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 5 },
        networkTimeoutSeconds: 10,
      },
    },
    // 업로드 이미지/영상 — Cache First (변경 없음)
    {
      urlPattern: /^https?:\/\/.*\/uploads\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'uploads-cache',
        expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // 폰트, 정적 파일 — Stale While Revalidate
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── 출력 모드 ─────────────────────────────────────────────────────────────
  // Docker: standalone → node_modules 없이 실행 가능
  // 개발:   기본값 (서버 모드)
  output: isDocker ? 'standalone' : undefined,

  // 이미지 도메인 허용 (업로드 파일 서빙)
  images: {
    domains: ['localhost', '127.0.0.1'],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/uploads/**',
      },
    ],
  },

  // API 프록시 — 프론트에서 /api/* 요청을 FastAPI로 전달
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/:path*`,
      },
    ];
  },

  // ── HTTP 보안 헤더 ─────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },

  // TypeScript 엄격 모드
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default pwaConfig(nextConfig);
