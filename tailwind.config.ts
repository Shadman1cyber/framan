import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark-only theme: legacy light tokens are remapped to dark surfaces
        // so every existing `bg-cream` / `text-espresso` usage renders dark.
        cream: {
          DEFAULT: "#241E18",
          50: "#241E18",
          100: "#241E18",
          200: "#2D241C",
          300: "#3D3228",
        },
        beige: {
          DEFAULT: "#2D241C",
          soft: "#2D241C",
        },
        olive: {
          DEFAULT: "#8FA268",
          50: "#2D241C",
          100: "#3D3228",
          200: "#556B2F",
          300: "#8FA268",
          400: "#8FA268",
          500: "#8FA268",
          600: "#BBC893",
          700: "#DDE3C3",
        },
        coffee: {
          DEFAULT: "#8C6E54",
          light: "#C4B8A8",
          dark: "#F5EFE6",
        },
        espresso: {
          DEFAULT: "#F5EFE6",
          light: "#C4B8A8",
        },
        muted: {
          DEFAULT: "#C4B8A8",
          light: "#8A7B6B",
        },
        danger: {
          DEFAULT: "#B5462C",
          light: "#D97B5E",
        },
        warning: {
          DEFAULT: "#C68A2E",
          light: "#E0B262",
        },
        // Dark mode colors
        dark: {
          bg: "#1A1612",
          surface: "#241E18",
          surfaceHover: "#2D241C",
          border: "#3D3228",
          text: "#F5EFE6",
          textSecondary: "#C4B8A8",
          muted: "#8A7B6B",
        },
      },
      fontFamily: {
        sans: ["var(--font-peyda)", "system-ui", "sans-serif"],
        display: ["var(--font-peyda)", "system-ui", "sans-serif"],
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
        "dark-soft": "0 2px 8px rgba(0, 0, 0, 0.3)",
        "dark-card": "0 4px 18px rgba(0, 0, 0, 0.4)",
        "dark-elevated": "0 12px 36px rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
