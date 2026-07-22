import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Unit tests target pure functions and never connect to the DB, but importing
    // route modules pulls in the db client at module-load time, which throws when
    // DATABASE_URL is unset (CI, fresh clones). Inject a dummy value so modules
    // load; no real connection is ever made.
    env: {
      DATABASE_URL: "postgresql://unit-test:unit-test@localhost:5432/unit-test",
      NODE_ENV: "test",
    },
  },
});
