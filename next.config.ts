import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The free-slots flyer reads its font from disk (lib/brand/free-slots-image.tsx).
  outputFileTracingIncludes: {
    '/club/asistente/flyer': ['./assets/fonts/BarlowCondensed-ExtraBold.ttf'],
  },
};

export default nextConfig;
