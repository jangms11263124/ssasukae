import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 같은 LAN의 다른 PC에서 개발 서버 화면을 조작할 수 있도록 허용한다.
  allowedDevOrigins: ['192.168.100.91'],
  turbopack: {
    resolveAlias: {
      // tone의 browser 필드가 UMD 번들(정적 export 없음)을 가리켜 Turbopack이
      // named import를 해석하지 못한다. ESM 빌드로 강제한다.
      tone: 'tone/build/esm/index.js',
    },
  },
};

export default nextConfig;
