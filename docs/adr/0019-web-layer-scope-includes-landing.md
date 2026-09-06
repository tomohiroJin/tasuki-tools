# ADR-0019: web 層の規範の適用範囲に `apps/landing` を含める

- **ステータス**: Accepted（2026-09-06）
- **関連**: [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) /
  [`docs/adr/0015`](./0015-web-layer-structure.md)（web 層の 3 責務）/
  [`docs/adr/0014`](./0014-scan-target-integrity.md)（走査対象の健全性）

## 背景

`docs/adr/0015` は適用範囲を「web 層（`apps/*-web`）」と書いている。
`scripts/audit-web-sync-boundary.mjs` も走査対象を `apps/*-web/package.json` から導出する。

`apps/landing` はこの形に一致しない。#95 で LP が同期クライアントになると、
**規範の対象外で同期フックを持つアプリが 1 つできる。**

これは `docs/adr/0014` が扱った「走査対象の健全性」と同じ機序である。名前の綴りに
依存した走査は、規約から外れた名前が現れた瞬間に静かに空振りする。

## 決定

### 決定 1: `docs/adr/0015` の適用範囲は「WebSocket に接続する `apps/*` すべて」とする

`apps/*-web` という名前の形では範囲を定めない（**MUST NOT**）。

### 決定 2: 走査対象を名前の形から実体へ変える

`scripts/audit-web-sync-boundary.mjs` の対象導出を、`apps/*/package.json` のうち
**ブラウザ向けの web アプリであること**を判定できる実体（`vite.config.ts` の存在）へ
変える（**MUST**）。

### 決定 3: 付け替えは、LP が同期クライアントになる変更より前に済ませる

順序を逆にすると、規範の外で同期フックが 1 本できる（**MUST**）。

## 影響

- `apps/landing` が `audit-web-sync-boundary` の対象になる。現状の LP は
  `new WebSocket` も同期モジュールも持たないため、対象に加えても即座には赤くならない
- `docs/adr/0015` に本 ADR への参照を追記する
