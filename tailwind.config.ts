import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Background layers (sehr dunkel, fast schwarz)
        background: {
          DEFAULT: '#0B0F14',
          elevated: '#0D1117',
        },
        // Karten / Flächen
        surface: {
          DEFAULT: '#161B22',
          muted: '#1C232C',
        },
        line: '#222A33', // dezente Borders
        // Blauer Akzent
        accent: {
          DEFAULT: '#3B82F6',
          strong: '#2563EB',
          soft: 'rgba(59, 130, 246, 0.12)',
        },
        // Text
        foreground: {
          DEFAULT: '#F3F6FA', // nahezu weiß für Werte
          muted: '#8B97A7', // gedämpftes Grau für Sekundärtext
          subtle: '#5C6675',
        },
        // Trend-Farben
        success: '#22C55E',
        danger: '#EF4444',
        warning: '#F59E0B',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-oswald)', 'var(--font-inter)', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
