import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @lbm/shared se publica como TypeScript sin compilar dentro del monorepo.
  transpilePackages: ["@lbm/shared"],
};

export default nextConfig;
