# タスク: 参加者行 UI の部品共通化（Lobby / RosterPanel）

**入力:** `plan.md`（＋ `spec.md` ・ `baseline.md`）。タスクは**コーディングのみ**。
TDD: 実装の前に失敗するテストを書く（red → green → refactor）。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = 仕様へのトレース。

**各タスクの完了時点でコミット可能であること**（中間状態で
`pnpm typecheck && pnpm lint && pnpm build && pnpm test` が全パッケージで緑）。
作業ディレクトリはすべて `tdd-mob-pro-timer/apps/web/` を起点とする相対パスで示す。

> 本タスク一覧は要件レビューを反映済み（2026-07-31）。旧 Draft にあった `RosterRow.tsx`
> （`variant` 分岐で行全体を共通化する設計）と、旧 T011・T012（在席の `sr-only` テキストを
> Lobby へ追加する。旧 FR-013）は撤回・削除した。一本化の単位は「実装が一致している部品
> だけを共有コンポーネント化する」に変更されている（`PresenceDot` / `RemovalConfirmDialog`
> の2部品のみ。詳細は plan.md）。

---

## フェーズ1 — セットアップ

- [ ] **T001** [P] `src/ui/components/PresenceDot.tsx` を新設する。この時点では
  `interface PresenceDotProps { presence: Participant["presence"] }` の型定義と、
  何も描画しない空の関数コンポーネント（`return null` 相当）のみを置く。
  既存の `Lobby.tsx` / `RosterPanel.tsx` からはまだ参照しない（この段階では import しない）。
  _要件: FR-176_
- [ ] **T002** [P] `src/ui/components/RemovalConfirmDialog.tsx` を新設する。この時点では
  `plan.md` の「コンポーネントとインターフェース」節に定義した `RemovalConfirmDialogProps` 型と、
  何も描画しない空の関数コンポーネント（`return null` 相当）のみを置く。
  既存の `Lobby.tsx` / `RosterPanel.tsx` からはまだ参照しない。
  _要件: FR-177_

---

## フェーズ2 — `PresenceDot` の実装（TDD）

- [ ] **T003** `test/ui/components/PresenceDot.test.tsx` を新設し、**失敗するテスト**を書く。
  `presence.ts` の `presenceDotClass()` が返す値ごと（`online`/`offline` 等、既存の
  `Presence` 型が持つ全ケース）に、`PresenceDot` が対応するクラスを持つ `<span>` を
  描画し `aria-hidden="true"` を持つことを検証する。この時点では T001 が空実装のため
  全テストが失敗する。
  _要件: FR-176, FR-178 (US1)_
- [ ] **T004** T003 を通すため `src/ui/components/PresenceDot.tsx` を実装する（green）。
  `presenceDotClass()`（`../presence.js`、変更しない）をそのまま呼び出し、
  `<span className={\`h-2 w-2 shrink-0 rounded-full ${presenceDotClass(presence)}\`} aria-hidden="true" />`
  を返す。`Lobby.tsx` 234行目・`RosterPanel.tsx` 229〜232行目の既存のクラス文字列と
  比較し、Tailwind ユーティリティクラスの並び順の違いが視覚出力に影響しないことを
  確認した上で1つに統一する。
  _要件: FR-176, FR-178 (US1)_

---

## フェーズ3 — `RemovalConfirmDialog` の実装（TDD）

- [ ] **T005** [P] `test/ui/components/RemovalConfirmDialog.test.tsx` を新設し、
  **失敗するテスト**を書く。検証内容:
  (a) `pendingRemoval={null}` のとき何も描画しない、
  (b) `pendingRemoval` が非 `null` のとき `participantLabel()` で組み立てたタイトル
  （`"${label}を退出させますか？"`）・`confirmLabel="退出させる"`・`confirmIntent="danger"`
  を持つ `ConfirmDialog` を描画する、
  (c) `isShared={true}` のとき説明文に「（他の参加者全員の画面にも反映されます）」を含み、
  `isShared={false}` のとき含まない、
  (d) 確定操作で `onConfirm(pendingRemoval.participantId)` が呼ばれる、取消操作で
  `onCancel()` が呼ばれる。
  この時点では T002 が空実装のため全テストが失敗する。
  _要件: FR-177, FR-178 (US1)_
- [ ] **T006** T005 を通すため `src/ui/components/RemovalConfirmDialog.tsx` を実装する
  （green）。`Lobby.tsx` 143〜156行目・`RosterPanel.tsx` 354〜369行目の既存の
  `ConfirmDialog` 呼び出しを移植し、差分（`isShared` による説明文の分岐）を props で
  吸収する。`pendingRemovalId` の state 自体はここには持ち込まない（呼び出し側に残す。
  `plan.md` の「状態管理」節のとおり）。
  _要件: FR-177, FR-178 (US1)_

---

## フェーズ4 — 呼び出し側の置き換え（挙動不変であることを既存テストで確認）

- [ ] **T007** `src/ui/components/RosterPanel.tsx` を変更する。
  (a) 229〜234行目の在席ドット `<span>`（`sr-only` テキストの `<span>` は除く）を
  `<PresenceDot presence={p.presence} />` に置き換える。
  (b) 354〜369行目の `ConfirmDialog` 呼び出しを
  `<RemovalConfirmDialog pendingRemoval={pendingRemoval} participants={participants} isShared={isShared} onConfirm={(id) => { onRemove?.(id); setPendingRemovalId(null); }} onCancel={() => setPendingRemovalId(null)} />`
  に置き換える（`pendingRemovalId`/`pendingRemoval` の state・算出ロジックは変更しない）。
  **この変更で `test/ui/RosterPanel.test.tsx`（986行）と `test/ui/Session.roster.test.tsx` を
  一切変更せず全緑にする**（回帰確認そのものがこのタスクの合格条件）。
  _要件: FR-176, FR-177, FR-178 (US1)_
- [ ] **T008** `src/ui/Lobby.tsx` を変更する。
  (a) 234行目の在席ドット `<span>` を `<PresenceDot presence={p.presence} />` に置き換える。
  (b) 143〜156行目の `ConfirmDialog` 呼び出しを
  `<RemovalConfirmDialog pendingRemoval={pendingRemoval} participants={room.participants} isShared={true} onConfirm={(id) => { onRemoveParticipant?.(id); setPendingRemovalId(null); }} onCancel={() => setPendingRemovalId(null)} />`
  に置き換える（`isShared={true}` は Lobby の既存文言をそのまま維持するための固定値であり、
  新しい分岐を追加するものではない）。`pendingRemovalId` の state は変更しない。
  **この変更で `test/ui/Lobby.rotation.test.tsx` ・ `test/ui/Lobby.host-transfer.test.tsx` ・
  `test/ui/Lobby.role.test.tsx` ・ `test/ui/Lobby.empty.test.tsx` を一切変更せず全緑にする**。
  _要件: FR-176, FR-177, FR-178 (US1)_
- [ ] **T009** `pnpm typecheck && pnpm lint && pnpm build && pnpm test` を
  リポジトリルート（`tdd-mob-pro-timer/`）から実行し、全パッケージが成功することを
  確認する。テスト総数が `baseline.md` の開始時点（1,538件）以上であることを確認し、
  実測値を `baseline.md` に追記する。ここまでで挙動を変える変更は一切含まれていない
  ことを `git diff` で目視確認する。
  _要件: FR-184, FR-185, FR-188_

---

## フェーズ5 — 受け入れ基準の直接検証（SC-064・SC-065）と最終検証

- [ ] **T010** [P] `test/ui/Lobby.rotation.test.tsx` に、同名参加者3名（見え方が同じ
  表示名を持つケースを含む）を渡したときに全員の行に識別子付きラベル
  （`（ID: xxxx）`）が表示されることを検証する**失敗するテスト**を追加する
  （既存の単体テストは同名2名までしか検証していないため red になりうる）。
  _要件: FR-187, SC-064 (US1, US2)_
- [ ] **T011** [P] `test/ui/RosterPanel.test.tsx` に、同名参加者3名を渡したときに
  `drivers`/`watchers` 双方のセクションで全員の行に識別子付きラベルが表示されることを
  検証する**失敗するテスト**を追加する。
  _要件: FR-187, SC-064 (US1, US2)_
- [ ] **T012** T010・T011 が red のままなら原因を切り分け、`Lobby.tsx`/`RosterPanel.tsx`
  または `PresenceDot.tsx`/`RemovalConfirmDialog.tsx` 側の `participantLabel()` 呼び出し
  箇所を修正して green にする（設計上は T007/T008 の時点で正しく実装されていれば
  追加の実装変更は不要で、このタスクは主に確認と記録になる見込み）。
  _要件: FR-187, SC-064 (US1, US2)_
- [ ] **T013** [P] `test/ui/Lobby.rotation.test.tsx` に、ドライバー指名・改名・
  代理追加のボタン（`aria-label` に「をドライバーにする」「を改名」「代理追加」を
  含む要素）が Lobby 画面に一切出現しないことを検証する**失敗させて意味のあるテスト**
  として追加する（すでに出現しないはずなので、このテストは実装が正しければ即座に
  green になる。それ自体が SC-065 の「壊れていないことの継続的な検証」として価値を持つ）。
  _要件: FR-181, FR-182, FR-183, SC-065 (US1)_
- [ ] **T014** T013 が green であることを確認する。もし何らかの理由で出現していれば
  （例: 置き換え時の実装ミスでハンドラ未指定でもボタンが出てしまう等）、
  `Lobby.tsx` の該当箇所を修正して green にする。
  _要件: FR-181, FR-182, FR-183 (US1)_
- [ ] **T015** `pnpm typecheck && pnpm lint && pnpm build && pnpm test` を
  最終実行し、全パッケージの成功とテスト総数（1,538件以上）を確認する。
  結果を `baseline.md` に「G5 完了時点」として追記する。
  _要件: FR-184, FR-185, SC-062, SC-063_
- [ ] **T016** 実画面での目視確認（RC-003）を行う。手順:
  `vite` を再起動してから、(1) ロビー画面で同名参加者を含む複数名の一覧を表示し
  加入/離脱・並べ替え・ホスト移譲・退出・役割切替を実際に操作する、
  (2) セッション画面（セッションタブ・ルームタブの両方）で同様に
  改名・一時離脱/復帰・ドライバー指名・並べ替え・ホスト移譲・退出を操作する。
  変更前（本ブランチの開始コミット）と表示・操作・外観・並び順・文言に差分が無いことを
  確認し、確認した画面・操作・結果を `baseline.md` に一覧として記録する
  （「確認した」とだけ書くことは不合格。spec.md FR-186 の要求どおり）。
  _要件: FR-186, FR-188, SC-063, SC-066 (US2)_

---

## 依存関係と並列グループ

- **第1波（並列可）**: T001・T002 は別ファイルの空実装なので並列可。T003・T005 は
  それぞれ T001・T002 に依存するテスト追加。T010・T011・T013 はいずれも既存実装を
  読むだけのテスト追加であり、記述はいつでも始められるが、実行・green化は T007・T008
  （呼び出し側の置き換え）が終わった後でなければならない。
- **クリティカルパス**: T001 → T003 → T004 → T002 → T005 → T006 → T007 → T008 →
  T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016
- **中間コミットの区切り**: T004（`PresenceDot` 完成）・T006（`RemovalConfirmDialog` 完成）・
  T008（両呼び出し側の置き換え完了・挙動不変の回帰確認込み）・T009（ゲート確認）・
  T014（SC-064/065 の受け入れ検証完了）・T016（実画面確認込みの最終完了）の各時点で、
  単独にコミット可能な状態になっている。

## 削除したタスク（要件レビューによる撤回）

- 旧 **T001**（`RosterRow.tsx` 新設・空実装）: `RosterRow` 設計そのものが不採用のため削除。
  代わりに新 T001・T002（`PresenceDot`/`RemovalConfirmDialog` の空実装）に置き換えた。
- 旧 **T002〜T007**（`RosterRow` の `detailed`/`compact` variant 実装）: 同上の理由で削除。
  代わりに新 T003〜T006（`PresenceDot`/`RemovalConfirmDialog` の TDD 実装）に置き換えた。
- 旧 **T008・T009**（`RosterPanel.tsx`/`Lobby.tsx` を `RosterRow` 呼び出しへ全面置き換え）:
  行全体の置き換えではなく部品単位の置き換えに設計変更したため、新 T007・T008 に
  置き換えた（`renderRow()`/インライン `<li>` 自体は削除せず、内部の2箇所だけを
  共有コンポーネント呼び出しに変える）。
- 旧 **T011・T012**（FR-013: 在席の `sr-only` テキストを Lobby に追加する。フェーズ5全体）:
  ★要件レビューで FR-013 自体が撤回されたため、対応するタスクを完全に削除した。
  a11y の穴は本仕様のスコープ外とし、別 Issue としての起票を推奨する（spec.md
  「スコープ外 / 非目標」節）。
