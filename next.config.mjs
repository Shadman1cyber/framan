/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allows tooling to run isolated production builds (NEXT_DIST_DIR=.next-test)
  // without clobbering a concurrently running `next dev` watching .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        // Never cache app HTML/RSC payloads — prevents stale-page confusion in dev.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
