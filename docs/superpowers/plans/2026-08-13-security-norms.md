# セキュリティの規範を定め、情報の露出を塞ぐ — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** セキュリティの規範を三層（憲法・ADR・ガイド）へ据え、資格情報がログへ漏れる経路を塞ぎ、それが守られていることを CI が機械的に見る状態にする。

**Architecture:** ログ出力を「型で守られた 1 本の経路」へ集約する。生の `string` はロガのフィールドに渡せない型にし、ルームコードはプロセス起動ごとのソルトで HMAC した相関 ID に置き換える。抜け道（`publicText`）は 1 モジュールへ閉じ込め、`scripts/audit-log-hygiene.mjs` が行単位の許可マーカーを要求する。検査は最初から fail-closed に作る。

**Tech Stack:** TypeScript 6 / Node 22 / Bun（timer-sync のテストランナー）/ vitest（poker-sync）/ node:test（検査スクリプト）/ Valibot / neverthrow / GitHub Actions / Caddy

## Global Constraints

- 設計の正本は `docs/superpowers/specs/2026-08-13-security-norms-design.md`。**数値はその §2 が正本**であり、本計画・ADR・ガイドへ転記しない（`docs/adr/0002` 二重正本の禁止）
- 作業ディレクトリは **`/home/vscode/tasuki-work`**（overlay）。`/workspaces/claym/local/Tasuki` では作業しない（9p マウントでテストが約 48 倍遅い）
- ブランチは `main` から切る。**積み上げ PR にする場合も base は都度 `main` へ張り替える**（#70 で空マージコミットの残骸が生じた）
- TDD 必須（憲法 I）。テスト → 失敗確認 → 実装 → 成功確認 → コミットの順を崩さない
- 新しい検査を足したら**わざと壊して赤になることを確認する**（憲法 VII）
- 1 PR = 1 論理変更（憲法 IX）。DoD（`docs/guides/definition-of-done.md`）を満たしてからマージ
- 機能系の記述は EARS（`docs/guides/ears-writing.md` の 5 型・日本語テンプレート）
- **本番デプロイはしない。** 明示指示があるまで実行しない
- 変異検査は作業ツリーが clean でないと動かない。コミットしてから回す

---

## ファイル構成

### 新規作成

| ファイル | 責務 |
|---|---|
| `docs/adr/0011-threat-model-and-data-classification.md` | 何を守るか。データ 4 分類と脅威 S1〜S13 |
| `docs/adr/0012-logging-secrets-and-disclosure.md` | どう守るか。決定 D1〜D12 |
| `docs/guides/security.md` | 今日どう書くか。ロガの使い方・新しい値を足す手順 |
| `apps/timer-sync/src/application/log/log-safe.ts` | ログへ出してよい値の型（`LogSafe` / `LogField` / `publicText`） |
| `apps/timer-sync/src/application/log/vocabulary.ts` | `publicText` を使う唯一の場所。既知の語彙を `LogSafe` として定義 |
| `apps/timer-sync/src/application/log/ref-encoder.ts` | 相関 ID の生成（HMAC・ソルト注入） |
| `apps/timer-sync/src/application/log/logger.ts` | 整形と `Logger` インターフェース（純粋） |
| `apps/timer-sync/src/adapters/console-log-sink.ts` | 唯一の実出力口。ここだけが `console` を呼ぶ |
| `apps/timer-sync/test/log/log-format.test.ts` | 整形・サニタイズのテスト |
| `apps/timer-sync/test/log/ref-encoder.test.ts` | 相関 ID のテスト |
| `apps/timer-sync/test/log/reclaim-log.test.ts` | 回収ログにルームコードが出ないことのテスト |
| `apps/timer-sync/test/passphrase-compare.test.ts` | 定数時間比較の振る舞いのテスト |
| `scripts/audit-log-hygiene.mjs` | ログ衛生の検査（fail-closed） |
| `scripts/audit-log-hygiene.test.mjs` | 上の自己テスト（node:test） |
| `scripts/mutations/m10-ref-encoder-passthrough.patch` | 変異 10 |
| `SECURITY.md` | 脆弱性報告の窓口 |

### 変更

| ファイル | 変更内容 |
|---|---|
| `.specify/memory/constitution.md` | 原則 XI の追加・Sync Impact Report の更新（2.0.0 → 2.1.0） |
| `AGENTS.md` | 憲法見出しへ XI を追記 |
| `docs/README.md` | 文書地図にセキュリティを追加 |
| `docs/adr/README.md` | 一覧へ 0011・0012 を追加 |
| `docs/guides/ears-writing.md` | 実例のルームコード文字数を現行化 |
| `docs/plans/archive/tdd-mob-pro-timer-spec-v3.0-final.md` | 7 節に ADR 0011 への昇格注記 |
| `apps/timer-sync/src/create-sync-server.ts` | 回収ログを相関 ID へ・logger を配線 |
| `apps/timer-sync/src/server.ts` | 6 箇所を logger へ・未捕捉例外ハンドラ |
| `apps/timer-sync/src/adapters/ws-adapter.ts` | 1 箇所を logger へ |
| `apps/timer-sync/src/application/problem-delegation.ts` | 2 箇所を logger へ・`requestId` を相関 ID へ |
| `apps/timer-sync/src/application/command-handlers/room-join.ts` | パスフレーズ比較を定数時間へ |
| `apps/poker-sync/src/server.ts` | `listening` 行に許可マーカーのみ（**形式は変えない**） |
| `apps/timer-web/package.json` | `dompurify` を削除 |
| `.github/workflows/ci.yml` | `permissions` 宣言・Actions の SHA ピン・新検査の追加 |
| `renovate.json` | Actions の digest 維持プリセットを追加 |
| `deploy/README.md` | 秘密の置き場・配り方・失効手順の節を追加 |
| `deploy/caddy/tasuki.conf` | CSP ヘッダ |
| `scripts/mutation-check.mjs` | 変異 10 を追加 |

### PR の割り方

| PR | 内容 | タスク | 依存 |
|---|---|---|---|
| PR-1 | 規範文書 | 1〜4 | なし（文書のみ・CI は 20 秒） |
| PR-2 | ログ経路の一本化 | 5〜9 | なし |
| PR-3 | ログ衛生の検査 | 10〜12 | **PR-2**（ロガが無いと検査対象が定まらない） |
| PR-4 | 個別の塞ぎ | 13〜14 | なし |
| PR-5 | 供給網と公開窓口 | 15〜16 | なし |
| PR-6 | CSP | 17 | なし |

---

## Task 1: 憲法へ原則 XI を追加する

**Files:**
- Modify: `.specify/memory/constitution.md`
- Modify: `AGENTS.md:9`, `AGENTS.md:20`, `AGENTS.md:31`

**Interfaces:**
- Consumes: なし
- Produces: 原則 XI の条文。ADR 0011・0012 とガイドがこれを参照する

- [ ] **Step 1: 原則 X の直後へ原則 XI を挿入する**

`.specify/memory/constitution.md` の `### X. 抽象は実需で` のブロック末尾（`## Governance` の直前）へ次を挿入する。

```markdown
### XI. 秘密と個人情報を持ち込まない

預かる値は分類したうえで、必要な場所にだけ置く。

- サーバーが保持する秘密（トークン・鍵・合言葉）は環境変数のみに置く（MUST）
- 秘密・資格情報・個人に紐づく情報をログへ出してはならない（MUST NOT）
- ログ出力の経路は 1 本に集約し、規範が守られていることを機械的に検査する
  （MUST）
- 個人を識別しうる値を、目的に必要な期間を超えて保持してはならない（MUST NOT）
- 新しい入力・保持・出力を足すときは、`docs/adr/0011` のデータ分類のどれに
  当たるかを決めてから実装する（MUST）
```

- [ ] **Step 2: 版と Sync Impact Report を更新する**

末尾の版表記を書き換える。

```markdown
**Version**: 2.1.0 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-08-13
```

先頭の Sync Impact Report コメントの冒頭へ、既存の 2.0.0 分を残したまま次を足す。

```markdown
- Version change: 2.0.0 → 2.1.0（MINOR: 原則 XI の追加。既存原則の変更・削除は無い）
- Rationale: #136（セキュリティの規範）。脅威モデルは
  docs/plans/archive/tdd-mob-pro-timer-spec-v3.0-final.md の 7 節に実在したが、
  archive の設計文書に埋もれ実装とも乖離していた。横断 ADR（0011・0012）へ
  昇格・現行化し、その拠りどころを憲法へ据える。
- Added principles:
  - XI. 秘密と個人情報を持ち込まない
- Templates requiring updates:
  - OK .specify/templates/plan-template.md — 動的参照のみ。変更不要
  - OK .specify/templates/spec-template.md — 憲法への直接参照なし。変更不要
  - OK .specify/templates/tasks-template.md — 憲法への直接参照なし。変更不要
  - OK AGENTS.md — 見出し同期済み（原則 I〜XI の 11 本一致）
```

> **既存の 2.0.0 分の記述は削除しない。** 改版の履歴は積み上げる。

- [ ] **Step 3: AGENTS.md の見出しを同期する**

3 箇所を直す。

1. 9 行目 `その見出し（原則 I〜X）を転記したものに過ぎない。` → `その見出し（原則 I〜XI）を転記したものに過ぎない。`
2. 20 行目 `- X. 抽象は実需で` の次の行へ `- XI. 秘密と個人情報を持ち込まない` を追加
3. 31 行目 `何を守るか（原則 I〜X）` → `何を守るか（原則 I〜XI）`

- [ ] **Step 4: 同期が取れていることを機械で確認する**

Run:
```bash
cd /home/vscode/tasuki-work && diff \
  <(grep -oE '^### [IVX]+\. .+' .specify/memory/constitution.md | sed 's/^### //') \
  <(grep -oE '^- [IVX]+\. .+' AGENTS.md | sed 's/^- //') && echo "同期 OK"
```
Expected: `同期 OK`（差分が出ない）

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add .specify/memory/constitution.md AGENTS.md
git commit -m "docs: 憲法に原則 XI（秘密と個人情報を持ち込まない）を追加

- 版を 2.0.0 から 2.1.0 へ（MINOR: 原則の追加）
- AGENTS.md の憲法見出しを同期（原則 I〜XI の 11 本一致）
- 中身は docs/adr/0011・0012 へ委ねる

Refs #136"
```

---

## Task 2: ADR 0011（脅威モデルとデータ分類）を新設する

**Files:**
- Create: `docs/adr/0011-threat-model-and-data-classification.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/plans/archive/tdd-mob-pro-timer-spec-v3.0-final.md`

**Interfaces:**
- Consumes: 憲法 原則 XI（Task 1）
- Produces: データ 4 分類（秘密 / 資格情報 / 個人に紐づく / 公開可）と脅威 S1〜S13。ADR 0012 とガイドがこれを参照する

- [ ] **Step 1: ADR 0011 を書く**

`docs/adr/template.md` の形式（背景 / 決定 / 影響 / この ADR で決めないこと）に従う。次を必ず含める。

- **ステータス**: Accepted（2026-08-13）
- **関連**: #136 / epic #67 / 設計正本 `docs/superpowers/specs/2026-08-13-security-norms-design.md` / `docs/timer/adr/0005`（Superseded） / `docs/timer/adr/0008`（秘密ゼロの放棄）
- **背景**: 脅威モデルは archive の旧 spec に実在したが、置き場と鮮度に問題があった。本 ADR は新規制定ではなく**昇格と現行化**である
- **決定 1: データ 4 分類**。設計正本の 3.3 節の表を転記する。**該当する値の一覧・件数は正本（設計正本 2.2 節）を参照させ、ここに重複させない**
- **決定 2: 脅威 S1〜S13**。設計正本 3.4 節の表を転記する。S12（管理面の露出）では `/admin/rooms` のルームコード返却を**意図的な露出**として、その守り（127.0.0.1 bind・定数時間トークン・未設定時は存在秘匿）とセットで明記する
- **決定 3: 表示名は「ログへ出さない」が「配信はする」**。分類は保持と出力の規律であって機能の否定ではない
- **決定 4: ルームコードのエントロピー下限**（設計正本 3.5 節 D11）。下限は「想定される総当たり速度で全探索に要する時間」で定義する。**目標値と前提レート（#103 実装前 / 実装後）をここで明記する**。現行の `slug-????` 経路が下限を満たさないこと、対応は振る舞いの変更を伴うため別 Issue とすることを記録する
- **影響**: #103 が S1 の主防御であること。提案 #91 へ送った項目（AI 子プロセスの権限・入力の列挙検証）とその受容判断（設計正本 3.4.1 節）
- **この ADR で決めないこと**: ログの具体的な扱い（→ 0012）・認証認可の作り込み・脆弱性検査の方式（#69）

- [ ] **Step 2: `docs/adr/README.md` の一覧へ追加する**

`| [0010](./0010-trust-policy.md) | trustPolicy による信頼証跡の降格拒否 | Accepted |` の次の行へ。

```markdown
| [0011](./0011-threat-model-and-data-classification.md) | 脅威モデルとデータ分類 | Accepted |
```

- [ ] **Step 3: archive へ昇格注記を足す**

`docs/plans/archive/tdd-mob-pro-timer-spec-v3.0-final.md` の `## 7. セキュリティ設計` の直下へ挿入する。**本文は削除しない。**

```markdown
> **この節は `docs/adr/0011`（脅威モデルとデータ分類）へ昇格しました（2026-08-13・#136）。**
> 現行の脅威モデルは ADR 0011 を参照してください。以下は当時の記録として残します。
> S1（既定 role）・S4（DOMPurify）・S6（秘密ゼロ）は現行の実装と食い違っています。
```

- [ ] **Step 4: リンク検査を通す**

Run: `cd /home/vscode/tasuki-work && git add -A && node scripts/check-links.mjs`
Expected: `リンク検査 OK（走査 N ファイル）`・終了コード 0

> `check-links.mjs` は `git ls-files` を見る。**`git add` するまで新規ファイルは走査されない。**

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/adr/0011-threat-model-and-data-classification.md docs/adr/README.md docs/plans/archive/tdd-mob-pro-timer-spec-v3.0-final.md
git commit -m "docs: ADR 0011（脅威モデルとデータ分類）を新設

- archive の旧 spec の脅威モデルを横断 ADR へ昇格し、実装に合わせて現行化
- データ分類を 4 段に定義（秘密 / 資格情報 / 個人に紐づく / 公開可）
- S12（管理面の露出）・S13（CI の供給網）を新設
- 旧本文には昇格注記のみを足し、記録として残す

Refs #136"
```

---

## Task 3: ADR 0012（ログ・秘密・開示の取り扱い）を新設する

**Files:**
- Create: `docs/adr/0012-logging-secrets-and-disclosure.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: ADR 0011 のデータ分類（Task 2）
- Produces: 決定 D1〜D12。Task 5 以降の実装はすべてこの ADR を根拠にする

- [ ] **Step 1: ADR 0012 を書く**

設計正本 3.5 節の D1〜D11 を決定として書く。**次の 3 点は理由まで書く**（決定だけ書くと、後で誰かが「部分表示のほうが便利だ」と戻す）。

- **D2 マスキングは部分表示を採らない**: ルーム名つきのコードは推測困難な部分が短く、一部が漏れると探索空間が実用的な範囲へ落ちる。相関 ID はプロセス起動ごとのソルトで導出するため**再起動をまたぐと相関が切れる**が、揮発設計（憲法 III）と整合するので受け入れる
- **D3 IP**: ハッシュ化して窓の間だけ保持。**Caddy のアクセスログは引き続き出さない**（本番で不在を実測済み。「不在」ではなく「決定」とする）
- **D7 CSP**: `style-src 'unsafe-inline'` を**外す条件**を明記する（React の `style` プロパティによるインラインスタイルを CSS 変数へ寄せたら外せる）。`connect-src` は `'self'` で足りる（WS は同一オリジン）

さらに次を D12 として追記する（設計正本の執筆後に判明した事項）。

- **D12 ログ行への注入を防ぐ**: 利用者由来の文字列はロガのフィールドへ生のまま渡さない。**整形の側で制御文字（CR・LF・タブ）を必ず除去する。** `requestId` は境界スキーマに最大長も文字種の制限も無いため、そのまま出すと journal に偽の行を作れる。呼び出し側の善意に頼らない

- [ ] **Step 2: `docs/adr/README.md` の一覧へ追加する**

```markdown
| [0012](./0012-logging-secrets-and-disclosure.md) | ログ・秘密・開示の取り扱い | Accepted |
```

- [ ] **Step 3: リンク検査を通す**

Run: `cd /home/vscode/tasuki-work && git add -A && node scripts/check-links.mjs`
Expected: OK・終了コード 0

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/adr/0012-logging-secrets-and-disclosure.md docs/adr/README.md
git commit -m "docs: ADR 0012（ログ・秘密・開示の取り扱い）を新設

- D1〜D11 を記録（ログ経路の一本化・相関 ID・IP・秘密の配り方・
  エラー開示・クライアント保存の考え方・CSP・CI の供給網・公開窓口・
  AI 子プロセス・コードのエントロピー下限）
- D12 を追加: requestId に最大長も文字種の制限も無く、ログ行への
  注入が成立するため、整形の側で制御文字を除去する

Refs #136"
```

---

## Task 4: セキュリティガイドと文書地図を整える

**Files:**
- Create: `docs/guides/security.md`
- Modify: `docs/README.md`
- Modify: `docs/guides/ears-writing.md:19`

**Interfaces:**
- Consumes: ADR 0011・0012（Task 2・3）
- Produces: 日々参照する入口。Task 5 以降で作るロガの使い方をここに書く

- [ ] **Step 1: `docs/guides/security.md` を書く**

ガイドは「今日どう書くか」。決定の根拠は ADR へ参照させ、二重正本を作らない。次を含める。

- **新しい値を足すときの手順**: (1) `docs/adr/0011` のデータ 4 分類のどれかを決める → (2) その分類の扱い（保持・出力・比較）に従う → (3) ログへ出す必要があるなら相関 ID を使う
- **ロガの使い方**: `logger.info("event", { key: value })`。値は `number | boolean | LogSafe` のみ。ルームコードは `refEncoder.room(code)`、`requestId` は `refEncoder.request(id)` を通す
- **やってはいけないこと**: `publicText()` を `apps/timer-sync/src/application/log/vocabulary.ts` の外で呼ぶ / `console` を直接呼ぶ / 部分表示でマスクする / 例外の `message` をログへ出す
- **秘密を比較するとき**: `constantTimeEqual`（`apps/timer-sync/src/application/secure-compare.ts`）を使う
- **レビュー時のチェックリスト**（5 項目）

- [ ] **Step 2: `docs/README.md` の目的別の入口を更新する**

`今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順）` を `今日どう書くか（DoD・EARS・振り返り・アーキテクチャ・開発手順・セキュリティ）` へ変更する。

- [ ] **Step 3: `docs/guides/ears-writing.md` の実例を現行化する**

19 行目の `システムは、常にルームコードを 6 文字で表示すること` を次に置き換える。

```markdown
システムは、常に交代の残り時間を秒単位で表示すること
```

> ルームコードは生成経路が 2 つあり 6 文字とは限らないため、実例として不適切になった
> （設計正本 2.3 節）。EARS の型の説明としては別の題材で足りる。

- [ ] **Step 4: リンク検査を通す**

Run: `cd /home/vscode/tasuki-work && git add -A && node scripts/check-links.mjs`
Expected: OK・終了コード 0

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/guides/security.md docs/README.md docs/guides/ears-writing.md
git commit -m "docs: セキュリティガイドを新設し、文書地図と EARS の実例を現行化

- docs/guides/security.md: 新しい値を足す手順・ロガの使い方・
  やってはいけないこと・レビュー時のチェックリスト
- ears-writing.md の実例からルームコードの文字数を外す
  （生成経路が 2 つあり 6 文字とは限らないため）

Refs #136"
```

---

## Task 5: ログへ出してよい値の型を作る

**Files:**
- Create: `apps/timer-sync/src/application/log/log-safe.ts`
- Create: `apps/timer-sync/src/application/log/vocabulary.ts`
- Test: 型のみのため専用テストは置かない（Task 6 の整形テストで実際に使う）

**Interfaces:**
- Consumes: なし
- Produces: `LogSafe`（ブランド型）/ `LogField = number | boolean | LogSafe` / `publicText(value: string): LogSafe` / `AI_SKIP_REASONS` / `AI_FAILURE_REASONS`

- [ ] **Step 1: `log-safe.ts` を書く**

```typescript
/**
 * ログへ出してよい値だけを型で表す（ADR 0012 D1）。
 *
 * 生の `string` をロガのフィールドへ渡せないようにするのが目的である。
 * 資格情報・個人に紐づく情報は変数名を見ても判別できないため、
 * 「名前で弾く」検査は変数のリネームで黙って空振りする。型で塞げば抜けられない。
 */

declare const logSafeBrand: unique symbol;

/** ロガのフィールドとして渡せる文字列。生成経路は本ファイルの関数のみ。 */
export type LogSafe = string & { readonly [logSafeBrand]: true };

/** ロガのフィールドに置ける値。**生の `string` は含めない。** */
export type LogField = number | boolean | LogSafe;

/**
 * 分類「公開可」の文字列であることを宣言してログへ出す（ADR 0011 のデータ分類）。
 *
 * **これは型の壁を越える唯一の抜け道である。** そのため
 * `apps/timer-sync/src/application/log/vocabulary.ts` の外で呼んではならない。
 * `scripts/audit-log-hygiene.mjs` が呼び出し行に許可マーカーを要求する。
 */
export function publicText(value: string): LogSafe {
  return value as LogSafe;
}
```

- [ ] **Step 2: `vocabulary.ts` を書く**

```typescript
/**
 * ログに出す語彙の定義。`publicText` を呼ぶ唯一の場所（ADR 0012 D1）。
 *
 * 呼び出し側（handlers・delegation 等）がここの定数を引くことで、抜け道が
 * 1 ファイルに閉じる。新しい語彙を足すときはここへ足す。
 */
import { publicText, type LogSafe } from "./log-safe.js";

/** AI 生成をスキップした理由（`AiLimiter.tryAcquire` の `reason` と 1 対 1）。 */
export const AI_SKIP_REASONS = {
  concurrent: publicText("concurrent"), // log-hygiene:allow 語彙定義
  cooldown: publicText("cooldown"), // log-hygiene:allow 語彙定義
  daily: publicText("daily"), // log-hygiene:allow 語彙定義
} as const satisfies Record<string, LogSafe>;

/** AI 生成が失敗した理由の分類。自由文（例外メッセージ）は載せない。 */
export const AI_FAILURE_REASONS = {
  timeout: publicText("timeout"), // log-hygiene:allow 語彙定義
  invalid: publicText("invalid"), // log-hygiene:allow 語彙定義
  spawnFailed: publicText("spawn-failed"), // log-hygiene:allow 語彙定義
  other: publicText("other"), // log-hygiene:allow 語彙定義
} as const satisfies Record<string, LogSafe>;
```

- [ ] **Step 3: 型検査を通す**

Run: `cd /home/vscode/tasuki-work && corepack pnpm --filter @tasuki/timer-sync typecheck`
Expected: エラー 0

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync/src/application/log/log-safe.ts apps/timer-sync/src/application/log/vocabulary.ts
git commit -m "feat: ログへ出してよい値の型（LogSafe）と語彙を追加

- 生の string をロガのフィールドへ渡せない型にする
- publicText は型の壁を越える唯一の抜け道なので vocabulary.ts へ閉じる

Refs #136"
```

---

## Task 6: 整形とサニタイズを作る

**Files:**
- Create: `apps/timer-sync/src/application/log/logger.ts`
- Test: `apps/timer-sync/test/log/log-format.test.ts`

**Interfaces:**
- Consumes: `LogField`（Task 5）
- Produces: `LogLevel = "info" | "warn" | "error"` / `LogSink = (level: LogLevel, line: string) => void` / `Logger`（`info` / `warn` / `error`）/ `formatLine(event: string, fields?: Record<string, LogField>): string` / `createLogger(sink: LogSink): Logger`

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-sync/test/log/log-format.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { formatLine, createLogger, type LogLevel } from "../../src/application/log/logger.js";
import { publicText } from "../../src/application/log/log-safe.js";

describe("ログ行の整形", () => {
  it("フィールドが無ければイベント名だけを返す", () => {
    // Given / When
    const line = formatLine("listening");
    // Then
    expect(line).toBe("listening");
  });

  it("フィールドを key=value で並べる（grep で追える形を保つ）", () => {
    // Given
    const fields = { room: publicText("r_1a2b3c4d"), idleMs: 1800207 };
    // When
    const line = formatLine("reclaimed", fields);
    // Then
    expect(line).toBe("reclaimed room=r_1a2b3c4d idleMs=1800207");
  });

  it("真偽値をそのまま出す", () => {
    expect(formatLine("ai", { enabled: true })).toBe("ai enabled=true");
  });

  // ADR 0012 D12: requestId は境界に最大長も文字種の制限も無いため、
  // 制御文字を残すと journal に偽の行を作られる。
  it("値の改行・復帰・タブを除去する（ログ行への注入を防ぐ）", () => {
    // Given
    const injected = publicText("abc\ndef\rghi\tjkl");
    // When
    const line = formatLine("evt", { v: injected });
    // Then
    expect(line).toBe("evt v=abcdefghijkl");
  });

  it("イベント名の制御文字も除去する", () => {
    expect(formatLine("evt\nfake line")).toBe("evtfake line");
  });
});

describe("Logger", () => {
  it("レベルごとに sink へ整形済みの 1 行を渡す", () => {
    // Given
    const captured: Array<[LogLevel, string]> = [];
    const logger = createLogger((level, line) => captured.push([level, line]));
    // When
    logger.info("a", { n: 1 });
    logger.warn("b");
    logger.error("c", { ok: false });
    // Then
    expect(captured).toEqual([
      ["info", "a n=1"],
      ["warn", "b"],
      ["error", "c ok=false"],
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test test/log/log-format.test.ts`
Expected: FAIL（`Cannot find module '../../src/application/log/logger.js'`）

- [ ] **Step 3: 実装する**

`apps/timer-sync/src/application/log/logger.ts`:

```typescript
/**
 * ログの整形と Logger インターフェース（純粋・ADR 0012 D1）。
 *
 * 実際の書き出しは `LogSink`（アダプタ）へ委ねる。テストは配列に貯める sink を
 * 差し込むだけでよく、標準出力を横取りする必要がない。
 */
import type { LogField } from "./log-safe.js";

export type LogLevel = "info" | "warn" | "error";

/** 実際の書き出し先。本番は `consoleLogSink`、テストは配列へ貯める関数。 */
export type LogSink = (level: LogLevel, line: string) => void;

export interface Logger {
  info(event: string, fields?: Record<string, LogField>): void;
  warn(event: string, fields?: Record<string, LogField>): void;
  error(event: string, fields?: Record<string, LogField>): void;
}

/**
 * 制御文字を落とす（ADR 0012 D12）。
 *
 * 利用者由来の値（`requestId` 等）は境界で最大長も文字種も縛られていない。
 * 改行が通ると journal に偽の行を作れるため、**整形の側で必ず落とす**。
 * 呼び出し側の善意に頼らない。
 */
function stripControlChars(value: string): string {
  // 制御文字（C0 と DEL）を落とす。**リテラルの制御文字を直接書かない**
  // — 転送経路で消えると検査が黙って空振りする。
  return value.replace(/[\u0000-\u001F\u007F]/g, "");
}

/** `event k=v k=v` の 1 行に整形する。journalctl の grep で追える形を保つ。 */
export function formatLine(event: string, fields: Record<string, LogField> = {}): string {
  const head = stripControlChars(event);
  const parts = Object.entries(fields).map(
    ([k, v]) => `${stripControlChars(k)}=${stripControlChars(String(v))}`,
  );
  return parts.length === 0 ? head : `${head} ${parts.join(" ")}`;
}

export function createLogger(sink: LogSink): Logger {
  return {
    info: (event, fields) => sink("info", formatLine(event, fields)),
    warn: (event, fields) => sink("warn", formatLine(event, fields)),
    error: (event, fields) => sink("error", formatLine(event, fields)),
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test test/log/log-format.test.ts`
Expected: PASS（6 件）

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync/src/application/log/logger.ts apps/timer-sync/test/log/log-format.test.ts
git commit -m "feat: ログの整形と Logger を追加（制御文字を除去）

- formatLine は event k=v k=v の 1 行。grep で追える形を保つ
- 制御文字は整形の側で必ず落とす（requestId は境界で縛られていないため、
  呼び出し側の善意に頼るとログ行への注入が通る）

Refs #136"
```

---

## Task 7: 相関 ID を作る

**Files:**
- Create: `apps/timer-sync/src/application/log/ref-encoder.ts`
- Test: `apps/timer-sync/test/log/ref-encoder.test.ts`

**Interfaces:**
- Consumes: `LogSafe`（Task 5）
- Produces: `RefEncoder`（`room(code: string): LogSafe` / `request(requestId: string): LogSafe`）/ `createRefEncoder(salt: Buffer): RefEncoder`

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-sync/test/log/ref-encoder.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { createRefEncoder } from "../../src/application/log/ref-encoder.js";

const SALT_A = Buffer.from("salt-a-for-test");
const SALT_B = Buffer.from("salt-b-for-test");

describe("相関 ID", () => {
  it("ルームコードそのものを含まない（ADR 0012 D2）", () => {
    // Given
    const enc = createRefEncoder(SALT_A);
    // When
    const ref = enc.room("MORNING-MOB-7F3K");
    // Then
    expect(ref).not.toContain("MORNING");
    expect(ref).not.toContain("7F3K");
  });

  it("先頭数文字の部分表示にならない（部分表示は探索空間を縮める）", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF").startsWith("r_AB")).toBe(false);
  });

  it("同じソルト・同じコードなら同じ値になる（相関が取れる）", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF")).toBe(enc.room("ABCDEF"));
  });

  it("違うコードなら違う値になる", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF")).not.toBe(enc.room("ABCDEG"));
  });

  // 再起動をまたぐと相関が切れるのは、揮発設計（憲法 III）と整合する意図的な性質。
  it("ソルトが変わると値が変わる", () => {
    expect(createRefEncoder(SALT_A).room("ABCDEF")).not.toBe(
      createRefEncoder(SALT_B).room("ABCDEF"),
    );
  });

  it("room と request は接頭辞で見分けられる", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("ABCDEF").startsWith("r_")).toBe(true);
    expect(enc.request("req-1").startsWith("q_")).toBe(true);
  });

  it("同じ値でも room と request では別の ID になる", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.room("X").slice(2)).not.toBe(enc.request("X").slice(2));
  });

  it("利用者由来の requestId をそのまま含まない", () => {
    const enc = createRefEncoder(SALT_A);
    expect(enc.request("evil-injected-marker")).not.toContain("injected");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test test/log/ref-encoder.test.ts`
Expected: FAIL（`Cannot find module '../../src/application/log/ref-encoder.js'`）

- [ ] **Step 3: 実装する**

`apps/timer-sync/src/application/log/ref-encoder.ts`:

```typescript
/**
 * ログの相関 ID を作る（ADR 0012 D2）。
 *
 * **部分表示（先頭 N 文字）は採らない。** ルーム名つきのルームコードは推測困難な
 * 部分が短く、一部が漏れると探索空間が実用的な範囲へ落ちる（設計正本 2.3 節）。
 *
 * ソルトはプロセス起動ごとに変える。再起動をまたぐと相関は切れるが、
 * 共有状態が揮発する設計（憲法 III）と整合するので受け入れる。
 *
 * ソルトは引数で受け取る（憲法 VI: 副作用はアダプタに置き、ドメインへは注入する）。
 */
import { createHmac } from "node:crypto";
import type { LogSafe } from "./log-safe.js";

export interface RefEncoder {
  /** ルームコードから相関 ID を作る（`r_` 接頭辞）。 */
  room(code: string): LogSafe;
  /** リクエスト ID から相関 ID を作る（`q_` 接頭辞）。 */
  request(requestId: string): LogSafe;
}

/** 種別ごとに名前空間を分ける。同じ文字列でも種別が違えば別の ID になる。 */
function digest(salt: Buffer, kind: string, value: string): string {
  return createHmac("sha256", salt)
    .update(kind)
    .update(" ")
    .update(value)
    .digest("hex")
    .slice(0, 8);
}

export function createRefEncoder(salt: Buffer): RefEncoder {
  return {
    room: (code) => `r_${digest(salt, "room", code)}` as LogSafe,
    request: (requestId) => `q_${digest(salt, "request", requestId)}` as LogSafe,
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test test/log/ref-encoder.test.ts`
Expected: PASS（8 件）

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync/src/application/log/ref-encoder.ts apps/timer-sync/test/log/ref-encoder.test.ts
git commit -m "feat: ログの相関 ID（HMAC・ソルト注入）を追加

- 部分表示は採らない。ルーム名つきコードは推測困難な部分が短く、
  一部の漏洩で探索空間が実用的な範囲へ落ちるため
- 種別（room / request）で名前空間を分ける
- ソルトは引数で受け取る（憲法 VI）

Refs #136"
```

---

## Task 8: 唯一の実出力口を作る

**Files:**
- Create: `apps/timer-sync/src/adapters/console-log-sink.ts`

**Interfaces:**
- Consumes: `LogSink` / `LogLevel`（Task 6）
- Produces: `consoleLogSink: LogSink`

- [ ] **Step 1: 実装する**

```typescript
/**
 * 唯一の実出力口（ADR 0012 D1）。**このファイル以外で `console` を呼ばない。**
 *
 * `scripts/audit-log-hygiene.mjs` がこのファイルを許可対象として名前で固定し、
 * 各行に許可マーカーを要求する。マーカーが消えても、ファイルが許可一覧から
 * 消えても検査は赤になる（どちらの向きにも穴を作らない）。
 */
import type { LogSink } from "../application/log/logger.js";

export const consoleLogSink: LogSink = (level, line) => {
  if (level === "error") {
    console.error(line); // log-hygiene:allow 唯一の実出力口
  } else if (level === "warn") {
    console.warn(line); // log-hygiene:allow 唯一の実出力口
  } else {
    console.log(line); // log-hygiene:allow 唯一の実出力口
  }
};
```

- [ ] **Step 2: 型検査を通す**

Run: `cd /home/vscode/tasuki-work && corepack pnpm --filter @tasuki/timer-sync typecheck`
Expected: エラー 0

- [ ] **Step 3: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync/src/adapters/console-log-sink.ts
git commit -m "feat: 唯一の実出力口（consoleLogSink）を追加

Refs #136"
```

---

## Task 9: timer-sync の全ログを新経路へ移し、ルームコードを相関 ID にする

**Files:**
- Modify: `apps/timer-sync/src/server.ts`
- Modify: `apps/timer-sync/src/create-sync-server.ts:152`
- Modify: `apps/timer-sync/src/adapters/ws-adapter.ts:107`
- Modify: `apps/timer-sync/src/application/problem-delegation.ts:100`, `:161`
- Modify: `apps/poker-sync/src/server.ts:341`
- Test: `apps/timer-sync/test/log/reclaim-log.test.ts`

**Interfaces:**
- Consumes: `createLogger` / `consoleLogSink` / `createRefEncoder` / `AI_SKIP_REASONS` / `AI_FAILURE_REASONS`
- Produces: `create-sync-server.ts` が `logger` と `refEncoder` を組み立てて各所へ渡す。`ProblemDelegator` のコンストラクタが `logger: Logger` と `refEncoder: RefEncoder` を受け取る。`WsAdapterOptions` に `logger: Logger` が増える

- [ ] **Step 1: 網となるテストを書く**

`apps/timer-sync/test/log/reclaim-log.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { createLogger, type LogLevel } from "../../src/application/log/logger.js";
import { createRefEncoder } from "../../src/application/log/ref-encoder.js";

/**
 * 回収ログが「grep できる」ことと「ルームコードを含まない」ことを同時に固定する。
 * 片方だけを見ると、運用が壊れる変更か情報が漏れる変更のどちらかが通る。
 */
describe("回収ログ", () => {
  it("イベント名 reclaimed で grep でき、ルームコードを含まない", () => {
    // Given
    const lines: string[] = [];
    const logger = createLogger((_level: LogLevel, line: string) => lines.push(line));
    const enc = createRefEncoder(Buffer.from("salt-for-test"));
    const code = "MORNING-MOB-7F3K";
    // When
    logger.info("reclaimed", { room: enc.room(code), idleMs: 1800207 });
    // Then
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("reclaimed");
    expect(lines[0]).toContain("idleMs=1800207");
    expect(lines[0]).not.toContain(code);
    expect(lines[0]).not.toContain("7F3K");
  });
});
```

- [ ] **Step 2: テストを実行する**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test test/log/reclaim-log.test.ts`
Expected: PASS

> このテストは**移行後も壊れないこと**を守る網である。Task 6・7 が済んでいるためここで
> 赤にならないのは正常。実際の移行が済んだかどうかは Step 8 の grep と Task 10 の検査で見る。

- [ ] **Step 3: `create-sync-server.ts` に logger と refEncoder を組み立てる**

import を追加する。

```typescript
import { randomBytes } from "node:crypto";
import { createLogger } from "./application/log/logger.js";
import { createRefEncoder } from "./application/log/ref-encoder.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";
```

`reclaimer` の宣言より前へ追加する。

```typescript
  // ログの出口はここで 1 本に決める（ADR 0012 D1）。
  // ソルトはプロセス起動ごと。再起動で相関が切れるのは揮発設計と整合する（D2）。
  const logger = createLogger(consoleLogSink);
  const refEncoder = createRefEncoder(randomBytes(32));
```

152 行目を含む `onReclaim` を書き換える。

```typescript
    onReclaim: (code, idleMs) => {
      // 後始末は共通の破棄経路へ委ねる（二重に並べるとずれる）。
      destroyRoom(code);
      // 運用ログ（journalctl -u tasuki-sync | grep reclaimed で追える・R3-1）。
      // ルームコードは資格情報なので相関 ID へ置き換える（ADR 0012 D2）。
      logger.info("reclaimed", { room: refEncoder.room(code), idleMs });
    },
```

- [ ] **Step 4: `problem-delegation.ts` の 2 箇所を移す**

`ProblemDelegator` のコンストラクタ引数へ `logger: Logger` と `refEncoder: RefEncoder` を足し、フィールドへ保持する。100 行目を次に置き換える。

```typescript
      this.logger.warn("ai.skip", {
        room: this.refEncoder.room(roomCode),
        req: this.refEncoder.request(requestId),
        reason: AI_SKIP_REASONS[acquired.reason],
      });
```

161 行目を次に置き換える。`reason` は例外メッセージが入りうるため、**分類へ畳んでから出す**。

```typescript
    this.logger.warn("ai.fail", {
      room: this.refEncoder.room(roomCode),
      req: this.refEncoder.request(requestId),
      reason: classifyFailure(reason),
    });
```

同ファイルへ import を足し、分類関数を置く。

```typescript
import type { Logger } from "./log/logger.js";
import type { RefEncoder } from "./log/ref-encoder.js";
import type { LogSafe } from "./log/log-safe.js";
import { AI_SKIP_REASONS, AI_FAILURE_REASONS } from "./log/vocabulary.js";
```

```typescript
/** 失敗理由を既知の語彙へ畳む。例外メッセージをそのままログへ出さない（ADR 0012 D5・D12）。 */
function classifyFailure(reason: string): LogSafe {
  if (reason.includes("aborted")) return AI_FAILURE_REASONS.timeout;
  if (reason.includes("解析に失敗") || reason.includes("JSON")) return AI_FAILURE_REASONS.invalid;
  if (reason.includes("ENOENT") || reason.includes("spawn")) return AI_FAILURE_REASONS.spawnFailed;
  return AI_FAILURE_REASONS.other;
}
```

`create-sync-server.ts` の `new ProblemDelegator({...})` へ `logger` と `refEncoder` を渡す。

- [ ] **Step 5: `server.ts` の 6 箇所を移し、未捕捉例外ハンドラを置く**

ファイル先頭でロガを組み立てる。

```typescript
import { createLogger } from "./application/log/logger.js";
import { consoleLogSink } from "./adapters/console-log-sink.js";
import { publicText } from "./application/log/log-safe.js";

const logger = createLogger(consoleLogSink);

// 未捕捉の例外・未処理の rejection も 1 本の経路へ通す（ADR 0012 D1）。
// 既定ハンドラに任せると、資格情報を含む例外メッセージがスタックごと journal へ出る。
process.on("uncaughtException", (err) => {
  logger.error("uncaught", { name: publicText(err.name) }); // log-hygiene:allow 例外の分類のみ
  process.exit(1);
});
process.on("unhandledRejection", () => {
  logger.error("unhandled-rejection");
});
```

> **例外の `message` は出さない。** 例外メッセージには照合に失敗した値がそのまま
> 入りうる。出すのは `name`（`Error` / `TypeError` 等）だけにする。

既存の 6 箇所を置き換える。値の種類に応じて真偽値・数値へ畳む。

```typescript
logger.error("config-error", { name: publicText((e as Error).name) }); // log-hygiene:allow 例外の分類のみ
logger.info("listening", { port: config.port, maxConn: config.maxConnections, maxRooms: config.maxRooms });
logger.info("admin", { enabled: config.adminToken !== undefined });
logger.info("ai", { enabled: config.claudeOauthToken !== undefined && config.aiUnlockKey !== undefined });
logger.warn("origins-unset");
logger.info("sigterm");
```

> `publicText` を `server.ts` で使いたくなったら、**まず `vocabulary.ts` へ語彙として
> 足せないかを考える**。上の例外の `name` は事前に列挙できないため例外扱いとし、
> 許可マーカーを付ける。

- [ ] **Step 6: `ws-adapter.ts:107` を移す**

`WsAdapterOptions` へ `logger: Logger` を足し、`console.error` を置き換える。

```typescript
      this.logger.error("http-server-error", { name: publicText((err as Error).name) }); // log-hygiene:allow 例外の分類のみ
```

`create-sync-server.ts` の `new WsAdapter({...})` へ `logger` を渡す。

- [ ] **Step 7: poker-sync へ許可マーカーだけを付ける**

`apps/poker-sync/src/server.ts:341` を次に置き換える。**形式は絶対に変えない。**

```typescript
// この 1 行は tests/helpers.ts が JSON.parse して実ポートを受け取る機械可読な契約である。
// 形式を変えると poker-sync のテストが全滅する（helpers.ts が '"listening"' を含む行を探す）。
console.log(JSON.stringify({ event: 'listening', port: server.port })); // log-hygiene:allow テストハーネスとの契約
```

- [ ] **Step 8: 直接の console が残っていないことを確認する**

Run:
```bash
cd /home/vscode/tasuki-work && grep -rn 'console\.' apps/timer-sync/src apps/poker-sync/src --include='*.ts' | grep -v '/dist/' | grep -v 'log-hygiene:allow'
```
Expected: 出力なし

- [ ] **Step 9: 全テストと型検査を通す**

Run: `cd /home/vscode/tasuki-work && corepack pnpm typecheck && corepack pnpm test`
Expected: 型エラー 0・全テスト PASS（**poker-sync の 56 件を含む**）

> poker-sync が赤くなったら、Step 7 で `listening` 行の形式を変えていないか確認する。

- [ ] **Step 10: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync/src apps/timer-sync/test/log apps/poker-sync/src/server.ts
git commit -m "refactor: 同期サーバーのログを 1 本の経路へ集約し、ルームコードを相関 ID にする

- timer-sync の 10 箇所を logger 経由へ。ルームコード 3 箇所は相関 ID
- 未捕捉例外・未処理 rejection もロガを通す。例外の message は出さず
  name（分類）だけを出す
- AI の失敗理由は既知の語彙へ畳む（例外メッセージをそのまま出さない）
- poker-sync の listening 行は形式を変えず許可マーカーのみ
  （tests/helpers.ts が JSON.parse する機械可読な契約のため）

Refs #136"
```

---

## Task 10: ログ衛生の検査を作る

**Files:**
- Create: `scripts/audit-log-hygiene.mjs`
- Test: `scripts/audit-log-hygiene.test.mjs`

**Interfaces:**
- Consumes: Task 9 で置いた許可マーカー
- Produces: `findViolations(relPath, source)` / `findStaleAllowances(scanned)` / `findMissingRequired(scanned)` / `ALLOWED_FILES` / `REQUIRED_FILES` / `SCAN_DIRS`。CI から `node scripts/audit-log-hygiene.mjs` で呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`scripts/audit-log-hygiene.test.mjs`:

```javascript
/**
 * scripts/audit-log-hygiene.mjs の単体テスト。
 * 実リポジトリはスキャンしない（インライン文字列と小さな Map だけを渡す）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  findViolations,
  findStaleAllowances,
  findMissingRequired,
  ALLOWED_FILES,
  REQUIRED_FILES,
} from "./audit-log-hygiene.mjs";

describe("禁止された構文の検出", () => {
  test("許可されていないファイルの console は違反", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", 'console.log("x");\n');
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test("許可ファイルでもマーカーが無ければ違反", () => {
    const v = findViolations(ALLOWED_FILES[0], 'console.log("x");\n');
    assert.equal(v.length, 1);
  });

  test("許可ファイルでマーカーがあれば違反にしない", () => {
    const v = findViolations(ALLOWED_FILES[0], 'console.log("x"); // log-hygiene:allow 理由\n');
    assert.equal(v.length, 0);
  });

  test("process.stdout.write も検出する", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "process.stdout.write('x');\n");
    assert.equal(v.length, 1);
  });

  test("publicText の呼び出しも検出する（抜け道の管理）", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "const a = publicText(secret);\n");
    assert.equal(v.length, 1);
  });

  test("publicText の定義（export function）は呼び出しではないので違反にしない", () => {
    const src = "export function publicText(value) { return value; }\n";
    const v = findViolations("apps/timer-sync/src/application/log/log-safe.ts", src);
    assert.equal(v.length, 0);
  });

  test("コメント行の console は違反にしない", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", '// console.log("説明")\n');
    assert.equal(v.length, 0);
  });
});

describe("fail-closed: 陳腐化した許可の検出", () => {
  test("許可ファイルにマーカーが 1 つも無ければ陳腐化として報告する", () => {
    const scanned = new Map(ALLOWED_FILES.map((f) => [f, "const x = 1;\n"]));
    assert.deepEqual(findStaleAllowances(scanned).sort(), [...ALLOWED_FILES].sort());
  });

  test("マーカーがあれば陳腐化ではない", () => {
    const scanned = new Map(ALLOWED_FILES.map((f) => [f, "// log-hygiene:allow 理由\n"]));
    assert.deepEqual(findStaleAllowances(scanned), []);
  });
});

describe("fail-closed: 走査対象の消失の検出", () => {
  test("必須ファイルが走査結果に無ければ報告する", () => {
    assert.deepEqual(findMissingRequired(new Map()).sort(), [...REQUIRED_FILES].sort());
  });

  test("すべて揃っていれば空", () => {
    const scanned = new Map(REQUIRED_FILES.map((f) => [f, ""]));
    assert.deepEqual(findMissingRequired(scanned), []);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/audit-log-hygiene.test.mjs`
Expected: FAIL（`Cannot find module './audit-log-hygiene.mjs'`）

- [ ] **Step 3: 実装する**

`scripts/audit-log-hygiene.mjs`:

```javascript
#!/usr/bin/env node
/**
 * ログ衛生の検査（Issue #136・ADR 0012 D1）。
 *
 * 規則は 1 つだけ:
 *   禁止された構文（console.* / process.stdout.write / process.stderr.write /
 *   publicText の呼び出し）は、**許可ファイルの、許可マーカーが付いた行**に
 *   しか置けない。
 *
 * **最初から fail-closed に作る。** 検査が「何も見つけられない状態」を成功と
 * report しないよう、次の 2 つを同時に見る。
 *   1. 許可ファイルにマーカーが 1 つも無い → 陳腐化した許可として赤。
 *      console を消して許可だけ残す／許可を消して console を残す、
 *      どちらの向きにも穴を作らない。
 *   2. 必須ファイルが走査結果に無い → 赤。走査対象を失うと全件 PASS になる型の
 *      欠陥を最初から塞ぐ。**件数の下限は直書きしない。** ファイルが減るたびに
 *      下限を下げるのが赤を消す最短経路になり、対応表から項目を消すのと同じ穴になる。
 *
 * 設計方針: 判定は純粋関数にし、実ファイル I/O は main() の薄い配線だけにする。
 * 追加依存は禁止のため Node 標準の fs / path のみを使う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

/** 走査するディレクトリ（リポジトリルート起点）。 */
export const SCAN_DIRS = ["apps/timer-sync/src", "apps/poker-sync/src"];

/** 禁止構文を置いてよいファイル。**行に許可マーカーが必要。** */
export const ALLOWED_FILES = [
  "apps/timer-sync/src/adapters/console-log-sink.ts",
  "apps/timer-sync/src/server.ts",
  "apps/timer-sync/src/adapters/ws-adapter.ts",
  "apps/timer-sync/src/application/log/vocabulary.ts",
  "apps/timer-sync/src/application/log/ref-encoder.ts",
  "apps/poker-sync/src/server.ts",
];

/** 走査結果に必ず存在しなければならないファイル（走査対象の消失を検出する）。 */
export const REQUIRED_FILES = [
  "apps/timer-sync/src/create-sync-server.ts",
  "apps/timer-sync/src/application/problem-delegation.ts",
  "apps/timer-sync/src/adapters/console-log-sink.ts",
  "apps/poker-sync/src/server.ts",
];

/** 許可マーカー。行末コメントに付ける。 */
const ALLOW_MARKER = "log-hygiene:allow";

/** 禁止構文。`publicText` は定義ではなく呼び出しだけを拾う。 */
const FORBIDDEN = [
  { name: "console", re: /\bconsole\s*\./ },
  { name: "process.stdout", re: /\bprocess\s*\.\s*stdout\s*\.\s*write\b/ },
  { name: "process.stderr", re: /\bprocess\s*\.\s*stderr\s*\.\s*write\b/ },
  { name: "publicText", re: /(?<!function\s)\bpublicText\s*\(/ },
  // `as LogSafe` は型の壁を迂回する第 2 の経路。publicText だけを見ていると
  // `foo as LogSafe` がどこにでも書けてしまい、検査が意味を失う。
  { name: "as LogSafe", re: /\bas\s+LogSafe\b/ },
];

/** 行が行コメント・ブロックコメントの本文かどうか（インデントは無視）。 */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/**
 * 1 ファイル分の違反行を返す（純粋）。
 * 戻り値: `[{ file, line, kind }]`
 */
export function findViolations(relPath, source) {
  const allowed = ALLOWED_FILES.includes(relPath);
  const out = [];
  source.split("\n").forEach((text, i) => {
    if (isCommentLine(text)) return;
    for (const { name, re } of FORBIDDEN) {
      if (!re.test(text)) continue;
      if (allowed && text.includes(ALLOW_MARKER)) continue;
      out.push({ file: relPath, line: i + 1, kind: name });
    }
  });
  return out;
}

/** 許可ファイルのうち、マーカーを 1 つも持たないものを返す（純粋）。 */
export function findStaleAllowances(scanned) {
  return ALLOWED_FILES.filter((f) => {
    const src = scanned.get(f);
    return src === undefined || !src.includes(ALLOW_MARKER);
  });
}

/** 走査結果に無い必須ファイルを返す（純粋）。 */
export function findMissingRequired(scanned) {
  return REQUIRED_FILES.filter((f) => !scanned.has(f));
}

/** ディレクトリ配下の .ts を読む（`dist` と `node_modules` は除外）。 */
function readTsFiles(rootDir) {
  const result = new Map();
  const abs = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(abs)) return result;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
        const rel = path.relative(REPO_ROOT, full).split(path.sep).join("/");
        result.set(rel, fs.readFileSync(full, "utf8"));
      }
    }
  };
  walk(abs);
  return result;
}

function main() {
  const scanned = new Map();
  for (const dir of SCAN_DIRS) {
    for (const [k, v] of readTsFiles(dir)) scanned.set(k, v);
  }

  const problems = [];
  for (const f of findMissingRequired(scanned)) {
    problems.push(`必須ファイルが走査できていません → ${f}`);
  }
  for (const f of findStaleAllowances(scanned)) {
    problems.push(`許可が陳腐化しています（マーカーが 1 つもありません） → ${f}`);
  }
  for (const [rel, src] of scanned) {
    for (const v of findViolations(rel, src)) {
      problems.push(`${v.file}:${v.line} 直接の ${v.kind} は使えません（ADR 0012 D1）`);
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります（走査 ${scanned.size} ファイル）`);
    process.exit(1);
  }
  console.log(`ログ衛生 OK（走査 ${scanned.size} ファイル）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && node --test scripts/audit-log-hygiene.test.mjs`
Expected: PASS（11 件）

- [ ] **Step 5: 実リポジトリに対して実行する**

Run: `cd /home/vscode/tasuki-work && node scripts/audit-log-hygiene.mjs; echo "exit=$?"`
Expected: `ログ衛生 OK（走査 N ファイル）` と `exit=0`

> ここで赤になったら、Task 9 の移行が完了していないか `ALLOWED_FILES` の顔ぶれが
> 実態と合っていない。**許可を足して黙らせる前に、移行漏れを疑う。**

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add scripts/audit-log-hygiene.mjs scripts/audit-log-hygiene.test.mjs
git commit -m "test: ログ衛生の検査を追加（最初から fail-closed）

- 規則は 1 つ: 禁止構文は許可ファイルの許可マーカー付きの行にしか置けない
- 許可ファイルにマーカーが無ければ陳腐化として赤（両向きに穴を作らない）
- 必須ファイルが走査できなければ赤（件数の下限は直書きしない）

Refs #136"
```

---

## Task 11: CI へ組み込み、変異を足す

**Files:**
- Modify: `.github/workflows/ci.yml`（`quality` ジョブ）
- Modify: `scripts/mutation-check.mjs`
- Create: `scripts/mutations/m10-ref-encoder-passthrough.patch`

**Interfaces:**
- Consumes: `scripts/audit-log-hygiene.mjs`（Task 10）・`createRefEncoder`（Task 7）
- Produces: CI の `quality` ジョブがログ衛生を検査する状態

- [ ] **Step 1: `quality` ジョブへ検査を足す**

`node scripts/audit-structure.mjs` のステップの直後へ挿入する。

```yaml
      # ログ衛生。資格情報・個人に紐づく情報がログ経路へ流れないことを見る（ADR 0012 D1）。
      - run: node scripts/audit-log-hygiene.mjs
        if: steps.scope.outputs.code == 'true'
```

同ジョブの自己テストのステップへ新しいテストファイルを足す。

```yaml
      - run: node --test scripts/audit-structure.test.mjs scripts/check-links.test.mjs scripts/ci-scope.test.mjs scripts/audit-log-hygiene.test.mjs
        if: steps.scope.outputs.code == 'true'
```

- [ ] **Step 2: 変異のパッチを作る**

`ref-encoder.ts` の `room` がコードをそのまま返すよう手で書き換え、diff を取る。

```bash
cd /home/vscode/tasuki-work
# room: (code) => `r_${digest(salt, "room", code)}` as LogSafe,
#   ↓
# room: (code) => `r_${code}` as LogSafe,
git diff apps/timer-sync/src/application/log/ref-encoder.ts > /tmp/m10.diff
git checkout -- apps/timer-sync/src/application/log/ref-encoder.ts
```

`scripts/mutations/m10-ref-encoder-passthrough.patch` を作る。既存パッチと同じヘッダコメントの後ろへ `/tmp/m10.diff` の内容を貼る。

```
# 変異 10: ref-encoder-passthrough
#
# 検出を期待するテスト:
#   - apps/timer-sync/test/log/ref-encoder.test.ts
#   - apps/timer-sync/test/log/reclaim-log.test.ts
#
# 適用: リポジトリルートから
#       git apply scripts/mutations/m10-ref-encoder-passthrough.patch
# 復元: git checkout -- apps/timer-sync/src/application/log/ref-encoder.ts
#
```

- [ ] **Step 3: `MUTATIONS` へ登録する**

`scripts/mutation-check.mjs` の `MUTATIONS` 配列の末尾へ追加する。

```javascript
  {
    id: 10,
    label: "createRefEncoder.room が相関 ID ではなくルームコードをそのまま返す",
    patch: "m10-ref-encoder-passthrough.patch",
    pkg: "apps/timer-sync",
    tests: ["test/log/ref-encoder.test.ts", "test/log/reclaim-log.test.ts"],
    note:
      "資格情報がログへ戻る欠陥の型。ADR 0012 D2 の「部分表示も生の値も出さない」" +
      "という決定がテストで固定されていることを確かめる。",
  },
```

- [ ] **Step 4: 変異検査を回す**

Run:
```bash
cd /home/vscode/tasuki-work && git status --short && node scripts/mutation-check.mjs
```
Expected: `git status` が空であること。**全 10 件が「検出」**と表示され、終了コード 0

> 変異検査は作業ツリーが汚れていると実行を拒否する。Step 3 までをコミットしてから回す。

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add .github/workflows/ci.yml scripts/mutation-check.mjs scripts/mutations/m10-ref-encoder-passthrough.patch
git commit -m "ci: ログ衛生の検査を quality ジョブへ組み込み、変異 10 を追加

- 変異 10: 相関 ID がルームコードをそのまま返す（資格情報がログへ戻る型）

Refs #136"
```

---

## Task 12: 破壊検証（5 通りすべてで赤になることを確かめる）

**Files:**
- なし（確認のみ。壊した状態はすべて元へ戻す）

**Interfaces:**
- Consumes: Task 10・11 の成果物
- Produces: 検査が本当に効いているという証拠。PR 本文へ結果を貼る

> **壊し方そのものが効いていることを先に確かめる。** #70 では 3 件とも最初の壊し方が
> 効いておらず、緑を「守れている証拠」と誤読しかけた。**赤にならなかったら、
> まず自分の壊し方を疑う。**

- [ ] **Step 1: ログへルームコードを戻す**

```bash
cd /home/vscode/tasuki-work
# create-sync-server.ts の onReclaim を
#   logger.info("reclaimed", { room: refEncoder.room(code), idleMs });
#   ↓
#   logger.info("reclaimed", { room: publicText(code), idleMs });
# へ書き換える（publicText の import も足す）
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
git checkout -- apps/timer-sync/src/create-sync-server.ts
```
Expected: `create-sync-server.ts:NNN 直接の publicText は使えません` が出て `exit=1`

- [ ] **Step 2: 許可マーカーを消す**

```bash
cd /home/vscode/tasuki-work
sed -i 's| // log-hygiene:allow 唯一の実出力口||' apps/timer-sync/src/adapters/console-log-sink.ts
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
git checkout -- apps/timer-sync/src/adapters/console-log-sink.ts
```
Expected: 違反 3 件と陳腐化 1 件が出て `exit=1`

- [ ] **Step 3: 走査対象の必須ファイルを消す**

```bash
cd /home/vscode/tasuki-work
mv apps/timer-sync/src/application/problem-delegation.ts /tmp/pd.ts
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
mv /tmp/pd.ts apps/timer-sync/src/application/problem-delegation.ts
```
Expected: `必須ファイルが走査できていません → apps/timer-sync/src/application/problem-delegation.ts` が出て `exit=1`

- [ ] **Step 4: ロガを迂回して直接 console を呼ぶ**

```bash
cd /home/vscode/tasuki-work
printf '\nconsole.log("bypass");\n' >> apps/timer-sync/src/application/problem-delegation.ts
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
git checkout -- apps/timer-sync/src/application/problem-delegation.ts
```
Expected: `problem-delegation.ts:NNN 直接の console は使えません` が出て `exit=1`

- [ ] **Step 5: 変異が実際にテストで検出されることを確かめる**

```bash
cd /home/vscode/tasuki-work
git apply scripts/mutations/m10-ref-encoder-passthrough.patch
cd apps/timer-sync && bun test test/log/ref-encoder.test.ts; echo "exit=$?"
cd /home/vscode/tasuki-work && git checkout -- apps/timer-sync/src/application/log/ref-encoder.ts
```
Expected: テストが FAIL し `exit` が 0 以外

> 狙いは「対応表から消せば緑になる」という #70 の罠が再現しないことの確認である。
> **対応表を経由せず、変異そのものがテストに検出される**ことを直接見る。

- [ ] **Step 6: すべて元へ戻ったことを確認する**

Run:
```bash
cd /home/vscode/tasuki-work && git status --short && node scripts/audit-log-hygiene.mjs && corepack pnpm test
```
Expected: `git status` が空・ログ衛生 OK・全テスト PASS

- [ ] **Step 7: 結果を PR 本文へ記録する**

5 通りの壊し方と、それぞれで出た**実際のメッセージと終了コード**を PR 本文の「テスト方法」節へ貼る。**「赤になりました」だけでは証拠にならない。**

---

## Task 13: パスフレーズの比較を定数時間にする

**Files:**
- Modify: `apps/timer-sync/src/application/command-handlers/room-join.ts:114`
- Test: `apps/timer-sync/test/passphrase-compare.test.ts`

**Interfaces:**
- Consumes: `constantTimeEqual`（`apps/timer-sync/src/application/secure-compare.ts`）
- Produces: なし（振る舞いは不変）

> **タイミング特性は戻り値として観測できない。** `constantTimeEqual(a, b)` と `a !== b` は
> どんな入力でも同じ真偽値を返し、違うのは所要時間だけである。経過時間の統計的な測定は
> JIT・GC・スケジューリングの揺らぎに埋もれ、共有 CI ランナーでは不安定なテストが増えるだけ。
> **したがって網は構造テストで張る** — ソースを読み、`!==` による照合が無く
> `constantTimeEqual` を呼ぶことを固定する。この流儀はこのリポジトリに既にある
> （`apps/landing/tests/caddy-fragment-order.test.ts` は Caddy 設定を読んで検証し、
> `apps/timer-web/test/sync/sync-url.test.ts` は 2 ファイル間の一致を固定している）。
>
> **この構造テストは変更前に赤くなる**ので、赤先行（憲法 I）が成立する。

- [ ] **Step 1: テストを書く**

`apps/timer-sync/test/passphrase-compare.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { constantTimeEqual } from "../src/application/secure-compare.js";

/**
 * 照合の**振る舞い**が素の比較と一致することを固定する。
 * タイミング特性そのものはテストで測れないので、「同じ判定を返すこと」だけを
 * 機械で押さえ、定数時間である根拠は constantTimeEqual の実装
 * （node:crypto の timingSafeEqual）に委ねる。
 */
describe("パスフレーズの照合", () => {
  it("一致するとき true", () => {
    expect(constantTimeEqual("himitsu", "himitsu")).toBe(true);
  });
  it("違うとき false", () => {
    expect(constantTimeEqual("himitsu", "himitsX")).toBe(false);
  });
  it("長さが違うとき false（throw しない）", () => {
    expect(constantTimeEqual("himitsu", "himitsuu")).toBe(false);
  });
  it("空文字どうしは true（解除済みルームの扱いは呼び出し側の責務）", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });
  it("マルチバイトでも判定が一致する", () => {
    expect(constantTimeEqual("あい", "あい")).toBe(true);
    expect(constantTimeEqual("あい", "あう")).toBe(false);
  });
});

/**
 * 呼び出し側が実際に定数時間比較を通ることを、ソースの形で固定する（構造テスト）。
 * タイミング特性は戻り値に現れないため、実行時のテストでは
 * `!==` と `constantTimeEqual` を区別できない。
 */
const ROOM_JOIN_SRC = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/application/command-handlers/room-join.ts",
  ),
  "utf8",
);

describe("パスフレーズ照合の形", () => {
  it("constantTimeEqual を通している", () => {
    expect(ROOM_JOIN_SRC).toMatch(
      /constantTimeEqual\(\s*providedPassphrase\s*,\s*requiredPassphrase\s*\)/,
    );
  });

  it("素の比較演算子でパスフレーズを比べていない", () => {
    // `requiredPassphrase !== undefined` の未設定判定は対象外（両辺の名前で限定する）。
    expect(ROOM_JOIN_SRC).not.toMatch(
      /providedPassphrase\s*(!==|===|!=|==)\s*requiredPassphrase/,
    );
    expect(ROOM_JOIN_SRC).not.toMatch(
      /requiredPassphrase\s*(!==|===|!=|==)\s*providedPassphrase/,
    );
  });
});
```

冒頭の import に次を足す。

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
```

- [ ] **Step 2: テストが失敗することを確認する（赤先行）**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test test/passphrase-compare.test.ts`
Expected: **「パスフレーズ照合の形」の 2 件が FAIL**（`room-join.ts` はまだ `!==` で比較している）。
`constantTimeEqual` 単体の 5 件は PASS

> ここで 2 件とも緑になったら、**まず自分の壊し方（正規表現とパス）を疑う**。
> 正規表現がどの行にもマッチしていない可能性がある

- [ ] **Step 3: `room-join.ts` の照合を置き換える**

import を足す。

```typescript
import { constantTimeEqual } from "../secure-compare.js";
```

114 行目を次に置き換える。

```typescript
    // 秘密の照合は定数時間で行う（ADR 0012・管理トークン／AI 解錠と同じ規律）。
    if (
      requiredPassphrase !== undefined &&
      !constantTimeEqual(providedPassphrase, requiredPassphrase)
    ) {
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test test/passphrase-compare.test.ts`
Expected: PASS（7 件。構造テスト 2 件が赤から緑へ変わる）

- [ ] **Step 5: 既存の入室テストが壊れていないことを確認する**

Run: `cd /home/vscode/tasuki-work/apps/timer-sync && bun test`
Expected: 全 PASS（既存のパスフレーズ関連テストが振る舞いの不変を保証する）

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync/src/application/command-handlers/room-join.ts apps/timer-sync/test/passphrase-compare.test.ts
git commit -m "fix: ルームパスフレーズの照合を定数時間比較にする

管理トークン・AI 解錠合言葉は constantTimeEqual を使っていたが、
ルームパスフレーズだけが素の比較のままだった。規範が無いと同じ種類の
値でも扱いがばらつくという実例。

Refs #136"
```

---

## Task 14: 未使用の dompurify を削除する

**Files:**
- Modify: `apps/timer-web/package.json:19`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 未使用であることを自分で測り直す**

Run:
```bash
cd /home/vscode/tasuki-work && grep -rn "dompurify" apps packages e2e --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '/dist/'
```
Expected: 出力なし（`package.json` 以外に import が無い）

> #69 が未使用と特定したが処理されず残っていた。**消す前に自分で測り直す。**

- [ ] **Step 2: 依存を削除する**

Run: `cd /home/vscode/tasuki-work && corepack pnpm --filter @tasuki/timer-web remove dompurify`
Expected: `package.json` から消え、`pnpm-lock.yaml` が更新される

- [ ] **Step 3: 型検査・テスト・ビルドを通す**

Run: `cd /home/vscode/tasuki-work && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
Expected: すべて成功。特に `apps/timer-web/test/ui/Markdown.test.tsx` が PASS（XSS 対策は `Markdown.tsx` の設計で担保されており、dompurify に依存していない）

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-web/package.json pnpm-lock.yaml
git commit -m "chore: 未使用の dompurify を削除

旧脅威モデル S4 は Markdown 描画に DOMPurify を求めていたが、
Markdown.tsx は文字列 HTML を生成しない設計で代替済みであり、
import は 0 件だった。ADR 0011 で不採用を明記した。

Refs #136 #69"
```

---

## Task 15: CI の権限を絞り、Actions を SHA でピンする

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `renovate.json`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: `permissions` を最小で宣言する**

`.github/workflows/ci.yml` の `env:` ブロックの直前へ挿入する。

```yaml
# GITHUB_TOKEN の権限を最小にする（ADR 0012 D8 / ADR 0011 S13）。
# ワークフロー全体の既定を read にし、必要なジョブだけが個別に足す。
# 現状どのジョブも書き込みを必要としない。
permissions:
  contents: read
```

- [ ] **Step 2: Actions を SHA でピンする**

**版のコメントを必ず添える**（SHA だけだと人が読めない）。

```bash
cd /home/vscode/tasuki-work
sed -i \
  -e 's|uses: actions/checkout@v4|uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4|' \
  -e 's|uses: actions/setup-node@v4|uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4|' \
  -e 's|uses: oven-sh/setup-bun@v2|uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2|' \
  -e 's|uses: actions/cache@v4|uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4|' \
  -e 's|uses: actions/upload-artifact@v4|uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4|' \
  .github/workflows/ci.yml
```

> これらの SHA は **2026-08-13 時点の `v4` / `v2` タグの解決結果**である。
> ピンは「いま動いているものを固定する」だけで、版を上げるものではない。

- [ ] **Step 3: Renovate に digest を維持させる**

`renovate.json` の `extends` を次に変更する。

```json
  "extends": ["config:recommended", "helpers:pinGitHubActionDigests"],
```

- [ ] **Step 4: 機械で確認する**

Run:
```bash
cd /home/vscode/tasuki-work && node -e '
const fs = require("fs");
const y = fs.readFileSync(".github/workflows/ci.yml", "utf8");
if (!/^permissions:/m.test(y)) throw new Error("permissions が無い");
const pinned = (y.match(/uses: \S+@[0-9a-f]{40} #/g) || []).length;
const unpinned = (y.match(/uses: \S+@v\d/g) || []).length;
if (unpinned !== 0) throw new Error("ピンされていない uses が " + unpinned + " 箇所");
console.log("OK: permissions あり / SHA ピン " + pinned + " 箇所 / 未ピン 0");
'
```
Expected: `OK: permissions あり / SHA ピン 15 箇所 / 未ピン 0`

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add .github/workflows/ci.yml renovate.json
git commit -m "ci: GITHUB_TOKEN の権限を最小化し、Actions を SHA でピンする

- permissions: contents: read をワークフロー全体の既定にする
- uses を 15 箇所すべて SHA へ（版はコメントで残す）
- Renovate に helpers:pinGitHubActionDigests を足し digest の追従を任せる。
  ただし Renovate の PR 作成はまだ実証できていないため、当面は定期の
  手動確認を併用する（ADR 0012 D8）

Refs #136"
```

> **申し送り（PR 本文へ書く）**: ピンした `v4` / `v2` は各アクションの最新メジャーより
> 数世代古い（例: `actions/checkout` の最新は v7 系）。**メジャーの追従は本 Issue の
> 対象外**であり、`renovate.json` の `dependencyDashboardApproval` の経路で扱う。
> 必要なら別 Issue を起票する。

---

## Task 16: 公開窓口と秘密の取り扱いを文書化する

**Files:**
- Create: `SECURITY.md`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: ADR 0012 D4・D9（Task 3）
- Produces: なし

- [ ] **Step 1: `SECURITY.md` を書く**

```markdown
# セキュリティ

Tasuki は個人開発のツール集です。専任の窓口はありませんが、報告は歓迎します。

## 報告のしかた

**公開の Issue には書かないでください。** GitHub の Security Advisories から
非公開で報告してください。

## 対象と対象外

| 対象 | 対象外 |
|---|---|
| 同期サーバー（`apps/timer-sync` / `apps/poker-sync`） | 依存ライブラリの既知の脆弱性（`pnpm audit` が CI で見ています） |
| 配信設定（`deploy/`） | 自己ホストした環境の設定ミス |
| 資格情報・秘密の露出 | ルームコードを知る人が入室できること（設計上の仕様です） |

## 設計上の前提

このサービスは**共有状態を永続化しません**。サーバーの再起動でルームは消えます。
何を秘密として扱い、どう守るかは
[`docs/adr/0011`](./docs/adr/0011-threat-model-and-data-classification.md) と
[`docs/adr/0012`](./docs/adr/0012-logging-secrets-and-disclosure.md) に記録しています。

## 応答について

個人の余暇で運用しているため、応答までに時間がかかることがあります。
```

- [ ] **Step 2: `deploy/README.md` へ秘密の節を足す**

`## SSH の準備` の直前へ挿入する。

```markdown
## 秘密の取り扱い

**秘密はリポジトリに置かない。** 実体は VPS 上の env ファイルだけに存在する。

| 秘密 | 置き場 | 用途 |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `/opt/tasuki/tasuki-sync.env`（600） | AI お題生成の子プロセスへ渡す |
| `AI_UNLOCK_KEY` | 同上 | AI 生成の解錠合言葉 |
| `ADMIN_TOKEN` | 同上 | 管理エンドポイントの認証 |

- **権限は 600 を維持する。** `setup.sh` が作成時に設定するが、手で編集した後も
  `ls -l /opt/tasuki/tasuki-sync.env` で確認する
- **配り方**: `ssh -t "$TASUKI_SSH_HOST" 'sudo -e /opt/tasuki/tasuki-sync.env'` で
  VPS 上で直接編集する。ローカルに控えを作らない。scp で送らない
- **中身をログ・Issue・PR へ貼らない。** 値が必要な話は「どの変数か」だけで書く
- **`deploy/<app>/app.env` は追跡下にある。ここに秘密を書かない**（配備設定のみ）

### 失効の手順

漏洩を疑ったら、**まず失効させてから原因を調べる。**

| 秘密 | 失効のしかた |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Anthropic のコンソールでトークンを失効させ、`claude setup-token` で再発行して env を更新 |
| `AI_UNLOCK_KEY` | env の値を変えて `sudo systemctl restart tasuki-sync`。**利用者へ新しい合言葉を配り直す** |
| `ADMIN_TOKEN` | 同上（配り直しは運用者のみ） |

いずれも**再起動でルームは全消滅する**。緊急でなければ利用者のいない時間帯に行う。

**AI 機能を丸ごと止めたいとき**は `CLAUDE_CODE_OAUTH_TOKEN` か `AI_UNLOCK_KEY` の
どちらかを消して再起動する。どちらかが未設定なら AI は無効になり、解錠も常に失敗する
（`docs/timer/adr/0008`）。
```

- [ ] **Step 3: リンク検査を通す**

Run: `cd /home/vscode/tasuki-work && git add -A && node scripts/check-links.mjs`
Expected: OK・終了コード 0

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add SECURITY.md deploy/README.md
git commit -m "docs: 脆弱性報告の窓口と秘密の取り扱い・失効手順を明記

- SECURITY.md を新設（非公開報告の経路・対象と対象外・設計上の前提）
- deploy/README.md に秘密 3 つの置き場・配り方・失効手順を追加

Refs #136"
```

---

## Task 17: CSP ヘッダを追加する

**Files:**
- Modify: `deploy/caddy/tasuki.conf`
- Test: `apps/landing/tests/caddy-fragment-order.test.ts`（既存。壊れないことを確認）

**Interfaces:**
- Consumes: ADR 0012 D7（Task 3）
- Produces: なし

> ⚠ **この変更は本番へ届かない。** 稼働中の Caddy 設定は `/etc/caddy/Caddyfile` へ
> インラインで書かれた S4 以前の版であり、`deploy/caddy/tasuki.conf` ではない
> （設計正本 2.6 節）。**本番での確認は #66 の設置作業に引き継ぐ。**
> ここでやるのは「リポジトリの正本を正しくすること」と「手元で壊れないことの確認」まで。

- [ ] **Step 1: `deploy/caddy/tasuki.conf` の header ブロックへ CSP を足す**

既存の `Referrer-Policy` の行の下へ追加する。**インデントは既存に合わせる（このファイルはタブを使っている）。**

```
# CSP（ADR 0012 D7）。
# - script-src は 'self' で足りる。ビルド成果物にインライン script は無い
#   （3 アプリすべてで実測）。favicon が data: URI なので img-src に data: が要る
# - connect-src は 'self' で足りる。WS は同一オリジン（buildSyncUrl が
#   location.host を使う）。公開ドメインを書くとプレースホルダの
#   ドリフト源が 1 つ増える
# - style-src の 'unsafe-inline' は React のインラインスタイルのため。
#   **該当箇所を CSS 変数へ寄せたら外せる。** 外すときはこの値から
#   'unsafe-inline' を削り、実画面で崩れないことを確認する
Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
```

- [ ] **Step 2: Caddy 断片のテストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && corepack pnpm --filter @tasuki/landing test`
Expected: PASS（包括フォールバックがちょうど 1 本・ルーティングの鍵に重複が無い、が保たれている）

- [ ] **Step 3: 手元で CSP を当てて実画面を確認する（憲法 V）**

```bash
cd /home/vscode/tasuki-work && corepack pnpm build
cd apps/timer-web/dist && python3 - <<'PY'
import http.server
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'none'; object-src 'none'")
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        super().end_headers()
http.server.test(HandlerClass=H, port=8099, bind='127.0.0.1')
PY
```

別のシェルからブラウザで `http://127.0.0.1:8099/` を開き、**開発者ツールのコンソールに CSP 違反が出ないこと**を確認する。

Expected: 画面が正常に描画され、CSP 違反の報告が 0 件

> **`style-src` から `'unsafe-inline'` を外して同じ手順を踏み、違反が出ることまで
> 確認する。** 出なければ CSP がそもそも効いていない（観測手段を疑う）。

- [ ] **Step 4: 使ったポートを解放する**

Run: `ss -tlnp | grep 8099`
Expected: 出力なし（プロセスが残っていない）

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add deploy/caddy/tasuki.conf
git commit -m "feat: Caddy に CSP ヘッダを追加

- script-src / connect-src は 'self' で足りる（インライン script 0 件・
  WS は同一オリジンであることを実測）
- style-src の 'unsafe-inline' は React のインラインスタイルのため。
  外す条件をコメントに残す
- 稼働中の本番設定はこのファイルではない（S4 以前の版がホストの
  Caddyfile へインラインで書かれている）。本番での確認は #66 へ引き継ぐ

Refs #136 #66"
```

---

## 完了時にやること

- [ ] `docs/retrospectives/` へ振り返りを書く（`docs/guides/retrospective.md`）
- [ ] Issue #136 へ完了条件の証拠をコメントする。**Task 12 の 5 通りの実際の出力を貼る**
- [ ] #103 へ申し送り: IP の方針（ハッシュ化・窓限定・ログ非出力）が ADR 0012 D3 で決まったこと。**接続単位のレート制限は再接続でリセットされるため、S1 の主防御は #103 であること**
- [ ] 提案 #91 へ申し送り: AI 子プロセスの権限と入力の列挙検証（設計正本 3.4.1 節の受容判断つき）
- [ ] #66 へ申し送り: **本番の Caddy 設定がリポジトリと乖離している**こと・CSP が届くのは設置作業のときであること・`/poker/` が SPA フォールバックに吸われていること
- [ ] #71 へ申し送り: `deploy/caddy/README.md` が記述する import 構成が本番で実現していない
