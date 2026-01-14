import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui"]
      },
      colors: {
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "#ffffff"
        },
        secondary: {
          DEFAULT: "#14B8A6"
        },
        accent: {
          DEFAULT: "#F59E0B"
        }
      }
    }
  },
  darkMode: "class",
  plugins: []
} satisfies Config;
