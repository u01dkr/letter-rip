import type { NextConfig } from "next";

// FAKE_FIREBASE=1 swaps Firebase for a pretend in-browser database (local testing only)
const fake = process.env.FAKE_FIREBASE === "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: fake
      ? {
          "firebase/app": "./testing/fake-firebase/app.ts",
          "firebase/auth": "./testing/fake-firebase/auth.ts",
          "firebase/firestore": "./testing/fake-firebase/firestore.ts",
        }
      : {},
  },
};

export default nextConfig;
