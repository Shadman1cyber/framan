/** @type {import('next').NextConfig} */
const port = process.env.PORT || 3080;

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: [`localhost:${port}`, `127.0.0.1:${port}`] },
  },
};

module.exports = nextConfig;
