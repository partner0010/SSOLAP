import withPWA from 'next-pwa';

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // 개발 환경에서는 SW 비활성화
  disable: process.env.NODE_ENV === 'development',
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
  // Docker 프로덕션 빌드: standalone 출력 (node_modules 없이 실행 가능)
  output: process.env.DOCKER_BUILD === 'true' ? 'standalone' : undefined,

  // API 프록시 — 프론트에서 /api/* 요청을 FastAPI로 전달
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/:path*`,
      },
    ];
  },

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

  // TypeScript 엄격 모드
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default pwaConfig(nextConfig);
