import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#000000",
          850: "#08090b",
          800: "#0d0e10",
          700: "#15171a",
          600: "#1d2025",
          500: "#262a30",
          400: "#3a3f47",
          300: "#5a6068",
          200: "#8a9098",
          100: "#c3c8cf",
          50:  "#e8ebef",
        },
        ember: {
          50:  "#fff4ed",
          100: "#ffe5d2",
          200: "#ffc4a0",
          300: "#ff9a63",
          400: "#ff7a36",
          500: "#ff5c00",
          600: "#e64a00",
          700: "#b83a00",
        },
        crimson: {
          400: "#f25646",
          500: "#ef3a2b",
          600: "#d92315",
        },
        gain: "#22c55e",
        loss: "#ef3a2b",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,92,0,0.25), 0 0 24px -4px rgba(255,92,0,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
