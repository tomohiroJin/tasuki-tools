# Tasuki

モブプログラミング × TDD を支援する**ツール群（単一 monorepo）**。
Tasuki は二本柱で成り立つ。**実用ツール集**（timer・poker 等、実務で使うツール群を提供する）と
**AI 駆動開発の実践場**（MCP・複数 AI エージェントによる開発プロセス自体の実践・実証）。

## 収録ツール

### 1. TDD Mob Pro Timer

モブプログラミングのドライバー交代タイマー。いまのお題を読んで表示する（お題はお題ツールで作る・#91）。**本番公開中。**

- **構成**
  - [`packages/timer-core`](packages/timer-core/) — ドメインロジック（集約・状態遷移・完成記録・検証）
  - [`apps/timer-web`](apps/timer-web/) — フロントエンド（React + Vite・`base=/timer/`）
  - [`apps/tasuki-sync`](apps/tasuki-sync/) — リアルタイム同期サーバー（Bun + WebSocket・揮発インメモリ）。
    **poker・お題と共用**（#95 S2 で 1 プロセスへ統合・#91 でお題の経路を追加）
- **特徴**
  - WebSocket による全参加者リアルタイム同期（サーバープッシュ）
  - モブ順ローテーション表示・「今は誰の番か」の明示
  - 現ドライバー不在時の次担当への自動繰上
  - 任意のルーム参加合言葉
  - ルームのお題の表示（読むだけ。完成記録にはそのときのお題のタイトルを残す）
- 概要: [`docs/timer/README.md`](docs/timer/README.md)
- アーキテクチャ: [`docs/timer/ARCHITECTURE.md`](docs/timer/ARCHITECTURE.md)
- 設計判断（ADR）: [`docs/timer/adr/`](docs/timer/adr/)

### 2. Planning Poker

見積り合意のためのプランニングポーカー。**本番公開中**（初回公開は 2026-08-28・[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66)）。

- **構成**
  - [`packages/poker-core`](packages/poker-core/) — ドメインロジック（デッキ・ラウンド・集計）
  - [`apps/poker-web`](apps/poker-web/) — フロントエンド（React + Vite・`base=/poker/`）
  - [`apps/tasuki-sync`](apps/tasuki-sync/) — リアルタイム同期サーバー（timer・お題と共用）
- **特徴**
  - ルームのお題の表示（読むだけ・#91）
- 概要: [`docs/poker/README.md`](docs/poker/README.md)
- SDD 成果物: [`docs/poker/specs/`](docs/poker/specs/)

### 3. 玄関（ツール選択 LP）

訪問者がツールを選ぶための入口。ツール選択そのものを「手札」にしており、poker と同じ
象牙の札が並ぶ。**本番公開中**（初回公開は 2026-08-28・[#66](https://github.com/tomohiroJin/tasuki-tools/issues/66)）。

- **構成**: [`apps/landing`](apps/landing/) — Vite + React・静的サイト（同期サーバー無し・`base=/`）
- 世界観は [`packages/ui`](packages/ui/) の「夜のカードテーブル」を共有

### 4. お題（Topic Board）

お題を用意して、ルームの全員（玄関・timer・poker・ルーレット）に見せるツール。玄関の 3 枚目の札から開く。**本番公開中**（初回公開は 2026-09-27・[#91](https://github.com/tomohiroJin/tasuki-tools/issues/91)。配布の手順は [`deploy/topic/NOTES.md`](deploy/topic/NOTES.md)）。

- **構成**
  - [`packages/topic-core`](packages/topic-core/) — ドメインロジック（お題・定型バンク・検証・AI 生成のプロンプト）
  - [`apps/topic-web`](apps/topic-web/) — フロントエンド（React + Vite・`base=/topic/`）
  - [`apps/tasuki-sync`](apps/tasuki-sync/) — リアルタイム同期サーバー（timer・poker と共用）
  - [`packages/markdown`](packages/markdown/) — お題の本文の Markdown の解析（描画は各アプリ）
- **特徴**
  - 手入力・定型バンク・AI 生成（任意・運営者の Claude サブスクで実行・未設定時は定型お題へ安全縮退）の 3 つで作る
  - お題はルームの持ち物で、timer のセッションをまたいで残る
- 設計判断: [`docs/adr/0021`](docs/adr/0021-topic-as-shared-context.md)

### 5. 進行役ルーレット（Facilitator Roulette）

その場の入る人から次の進行役をルーレットで決めるツール。玄関の 4 枚目の札から開く。**本番公開中**（初回公開は 2026-10-14・[#94](https://github.com/tomohiroJin/tasuki-tools/issues/94)。配布の手順は [`deploy/roulette/NOTES.md`](deploy/roulette/NOTES.md)）。

- **構成**
  - [`packages/roulette-core`](packages/roulette-core/) — ドメインロジック（入る人・当たりの引き方（毎回入る人から一様に引く））
  - [`apps/roulette-web`](apps/roulette-web/) — フロントエンド（React + Vite・`base=/roulette/`）
  - [`apps/tasuki-sync`](apps/tasuki-sync/) — リアルタイム同期サーバー（共用。当たりはサーバーが引く）
- **特徴**
  - 円盤（SVG）が回って止まり、指し針の先に伏せた象牙の札がめくれる。どの画面も同じ席に止まる
  - 毎回、入る人から一様に引く（1 回の回転で 2〜4 人を選ぶときだけ、同じ人は重ならない）。ルームにいない人も名前を追加して入れられる
  - 動きを減らす設定では回さずに結果を出す
- 設計判断: [`docs/adr/0026`](docs/adr/0026-facilitator-roulette.md)・設計正本 [`docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md`](docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md)

### 6. 進行タイマー（Agenda Timer）

会の進行表（名前と長さを持つステップの並び）をルームの全員で同じ懐中時計の盤に映し、いまのステップの残りと、会全体が予定より押しているか巻いているかを見せるツール。玄関の 5 枚目の札から開く。**本番未公開**（[#429](https://github.com/tomohiroJin/tasuki-tools/issues/429) の第 1 段。配布の手順は [`deploy/agenda/NOTES.md`](deploy/agenda/NOTES.md)）。

- **構成**
  - [`packages/agenda-core`](packages/agenda-core/) — ドメインロジック（シナリオの検証と展開・進行の遷移・押し巻きと終了見込みの計算）
  - [`apps/agenda-web`](apps/agenda-web/) — フロントエンド（React + Vite・`base=/agenda/`）
  - [`apps/tasuki-sync`](apps/tasuki-sync/) — リアルタイム同期サーバー（共用。「自動で次へ」の判断と期限はサーバーが持つ）
- **特徴**
  - 時間切れの振る舞いをステップごとに選べる（押すまで待ってオーバーを数える／自動で次へ）。会の最中は延長（+1 / +3 / +5 分）と飛ばすだけで組み替える
  - 盤は 1 周が予定の合計。12 時の竜頭（予定の終わり）と終了見込みの印の位置で押し巻きが読める。スクリーンに映す表示を持つ
  - シナリオは端末に保存して読み直せる。サンプル（KPT のふりかえり）から始められる
- 設計判断: [`docs/adr/0027`](docs/adr/0027-agenda-timer.md)・設計正本 [`docs/superpowers/specs/2026-10-19-agenda-timer-design.md`](docs/superpowers/specs/2026-10-19-agenda-timer-design.md)

## 🔗 ライブデモ

**<https://tasuki.niku9.click/>** — 玄関（ツール選択 LP）が開きます。玄関でルームを作り、札からツールを選んでください
（ルーム作成 → 招待リンクで参加 → リアルタイム同期）。

| ツール | URL |
|---|---|
| 玄関 LP | <https://tasuki.niku9.click/> |
| TDD Mob Pro Timer | <https://tasuki.niku9.click/timer/> |
| Planning Poker | <https://tasuki.niku9.click/poker/> |
| お題（Topic Board） | <https://tasuki.niku9.click/topic/> |
| 進行役ルーレット | <https://tasuki.niku9.click/roulette/> |
| 進行タイマー（未公開） | <https://tasuki.niku9.click/agenda/>（配布後に開く） |

> ルームを作るのも名乗るのも**玄関 1 つだけ**です（#95 S5c）。ルームコードを伴わずに各ツールの URL を開くと、
> 玄関へ送られます。

## クイックスタート

### 前提

- **Node.js 22.22.2 以上**（`package.json` の `engines`。pnpm 11 系が `node:sqlite` を使うため、20 では起動しません）
- pnpm（版は `package.json` の `packageManager` が決める。`corepack enable` すればその版が使われる）
- **Bun** — 同期サーバー（`apps/tasuki-sync`）の起動とテストに必要

```bash
corepack enable
pnpm install
pnpm dev     # 全アプリの dev サーバーを並列起動する
pnpm test    # 全パッケージのテストを実行する
```

**起動したら <http://localhost:5175/> を開いてください。** `pnpm dev` は玄関・各ツールの画面と同期サーバーの
プロセスをまとめて立ち上げ、ログには複数のポートが並びますが、**入口はこの 1 つだけ**です（本番と同じ形）。

> ⚠ **ツールの dev サーバー（:5173 / :5174 / :5176 / :5177 / :5178）を直接開かないでください。**
> #95 S5c で入口を玄関 1 つに畳んだため、ルームコードを伴わずに開くと玄関（`/`）へ
> 送り返されます。:5173 / :5174 / :5176 / :5177 / :5178 では `/` がそのツール自身なので、Vite の base
> リダイレクトと噛み合って**ページの再読み込みが止まらなくなります**。

起動・個別プロセスの内訳・検査コマンドの詳しい手順は
[`docs/guides/development.md`](docs/guides/development.md) を参照してください。

## ドキュメント

- [`AGENTS.md`](AGENTS.md) — AI エージェント向けの絶対規則と二本柱
- [`docs/README.md`](docs/README.md) — 文書地図（目的別の入口）
- [`docs/guides/development.md`](docs/guides/development.md) — 起動・テスト・検査の詳しい手順

バックログは GitHub Issues で管理しています。

## 技術スタック

TypeScript / React 19 + Vite / Bun / WebSocket / Valibot / neverthrow / Vitest / bun:test / Playwright（E2E） / turbo

## ステータス

| ツール | 公開パス | 状態 |
|---|---|---|
| TDD Mob Pro Timer | `/timer/` | 本番公開中 |
| Planning Poker | `/poker/` | 本番公開中 |
| 玄関 LP | `/` | 本番公開中 |
| Topic Board | `/topic/` | 本番公開中 |
| Facilitator Roulette | `/roulette/` | 本番公開中 |
| Agenda Timer | `/agenda/` | 実装済み・本番未公開（#429） |

公開の履歴は次のとおりです（GitHub Releases は使っていません。大きめの配布には注釈付きタグを打ち、変更点の要約をタグの本文に書いています。配布の詳しい記録は各 Issue にあります）。

| 日付 | 内容 | Issue |
|---|---|---|
| 2026-08-28 | `v3.0.0`。単一 monorepo への統合を本番へ反映。玄関 LP と Planning Poker を初回公開し、timer を `/timer/` へ移設 | [#66](https://github.com/tomohiroJin/tasuki-tools/issues/66) |
| 2026-09-06 | `v3.1.0`。同期と入室まわりを整え（同期できていないことの表示・混雑時の入り直し）、ルームコードの接尾辞を 8 文字にした | [#144](https://github.com/tomohiroJin/tasuki-tools/issues/144) ほか |
| 2026-09-23 | `v4.0.0`。入口を玄関 1 つにし、全員を同格にして、同期サーバーを 1 本に統合 | [epic #95](https://github.com/tomohiroJin/tasuki-tools/issues/95) |
| 2026-09-27 | お題（Topic Board）を初回公開し、timer・poker・玄関にお題を表示（配布時にはタグを打たず、`v4.1.0` に含めた） | [#91](https://github.com/tomohiroJin/tasuki-tools/issues/91) |
| 2026-10-14 | `v4.1.0`（v4.0.0 以降の 36 PR）。進行役ルーレットを初回公開。デザインシステムの部品層（#320）・timer から Tailwind を外す（#321）・PC の幅の収まり（#316）などをまとめて反映。09-27 に配ったお題（#91）もこのタグに含む | [#94](https://github.com/tomohiroJin/tasuki-tools/issues/94)・[#91](https://github.com/tomohiroJin/tasuki-tools/issues/91) |

単一 monorepo への統合（[epic #15](https://github.com/tomohiroJin/tasuki-tools/issues/15)・
設計: [`docs/superpowers/specs/2026-08-04-monorepo-unification-design.md`](docs/superpowers/specs/2026-08-04-monorepo-unification-design.md)）、
基盤整備（[epic #67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）、
E2E テストの新設（[#73](https://github.com/tomohiroJin/tasuki-tools/issues/73)）はいずれも完了しています。
