import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow iframing PitchApp previews from Vercel deployments
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
