import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Docker 최적화 빌드
  allowedDevOrigins: ["10.221.86.81"],
};

export default nextConfig;
