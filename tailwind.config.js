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
        "surface-low": "var(--surface-low, #1c1b1b)",
        "surface-container": "var(--surface-container, #201f1f)",
        "surface-high": "var(--surface-high, #2a2a2a)",
        "surface-highest": "var(--surface-highest, #353534)",
        "outline-hud": "var(--outline-hud, #998d9d)",
        "outline-variant": "var(--outline-variant, #4d4352)",
        "on-surface": "var(--on-surface, #e5e2e1)",
        "secondary-container": "var(--secondary-container, #00e3fd)",
        "primary-container": "var(--primary-container, #c77dff)",
        tertiary: "var(--tertiary, #dac839)",
      },
      fontFamily: {
        headline: ["Space Grotesk", "monospace"],
        body: ["Manrope", "sans-serif"],
        label: ["Space Grotesk", "monospace"],
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
