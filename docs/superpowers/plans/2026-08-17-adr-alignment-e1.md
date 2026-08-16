# E1（規範の空白を埋める＋現行 ADR の実態整合）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #72 が「ADR に沿って直す」ための形を決め切り、現行 ADR と実態のずれを解消する。コードの構造は変えない。

**Architecture:** 文書 3 層（憲法 / ADR / ガイド）のうち **ADR 層に 2 本を新設**（`docs/adr/0015` web 層・`docs/adr/0016` core 表現）、**1 本へ追記**（`docs/adr/0007` 抽象の基準）、**アプリ固有 ADR を新設**（`docs/poker/adr/0001`）する。あわせて実態とずれた timer ADR 2 本へ追記し、走査対象（`scripts/check-links.mjs` の `LIVE_DOCS`）が新しい規範文書を拾うようにする。最後に #72 本文の完了条件を再定義し、後続 4 本を sub-Issue として起票する。

**Tech Stack:** Markdown / Node.js 22（`node:test` + `node:assert/strict`）/ pnpm 11.5.0 / GitHub CLI (`gh`)

**Spec:** [`docs/superpowers/specs/2026-08-17-adr-alignment-e1-design.md`](../specs/2026-08-17-adr-alignment-e1-design.md)

**Branch:** `docs/72-adr-alignment-e1`（作成済み。設計文書の 4 コミットが載っている）

## Global Constraints

- **振る舞いを変えない。** 公開 URL・WS プロトコル・画面の挙動は据え置き（epic #67 の制約）
- **`packages/` の差分は 0 行。** `apps/` の差分は `apps/timer-web/src/App.tsx` の docstring 2 行のみ
- **ADR は追記のみ。** 既存の「決定」節を 1 文字も書き換えない（`docs/adr/0002` 決定 1）。覆すときだけ `Superseded`
- **憲法（`docs/constitution.md`）は改版しない。** したがって `AGENTS.md` の見出し同期（`docs/adr/0002` 決定 5）は発生しない
- **二重正本を作らない**（憲法 原則 VIII）。決定の中身と根拠は ADR、手順・例・チェックリストはガイド
- **ADR の参照は置き場つきで書く。** `docs/adr/0005` の形式。「ADR 5」のような置き場を省いた参照は禁止（`docs/adr/0002` 決定 3）
- **文書は日本語。** コミットメッセージは Conventional Commits の type 接頭辞 ＋ 日本語タイトル ＋ 末尾に `（#72）`
- **E1 は文書のみの PR ではない。** `scripts/check-links.mjs` を変更するため `scripts/ci-scope.mjs` の判定（`changedFiles.some((f) => !f.endsWith(".md"))`）でフル CI が走る
- **作業ディレクトリは `/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki` では作業しない
- 検査コマンドは `export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH` を通してから実行する

## File Structure

| ファイル | 責務 | 操作 |
|---|---|---|
| `docs/adr/0007-abstraction-criteria.md` | 抽象の導入基準。「利用者」の数え方を明確化する追記 | Modify（末尾に追記節） |
| `docs/adr/0015-web-layer-structure.md` | web 層（`apps/*-web`）の責務分離の標準 | Create |
| `docs/adr/0016-core-domain-representation.md` | `packages/*-core` の表現の選択基準と、必ず揃える点 | Create |
| `docs/poker/adr/0001-poker-domain-direct-transition.md` | poker が直接遷移を採る根拠 | Create |
| `docs/poker/adr/README.md` | poker の ADR 索引 | Create |
| `docs/adr/README.md` | 横断 ADR の索引と置き場表 | Modify |
| `docs/README.md` | 文書地図。アプリ固有 ADR の例に poker を足す | Modify |
| `docs/timer/adr/0007-volatile-in-memory-state.md` | 実態（`token-store.ts` への切り出し）を追記 | Modify（末尾に追記節） |
| `docs/timer/adr/0008-server-resident-ai-generation.md` | 実態（BYOK 撤去済み）を追記 | Modify（末尾に追記節） |
| `apps/timer-web/src/App.tsx` | `resolveProvider` の docstring を実装に合わせる | Modify（39-40 行） |
| `scripts/check-links.mjs` | `LIVE_DOCS` に `docs/poker/adr/` を追加。`DORMANT_DOCS` の timer の理由を修正 | Modify |
| `scripts/check-links.test.mjs` | 上記の走査対象を守るテスト | Modify |
| `docs/guides/architecture.md` | 層対応表に web 層の内部責務、判断フローに core の表現選択を追加 | Modify |

---

### Task 1: `docs/adr/0007` へ「テストの差し替えも利用者に数える」を追記する

**Files:**
- Modify: `docs/adr/0007-abstraction-criteria.md`（末尾に追記節を足す。既存の「決定」節は触らない）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: Task 2・Task 3 が新設する ADR が根拠として参照する「利用者の数え方」の定義

- [ ] **Step 1: 追記前の「決定」節を控える**

```bash
cd /home/vscode/tasuki-work
git rev-parse --abbrev-ref HEAD   # docs/72-adr-alignment-e1 であること
sed -n '/^## 決定/,/^## 影響/p' docs/adr/0007-abstraction-criteria.md > /tmp/adr0007-decision-before.txt
wc -l /tmp/adr0007-decision-before.txt
```

期待: 「決定」節が 12 行前後で取れる。Step 4 でこれと突き合わせる。

- [ ] **Step 2: ファイル末尾に追記節を足す**

`docs/adr/0007-abstraction-criteria.md` の**末尾**（現在の最終行は「本 ADR はその基準を全体規約として記録するのみで、新たな抽出・撤去は行わない。」）に、以下をそのまま追加する。

```markdown

## 追記（2026-08-17・#72 E1）

**基準 1 の「利用者（呼び出し箇所）」には、テストからの差し替え利用を数える。**

ポート（インターフェース）に対する本番アダプタが 1 つしか無くても、テストが別の
アダプタを注入して使うなら、利用者は 2 つである。

**ただし「テストを書けば 2 つ目になる」を理由に抽出してはならない。差し替えを行う
テストが現に存在する（または同じ PR で追加される）ことを条件とする（MUST）。**
この条件が無いと基準 1 が恒真になり、あらゆる抽出が「テストを書けば 2 つ目」で
正当化できてしまう。

**根拠**: [`docs/adr/0004`](./0004-sync-server-ports-and-adapters.md)（同期サーバーは
ポート/アダプタ構成を標準とする）は、テスト時にアダプタを差し替えられる構成が
[#80](https://github.com/tomohiroJin/tasuki-tools/issues/80)（実 WS 越しの業務プロトコル層）
で**実際に効いた**ことを決定の根拠にしている。これは「いずれ 2 箇所目ができるかも
しれない」という予測ではなく実測であり、基準 1 の趣旨（予測での抽出を禁じる）に
反しない。

**既存の 3 基準は変更していない。** 本追記は基準 1 の「利用者」の数え方を明確化する
ものであり、基準そのものを覆すものではない（`docs/adr/0002` の「ADR は追記のみ」）。
```

- [ ] **Step 3: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs; echo "exit: $?"
```

期待: `exit: 0`。追記中の `./0004-sync-server-ports-and-adapters.md` が実在するので通る。

- [ ] **Step 4: 「決定」節が 1 文字も変わっていないことを示す**

```bash
cd /home/vscode/tasuki-work
sed -n '/^## 決定/,/^## 影響/p' docs/adr/0007-abstraction-criteria.md > /tmp/adr0007-decision-after.txt
diff /tmp/adr0007-decision-before.txt /tmp/adr0007-decision-after.txt && echo "決定節の差分なし"
```

期待: `決定節の差分なし` が出る（`diff` が終了コード 0）。差分が出たら追記位置を間違えているので直す。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/adr/0007-abstraction-criteria.md
git commit -m "docs: ADR-0007 にテストの差し替えも利用者に数えることを追記する（#72）

- ポートの利用者は本番アダプタ＋テストの差し替えで 2 つと数える
- 差し替えるテストが現に存在することを条件にし、基準が恒真になるのを防ぐ
- 根拠は ADR-0004 が #80 で実測した事実。既存 3 基準は変更していない"
```

---

### Task 2: `docs/adr/0015`（web 層の構造標準）を新設し索引へ載せる

**Files:**
- Create: `docs/adr/0015-web-layer-structure.md`
- Modify: `docs/adr/README.md`（「一覧」表の 0014 の行の次に 0015 の行を足す）

**Interfaces:**
- Consumes: Task 1 の「利用者の数え方」（本 ADR の MUST 2 が同期フックの抽出を求めるため）
- Produces: E4（web 層の再編）が従う 3 つの MUST。検査は E4 が置く

- [ ] **Step 1: ADR-0015 を作成する**

`docs/adr/0015-web-layer-structure.md` を以下の内容で新規作成する。

```markdown
# ADR-0015: web 層は「純粋関数・同期フック・画面」に責務を分ける

- **ステータス**: Accepted（2026-08-17）
- **関連**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（ADR に沿ったリファクタリング、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  [`docs/adr/0004`](./0004-sync-server-ports-and-adapters.md)（同期サーバー側の対応する標準）/
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準。本 ADR の MUST 2 の可否判定）/
  [`docs/guides/architecture.md`](../guides/architecture.md)（層とディレクトリの対応の正本）

## 背景

`docs/guides/architecture.md` の層対応表は `apps/*-web` を「アダプタ」に置き、
「上のすべてに依存してよい」と定めるだけで、**内部構造を規定していない**。
その結果、2 つの web アプリが別々の形に育った（2026-08-17 実測）。

| | `apps/timer-web`（77 ファイル / 7,692 行） | `apps/poker-web`（12 ファイル / 784 行） |
|---|---|---|
| 分け方 | 関心事別（`ui/` `sync/` `ai/` `records/` `prefs/` `platform/`） | 役割別（`components/` `hooks/` `pages/`） |
| 純粋ロジックの切り出し | **徹底している。** `ui/screen.ts` `ui/error-action.ts` `ui/host-change.ts` `ui/problem-generation.ts` `ui/join-driver-intent.ts` `ui/connection-status.ts` `ui/room-param.ts` `sync/notice-message.ts` `sync/sync-url.ts` の 9 本は、いずれも 12〜63 行で副作用 0 件・React フック 0 件 | `connection-notice.ts` のみ |
| WS の配線 | **`App.tsx` に直書き。** `useState` 12 個・`useRef` 9 個・105〜377 行の 272 行 `useEffect` 1 本が同居し、同ファイルは 848 行 | **`hooks/useSync.ts`（176 行）に集約。** `wsRef` と `open` / `close` / `message` の 3 リスナを 1 つの `useEffect` に閉じ込め、接続まわりの状態 7 個を保持 |

**この非対称は「片方が正しく片方が誤り」ではない。** timer-web は純粋関数の切り出しを、
poker-web は WS 配線の集約を、それぞれ現に実現している。`App.tsx` が 848 行あるのは、
timer-web が後者を持たないためである。

## 決定

**web 層（`apps/*-web`）の内部を、次の 3 つの責務に分ける。**

1. **副作用のない判断は、純粋関数として `.ts` に切り出す（MUST）。**
   画面遷移の決定・エラー種別からの行動決定・表示文言の組み立てなどを、
   コンポーネントやフックの中に埋め込まない。
2. **WebSocket の接続状態とメッセージ配線は、同期フック 1 本に集約する（MUST）。**
   画面コンポーネント（`App.tsx` を含む）が、同期クライアントのイベントハンドラを
   直接持たない（**MUST NOT**）。
3. **画面コンポーネントは表示に徹する。** 状態は同期フックまたは純粋関数から受け取る。

**ディレクトリの対応は本 ADR では定めない。** 層とディレクトリの対応表の正本は
[`docs/guides/architecture.md`](../guides/architecture.md) であり、そちらで扱う
（`docs/adr/0002` の三層構造・書き分け規則）。

**根拠**: 1 は timer-web の 9 本が、2 は poker-web の `hooks/useSync.ts` が、それぞれ
**現に動いている実装として存在する**。どちらも「将来こうなるかもしれない」という
予測ではない。MUST 2 が求める同期フックへの集約は、フック単体テストが 2 つ目の
利用者になるため [`docs/adr/0007`](./0007-abstraction-criteria.md) の基準 1
（2026-08-17 の追記を含む）を満たす。

## 影響

- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を変更しない。**
  適用は [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の E4 で行う。
- **`apps/poker-web` は本 ADR の MUST 2 に既に準拠している**（`App.tsx:3` が
  `usePokerSync` を経由し、`.tsx` に `WebSocket` の直接使用が無い。2026-08-17 実測）。
  E4 で再編するのは `apps/timer-web` 側である。
- MUST 2 の機械検査は **E4 が置く**。E1 で先に置くと、E1 はコードを直さないため
  CI が赤になるからである。検査は**無状態の許可リスト方式**（`sync/client` を
  import してよいのは同期フック 1 本だけ）で書く。手書きの字句解析は採らない。
- 利用者から見える振る舞い（公開 URL・プロトコル・画面の挙動）は変えない。
```

- [ ] **Step 2: `docs/adr/README.md` の一覧へ 0015 を足す**

「## 一覧」表の `0014` の行の直後に、次の 1 行を挿入する。

```markdown
| [0015](./0015-web-layer-structure.md) | web 層は「純粋関数・同期フック・画面」に責務を分ける | Accepted |
```

- [ ] **Step 3: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs; echo "exit: $?"
```

期待: `exit: 0`。ADR-0015 は `docs/adr/` 配下＝`LIVE_DOCS` なので、本文中のコードパス
（`apps/timer-web/src/App.tsx` 等）の実在も検査される。落ちたらパスの綴りを直す。

- [ ] **Step 4: 索引から辿れることを確認する**

```bash
cd /home/vscode/tasuki-work
grep -n "0015-web-layer-structure" docs/adr/README.md
```

期待: 1 行ヒットする。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/adr/0015-web-layer-structure.md docs/adr/README.md
git commit -m "docs: web 層の構造標準を ADR-0015 として定める（#72）

- 純粋関数の切り出し・同期フックへの配線集約・画面は表示に徹する の 3 責務
- timer-web の 9 本と poker-web の useSync.ts が、それぞれ片方を実証している
- ディレクトリ対応はガイドの領分。機械検査は E4 が許可リスト方式で置く"
```

---

### Task 3: `docs/adr/0016`（core のドメイン表現規約）を新設し索引へ載せる

**Files:**
- Create: `docs/adr/0016-core-domain-representation.md`
- Modify: `docs/adr/README.md`（0015 の行の次に 0016 の行を足す）

**Interfaces:**
- Consumes: Task 1 の追記（本 ADR は抽象の基準に触れないが、決定 1 の「実需が無ければ Decider を採らない」判断の根拠として `docs/adr/0007` 基準 3 を引く）
- Produces: Task 4 の `docs/poker/adr/0001` が従う「選択を記録する（MUST）」。E2・E3・E6 が消す 3 つの不一致

- [ ] **Step 1: ADR-0016 を作成する**

`docs/adr/0016-core-domain-representation.md` を以下の内容で新規作成する。

```markdown
# ADR-0016: ドメインの表現は選択制とし、揃える点を定める

- **ステータス**: Accepted（2026-08-17）
- **関連**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（ADR に沿ったリファクタリング、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  [`docs/adr/0005`](./0005-result-and-boundary-validation.md)（Result と境界検証）/
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準）/
  [`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md)（timer が Decider を採った記録）/
  `docs/constitution.md` 原則 VI（依存は内向き）・原則 X（抽象は実需で）

## 背景

`packages/timer-core` と `packages/poker-core` は、どちらも `Result` を返す純粋
ドメインだが、表現が揃っていない（2026-08-17 実測）。

| | `packages/timer-core`（4,234 行 / 14 ファイル） | `packages/poker-core`（462 行 / 7 ファイル） |
|---|---|---|
| 状態遷移 | `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` ＋ `evolve(agg, event, now): Aggregate` | `castVote(room, participantId, card): Result<Room, RoundError>` など 5 関数 |
| 中間表現 | `DomainEvent` を挟む | 挟まない |
| エラー型 | `{ type: "DuplicateName"; name: string }` 等。文言を持たず `displayMessageFor()` が生成 | `{ code: 'not-voting'; message: '現在は投票を受け付けていません' }` 等。文言を同梱 |
| `index.ts` | 公開記号を明示列挙 | `export * from './deck'` ほか 6 行 |
| 決定の記録 | [`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md) | **ADR が 1 本も無い** |

**共通しているのは `Result` を返すこと（[`docs/adr/0005`](./0005-result-and-boundary-validation.md)）だけである。**

一方へ寄せる案は 2 つとも採らなかった。poker を Decider へ寄せる案は、poker の
ドメインが 462 行 / 5 遷移関数で、イベント履歴・再生の要求が現に無いため
[`docs/adr/0007`](./0007-abstraction-criteria.md) の基準 3（パターンは変更が現に困難な
ときに限る）を満たさない。timer を直接遷移へ寄せる案は、4,234 行の全面書き換えと
[`docs/timer/adr/0002`](../timer/adr/0002-decider-pure-domain.md) の `Superseded` を要し、
timer では Decider が現に効いている以上、後退である。

## 決定

### 決定 1: 表現は選択制とし、選択を記録する

- イベントの履歴・再生・段階適用が要るドメインは **Decider**（`decide` / `evolve`）を採る。
- 状態遷移だけで足りるドメインは **直接遷移関数 ＋ `Result`** を採る。
- **どちらを採ったかと、その理由を、そのアプリの ADR（`docs/<app>/adr/`）に記録する（MUST）。**

### 決定 2: どちらを採っても必ず揃える点

1. ドメイン操作の失敗は `Result<T, E>` で表す（**MUST**。[`docs/adr/0005`](./0005-result-and-boundary-validation.md) の再掲ではなく参照）。
2. `index.ts` は**公開記号を明示列挙**する。`export *` を使わない（**MUST NOT**）。
3. ドメインエラーは**判別子（`type` または `code`）と機械可読な詳細のみ**を持つ。
   表示文言は文言生成関数が担う（**MUST**）。
4. ドメイン内で `Date.now()` / `Math.random()` を呼ばない（**MUST NOT**）。
   時刻・乱数は引数で注入する。

**3 の「文言生成関数」は core の外に出すという意味ではない。** timer の
`displayMessageFor()` は `@tasuki/timer-core` から export されている。poker も同様に
poker-core 内の別モジュールへ置き、同期サーバーは `code` から文言を引く。

## 影響

- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を変更しない。**
  適用は [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の各段で行う。
- 決定 2 の未達と宛先（2026-08-17 実測）:

  | 項目 | 現状 | 直す対象 | 宛先 |
  |---|---|---|---|
  | 1. `Result` | 両方準拠 | なし | — |
  | 2. `index.ts` の明示列挙 | timer 準拠 / poker 未 | `packages/poker-core/src/index.ts` 1 ファイル | #72 E6 |
  | 3. エラー型 | timer 準拠 / poker 未 | poker-core の `RoundError` `RoomError` と文言 5 箇所、`apps/poker-sync/src/server.ts:244` `:333`、`apps/poker-web` | #72 E2 |
  | 4. `Date.now()` | poker 準拠 / timer 未 | `packages/timer-core/src/problem.ts:70` 1 箇所 | #72 E3 |

- **項目 3 を E2（poker-sync のポート/アダプタ再編）と同じ PR で行うのは、
  触るファイル群が同一だからである。** 分けると `apps/poker-sync/src/server.ts` を
  二度触ることになる（`docs/guides/pr-granularity.md`「分けた方が丁寧に見えるは
  理由にならない」）。
- 項目 3 の適用時、**WS で送る文字列は 1 文字も変えない**（振る舞い不変）。
- 決定 2 の項目 2・4 の機械検査は、それを消す Issue（E6・E3）が同じ PR で置く。
```

- [ ] **Step 2: `docs/adr/README.md` の一覧へ 0016 を足す**

0015 の行の直後に、次の 1 行を挿入する。

```markdown
| [0016](./0016-core-domain-representation.md) | ドメインの表現は選択制とし、揃える点を定める | Accepted |
```

- [ ] **Step 3: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs; echo "exit: $?"
```

期待: `exit: 0`。本文が挙げる `packages/poker-core/src/index.ts` `apps/poker-sync/src/server.ts`
`packages/timer-core/src/problem.ts` の実在が検査される。

- [ ] **Step 4: 表の宛先が設計正本と食い違っていないか確認する**

```bash
cd /home/vscode/tasuki-work
grep -n "E6\|E2\|E3" docs/adr/0016-core-domain-representation.md
grep -n "宛先" docs/superpowers/specs/2026-08-17-adr-alignment-e1-design.md | head -5
```

期待: 項目 2 → E6、項目 3 → E2、項目 4 → E3 が両方で一致している。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/adr/0016-core-domain-representation.md docs/adr/README.md
git commit -m "docs: core のドメイン表現規約を ADR-0016 として定める（#72）

- Decider と直接遷移の選択制にし、選択をアプリ固有 ADR へ記録することを MUST 化
- 揃える点は Result・index.ts の明示列挙・エラー型・Date.now 禁止 の 4 つ
- 未達 3 件の宛先を E2（エラー型）・E3（Date.now）・E6（index.ts）に固定した
- 一方へ寄せる 2 案は ADR-0007 基準 3 を満たさないか後退になるため採らない"
```

---

### Task 4: `docs/poker/adr/` を新設し、poker の選択を記録する

**Files:**
- Create: `docs/poker/adr/0001-poker-domain-direct-transition.md`
- Create: `docs/poker/adr/README.md`
- Modify: `docs/adr/README.md`（「置き場の使い分け」表に `docs/poker/adr/` の行を足す）
- Modify: `docs/README.md`（「目的別の入口」表のアプリ固有 ADR の例に poker を足す）

**Interfaces:**
- Consumes: Task 3 の決定 1（「どちらを採ったかをアプリ固有 ADR に記録する（MUST）」）
- Produces: Task 5 が `LIVE_DOCS` に足す対象ディレクトリ `docs/poker/adr/`（`checkConstants()` が実在を要求するため、Task 5 より前に作る必要がある）

- [ ] **Step 1: `docs/poker/adr/0001` を作成する**

```markdown
# ADR-0001: poker のドメインは直接遷移関数 ＋ Result を採る

- **ステータス**: Accepted（2026-08-17）
- **関連**: [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（ADR に沿ったリファクタリング）/
  `docs/adr/0016`（ドメインの表現は選択制とし、揃える点を定める。本 ADR はその決定 1 に基づく記録）/
  `docs/adr/0005`（Result と境界検証）/
  `docs/adr/0007`（抽象の導入基準）

## 背景

`docs/adr/0016` の決定 1 は、ドメインの表現として Decider（`decide` / `evolve`）と
直接遷移関数 ＋ `Result` のどちらを採ったかを、アプリ固有の ADR へ記録することを
MUST としている。poker はこれまで ADR を 1 本も持っていなかった。

## 決定

**poker のドメイン（`packages/poker-core`）は、直接遷移関数 ＋ `Result` を採る。**

`castVote(room, participantId, card): Result<Room, RoundError>` のように、
現在の状態と入力から次の状態を直接返す。イベント型を挟まない。

**根拠**（2026-08-17 実測）:

- ドメインは 462 行 / 7 ファイルで、状態遷移関数は 5 つである。
- **イベントの履歴・再生・段階適用の要求が現に無い。** 状態同期は
  スナップショット方式で、サーバーはルーム全体を配信して受信側が丸ごと置き換える。
- したがって Decider の導入は `docs/adr/0007` の基準 3（デザインパターンは、
  変更が現に困難になっている実需があるときに限る）を満たさない。

## 影響

- `docs/adr/0016` の決定 2（どちらを採っても必ず揃える点）は本 ADR とは独立に効く。
  poker が未達の項目（`index.ts` の `export *`、エラー型が文言を同梱している点）は
  [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の E6・E2 で解消する。
- **将来、イベントの履歴・再生が要るようになったら本 ADR を `Superseded` にする。**
  そのときは Decider への移行を新しい ADR で決める。
- 本 ADR の時点ではコードを変更しない。
```

- [ ] **Step 2: `docs/poker/adr/README.md` を作成する**

`docs/timer/adr/README.md` の形式に揃える。

```markdown
# アーキテクチャ決定記録（poker）

このディレクトリには、`apps/poker-web` / `apps/poker-sync` / `packages/poker-core` に
閉じた設計判断を記録します。各 ADR は Michael Nygard 形式（背景 / 決定 / 影響 /
ステータス）に従い、「なぜその選択をしたか」を残します。

> ADR は不変の記録です。判断が覆ったら ADR を削除せず、新しい ADR で `Superseded`（置換）します。

**採番はこのディレクトリで独立**です。参照するときは `docs/poker/adr/0001` のように
置き場ごと書いてください（採番規約の正本は `docs/adr/0002`）。
横断的な判断は `docs/adr/` に置きます。

## 一覧

| # | タイトル | ステータス |
|---|---|---|
| [0001](./0001-poker-domain-direct-transition.md) | poker のドメインは直接遷移関数 ＋ Result を採る | Accepted |
```

- [ ] **Step 3: `docs/adr/README.md` の置き場表へ poker の行を足す**

「## 置き場の使い分け」表の `docs/timer/adr/` の行の直後に、次の 1 行を挿入する。

```markdown
| `docs/poker/adr/` | `apps/poker-web` / `apps/poker-sync` / `packages/poker-core` に閉じた判断（0001〜） |
```

- [ ] **Step 4: `docs/README.md` の入口表に poker を足す**

「なぜそう決まっているか」の行の `[docs/timer/adr/](./timer/adr/)、アプリ固有` を、
`[docs/timer/adr/](./timer/adr/)・[docs/poker/adr/](./poker/adr/)、アプリ固有` に変える。

- [ ] **Step 5: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs; echo "exit: $?"
```

期待: `exit: 0`。**この時点では `docs/poker/adr/` は `DORMANT_DOCS` の
`docs/poker/` に飲まれているので、本文中のコードパスは検査されない。**
それを直すのが Task 5 である。

- [ ] **Step 6: 現時点では休眠扱いであることを実測して記録する**

```bash
cd /home/vscode/tasuki-work
node -e "import('./scripts/check-links.mjs').then(m => console.log('isLiveDoc:', m.isLiveDoc('docs/poker/adr/0001-poker-domain-direct-transition.md')))"
```

期待: `isLiveDoc: false`。**Task 5 でこれを `true` にする。**

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/poker/adr docs/adr/README.md docs/README.md
git commit -m "docs: poker の ADR 置き場を新設し直接遷移の採用を記録する（#72）

- docs/poker/adr/ を採番規約に沿って新設し 0001 と README を置く
- ADR-0016 決定 1 が MUST とする「どちらを採ったかの記録」を満たす
- 根拠は 462 行 / 5 遷移関数でイベント履歴の要求が現に無いこと
- 置き場表と文書地図から辿れるようにした"
```

---

### Task 5: 走査対象を直す（`docs/poker/adr/` を LIVE にし、timer の休眠理由を実態に合わせる）

**Files:**
- Modify: `scripts/check-links.mjs`（`LIVE_DOCS` へ 1 行追加、`DORMANT_DOCS` の timer の `reason` を書き換え）
- Modify: `scripts/check-links.test.mjs`（`describe("isLiveDoc")` にテストを追加）

**Interfaces:**
- Consumes: Task 4 が作った `docs/poker/adr/` ディレクトリ（`checkConstants()` が実在を要求する）
- Produces: `isLiveDoc("docs/poker/adr/**")` が `true` を返す状態。以後 poker の ADR 本文のコードパスがリンク検査の対象になる

**この Task が塞ぐ穴:** `DORMANT_DOCS` に `{ prefix: "docs/poker/", reason: "poker の作業記録。記録として保持する" }` があるため、**新設した現役の規範文書が「作業記録」として静かにコードパス検査から外れる**。#135 が塞いだ経路と同型の事故。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/check-links.test.mjs` の `describe("isLiveDoc", ...)` ブロック内、
既存の `assert.equal(isLiveDoc("docs/timer/adr/0009-test-conventions.md"), false);` を含む
テストの**後ろ**に、次のテストを追加する。

```js
  test("poker の ADR は現役の規範文書なので LIVE に含む", () => {
    // Given: poker の ADR は docs/poker/ 配下だが、休眠の作業記録ではなく現役の規範
    // When / Then
    assert.equal(isLiveDoc("docs/poker/adr/0001-poker-domain-direct-transition.md"), true);
  });

  test("poker の specs は休眠のまま（ADR だけを LIVE にする）", () => {
    // Given: 同じ docs/poker/ 配下でも specs は当時の作業記録
    // When / Then
    assert.equal(isLiveDoc("docs/poker/specs/001-planning-poker-mvp/spec.md"), false);
  });
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node --test scripts/check-links.test.mjs 2>&1 | tail -20
```

期待: `poker の ADR は現役の規範文書なので LIVE に含む` が **fail**
（`Expected values to be strictly equal: false !== true`）。
`poker の specs は休眠のまま` は**この時点で pass**（両方 false なので）。

- [ ] **Step 3: `LIVE_DOCS` へ 1 行足す**

`scripts/check-links.mjs` の `LIVE_DOCS` 配列で、`"docs/constitution.md",` の**直後**に
次の 1 行を挿入する。

```js
  "docs/poker/adr/",
```

**`docs/timer/adr/` は足さない。** 足すと 15 件の問題が出て終了コード 1 になる
（2026-08-17 に実測済み）。15 件すべてが epic #15 の改名前パス
（`packages/core` `apps/sync` `apps/web`）への参照で、ADR は追記のみのため
書き換えられない。

- [ ] **Step 4: テストが通ることを確認する**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node --test scripts/check-links.test.mjs 2>&1 | tail -20
```

期待: 全件 pass。特に `docs/timer/adr/0009-test-conventions.md` が `false` のままである
（既存テストが緑）ことを確認する。

- [ ] **Step 5: `DORMANT_DOCS` の timer の理由を実態に合わせる**

`scripts/check-links.mjs` の `DORMANT_DOCS` で、次の行を

```js
  { prefix: "docs/timer/", reason: "timer の作業記録。記録として保持する" },
```

次に書き換える。

```js
  {
    prefix: "docs/timer/",
    reason:
      "epic #15 の改名前パス（packages/core・apps/sync・apps/web）を含む当時の記録。" +
      "ADR は追記のみで書き換えられないため LIVE にできない（#72 E1 で 15 件を実測）",
  },
```

- [ ] **Step 6: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs; echo "exit: $?"
node --test scripts/check-links.test.mjs 2>&1 | tail -5
```

期待: どちらも成功（`exit: 0` と全件 pass）。

- [ ] **Step 7: 破壊検証 — わざと壊して赤くなることを確認する（DoD 3）**

**壊した状態をコミットしないこと。**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH

# (a) 実在しないパスを一時的に埋め込む
printf '\n実在しないパスの例: `packages/poker-core/src/no-such-file.ts`\n' \
  >> docs/poker/adr/0001-poker-domain-direct-transition.md

# (b) 壊れたこと自体を先に確認する（破壊検証は壊し方を確かめる）
grep -c "no-such-file" docs/poker/adr/0001-poker-domain-direct-transition.md
```

期待: `1`。0 なら追記に失敗しているので、赤くならなくても意味がない。

```bash
# (c) 検査が赤になることを確認
node scripts/check-links.mjs 2>&1 | grep "no-such-file"
node scripts/check-links.mjs > /dev/null 2>&1; echo "exit: $?"
```

期待: `no-such-file` を含む「実在しないパスです」の行が出て、`exit: 1`。

```bash
# (d) 元に戻す（このファイルだけを対象にする。git checkout -- . は使わない）
git checkout -- docs/poker/adr/0001-poker-domain-direct-transition.md
grep -c "no-such-file" docs/poker/adr/0001-poker-domain-direct-transition.md
node scripts/check-links.mjs > /dev/null 2>&1; echo "exit: $?"
```

期待: `grep -c` が `0`、`exit: 0`。

- [ ] **Step 8: 手動変異 — `LIVE_DOCS` からエントリを消して新テストが赤くなることを確認する（DoD 4 の代替）**

**`scripts/mutation-check.mjs` は `scripts/` を変異対象にできない。** `detectRunner()` が
`<pkg>/package.json` の `scripts.test` を読む設計で、`scripts/` に `package.json` が
無いためである（2026-08-17 実測）。ハーネスの拡張は E1 のスコープ外とし、手動で行う。

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH

# (a) 追加した LIVE_DOCS のエントリを消す
sed -i '/^  "docs\/poker\/adr\/",$/d' scripts/check-links.mjs
grep -c '"docs/poker/adr/"' scripts/check-links.mjs
```

期待: `0`（消えたことを先に確認する）。

```bash
# (b) テストが赤になることを確認
node --test scripts/check-links.test.mjs 2>&1 | grep -c "fail 1"
```

期待: `1`（`poker の ADR は現役の規範文書なので LIVE に含む` が落ちる）。
0 なら**テストが恒真化している**ので、テストの書き方を見直す。

```bash
# (c) 元に戻す
git checkout -- scripts/check-links.mjs
grep -c '"docs/poker/adr/"' scripts/check-links.mjs
node --test scripts/check-links.test.mjs 2>&1 | tail -3
```

期待: `grep -c` が `1`、テストは全件 pass。

- [ ] **Step 9: 作業ツリーが汚れていないことを確認してコミット**

```bash
cd /home/vscode/tasuki-work
git status --short
```

期待: `scripts/check-links.mjs` と `scripts/check-links.test.mjs` の 2 件のみが変更済みで、
`docs/poker/adr/0001-*.md` は変更されていない（破壊検証を戻し忘れていない）。

```bash
git add scripts/check-links.mjs scripts/check-links.test.mjs
git commit -m "fix: poker の ADR をリンク検査の走査対象に入れる（#72）

- DORMANT_DOCS の docs/poker/ が新設した現役の規範文書を飲む穴を塞ぐ
- LIVE_DOCS へ docs/poker/adr/ を足し、isLiveDoc が true を返すテストを追加
- docs/timer/adr/ は LIVE 化すると改名前パス 15 件で赤くなるため休眠のまま
  休眠の理由を「作業記録」から実態（改名前パスを含む当時の記録）へ書き直した
- 破壊検証と手動変異を実施。mutation-check.mjs は scripts/ を扱えない
  （detectRunner が package.json を要求するため）ので手動で代替した"
```

---

### Task 6: timer ADR 2 本へ実態を追記し、`App.tsx` の docstring を直す

**Files:**
- Modify: `docs/timer/adr/0007-volatile-in-memory-state.md`（末尾に追記節）
- Modify: `docs/timer/adr/0008-server-resident-ai-generation.md`（末尾に追記節）
- Modify: `apps/timer-web/src/App.tsx:39-40`（docstring 2 行）

**Interfaces:**
- Consumes: なし
- Produces: #72 の再定義された完了条件のうち「決定の手段と実装が食い違う箇所を追記で解消する」の実施結果

**なぜ 1 つの Task にまとめるか:** ADR-0008 の追記（BYOK 撤去済み）と `App.tsx` の
docstring 修正は**同じ 1 つの欠陥の両側**である。片方だけ直すと「直したつもりが片側だけ」
になる。

- [ ] **Step 1: 追記前に既存の「決定」節を控える**

```bash
cd /home/vscode/tasuki-work
sed -n '/^## 決定/,/^## /p' docs/timer/adr/0007-volatile-in-memory-state.md > /tmp/t0007-before.txt
sed -n '/^## 決定/,/^## /p' docs/timer/adr/0008-server-resident-ai-generation.md > /tmp/t0008-before.txt
wc -l /tmp/t0007-before.txt /tmp/t0008-before.txt
```

- [ ] **Step 2: `docs/timer/adr/0007` の末尾へ追記する**

```markdown

## 追記（2026-08-17・#72 E1）

**決定の最後の項目「ホストトークン・復帰トークンは `makeHandlers` のクロージャ内
`Map` に保持し、モジュールグローバルを避ける」は、現在の実装と手段が異なる。**

トークンの保持は `apps/timer-sync/src/application/token-store.ts` へ切り出されている。
同ファイルの冒頭コメントは「`handlers.ts` の `makeHandlers` が抱えていた 3 個の可変
`Map`（`hostTokens` / `resumeTokens` / `roomPassphrases`）を、ロジックを変えずに
1 モジュールへ切り出したもの（フェーズ 2・純粋な移動）」と記している。

**決定の意図（モジュールグローバルを避け、テスト間の状態汚染を防ぐ）は満たされている。**
`TokenStore` は `create-sync-server.ts` の組み立てを通じて生成され、モジュール
グローバルではない。変わったのは保持場所であって、避けるべきものではない。

本追記は経緯の記録であり、決定を覆すものではない（`docs/adr/0002` の「ADR は追記のみ」）。
```

- [ ] **Step 3: `docs/timer/adr/0008` の末尾へ追記する**

```markdown

## 追記（2026-08-17・#72 E1）

**決定の 4 項目目「BYOK は休眠残置: `apps/web/src/ai/{byok,key-storage}.ts` は UI から
撤去し将来の再有効化に備えて残す」は、その後に覆されている。**

両ファイルは #28 の T010（コミット `7d7a73c`「refactor: BYOK 系の休眠コードを撤去する」）
で削除された。現在 `apps/timer-web/src/ai/` にあるのは `no-ai.ts` と `provider.ts` の
2 本のみである（2026-08-17 実測）。

**決定の本体（サーバー常駐生成・合言葉解錠・縮退と濫用抑制）は現在も有効で、
実装も存在する** — `apps/timer-sync/src/adapters/claude-cli-problem-provider.ts` と
`apps/timer-sync/src/application/ai-limits.ts`。

**この不整合は #33（`docs/plans/adr-alignment-post-refactor/`）が取りこぼしたものである。**
#33 は #28 後の ADR 整合を扱ったが、対象を論点 1〜3（`docs/timer/adr/` の 0009・0002・0001）に
限定していた。

あわせて、`apps/timer-web/src/App.tsx` の `resolveProvider()` の docstring が削除済みの
`key-storage` に言及していたので、実装に合わせて直した（#72 E1）。

本追記は経緯の記録であり、決定を覆すものではない（`docs/adr/0002` の「ADR は追記のみ」）。
```

- [ ] **Step 4: `App.tsx` の docstring を直す**

`apps/timer-web/src/App.tsx` の 39〜40 行

```tsx
/** ローカルに API 鍵があれば BYOK、無ければ定型のみのプロバイダを返す。
 *  鍵の保存先（session/local）は key-storage が一元管理する（AI 設定モーダルと同じ経路）。 */
```

を、次の 2 行に置き換える。

```tsx
/** 常に定型バンク（NoAiProvider）を返す。BYOK は #28 T010 で撤去済み。
 *  お題の AI 生成はサーバー常駐（docs/timer/adr/0008）で、web 側は経路を持たない。 */
```

- [ ] **Step 5: 「決定」節が変わっていないことを示す**

```bash
cd /home/vscode/tasuki-work
sed -n '/^## 決定/,/^## /p' docs/timer/adr/0007-volatile-in-memory-state.md > /tmp/t0007-after.txt
sed -n '/^## 決定/,/^## /p' docs/timer/adr/0008-server-resident-ai-generation.md > /tmp/t0008-after.txt
diff /tmp/t0007-before.txt /tmp/t0007-after.txt && echo "0007 の決定節に差分なし"
diff /tmp/t0008-before.txt /tmp/t0008-after.txt && echo "0008 の決定節に差分なし"
```

期待: 両方とも「差分なし」が出る。

- [ ] **Step 6: 削除済みモジュールへの言及が消えたことを確認する**

```bash
cd /home/vscode/tasuki-work
grep -rn "key-storage" apps/ packages/ --include='*.ts' --include='*.tsx' | grep -v node_modules; echo "hits: $?"
```

期待: 何も出力されず `hits: 1`（grep が 0 件で終了コード 1）。

- [ ] **Step 7: 型検査とテストが通ることを確認する**

`App.tsx` はコメントのみの変更だが、実際に壊れていないことを確かめる。

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
corepack pnpm --filter @tasuki/timer-web typecheck
corepack pnpm --filter @tasuki/timer-web test
```

期待: どちらも成功。

- [ ] **Step 8: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs; echo "exit: $?"
```

期待: `exit: 0`。**`docs/timer/adr/` は `DORMANT_DOCS` のままなので、追記中の
`apps/timer-sync/src/application/token-store.ts` 等は検査されない。** それでも
パスは実在するものを書く（将来 LIVE 化したときに備える）。

- [ ] **Step 9: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/timer/adr/0007-volatile-in-memory-state.md \
        docs/timer/adr/0008-server-resident-ai-generation.md \
        apps/timer-web/src/App.tsx
git commit -m "docs: 実態とずれた timer ADR 2 本へ経緯を追記する（#72）

- 0007: トークン保持は application/token-store.ts へ切り出し済み
  決定の意図（モジュールグローバル回避）は満たされており覆さない
- 0008: BYOK 休眠残置の 2 ファイルは #28 T010（7d7a73c）で撤去済み
  決定の本体（サーバー常駐生成）は実装が存在し有効
- App.tsx の docstring が削除済み key-storage に言及していたので実装に合わせた
- どちらの ADR も既存の決定節は 1 文字も変えていない"
```

---

### Task 7: `docs/guides/architecture.md` を更新する

**Files:**
- Modify: `docs/guides/architecture.md`（層対応表・判断フロー・関連）

**Interfaces:**
- Consumes: Task 2 の ADR-0015、Task 3 の ADR-0016
- Produces: E4 が「どのディレクトリへ置くか」を決めるときの正本

**注意:** poker-sync の注記（標準形に従っていない旨）は **E2 の完了まで残す**。ここで消すと、
まだ再編していないのに「揃った」ように読める。

- [ ] **Step 1: 層対応表の `アダプタ` の行の直後に web 層の内部責務を足す**

現在の行

```markdown
| アダプタ | `apps/*-sync/src/adapters`・`apps/*-web` | 上のすべて |
```

の直後に、次の 3 行を挿入する。

```markdown
| web の純粋判断 | `apps/*-web` 配下の `.ts`（例: `apps/timer-web/src/ui/screen.ts`） | ドメインの型のみ（React・I/O に依存しない） |
| web の同期フック | `apps/*-web` の同期フック 1 本（例: `apps/poker-web/src/hooks/useSync.ts`） | 上のすべて ＋ WebSocket |
| web の画面 | `apps/*-web` の `.tsx` | 同期フックと純粋判断のみ（同期クライアントを直接 import しない） |
```

続けて、表の下の `**packages/rate-limit について**` の段落の**前**に、次の段落を足す。

```markdown
**web 層の 3 行について**: 責務の分離そのものを定めているのは
[`docs/adr/0015`](../adr/0015-web-layer-structure.md) です。本ガイドはその置き場を
示します。`apps/poker-web` は既にこの形（`hooks/useSync.ts` へ集約）に従っており、
`apps/timer-web` の再編は [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72) の
E4 で行います（`App.tsx` が 848 行あり、105〜377 行の `useEffect` に WS 配線が
同居しているため）。
```

- [ ] **Step 2: 判断フローに core の表現選択を足す**

判断フローの「2. **複数アプリで使う純粋ロジックか？ → core。…**」の項目の**末尾**（同項目の
最後の文「呼び出し箇所が 1 つしか無いものは抽出しません。」の直後）に、次を足す。

```markdown
   **core に置くと決めたら、次に表現を選びます。** イベントの履歴・再生が要るなら
   Decider（`decide` / `evolve`）、状態遷移だけで足りるなら直接遷移関数 ＋ `Result`
   です。選択基準と、どちらを採っても揃える点（`Result`・`index.ts` の明示列挙・
   エラー型・`Date.now()` 禁止）の正本は
   [`docs/adr/0016`](../adr/0016-core-domain-representation.md) です。
   **どちらを採ったかは、そのアプリの ADR（`docs/<app>/adr/`）へ記録します（MUST）。**
```

- [ ] **Step 3: 「一般的な方法論との対応」表を更新する**

`クリーンアーキテクチャ / ヘキサゴナル` の行の値の末尾に ADR-0015 を足す。

```markdown
| クリーンアーキテクチャ / ヘキサゴナル | 憲法 VI「依存は内向き」+ [`docs/adr/0004`](../adr/0004-sync-server-ports-and-adapters.md)（同期サーバーのポート/アダプタ標準）+ [`docs/adr/0015`](../adr/0015-web-layer-structure.md)（web 層の責務分離） |
```

`DDD（ドメイン駆動設計）` の行の値の末尾に ADR-0016 を足す。

```markdown
| DDD（ドメイン駆動設計） | 憲法 VI（ドメインの純粋性・境界）+ 本ガイドの層対応表とユビキタス言語の用語集 + [`docs/adr/0016`](../adr/0016-core-domain-representation.md)（ドメイン表現の選択制） |
```

- [ ] **Step 4: 「関連」節へ 2 本を足す**

「## 関連」の箇条書きの先頭付近（`決定の根拠:` の行の直後）に、次の 2 行を足す。

```markdown
- web 層の責務分離: [`docs/adr/0015`](../adr/0015-web-layer-structure.md)
- ドメイン表現の選択制: [`docs/adr/0016`](../adr/0016-core-domain-representation.md)
```

- [ ] **Step 5: poker-sync の注記が残っていることを確認する**

```bash
cd /home/vscode/tasuki-work
grep -n "poker-sync はまだ\|標準形にはまだ従っていません\|注記（poker-sync）" docs/guides/architecture.md
```

期待: 少なくとも 1 行ヒットする。**消えていたら戻す**（E2 が終わるまで残す）。

- [ ] **Step 6: リンク検査を通す**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH
node scripts/check-links.mjs; echo "exit: $?"
```

期待: `exit: 0`。`docs/guides/` は `LIVE_DOCS` なので、足した相対リンク
（`../adr/0015-...` `../adr/0016-...`）と本文中のコードパス
（`apps/timer-web/src/ui/screen.ts` `apps/poker-web/src/hooks/useSync.ts`）の実在が検査される。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/guides/architecture.md
git commit -m "docs: 層対応表と判断フローへ web 層と core の表現選択を反映する（#72）

- 層対応表に web の純粋判断・同期フック・画面の 3 行を足す
- 判断フローに core の表現選択（Decider か直接遷移か）の問いを足す
- 方法論対応表と関連へ ADR-0015・0016 を追加
- poker-sync の注記は E2 の完了まで残す"
```

---

### Task 8: #72 本文を再定義し、E2・E3・E4・E6 を sub-Issue として起票する

**Files:**
- Modify: GitHub Issue #72 の本文（`gh issue edit`）
- Create: GitHub Issue 4 本（E2・E3・E4・E6）

**Interfaces:**
- Consumes: Task 1〜7 のすべて（ADR が揃っていないと sub-Issue が参照先を持てない）
- Produces: #72 の完了条件と、後続 4 本の作業単位

**注意:** **E5 は欠番**である。設計時に「core 間の表現統一」として置いたが、
固有のコード作業が無いことが分かり解消した（エラー型は E2 へ、`index.ts` は E6 へ）。
番号を詰めると設計正本の「欠陥 5」の記述と対応が取れなくなるため、欠番のまま残す。

- [ ] **Step 1: 現在の #72 本文を控える**

```bash
cd /home/vscode/tasuki-work
gh issue view 72 --json body -q .body > /tmp/issue72-before.md
wc -l /tmp/issue72-before.md
```

- [ ] **Step 2: #72 の本文を書き直す**

次の本文で `gh issue edit 72 --body-file` する。**「進め方」の「1 つの PR で 1 つの
構造変更」は、ADR-0013 の既定「1 Issue = 1 PR」に合わせて書き換える。**

```markdown
> 親エピック: #67 ・ 段階: **E / E**

## 目的

段階 A（#68）で決めた指針を、実際のコードに適用します。
**利用者から見える振る舞いは一切変えません。**

## 完了条件（2026-08-17 再定義）

**現在も有効な ADR の決定が、実際のコードと一致している。一致しない箇所は、
コードを直すか、ADR へ追記して経緯を残すかのどちらかで解消されている。**

- 改名前のパス表記など「当時の記録として正しい」記述は一致の対象外とします
  （ADR は追記のみであり、書き換えは規則違反）
- `Superseded` が宣言済みの ADR（`docs/timer/adr/0005` `0010`）は対象外です
- 決定の手段と実装が食い違う箇所は、**本 Issue の中で** ADR へ追記して解消します

**再定義の理由**: 起票時（2026-08-05）の完了条件は「ADR に書いた構造と、実際の
コードが一致している」でしたが、`docs/timer/adr/` は epic #15 の改名前パスで
書かれているため、字義どおりでは永久に満たせません。後続 Issue へ切り出すと
新しい振る舞いの実装が遅れるため、本 Issue の中で解消します。

## 実測（2026-08-17・main `4449f20`）

ADR 24 本（横断 14 ＋ timer 10）について代表的な決定を測り、**不一致 5 件**を確認しました。

| ADR | 不一致 | 宛先 |
|---|---|---|
| `docs/adr/0004` | poker-sync が `ports/` `adapters/` `application/` を持たない | E2 |
| `docs/adr/0006` | SC029 15 / SC030 3 / SC031 3 / SC032 84.2% | E6 |
| `docs/timer/adr/0002` | `packages/timer-core/src/problem.ts:70` の `Date.now()` | E3 |
| `docs/timer/adr/0007` | トークン保持が `application/token-store.ts` へ切り出し済み | **E1** |
| `docs/timer/adr/0008` | BYOK 休眠残置の 2 ファイルが `7d7a73c` で撤去済み | **E1** |

## 段階

| | 内容 | Issue |
|---|---|---|
| E1 | 規範の空白を埋める＋現行 ADR の実態整合 | （本 Issue で実施） |
| E2 | poker-sync のポート/アダプタ再編＋エラー型の是正 | （起票する） |
| E3 | ドメインの副作用除去 | （起票する） |
| E4 | web 層の再編 | （起票する） |
| E6 | 公開面とテスト規約の解消 | （起票する） |

**E5 は欠番**です（core 間の表現統一として置いたが、固有のコード作業が無いため解消）。

## 進め方

**1 Issue = 1 PR**（`docs/adr/0013` / `docs/guides/pr-granularity.md` の既定）。
段階ごとに sub-Issue を立て、各 1 本の PR で閉じます。分割の根拠は同ガイドの
理由 1（独立して revert したい単位が複数ある）と理由 3（危険度の異なる変更が
混ざっている）です。

各段階で必ず行うこと:

- [ ] 変更前に**特性テスト**があることを確認する（無ければ先に足す）
- [ ] 実装を書き換えたら、**既存テストが恒真化していないか変異検査で確かめる**
- [ ] 公開 URL・プロトコル・画面の挙動が変わっていないことを示す
- [ ] DoD 8 項目を満たす

## 設計正本

`docs/superpowers/specs/2026-08-17-adr-alignment-e1-design.md`

## スコープ外

- 振る舞いを変える改善（機能追加・UI 変更）→ 別 Issue に切り出す
- E2E テストの新設 → #142
```

- [ ] **Step 3: E2 を起票する**

```bash
cd /home/vscode/tasuki-work
gh issue create --title "E2: poker-sync をポート/アダプタ構成へ再編し、エラー型を揃える" --body '...'
```

本文は次のとおり。

```markdown
> 親: #72 ・ 段階: **E2** ・ 危険度: **高**

## 背景

`docs/adr/0004` は同期サーバーの標準構成として timer-sync 型（ポート/アダプタ）を
**MUST** と定め、適用先を #72 と名指ししています。`apps/poker-sync/src` は
`client-key-safety.ts` / `config.ts` / `listening-log.ts` / `rooms.ts` / `server.ts` の
5 ファイル 660 行で、`server.ts`（426 行）に WS ハンドリング・ID 生成（`randomBytes`）・
ルーム操作・心拍・ディスパッチが同居しています（2026-08-17 実測）。

あわせて `docs/adr/0016` 決定 2 の項目 3（ドメインエラーは判別子と機械可読な詳細のみを
持つ）の是正を**同じ PR で**行います。`apps/poker-sync/src/server.ts:244` と `:333` が
`result.error.message` をそのまま WS へ流しており、触るファイル群が再編と同一のため
分けると二度触ることになります（`docs/guides/pr-granularity.md`）。

## 振る舞い（EARS）

1. ルーム作成を要求されたとき、システムは再編前と同一の `joined` メッセージを返すこと。
2. 投票を受け付けられない状態でカードを投じられた場合、システムは再編前と同一の
   `code` と同一の日本語文言を持つエラーを返すこと。
3. 参加者が再接続したとき、システムは再編前と同一のスナップショットを配信すること。
4. 不正なメッセージを受信した場合、システムは `invalid-message` エラーを返し、
   接続を維持すること。

## 完了条件

- [ ] `apps/poker-sync/src` が `ports/` `adapters/` `application/` を持つ
- [ ] 組み立てが `create-sync-server.ts` 相当の 1 関数に集約され、`server.ts` と
      テストの両方がそれを経由する（`docs/adr/0004` 決定 4 の MUST）
- [ ] `packages/poker-core` の `RoundError` `RoomError` が `message` を持たず、
      文言は poker-core 内の文言生成関数が担う
- [ ] **WS で送る文字列が 1 文字も変わっていない**
- [ ] `apps/poker-sync/tests` の 84 件 / 14 ファイルが全緑
- [ ] 変異検査で既存テストが恒真化していないことを確認した

## 入れる機械検査

`apps/poker-sync/src/create-sync-server.ts` が実在し、`server.ts` とテストの両方が
それを経由することを検査する。**この Issue の PR で追加し、わざと壊して赤くなることを
確認する**（憲法 原則 VII）。

## 注意

- **ログ出力を増やさないこと。** `docs/adr/0012` は poker-sync へのロガー導入を
  「poker 側のログ出力が `listening` 以外にも増えるとき」まで繰り越しています。
  増やすとこの条件が発火し、ロガー導入が本 Issue の必須作業になります。
- **振る舞い不変の証拠を E2E に期待しないこと。** poker の E2E は
  `e2e/specs/poker.spec.ts` の 2 件のみです。主たる特性テストは
  `apps/poker-sync/tests` の 84 件と `packages/poker-core` の 48 件です。

## 設計正本

`docs/superpowers/specs/2026-08-17-adr-alignment-e1-design.md`
```

- [ ] **Step 4: E3 を起票する**

```markdown
> 親: #72 ・ 段階: **E3** ・ 危険度: **中**

## 背景

`packages/timer-core/src/problem.ts:70` が `Math.abs(Date.now()) % candidates.length` で
定型お題を選んでいます。これは次の 3 つに違反します。

- 憲法 原則 VI「I/O・時計・乱数などの副作用はアダプタとして境界に置き、ドメインへは注入する（MUST）」
- `docs/timer/adr/0002`「時刻は引数 `now` として注入し、`Date.now()` をドメイン内で呼ばない」
- `docs/adr/0016` 決定 2 の項目 4「ドメイン内で `Date.now()` / `Math.random()` を呼ばない（MUST NOT）」

**両 core を grep した結果、ドメイン内の副作用はこの 1 箇所だけです**（2026-08-17 実測）。

## 振る舞い（EARS）

1. 定型お題を要求されたとき、システムは変更前と同じ候補集合から 1 件を選ぶこと。
2. 候補が 0 件の場合、システムは変更前と同じフォールバックお題を返すこと。

## 完了条件

- [ ] `problem.ts` が `Date.now()` を呼ばず、選択の元になる値を引数で受け取る
- [ ] 呼び出し側（`apps/timer-sync` のアダプタ）まで配線されている
- [ ] `grep -rn "Date\.now()\|Math\.random()" packages/*/src` が 0 件
- [ ] 変異検査で既存テストが恒真化していないことを確認した

## 入れる機械検査

`packages/*-core` 配下に `Date.now()` / `Math.random()` が 0 件であることを検査する。
**この Issue の PR で追加し、わざと壊して赤くなることを確認する。**

## 設計正本

`docs/superpowers/specs/2026-08-17-adr-alignment-e1-design.md`
```

- [ ] **Step 5: E4 を起票する**

```markdown
> 親: #72 ・ 段階: **E4** ・ 危険度: **高** ・ 前提: E1（`docs/adr/0015`）

## 背景

`docs/adr/0015` は web 層を「純粋関数・同期フック・画面」の 3 責務に分けることを
MUST と定めました。`apps/timer-web/src/App.tsx` は **848 行**で、`useState` 12 個・
`useRef` 9 個・**105〜377 行の 272 行 `useEffect` 1 本**に WS 配線が同居しています。

**`apps/poker-web` は既に準拠しています**（`App.tsx:3` が `usePokerSync` を経由し、
`.tsx` に `WebSocket` の直接使用が無い）。本 Issue の対象は timer-web 側です。

## 振る舞い（EARS）

1. ルームへ参加したとき、システムは再編前と同一の画面へ遷移すること。
2. 接続が切れている間、システムは再編前と同一の接続状態表示を出すこと。
3. 交代が起きたとき、システムは再編前と同一の通知を表示すること。
4. セッションを失った場合、システムは再編前と同一の復帰導線を示すこと。

## 完了条件

- [ ] `App.tsx` が同期クライアント（`sync/client`）を直接 import していない
- [ ] WS の接続状態とメッセージ配線が同期フック 1 本に集約されている
- [ ] `e2e/specs/timer.spec.ts` と `timer-a11y.spec.ts` が全緑
- [ ] 変異検査で既存テストが恒真化していないことを確認した

## 入れる機械検査

`sync/client` を import してよいファイルの**許可リスト**（同期フック 1 本のみ）。
**素朴な grep では書けません** — 同期フック自身は import してよいためです。
**無状態の許可リスト方式**で書き、手書きの字句解析は採りません（過去 3 度、
検出漏れを作った実績があります）。現状 `sync/client` を import しているのは
`apps/timer-web/src/App.tsx` の 1 ファイルのみです（2026-08-17 実測）。

## 設計正本

`docs/superpowers/specs/2026-08-17-adr-alignment-e1-design.md`
```

- [ ] **Step 6: E6 を起票する**

~~~markdown
> 親: #72 ・ 段階: **E6** ・ 危険度: **中〜高** ・ 前提: E2・E4 の完了

## 背景

構造監査の未達指標を 0 にします（2026-08-17 実測・main `4449f20`）。

```
SC029 | 15                    | 0    | 未達
SC030 | 3                     | 0    | 未達
SC031 | 3                     | 0    | 未達
SC032 | 1132/1345（84.2%）    | 100% | —
SC039 | 分岐 0 / データ 0 行 / 公開記号 34 件 | 0 | —
```

SC029 が 7 → 15、SC032 が 97.3% → 84.2% へ増えているのは #135 が走査対象を
広げた結果であって、退化ではありません。

あわせて `docs/adr/0016` 決定 2 の項目 2（`index.ts` は公開記号を明示列挙する。
`export *` を使わない）を解消します。**`export *` は実装全体で
`packages/poker-core/src/index.ts` の 6 行だけです**（`packages/*/src` と
`apps/*/src` を全走査して確認）。SC039c（他ファイルから直接 import されていない
公開記号 34 件）と同じ「公開面」の作業なので、ここにまとめます。

**E2 と E4 の後に置くのは、両者がテストを書き換えるためです。** 先にやると
SC032 の 213 件が二度手間になります。

## 完了条件

- [ ] SC029 / SC030 / SC031 が 0
- [ ] SC032 が 100%
- [ ] SC039 の公開記号が 0 件
- [ ] `grep -rn "export \*" packages/*/src apps/*/src` が 0 件
- [ ] `node scripts/audit-structure.mjs` が全指標 PASS

## 入れる機械検査

`packages/*-core/src/index.ts` に `export *` が 0 件であることを検査する。
構造監査 SC029〜SC039 は既存のものを使う（新設不要）。

## 設計正本

`docs/superpowers/specs/2026-08-17-adr-alignment-e1-design.md`
~~~

- [ ] **Step 7: 起票結果を確認する**

```bash
cd /home/vscode/tasuki-work
gh issue list --search "E2: poker-sync OR E3: OR E4: OR E6:" --limit 10
gh issue view 72 --json body -q .body | head -20
```

期待: 4 本が open で並び、#72 の本文が再定義後のものになっている。

- [ ] **Step 8: #72 に sub-Issue の番号を書き戻す**

Step 3〜6 で採番された Issue 番号を、#72 本文の「段階」表の「Issue」欄へ入れる。

```bash
cd /home/vscode/tasuki-work
gh issue edit 72 --body-file /tmp/issue72-final.md
gh issue view 72 --json body -q .body | grep -A6 "^| E1"
```

期待: E2・E3・E4・E6 の行に実際の Issue 番号（`#NNN`）が入っている。

- [ ] **Step 9: 最終確認と PR の作成**

```bash
cd /home/vscode/tasuki-work
export PATH=$HOME/.local/bin:$HOME/.bun/bin:$PATH

# 完了条件 4: packages/ は 0 行、apps/ は App.tsx の docstring 2 行のみ
git diff --stat main...HEAD -- packages/
git diff --stat main...HEAD -- apps/
git diff main...HEAD -- apps/

# 検査一式
node scripts/check-links.mjs; echo "check-links: $?"
node --test $(node scripts/list-scan-targets.mjs script-tests); echo "script-tests: $?"
node scripts/audit-structure.mjs > /dev/null; echo "audit-structure: $?"
node scripts/audit-log-hygiene.mjs > /dev/null; echo "audit-log-hygiene: $?"
```

期待:
- `packages/` の差分は **0 行**（何も出力されない）
- `apps/` の差分は `App.tsx` の **2 行の書き換えのみ**
- 4 つの検査がすべて終了コード 0

```bash
git push -u origin docs/72-adr-alignment-e1
gh pr create --title "docs: 規範の空白を埋め、現行 ADR と実態のずれを解消する（#72 E1）" --body-file <(cat <<'PRBODY'
## 概要

#72 の E1。ADR に沿って直すための形を決め切り、現行 ADR と実態のずれを解消しました。
コードの構造は変えていません。

## 変更内容

- `docs/adr/0007` へ追記 — 「利用者」にテストの差し替えを数える（恒真化を防ぐ条件つき）
- `docs/adr/0015` を新設 — web 層を「純粋関数・同期フック・画面」に分ける
- `docs/adr/0016` を新設 — ドメイン表現は選択制。揃える点 4 つを MUST 化
- `docs/poker/adr/` を新設 — poker が直接遷移を採る根拠を記録
- `docs/timer/adr/0007` `0008` へ追記 — 実態とずれていた 2 件の経緯を記録
- `apps/timer-web/src/App.tsx` — 削除済み `key-storage` に言及した docstring を修正
- `scripts/check-links.mjs` — 新設した現役の規範文書が休眠扱いされる穴を塞ぐ
- `docs/guides/architecture.md` — 層対応表と判断フローへ反映
- #72 本文の完了条件を再定義し、E2・E3・E4・E6 を起票

## テスト方法

- [x] `node scripts/check-links.mjs` が終了コード 0
- [x] `node --test scripts/check-links.test.mjs` が全緑
- [x] 破壊検証: `docs/poker/adr/` に壊れたパスを置くと終了コード 1 になることを実測
- [x] 手動変異: `LIVE_DOCS` からエントリを消すと新テストが赤くなることを実測
- [x] `git diff --stat main...HEAD -- packages/` が 0 行
- [x] `apps/` の差分は `App.tsx` の docstring 2 行のみ

## DoD

1. ユニットテスト全緑 — ✅ `scripts/check-links.test.mjs` にテストを追加
2. E2E — 該当なし（利用者の経路は変わらない）
3. 新しい検査を壊して赤くなる確認 — ✅ 上記の破壊検証
4. 変異検査 — ✅ 手動で代替。`mutation-check.mjs` は `scripts/` を扱えない
   （`detectRunner()` が `<pkg>/package.json` を要求し、`scripts/` に無いため）
5. 実経路での確認 — 該当なし（画面・プロトコルは不変）
6. Tidy First — 該当なし
7. 文書への影響 — 本 PR そのもの
8. Issue の完了条件 — ✅ 再定義した完了条件を #72 本文に記載

## 既知の残り

- `mutation-check.mjs` が `scripts/` 配下を変異対象にできない件は本 PR では直していません
  （ハーネスの拡張は E1 のスコープ外）。
PRBODY
)
```

---

## Self-Review

**1. Spec coverage:** 設計正本の各節を突き合わせた。

| 設計正本の節 | 実装するタスク |
|---|---|
| ① ADR-0007 への追記 | Task 1 |
| ② ADR-0015（web 層） | Task 2 |
| ③ ADR-0016（core 表現） | Task 3 |
| ④ `docs/poker/adr/0001` | Task 4 |
| ⑤ `architecture.md` の更新 | Task 7 |
| ⑥ #72 の再定義と起票 | Task 8 |
| ⑦ timer ADR 0007・0008 への追記 | Task 6 |
| ⑧ `App.tsx` の docstring | Task 6 |
| 足回り（`check-links` の走査対象） | Task 5 |
| 完了条件 1（決定節の差分 0 行） | Task 1 Step 4・Task 6 Step 5 |
| 完了条件 2（索引から到達） | Task 2 Step 4・Task 4 Step 5 |
| 完了条件 3（破壊検証） | Task 5 Step 7 |
| 完了条件 4（`packages/` 0 行） | Task 8 Step 9 |
| 完了条件 5（timer ADR の追記） | Task 6 Step 5 |
| 完了条件 6（`key-storage` が 0 件） | Task 6 Step 6 |
| 完了条件 7（#72 再定義と起票） | Task 8 |

**漏れなし。**

**2. Placeholder scan:** 「TBD」「後で」「同様に」「適切に」の類は無い。ADR 本文・
テストコード・コマンドはすべて実物を書いた。Task 8 の `gh issue create --body '...'` だけは
本文をコマンド行に埋め込まず直後に全文を示す形にしたが、内容は省略していない。

**3. Type consistency:** Task 5 で使う `isLiveDoc` は `scripts/check-links.mjs` の
既存 export（`check-links.test.mjs:12` で既に import 済み）。`LIVE_DOCS` `DORMANT_DOCS`
`classifyDocs` も同様。新しい関数・型は導入していない。

**4. 順序の依存:** Task 4（`docs/poker/adr/` の作成）は Task 5（`LIVE_DOCS` への追加）より
**前に**なければならない。`checkConstants()` が `LIVE_DOCS` のパスの実在を要求するため。
計画の順序はこれを満たしている。
