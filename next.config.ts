import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Served from app.erp.io/chat so the suite shares ONE origin. Keep in
   * lockstep with BASE_PATH in src/lib/base-path.ts.
   */
  basePath: "/chat",
  output: "standalone",
  serverExternalPackages: ["pg"],
};

export default nextConfig;
