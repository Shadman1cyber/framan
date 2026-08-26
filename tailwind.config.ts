import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // FARMAN brand tokens
        brand: {
          DEFAULT: "#5B3CC4",
          hover: "#4B30A5",
          soft: "#F0ECFA",
          mid: "#8B7BD8",
        },
        ink: "#17131F",
        ink2: "#6F6A78",
        canvas: "#FAF9FC",
        borders: "#E7E3ED",
        // Semantic remaps — existing green/amber/red/red classes adopt brand hues
        green: {
          50: "#EAF6F1",
          200: "#BFE3D6",
          500: "#159570",
          600: "#159570",
          700: "#10785A",
          800: "#0C5C45",
        },
        amber: {
          50: "#FBF4E7",
          100: "#F6EAD2",
          200: "#EFD9AE",
          500: "#D98A18",
          600: "#C27B12",
          700: "#A66A0F",
          800: "#8A570C",
        },
        red: {
          50: "#FBEDED",
          200: "#F0C4C4",
          300: "#EBA9A9",
          500: "#D64545",
          600: "#C93B3B",
          700: "#A82F2F",
        },
        // Neutral ramp tuned to brand ink undertones — re-skins all existing neutral-* classes
        neutral: {
          50: "#FAF9FC",
          100: "#F1EFF5",
          200: "#E7E3ED",
          300: "#CDC8D8",
          400: "#9B95A8",
          500: "#6F6A78",
          600: "#555061",
          700: "#3B3646",
          800: "#262130",
          900: "#17131F",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,19,31,0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
