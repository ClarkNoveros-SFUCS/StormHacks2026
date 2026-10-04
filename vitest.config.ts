import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests: `npm test`. DB integration tests run only when TEST_DATABASE_URL is set, and
// then lib/db.ts connects there. Never point it at the shared Tiger Cloud database: the
// tests insert and delete their own rows.
const testDb = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // `server-only` throws outside React Server Components; tests are server code too
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    env: testDb ? { DATABASE_URL: testDb } : {},
  },
});
