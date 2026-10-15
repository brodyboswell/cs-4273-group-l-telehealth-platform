import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#F7F6F2",
        sage: "#88A294",
        terracotta: "#C97C63",
        charcoal: "#293C35",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      spacing: {
        header: "56px",
        rail: "180px",
        cam: "112px",
      },
      borderRadius: {
        panel: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
