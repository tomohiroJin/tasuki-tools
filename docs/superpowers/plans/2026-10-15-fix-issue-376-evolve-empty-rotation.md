# #376 evolve が輪を空にする MemberRemoved で currentIndex を NaN にする — 実装計画

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 1 人の輪に `MemberRemoved` を直接渡すテストで `NaN` の赤を見てから直す |
| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない（性質のテストは timer-core が既に持つ `fast-check` を使う） |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 該当なし | wire・コマンドの境界に触れない |
| V. 実画面検証 | 該当なし | `decide` が最後の 1 人の `member.remove` を拒み、`participant.remove` は繰り上げてから外すので、利用者の経路から輪が空になる `MemberRemoved` は届かない。経路の振る舞いは変わらない |
| VI. 依存は内向き | 該当なし | パッケージ間の依存を足さない |
| VII. 検査は壊して確かめる | 通過 | 直した分岐を外す変異 m220 を足し、新しいテストが殺すことを確かめる |
| VIII. 記録が正本 | 通過 | 不変条件を `SessionState.currentIndex` の docstring に書き、`NaN` を前提にした散文（`decide.ts`・`participant-remove.ts`・`docs/timer/ARCHITECTURE.md`）を直す |
| IX. 小さく回す | 通過 | PR 1 本。配布は伴わない |
| X. 抽象は実需で | 通過 | 新しい抽象を作らない |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 前提の実測（2026-10-15）

- 1 人の輪（`anAggregate().withRotation("A")`）に `{ type: "MemberRemoved", index: 0 }` を `evolve` へ直接渡すと、
  `currentIndex` は `NaN`、`rotation.length` は 0 になる（本文どおり）
- 性質のテストの道具は既にある（`packages/timer-core` の devDependencies に `fast-check`）。決定的な擬似乱数を自作する必要はない
- #364 は `test/properties.test.ts` の「全てのコマンドを混ぜた列での不変条件（#364）」で、`decide` を通る列では輪が空にならないことを固定している。
  ただし同ファイルの `invariantViolations` の I2 は**輪が空のときを見ていない**（`rotation.length > 0` のときだけ判定する）
- 空の輪を前にした他のイベントは既に `NaN` を作らない（`nextEligibleIndex` は長さ 0 で 0 を返す・`MembersShuffled` は現ドライバーが居なければ 0・`SessionReset` は 0 から組む・`MemberAdded` は添字を動かさない）

## 決めること

**輪が空になる `MemberRemoved` で何を返すか → 集約を返し、`currentIndex = 0` にする。**

- `evolve` は全域関数（冒頭の注釈）で、`Result` を返さない。イベントを捨てる（集約をそのまま返す）と、
  イベントの再生で「外れたはずの席が残る」状態になり、イベントと集約が食い違う
- 「輪が空なら 0」は `nextEligibleIndex`（`aggregate.ts`）の `len === 0` の扱いと同じで、Issue の EARS の 1 行目の不変条件とも一致する
- `decide` の `BelowMinMembers` は残す（最後の 1 人が外れられないのは製品の決まり。evolve の破綻を防ぐためだけのガードではなくなる）

## タスク

1. 赤: `test/evolve.test.ts` に「1 人の輪から外すと `currentIndex` が 0・輪と担当回数が空」を足し、`NaN` で落ちるのを見る
2. 赤: `test/properties.test.ts` の `invariantViolations` の I2 を EARS の不変条件（空なら 0、それ以外は `0 ≤ i < len` の整数）に揃え、
   `evolve` へ**前提を満たしたイベントの任意の列**を直接流す性質を足す（輪が空になる `MemberRemoved` を含める）
3. 緑: `evolveMemberRemoved` で輪が空になるなら `currentIndex` を 0 にする
4. 散文を直す: `SessionState.currentIndex` の docstring に不変条件、`decide.ts`・`participant-remove.ts`（2 か所）・`apps/tasuki-sync/test/solo-leave.test.ts`・`docs/timer/ARCHITECTURE.md` の「evolve が破綻する／NaN に落ちる」。日付つきの設計正本・過去の計画は当時の記録なので直さない
5. 変異 m220（直した分岐を外す）を足し、`--id 220` で殺されることを見る（性質のテスト単独でも殺すことを手で確かめる）

## 検証の実行時間の見積もり

| 検証 | 見積もり |
|---|---|
| `pnpm --filter @tasuki/timer-core test`（型検査・lint を含めて） | 1 分 |
| `pnpm --filter @tasuki/sync test`（散文を直したファイルのパッケージ） | 2 分 |
| `pnpm test`（全体・ターボのキャッシュ可） | 5 分 |
| `node scripts/mutation-check.mjs --changed`（変異を足す前のコミットで。timer-core の変異だけが選ばれる） | 5 分 |
| `node scripts/mutation-check.mjs --id 220` | 1 分 |
| scripts の自己テスト | 2 分 |

変異を足すと `mutation-check.mjs` が差分に入り `--changed` が全件に倒れる（`docs/guides/development.md`）。
そのため `--changed` は変異を足す前のコミットで流し、足した変異は `--id 220` で単独に流す。

## レビュー（PR #392 の /code-review）を受けた追補

1. **輪が空になったら時計も止める。** 表現は `SessionPaused` と同じ（残量を凍結し `isPaused: true`）。
   画面の再開ボタンは `isPaused` のときだけ押せる（`apps/timer-web/src/ui/Session.tsx` の再開ボタン）ので、`isPaused: false` で止めると席を足し直しても再開できない。
   止める処理は `evolve` の出口の 1 か所（`stopWithoutDriver`）に置く。空の輪に後から届く `SessionStarted`・`SessionResumed`・`BreakEnded`・`DriverTimerReset`・`SessionReset` もそれぞれ時計を走らせるため
2. **範囲外の添字（負・長さ以上・整数でない）の `MemberRemoved` / `MemberMoved` は集約をそのまま返す。** 負の添字は `splice` が末尾から数え、整数でない添字は切り捨てられて別の席を動かしていた
3. **添字の補助は 2 本にする（指示の `clampIndex` 1 本からの変更）。** `isSeatIndex`（範囲の判定）を `MemberRemoved` と `MemberMoved` の両方で使い、
   `wrapIndex`（空なら 0、末尾を越えたら先頭へ回す）を `MemberRemoved` で使う。理由:
   - 外した後の番号は「挟む（clamp）」ではなく「回す（wrap）」が既存の振る舞い（末尾の現ドライバーを外すと先頭の人が担当になる）。`clampIndex` の名前では誤読する
   - `MemberMoved` の現ドライバーの追跡は、添字が範囲内なら必ず範囲内に収まる（`from === cur` なら `to`、それ以外は ±1 で `from` の手前で止まる）。そこへ挟む処理を置くと殺せない変異（等価変異）になる
4. 性質のテストの生成器に範囲外の添字を混ぜ、空の輪の時計と範囲外の添字の不変性も各段で見る
5. 変異は m220 を `wrapIndex` の空の輪の分岐に作り直し、m221〜m224 を足す（パッチは実装のコミットの後に作る）
6. **範囲外の `DriverSwitched` の `nextIndex` と、順列でない `MembersShuffled` の `order` も集約を変えない**（統括の追加指示。利用者の方針「ここでの問題はここで直せ」）。
   順列の判定は `isPermutation`（長さが同じ・全部が席の添字・重複が無い）。性質のテストの生成器にも範囲外の交代先と非順列（短い・長い・重複・負の添字）を混ぜる。変異は m226〜m229

## 2 巡目のレビュー（PR #392）を受けた追補

1. **`isSeatIndex` / `isPermutation` を `aggregate.ts` へ移し、decide と evolve で共有する。** decide の `member.remove` / `member.move` / `member.shuffle` / `driver.assign` の範囲の検査もこれを使う。整数でない添字は decide でも `InvalidIndex`（decide の振る舞いの変更）
2. **evolve の黙った無視は受け入れる。** evolve は純粋でログを持たない。decide と同じ述語で判定するので、decide が通したイベントを evolve が無視することはない（`evolve` の注釈に書く）
3. **性質のテストのオラクルは実装を写さない。** 席の添字は `[0..len-1]` の列挙に含まれるか、順列は並べ替えて列挙と一致するか、で書く
4. **運転中の人が外れたら、次の担当は交代と同じ資格の規則で選ぶ（既存の欠陥）。** 資格（一時離脱・在席）はアプリ層の `computeIneligibleIndices` が正本で、集約には無い。
   そこで、交代（SWITCH）と同じ形で、出す側（`decide` の `member.remove` と `participant.remove`）が `ineligible` を受けて `nextDriverAfterRemoval` で選び、
   `MemberRemoved` に `nextDriverIndex`（外した後の添字）として載せる。項目は必須にする（出す側が選び忘れると欠陥が戻るので、型で止める）。
   適格な人が居なければ、位置で次の席（交代なら現状維持の場面だが、外れた人の席には留まれない）。evolve は範囲外の `nextDriverIndex` を位置で次の席へ倒す
5. **空の輪で止めるのは走っている時計だけにする。** 休憩中かどうかは集約に無い（ルームの `onBreak`）。休憩中の時計は止まっているので、走っているかどうかで分ければ、
   休憩中に輪が空になっても `isPaused` を立てず、席を足し直して `BreakEnded` で走り出せる
6. **空の輪の SWITCH は decide が `BelowMinMembers` で拒む。** 新しいエラー型は足さない（通常の経路から届かないので、文言の食い違いは利用者に見えない）
7. 変異の note の前置きを定数にまとめる。変異は 220〜229 の中で作り直し、範囲が足りなければ統括に申告する

## 3 巡目のレビュー（PR #392）を受けた追補

1. **空の輪の拒否に `EmptyRotation` を足す。** `BelowMinMembers` では「最後のドライバーは外れられません。」が出て状況と食い違う。
   文言は「ドライバーがいません。」（書体の base 層に収まる字。「誰」「居」は外れることを実測した）
2. **空の輪では `session.act` の全操作（START・RESUME・SWITCH・RESTART・PAUSE）を decide が `EmptyRotation` で拒む。** evolve に黙って直させない。
   RESTART も時計を走らせるので含めた。PAUSE は時計を止める操作だが、空の輪の時計は evolve が既に止めているので、同じく拒む
3. `nextDriverAfterRemoval` は空の輪・範囲外の `removedIndex` でも NaN を返さない（いまの担当を返す）。外の利用者が居なくなったので公開の契約（`index.ts`）から外す
4. **`participant.remove` も席を外すのは decide の `member.remove` 経由にする。** 資格は member.remove と同じく操作の前の名簿で測る
5. **`nextDriverIndex` は必須のまま。** 出す側が選び忘れると「位置で次の席」の欠陥が黙って戻るので、型で止めるほうを優先する
6. **範囲外の `nextDriverIndex` を持つ `MemberRemoved` は、ほかの不正な入力と同じく集約を変えない**（位置で次の席へ倒す代替をやめる）。
   正しさの判定は `isCurrentIndexFor`（外した後の輪が空なら 0 だけ、それ以外は席の添字）

## 申し送り（射程外）

- **外れた運転者の残り時間を、新しい運転者がそのまま引き継ぐ。** 修正前からの振る舞いで #376 の射程外（交代のように満タンで再アンカーしない）
- `ERROR_MESSAGES` の既存の文言のうち 7 件が書体の base 層から外れる字を持つ（「限」「多」「相」「身」「致」など。2026-10-15 に実測）。表全体の検査は無い
- 空の輪の `break.end`・`session.reset` は decide が拒まない（休憩の終わりや最初からのやり直しを止めると部屋が動けなくなる）。時計は evolve が止める
