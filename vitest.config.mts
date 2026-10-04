import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      { find: "server-only", replacement: path.resolve(root, "test/server-only-stub.ts") },
    ],
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    env: loadEnv("test", root, ""), // .env.local → DATABASE_URL for *.db.test.ts
    testTimeout: 30_000, // DB tests talk to Tiger Cloud
  },
});
