# 参加者とルームの共通化 — S0・S1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #95 の規範を ADR で確定させ（S0）、メンバーシップ文脈のパッケージ `@tasuki/room-core` を新設して表示名の規約をそこへ移す（S1）。

**Architecture:** DDD の境界づけられた文脈でメンバーシップを上流の独立文脈として立てる。ツールのドメイン（`timer-core` / `poker-core`）は下流に置き、上流へ依存させない。S1 は文脈の器を作り、最初の住人（表示名の値オブジェクト）を移すところまで。

**Tech Stack:** TypeScript 6.0.3 / Vitest 4.1.10 / pnpm 11.5.0 / turbo 2.5+ / neverthrow / valibot

**Spec:** [`docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`](../specs/2026-09-06-shared-identity-and-rooms-design.md)

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 6 はテストを先に移して赤を確認してから実装を移す。Task 7 は失敗するテストから書く。S0（Task 1〜5）は文書のみだが、各 Step にリンク検査と実測の確認を置く |
| II. 技術選定は ADR を通す | 通過 | パッケージ `@tasuki/room-core` を新設するが**新しい外部依存は 0**（`neverthrow` も外した）。構成の判断は `docs/adr/0017` に記録する |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーの状態管理に触れない。デプロイを伴わない |
| IV. 境界の型安全 | 該当なし | 境界検証の中身を変えない。`schemas.ts` は `normalizeDisplayName` の取り込み元が変わるだけ |
| V. 実画面検証 | 該当なし | 利用者が通る経路は変わらない（S1 は振る舞い不変） |
| VI. 依存は内向き | 通過 | **この計画の主目的**。ドメインを文脈で割り、依存の向きを Task 7 の検査で機械的に固定する。`timer-core → room-core` の一時依存は `docs/adr/0017` 決定 4 の期限つきとして表に記録する |
| VII. 検査は壊して確かめる | 通過 | Task 7 Step 6 で 3 通りの破壊検証（import のみ／`package.json` のみ／未宣言パッケージ）、Step 7 で対照実行を行う |
| VIII. 記録が正本 | 通過 | 決定は ADR、実測と設計は設計正本、様式はガイド。§4 の決定を ADR へ移すのが S0 の目的で、二重正本を残さない |
| IX. 小さく回す | 通過 | S0 と S1 で PR 2 本（段＝PR）。デプロイは伴わない |
| X. 抽象は実需で | 通過 | `room-core` は新設した時点で利用者が 2 つ（`timer-core` / `timer-web`）ある。利用者 0 の器を先に作らない。`sync-client` の抽出は利用者が 3 つになる S5a まで行わない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 表示名（分類「個人に紐づく」）を扱うモジュールを移設するが、**新しい入力・保持・出力を足さない**。ログ出力も増やさない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

---

## Global Constraints

- **作業ディレクトリは `/workspaces/claym/local/Tasuki`。** クローンを作らない
- **`main` へ直接コミットしない。** **1 段＝1 ブランチ＝1 PR**（設計正本 §7 の段が PR の単位）。
  S0 の Task 1〜5 は `docs/issue-95-s0-norms`、S1 の Task 6〜7 は
  `feature/issue-95-s1-room-core`。**タスクごとにブランチを切らない** ——
  Task 1〜3 は `docs/adr/README.md` を共有するため、別ブランチにすると必ず衝突する
- **TDD は必須**（原則 I）。テストを先に書き、赤を確認してから実装する
- **ドメインは純粋関数のみ。`Date.now()` / `Math.random()` を呼ばない**（原則 VI・`docs/adr/0016` 決定 2-4）
- **`index.ts` は公開記号を明示列挙する。`export *` を使わない**（`docs/adr/0016` 決定 2-2）
- **ドメイン操作の失敗は `Result<T, E>`**（原則 IV）
- **リンク検査は `git ls-files` を見る。** 新規ファイルは `git add` するまで走査対象にならない
- **変異検査は作業ツリーが clean でないと走らない**
- **コミットメッセージは Conventional Commits。** 英語 type ＋日本語の説明
- **`Closes #NNN` をバッククォートで囲まない**（自動クローズが効かない）
- **数値は実行して数える。** 記憶や過去の記録の数字を書き写さない

### S1 開始時点の基準値（2026-09-06 に `node scripts/audit-structure.mjs` で実測）

```
SC027 0 / SC028 0 / SC029 0 / SC030 0 / SC031 2 / SC032 1526/1528 / SC035 0 / SC036 2001
SC039 分岐 0 / データ 0 行 / 公開記号 0 件 / 公開契約 0 件
走査対象: src 9 パッケージ 191 件、test 10 パッケージ 282 件
```

**S1 完了時に SC039 の 4 つが全部 0 のままであること、SC031 が 2 のままであることを要求する。**
`SC036`（テスト総数）と走査対象の件数は増えてよい。

---

# S0: 規範を確定させる

## Task 0: 子 Issue を起票する（**ブランチを切る前に行う。PR には含まれない**）

**Files:**
- 変更なし（GitHub 上の操作のみ）

**なぜ最初なのか:** 各段のブランチは Issue をきっかけに切られ、その Issue を閉じる。
起票が後だと、S0 のブランチを切る時点で閉じる先が無く、`Closes #<番号>` を後から
書き足すことになる。**#95 のサブ Issue として先に全部立てる。**

**Interfaces:**
- Consumes: 設計正本 §7 の段階表、§6.1 の EARS
- Produces: S1 以降が着手する単位

- [ ] **Step 1: 既存の open Issue を数え直す**

```bash
gh issue list --state open --limit 50 --json number,title,labels \
  --jq '.[] | "\(.number) \(.title)"'
```

**記憶にある件数と照合しない。** ここで出た結果が現在地である。

- [ ] **Step 2: Issue テンプレートの様式を確認する**

```bash
cat .github/ISSUE_TEMPLATE/feature.md
```

「振る舞い」節が EARS 記法であること、DoD のチェックリストがあることを確認する。

- [ ] **Step 3: 9 本の子 Issue を起票する**

`#95` を親とし、次の割り当てで起票する。**各 Issue の「振る舞い」節には、下表の EARS を
設計正本 §6.1 から写す。** 実測値・型定義・段階の詳細は写さず、設計正本を参照させる。

| 段 | タイトル | 割り当てる EARS |
|---|---|---|
| S1 | `packages/room-core` を新設し表示名の規約を移す | （振る舞いの変更なし。DoD は指標の据え置き） |
| S2 | 同期サーバーを 1 本に統合する | （振る舞いの変更なし） |
| S3 | 役割とホストを廃止する | R12 |
| S4a | 名簿を 1 つにする | R8 |
| S4b | 同一性を `localStorage` へ移し、在席を接続に紐づける | R11 / R14 / R15 / R16 / R17 |
| S5a | LP をハブにし、timer をハブ経由で使えるようにする | R1 / R2 / R3 / R4 / R6 / R7 / R10 / R13 |
| S5b | poker をハブ経由で使えるようにする | R4 / R5 |
| S5c | ツール側の旧入口を撤去する | R9 |
| S6 | 振り返りを書く | — |

各 Issue の本文に必ず入れるもの:

```markdown
## 前提

- 設計正本: `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`
- **この段をマージした時点で E2E が緑で、両ツールとも使えること**（設計正本 §7 スライスの原則 2）
- **`main` は常にデプロイ可能に保つ。** 配備資材の更新はこの PR に含める（同 原則 3）

Closes #<この Issue の番号は起票後に埋まる>
```

- [ ] **Step 4: 起票結果を確認する**

```bash
gh issue list --state open --limit 50 --json number,title --jq '.[] | "\(.number) \(.title)"'
```

期待: 9 本増えている。**数えて確認する。**

- [ ] **Step 5: #95 に段階の対応を書き込む**

```bash
gh issue comment 95 --body "$(cat <<'MSG'
設計が固まりました。設計正本は `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md` です。

本文の「実装時に決めること」8 件はすべて決着しています（対応は設計正本 §4 末尾の表）。
うち 6 件は本文が想定していない形の決着になりました。とくに項目 5（ホストの概念の統一）は
「どちらへも寄せず廃止」です。

段階は S0〜S6 の 10 本に分けて子 Issue へ切り出しました。
MSG
)"
```

---

---

## Task 1: ADR-0017 文脈分割とパッケージ構成

**Files:**
- Create: `docs/adr/0017-bounded-contexts-and-packages.md`
- Modify: `docs/adr/README.md`（一覧に 1 行足す）

**Interfaces:**
- Consumes: 設計正本 §4 の D1・D2・D3・D16・D17・D19
- Produces: 以降のすべてのタスクが参照する「文脈の分け方」と「依存の向き」の正本

- [ ] **Step 1: 既存 ADR の並びと採番を確認する**

```bash
ls docs/adr/ | tail -5
```

期待: `0016-core-domain-representation.md` が最大。次は `0017`。
**別の番号が最大なら、そこから 1 つ進めた番号を使うこと**（この計画の番号は 2026-09-06 時点のもの）。

- [ ] **Step 2: ADR を書く**

`docs/adr/0017-bounded-contexts-and-packages.md` を作る。

```markdown
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
表の正本は `scripts/audit-dependency-direction.mjs` とする。

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
```

- [ ] **Step 3: ADR 一覧に 1 行足す**

`docs/adr/README.md` の一覧はマークダウンの表である（2026-09-06 実測）。

```
| [0016](./0016-core-domain-representation.md) | ドメインの表現は選択制とし、揃える点を定める | Accepted |
```

同じ 3 列で `0016` の行の直後に足す。

```
| [0017](./0017-bounded-contexts-and-packages.md) | 文脈を 3 つに割り、メンバーシップを上流に置く | Accepted |
```

```bash
grep -n "0016" docs/adr/README.md   # 直前の行を確認してから足す
```

- [ ] **Step 4: リンク検査を通す**

```bash
git add docs/adr/0017-bounded-contexts-and-packages.md docs/adr/README.md
node scripts/check-links.mjs
```

期待: `リンク検査 OK`。**`git add` を先にしないと新規ファイルは走査されない。**

- [ ] **Step 5: コミット**

```bash
# ブランチは S0 で 1 本だけ切る。Task 2 以降は同じブランチに積む
git rev-parse --abbrev-ref HEAD   # docs/issue-95-s0-norms でなければ切る
git commit -m "$(cat <<'MSG'
docs: 文脈分割とパッケージ構成の ADR を置く（#95 S0）

メンバーシップを上流の独立した文脈として立て、ツールのドメインを下流に置く。
ツールのドメインは参加者エンティティを持たず、room-core にも依存しない。
依存の向きは許可リストで機械的に固定する。

実測と段階分割は設計正本にあり、この ADR には決定だけを書いた。
MSG
)"
```

---

## Task 2: ADR-0018 入口の一本化と URL 体系

**Files:**
- Create: `docs/adr/0018-single-entry-and-url-scheme.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: 設計正本 D7・D10・D11
- Produces: S5a〜S5c が従う URL とルーティングの正本

- [ ] **Step 1: ADR を書く**

```markdown
# ADR-0018: 入口を LP に一本化し、URL 体系を揃える

- **ステータス**: Accepted（2026-09-06）
- **関連**: [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) /
  [設計正本](../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) /
  [`docs/timer/adr/0007`](../timer/adr/0007-volatile-in-memory-state.md)（揮発インメモリ状態）

## 背景

ルームの作成と名乗りの画面が 3 つある（timer の `Setup` / `Join`、poker の
`TopPage` / `NameForm`）。ツールを足すたびに増える。

`deploy/timer/caddy/40-timer-legacy-room.conf` は「`/` かつ `?room=` が付いていたら
`/timer/` へ 301」する救済断片である。これは本 ADR が定める参加用 URL と**完全に同じ形**であり、
両立しない。

## 決定

### 決定 1: 入口は LP のみ

ルームの作成と名乗りは LP でだけ行う（**MUST**）。ツール側は名乗りの画面を持たない
（**MUST NOT**）。ルームコードを伴わずにツールの URL が開かれた場合は LP へ送る。

### 決定 2: URL 体系

| 経路 | URL |
|---|---|
| 参加用 URL（配るもの） | `/?room=CODE` |
| タイマー | `/timer/?room=CODE` |
| ポーカー | `/poker/?room=CODE` |
| 選択画面へ戻る | `/?room=CODE` |

パス方式（`/poker/room/<id>`）は使わない（**MUST NOT**）。ルームコードには日本語が
入りうるため、符号化をクエリに任せる。

### 決定 3: WebSocket の入口は `/ws` 1 つ

`/timer/ws` と `/poker/ws` は移行期間だけ受け付け、移行完了時に撤去する。

### 決定 4: 旧救済断片を撤去する

`40-timer-legacy-room.conf` を削除する。**削除は、新しい参加用 URL を配り始める変更と
同じ PR で行う**（**MUST**）。先に消すと旧リンクの救済だけが失われ、後で消すと新しい
招待リンクがタイマーへ飛ばされる期間ができる。

救済の実質的価値が失われている根拠: ルームは揮発インメモリ（`docs/timer/adr/0007`）で
あり、救済対象のリンクが指すルームはとうに存在しない。

## 影響

- LP が同期クライアントになる。静的 SPA ではなくなる
- `apps/poker-web/src/router.ts` が `?room=` を解するようになる
- Caddy 断片が 1 本増え（`/ws`）、3 本減る（`/timer/ws`・`/poker/ws`・旧救済）
- 旧リンク `/?room=CODE` は LP に着地し、そのルームが在れば入れる（救済より良い挙動になる）
```

- [ ] **Step 2: 一覧に足してリンク検査**

```bash
git add docs/adr/0018-single-entry-and-url-scheme.md docs/adr/README.md
node scripts/check-links.mjs
```

期待: `リンク検査 OK`

- [ ] **Step 3: コミット**

```bash
git commit -m "$(cat <<'MSG'
docs: 入口の一本化と URL 体系の ADR を置く（#95 S0）

ルーム作成と名乗りを LP に集約し、参加用 URL を /?room=CODE に定める。
poker のパス方式を廃してクエリへ揃える。WS の入口を /ws に一本化する。

旧救済断片 40-timer-legacy-room.conf は新しい参加用 URL と同じ形なので撤去する。
撤去は新しい URL を配り始める変更と同じ PR で行うことを MUST として書いた。
MSG
)"
```

---

## Task 3: ADR-0019 web 層の規範を `apps/landing` へ広げる

**Files:**
- Create: `docs/adr/0019-web-layer-scope-includes-landing.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: 設計正本 §3.10・D20
- Produces: S5a が LP に同期フックを置く前に満たすべき前提

- [ ] **Step 1: 穴が実在することを自分で確かめる**

```bash
grep -n "apps/\*-web" scripts/audit-web-sync-boundary.mjs | head -3
grep -c "landing" scripts/audit-web-sync-boundary.mjs
```

期待: 前者が `apps/*-web/package.json` から導出している行を出す。後者が `0`。
**この 2 つが期待どおりでなければ、状況が変わっているので ADR の背景を書き直すこと。**

- [ ] **Step 2: ADR を書く**

```markdown
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
```

- [ ] **Step 3: `docs/adr/0015` に参照を足す**

`docs/adr/0015-web-layer-structure.md` の末尾（`## 影響` 節の最後）に追記する。

```markdown
**追記（2026-09-06・#95）**: 本 ADR の適用範囲を「`apps/*-web`」という名前の形で
書いていたため、`apps/landing` が漏れていた。適用範囲の現行の正本は
[`docs/adr/0019`](./0019-web-layer-scope-includes-landing.md) である。
```

**注意**: 追記は**節の末尾**へ置くこと。節の途中に足すと、直後の小節が親を変える
（ADR で 2 回踏んだ事故）。

- [ ] **Step 4: リンク検査**

```bash
git add docs/adr/0019-web-layer-scope-includes-landing.md docs/adr/0015-web-layer-structure.md docs/adr/README.md
node scripts/check-links.mjs
```

- [ ] **Step 5: コミット**

```bash
git commit -m "$(cat <<'MSG'
docs: web 層の規範の適用範囲に landing を含める ADR を置く（#95 S0）

ADR-0015 が適用範囲を apps/*-web という名前の形で書いていたため、
apps/landing が漏れていた。LP が同期クライアントになると、規範の対象外で
同期フックを持つアプリが 1 つできる。

走査対象を名前の形から実体（vite.config.ts の存在）へ変え、
付け替えを LP のハブ化より前に済ませることを MUST とした。
MSG
)"
```

---

## Task 4: 既存規範の改定（3 本）

**Files:**
- Modify: `docs/timer/adr/0007-volatile-in-memory-state.md`
- Modify: `docs/adr/0011-threat-model-and-data-classification.md`
- Modify: `docs/plans/resume-token-wiring/spec.md`

**Interfaces:**
- Consumes: 設計正本 D5・D12
- Produces: S3（役割廃止）と S4b（同一性）が前提にする規範

- [ ] **Step 1: 改定対象の現物を読む**

```bash
sed -n '18,25p' docs/timer/adr/0007-volatile-in-memory-state.md
grep -n "S9\b" docs/adr/0011-threat-model-and-data-classification.md | head -3
grep -n "FR-006" docs/plans/resume-token-wiring/spec.md
```

期待: それぞれ「最古のオンライン編集者へ自動委譲」「権限規則の正本は
`packages/timer-core/src/permissions.ts`」「`sessionStorage` に保持しなければならない」の
記述が出る。**出なければ状況が変わっているので、設計正本 §3.9・§3.14 から測り直すこと。**

- [ ] **Step 2: `docs/timer/adr/0007` に改定の追記を置く**

**本文の既存記述は消さず**、末尾に追記する（記録は書き換えない）。

```markdown
**改定（2026-09-06・#95）**: 役割（`host` / `editor` / `viewer`）とホストの概念を廃止した。
本 ADR 本文の「同一役割として扱う」「主催者が猶予 30 秒を超えて不在なら最古のオンライン
編集者へ自動委譲（FR-018）」は、**役割そのものが無くなったため適用対象を失う**。

復帰トークンによる同一参加者としての再接続は維持する。猶予 30 秒はドライバーの
繰り上げ（R2-1）にのみ残る。

決定の正本は [`docs/adr/0017`](../../adr/0017-bounded-contexts-and-packages.md) と
[設計正本](../../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) D5。
```

- [ ] **Step 3: `docs/adr/0011` の S9 と S1 を現行化する**

脅威表の S9 の対策欄を書き換える。**`permissions.ts` を名指ししている箇所が消える。**

```markdown
| S9 | 権限のなりすまし | **役割の概念を廃止した（#95・2026-09-06）。** ルームに居る全員が同格であり、
コマンドごとの役割判定は存在しない。残る守りは**参加者の同一性**であり、サーバー発行の
`resumeToken`（分類「資格情報」）で検証する。**旧記述が名指ししていた権限規則の正本
`packages/timer-core/src/permissions.ts` は削除された。** |
```

S1 の対策欄にある「**新規参加者の既定 role は editor**（2 層モデル…）」の一文を削除し、
代わりに「役割は廃止済み（#95）。入室の守りはルームコードのエントロピー（決定 4）と
任意の合言葉である」と書く。

決定 1 の分類表に注記を足す。

```markdown
**注記（2026-09-06・#95）**: 本表の「扱い」は**サーバーが保持する共有状態**を対象とする。
クライアント端末内のローカル保存は憲法 原則 III が明示的に対象外としており、本表の
「揮発のみ」は端末内の保存を禁じない。**在席（どの利用者がいまどのツールを見ているか）は
分類「個人に紐づく」**であり、扱いは表示名と同じ（決定 3 と同じ形。ログへ出さず、
ルーム内へは配信する）。
```

- [ ] **Step 4: FR-006 を撤廃する**

`docs/plans/resume-token-wiring/spec.md` の FR-006 の行に、撤廃の注記を添える。
**要件の文言は消さず**、撤廃されたことが読めるようにする。

```markdown
- **FR-006**: システムは保存する `resumeToken` を `sessionStorage` に保持しなければならない
  （`localStorage` は用いない）。
  **【撤廃 2026-09-06・#95】** 復帰の組は `localStorage` にルームコード別で保存する。
  理由は 2 つある。(1) 参加者は明示的な退出でしか名簿から消えないため、`sessionStorage` だと
  タブを開き直すたびに別人として join し、前の自分が名簿へ残る（幽霊が溜まる）。
  (2) 本要件の非機能要件が根拠に挙げた `.claude/rules/security.md` は、`localStorage` と
  `sessionStorage` を同列に禁じており、2 つを区別する根拠にならない。
  詳細は[設計正本](../../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) D12。
```

- [ ] **Step 5: 検査を通す**

```bash
git add docs/timer/adr/0007-volatile-in-memory-state.md \
        docs/adr/0011-threat-model-and-data-classification.md \
        docs/plans/resume-token-wiring/spec.md
node scripts/check-links.mjs
```

期待: `リンク検査 OK`

- [ ] **Step 6: コミット**

```bash
git commit -m "$(cat <<'MSG'
docs: 役割廃止と同一性の変更に伴い既存の規範を改定する（#95 S0）

- docs/timer/adr/0007: 役割とホストの廃止で「同一役割として扱う」「最古のオンライン
  編集者へ自動委譲」が適用対象を失うことを追記
- docs/adr/0011: 脅威 S9 が名指ししていた権限規則の正本 permissions.ts が削除される
  ため対策を書き直した。S1 の「既定 role は editor」も現行化。分類表が
  サーバー保持を対象とすること、在席を分類へ加えることを注記
- docs/plans/resume-token-wiring/spec.md: FR-006 を撤廃した

いずれも本文は消さず、撤廃・改定が読める形で注記した。
MSG
)"
```

---

# S1: `packages/room-core` を新設し表示名の規約を移す

## Task 6: `room-core` を作り `display-name` を移す

**Files:**
- Create: `packages/room-core/package.json`
- Create: `packages/room-core/tsconfig.json`
- Create: `packages/room-core/vitest.config.ts`
- Create: `packages/room-core/src/index.ts`
- Create: `packages/room-core/src/display-name.ts`（`packages/timer-core/src/display-name.ts` を verbatim 移動）
- Create: `packages/room-core/tests/display-name.test.ts`（移動元テストの 6 describe 分）
- Modify: `packages/timer-core/src/schemas.ts:24`（import 元）
- Modify: `packages/timer-core/src/index.ts:61`（再輸出を削除）
- Modify: `packages/timer-core/package.json`（`@tasuki/room-core` を依存に追加）
- Modify: `packages/timer-core/test/display-name.test.ts`（残す 2 describe だけにする）
- Modify: `apps/timer-web/src/ui/participant-label.ts:13`（import 元）
- Modify: `apps/timer-web/package.json`（`@tasuki/room-core` を依存に追加）
- Modify: `scripts/audit-structure.mjs:1081`（`SCANNED_PACKAGES`）
- Modify: `scripts/audit-log-hygiene.mjs:52`（`SCANNED_PACKAGES`）
- Modify: `scripts/audit-domain-side-effects.mjs:77`（`DOMAIN_PACKAGES`）
- Delete: `packages/timer-core/src/display-name.ts`

**Interfaces:**
- Produces: 以降のすべての段が使う `@tasuki/room-core`

```ts
// packages/room-core/src/index.ts が公開する記号
export function normalizeDisplayName(raw: string): string;
export function nameSkeleton(name: string): string;
export function conflictsWithExisting(
  participants: readonly { participantId: string; displayName: string }[],
  desiredName: string,
  excludeId?: string,
): boolean;
```

- [ ] **Step 1: 作業ツリーが clean であることを確かめる**

```bash
git status --porcelain
```

期待: 出力なし。**空でないまま進むと、後の `git checkout --` で未コミットの実装を消す。**
（過去に 3 回踏んだ事故）

- [ ] **Step 2: ブランチを切る**

```bash
git checkout -b feature/issue-95-s1-room-core
```

**S1 のブランチはここで 1 本だけ切る。** Task 7 も同じブランチに積む（R1）。
このブランチが閉じるのは Task 0 で起票した **S1 の Issue** である。

- [ ] **Step 3: パッケージの器を作る**

`packages/room-core/package.json`:

```json
{
  "name": "@tasuki/room-core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

**`dependencies` は空にする（キーごと書かない）。** `display-name.ts` は import を
1 つも持たない純粋な文字列関数であり（2026-09-06 実測）、`neverthrow` も `valibot` も
S1 の時点では使わない。`Result` を返す関数はメンバーシップ文脈が振る舞いを持つ
S4a で入るので、そのときに依存を足す。

`packages/room-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

`packages/room-core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

`packages/room-core/src/` は S1 の時点で `display-name.ts` と `index.ts` の 2 ファイルだけになる。

- [ ] **Step 4: テストを先に移す（赤を作る）**

`packages/room-core/tests/display-name.test.ts` を作る。**移動元
`packages/timer-core/test/display-name.test.ts` の次の 6 つの `describe` ブロックを
そのまま写す**（本文は 1 文字も変えない）。

| 移す `describe` | 元の行 |
|---|---|
| `normalizeDisplayName` | 16 |
| `normalizeDisplayName（防御の迂回に対する回帰）` | 133 |
| `nameSkeleton（見え方による曖昧判定・第2層）` | 196 |
| `双方向制御文字（レビュー指摘・推奨）` | 284 |
| `nameSkeleton のメモ化（レビュー指摘・提案）` | 304 |
| `conflictsWithExisting` | 325 |

**移さない 2 つ**（`CommandSchema` を使うため timer-core に残る）:
`CommandSchema の表示名（境界での正規化）`（62）/ `NFKC 展開と最大長（レビュー指摘・必須）`（228）

ファイル冒頭は次にする。

```ts
/**
 * 表示名の正規化（実機の敵対的検証で見つかった素通り経路の回帰テスト）。
 *
 * 「画面で同じに見えるものは同じ文字列である」を保証する。これが崩れると、
 * 同名判定が発火せず識別子も添えられないまま、見分けの付かない行が並ぶ。
 *
 * #95 S1 で `packages/timer-core` から移設した。`CommandSchema`（境界での正規化）を
 * 見る 2 つの describe は timer-core 側に残してある。あれは timer のスキーマの検査であり、
 * メンバーシップ文脈の責務ではない。
 */

import { describe, it, expect } from "vitest";
import { nameSkeleton, conflictsWithExisting } from "../src/index.js";
import { normalizeDisplayName } from "../src/display-name.js";
```

**`valibot` と `MAX_DISPLAY_NAME` の import は要らない**（残す 2 describe でしか使っていない）。

- [ ] **Step 5: 赤を確認する**

```bash
corepack pnpm install
corepack pnpm --filter @tasuki/room-core test
```

期待: **FAIL**。`Cannot find module '../src/index.js'` もしくは同等。
**ここで緑になったら手元を疑うこと**（別の `display-name` を掴んでいる）。

- [ ] **Step 6: 実装を移す**

```bash
git mv packages/timer-core/src/display-name.ts packages/room-core/src/display-name.ts
git status --porcelain
```

期待: `R  packages/timer-core/src/display-name.ts -> packages/room-core/src/display-name.ts`。
**9p マウントでは rename が壊れることがある。`R` が出ないなら止めて調べること。**

`packages/room-core/src/index.ts` を作る（`export *` を使わない・`docs/adr/0016` 決定 2-2）:

```ts
/**
 * メンバーシップ文脈の公開契約（#95・`docs/adr/0017`）。
 *
 * ルーム・参加者・表示名を扱う。ツールのドメイン（timer-core / poker-core）は
 * この文脈に依存しない。ここへ依存してよいのはアプリ層だけである。
 *
 * S1 の時点では表示名の規約だけが住んでいる。ルームと参加者は S4a で移る。
 */
export { normalizeDisplayName, nameSkeleton, conflictsWithExisting } from "./display-name.js";
```

- [ ] **Step 7: 緑を確認する**

```bash
corepack pnpm --filter @tasuki/room-core test
```

期待: PASS。

- [ ] **Step 8: timer-core 側を付け替える**

`packages/timer-core/package.json` の `dependencies` に足す（**この行は S4b で消す。
`docs/adr/0017` 決定 4 の期限つき一時依存**）:

```json
    "@tasuki/room-core": "workspace:*",
```

`packages/timer-core/src/schemas.ts:24` を書き換える。

```ts
// #95 S1: 表示名の規約はメンバーシップ文脈（room-core）へ移した。
// この import は timer-core が表示名を検証しなくなる S4a で消える（docs/adr/0017 決定 4）。
import { normalizeDisplayName } from "@tasuki/room-core";
```

`packages/timer-core/src/index.ts:61` の行を**削除**する。

```ts
export { nameSkeleton, conflictsWithExisting } from "./display-name.js";
```

`packages/timer-core/test/display-name.test.ts` を、残す 2 describe だけにする。
冒頭の import を次にする。

```ts
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/index.js";
import { normalizeDisplayName } from "@tasuki/room-core";
import { MAX_DISPLAY_NAME } from "../src/aggregate.js";
```

- [ ] **Step 9: timer-web 側を付け替える**

`apps/timer-web/package.json` の `dependencies` に足す:

```json
    "@tasuki/room-core": "workspace:*",
```

`apps/timer-web/src/ui/participant-label.ts:13` を書き換える。

```ts
import { nameSkeleton } from "@tasuki/room-core";
```

- [ ] **Step 10: 検査の走査表を 3 つ更新する**

`scripts/audit-structure.mjs` の `SCANNED_PACKAGES`（1081 行付近）に 1 行足す。
**`packages/room-core` の test ディレクトリ名は `tests`**（`timer-core` は `test` だが
新設は `protocol` / `poker-core` / `rate-limit` に揃える）。

```js
  { pkg: "packages/room-core", src: "src", test: "tests", entry: "index.ts" },
```

`scripts/audit-log-hygiene.mjs` の `SCANNED_PACKAGES`（52 行付近）に足す（**アルファベット順を保つ**）:

```js
  "packages/room-core",
```

`scripts/audit-domain-side-effects.mjs` の `DOMAIN_PACKAGES`（77 行付近）に足す:

```js
export const DOMAIN_PACKAGES = ["packages/poker-core", "packages/room-core", "packages/timer-core"];
```

- [ ] **Step 11: 全体を回して緑を確認する**

```bash
corepack pnpm install
corepack pnpm test --force 2>&1 | tail -20
corepack pnpm typecheck 2>&1 | tail -10
corepack pnpm lint 2>&1 | tail -10
```

期待: すべて緑。`--force` を付けるのは turbo のキャッシュに当たって 1.5 秒で
「緑」が出るのを防ぐため。`Cached: 0 cached` を確認すること。

- [ ] **Step 12: 監査 4 本を回して指標が動いていないことを確認する**

```bash
node scripts/audit-structure.mjs 2>&1 | tail -12
node scripts/audit-log-hygiene.mjs 2>&1 | tail -5
node scripts/audit-domain-side-effects.mjs 2>&1 | tail -5
node scripts/audit-public-surface.mjs 2>&1 | tail -5
```

**要求**: `SC039` の 4 つが**全部 0** のまま。`SC031` が **2** のまま。
`SC032` の分子・分母は増えてよいが**未達件数が 2 を超えないこと**。

**`SC039` が 0 でなくなった場合**: `conflictsWithExisting` に製品コードの呼び出し元が
無いことが原因である可能性が高い（S1 着手時点で実測済み。呼び出し元は自身のテストだけ）。
その場合は**この計画の範囲では公開契約から外さず、Issue へ申し送る**。
S4a でメンバーシップ文脈が重複名の検査を持つときに決める。
外すと「S1 は振る舞い不変」という段階の性質が崩れる。

- [ ] **Step 13: リンク検査**

```bash
git add -A
node scripts/check-links.mjs
```

- [ ] **Step 14: コミット**

```bash
git commit -m "$(cat <<'MSG'
feat: メンバーシップ文脈のパッケージを新設し表示名の規約を移す（#95 S1）

packages/room-core を作り、packages/timer-core/src/display-name.ts を
verbatim で移設した。表示名の正規化と見え方による曖昧判定は、timer 固有では
なくメンバーシップ文脈の値オブジェクトである。poker は NAME_MAX_LENGTH しか
持っておらず、この移設で同じ防御を共有できるようになる（利用は S4a）。

- テストは 8 describe のうち 6 つを移した。CommandSchema を見る 2 つは
  timer のスキーマの検査なので timer-core に残した
- timer-core -> room-core の依存は期限つきの一時依存で、S4b で外す
  （docs/adr/0017 決定 4）
- 検査の走査表 3 つ（audit-structure / audit-log-hygiene /
  audit-domain-side-effects）を更新した。全単射照合なので更新しないと落ちる

振る舞いは変えていない。SC039 は 4 つとも 0、SC031 は 2 のまま。

Closes #<S1 の Issue 番号>
MSG
)"
git push -u origin feature/issue-95-s1-room-core
```

---

## Task 7: 依存の向きを機械的に固定する

**Files:**
- Create: `scripts/audit-dependency-direction.mjs`
- Create: `scripts/audit-dependency-direction.test.mjs`
- Modify: `.github/workflows/*.yml`（`quality` ジョブに 1 行）

**Interfaces:**
- Consumes: Task 6 が作った `packages/room-core`
- Produces: 以降のすべての段が守る依存方向の検査

- [ ] **Step 1: CI のどのジョブに置くかを確かめる**

```bash
ls .github/workflows/
grep -n "audit-structure\|audit-log-hygiene" .github/workflows/*.yml
```

期待: `quality` ジョブが他の `audit-*` を呼んでいる行が出る。**同じジョブに置く。**
`*.md` を見る検査ではないので `docs` ジョブではない。

- [ ] **Step 2: 失敗するテストを書く**

`scripts/audit-dependency-direction.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations, ALLOWED } from "./audit-dependency-direction.mjs";

test("表に無い依存を package.json から見つける", () => {
  const violations = findViolations({
    "packages/timer-core": { manifest: ["@tasuki/poker-core"], imports: [] },
  });
  assert.deepEqual(violations, [
    { pkg: "packages/timer-core", dep: "@tasuki/poker-core", via: "package.json" },
  ]);
});

test("表に無い依存を import 文から見つける", () => {
  const violations = findViolations({
    "packages/poker-core": { manifest: [], imports: ["@tasuki/room-core"] },
  });
  assert.deepEqual(violations, [
    { pkg: "packages/poker-core", dep: "@tasuki/room-core", via: "import" },
  ]);
});

test("表にある依存は通す", () => {
  const violations = findViolations({
    "apps/timer-web": { manifest: ["@tasuki/room-core"], imports: ["@tasuki/timer-core"] },
  });
  assert.deepEqual(violations, []);
});

test("表に無いパッケージそのものを違反として報告する", () => {
  const violations = findViolations({ "packages/unknown": { manifest: [], imports: [] } });
  assert.deepEqual(violations, [
    { pkg: "packages/unknown", dep: null, via: "declaration" },
  ]);
});

test("許可表は全パッケージを網羅する（宣言と実体の全単射）", () => {
  // 実体は ALLOWED のキーと一致していなければならない。
  // 新しいパッケージを足したら、この検査が先に落ちて判断を強制する。
  assert.ok(Object.keys(ALLOWED).length > 0);
});
```

- [ ] **Step 3: 赤を確認する**

```bash
node --test scripts/audit-dependency-direction.test.mjs
```

期待: FAIL（`Cannot find module './audit-dependency-direction.mjs'`）。

- [ ] **Step 4: 検査を書く**

`scripts/audit-dependency-direction.mjs`:

```js
#!/usr/bin/env node
/**
 * 依存の向きを見る検査（憲法 原則 VI・`docs/adr/0017` 決定 4）。
 *
 * ## なぜ要るか
 *
 * 原則 VI「依存は内向き」は MUST でありながら、2026-09-06 の実測時点で
 * `scripts/*.mjs` の非テスト 14 本に**パッケージ間の依存方向を見る検査は 1 つも無かった**。
 * 近い形のものは 2 つあるが、どちらも別のものを見ている。
 *   - `audit-web-sync-boundary.mjs`: 1 つの web アプリ**内**のファイル単位 import 許可リスト
 *   - `audit-assembly-wiring.mjs`: 組み立ての集約（エントリが create-sync-server を経由するか）
 *
 * ## 何を見るか
 *
 *   1. **宣言と実体の全単射照合**（`docs/adr/0014` 決定 1）: {@link ALLOWED} のキーと、
 *      `pnpm-workspace.yaml` のグロブから導いた実在パッケージが一致する
 *   2. **package.json の `dependencies`** に、表に無い `@tasuki/*` が無い
 *   3. **`src` 配下の import 文**に、表に無い `@tasuki/*` が無い
 *
 * 2 と 3 の**両方**を見る。片方だけだと、宣言せずに import する経路（あるいは
 * 宣言だけして使わない経路）が抜ける。
 *
 * ## 賢くしない
 *
 * 無状態の許可リストにする。「テストなら許す」「型 import なら許す」といった例外を
 * 足さない。例外を足すほど穴が増える。**新しいパッケージを足したら、表を更新するまで
 * 赤になる。それが望む挙動である**（依存方向は決定であり、黙って通してよいものではない）。
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 各パッケージが依存してよい `@tasuki/*` の許可リスト。
 *
 * **これは「S1 完了時点の実体」であり、設計の最終形ではない。** 設計正本 D17 の表は
 * 最終形（`sync-client` や LP の同期依存を含む）を書いている。表は段ごとに更新する。
 *
 * **期限つきの一時依存には期限を書く**（`docs/adr/0017` 決定 4）。期限の段が終わったら
 * 行を消す。消し忘れても検査は緑のままなので、その段の DoD で確認する。
 */
export const ALLOWED = {
  "packages/room-core": [],
  "packages/timer-core": ["@tasuki/room-core"], // ⏳ S4b で削除する（#95・一時依存）
  "packages/poker-core": ["@tasuki/protocol"], // 既存。境界のパースを protocol に一本化
  "packages/protocol": [],
  "packages/rate-limit": [],
  "packages/ui": [],
  "apps/landing": ["@tasuki/ui"],
  "apps/timer-web": ["@tasuki/room-core", "@tasuki/timer-core", "@tasuki/ui"],
  "apps/poker-web": ["@tasuki/poker-core", "@tasuki/ui"],
  "apps/timer-sync": ["@tasuki/protocol", "@tasuki/rate-limit", "@tasuki/timer-core"],
  "apps/poker-sync": ["@tasuki/poker-core", "@tasuki/rate-limit"],
  "e2e": ["@tasuki/landing", "@tasuki/poker-web", "@tasuki/timer-web"],
};

/** `@tasuki/*` の import 指定子を 1 行から拾う。 */
const TASUKI_SPECIFIER = /["'](@tasuki\/[a-z0-9-]+)/g;

/**
 * パッケージごとの `{ manifest, imports }` から違反を返す。
 * 引数を受け取る形にしてあるのは、ファイルシステムを触らずに検査できるようにするため。
 */
export function findViolations(observed) {
  const violations = [];
  for (const [pkg, { manifest, imports }] of Object.entries(observed)) {
    const allowed = ALLOWED[pkg];
    if (allowed === undefined) {
      violations.push({ pkg, dep: null, via: "declaration" });
      continue;
    }
    const set = new Set(allowed);
    for (const dep of manifest) {
      if (!set.has(dep)) violations.push({ pkg, dep, via: "package.json" });
    }
    for (const dep of new Set(imports)) {
      if (!set.has(dep)) violations.push({ pkg, dep, via: "import" });
    }
  }
  return violations;
}

/** `src` 配下の `.ts` / `.tsx` を再帰で集める。 */
function collectSources(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectSources(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

/** 実体を観測する。 */
function observe(pkg) {
  const manifestPath = join(pkg, "package.json");
  const manifest = existsSync(manifestPath)
    ? Object.keys(JSON.parse(readFileSync(manifestPath, "utf8")).dependencies ?? {}).filter((d) =>
        d.startsWith("@tasuki/"),
      )
    : [];
  const imports = [];
  for (const file of collectSources(join(pkg, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(TASUKI_SPECIFIER)) imports.push(m[1]);
  }
  return { manifest, imports };
}

/** `packages/*` と `apps/*` と `e2e` の実在パッケージを導く。 */
function listPackages() {
  const found = [];
  for (const parent of ["packages", "apps"]) {
    if (!existsSync(parent)) continue;
    for (const name of readdirSync(parent)) {
      const p = join(parent, name);
      if (statSync(p).isDirectory() && existsSync(join(p, "package.json"))) found.push(p);
    }
  }
  if (existsSync(join("e2e", "package.json"))) found.push("e2e");
  return found.sort();
}

function main() {
  const actual = listPackages();
  const declared = Object.keys(ALLOWED).sort();

  const missing = actual.filter((p) => !declared.includes(p));
  const stale = declared.filter((p) => !actual.includes(p));
  if (missing.length > 0 || stale.length > 0) {
    console.error("[audit-dependency-direction] 宣言と実体が食い違っています");
    for (const p of missing) console.error(`  宣言に無いパッケージ: ${p}`);
    for (const p of stale) console.error(`  実在しない宣言: ${p}`);
    process.exit(1);
  }

  const observed = Object.fromEntries(actual.map((p) => [p, observe(p)]));
  const violations = findViolations(observed);

  console.log(
    `[audit-dependency-direction] 走査対象: ${actual.length} パッケージ`,
  );
  if (violations.length === 0) {
    console.log("依存の向き OK（表に無い @tasuki/* の依存は 0 件）");
    return;
  }
  console.error("依存の向きに違反があります:");
  for (const v of violations) {
    console.error(
      v.dep === null
        ? `  ${v.pkg}: 許可表に宣言がありません`
        : `  ${v.pkg} → ${v.dep}（${v.via}）`,
    );
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 5: 緑を確認する**

```bash
node --test scripts/audit-dependency-direction.test.mjs
node scripts/audit-dependency-direction.mjs
```

期待: テストが PASS。本体が `依存の向き OK`。

**本体が赤なら、それは検査ではなく `ALLOWED` が実体と合っていない。**
`apps/*` の実際の `dependencies` を読んで表を直すこと（この計画の表は 2026-09-06 の実測に
基づくが、`apps/poker-web` などは変わっている可能性がある）。

- [ ] **Step 6: 壊して赤を確認する（原則 VII・3 通り）**

```bash
# ① import だけ足す（宣言しない）
echo 'import { nameSkeleton } from "@tasuki/room-core";' >> packages/poker-core/src/deck.ts
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
git checkout -- packages/poker-core/src/deck.ts

# ② package.json にだけ足す（import しない）
node -e 'const f="packages/poker-core/package.json";const j=JSON.parse(require("fs").readFileSync(f));j.dependencies["@tasuki/room-core"]="workspace:*";require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
git checkout -- packages/poker-core/package.json

# ③ 表に無いパッケージを作る
mkdir -p packages/zzz-probe && echo '{"name":"@tasuki/zzz-probe","private":true}' > packages/zzz-probe/package.json
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
rm -rf packages/zzz-probe
```

期待: ①②③ とも `exit=1`。①は `（import）`、②は `（package.json）`、③は
`許可表に宣言がありません` を出す。

- [ ] **Step 7: 対照実行（壊さずに緑になることを確かめる）**

```bash
git status --porcelain
node scripts/audit-dependency-direction.mjs; echo "exit=$?"
```

期待: `git status` が空で、`exit=0`。**壊して赤を見る前後で、壊していない状態の緑を
必ず確認する。** これが無いと「常に赤い検査」を「よく効く検査」と取り違える。

- [ ] **Step 8: CI に結線する**

Step 1 で見つけた `quality` ジョブに、他の `audit-*` と同じ形で 1 行足す。

```yaml
      - name: 依存の向き
        run: node scripts/audit-dependency-direction.mjs
```

- [ ] **Step 9: コミット**

```bash
git add scripts/audit-dependency-direction.mjs scripts/audit-dependency-direction.test.mjs .github/workflows/
node scripts/check-links.mjs
git commit -m "$(cat <<'MSG'
feat: 依存の向きを許可リストで機械的に固定する（#95 S1・docs/adr/0017 決定 4）

憲法 原則 VI「依存は内向き」は MUST でありながら、scripts の非テスト 14 本に
パッケージ間の依存方向を見る検査が 1 つも無かった。近い形の 2 本
（audit-web-sync-boundary / audit-assembly-wiring）はどちらも別のものを見ている。

- package.json の dependencies と src の import 文の両方を見る。片方だけだと
  宣言せずに import する経路が抜ける
- 宣言と実体を全単射で照合する。新しいパッケージは表を更新するまで赤になる
- 無状態の許可リストにし、例外の仕組みを作らない
- timer-core -> room-core は期限つきの一時依存として表に記録した（S4b で削除）

壊して赤になることを 3 通り（import のみ / package.json のみ / 未宣言パッケージ）
確認し、壊していない状態で緑になる対照実行も取った。
MSG
)"
git push
```

---

## 自己点検の結果

**1. 設計正本の網羅（S0・S1 の範囲）**

| 設計正本の項目 | 対応するタスク |
|---|---|
| D1・D2・D3・D16・D19（文脈分割） | Task 1 |
| D17（依存の向き） | Task 1（決定）＋ Task 7（実装） |
| D7・D10・D11（入口と URL） | Task 2 |
| D20（web 層の適用範囲） | Task 3 |
| D5（役割廃止）の規範側 | Task 4（`docs/timer/adr/0007`・`docs/adr/0011`） |
| D12（同一性）の規範側 | Task 4（FR-006 の撤廃） |
| §7 の段階 → 子 Issue | Task 0（ブランチ前） |
| S1（`room-core` 新設・`display-name` 移設） | Task 6 |

**S0・S1 の範囲に、対応するタスクの無い項目は無い。**
D4・D6・D8・D9・D13・D14・D15・D18・D21・D22 は S2 以降の範囲であり、本計画では扱わない。

**2. 未確定を残した箇所（意図的）**

- Task 1 Step 1 と Task 2・Task 3 の ADR 番号は「2026-09-06 時点で 0016 が最大」に基づく。
  **着手時に数え直す手順を Step に入れてある**
- Task 0 で起票した Issue 番号を、S0・S1 のコミットメッセージの `Closes #<番号>` に埋める。
  **バッククォートで囲まない**（自動クローズが効かない）
- Task 7 の `ALLOWED` は 2026-09-06 の実測に基づく。**合わなければ実体を読んで直す**手順を
  Step 5 に入れてある

**3. 型と名前の一致**

`normalizeDisplayName` / `nameSkeleton` / `conflictsWithExisting` の 3 つは、Task 6 の
Interfaces・`index.ts`・テストの import・timer-core と timer-web の付け替えで同じ綴りを
使っている。`@tasuki/room-core` のパッケージ名も全タスクで一致している。
