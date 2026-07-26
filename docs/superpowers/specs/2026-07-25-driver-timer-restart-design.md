# 現ドライバーのまま持ち時間をやり直す（再スタート・Issue #14）設計

## 背景・目的

現在のドライバーを維持したまま、その**持ち時間（タイマー）だけを満タンからやり直す**操作を追加する。実機フィードバック:「再開とスキップはあるが**再スタートが無く**、現在のドライバーをもう一度最初から始めることができない」。

想定シーン: 現ドライバーが導入説明などで時間を使ってしまい「同じ人のまま、フルの持ち時間でやり直したい」場合。

GitHub Issue: https://github.com/tomohiroJin/tasuki-tools/issues/14

## 前提（既存実装、根拠）

- **RESUME**（`packages/core/src/decide.ts` / `evolve.ts` `evolveSessionResumed`）: `isPaused=false` / `running=true` / `anchor=now`。`secondsLeftAtAnchor` は触らないため**凍結残量から**の復帰で満タンには戻らない。
- **RESET**（`session.reset` → `SessionReset` → `evolve.ts`）: `initialAggregate` で再構成するため `currentIndex=0`・`driverCounts` 全 0・`totalSwitches=0` の**全体リセット**（＝別人に戻る）。
- **SWITCH**（`session.act` SWITCH → `advanceDriver`）: 人が次へ変わる。
- 「`currentIndex` を維持したまま満タン再アンカー」する経路は存在しない。ただし必要な clock 変換自体は `advanceDriver` の「全員 ineligible で交代先が現状と同じ」分岐（`evolve.ts`）に既にある（`anchorServerTime=now` / `secondsLeftAtAnchor=intervalSeconds` / `runningSince=now`、`accumulatedElapsedMs` に稼働区間を確定加算）。
- `apps/sync` の自動交代は `reconcileSchedule(room)` が snapshot（`clock`）から再計算するため、clock を書き換えるだけで再スケジュールされる（`handleRoomCommand` 末尾で常に呼ばれる）。

## 設計判断

- **新イベント `DriverTimerReset` を追加する**（`DriverSwitched` の流用はしない）。`evolveDriverSwitched` は担当回数 +1・`totalSwitches` +1 を伴い、受け入れ基準「`driverCounts` / `totalSwitches` が変化しない」と矛盾する。`SessionReset` の流用も `currentIndex=0` になるため不可。clock 変換のみを行う専用イベントが最小かつ意味が明快。
- **`session.act` の新アクション `RESTART` として公開する**（新規 `command` は作らない）。START / SWITCH / PAUSE / RESUME と同じ「タイマー操作」の族であり、権限も既存の `EDITOR_PLUS_COMMANDS`（`session.act`）にそのまま乗る。Issue の権限検討（`editor+` か `host` か）は **`editor+`** を採る: 「同じ人のやり直し」は現ドライバー本人が押せるのが自然で、スキップ／一時停止と同じ重さの操作。全体リセット（`host` 限定）とは影響範囲が違う。
- **ガードを置かない（常に `ok([DriverTimerReset])`）**。停止中・一時停止中でも「満タンで走り出す」は一貫して意味を持ち、受け入れ基準「一時停止中に実行しても走行再開する」を素直に満たす。既存 RESUME も `running=false && isPaused=false`（未開始）で受理される前例がある。
- **経過時間（`accumulatedElapsedMs`）は巻き戻さない**。セッション全体の経過は「実際に走った時間」の記録で、持ち時間のやり直しとは別軸。`advanceDriver` の現状維持分岐・`evolveDriverSwitched` と同じく稼働区間を確定加算する（経過表示が巻き戻る違和感を避ける）。
- **Room レベルの副作用なし**。お題・共有メモ・メンバー・設定・`participants` は触らない（`applyRoomLevelEvent` の `default` で無変更）。`SessionReset` が行う `onBreak` 解除も行わない（休憩機能は v2.10 で撤去済みの dormant フラグ・`SessionResumed` と同じ扱い）。
- **UI は編集者操作ゾーン（タイマー直下）に置く**。全体リセット「最初から」はホスト専用の危険ゾーン（`EndSessionZone`・赤・確認ダイアログ）にあるため、**ゾーン・文言・アイコン・色すべてで差別化**される。確認ダイアログは付けない（破壊対象は現ドライバーの残り時間だけで、同ゾーンの「スキップ」と同程度。一手で戻せる操作に確認を挟むと連打の妨げになる）。
- **ソロ（`LocalEngine`）の配線は行わない**。現在デッドコード（Issue #13 の設計判断と同じ）。core は非依存なので将来数行で対応できる。

## 要件（EARS）

- ドライバー（`editor+`）が「時間リセット」を実行したとき、システムは `currentIndex`・`driverCounts`・`totalSwitches` を変えずに、タイマーを満タン（`intervalSeconds`）で再アンカーして走行させる。
- 再スタートのとき、システムは一時停止状態を解除して `running=true` にする。
- 再スタートのとき、システムはお題・共有メモ・メンバー・設定を維持する。
- 再スタートのとき、システムはセッション経過時間（`accumulatedElapsedMs`）を巻き戻さない。
- 再スタート後、システムは新しい残り時間に合わせて自動交代を再スケジュールする。
- 閲覧者（`viewer`）から再スタート要求を受けたとき、システムは `UNAUTHORIZED` を返して再スタートしない。
- 閲覧者には「時間リセット」操作 UI を表示しない。

## アーキテクチャ・データフロー

```
Session 操作ゾーン「時間リセット」(editor+)
  → onRestartTimer()
  → App.act("RESTART") → client.send({ command: "session.act", action: "RESTART" })
  → [server] handleRoomCommand
      1. authorize: session.act = EDITOR_PLUS（viewer は UNAUTHORIZED）
      2. buildDomainCommand: VALID_ACTIONS に RESTART
      3. decide({ command: "session.act", action: "RESTART" }) → [DriverTimerReset]
      4. evolve: isPaused=false / running=true / secondsLeftAtAnchor=intervalSeconds
                 / anchorServerTime=runningSince=now / accumulatedElapsedMs += 稼働区間
      5. applyRoomLevelEvent: 無変更（default）
      6. broadcastSnapshot + reconcileSchedule（満タン基準で再スケジュール）
```

### Layer 1 — core イベント `packages/core/src/events.ts`

```ts
/** 現ドライバーのまま持ち時間だけを満タンからやり直す（再スタート） */
export interface DriverTimerReset {
  type: "DriverTimerReset";
  now: number;
}
```

`DomainEvent` 合併型に追加する。

### Layer 2 — core `evolve.ts`

`case "DriverTimerReset": return evolveDriverTimerReset(agg, event.now);`

```ts
function evolveDriverTimerReset(agg: Aggregate, now: number): Aggregate {
  const addedMs = agg.clock.runningSince !== null ? now - agg.clock.runningSince : 0;
  return {
    session: { ...agg.session, isPaused: false },
    clock: {
      ...agg.clock,
      running: true,
      anchorServerTime: now,
      secondsLeftAtAnchor: agg.clock.intervalSeconds,
      accumulatedElapsedMs: agg.clock.accumulatedElapsedMs + addedMs,
      runningSince: now,
    },
  };
}
```

`session` は `isPaused` 以外（`currentIndex` / `driverCounts` / `totalSwitches` / `rotation`）を触らない。

### Layer 3 — core `decide.ts`

`session.act` の action ユニオンへ `"RESTART"` を追加し、`decideSessionAct` に
`case "RESTART": return ok([{ type: "DriverTimerReset", now }]);` を加える（ガードなし）。

### Layer 4 — wire スキーマ `packages/core/src/schemas.ts`

`SessionActionValues` に `"RESTART"` を追加する（`SessionActCommand` は picklist 参照なので他は無変更）。

### Layer 5 — サーバ `apps/sync/src/application/handlers.ts`

`VALID_ACTIONS` に `"RESTART"` を追加し、`buildDomainCommand` の action 型を広げる。権限は
`session.act` が既に `EDITOR_PLUS_COMMANDS` にあるため追加不要。`isManualSwitch`（`advanceDriver`
差し替え）にも該当しないため、通常の evolve ループで適用される。

### Layer 6 — UI（サーバ同期経路のみ）

- **`apps/web/src/App.tsx`**: `act` の型に `"RESTART"` を追加し、`onRestartTimer={() => act("RESTART")}` を `<Session>` へ渡す。
- **`apps/web/src/ui/Session.tsx`**: `onRestartTimer: () => void` を props に追加。編集者操作ゾーン（再開/一時停止・スキップの並び）に `TimerReset` アイコンの `GhostButton`「時間リセット」を置く。ラベルを短くする代わり、`title` 属性で「同じドライバーのまま、持ち時間を最初からやり直します」と補う（同じ行の他ボタンも `aria-label` を持たないため、可視ラベル＋`title` で統一する）。

**「最初から」（RESET）との差別化**

| | 時間リセット（#14） | 最初から（RESET） |
|---|---|---|
| 置き場所 | タイマー直下の編集者操作ゾーン | ホスト専用の終了系隔離ゾーン |
| 権限 | `editor+` | `host` |
| 文言 | 「時間リセット」 | 「最初から」 |
| アイコン | `TimerReset`（時計＋巻き戻し） | `RotateCcw`（周回矢印） |
| 見た目 | GhostButton（中性色） | 赤（危険色） |
| 確認 | なし | 確認ダイアログあり |
| 効果 | 現ドライバーのまま時間のみ満タン | 先頭ドライバー・回数も全て初期化 |

## エラー処理

| 状況 | 挙動 |
|------|------|
| viewer が要求 | `authorize`（`session.act` = EDITOR_PLUS）が `UNAUTHORIZED`。UI もボタン非表示 |
| 一時停止中 | 受理し、`isPaused` を解除して満タンで走行再開 |
| 停止中（未開始/完成後） | 受理し、満タンで走行開始（RESUME と同じ寛容さ） |
| ルーム未参加 | 既存の `NOT_IN_ROOM` |

## テスト

- **core `driver-timer-restart.test.ts`**: `decide` が RESTART で `DriverTimerReset` を返す（稼働中・一時停止中・停止中）／`evolve` で `currentIndex`・`driverCounts`・`totalSwitches`・`rotation` 不変・残量満タン・`running=true`・`isPaused=false`・`accumulatedElapsedMs` が巻き戻らない／wire スキーマが `action: "RESTART"` を受理する。
- **sync `timer-restart.test.ts`**: editor が実行できる／viewer は `UNAUTHORIZED` で状態不変／一時停止中に実行すると走行再開／お題・共有メモ・設定・参加者が維持される／`scheduler` が満タン相当で再スケジュールされる。
- **web `Session.restart.test.tsx`**: editor にボタンが出て押下で `onRestartTimer` が発火する／viewer には出ない／「最初から」（RESET）とは別のボタンである（文言の区別）。
- **実画面（dev 起動での目視）**: 走行中に押して同じドライバーのままタイマーが満タンから走り直すこと・一時停止中に押して再開すること。

## 対象外

- ローテーション先頭へ戻す全体リセット（`session.reset` で対応済み）
- 人を変える交代（`SWITCH` で対応済み）
- 任意メンバーへの強制指名（Issue #13 で対応済み）
- ソロ（`LocalEngine`）の UI 配線（デッドコードのため）
