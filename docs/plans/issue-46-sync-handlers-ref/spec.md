# spec: SyncClient のコールバックを最新ハンドラ束へ転送し、state の写し ref を撤廃する（Issue #46 / #41 の残作業）

## 背景

`apps/web/src/App.tsx` の `makeClient()` が生成する `SyncClient` の各コールバック
（`onRoom` / `onIdentity` / `onError` / `onNotice` / `onNeedProblem` / `onReconnected`）は
**生成時点の値で固定される closure** である。そのためコールバック内から「最新の state」を
読みたい箇所は state 単独では対応できず、同じ値を `useState`（描画用）と `useRef`（closure 用）
の両方で保持している（= 並行保持／二重管理）。

Issue #41（#28 D-2・PR #47）は、この並行保持を生む **同期処理の一元化**（`useLatestRef`
経由の4本の ref を1本の集約 ref `latestRef` にまとめる）までを実施し、
**根本原因である closure 固定そのものは残した**。本 Issue #46 はその残作業を扱い、
完了をもって Issue #41 もクローズする。

## 実測（2026-08-03・`main` `55ffb54` で測定）

| 指標 | 値 |
|---|---:|
| `App.tsx` 行数 | 764 |
| `useState` 宣言数 | 11 |
| ref 宣言数（`useRef` + `useLatestRef`） | 11 |
| うち `useLatestRef` 経由（state の写し＝並行保持） | **1**（`latestRef`） |
| うち素の `useRef`（state を持たない純粋なガード用） | 10 |
| `latestRef` の参照箇所 | 18 |

### 並行保持されている4つの state（本 Issue の解消対象）

`latestRef` が写しを保持している state。

- `room` / `endType` / `participantId` / `generatingProblem`

### 並行保持ではない10個の ref（対象外・#41 spec REQ-3 を引き継ぐ）

state の写しではなく、「一度きり」「二重送信防止」等のガード状態や、React の再レンダーを
待たずに WS メッセージ間で値を受け渡すための純粋な ref。削除・改名の対象にしない。

`isCreatorRef` / `pendingDriverJoinRef` / `problemRequestedRef` / `recordSavedRef` /
`bannerTimerRef` / `prevHostRef` / `generatingTimerRef` / `pendingResumeRef` /
`resumeDisplayNameRef` / `joinedFromUrlRef`

## 採用する設計

**`useLatestRef` が保持する中身を「state の写し」から「ハンドラ束」へ入れ替える。**

```tsx
// ハンドラ本体は render 本体のスコープで定義する
// → room / endType / participantId / generatingProblem を素の state として直接読む
const handleRoom = (c: SyncClient, r: Room) => { const prevRoom = room; /* … */ };
const handleError = (c: SyncClient, code: string) => { /* … room?.code … */ };
// …
const handlersRef = useLatestRef({ handleRoom, handleIdentity, handleNeedProblem,
                                   handleError, handleReconnected, handleNotice });

// SyncClient へ渡すコールバックは「最新ハンドラへの転送」だけ（生成時に1回・以後不変）
const makeClient = (): SyncClient => {
  const newClient = new SyncClient({
    url: wsUrl,
    onRoom: (r) => handlersRef.current.handleRoom(newClient, r),
    onError: (code) => handlersRef.current.handleError(newClient, code),
    // …
  });
  newClient.connect();
  setClient(newClient);
  return newClient;
};
```

closure に固定されるのは**転送関数だけ**になり、実際に走るのは常に最新レンダーのハンドラである。
結果、state の写しを ref に持つ必要が消える。

### ★この設計で「解消するもの」と「残るもの」（先に明示する）

Issue #41 はレビュー（tasks.md T4・指摘1）で「二重管理が『解消』されたと言えるか」を
問われ、スコープの言い直しを求められた。同じ差し戻しを繰り返さないため、本 Issue の
達成範囲を先に確定させる。

**解消するもの**

- 「**同じ値を `useState` と `useRef` の両方で保持する**」構造。変更後、`room` /
  `endType` / `participantId` / `generatingProblem` の写しを持つ ref は存在しない。
  これが Issue #41 / #28 D-2 が問題として挙げた当のものであり、本 Issue の達成目標である。
- コールバック本体が「最新値を読むために特別な作法（`latestRef.current.…`）を要する」状態。
  変更後、ハンドラは他の render 本体のコードと同じく素の state を読む。

**残るもの（本 Issue では解消しない）**

- **`SyncClient` のコールバック登録そのものは生成時固定のままである。** 本設計が動的に
  するのは「登録」ではなく「ディスパッチ（転送先の解決）」である。
- したがって **ref 経由の間接呼び出しは残る**（`handlersRef`）。ref 宣言数は 11 → 11 で
  **変わらない**（`latestRef` が `handlersRef` に置き換わるだけ）。

**なぜそれで十分と判断するか**

`SyncClient` は WS という外部イベント源であり、React の render サイクルの外にある。
外部イベント源から「最新のレンダー結果」へ橋を架ける以上、可変な参照（ref）を1つ挟むことは
React の構造上避けられない（React 自身も同じ問題に対して `useEffectEvent`（実験的 API）で
「最新レンダーの関数を安定した参照から呼ぶ」という同型の解を用意しようとしている）。
避けられるのは「**その ref にアプリケーションの状態を
複製すること**」の方であり、本設計はそれを消す。案A（`useEffect` 再登録）も
`SyncClient.options` を可変にするという形で同じ間接参照を持ち込むだけで、この点で優位ではない。

### client インスタンスの受け渡し

ハンドラ内で `newClient.send(...)` / `newClient.dispose()` を呼ぶ箇所があるため、
**client インスタンスは転送関数の closure から第1引数で渡す**。`client` state を読ませない。
`makeClient` は `setClient(newClient)` の再レンダーが完了する前に `room.create` / `room.join`
を送るため、`client` state を参照すると初回メッセージの処理時に `null` を踏む窓が生じる。

### 転送化する範囲（線引き）

`SyncClient` に渡すコールバックは9種ある。実際に state を読むのは**4種だけ**である。

| コールバック | state を読むか | 扱い |
|---|---|---|
| `onRoom` | ○（`room` / `endType` / `generatingProblem` / `participantId`） | **転送化** |
| `onError` | ○（`room`） | **転送化** |
| `onNotice` | ○（`participantId` / `room`） | **転送化** |
| `onNeedProblem` | ○（`room`） | **転送化** |
| `onIdentity` | ✗（`setParticipantId` と純粋 ref のみ） | **転送化** |
| `onReconnected` | ✗（`loadResumeIdentity()` と client のみ） | **転送化** |
| `onConnected` / `onDisconnected` / `onConnectionChange` | ✗（setter 呼び出し1行） | 直書きのまま |

**線引きの根拠:** 「今 state を読んでいるか」ではなく「**将来 state を読み得る本体を持つか**」で
分ける。`onIdentity` / `onReconnected` は現時点で state を読まないが、複数行の処理本体を持ち、
後から state 参照を足す改修が自然に起こりうる。そこだけ直書きのまま残すと、次に触る人が
closure 固定の罠を踏み直す — それは本 Issue が解消しようとしている当の失敗様式である。
一方 `onConnected: () => setBanner(null)` のような setter 1行は、React が setter の同一性を
保証しているため closure 固定の害が原理的に生じず、転送を挟む理由がない（YAGNI）。

### 検討して却下した案

1. **`SyncClient` に `setHandlers()` を追加し `useEffect` で再登録する**（Issue #46 本文の文言）
   - 却下理由: `useEffect`（passive effect）は commit と同期ではなく、スケジューラの
     別コールバックで flush される。つまり **commit 完了から effect 実行までの間に別のタスクが
     割り込みうる**。WS の `onmessage` はまさに別タスクなので、`onIdentity` で
     `setParticipantId` した直後に届く `snapshot` を、まだ古い `participantId` を持つ
     ハンドラが処理する窓が実在する。#41 spec の REQ-2 が禁じた「1レンダー遅れ」を、
     値側からハンドラ差し替え側へ移動させるだけで、しかも窓が広がる。
     加えて依存配列が肥大化し、`SyncClient` の改造（コールバックの可変化）も必要になる。
     採用案（render 本体での同期）はこの窓を構造的に持たない。
2. **reducer / `useSyncExternalStore` で単一の状態源に寄せる**
   - 却下理由: 11個の `useState` すべてが対象となり `App.tsx` 全面改修になる。
     本 Issue の目的（closure 固定の解消）に対して変更差分と退行リスクが過大（YAGNI）。
     4つの state は発生源も更新粒度も独立している（#41 plan.md の分析を引き継ぐ）。

## 要件（EARS）

- **REQ-1**: システムは、`SyncClient` のコールバックが `App` の最新レンダーで定義された
  ハンドラを呼び出さなければならない（WHEN WS メッセージを受信したとき、システムは
  生成時点ではなく最新レンダー時点のハンドラを実行しなければならない）。
- **REQ-2**: システムは、`room` / `endType` / `participantId` / `generatingProblem` の
  4つの state について、**state の写しを保持する ref を持ってはならない**
  （`latestRef` を廃止し、これらは `useState` 単独保持とする）。
- **REQ-3**: システムは、ハンドラ束の ref への同期を **render 本体内**（`useEffect` を
  挟まない）で行わなければならない。IF `useEffect` 経由の同期に変えた場合、THEN
  ハンドラの差し替えが1レンダー分遅れ、`setParticipantId` 直後に届く snapshot を
  古いハンドラが処理する退行が起きうるため、これを禁止する。
- **REQ-4**: システムは、上記10個の純粋なガード用 ref を、変更・削除の対象に
  含めてはならない。
- **REQ-5**: システムは、リファクタ前後で利用者に見える挙動（画面遷移・文言・
  タイミング・表示条件）を一切変更してはならない。
- **REQ-6**: システムは、state を読む4コールバック（`onRoom` / `onError` / `onNotice` /
  `onNeedProblem`）について、closure から最新 state を読む経路を検証する
  characterization test を備えなければならない（既存4件で未カバーの経路を、
  **リファクタ着手前に**追加する）。
- **REQ-7**: システムは、`onNeedProblem` のハンドラにおいて、`room` の読み取りを
  `await` より**前**で行わなければならない。IF `await` より後で読んだ場合、THEN 現行の
  `getConfig()`（`await` 前に呼ばれる）と読み取り時点がずれ、生成中に届いた snapshot の
  値を使ってしまう挙動差が生じるため、これを禁止する。
- **REQ-8**: システムは、変更によって事実と食い違うコメントを更新しなければならない
  （少なくとも `use-latest-ref.ts` の doc コメント全体、`App.tsx` の `latestRef` 宣言部の
  コメント、`leaveRotation` の「`latestRef.current.room` から解決」の記述）。

## 挙動の等価性（根拠）

`useLatestRef` の更新タイミング（render 本体）は変えないため、以下の現在の性質が保たれる。

| 現在の読み取り | 変更後 | 同値である理由 |
|---|---|---|
| `latestRef.current.room` | closure の `room` | どちらも「直前のレンダー時点の値」 |
| `setRoom(r)` の後に読む `latestRef.current.endType` | closure の `endType` | どちらも当該コールバック実行中は更新されない |
| `onNotice` の `latestRef.current.participantId` | closure の `participantId` | 同上 |

「コールバック内で `setRoom(r)` した後に読む値は前レンダー値である」という現在の性質も
そのまま維持される（`handleRoom` 冒頭の `const prevRoom = room;` が同じ意味を持つ）。

### UI から呼ばれる関数（`leaveRotation` / `changeOwnRole` / `copyProblem` / `regenerateProblem`）

これらも `latestRef` を読んでおり、素の state 読みへ置換する。同値である根拠は2点。

1. **メモ化による古い closure の滞留が無い。** `React.memo` はこのコードベースで1箇所のみ
   使用されているが（`ui/components/CircularProgress.tsx` の `DialTicks`、props は
   `size` / `tickOuterR` のみ）、App のコールバックを受け取る経路には存在しない。
   よって `Lobby` / `Session` 以下は親と一緒に再レンダーされ、常に最新レンダーの関数を受け取る。
2. **読み取り時点が同じ。** `latestRef.current` は render phase で更新され、UI コールバックは
   commit 後にしか発火しない。よって「送信時の最新 snapshot を参照する」という
   `leaveRotation` の意図（同時編集による index ずれで別人を外さない）は保たれる。

### WS メッセージが連続して届く場合

同一タスク内で2つのメッセージが処理される場合（例: `room.created` → `snapshot`）、
React 18 の自動バッチングにより1つ目の `setState` は再レンダーを起こさない。
このとき現行は `latestRef.current`（＝前レンダー値）を読み、変更後は closure の state
（＝同じく前レンダー値）を読む。**両者は厳密に同値**であり、この経路に挙動差は生じない。

## 付随する簡素化（挙動不変）

`makeClient(getConfig)` の引数を撤去する。`getConfig` は `onNeedProblem` から呼ばれ、
お題生成に使う言語・難易度を返す関数だが、2つの呼び出し元の fallback 値が同値である。

- `handleCreateRoom`: `room?.config.language ?? config.language`（`config.language === "TypeScript"`）、
  `room?.config.difficulty ?? config.difficulty`（`config.difficulty === "easy"`）
- `handleJoinRoom`: `room?.config.language ?? "TypeScript"`、`room?.config.difficulty ?? "easy"`

よって `handleNeedProblem` 内で `room?.config.language ?? "TypeScript"` /
`room?.config.difficulty ?? "easy"` と直接書けば、両経路とも現在と同じ値になる。
読み取りは `await provider.generate(...)` より**前**に行う（REQ-7）。

**副作用（挙動は変わらないが結合が変わる）:** 撤去後、`handleCreateRoom` 内の
`config`（作成時の既定設定）と `onNeedProblem` の fallback の結合が切れる。現在は
`config.language` を変えれば fallback も追随するが、撤去後は追随しない。
この fallback が効くのは「初回 snapshot が届く前に `need-problem` が届く」場合だけであり、
現状の値は両者とも `"TypeScript"` / `"easy"` なので現時点の挙動差はゼロである。
将来 create 時の既定を変える改修が入ったときに、fallback 側も揃えるか判断が要る点を残す。

## 非対象（YAGNI）

- 10個のガード用 ref の整理・削減（#41 spec REQ-3 を引き継ぐ）。
- `App.tsx` の行数削減そのもの（カスタムフックへの抽出等）。本 Issue は closure 固定の
  解消に絞る。抽出は独立して計画・実施すべき別作業である。
- `SyncClient` 自体・`dispatch.ts` の変更。本設計では `SyncClient` は無改造。
- `useLatestRef` フックの削除。保持する中身が変わるだけでフックは生き続けるため、
  `apps/web/test/ui/use-latest-ref.test.tsx` も残す。
- 11個の `useState` の統合・reducer 化。

## 受け入れ基準

- [ ] `latestRef`（state の写し）が `App.tsx` から消えている。`room` / `endType` /
      `participantId` / `generatingProblem` は `useState` 単独保持になっている。
- [ ] `SyncClient` に渡す6コールバック（`onRoom` / `onError` / `onNotice` /
      `onNeedProblem` / `onIdentity` / `onReconnected`）が、`handlersRef.current` の
      同名ハンドラへの転送のみになっている。`onConnected` / `onDisconnected` /
      `onConnectionChange` は setter 1行のまま（線引きの根拠は上記「転送化する範囲」節）。
- [ ] ハンドラ束の ref 同期が `useLatestRef`（render 本体内）で行われている。
- [ ] 10個のガード用 ref は変更されていない。
- [ ] `SyncClient`（`apps/web/src/sync/client.ts`）に差分が無い。
- [ ] state を読む4コールバックを覆う characterization test が緑になっている。
- [ ] `handleNeedProblem` の `room` 読み取りが `await` より前にある（REQ-7）。
- [ ] 事実と食い違うコメントが更新されている（REQ-8 の3箇所）。
- [ ] `pnpm --filter @tdd-mob/web test` 全件が既存件数（**82ファイル/571件**・
      2026-08-03 に `refactor/issue-46-sync-handlers-ref` 起点で実測・全 pass）を
      下回らない。★全件実行に約660秒かかるため、実装中は対象を絞って実行し、
      全件は節目でのみ回す。
- [ ] `typecheck` / `lint` が通過する。
- [ ] ローカル起動での実画面確認が完了している（ルーム作成 → ロビー → お題再生成 →
      セッション開始 → 完成／中断 → 退出）。★型が変わらない意味変更は静的検査も
      テストも検出できない（#41 の注意書き・Issue #22 の実例）ため、これを
      完了条件に含める。

## 参考

- 元 Issue: #46（#41 の残作業）、#41（#28 D-2）、#28（親・棚卸し）
- 先行 PR: #47（`useLatestRef` 4本 → 1本の集約）
- 実測値の正本: `docs/plans/codebase-refactoring/baseline.md`（§16 に追記する）
- 先行設計: `docs/plans/issue-41-app-state-ref/spec.md` / `plan.md`
