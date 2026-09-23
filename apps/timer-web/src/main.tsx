import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { installAudioUnlock } from "./platform/sound.js";
// **共通のトークン層は CSS の `@import` ではなくここで読む**（#297）。`index.css` から
// `@import` すると Tailwind（`@tailwindcss/postcss`）が展開し、入れ子の `fonts.css` の
// `url('../fonts/…')` の基準を付け替えない。Vite は解決できずに素通しし、配信時は
// `/timer/fonts/…` に SPA の HTML が返って**書体が 1 本も読めていなかった**（本番も同じ）。
// ここで読めば Vite 自身が解決して `assets/` へ出す。**`./index.css` より先に置く**
// （トークンを先に、画面固有の上書きを後に —— 同じ詳細度なら後勝ち）。
import "@tasuki/ui/tokens.css";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");

// 初回ユーザー操作で AudioContext を unlock（交代音が確実に鳴るように）。
installAudioUnlock();

createRoot(root).render(<App />);
