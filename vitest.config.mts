import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Módulos marcados como server-only são substituídos por um módulo vazio nos testes.
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Os testes de integração usam a base de dados real: correm em série.
    fileParallelism: false,
    testTimeout: 60_000,
    setupFiles: ["./tests/setup.ts"],
  },
});
