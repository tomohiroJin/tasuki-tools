# ADR-0017: 文脈を 3 つに割り、メンバーシップを上流に置く

- **ステータス**: Accepted（2026-09-06）
- **関連**: [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) /
  [設計正本](../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) /
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準）/
  [`docs/adr/0016`](./0016-core-domain-representation.md)（ドメインの表現は選択制）/
  `docs/constitution.md` 原則 VI（依存は内向き）・原則 X（抽象は実需で）

## 背景

`Participant` が `packages/timer-core/src/aggregate.ts` と `packages/poker-core/src/room.ts` に
二重定義されている。表示名の規約も `display-name.ts` と `NAME_MAX_LENGTH = 24` に分かれている。

これは症状であり、原因は**境界づけられた文脈が切られていない**ことである。timer と poker は
それぞれ独立した文脈でありながら、どちらも「メンバーシップ」という第三の文脈を各自で
抱え込んでいる。型を 1 つにまとめる共有カーネルを作ると、早晩「両方のツールが必要とするもの
置き場」に腐る。

実測の根拠は設計正本 §3 に置く。ここには決定だけを書く。

## 決定

### 決定 1: 文脈を 3 つに割る

- **メンバーシップ文脈** = `packages/room-core`。ルーム・参加者・表示名・在席
- **モブタイマー文脈** = `packages/timer-core`。セッション・時計・ローテーション・出題
- **見積もり文脈** = `packages/poker-core`。ラウンド・投票・統計

**ツールのドメインは参加者エンティティを持たない（MUST NOT）。** 必要な名簿の断片は
引数で受け取る。

### 決定 2: ツールのドメインは `room-core` に依存しない

`ParticipantId` は不透明な文字列として受け取る（**MUST**）。文脈をつなぐのは
アプリケーション層の責務である。

**アプリ層（`apps/*`）が `room-core` に依存するのは本決定の対象外**であり、許される。
禁じているのはツールの**ドメイン**が上流へ依存することである。

### 決定 3: 文脈間の整合は明示的なユースケースで合成する

イベントバスを導入しない（**MUST NOT**）。購読者が 2 つの段階で導入するのは
`docs/adr/0007` 基準 3 に反する。合成は 1 関数に集め、ツールを足すときに触る場所を
1 箇所に保つ。

### 決定 4: 依存の向きを許可リストで機械的に固定する

各パッケージが依存してよい先を表で持ち、**表に無い依存を拒否する**（**MUST**）。
判定は `package.json` の `dependencies` と `import` 文の**両方**を見る。
表の正本は `scripts/audit-dependency-direction.mjs` とする。**同スクリプトは S1（#242）で
新設するため、それまでの間は[設計正本](../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) D17 の表が
暫定の正本である。**

**期限つきの一時依存は、期限を表に書く。** 期限を過ぎた行の削除は、その段の DoD で確認する。

### 決定 5: `room-core` は直接遷移関数 ＋ `Result` を採る

`docs/adr/0016` 決定 1 が MUST とする「どちらを採ったかと理由の記録」がこれである。
メンバーシップにイベント履歴・再生・段階適用の要求は無く、Decider を採る根拠が無い
（`docs/adr/0007` 基準 3）。

## 影響

- `packages/room-core` が新設される。`display-name.ts` がそこへ移る
- `timer-core` / `poker-core` から参加者エンティティが消える（段階的に。設計正本 §7）
- `scripts/audit-dependency-direction.mjs` が新設され、CI の `quality` ジョブで走る
- 詳細な段階分割・実測・型定義は設計正本を参照する。**本 ADR に転記しない**

## 追記（2026-09-07・#242 / S1）

**決定 4 の暫定規定は解消した。** 決定 4 は「同スクリプトは S1（#242）で新設するため、
それまでの間は設計正本 D17 の表が暫定の正本である」としていたが、S1 で
`scripts/audit-dependency-direction.mjs` を新設した。**依存の向きの正本は同スクリプトの
`ALLOWED` である。** 設計正本 D17 の表は**最終形の目標**であり、現在の実体とは異なる
（例: `landing → room-core, protocol, sync-client, ui` は目標であって、S1 完了時点の実体は
`apps/landing: ["@tasuki/ui"]` である）。**現況を知りたいときは `ALLOWED` を見ること。**

**期限つき一時依存 `timer-core → room-core` の期限は 2 段に分かれる。**
混同しやすいので明示する（設計正本 §D17 の該当箇所に対応する）。

| 何を | いつ | 根拠 |
|---|---|---|
| 依存そのもの（`timer-core` が `room-core` を取り込むのをやめる） | **S4a**（#245） | timer-core から表示名の扱いが消える段 |
| `ALLOWED` からその行を削除する | **S4b**（#246） | 行が残っても検査は緑のままなので、S4b の DoD で確認する |

**検査は 4 つの経路を見る。** 決定 4 の本文は `package.json` と import 文の 2 つを挙げて
いるが、実装は次の 4 つを見る。3 つめまでを塞いでも、4 つめ（相対パスでの越境）が残ると
**規範を迂回する側だけが通る**（`@tasuki/room-core` と書けば赤いのに
`../../room-core/src/display-name.js` と書けば緑、という状態が実際にあった）。

1. 宣言と実体の全単射照合（`docs/adr/0014` 決定 1。権威は pnpm 自身）
2. `package.json` の依存宣言（`dependencies` と `devDependencies`）
3. 追跡下の `.ts` / `.tsx` の import 指定子（`src` に限らない。テストからの逆流も依存である）
4. 同じ import 文のうち、パッケージの外へ出る相対パス
