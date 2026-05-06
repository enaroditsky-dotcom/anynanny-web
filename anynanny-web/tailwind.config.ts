import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#165b73",
          800: "#1d6a82",
          700: "#2b7e96"
        },
        brand: {
          mint: "#dce7cf",
          earth: "#8f7a45",
          peach: "#f2c7a5",
          salmon: "#FF8A8A",
          cream: "#f7f2ea"
        },
        surface: "#f7f2ea"
      },
      boxShadow: {
        soft: "0 10px 28px rgba(22,91,115,0.12)"
      }
    }
  },
  plugins: []
};

export default config;
