# AI お題生成の状態可視化 — 設計

- 日付: 2026-06-14
- ステータス: 承認済み（実装前）
- 関連: [[project_tasuki_ai_problem_generation]]、spec `2026-06-12-ai-problem-generation-design.md`

## 背景（実機フィードバック 4 点）

1. AI で生成されているかどうかがわからない
2. AI で生成されたお題と定型のお題の差がわからない
3. AI の生成時間（待ち時間）があるのかわからない
4. （生成中も）定型お題が固まっているようにしか見えない

調査の結果、根本原因は **「別のお題にする」（regenerate）が `problem.request` を送るだけで、
クライアントに「生成中」状態が無い**ことだった。そのため AI 生成中（20〜40 秒）も前のお題が
表示されたまま突然差し替わり、待ち時間も出題元も伝わらない。生成中表示（「AI が作成中…」）は
お題が `null` のとき（初回ロビー）しか出ない。出題元は小さな「AI」チップのみで定型は無印。

この設計は「生成中フィードバック（#3 #4）」と「出題元の明示（#1 #2）」の 2 系統を解消する。
**サーバ・core・WS プロトコルは変更しない**（web の表示層のみ）。

## 決定事項（ブレストで確定）

| 論点 | 決定 |
|------|------|
| 出題元の見せ方 | **AI 生成・定型・持ち込みを全て明示ラベル**（無印を廃止） |
| 生成中表示 | **「別のお題にする」をスピナー＋「生成中…」＋disabled、現お題カードを減光** |

## 変更 1: 生成中状態の管理（#3 #4）

`App.tsx` に `generatingProblem: boolean` の state を追加する。

- **立てる**: `regenerateProblem()`（「別のお題にする」）と、ロビーでの設定変更による再生成
  （`onRoom` 内の `cfgChanged` 経路で `problem.request` を送る箇所）で `true` にする。
- **下ろす**: `onRoom`（snapshot 受信）で `room.problem` が**前回と別オブジェクト/別内容に変化**したら
  `false`。AI 成功・定型縮退・タイムアウト後の確定の**すべての経路**が「新しい problem の配信」で
  終わるため、これ 1 つで全経路をカバーする。
- **安全弁**: 生成が返らない異常（サーバ無応答等）でも固まらないよう、`generatingProblem` を立てた
  ときに **65 秒**（サーバ 60 秒タイムアウト＋余裕）の `setTimeout` を張り、発火したら強制的に
  `false` にする。下ろすときは必ずタイマーを `clearTimeout` する。
- **共有ルームの扱い**: フラグはローカル state なので、生成中表示になるのは「押した本人」だけ。
  本人が立てたフラグを本人の snapshot で下ろす。他人の regenerate でも problem は変わるが、
  その端末では generatingProblem を立てていないので減光は起きない（妥当）。

### 純関数への切り出し（テスト容易性）

「前回 problem と今回 problem を比べて生成完了か判定する」ロジックを純関数として
`apps/web/src/ui/problem-generation.ts`（新規）に切り出す:

```ts
/** 生成中フラグを下ろすべきか。生成中で、かつ problem が前回から変化したら true。 */
export function shouldClearGenerating(
  generating: boolean,
  prevProblem: Problem | null,
  nextProblem: Problem | null,
): boolean
```

判定は「`generating === true` かつ `prevProblem` と `nextProblem` で**お題の内容が変化**した」。
内容変化は `title` または `source` の差で判定する（参照比較は使わない。presence 更新など
お題に無関係な snapshot で room が新規オブジェクトになっても誤って解除しないため）。
`null → problem`（初回確定）も「変化」とみなす。これを App の `onRoom` から呼ぶ。
※ regenerate でたまたま同一 title・同一 source のお題が返る稀ケースは安全弁（65 秒）で解除する。

## 変更 2: 出題元の明示ラベル（#1 #2）

`ProblemEditor.tsx` の `Badges` を、出題元が必ず分かる形にする。`source` の値で分岐:

| `problem.source` | ラベル | 色 |
|---|---|---|
| `"ai"` | **AI 生成**（Sparkles アイコン付き） | signal（朱） |
| `"custom"` | **持ち込み**（現状維持） | ok（緑） |
| `"fallback"` / undefined / その他 | **定型** | グレー（panel-2 + hairline） |

定型お題の `source` は経路により `"fallback"` のことも undefined のこともあるため、
**「`ai`/`custom` 以外はすべて定型」** と判定して取りこぼしを防ぐ。
現状の小さな「AI」チップは「AI 生成」へ文言強化（アイコン併用）。`edited`（編集済）バッジは現状維持。

## 変更 3: 生成中の表示（#3 #4）

`ProblemEditor` に `generating?: boolean` prop を追加する（既定 false＝現状の挙動）。

- 「別のお題にする」ボタン: `generating` のとき **「生成中…」＋`Loader2`（`animate-spin`）＋`disabled`**。
- お題カード本体: `generating` のとき **減光**（`opacity-50` 程度）＋ `pointer-events-none`
  （編集・コピー等の操作を一時無効化）。アクセシビリティのため `aria-busy={generating}` を付与。
- 生成中の見出し文言（Lobby/Session の「お題が未確定」分岐）を出題方式で分岐:
  - AI 解錠ルーム（`room.problemMode === "ai" && room.aiUnlocked`）→ **「AI がお題を作成中…（最大 1 分）」**
  - それ以外 → **「お題を準備中…」**（定型は一瞬で消える）
  - この分岐ロジックは既存 Lobby（299 行付近）にあるものを踏襲・流用する。

`generating` は `App → Lobby/Session → ProblemEditor` へ props で中継する（既存の
`onRegenerateProblem` と同じ経路にもう 1 つ prop を足すだけ）。

## データフロー

```
[別のお題にする] → App.regenerateProblem()
   ├ setGeneratingProblem(true)
   ├ client.send({ command: "problem.request", requestId: ... })   ← 既存
   └ 65 秒の安全弁タイマーを張る
         ↓ サーバ生成（AI 20-40s / 定型 即時 / 失敗→定型縮退・既存の縮退レール）
[snapshot 受信] → App.onRoom(room)
   └ shouldClearGenerating(generating, prevProblem, room.problem) が true
        → setGeneratingProblem(false) + clearTimeout
```

## エラー処理

| 事象 | 挙動 |
|------|------|
| AI 生成成功 | snapshot で problem 変化 → 生成中解除・「AI 生成」ラベル |
| 定型縮退（失敗/タイムアウト） | snapshot で problem 変化（source: fallback）→ 生成中解除・「定型」ラベル |
| サーバ無応答（problem が返らない） | 65 秒の安全弁で生成中を強制解除（カードが永久に減光しない） |
| 連打（生成中に再度押す） | ボタン disabled で多重送信を防ぐ |

## テスト計画

- **web ユニット（`problem-generation.test.ts`）**: `shouldClearGenerating` の真偽
  （生成中＋problem 変化→true / 生成中だが不変→false / 非生成中→false / null→problem→true）。
- **web コンポーネント（`ProblemEditor.test.tsx` 追補）**:
  - `generating` 時にボタン文言が「生成中…」・disabled・カードが `aria-busy` になる
  - 出題元ラベル: `source:"ai"`→「AI 生成」/ `source:"fallback"`→「定型」/ `source:undefined`→「定型」/
    `source:"custom"`→「持ち込み」
- **実機 E2E**: AI 解錠ルームで「別のお題にする」→ スピナー＋減光＋「AI がお題を作成中…」→
  生成完了で新お題＋「AI 生成」ラベル。定型モードでも「定型」ラベルと一瞬の生成中表示を確認。

## スコープ外

- サーバからの「生成中」明示シグナル（progress 通知）の追加 — 楽観的ローカル state で十分。プロトコル不変
- 生成の経過秒・プログレスバー — スピナー＋文言で足りる（YAGNI）
- 出題元ラベルの多言語化 — 既存 UI が日本語前提のため現状踏襲
