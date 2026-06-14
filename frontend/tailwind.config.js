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
          50:  '#f0fdf9',
          100: '#ccfbef',
          200: '#99f6e0',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        surface: {
          900: '#0d1117',
          800: '#161b27',
          700: '#1c2333',
          600: '#232d3f',
          500: '#2a3547',
          400: '#344055',
        },
        accent: {
          violet: '#7c3aed',
          purple: '#9333ea',
          teal:   '#14b8a6',
          pink:   '#ec4899',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':   'fadeIn 0.4s ease-out',
        'slide-up':  'slideUp 0.3s ease-out',
        'glow':      'glow 2s ease-in-out infinite alternate',
        'shimmer':   'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 },                    to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        glow:    { from: { boxShadow: '0 0 10px rgba(20,184,166,0.15)' }, to: { boxShadow: '0 0 25px rgba(20,184,166,0.35)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      boxShadow: {
        'glow-teal':   '0 0 20px rgba(20,184,166,0.25)',
        'glow-violet': '0 0 20px rgba(124,58,237,0.25)',
        'card':        '0 4px 24px rgba(0,0,0,0.35)',
        'card-hover':  '0 8px 40px rgba(0,0,0,0.45)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
}
