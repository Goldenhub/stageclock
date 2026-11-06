/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./control.html",
    "./display.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        brand: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          muted: "rgba(99,102,241,0.15)",
        },
      },
      animation: {
        flash: "flash 1s ease-in-out infinite",
        "pulse-slow": "pulse-slow 1.6s ease-in-out infinite",
        "banner-in": "banner-in 300ms cubic-bezier(0.2, 0.9, 0.3, 1.2)",
        "fade-in": "fade-in 150ms ease-out",
        "pop-in": "pop-in 180ms cubic-bezier(0.2, 0.9, 0.3, 1)",
      },
      keyframes: {
        flash: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        "banner-in": {
          from: { opacity: "0", transform: "translateY(30%) scale(0.96)" },
          to: { opacity: "1", transform: "none" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
      },
    },
  },
  plugins: [],
};
