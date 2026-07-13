import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 배포 시 /api/setup 서버 함수 번들에 시드 데이터 파일을 포함시킨다
  outputFileTracingIncludes: {
    "/api/setup": ["./data/seed-words.json"],
  },
};

export default nextConfig;
