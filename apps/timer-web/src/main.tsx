import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { installAudioUnlock } from "./platform/sound.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");

// 初回ユーザー操作で AudioContext を unlock（交代音が確実に鳴るように）。
installAudioUnlock();

createRoot(root).render(<App />);
