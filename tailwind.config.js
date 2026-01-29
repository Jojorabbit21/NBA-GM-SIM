
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}", // 루트에 있는 App.tsx, index.tsx 등을 포함
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
