/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        sidebar: {
          bg: '#0f172a',
          hover: '#1e293b',
          active: '#334155',
          border: '#1e293b',
          text: '#94a3b8',
          textActive: '#ffffff',
        }
      }
    },
  },
  plugins: [],
}

