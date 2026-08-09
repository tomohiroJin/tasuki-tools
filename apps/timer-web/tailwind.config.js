/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // セマンティックカラー。**在室状況の 3 色だけ**を残している。
      // 旧 chrome（bg/surface/fg/line/ring）と intent（primary/success/warning/
      // danger/accent）は参照が絶えていたため #78 で撤去した。計器のパレット
      // （--panel / --bone / --signal 等）は任意値記法 `[var(--*)]` で直接参照する。
      colors: {
        "presence-online": "var(--color-presence-online)",
        "presence-idle": "var(--color-presence-idle)",
        "presence-offline": "var(--color-presence-offline)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        DEFAULT: "var(--radius-md)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        // ダーク固定の盤面に載るため、影は黒基調で固定する。
        // 以前は --color-shadow 経由で OS の配色設定に追従しており、
        // ライト配色の環境ではほぼ黒のパネル上に淡い影が乗って見えなかった（#78）。
        lg: "0 10px 15px rgba(0, 0, 0, 0.45)",
      },
      ringColor: {
        DEFAULT: "var(--signal)",
      },
    },
  },
  plugins: [],
};
