import path from 'node:path';
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, {webpack}) => {
    const emptyPolyfillsPath = path.resolve(__dirname, 'src/lib/empty-polyfills.ts');

    config.resolve.alias = {
      ...config.resolve.alias,
      'next/dist/build/polyfills/polyfill-module': false,
      'next/dist/build/polyfills/polyfill-module.js': false,
    };

    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /next[\\/]dist[\\/](?:esm[\\/])?build[\\/]polyfills[\\/]polyfill-module(?:\.js)?$/,
        emptyPolyfillsPath
      )
    );

    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'fastly.picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/storage/v1/object/**',
      }
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self' blob:; child-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://api.qrserver.com https://placehold.co https://picsum.photos https://fastly.picsum.photos https://images.unsplash.com; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
