

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

export default nextConfig;
