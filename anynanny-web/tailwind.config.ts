import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0D2B52",
          800: "#123A6F",
          700: "#2A5DBC"
        },
        surface: "#F4F7FC"
      }
    }
  },
  plugins: []
};

export default config;
