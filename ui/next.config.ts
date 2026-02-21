import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for bundling with Electron
  output: 'standalone',
  // Disable image optimization for Electron
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
