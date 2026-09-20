/** @type {import('next').NextConfig} */
const port = process.env.PORT || 3080;
const withPWA = require("next-pwa")({
  dest: "public",
  customWorkerDir: "src/service-worker",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/worker/],
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "unsplash-images",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https:\/\/.*\/api\/(categories|products|allergens|dietary-tags)/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "api-read-cache",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24,
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https:\/\/.*\/api\/orders$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "api-orders-mutation",
        networkTimeoutSeconds: 10,
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  compress: true,
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: [`localhost:${port}`, `127.0.0.1:${port}`] },
    optimizePackageImports: ["@prisma/client", "zod", "date-fns", "bcryptjs"],
  },
};

module.exports = withPWA(nextConfig);