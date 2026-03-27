import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Docker 최적화 빌드
};

export default nextConfig;
