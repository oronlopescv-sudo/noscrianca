import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#1B2333", dark: "#131A27", light: "#28324A", text: "#C9D1E0" },
        accent: { DEFAULT: "rgb(var(--accent) / <alpha-value>)" },
        surface: "#F6F7F9",
        ink: { DEFAULT: "#111827", soft: "#6B7280" },
        line: "#E5E7EB",
        room: { green: "#5DC98A", coral: "#F0714F", blue: "#5B8DEF", yellow: "#F5B93A", purple: "#A77BDB" },
      },
      fontFamily: { sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"] },
      borderRadius: { card: "16px", btn: "10px" },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)" },
    },
  },
  plugins: [],
};
export default config;
