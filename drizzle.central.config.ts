import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", schema: "./src/db/central/schema.ts", out: "./drizzle/central" });
