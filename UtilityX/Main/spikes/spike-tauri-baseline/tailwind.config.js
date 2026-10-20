/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src-ui/**/*.{js,ts,jsx,tsx}",
    "./drawer.html"
  ],
  theme: {
    extend: {
      colors: {
        background: '#111412',
        surface: 'rgba(25, 29, 26, 0.94)',
        accent: '#B9C7A6',
        success: '#9CB996',
      }
    },
  },
  plugins: [],
}
