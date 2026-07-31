# spec: App.tsx の state/ref 二重管理を解消する（Issue #41 / #28 D-2）

## 背景

`apps/web/src/App.tsx` の `makeClient()` が生成する `SyncClient` の各コールバック
（`onRoom` / `onIdentity` / `onError` / `onNotice` 等）は **生成時点の値で固定される
closure** である。そのため、コールバック内から「最新の state」を読みたい箇所は
state 単独では対応できず、同じ値を `useState` と `useRef` の両方で保持している
（= 二重管理）。

## 実測（2026-08-01・親エージェントが main `6285cc5` で実測。Issue 本文の数値は古いので使わない）

| 指標 | 値 |
|---|---:|
| `App.tsx` 行数 | 768 |
| `useState` 数 | 12 |
| `useRef` 宣言数（`useLatestRef` 含む） | 14 |
| うち `useLatestRef` 経由（state の写し＝二重管理） | 4 |
| うち素の `useRef`（state を持たない純粋なガード用） | 10 |

### 二重管理に該当する4組（対象）

`useLatestRef` 経由で state の最新値を closure から読むための ref。

- `roomRef` ← `room`
- `endTypeRef` ← `endType`
- `participantIdRef` ← `participantId`
- `generatingRef` ← `generatingProblem`

### 二重管理に該当しない10個（対象外）

state の写しではなく、「一度きり」「二重送信防止」等のガード状態を持つ純粋な ref。
削除・改名の対象にしない。

`isCreatorRef` / `pendingDriverJoinRef` / `problemRequestedRef` / `recordSavedRef` /
`bannerTimerRef` / `prevHostRef` / `generatingTimerRef` / `pendingResumeRef` /
`resumeDisplayNameRef` / `joinedFromUrlRef`

## 要件（EARS）

- **REQ-1**: システムは、`room` / `endType` / `participantId` / `generatingProblem` の
  4つの state について、closure から最新値を読むための ref 宣言を、現状の 4 本
  （`roomRef` / `endTypeRef` / `participantIdRef` / `generatingRef`）から **1 本**へ
  集約しなければならない（WHEN closure 内で最新値を参照する必要が生じたとき、
  システムは単一の集約 ref から値を読めなければならない）。
- **REQ-2**: システムは、集約後も `useLatestRef` と同じ同期タイミング（render 本体内・
  `useEffect` を挟まない）を維持しなければならない。
  IF `useEffect` 経由の同期に変えた場合、THEN `setRoom(r)` 直後に同じ同期区間内で
  ref を読む既存コード（例: `onError` の `leave-room` 分岐）が 1 レンダー分古い値を
  読んでしまう退行が起きるため、これを禁止する。
- **REQ-3**: システムは、上記10個の純粋なガード用 ref（二重管理ではない）を、
  変更・削除の対象に含めてはならない。
- **REQ-4**: システムは、リファクタ前後で利用者に見える挙動（画面遷移・文言・
  タイミング・表示条件）を一切変更してはならない。
- **REQ-5**: システムは、`App.tsx` に対する characterization test を用意し、
  4組の二重管理箇所が実際に使われる代表的なフロー（ルーム作成→識別受信→
  snapshot 反映→notice 文言組み立て、完成/中断の記録可否判定、お題生成中フラグの
  解除）を検証しなければならない（着手前は `App.tsx` 直接のテストが存在しないため、
  リファクタの安全網として新設する）。

## 非対象（YAGNI）・スコープの明示的な線引き

★**本 Issue の対応は「二重管理そのものの解消」ではなく「二重管理を生む同期処理の
一元化」に留める。** これは意図的なスコープ限定であり、以下にその理由と残作業を
明記する。

### 二重管理の根本原因は残る

`room` / `endType` / `participantId` / `generatingProblem` は、本 PR の後も
**state（描画用）と ref（closure 用）の両方で保持されたまま**である。
根本原因は「`makeClient()` が生成する `SyncClient` のコールバックが
生成時点の値で固定される（closure）」ことにあり、これは今回のリファクタでは
解消していない。#28 が挙げた「あるべき姿」の一案（下記）のうち、
**前半（コールバック登録を `useEffect` に移す）を実施していない**。

> `SyncClient` のコールバック登録を `useEffect` ＋ 最新値 ref 1 本に集約する

今回実施したのは後半（最新値 ref を1本に集約する）のみである。

### なぜ前半（コールバック登録の `useEffect` 化）を見送るか

- `makeClient` は `handleCreateRoom` / `handleJoinRoom` の双方から呼ばれ、
  `client` を `useState` で保持する構造になっている。コールバック登録を
  `useEffect` に移すには、依存変化のたびに `SyncClient` を再生成するか、
  登録関数だけを差し替える仕組みを新設する必要があり、`App.tsx`（764行）の
  接続ライフサイクル管理を丸ごと設計し直す規模になる。
- 直前の Issue #24（PR #44）で `onReconnected` / `pendingResumeRef` /
  `resumeDisplayNameRef` によるリジューム配線が入ったばかりで、この面を
  同時に触ると退行時の切り分けが難しくなる。
- 本リファクタの直後に本番デプロイを控えており（`tasuki_pre_deploy_batch`）、
  影響範囲の大きい構造変更を今のタイミングで行うのはリスクに見合わない。
- YAGNI: 今回の Issue #41（#28 D-2）が問題視していたのは「ref の同期処理が
  state ごとに手書きで散っている」点であり、これは4本→1本の集約で解消できる。
  「二重管理という構造そのもの」の解消は、影響範囲・検証コストが桁違いに大きい
  別の作業であり、切り出して独立に計画・実施すべきである。

### 残作業（別 Issue で追跡）

`makeClient` のコールバック登録を `useEffect` ベースに寄せ、
closure 固定そのものを解消する（あるいは reducer 化を含めて再検討する）作業は
**別 Issue として起票**し、本 Issue はそこまでの成果（4本→1本の集約）で完了とする。
→ 起票した Issue 番号は本ファイル末尾に追記する。

### その他の非対象（変更なし）

- 10個のガード用 ref の整理・削減（Issue #41 のスコープ外）。
- `SyncClient` 自体や `dispatch.ts` の変更。
- Playwright を用いた実画面確認（親エージェントの担当）。

### 残作業 Issue

- **Issue #46**: 「App.tsx の SyncClient コールバック登録を useEffect 化し、
  state/ref 並行保持を根本解消する（#41 の残作業）」
  https://github.com/tomohiroJin/tasuki-tools/issues/46

## 受け入れ基準

- [ ] `roomRef` / `endTypeRef` / `participantIdRef` / `generatingRef` の4本が、
      1本の集約 ref（例: `latestRef`）に置き換わっている。
- [ ] 10個のガード用 ref は変更されていない。
- [ ] `App.tsx` の characterization test が新設され、緑になっている。
- [ ] `pnpm --filter @tdd-mob/web test` 全件が既存件数（81ファイル/567件）を
      下回らない。
- [ ] `typecheck` / `lint` が通過する。
