import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF0FF", 100: "#E0E4FF", 500: "#6366F1", 600: "#4F46E5", 700: "#4338CA",
        },
        surface: "#F7F8FA",
      },
      borderRadius: { card: "12px" },
    },
  },
  plugins: [],
};
export default config;
