# うちわけ（#476）実装計画

> マージ後の節は書き換えない。後から分かったことは末尾の補遺の節に書き、置き換えた古い節の末尾に改定の印を足す（`docs/guides/design-doc-revision.md`）。

**Goal:** ルームの全員で作業の内訳を記録し、Markdown で持ち帰る道具「うちわけ」（`/track/`・`?tool=track`）を 1 本の PR で足す。

**Architecture:** roulette・agenda・checkin と同じ型。規則は 8 つ目の文脈 `packages/track-core`（直接遷移関数 ＋ `Result`・時計は引数）に置き、`apps/tasuki-sync` に接続の種類を足し、画面は `apps/track-web` が持つ。

**Tech Stack:** TypeScript・valibot・neverthrow・fast-check・vitest・Bun（同期サーバーの試験）・React 19・Vite・Playwright。新しい依存は足さない。

**Spec:** [`docs/superpowers/specs/2026-11-23-track-uchiwake-design.md`](../specs/2026-11-23-track-uchiwake-design.md)（以下「設計」）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各 Task を Red → Green で書く。core は性質テストも先に置く |
| II. 技術選定は ADR を通す | 通過 | 新しい依存は無い。新しい文脈は ADR（Proposed）に書き、採択は利用者が行う |
| III. 揮発インメモリと単純運用 | 通過 | 状態は `InMemoryTrackStore` だけ。ルームの破棄で消す。端末にも保存しない |
| IV. 境界の型安全 | 通過 | コマンドは `v.strictObject`、遷移は `Result`、ドメインは例外を投げない |
| V. 実画面検証 | 通過 | Task 6 で E2E と実画面の撮影を行う |
| VI. 依存は内向き | 通過 | `track-core` は `@tasuki/*` に依存しない。時計・猶予の予約は注入する |
| VII. 検査は壊して確かめる | 通過 | Task 7 で変異を宣言し、`--id` で検出を確かめる。監査の登録は壊して赤を見る |
| VIII. 記録が正本 | 通過 | 決定は ADR、要求は #476、上限の値は `limits.ts` を正本にする |
| IX. 小さく回す | 通過 | PR 1 本（`docs/guides/pr-granularity.md` の分ける理由に当たらない）。配布は利用者が 1 回で行う |
| X. 抽象は実需で | 通過 | 共有先を新しく作らない。写しで足りる所は写す（手元の時計のフックほか） |
| XI. 秘密と個人情報を持ち込まない | 通過 | 作業名を「個人に紐づく」に置く（`docs/adr/0011` の追記）。ハンドラはログを書かない。誰が押したかを持たない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- 上限と既定値の正本は `packages/track-core/src/limits.ts`（値は設計 §4.6 の表）
- エラー値は判別子 `code` だけを持ち、文言は `error-messages.ts` に置く（`scripts/audit-domain-error-shape.mjs`）
- 画面に出す文言は書体の base 層に収める
- wire のフレームは非 strict で受け、コマンドは strict で受ける
- 検査と配布の前に `PATH=/home/vscode/.local/node-v26.13.1-linux-x64/bin:$PATH` を付ける（手元のシステムの Node は 22）
- Bash は 1 呼び出しに 1 操作（`AGENTS.md`「コマンドの書き方」）
- 変異 ID は 2470〜2599 を予約する
- 実装は 1 つの作業ツリー・1 人（まとめ役自身）で順に進める。レビュー役は読むだけにする

## Review Focus

試験が自然には踏まない、利用者が踏みやすい条件。各行の試験は、持ち主の Task に足す。

1. **候補の連打**（1 秒未満で切り替え直す）— 区切りが増えず、付け替えになる（Task 1）
2. **裏のタブから戻る・再読み込み** — 経過がサーバーの時計と合う（Task 3 の `track.sync`・Task 4 の手元の時計）
3. **2 人がほぼ同時に別の作業へ切り替える** — 後に届いた方が残り、区切りは重ならない（Task 1 の性質テスト・Task 3 の実 WS の試験）
4. **分単位で入れた時刻と ms の境界のずれ** — 上書きで 1 秒未満の端切れが残らない（Task 1）
5. **作業名に `|`・改行のような記号・絵文字・200 字のお題** — Markdown の表が崩れず、候補は 80 字で切れる（Task 2）

## File Structure

| 置き場 | 新規／変更 | 責務 |
|---|---|---|
| `packages/track-core/src/limits.ts`・`types.ts`・`errors.ts` | 新規 | 上限・型・エラーコード |
| `packages/track-core/src/label.ts` | 新規 | 作業名の正規化と検証（`normalizeLabel`・`hasControlChars`） |
| `packages/track-core/src/track.ts` | 新規 | 計測の遷移（`start`・`stop`・`undo`・`autoStop`・`clear`・`pin`・`dismissOffer`）と `toView` |
| `packages/track-core/src/edit.ts` | 新規 | 手直し（`setSegment`・`adjustSegment`・`splitSegment`・`insertSegment`・`removeSegment`・`adjustRangeOf`） |
| `packages/track-core/src/projection.ts` | 新規 | `advanceNow`・`totalsOf`・`candidatesOf`・`previousLabelOf`・`longRunningOf` |
| `packages/track-core/src/markdown.ts` | 新規 | `toMarkdown` |
| `packages/track-core/src/schemas.ts`・`error-messages.ts`・`index.ts` | 新規 | 境界のスキーマ・文言・公開面 |
| `apps/tasuki-sync/src/{ports,adapters,application,assembly}/track-*` | 新規 | 保管・フレームの型・ハンドラ・配信・全員切断の猶予・組み立て |
| `apps/tasuki-sync/src` の一覧（`tool-id.ts`・`raw-tools.ts`・`vocabulary.ts`・`destroy-room.ts`・`config.ts`・`create-sync-server.ts`） | 変更 | 道具を足す手順 1〜5（`raw-tools.ts` の docstring） |
| `apps/track-web` | 新規 | 画面・同期フック・手元の時計・キーボード・タブタイトル・コピー |
| `apps/landing`（`tools.ts`・`ToolMark.tsx`・試験） | 変更 | 7 枚目の札 |
| `deploy/track`・`deploy/caddy/tasuki.conf`・`deploy/README.md` | 新規／変更 | 配備資材 |
| `e2e`（`harness/paths.ts`・`specs/track.spec.ts`・`support/track.ts` ほか一覧） | 新規／変更 | E2E |
| `scripts/audit-*.mjs`・`scripts/lib/mutation-declarations.mjs`・`scripts/mutations/` | 変更 | 監査の列挙・変異 |
| `docs/adr/0038-*.md`・`docs/adr/0011`・`docs/adr/0017`・`docs/adr/README.md`・`docs/guides/architecture.md`・`docs/guides/development.md`・`README.md`・`packages/ui/README.md` | 新規／変更 | 決定と文書 |

道具の外で触る場所は、checkin を足した PR（`git show --stat 4ed78e21`）と `git grep -lw checkin` の両方で引いて突き合わせる。

## Tasks

各 Task は「試験を書く → 赤を見る → 実装 → 緑 → コミット」で進める。コミットは Task ごとに 1 つ以上。

### Task 1: `track-core` の遷移と手直し

**Produces**（後の Task が使う名前）:

```ts
export const INITIAL: (epoch: { mono: number; wallMs: number }) => TrackState; // createTrackState
export function start(s, input: { label: string; kind: SegmentKind; backMin?: BackMinutes; now: number }): Result<TrackState, TrackError>;
export function stop(s, input: { backMin?: BackMinutes; now: number }): Result<TrackState, TrackError>;
export function undo(s, input: { rev: number; now: number }): TrackState;          // 合わなければ同じ参照
export function autoStop(s, input: { at: number }): TrackState;                    // 計測していなければ同じ参照
export function clear(s, now: number): TrackState;
export function pin(s, input: { label: string; pinned: boolean }): Result<TrackState, TrackError>;
export function dismissOffer(s): TrackState;
export function setSegment(s, input: { id; label; kind }): Result<…>;
export function adjustSegment(s, input: { id; edge: "start" | "end"; atMs; now }): Result<…>;
export function splitSegment(s, input: { id; atMs; label; kind; now }): Result<…>;
export function insertSegment(s, input: { startMs; endMs; label; kind; now }): Result<…>;
export function removeSegment(s, input: { id }): Result<…>;
export function toView(s, now: number): TrackView;
```

- `now`・`at` は単調時計の値。時刻軸の位置は `now - s.epochMono`
- 状態が変わらないときは同じ参照を返す。変わるときは `rev` を 1 進める
- エラーコード: `TRACK_BACKDATE_TOO_FAR`・`TRACK_FULL`・`TRACK_INVALID_RANGE`・`TRACK_INVALID_LABEL`・`SEGMENT_NOT_FOUND`・`SEGMENT_RUNNING`・`PIN_LIMIT`
- 試験: 例示（`track.test.ts`・`edit.test.ts`）と性質（`track-invariant.test.ts`。任意の操作列の後で設計 §4.2 の不変条件 1〜5 が成り立つ・取り消すと直前の区切りの列に戻る）
- Review Focus 1・3・4 の試験をここに置く

### Task 2: `track-core` の集計・候補・Markdown・スキーマ

**Produces:**

```ts
export function advanceNow(view: TrackView, sinceReceivedMs: number): number;      // 画面の「いま」の位置
export function totalsOf(view, nowMs): Totals;       // { rows: { label; ms; ratio }[]; workMs; breakMs; totalMs }
export function candidatesOf(view, topicTitle: string | null): Candidate[];        // { label; source: "topic" | "pinned" | "recent"; pinned }
export function previousLabelOf(view): string | null;                             // C キー
export function longRunningOf(view, nowMs): SegmentView | null;                    // 90 分の知らせ
export function adjustRangeOf(view, id, edge, nowMs): { minMs; maxMs } | null;
export function toMarkdown(view, nowMs, tzOffsetMin: number): string;
export const TrackCommandSchema, TrackFrameSchema, TrackErrorFrameSchema, TRACK_ERROR_CODES;
export function trackErrorMessageFor(code): string;
```

- Markdown の形と逃がし方は、先に timer のまとめ（#408）と poker の記録（#645）の実装を読んで合わせる
- Review Focus 5 の試験をここに置く
- 監査への登録（`audit-dependency-direction`・`audit-domain-error-shape`・`audit-domain-side-effects`・`audit-structure`）もこの Task で行い、登録を外して赤になることを見る

### Task 3: 同期サーバーの経路

- `raw-tools.ts` の docstring の手順 1〜6 に従う。`RAW_BROADCAST.track` は `true`
- `track-handlers.ts`: 参加は `joinToolRoom`。状態は最初の参加で置く（時刻軸の基準）。コマンドは在席を名簿で確かめてから当てる。変わらなければ送り主にだけ返す。ログを書かない
- `track-auto-stop.ts`: `onRosterBroadcast` で名簿を数え直す。全員が不在なら時刻を覚えて猶予を予約し、戻れば消す。猶予の後に `autoStop`。予約は `destroy-room.ts` の必須の依存と `close` で消す
- `config.ts`: `TRACK_AUTO_STOP_GRACE_MS`（既定 60 秒。試験は縮める）
- 試験: ハンドラの単体・保管・破棄・実 WS（参加 → 開始 → 2 本目の接続に同じ写しが届く・全員切断 → 猶予 → 印つきで閉じる・猶予の内に戻れば閉じない・track 以外の接続から `track.*` が通らない）
- 一覧に追従する既存の試験（`tool-id.test.ts`・`raw-tools.test.ts`・`connection-error-text*.test.ts` ほか）を直す
- Review Focus 2・3 の実 WS の試験をここに置く

### Task 4: 画面 `apps/track-web`

- 骨組みは `apps/agenda-web` を手本にする（`App.tsx`・`router.ts`・`server-message.ts`・`hooks/use-track-sync.ts`・`screens/TrackRoom.tsx`）
- 部品: `NowPanel`（いま・止める・休憩・取り消し）・`SwitchPanel`（入力・さかのぼり・候補）・`TotalsPanel`（帯と表）・`Timeline`（一覧・直す・抜けを足す）・`TakeawayPanel`（コピー・消す）・`Notices`（問いかけ・90 分の知らせ）
- フック: `use-track-clock`（表示する秒が変わるときだけ描き直す）・`use-track-keys`（1〜9・S・C。入力中と IME の変換中は拾わない）・`use-tab-title`
- 余白・段組み・ボタンは `packages/ui/README.md`「画面を組む」に従う。新しい画面を足す手順（同 README）を踏む
- 試験: 各部品・フック・境界のパース・`copy-fits-font-base`・`screens-do-not-import-sync-client`・余白の CSS の試験（agenda-web にある型を写す）

### Task 5: 玄関の札・配備・文書

- `apps/landing/src/tools.ts` に札を足し、`ToolMark.tsx` に意匠（積み上げた帯）を足す。札の文言が base 層に無ければ設計 J7 のとおり言い換える
- `deploy/track/`（`NOTES.md`・`app.env`・`caddy/80-track.conf`）と `deploy/caddy/tasuki.conf`・`deploy/README.md`
- `packages/dev-hub-redirect`・`turbo.json`・`apps/landing/vite.config.ts` の一覧
- ADR 0038（Proposed）・`docs/adr/0011` と `docs/adr/0017` の追記・`docs/adr/README.md`・`docs/guides/architecture.md`（層の表・用語集）・`docs/guides/development.md`・`README.md`

### Task 6: E2E と実画面

- `e2e/harness/paths.ts`・`e2e/specs/track.spec.ts`（開始 → 切り替え → 休憩 → 取り消し → 手直し → コピー・2 つの画面で同じ内訳）・一覧に追従する spec（`routing`・`site-exterior`・`landing`・`buttons` ほか）
- `docs/guides/procedures/live-check.md` に従って、幅 320・768・1280 で撮り、段組みと溢れを目で見る。動きを減らす設定でも見る

### Task 7: 変異・全件の検査・レビュー・PR

- `docs/guides/procedures/mutations.md` に従って変異を宣言する（不変条件・短い区切り・端切れ・取り消しの期限・休憩を割合から外す・全員切断の猶予・在席の確認・Markdown の逃がし）。`--id` で検出を見て、全件の `apply --check` と自己テストを流す
- `pnpm check:fast`。宣言の表を触るので変異が全件へ倒れたら止め、`--list` の段を 1 本ずつ流す
- 別のエージェントの敵対的レビュー（`docs/guides/procedures/adversarial-review.md`）→ PR → `/code-review` → 直し → 直した差分のレビュー
- PR 本文は 3 区分（変えたこと・確かめたこと・確かめられなかったこと）。閉鎖キーワードは書かない（#476 は第 2 段が残る）

## 検証の時間の見積もり

直前の実行の記録（手元のメモ: `pnpm test` 全体が約 40 秒・E2E が数分）を根拠にした見込み。2 倍を超えたら利用者へ報告する。

| 検証 | 1 回 | 回数 | 計 |
|---|---|---|---|
| `track-core` の単体（`pnpm --filter @tasuki/track-core test`） | 約 10 秒 | 20 | 約 4 分 |
| 同期サーバーの単体と実 WS（`@tasuki/sync`） | 約 1 分 | 8 | 約 8 分 |
| `track-web` の単体 | 約 30 秒 | 15 | 約 8 分 |
| 型・lint（触ったパッケージ） | 約 1 分 | 8 | 約 8 分 |
| E2E（track の spec だけ） | 約 2 分 | 5 | 約 10 分 |
| E2E 全件 | 約 5 分 | 2 | 約 10 分 |
| 変異（`--id` で足した分） | 約 10 分 | 2 | 約 20 分 |
| `pnpm check:fast`（変異を除く段） | 約 5 分 | 3 | 約 15 分 |
