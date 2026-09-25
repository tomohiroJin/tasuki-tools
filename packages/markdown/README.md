# @tasuki/markdown

お題の本文・共有メモの**安全な Markdown サブセット**を、ブロックと行内要素の木へ解析する純粋な関数。
**描画はしない**（React を知らない）。描画は各アプリが持つ（timer-web・poker-web・topic-web の `Markdown.tsx`）。

- `parseMarkdown(src)` — ブロック（見出し `#`〜`###`・箇条書き・番号付き・引用・コードの囲み・段落）の配列
- `parseInline(text)` — 行内要素（`**太字**`・`*斜体*`・`` `コード` ``・`[表示](URL)`・生 URL）の配列
- `safeHref(url)` — `http(s)://` と `mailto:` だけを通す。通らなければ `null`（描画側は `<a>` にしない）

解析は入力の長さに対して線形に近い時間で終わる（リンクの表示と URL の長さに上限を置いている）。
置き場の判断（解析を共有し、描画は各アプリが持つ理由）は [ADR-0021](../../docs/adr/0021-topic-as-shared-context.md) の決定 7 にある。
