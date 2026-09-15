/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        cyan: "hsl(var(--cyan))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Obsidian HUD surface hierarchy
        "surface-lowest": "var(--surface-lowest, #0e0e0e)",
        "surface-low": "var(--surface-low, #161616)",
        "surface-container": "var(--surface-container, #1a1a1a)",
        "surface-high": "var(--surface-high, #232323)",
        "surface-highest": "var(--surface-highest, #2c2c2c)",
        "outline-hud": "var(--outline-hud, #9a93a0)",
        "outline-variant": "var(--outline-variant, #2a2730)",
        "on-surface": "var(--on-surface, #e5e2e1)",
        "secondary-container": "var(--secondary-container, #00e3fd)",
        "primary-container": "var(--primary-container, #c77dff)",
        tertiary: "var(--tertiary, #dac839)",
      },
      fontFamily: {
        headline: ["IBM Plex Sans", "system-ui", "sans-serif"],
        body: ["IBM Plex Sans", "system-ui", "sans-serif"],
        label: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      // Redesign type scale — four roles (alongside Tailwind defaults).
      fontSize: {
        label: ["12.5px", { lineHeight: "1.4" }],
        data: ["14px", { lineHeight: "1.45" }],
        value: ["14.5px", { lineHeight: "1.25" }],
        head: ["17px", { lineHeight: "1.3" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
