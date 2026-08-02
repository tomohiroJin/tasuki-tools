# spec: SyncClient のコールバック登録を最新ハンドラ束へ転送し、state/ref 並行保持を根本解消する（Issue #46 / #41 の残作業）

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

### client インスタンスの受け渡し

ハンドラ内で `newClient.send(...)` / `newClient.dispose()` を呼ぶ箇所があるため、
**client インスタンスは転送関数の closure から第1引数で渡す**。`client` state を読ませない。
`makeClient` は `setClient(newClient)` の再レンダーが完了する前に `room.create` / `room.join`
を送るため、`client` state を参照すると初回メッセージの処理時に `null` を踏む窓が生じる。

### 検討して却下した案

1. **`SyncClient` に `setHandlers()` を追加し `useEffect` で再登録する**（Issue #46 本文の文言）
   - 却下理由: `useEffect` は commit 後に走るため、#41 spec の REQ-2 が禁じた
     「1レンダー遅れ」がハンドラ差し替え側に移動するだけになる。`onIdentity` で
     `setParticipantId` した直後に届く `snapshot` を、まだ古い `participantId` を持つ
     ハンドラが処理しうる窓が理屈上残る。加えて依存配列が肥大化し、`SyncClient` の
     改造（コールバックの可変化）も必要になる。
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
- **REQ-6**: システムは、リファクタ対象の全コールバック（`onRoom` / `onIdentity` /
  `onNeedProblem` / `onError` / `onNotice` / `onReconnected`）について、closure から
  最新 state を読む経路を検証する characterization test を備えなければならない
  （既存4件で未カバーの経路を、**リファクタ着手前に**追加する）。

## 挙動の等価性（根拠）

`useLatestRef` の更新タイミング（render 本体）は変えないため、以下の現在の性質が保たれる。

| 現在の読み取り | 変更後 | 同値である理由 |
|---|---|---|
| `latestRef.current.room` | closure の `room` | どちらも「直前のレンダー時点の値」 |
| `setRoom(r)` の後に読む `latestRef.current.endType` | closure の `endType` | どちらも当該コールバック実行中は更新されない |
| `onNotice` の `latestRef.current.participantId` | closure の `participantId` | 同上 |

「コールバック内で `setRoom(r)` した後に読む値は前レンダー値である」という現在の性質も
そのまま維持される（`handleRoom` 冒頭の `const prevRoom = room;` が同じ意味を持つ）。

`React.memo` はこのコードベースで未使用のため、`leaveRotation` / `changeOwnRole` /
`copyProblem` / `regenerateProblem` など UI から呼ばれる関数は毎レンダー作り直されて
子コンポーネントへ渡る。よってこれらの `latestRef` 読みを素の state 読みへ置換しても
「送信時の最新 snapshot を参照する」という意図は保たれる。

## 付随する簡素化（挙動不変）

`makeClient(getConfig)` の引数を撤去する。`getConfig` は `onNeedProblem` から呼ばれ、
お題生成に使う言語・難易度を返す関数だが、2つの呼び出し元の fallback 値が同値である。

- `handleCreateRoom`: `room?.config.language ?? config.language`（`config.language === "TypeScript"`）、
  `room?.config.difficulty ?? config.difficulty`（`config.difficulty === "easy"`）
- `handleJoinRoom`: `room?.config.language ?? "TypeScript"`、`room?.config.difficulty ?? "easy"`

よって `handleNeedProblem` 内で `room?.config.language ?? "TypeScript"` /
`room?.config.difficulty ?? "easy"` と直接書けば、両経路とも現在と同じ値になる。

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
- [ ] `SyncClient` に渡すコールバックが、`handlersRef.current` の同名ハンドラへの
      転送のみになっている。
- [ ] ハンドラ束の ref 同期が `useLatestRef`（render 本体内）で行われている。
- [ ] 10個のガード用 ref は変更されていない。
- [ ] `SyncClient`（`apps/web/src/sync/client.ts`）に差分が無い。
- [ ] 全コールバック（6種）を覆う characterization test が緑になっている。
- [ ] `pnpm --filter @tdd-mob/web test` 全件が既存件数（82ファイル/571件）を下回らない。
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
