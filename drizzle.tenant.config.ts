import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", schema: "./src/db/tenant/schema.ts", out: "./drizzle/tenant" });
