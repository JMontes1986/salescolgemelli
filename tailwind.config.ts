import type {Config} from 'tailwindcss';

const color = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
        body: ['var(--font-sans)'],
        headline: ['var(--font-sans)'],
        code: ['var(--font-mono)'],
      },
      colors: {
        background: color('background'),
        foreground: color('foreground'),
        card: {
          DEFAULT: color('card'),
          foreground: color('card-foreground'),
        },
        popover: {
          DEFAULT: color('popover'),
          foreground: color('popover-foreground'),
        },
        primary: {
          DEFAULT: color('primary'),
          foreground: color('primary-foreground'),
        },
        secondary: {
          DEFAULT: color('secondary'),
          foreground: color('secondary-foreground'),
        },
        muted: {
          DEFAULT: color('muted'),
          foreground: color('muted-foreground'),
        },
        accent: {
          DEFAULT: color('accent'),
          foreground: color('accent-foreground'),
        },
        destructive: {
          DEFAULT: color('destructive'),
          foreground: color('destructive-foreground'),
        },
        border: color('border'),
        input: color('input'),
        ring: color('ring'),
        chart: {
          '1': color('chart-1'),
          '2': color('chart-2'),
          '3': color('chart-3'),
          '4': color('chart-4'),
          '5': color('chart-5'),
        },
        sidebar: {
          DEFAULT: color('sidebar'),
          foreground: color('sidebar-foreground'),
          primary: color('sidebar-primary'),
          'primary-foreground': color('sidebar-primary-foreground'),
          accent: color('sidebar-accent'),
          'accent-foreground': color('sidebar-accent-foreground'),
          border: color('sidebar-border'),
          ring: color('sidebar-ring'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
