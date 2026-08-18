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
        mono: ["'Courier New'", "Courier", "monospace"],
      },
      animation: {
        flash: "flash 1s ease-in-out infinite",
      },
      keyframes: {
        flash: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
      },
    },
  },
  plugins: [],
};
