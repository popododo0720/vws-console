import type { NextConfig } from "next";
import { SERVER_ACTION_BODY_LIMIT_BYTES } from "./src/lib/object-upload";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: SERVER_ACTION_BODY_LIMIT_BYTES,
    },
  },
};

export default nextConfig;
