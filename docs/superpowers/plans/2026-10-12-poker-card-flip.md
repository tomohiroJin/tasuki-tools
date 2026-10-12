# #348 poker の札をその場でめくり、お題の出し入れを滑らかにする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 票を公開したとき、場の席の伏せた札がその場で席順にめくれて表の値が見え、めくった札がそのまま結果として読める。結果の節は集計（平均・最頻値）だけにする。お題の読む面を隠す・見せる・届く・下ろされるときに、操作の面が一度に跳ばず滑る。動きを抑える設定ではどちらも即座に終わる。

**Architecture:** 席の札を「回る軸・裏・表」の 3 枚にし、`.revealed` で回る軸を CSS の transition で 180° 回す（同じ要素がめくれる）。席順は CSS 変数 `--seat-order` で渡す。お題の脇は閉じても DOM に残して `inert`・`data-state="closed"` にし、64rem 以上の段組みは列を常に 2 本持って `grid-template-columns` と間隔を移り変わらせる。手札の 5 × 2 はコンテナクエリで操作の面の幅から決める。要素層の reduced-motion の一括の手当てに遅延の停止を足す。

**Tech Stack:** CSS・React 19・Vitest（jsdom）・Playwright・node:test

**Spec:** [`docs/superpowers/specs/2026-10-12-poker-card-flip-design.md`](../specs/2026-10-12-poker-card-flip-design.md)（決定 D1〜D10・§8 の検査の表・§9 の受け入れた限界）

## 利用者の判断が要る論点（計画は推奨で書いてある）

| # | 論点 | 推奨 | 推奨しない側を選んだ場合 |
|---|---|---|---|
| Q1 | 結果の節の名前と票の行を消し、各自の票は場の席だけが見せるか | **消す**（同じ票が 2 度出ない。設計正本 D3） | 行を残す。Task 2 が消え、E2E の支援関数も今のまま。席と結果の行で同じ値が 2 度出る |
| Q2 | めくる順と速さ | **席順に 90ms ずつ・8 席で頭打ち・1 枚 0.5 秒。集計は最後の札の後** | 一斉にめくる（`--seat-order` を使わない。Task 1 の U3 と m141 が消える） |
| Q3 | 1920px でお題を開いた状態の手札を 1 行にするか（D9 の見た目の変化） | **する**（脇の有無ではなく操作の面の幅で決めると、切り替えの瞬間に手札が組み替わらない） | 脇の有無で決める今の規則を `data-state="open"` に読み替えて残す（切り替えの瞬間の組み替えが残る） |

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。様式の正本は [`docs/guides/plan-writing.md`](../../guides/plan-writing.md)。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各 Task の Step 1 で赤いテストを先に書き、赤を見てから実装する |
| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない。CSS の機能（`@container`・`@starting-style`・`grid-template-columns` の補間）はブラウザの標準 |
| III. 揮発インメモリと単純運用 | 該当なし | 同期サーバーに触れない |
| IV. 境界の型安全 | 該当なし | wire の形（`RoomStateMessage`）を変えない |
| V. 実画面検証 | 通過 | 統括が撮影と E2E を流し、利用者に Chrome の実物で見てもらう（Task 7） |
| VI. 依存は内向き | 該当なし | ドメイン層に触れない |
| VII. 検査は壊して確かめる | 通過 | 変異 m140〜m145（ユニット）と、E2E の物差しの破壊検証（Task 7・統括） |
| VIII. 記録が正本 | 通過 | 設計正本・`packages/ui/README.md` の約束事と「ここに入れていないもの」・#316 の設計正本 §9.2 の限界の注記 |
| IX. 小さく回す | 通過 | PR 1 本。配布しない（#318 以降とまとめて配る） |
| X. 抽象は実需で | 通過 | めくる札と畳める脇は poker の CSS に置き、部品へ上げない（使うのは poker だけ） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## Global Constraints

- 作業ブランチ `feature/issue-348-card-flip`（worktree `/workspaces/claym/local/Tasuki-wt-348`）。実装役は push・PR・マージ・`git stash`・`git checkout -- <path>`・`git reset`・他ブランチへの checkout をしない。`pnpm install` / `pnpm update` を打たない
- **実装役は `pnpm e2e` / `pnpm dev` / Playwright を打たない**（ポートを他の worktree と奪い合う）。E2E の spec は書いてよい。**E2E の実行・撮影・`node scripts/mutation-check.mjs` の全件は統括が本体側で流す**（`--help` も全件を走らせるので打たない）
- **E2E はルームを 1 つも足さない。** 新しい検査は §8.2 の表の既存のテストの流れの中に置く。新しいタグを足さない
- **生の色を書かない**（`node scripts/audit-ui-components.mjs` が落とす）。札の表と裏はトークン（`--card-sheen`・`--ivory`・`--card-shade`・`--card-edge`・`--coal`・`--card-back`・`--gold-edge`・`--gold-glow`・`--gold-deep`・`--line-strong`）と影 `--shadow-chip` で書く
- **`font-size` は 5 段のトークン**（`packages/ui/tests/typography-scale.test.mjs` がアプリの CSS も読む）。表の字は `--font-size-lg`
- `@media` の幅は `(width >= 64rem)` / `(width < 64rem)` の形だけ。コンテナクエリは段の約束の外（README「幅の段」）
- **画面に新しい文言を足さない**（設計正本 §7）。「札」「裏」「伏」「考」は書体の base 層に無い
- 閉鎖キーワード（Closes / Fixes / Resolves と Issue 番号の組）を文書・コミットに書かない
- 変異は ID 140〜145 だけを使う。パッチの 1 行目は `# 変異 NNN: <名前>`。**パッチを作る・当てる前後で `git status --porcelain` を見る**。当てて赤を見たら `git apply -R` で戻し、`git status --porcelain` が空（またはコミット予定の変更だけ）であることを確かめる
- コマンドは 1 つずつ・各 5 分以内。コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- コメント・注釈は日本語で、既存の文体（である調・体言止め）に合わせる

## Review Focus

1. **公開で席の札が作り直されていない**（作り直すと transition の起点が無く、めくれずに表が出る） → U2（同じ DOM 要素）と E2E の `isConnected`
2. **次のラウンドで札がめくり返らず、値が残らない** → 回る軸の transition は `.revealed` の側にだけ置く。E2E の 2 人目が公開するテスト
3. **閉じた読む面が Tab の行き先・読み上げに残らない**（`inert` と `visibility: hidden`） → U5・E2E の Tab の検査
4. **`resultRow` の付け替えで恒真になる検査が無い**（席の行は公開前から在る） → poker.spec の 492 行目を書き換えたか
5. **64rem をまたぐ幅の変更・お題の無い部屋で操作の面の位置が崩れない**（列を常に 2 本・操作の面を常に 2 列目） → `layout.spec.ts` の既存の 1280「お題が無い」テストと 320 のテスト

## 見積もり

ローカルの実測（2026-10-12・この worktree）: `pnpm --filter @tasuki/poker-web test` 約 6 秒、`pnpm --filter @tasuki/ui test` 約 6 秒、`node scripts/audit-ui-components.mjs` 約 2 秒。E2E と変異の全件は直近の計画（#316 PR 4）の実績値。

| 区分 | 誰が | 1 回 | 回数 | 小計 |
|---|---|---|---|---|
| poker-web のユニット（1 ファイル〜全体） | 実装役 | 約 6 秒 | 約 30 回 | 3 分 |
| `@tasuki/ui` のテスト・`audit-ui-components` | 実装役 | 約 8 秒 | 約 10 回 | 2 分 |
| 変異 1 本を当てて赤を見る（m140〜m145） | 実装役 | 約 30 秒（当てる・走らせる・戻す・`git status`） | 6 回 | 3 分 |
| `pnpm --filter @tasuki/poker-web typecheck` / `lint` | 実装役 | 約 30 秒（推定） | 各 4 回 | 4 分 |
| `pnpm test`・`pnpm typecheck`・`pnpm lint`・`node --test scripts/mutation-check.test.mjs` の一式 | 実装役 | 約 10 分 | 2 回（Task 8・レビュー後） | 20 分 |
| 関係する E2E だけ（`poker`・`poker-a11y`・`layout`・`buttons`） | **統括** | 約 4 分 | 計 8 回（Task 3・4・6 の赤と緑、Task 7 の破壊検証 4 本） | 32 分 |
| E2E 全件 | **統括** | 約 10 分 | 2 回（Task 7・最終） | 20 分 |
| `node scripts/mutation-check.mjs` 全件 | **統括** | 約 14 分 | 1 回（当たらないパッチがあれば +14 分） | 14〜28 分 |
| 撮影（320・768・1280・1920 の公開前後とお題の出し入れ） | **統括** | 約 1 分 | 2 回 | 2 分 |
| **機械の待ち 合計** | | | | **約 1.7〜1.9 時間**（統括 約 1.2〜1.4 時間） |
| **実作業（実装役）** | | | | **5〜8 時間** |

- 増えうるもの: `grid-template-columns` の `fr` の補間が Chromium で効かなかった場合（設計正本 §11 の推測）の作り直し。Task 6 の E2E の最初の赤で分かる。効かなければ止まって統括に報告する（代案: 脇の区画の `width` を移り変わらせ、列を `auto` にする）
- **止まる条件**: 実作業が 10 時間を超える／機械の待ちが 3.5 時間を超える／物差しの直しが製品の直しと同じ量になった → 続ける前に統括へ報告する
- Minor の指摘はまとめて Task 8 の後に直す

---

### Task 1: 席の札をめくれる形にする（ParticipantList）

**Files:** `apps/poker-web/src/components/ParticipantList.tsx`・`apps/poker-web/src/pages/RoomPage.tsx`・`apps/poker-web/tests/participant-list.test.tsx`（新規）・`scripts/mutations/m140-seat-card-remounts-on-reveal.patch`・`m141-seat-flip-order-constant.patch`・`m142-seat-name-stays-voted-after-reveal.patch`（新規）・`scripts/mutation-check.mjs`

**Interfaces:**
- `ParticipantList` の props に `votes: ReadonlyMap<string, Card> | null` を足す（`null` = 投票中）。`RoomPage` は `snapshot.round.status === 'revealed' ? new Map(snapshot.round.votes.map((v) => [v.participantId, v.card])) : null` を渡す（`useMemo` は要らない。席の数は小さい）
- 席の札の DOM:
  ```tsx
  <span
    className={`seat-card${hasVoted ? ' facedown' : ''}${vote ? ' revealed' : ''}`}
    role="img"
    aria-label={vote ? cardLabel(vote) : hasVoted ? '投票済み' : '未投票'}
    style={{ '--seat-order': order } as CSSProperties}
  >
    <span className="seat-card-rotor">
      <span className="seat-card-back" />
      <span className="seat-card-face">{vote ? cardLabel(vote) : ''}</span>
    </span>
  </span>
  ```
  `cardLabel` は `./CardHand` から import する。`order` は `participants.map((p, order) => …)` の添字
- 行の中の印: 投票中は今のまま（`hasVoted` なら「投票済み」のバッジ）。公開後（`votes !== null`）は、票があればバッジを出さず、票が無ければ `<span className="no-vote">未投票</span>`。「切断中」のバッジは今のまま
- key は `p.id` のまま（**状態を混ぜない**）

- [ ] **Step 1: 赤いテストを書く**（`tests/participant-list.test.tsx`。`render`・`rerender` で `ParticipantList` を直接描く）
  - U1: Given 2 人（p1 は `5`、p2 は未投票）の公開後 / When 描く / Then p1 の行の `getByRole('img')` の名前が `5`、p2 の行の名前が「未投票」で字の「未投票」がある。p1 の行に「投票済み」が無い。**対照**: 同じ 2 人の投票中（p1 `hasVoted: true`）では p1 の名前が「投票済み」で、行の文字に `5` が無い
  - U2: Given p1 が投票済みの投票中 / When 同じ props に `votes`（p1 = `8`）を足して `rerender` する / Then p1 の `.seat-card` は描き直し前と**同じ要素**（`toBe`）で、`revealed` を持つ
  - U3: Given 3 人 / When 描く / Then 各行の `.seat-card` の `style.getPropertyValue('--seat-order')` が `'0'`・`'1'`・`'2'`
  - 1 回流して U1〜U3 が赤（`votes` の props が無い・名前が「投票済み」のまま）であることを見る
- [ ] **Step 2: 実装する**（上の Interfaces のとおり。`RoomPage` から `votes` を渡す）
- [ ] **Step 3: 緑を見る**
  ```bash
  pnpm --filter @tasuki/poker-web exec vitest run tests/participant-list.test.tsx
  pnpm --filter @tasuki/poker-web test
  pnpm --filter @tasuki/poker-web typecheck
  ```
- [ ] **Step 4: 変異を 3 本作り、1 本ずつ赤を見る**
  - m140: `key={p.id}` を `` key={`${p.id}:${votes === null ? 'v' : 'r'}`} `` にする → U2 が落ちる
  - m141: `'--seat-order': order` を `'--seat-order': 0` にする → U3 が落ちる
  - m142: `aria-label` の `vote ? cardLabel(vote) :` を外す → U1 が落ちる
  - 作り方: `git status --porcelain` が空（または Task 1 のコミット後）であることを見る → 手で 1 か所だけ変える → `git diff -- apps/poker-web/src/components/ParticipantList.tsx > scripts/mutations/m140-….patch` → `git apply -R scripts/mutations/m140-….patch` → 先頭に既存のパッチと同じ形の注釈（`# 変異 140: seat-card-remounts-on-reveal`・検出を期待するテスト）を足す → `git status --porcelain` に製品コードの変更が無いことを見る
  - 赤の見方: `git apply scripts/mutations/m140-….patch && pnpm --filter @tasuki/poker-web exec vitest run tests/participant-list.test.tsx; git apply -R scripts/mutations/m140-….patch; git status --porcelain`
  - `scripts/mutation-check.mjs` の宣言の末尾（id 125 の後）に 140〜142 を足す（`pkg: "apps/poker-web"`・`tests: ["tests/participant-list.test.tsx"]`・`note` に「#348・設計正本 D1 / D2 / D6」と壊れ方）
- [ ] **Step 5: コミット**（`feat: 公開で席の札をその場でめくれる形にする（#348）` の形。本文に何を・なぜ）

### Task 2: 結果の節を集計だけにする（Results）と E2E の支援関数の付け替え

**Files:** `apps/poker-web/src/components/Results.tsx`・`apps/poker-web/src/pages/RoomPage.tsx`・`apps/poker-web/tests/results.test.tsx`（新規）・`e2e/support/poker.ts`・`e2e/specs/poker.spec.ts`・`e2e/specs/poker-a11y.spec.ts`

**Interfaces:**
- `Results` の props を `{ stats: RoundStats; seatCount: number }` にする。`<section className="results" style={{ '--seat-count': seatCount } as CSSProperties}>` に見出し「結果」と `<dl className="stats">` だけを置く（`.votes` の `<ul>` を消す）
- `RevealedSection` は `<Results stats={stats} seatCount={snapshot.participants.length} />`
- E2E の支援関数（`e2e/support/poker.ts`）:
  - `resultRow(page, name)` を消し、`seatCard(page, name): Locator`（`participantRow(page, name).getByRole('img')`）を足す。公開後の値は `toHaveAccessibleName('5')` で見る（`toContainText` は名前に数字を含む人で恒真になりうる）
  - `resultsSection` は残す（集計の節）

- [ ] **Step 1: 赤いテストを書く**（`tests/results.test.tsx`）
  - U4: Given 平均 5・最頻値 [5] / When `Results` を描く / Then 見出し「結果」・「平均」・「最頻値」があり、`listitem` が 0 個。`.results` の `style.getPropertyValue('--seat-count')` が渡した数
  - 赤を見る（今の `Results` は `participants` と `votes` を要求し、`listitem` を描く）
- [ ] **Step 2: 実装する**
- [ ] **Step 3: E2E の spec を直す**（流さない。統括が Task 3 の後にまとめて流す）
  - `poker.spec.ts` 110・111 行目: `await expect(seatCard(target, HOST), …).toHaveAccessibleName('5')`・`seatCard(target, GUEST)` が `☕`。続けて `await expect(resultsSection(target).getByRole('listitem')).toHaveCount(0)`
  - 同 157・158 行目: `seatCard(page, GUEST)` が `5`。作成者は `participantRow(page, HOST).getByText('未投票', { exact: true })` が見える
  - 同 170 行目の後（次のラウンド）: `await expect(participantRow(target, GUEST)).not.toContainText('5')`（値が残らない）。名前の定数は `e2e-a` / `e2e-b` で `5` を含まない（含む名前に変えると恒真になる。注釈で残す）
  - 同 492 行目: `resultRow(...).toHaveCount(1)` は席の行に付け替えると公開前でも 1 で恒真になる。`await expect(seatCard(page, HOST), '公開後の席の札').toHaveAccessibleName('5')` に書き換える
  - `poker-a11y.spec.ts` 75 行目: `resultsSection(page).getByText('未投票')` → `participantRow(page, 'a11y-voter')` の中の「未投票」（Task 4 で投票者を入れ替えるので、Task 4 と同時に直してよい）
- [ ] **Step 4: 緑を見る**
  ```bash
  pnpm --filter @tasuki/poker-web test
  pnpm --filter @tasuki/poker-web typecheck
  pnpm --filter @tasuki/e2e typecheck
  ```
- [ ] **Step 5: コミット**

### Task 3: 席の札の見た目とめくりの演出（CSS）

**Files:** `apps/poker-web/src/index.css`・`packages/ui/src/elements/card.css`・`packages/ui/README.md`・`e2e/support/poker.ts`・`e2e/specs/poker.spec.ts`

**Interfaces（CSS の骨子。値は設計正本 D1・D2・D4）:**
```css
/* 席の札（#348 D1・D4）: 回る軸・裏・表の 3 枚。公開で回る軸を 180° 回し、同じ札がその場でめくれる。 */
.seat-card {
  position: relative;
  flex: none;
  width: 2.4rem;
  height: 3.3rem;
  border-radius: 6px;
  border: 1.5px dashed var(--line-strong);
  perspective: 30rem;
}
.seat-card.facedown { border-color: transparent; }
.seat-card-rotor { position: absolute; inset: 0; transform-style: preserve-3d; }
/* transition は公開の側にだけ置く。次のラウンドで投票中へ戻るときはめくり返さない。 */
.seat-card.revealed .seat-card-rotor {
  transform: rotateY(180deg);
  transition: transform 0.5s cubic-bezier(0.3, 0.7, 0.2, 1);
  transition-delay: calc(min(var(--seat-order, 0), 8) * 90ms);
}
.seat-card-back, .seat-card-face { position: absolute; inset: 0; border-radius: inherit; backface-visibility: hidden; }
.seat-card-back { display: none; }
.seat-card.facedown .seat-card-back { display: block; /* 今の .seat-card.facedown の地・縁・影と flip-down をここへ移す */ }
.seat-card-face { transform: rotateY(180deg); display: flex; align-items: center; justify-content: center;
  /* 象牙の地・縁・字（.card と同じ材質。.card は当てない: :hover が span にも効く） */ }
.results .stats { animation: stats-rise 0.3s ease both;
  animation-delay: calc(min(var(--seat-count, 1) - 1, 8) * 90ms + 0.45s); }
```
- 消す: `.votes` / `.votes li` / `.votes li:nth-child(n) .card.small` の 6 本（`.no-vote` は席で使うので残す。`.no-vote` の注釈の「票の行の上」を「席の上」に直す）、`packages/ui/src/elements/card.css` の `.card.small`・`.card.small::after`・`@keyframes flip-in`
- README（`packages/ui/README.md`）: 約束事の `.card.small` の行を消す。「ここに入れていないもの」を「伏せ札の裏模様とめくり（`.seat-card`）」に直す（理由は今の文のまま: 使うのは poker だけ）

- [ ] **Step 1: 赤い E2E を書く**（`poker.spec.ts` の `@core` 秘匿のテスト。流すのは統括）
  - `e2e/support/poker.ts` に `recordSeatFlips(page)` と `seatFlips(page)` を足す:
    ```ts
    /**
     * 公開で席の札がめくれる移り変わりを、ブラウザが作った CSSTransition から記録する（#348）。
     * 計算値（transition-delay）を読むのではなく、実際に走った移り変わりを見る。公開の前に呼ぶ。
     */
    export async function recordSeatFlips(page: Page): Promise<void> {
      await page.evaluate(() => {
        const log: { order: number; delay: number; end: number }[] = [];
        (window as unknown as { __seatFlips: typeof log }).__seatFlips = log;
        const seen = new WeakSet<Element>();
        const list = document.querySelector('.participants');
        if (list === null) throw new Error('席の一覧が無い');
        new MutationObserver(() => requestAnimationFrame(() => {
          list.querySelectorAll(':scope > li').forEach((li, order) => {
            const rotor = li.querySelector('.seat-card.revealed .seat-card-rotor');
            if (rotor === null || seen.has(rotor)) return;
            seen.add(rotor);
            for (const a of rotor.getAnimations()) {
              if (!(a instanceof CSSTransition) || a.transitionProperty !== 'transform') continue;
              log.push({ order, delay: Number(a.effect?.getTiming().delay ?? 0), end: Number(a.effect?.getComputedTiming().endTime ?? 0) });
            }
          });
        })).observe(list, { subtree: true, attributes: true, attributeFilter: ['class'] });
      });
    }
    export async function seatFlips(page: Page) {
      return page.evaluate(() => (window as unknown as { __seatFlips: { order: number; delay: number; end: number }[] }).__seatFlips);
    }
    ```
  - テストの中（2 人目が投票した後・最後の投票の前）: 作成者の頁で `const guestSeat = await participantRow(page, GUEST).locator('.seat-card').elementHandle()` と `await recordSeatFlips(page)`
  - 公開の後: `expect(await guestSeat!.evaluate((el) => el.isConnected), '公開で席の札が作り直された').toBe(true)`、`await expect.poll(() => seatFlips(page).then((f) => f.length)).toBe(2)`、席順で並べて `flips[1].delay > flips[0].delay`・各 `end - delay >= 300`（めくりの長さ）
  - **赤の確かめ方**: Task 1・2 だけを当てた状態（CSS は今のまま）では、回る軸に transition が無いので `flips.length` が 0 で落ちる。統括に「Task 3 の Step 1 の赤を見てほしい」と依頼する
- [ ] **Step 2: CSS を書く**（上の骨子。`.seat-card.facedown` の今の地・縁・影・`flip-down` は `.seat-card.facedown .seat-card-back` へ移す）
- [ ] **Step 3: 緑を見る**（手元）
  ```bash
  node scripts/audit-ui-components.mjs
  pnpm --filter @tasuki/ui test
  pnpm --filter @tasuki/ui lint
  pnpm --filter @tasuki/poker-web test
  git grep -n "card small\|card\.small\|flip-in\|\.votes" -- apps packages e2e
  ```
  最後の grep は 0 件（README と設計正本の文の中は除く）。統括に `poker.spec.ts`・`poker-a11y.spec.ts`・`buttons.spec.ts` を流してもらう
- [ ] **Step 4: コミット**

### Task 4: 動きを抑える設定では遅延も止める

**Files:** `packages/ui/src/elements/reset.css`・`packages/ui/tests/reduced-motion.test.mjs`（新規）・`packages/ui/README.md`・`e2e/specs/poker-a11y.spec.ts`・`scripts/mutations/m145-reduced-motion-keeps-delays.patch`（新規）・`scripts/mutation-check.mjs`

- [ ] **Step 1: 赤いテストを書く**
  - `packages/ui/tests/reduced-motion.test.mjs`（node:test）: `src/elements/reset.css` を読み、`@media (prefers-reduced-motion: reduce)` のブロックの中に `animation-delay: 0s !important` と `transition-delay: 0s !important` があることを見る。**対照**: 同じブロックに今ある `animation-duration: 0.01ms !important` も見つかること（ブロックの切り出しを誤って空を読んでいないか）
  - `poker-a11y.spec.ts` の 2 つ目（1 人だけが投票）を書き換える:
    - 冒頭で `await page.emulateMedia({ reducedMotion: 'reduce' })`
    - **投票するのは 2 人目（`idle`・席順 1）にし、作成者（`page`・席順 0）は未投票のまま**、作成者が「票を公開する」を押す。席順 0 は遅延が元から 0 で、遅延を止めない誤りと区別できない
    - 押す前に `await recordSeatFlips(page)`、公開後に `seatFlips(page)` の席順 1 の `end <= 1`（ms）。`flips.length` が 1 であることも見る（0 本なら何も測っていない）
    - 「未投票」の印は作成者の席（`participantRow(page, 'a11y-voter')`）にある。印の組（`--ivory-faint` on `--felt-sink`）の照合はそのまま（席の地も `--felt-sink`）
    - テスト名と冒頭の注釈を直す（`1 人だけが投票` は保つ。参加者の名前の意味が入れ替わるので、`a11y-voter` / `a11y-idle` の名前を `a11y-creator` / `a11y-voter` に改める）
  - 手元で `pnpm --filter @tasuki/ui test` が赤であることを見る
- [ ] **Step 2: 実装する**（`reset.css` の該当ブロックに 2 行を足す。注釈: 「遅延も止める。止めないと `fill-mode: both` の 0% の姿で消えたまま待つ（#348）」）。README の約束事の reduced-motion の行に「遅延も止める」を足す
- [ ] **Step 3: 緑を見る**
  ```bash
  pnpm --filter @tasuki/ui test
  pnpm --filter @tasuki/ui lint
  ```
- [ ] **Step 4: 変異 m145 を作り、赤を見る**（2 行を落とす。`pkg: "packages/ui"`・`tests: ["tests/reduced-motion.test.mjs"]`）。作り方と戻し方は Task 1 の Step 4 と同じ
- [ ] **Step 5: コミット**

### Task 5: お題の脇を閉じても DOM に残す（RoomPage）

**Files:** `apps/poker-web/src/pages/RoomPage.tsx`・`apps/poker-web/src/components/CurrentTopic.tsx`（注釈だけ）・`apps/poker-web/tests/current-topic.test.tsx`・`scripts/mutations/m143-topic-side-unmounts-when-closed.patch`・`m144-topic-side-not-inert-when-closed.patch`（新規）・`scripts/mutation-check.mjs`

**Interfaces:**
```tsx
{sync.topic && (
  <div
    className="ui-workspace-side room-topic-side"
    data-state={topicOpen ? 'open' : 'closed'}
    inert={!topicOpen}
  >
    <CurrentTopic topic={sync.topic} />
  </div>
)}
```
- 切り替えのボタンの `aria-controls={TOPIC_CARD_ID}` を常に付ける（「消えた id を指さない」の注釈を「閉じても札は DOM に残る（幅 0・`inert`）」に直す）
- `RoomPage` と `CurrentTopic` の注釈の「受け入れた限界（お題が掲げられる・下ろされる瞬間に…横へ動く）」を、設計正本 D7・D8 に合わせて書き直す（動きは残るが滑る。下ろされた札は即座に消える）

- [ ] **Step 1: 赤いテストを書き換える**（`tests/current-topic.test.tsx` の「poker のお題は手元で隠せる」）
  - U5: Given お題が開いている / When 「お題を隠す」を押す / Then `#poker-topic-card` は在り、`.ui-workspace-side` は `inert` と `data-state="closed"` を持ち、「お題を見る」の `aria-expanded` は `false`・`aria-controls` は `poker-topic-card`。もう一度押すと `inert` が外れ `data-state="open"`
  - U6（「隠している / お題が差し替わる」の書き換え）: 差し替わっても `data-state="closed"` と `inert` のまま
  - 「お題が無い」テストは今のまま（区画も切り替えも無い）
  - 赤を見る（今は区画ごと消える）
- [ ] **Step 2: 実装する**
- [ ] **Step 3: 緑を見る**
  ```bash
  pnpm --filter @tasuki/poker-web exec vitest run tests/current-topic.test.tsx
  pnpm --filter @tasuki/poker-web test
  pnpm --filter @tasuki/poker-web typecheck
  pnpm --filter @tasuki/poker-web lint
  ```
  （React 19 の `inert` は真偽値で渡せる。`@types/react` が受けなければ止まって統括に報告する）
- [ ] **Step 4: 変異 m143・m144 を作り、1 本ずつ赤を見る**
  - m143: `{sync.topic && (` を `{sync.topic && topicOpen && (` にする → U5 が落ちる
  - m144: `inert={!topicOpen}` を消す → U5 が落ちる
- [ ] **Step 5: コミット**

### Task 6: お題の出し入れの移り変わりと手札の並び（CSS）

**Files:** `apps/poker-web/src/index.css`・`e2e/specs/layout.spec.ts`・`e2e/specs/poker-a11y.spec.ts`・`docs/superpowers/specs/2026-10-08-responsive-layout-design.md`（§9.2 と §10.1 の限界に「#348 で滑るようにした」と 1 行ずつ）

**Interfaces（CSS の骨子・設計正本 D7〜D9）:**
```css
/* 閉じた読む面は DOM に残し、幅 0 で持つ（#348 D7）。閉じるときは不透明度を先に落とし、列が縮み切ってから visibility を外す。 */
.room-topic-side[data-state='closed'] {
  opacity: 0;
  visibility: hidden;
  overflow: clip;
  transition: opacity 0.15s ease, visibility 0s linear 0.32s;
}
.room-topic-side[data-state='open'] {
  opacity: 1;
  transition: opacity 0.2s ease 0.12s, visibility 0s;
}
@starting-style {
  .room-topic-side[data-state='open'] { opacity: 0; }
}
@media (width < 64rem) {
  .room-topic-side[data-state='closed'] { display: none; }
}
@media (width >= 64rem) {
  /* 列を常に 2 本持つ。本数が変わると grid-template-columns は補間できない（設計正本 §2 の 5） */
  .room .ui-workspace--reader {
    grid-template-columns: minmax(0, 0fr) minmax(0, 1fr);
    column-gap: 0;
    transition: grid-template-columns 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), column-gap 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .room .ui-workspace--reader:has(> .room-topic-side[data-state='open']) {
    grid-template-columns: minmax(0, 0.75fr) minmax(0, 1fr);
    column-gap: var(--space-6);
  }
  .room .ui-workspace--reader > .ui-workspace-main { grid-column: 2; }
}
.room-main {
  width: 100%;
  max-width: 100%;
  margin-inline: auto;
  container: room-main / inline-size;
  transition: max-width 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.room .ui-workspace--reader:not(:has(> .room-topic-side[data-state='open'])) > .room-main { max-width: 46rem; }
/* 手札の 5 × 2 は操作の面の幅で決める（D9）。1 行に 10 枚が収まる幅 = 10 × 3.4rem + 9 × 0.55rem = 38.95rem */
@container room-main (width < 39rem) {
  .card-hand { display: grid; grid-template-columns: repeat(5, max-content); }
}
```
- 消す: `.ui-workspace:not(:has(> .ui-workspace-side)) > .room-main`・`.room .ui-workspace--reader:has(> .ui-workspace-side)`・`.ui-workspace:has(> .ui-workspace-side) .card-hand`（D10）
- 詳細度: 部品の `.ui-workspace:not(:has(> .ui-workspace-side))`（(0,2,0)）と `.ui-workspace-main:where(…)`（(0,1,0)）に、poker の `.room .ui-workspace--reader`（(0,2,0)・後に読む）と `.room .ui-workspace--reader > .ui-workspace-main`（(0,3,0)）が勝つ。各規則の直前に注釈で書く
- `.room-main` の既存の `display: grid; gap` は残す

- [ ] **Step 1: 赤い E2E を書く**（流すのは統括）
  - `layout.spec.ts` の支援関数 `openPokerWithTopic` の隣に、お題ツールの頁も返す `openPokerWithTopicTool(page, openPeer, body?) => { url, topicPage }` を足す（中身は同じ。既存の呼び出しは変えない）
  - 支援関数 `slideMidway(page, buttonName)`: 1 つの `evaluate` の中で、操作の面の左端 `from` を測る → ボタン（`aria-controls` を持つ切り替え）を `click()` → `requestAnimationFrame` を 2 回待つ → 段組み（`.room .ui-workspace--reader`）の `getAnimations({ subtree: true })` から `CSSTransition` を全部集めて `pause()`、各々の `currentTime` を「遅延 + 長さ × 0.3」に合わせる → 左端 `mid` を測る → 全部 `finish()` → 左端 `to` を測る。`{ count, gridCount, from, mid, to }` を返す（`gridCount` は `transitionProperty === 'grid-template-columns'` の本数）
  - 「お題を隠す」を押すテスト（1280）を書き換える:
    - 隠す: `gridCount >= 1`、`Math.abs(to - from) > 100`（前提: 開いた位置と閉じた位置が離れている）、`mid` が `from` と `to` の間にあり両端から 5% 以上離れている
    - 隠した後: `.ui-workspace-side` の幅 ≤ 1px、`getByRole('region', { name: 'お題', exact: true })` が 0 件、`#poker-topic-card` は在る（`aria-controls` の指し先）、`aria-expanded="false"`、`document.activeElement` が「お題を見る」、`expectMainCentered(page)`
    - Tab: 「お題を見る」から Tab を 6 回押し、毎回 `document.activeElement.closest('.ui-workspace-side') === null`
    - 見せる: 同じ `slideMidway` で `gridCount >= 1` と途中の位置。終わった後に読む面が見える
    - 下ろす・掲げ直す: `openPokerWithTopicTool` で開き、段組みの `childList` を見張る `MutationObserver` を仕掛けて、区画の出入りの次のフレームに段組みの `CSSTransition`（`grid-template-columns`）の本数を記録する。お題ツールで「場から下げる」を押す → 記録が 1 本以上。`setTopic(topicPage, …)` で掲げ直す → 記録が 1 本以上
  - 1920 の開いた状態のテスト: 手札の札の上端の集合の大きさが 1（D9）。1280 の「札は操作の面より狭い」テスト: 大きさが 2
  - `poker-a11y.spec.ts` の 1 つ目: 冒頭で `poker.page.emulateMedia({ reducedMotion: 'reduce' })`。走査（公開後）の後に「お題を隠す」を `evaluate` の中で押し、2 フレーム後に区画の幅 ≤ 1px と `getComputedStyle(side).visibility === 'hidden'` を見る（遅延が残ると 0.32 秒 `visible`）
  - **赤の確かめ方**: Task 5 だけを当てた状態（CSS は今のまま）では、閉じた区画が残っても列は 2 本のまま（部品の `:has(> .ui-workspace-side)` が真のまま）で操作の面が動かず、`Math.abs(to - from) > 100` と `gridCount` で落ちる。統括に流してもらう
- [ ] **Step 2: CSS を書く**
- [ ] **Step 3: 緑を見る**（手元）
  ```bash
  node scripts/audit-ui-components.mjs
  pnpm --filter @tasuki/ui test
  pnpm --filter @tasuki/poker-web test
  ```
  統括に `layout.spec.ts`・`poker-a11y.spec.ts`・`buttons.spec.ts` を流してもらう。**`gridCount` が 0 のまま（`fr` の補間が効かない）なら止まって報告する**（見積もりの「増えうるもの」）
- [ ] **Step 4: #316 の設計正本の §9.2 と §10.1 の「受け入れた限界」の項に「#348 で滑るようにした（下ろされた札は即座に消える）」を足す**（末尾への追記ではなく、該当の箇条の後ろに括弧書きで足す。新しい節を作らない）
- [ ] **Step 5: コミット**

### Task 7: E2E の全件・破壊検証・撮影（統括）

実装役は行わない。統括が本体側で直列に流す。

- [ ] E2E の関係分（`poker`・`poker-a11y`・`layout`・`buttons`）と全件を流す
- [ ] **E2E の物差しの破壊検証**（1 本ずつ壊して赤を見る。終わったら作業ツリーが元に戻ったことを `git status --porcelain` で見る）
  1. `.seat-card.revealed .seat-card-rotor` の `transition` を消す → `@core` の `flips.length` で落ちる
  2. `transition-delay` の式を `0s` にする → `flips[1].delay > flips[0].delay` で落ちる
  3. `reset.css` の遅延の 2 行を消す → `poker-a11y` の 2 つ目（`end <= 1`）と 1 つ目（`visibility`）で落ちる
  4. `.room .ui-workspace--reader` の `transition` を消す → `layout.spec` の `gridCount` で落ちる
- [ ] `node scripts/mutation-check.mjs` 全件（m140〜m145 が殺されること。既存の poker-web の変異（m18・m19・m37・m100 など）のパッチが `RoomPage.tsx` の変更で当たらなくなっていないこと）
- [ ] 撮影: 320・768・1280・1920 で、投票中（伏せた札 2 枚）・公開の途中（めくりの最中）・公開後・お題を隠した後
- [ ] 実物の確認を利用者に依頼する（Chrome。めくる速さ・順・札の大きさ・お題の出し入れ）

### Task 8: 仕上げ

**Files:** `docs/superpowers/specs/2026-10-12-poker-card-flip-design.md`（実装で決めたことの節を末尾に足す）

- [ ] 一式を流す
  ```bash
  pnpm test
  pnpm typecheck
  pnpm lint
  node --test scripts/mutation-check.test.mjs
  node scripts/audit-ui-components.mjs
  ```
- [ ] 設計正本の末尾に「12. 実装で決めたこと」を足す（計画から外れたこと・実測で変えた値。決定を記録する段で完了形を書かない）
- [ ] `git grep -n "resultRow\|card small\|flip-in"` が 0 件（文書の中の経緯の記述を除く）
- [ ] コミット
