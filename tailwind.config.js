/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        serendipity: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9dfff',
          300: '#7cc4ff',
          400: '#36a5ff',
          500: '#0c85f1',
          600: '#0068ce',
          700: '#0053a7',
          800: '#05478a',
          900: '#0a3c72',
        }
      }
    },
  },
  plugins: [],
}
