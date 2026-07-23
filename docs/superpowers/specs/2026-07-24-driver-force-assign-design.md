# 任意メンバーへのドライバー強制指名（Issue #13）設計

## 背景・目的

ホストが、現在のドライバーを「次の人」ではなく**任意のメンバーに即座に指名して交代**できるようにする。現状、交代は `(currentIndex + 1) % rotation.length` の +1 巡回のみで、特定の人を今すぐドライバーにする手段が存在しない。目的の人がドライバーになるまで「スキップ」を連打するしかない、という実機フィードバックが起点。

想定シーン: 特定メンバーに実演してもらいたい／飛ばされた人を今のターンに戻したい／進行の都合で順番を飛ばして指名したい、など。

GitHub Issue: https://github.com/tomohiroJin/tasuki-tools/issues/13

## 前提（既存実装、根拠）

- 手動交代は必ず +1: `packages/core/src/decide.ts` の `decideSessionAct` SWITCH 経路 `nextIndex = (currentIndex + 1) % rotation.length`。
- 自動交代 `advanceDriver` / `nextEligibleIndex`（`packages/core/src/evolve.ts` / `aggregate.ts`）も +1 巡回のみ。
- ドメインイベント `DriverSwitched { nextIndex }`（`packages/core/src/events.ts`）は**任意の index を受理できる**。適用ロジック `evolveDriverSwitched`（`evolve.ts`）は「前ドライバーの担当回数 +1・`totalSwitches` +1・タイマー満タン再アンカー」を行う。
- 手動 SWITCH はサーバ側（`apps/sync/src/application/handlers.ts`）で `decide` をバリデーション（`clock.running`）にのみ使い、行き先は eligible-aware な `advanceDriver` に差し替えている。
- 一時離脱／復帰（`driver.skip` / `driver.resume`）は participantId を運ぶコマンド。`driverEligible` フラグは participant 側にあり、サーバは `computeIneligibleIndices` で「表示名一致」により rotation index へ対応付ける（rotation は表示名配列で participantId を持たないため）。改名時の一意性ガードにより rotation 内に同名は無く、一意に対応付く。
- **任意メンバーを現ドライバーに指名するコマンド・UI・イベント経路は存在しない**（`makeDriver` / `assignDriver` / `setDriver` 等の検索で該当ゼロ）。拡張は decide 経路と UI の追加だけで済む見込み（`evolve` は無変更）。

## 設計判断（ユーザー承認済み）

- **一時離脱中（`driverEligible=false`）メンバーの指名 → 自動復帰**。指名は「今この人を動かす」明確な意思とみなし、離脱フラグを解除してからドライバーにする。フラグを残すと直後のタイマー自動交代で即スキップされ、受け入れ基準「満タンから再走行」と矛盾するため。
- **交代カウントは通常交代と揃える**。既存 `DriverSwitched` を再利用することで、前ドライバーの担当回数 +1・`totalSwitches` +1・タイマー満タン再アンカーが自然に入る。指名も実際のハンドオフなので一貫性がある。実装が最小。
- **対象範囲は rotation 内・稼働中のみ**。`currentIndex` は rotation 内の位置なので見学者（rotation 外）は対象外（ドライバーにするには既存手順で rotation に加えてから指名する）。タイマー非稼働中は「満タンから再走行」が意味を持たないため、SWITCH と同じく `clock.running` を要求する。
- **モード対応は core レベルのみ**。`decide` / `evolve` はモード非依存で、将来ソロ（`LocalEngine`）が復活しても数行で対応可能。ただし `LocalEngine` は現在**デッドコード**（`local-engine.ts` の定義と `Session.tsx` のコメント1行以外に import/インスタンス化が無く、参照テストもゼロ。`solo` ルート／画面も存在しない）ため、今回 UI 配線は生きているサーバ同期経路のみに行う。
- **コマンド形の橋渡し**: wire コマンドは participantId ベース（`driver.skip` と同形）、`decide` コマンドは index ベース。集約は participantId→名前の対応を持たないため、サーバが participantId → 表示名 → rotation index を解決して `decide` へ渡す（`participant.rename` が `currentDisplayName` をハンドラで解決するのと同じ流儀）。
- **権限は host 限定**。指名は本質的に「他人を今のドライバーにする」操作で、自己指名は no-op。関係的権限（本人 or host）を持ち出す必要はなく、`HOST_ONLY_COMMANDS` に置くのが最小かつ安全。

## 要件（EARS）

- ホストが特定メンバーを「ドライバーに指名」したとき、システムはそのメンバーの rotation index を `currentIndex` に設定して交代する。
- 指名交代のとき、システムはタイマーを満タンで再アンカーし、担当回数・`totalSwitches` を通常交代と同様に加算する。
- 指名先が現ドライバー自身のとき、システムは操作を無効化（no-op）する。
- 指名先が一時離脱中（`driverEligible=false`）のとき、システムはそのメンバーの離脱フラグを解除（自動復帰）してから指名する。
- タイマー非稼働中に指名要求を受けたとき、システムは `PhaseConflict` エラーを返して指名しない。
- host 以外の参加者からの指名要求を受けたとき、システムは `UNAUTHORIZED` エラーを返す。
- host 以外には「ドライバーにする」操作 UI を表示しない。

## アーキテクチャ・データフロー

```
RosterPanel「ドライバーにする」(host限定・非現ドライバー・rotation内の行)
  → onAssignDriver(participantId)
  → App.rosterAssign → client.send({ command: "driver.assign", participantId })
  → [server] handleRoomCommand
      1. HOST_ONLY 権限チェック（非host → UNAUTHORIZED）
      2. participantId → 表示名 → rotation index を解決（rotation 外/未検出 → エラー）
      3. decide({ command: "driver.assign", index }) → DriverSwitched{ nextIndex: index }
         （clock.running / 範囲 / 自己指名 no-op を検証）
      4. evolve（既存 evolveDriverSwitched: 担当+1・totalSwitches+1・満タン再アンカー）
      5. 指名先が driverEligible=false なら DriverResumed を room-level 適用（自動復帰）
      6. broadcast + reconcileSchedule
```

### Layer 1 — core `packages/core/src/decide.ts`（`evolve.ts` は無変更）

`DecideCommand` ユニオンに追加:

```ts
| { command: "driver.assign"; index: number }
```

`decide` の switch に `case "driver.assign": return decideDriverAssign(cmd.index, agg, now);` を追加。

```ts
function decideDriverAssign(
  index: number,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const { clock, session } = agg;

  // 稼働中でなければ指名しない（SWITCH と同じガード）。
  if (!clock.running) {
    return err({ type: "PhaseConflict", currentPhase: "stopped", requiredPhase: "session" });
  }
  // rotation 範囲外は不正。
  if (index < 0 || index >= session.rotation.length) {
    return err({ type: "InvalidIndex", index, max: session.rotation.length - 1 });
  }
  // 現ドライバー自身の指名は no-op（イベント無し）。
  if (index === session.currentIndex) {
    return ok([]);
  }
  return ok([{ type: "DriverSwitched", nextIndex: index, now }]);
}
```

- `evolveDriverSwitched` を再利用するため `evolve.ts` は変更しない。
- no-op は空イベント配列で表現する（エラーにしない）。ハンドラの汎用ループは 0 件を評価して無変更となり、`ok([])` は `isErr()===false` のため誤ってエラー扱いされない。

### Layer 2 — wire スキーマ `packages/core/src/schemas.ts`

`driver.skip` と同形の participantId ベースコマンドを追加:

```ts
const DriverAssignCommand = v.object({
  command: v.literal("driver.assign"),
  participantId,
});
```

`CommandSchema`（`v.variant("command", [...])`）のリストへ `DriverAssignCommand` を追加する。

### Layer 3 — サーバ `apps/sync/src/application/handlers.ts`

1. **権限**: `HOST_ONLY_COMMANDS` に `"driver.assign"` を追加する。
2. **コマンド解決**: `handleRoomCommand` で `driver.assign` を検出したら、`participantId` から対象 participant の `displayName` を引き、`targetRoom.session.rotation.indexOf(displayName)` で rotation index を解決する。未検出（見学者・不在）なら `InvalidIndex` 相当のエラーを返す。解決した index で `decide({ command: "driver.assign", index }, agg, now)` を呼ぶ。
   - `buildDomainCommand` は participantId ベースの wire コマンドを受理し、index 解決はハンドラ側で行う（`participant.rename` の `currentDisplayName` 解決と同じ位置づけ）。
3. **evolve**: 指名は手動 SWITCH ではないため、`advanceDriver` への差し替えは行わず、`decide` が返した `DriverSwitched{ nextIndex: index }` を通常の evolve ループでそのまま適用する（正確な index を使う）。
4. **自動復帰**: `driver.skip` 後処理ブランチと同じ場所に、`domainCmd.command === "driver.assign"` かつ指名先 participant が `driverEligible === false` の場合、`DriverResumed`（room-level, `driverEligible=true`）を `applyRoomLevelEvent` で適用するブランチを追加する。
5. 完了後は既存フロー通り `store.put` → `broadcastSnapshot` → `reconcileSchedule`。

### Layer 4 — UI（サーバ同期経路のみ）

- **`apps/web/src/App.tsx`**: `rosterAssign = (pid: string) => client?.send({ command: "driver.assign", participantId: pid })` を追加し、`<Session onDriverAssign={rosterAssign} ... />` として渡す。
- **`apps/web/src/ui/Session.tsx`**: props に `onDriverAssign: (participantId: string) => void` を追加し、3箇所の `<RosterPanel>` へ `onAssignDriver={onDriverAssign}` を配線する。
- **`apps/web/src/ui/components/RosterPanel.tsx`**: props に `onAssignDriver?: (participantId: string) => void` を追加。`renderRow` の host アクション行（`canRename` ブロック内）に、**`canHostAction` かつ rotation 内（`inRotation`）かつ現ドライバーでない（`!isCurrentDriver`）** 行のみ「ドライバーにする」`MiniButton` を表示し、押下で `onAssignDriver?.(p.participantId)` を呼ぶ。改名/一時離脱/移動と並ぶ位置に置く。

## エラー処理

| 状況 | 挙動 |
|------|------|
| 非 host が指名要求 | `UNAUTHORIZED`（`authorize` の HOST_ONLY で拒否）。UI 側はそもそもボタン非表示 |
| タイマー非稼働中 | `decide` が `PhaseConflict` を返す |
| 現ドライバー自身の指名 | `decide` が `ok([])`（no-op）。UI 側は現ドライバー行にボタンを出さない |
| rotation 外（見学者）／participantId 未検出 | ハンドラで解決失敗 → エラー返却（UI 側はそもそもボタン非表示） |
| 一時離脱中の指名 | 指名を実行し、加えて `DriverResumed` で離脱フラグを解除（自動復帰） |

## テスト

- **core `decide.test.ts`**（`driver.assign`）:
  - 稼働中・有効 index → `DriverSwitched{ nextIndex: index }`
  - `index === currentIndex` → `ok([])`（no-op）
  - 範囲外 index → `InvalidIndex`
  - 非稼働中（`clock.running=false`）→ `PhaseConflict`
- **core evolve（指名パス）**: `driver.assign` 由来の `DriverSwitched` が前ドライバーの担当回数 +1・`totalSwitches` +1・タイマー満タン再アンカーを行うことを1件で確認（大半は既存 `DriverSwitched` テストがカバー）。
- **handler test**（`handlers.ts`）:
  - host 限定（非 host → `UNAUTHORIZED`）
  - participantId → rotation index 解決が正しい
  - 一時離脱中メンバー指名で `driverEligible` が復帰する
  - 現ドライバー指名で状態不変（no-op）
- **`RosterPanel` test**:
  - host は現ドライバー以外の rotation 行に「ドライバーにする」を表示する
  - 非 host には表示しない
  - 現ドライバー行・見学者行には表示しない
- **実画面（dev 起動での目視）**: host が任意メンバーを指名 → `currentIndex` 移動・タイマー満タン再走行・離脱者指名で「離脱中」バッジ解除、を確認する。

## 対象外

- ローテーションの順番並べ替え（`member.move` で対応済み）
- ローテーションからの一時離脱／復帰そのもの（`driver.skip` / `driver.resume` で対応済み）
- 現ドライバーを維持したままの持ち時間再スタート（別 Issue）
- 見学者（rotation 外）の指名（rotation に加えてから指名する運用）
- ソロ（`LocalEngine`）の UI 配線（現在デッドコードのため。core 変更で将来対応は容易）
