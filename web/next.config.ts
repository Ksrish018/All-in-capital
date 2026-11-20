import type { NextConfig } from "next";

// Keys live in the repo root .env, loaded by node --env-file in package.json scripts.

const nextConfig: NextConfig = {
  // Every page in this internal tool needs a signed-in user and fresh data,
  // so static prerendering (Cache Components) adds complexity without benefit.
  cacheComponents: false,
  // Only these two values reach the browser. Both are safe to expose:
  // the publishable key works only with Row Level Security on.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
