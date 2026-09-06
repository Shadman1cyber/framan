import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FAF4E8",
          50: "#FDFAF3",
          100: "#FAF4E8",
          200: "#F2E8D5",
          300: "#E8D8BC",
        },
        beige: {
          DEFAULT: "#EFE3CB",
          soft: "#F5EBD8",
        },
        olive: {
          DEFAULT: "#556B2F",
          50: "#F1F4E8",
          100: "#DDE3C3",
          200: "#BBC893",
          300: "#8FA268",
          400: "#6B8147",
          500: "#556B2F",
          600: "#3F4F22",
          700: "#2F3B19",
        },
        coffee: {
          DEFAULT: "#6F4E37",
          light: "#8C6E54",
          dark: "#4E3622",
        },
        espresso: {
          DEFAULT: "#2B1810",
          light: "#3D2419",
        },
        muted: {
          DEFAULT: "#8A7B6B",
          light: "#B5A796",
        },
        danger: {
          DEFAULT: "#B5462C",
          light: "#D97B5E",
        },
        warning: {
          DEFAULT: "#C68A2E",
          light: "#E0B262",
        },
      },
      fontFamily: {
        sans: ["var(--font-vazirmatn)", "system-ui", "sans-serif"],
        display: ["var(--font-vazirmatn)", "serif"],
      },
      borderRadius: {
        sm: "0.5rem",
        DEFAULT: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
        "2xl": "1.75rem",
      },
      boxShadow: {
        soft: "0 2px 8px rgba(75, 50, 30, 0.06)",
        card: "0 4px 18px rgba(75, 50, 30, 0.08)",
        elevated: "0 12px 36px rgba(75, 50, 30, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;