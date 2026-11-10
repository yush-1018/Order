/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kirana: {
          50: '#fef7ee',
          100: '#fdedd6',
          200: '#fad6ac',
          500: '#f38918',
          600: '#e56c0e',
          700: '#be4e0e',
          800: '#973e13',
        }
      }
    },
  },
  plugins: [],
}
