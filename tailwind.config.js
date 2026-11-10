/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        serif: ['var(--font-serif)'],
      },
      colors: {
        bg: '#0f1117',
        surface: '#181c27',
        surface2: '#1f2535',
        border: '#2a3047',
        accent: '#f5c842',
        success: '#3ecf8e',
        danger: '#e96b6b',
        info: '#7eb8f7',
      }
    }
  },
  plugins: [],
}
