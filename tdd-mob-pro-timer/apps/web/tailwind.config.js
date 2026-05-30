/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // セマンティックカラー（CSS 変数経由でテーマ切替）
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        line: "var(--color-line)",
        fg: "var(--color-fg)",
        "fg-muted": "var(--color-fg-muted)",
        "fg-subtle": "var(--color-fg-subtle)",
        ring: "var(--color-ring)",
        primary: "var(--color-primary)",
        "on-primary": "var(--color-on-primary)",
        success: "var(--color-success)",
        "on-success": "var(--color-on-success)",
        warning: "var(--color-warning)",
        "on-warning": "var(--color-on-warning)",
        danger: "var(--color-danger)",
        "on-danger": "var(--color-on-danger)",
        accent: "var(--color-accent)",
        "on-accent": "var(--color-on-accent)",
        "presence-online": "var(--color-presence-online)",
        "presence-idle": "var(--color-presence-idle)",
        "presence-offline": "var(--color-presence-offline)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        timer: "var(--font-size-timer)",
      },
      borderRadius: {
        DEFAULT: "var(--radius-md)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        card: "0 1px 3px var(--color-shadow), 0 1px 2px var(--color-shadow)",
        lg: "0 10px 15px var(--color-shadow)",
      },
      ringColor: {
        DEFAULT: "var(--color-ring)",
      },
      ringOffsetColor: {
        bg: "var(--color-bg)",
      },
    },
  },
  plugins: [],
};
