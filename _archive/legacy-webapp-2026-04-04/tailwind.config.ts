import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:        "#0e0f10",
        slate:      "#1c2330",
        "slate-mid":"#232f3e",
        fog:        "#3d4a58",
        mist:       "#7a8fa3",
        pale:       "#c8d4de",
        white:      "#f5f3ef",
        "brand-blue":       "#2d86c4",
        "brand-blue-light": "#4fa3d8",
      },
      fontFamily: {
        serif:   ["Cormorant Garamond", "Georgia", "serif"],
        body:    ["Libre Baskerville", "Georgia", "serif"],
        sans:    ["Jost", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
