import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./features/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          /** Matches global header wordmark / primary dark navy */
          header: "#001F3F",
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
      },
      keyframes: {
        "session-pulse-navy": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0, 31, 63, 0.42)" },
          "50%": { boxShadow: "0 0 0 14px rgba(0, 31, 63, 0)" }
        },
        "session-pulse-green": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(5, 150, 105, 0.42)" },
          "50%": { boxShadow: "0 0 0 14px rgba(5, 150, 105, 0)" }
        },
        "fade-route": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.988)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        }
      },
      animation: {
        "session-pulse-navy": "session-pulse-navy 2.2s ease-in-out infinite",
        "session-pulse-green": "session-pulse-green 2.2s ease-in-out infinite",
        "fade-route": "fade-route 0.48s cubic-bezier(0.22, 1, 0.36, 1) both"
      }
    }
  },
  plugins: []
};

export default config;
