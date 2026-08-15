/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 品牌主色（简洁、低视觉负担）
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a'
        },
        // 语义色
        ok: '#10b981', warn: '#f59e0b', danger: '#ef4444', info: '#0ea5e9'
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif']
      },
      borderRadius: {
        xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem'
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(0,0,0,0.18)',
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 12px 40px -12px rgba(14,165,233,0.35)'
      },
      backdropBlur: {
        xs: '2px'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'pop': {
          '0%': { transform: 'scale(0.96)' }, '60%': { transform: 'scale(1.02)' }, '100%': { transform: 'scale(1)' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'pop': 'pop 0.3s ease-out both'
      }
    }
  },
  plugins: []
}
