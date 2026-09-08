# 役割とホストの廃止（#95 S3・#244）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ルームに居る全員を完全に同格にし、`Role` 型・ホスト・それらに依存する権限判定と不変条件を Tasuki 全体から取り除く。

**Architecture:** 権限判定を「削る」のではなく、判定の層そのものを消す。timer は `checkPermission` を呼ぶ 1 箇所（`rejectIfUnauthorized`）を撤去し、`Participant.role` と `Room.hostParticipantId` を型から落とす。poker は `requireHost` を撤去し `isHost` を wire 契約から外す。未知コマンドの拒否は境界の valibot（`CommandSchema`）が引き続き単独で担う。「進行から外れる」は既存の `driver.skip` / `driverEligible` が担い続ける。

**Tech Stack:** TypeScript 6 / valibot / neverthrow / React 19 / vitest 4（timer-web・両 core・poker-web）/ bun test（tasuki-sync）/ Playwright（e2e）/ pnpm 11 + turbo 2

**Spec:** `docs/superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md`（決定 D5・段階 §7・検証 §6）

## Global Constraints

- **この段をマージした時点で E2E が緑で、両ツールとも完全に使えること**（設計正本 §7 スライスの原則 2）。
- **`main` は常にデプロイ可能に保つ**（同 原則 3）。ただし S3 は配備資材の変更を伴わない（設計正本 §7 の表の S3 行が「—」）。
- **1 コミット = 1 つの論理的変更。**コミットメッセージは日本語、Conventional Commits の type を付ける。
- **削除するテストは「守っていた性質が概念ごと消えたもの」だけ**（設計正本 §6.5）。PR 本文で 1 本ずつ「消した／書き換えた」根拠を示す。
- **`node scripts/mutation-check.mjs` は作業ツリーが clean でないと走らない。**回すのは Task 8。
- **リンク検査は `git ls-files` を見る。**新規ファイルは `git add` するまで走査されない。
- 検査の指標（SC-029 / SC-032 / SC-039 等）は**着手時と完了時に実測する**。過去の記録と比べない。
- 作業場所は `/workspaces/claym/local/Tasuki`（そのままで可）。ブランチは `feature/s3-remove-roles-and-host`。

---

## 規約チェック（Constitution Check）

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。
判定は **S3 が実際にやること**に照らして書く（一般論では書かない）。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | この段は大半が削除であり、TDD が効くのは**新しい振る舞いを固定する側**に限られる。「全員同格」を先に固定する新規テスト（`apps/tasuki-sync/test/all-equal-permissions.test.ts` ほか各層 1 本ずつ）と、境界の単独責務を固定する `apps/tasuki-sync/test/unknown-command-boundary.test.ts`、移設先の `packages/timer-core/test/removal-notification.test.ts` を Red から書く。削除するテストは「守っていた性質が概念ごと消えたもの」に限り、1 本ずつ根拠を PR 本文へ書く（設計正本 §6.5） |
| II. 技術選定は ADR を通す | 該当なし | 依存もスタックも変えない（`package.json` / `pnpm-lock.yaml` に差分を出さない）。廃止という**決定**そのものの記録先は原則 VIII の欄に書く |
| III. 揮発インメモリと単純運用 | 通過 | 永続化を足さない。配備資材の変更も伴わない（設計正本 §7 の表の S3 行が「—」）。**この段が wire の非互換を受容できる根拠が原則 III そのものである** —— 配備でプロセスが再起動すれば全ルームが消えるので、古いタブに守るべき状態がそもそも存在しない（`packages/timer-core/src/error-messages.ts` の「#95 S3 で受容した非互換」） |
| IV. 境界の型安全 | 通過 | Valibot による境界検証も、`Result` で失敗を表す規律も変えない。**緊張**: `checkPermission` のステップ 0（`REGISTERED_COMMANDS` による default-deny）が消えるため、未知コマンドの拒否は境界の `CommandSchema`（`v.variant`）**単独**になる（二重だった防御が一重になる）。恒真でないことを Task 3 Step 9 で破壊検証し、上記の境界テストで固定する。**緊張**: `ServerMsg` から必須フィールド 3 つ（`hostToken` / `hostParticipantId` / `role`）を落とすので**wire 契約が後方非互換**になる。任意化で 1 リリース残す案は採らず、受容の理由と将来の判断材料を `packages/timer-core/src/error-messages.ts` へ記録する |
| V. 実画面検証 | 通過 | Task 8 Step 7 で実画面を通す（非作成者が開始前に設定を変えられる／名簿にホストのバッジと見学者の盤が出ない／見送りが全員に出る／poker で非作成者が公開と次ラウンドを実行できる）。E2E も新しい振る舞いへ向け直す（Task 7） |
| VI. 依存は内向き | 通過 | `packages/*-core` は純粋関数と純粋なデータ構造のまま。副作用も外向きの依存も足さない。`removalNotificationFor` / `RemovalNotification` は削除する `participants.ts` からの**移設**であり、層をまたがない |
| VII. 検査は壊して確かめる | 通過 | 破壊検証は Task 3 Step 9（境界だけで未知コマンドが落ちること）。変異検査は Task 8 Step 2 を clean な作業ツリーで回し、概念ごと消えた変異 2 件（id 2 / id 5）だけを落として **id は詰めない**。**緊張**: 走査対象の健全性（[`docs/adr/0014`](../../adr/0014-scan-target-integrity.md)）を洗う Task 8 Step 4 の grep は**消えたファイル名しか見ておらず、消えた「型名」を宣言している検査を取りこぼす**。現に `scripts/audit-domain-error-shape.mjs` が `Unauthorized` を宣言したまま残り、当の検査自身が赤で捕まえた |
| VIII. 記録が正本 | 通過 | 廃止の決定の正本は [`docs/timer/adr/0007`](../../timer/adr/0007-volatile-in-memory-state.md) の改定と [`docs/adr/0011`](../../adr/0011-threat-model-and-data-classification.md) 決定 2、廃止対象の一覧は[設計正本](../specs/2026-09-06-shared-identity-and-rooms-design.md) D5。この計画は正本を作らず参照する。**この段で完了形にしてよいのは S3 が実際に消したものだけ**であり、S4a 以降のもの（`config.members` の廃止・ローテーションの `RotationEntry` 化・名簿統合・同一性の `localStorage` 化）を「廃止した」と書かない |
| IX. 小さく回す | 通過 | 「役割とホストの廃止」という 1 つの論理的変更に留め、名簿統合（S4a）と同一性・在席（S4b）は持ち込まない。規模は大きくなるが、ドメイン・サーバー・両 Web・E2E を同時に落とさないと**片方のツールが到達不能な中間状態**ができる（設計正本 §7 スライスの原則 2）ので分割しない。粒度の正本は [`docs/guides/pr-granularity.md`](../../guides/pr-granularity.md)。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 新しい抽象を作らない。`packages/timer-core/src/removal-notification.ts` の `removalNotificationFor` は利用者が 1 つ（`apps/tasuki-sync/src/application/command-handlers/participant-remove.ts`）だが、これは**新規の抽出ではなく、削除する `participants.ts` からの退避**である。抽出であれば「利用者が 1 つしか無いものを抽出しない（MUST NOT）」に触れるため、性格の違いをここに記録しておく |
| XI. 秘密と個人情報を持ち込まない | 通過 | 新しい入力・保持・出力を足さず、ログ出力の経路も変えない。むしろ分類「資格情報」を 1 つ**減らす** —— `hostToken` は `TokenStore.verifyHost` の非テスト呼び出しが 0 件で、照合する経路が無いまま発行・送信されていた。機構ごと落とす |

**逸脱なし。** Complexity Tracking での正当化を要する項目は無い。表で「緊張」と書いた 3 点は、
いずれも憲法の MUST に反するものではなく、**既存の要求と設計の変更**である。
逸脱ではないが、後戻りの費用が高いので記録しておく。

- **権限が意図的に広がる。** ルームに居る誰でもすべてのルーム操作を実行でき、
  `room.passphrase.set` も含む。参加者の誰でも合言葉を変更でき、他の参加者を締め出しうる。
  **2026-09-06 に利用者が承認済み**で、記録は[設計正本](../specs/2026-09-06-shared-identity-and-rooms-design.md) §8 にある。
  #145 が定めたエントロピー規範は入力の強度の話であり、この権限の話ではない
- **可否判定の層を丸ごと消す。** `permissions.ts` の判定順序には過去の回帰が複数刻まれており、
  消したあとで「やはり主催者が要る」となった場合、同じ精度で書き直すのは容易でない（同 §8）。
  この費用を承知のうえで消す
- **wire の非互換は「1 通のメッセージが落ちる」ではなく「その接続の snapshot が全部落ちる」。**
  受容の理由（揮発インメモリ）と、将来この理由が成立しなくなる条件は
  `packages/timer-core/src/error-messages.ts` に記録する

> **この節は着手後（2026-09-09）に追記した。** ゲートの趣旨は計画を書き始める前に通すことなので、
> 順序としては誤りである。抜けは `node scripts/audit-plan-gate.mjs` が PR 直前に捕まえた。

---

## 着手前に確定した事実（2026-09-08・main `781e9ce` で実測）

計画の前提はすべてこの版で数え直した。**Issue #244 本文と設計正本 §3.7 の数値は古いか、偽陽性を含む。**

| 事実 | 実測値 | 備考 |
|---|---|---|
| 全テストファイル | 292 | 設計正本 §3.7 は 267（S1・S2 前） |
| 役割・ホストに触れるテストファイル | 98 | 内訳 timer-web 45 / tasuki-sync 37 / timer-core 7 / poker-core 3 / poker-web 3 / e2e 3 |
| 役割・ホストに触れる非テストファイル | 53（うち **14 は JSX の ARIA `role=` 属性のみ**） | **実際の対象は 39 本** |
| 実際の対象の内訳 | timer-web 17 / tasuki-sync 10 / timer-core 5 / poker-core 4 / poker-web 2 / e2e 1 | |

**設計正本 §3.7 の正規表現 `\brole\b|isHost|...` は JSX の ARIA 属性（`role="dialog"` 等）を巻き込む。**
`location.host` の偽陽性は正本が警告しているが、ARIA `role` は警告していない。除外すべき 14 本:
`apps/poker-web/src/{App.tsx,components/CardHand.tsx,components/ErrorNote.tsx}`、
`apps/timer-web/src/ui/useFocusTrap.ts`、
`apps/timer-web/src/ui/components/{ConfirmDialog,EmptyHint,EndSessionZone,NotifyHint,NotifySettings,NotifySettingsPanel,ProblemModeToggle,SessionConfigPanel,SwitchAlert,Tabs}.tsx`。

### Issue #244 本文・設計正本との差異（実測で判明）

1. **完了条件「`participants.ts` を削除する」は、そのままでは振る舞いを壊す。**
   `participants.ts` は 2 つの無関係な責務を持つ。役割由来の `canDemote` / `canRemoveParticipant`
   （「編集者以上が 1 名以上残る」不変条件）と、**役割と無関係な `removalNotificationFor` /
   `RemovalNotification`**（「自分で抜けた（LEFT_ROOM）」と「外された（REMOVED_FROM_ROOM）」の
   出し分け）である。後者は `apps/tasuki-sync/src/application/command-handlers/participant-remove.ts:115`
   が使っており、消すと通知文が壊れる。→ **A1**（後述）で解決する。

2. **`hostToken` は製品コードのどこからも検証されていない。**
   `TokenStore.verifyHost` の非テスト呼び出しは 0 件。`room-create.ts` が発行し
   `room.created` フレームで web へ渡しているが（`schemas.ts:477`・`dispatch.ts:97`・`client.ts:18`）、
   照合する経路が無い。S3 で機構ごと落とせる。Issue 本文にも設計正本にも記載が無い発見。

3. **`checkPermission` を消しても未知コマンドは fail-open しない。**
   `checkPermission` のステップ 0（`REGISTERED_COMMANDS` による default-deny）は
   境界の valibot と二重になっている。実経路は `apps/tasuki-sync/src/adapters/ws-adapter.ts:565`
   → `parseBoundaryMessage(CommandSchema, raw)`。`CommandSchema` は
   `v.variant("command", [...])`（`packages/timer-core/src/schemas.ts:288`）なので、
   union に無い `command` は境界で落ちる。**Task 3 で破壊検証して確かめる（Step 3-9）。**

4. **`role` と `driverEligible` は独立した 2 層モデルである**
   （`packages/timer-core/src/error-messages.ts:91` がこの区別を明記）。
   「見学者（`role: "viewer"`）」＝操作できない立場、「見送り（`driverEligible: false`）」＝
   ローテーションから一時的に外れる、で別物。**役割を消してもローテーション離脱は残る。**

### 前提として置く判断（この計画はこれに従う。異論があれば着手前に覆すこと）

- **A1: `removalNotificationFor` / `RemovalNotification` は残す。**
  `packages/timer-core/src/removal-notification.ts` へ移し、`participants.ts` を削除する。
  Issue の完了条件（`participants.ts` を削除）を字面どおり満たしつつ、役割と無関係な振る舞いを守る。
- **A2: 見学者（`viewer`）は概念ごと消える。**「進行から外れる」は既存の `driver.skip`
  （`driverEligible`）が引き受ける。`SpectatorSelfActions.tsx` は削除し、`SelfDriverToggle` を
  全参加者へ出す。根拠は `docs/timer/adr/0007` の改定（役割 `host`/`editor`/`viewer` を廃止と明記）。
- **A3: AI 出題の委譲順（FR-026）から「ホスト優先」が落ちる。**
  `buildCandidates` は「`hasAiKey` かつ `presence === "online"` かつ `connId !== null` を
  `joinedAt` 昇順、末尾に定型センチネル」になる。
- **A4: ホスト不在の自動委譲（FR-018・`scheduleHostAbsence`）は概念ごと消える。**
  `docs/timer/adr/0007` の改定が「S3 の完了をもって適用対象を失う」と既に決めている。
- **A5: poker の `not-host` は wire の契約から外す**（`ERROR_CODES` と `RoundError` の双方）。
  `reveal` / `next-round` は在室者なら誰でも実行できる。
- **A6: `room.passphrase.set` と `ai.unlock` が全員可になる。**受容済み（設計正本 §8）。

---

## File Structure

### 削除するファイル（本体と、概念ごと消えるテスト）

> **件数はここに書かない**（項目を足すと腐る）。実際に消す一覧は各タスクの `git rm` が正本である。

| パス | 消える理由 |
|---|---|
| `packages/timer-core/src/permissions.ts` | 権限判定の層ごと消える（D5） |
| `packages/timer-core/src/participants.ts` | 役割由来の不変条件が消える。`removalNotificationFor` は A1 で移設 |
| `packages/timer-core/test/permissions.test.ts` | 対象の関数が無い |
| `packages/timer-core/test/permissions-differential.test.ts` | 守っていた「層②の喪失」という回帰が起こりえない（設計正本 §6.5 が名指し） |
| `packages/timer-core/test/transfer-host.test.ts` | `transferHost` が無い |
| `apps/tasuki-sync/src/application/command-handlers/role-set.ts` | `role.set` が無い |
| `apps/tasuki-sync/src/application/command-handlers/host-transfer.ts` | `host.transfer` が無い |
| `apps/timer-web/src/ui/permission-hints.ts` | 役割を差し替えてヒントを出す機構ごと消える |
| `apps/timer-web/src/ui/components/SpectatorSelfActions.tsx` | 見学者という立場が無い（A2） |
| `apps/timer-web/src/ui/host-change.ts` | ホスト交代という事象が無い |

### 新設するファイル

| パス | 責務 |
|---|---|
| `packages/timer-core/src/removal-notification.ts` | 退出通知の種類の判定のみ（A1・`participants.ts` から移設） |

### 主要な変更ファイル

- `packages/timer-core/src/{aggregate,schemas,error-messages,index}.ts`
- `apps/tasuki-sync/src/application/{handlers,presence,problem-delegation,apply-room-level-event,token-store}.ts`
- `apps/tasuki-sync/src/application/command-handlers/{participant-remove,room-create,room-join}.ts`
- `apps/timer-web/src/ui/{Lobby.tsx,Session.tsx,participant-label.ts,components/RosterPanel.tsx,components/SelfDriverToggle.tsx}`
- `apps/timer-web/src/sync/{commands,dispatch,use-timer-sync,client}.ts`
- `packages/poker-core/src/{room,round,snapshot,protocol,error-messages}.ts`
- `apps/poker-web/src/pages/RoomPage.tsx`・`apps/poker-web/src/components/ParticipantList.tsx`
- `scripts/mutation-check.mjs`＋`scripts/mutations/m0{2,5}-*.patch`
- `docs/timer/adr/0007-volatile-in-memory-state.md`

---

### Task 1: timer-core から権限判定と役割由来の不変条件を落とす

**Files:**
- Create: `packages/timer-core/src/removal-notification.ts`
- Create: `packages/timer-core/test/removal-notification.test.ts`
- Delete: `packages/timer-core/src/permissions.ts`
- Delete: `packages/timer-core/src/participants.ts`
- Delete: `packages/timer-core/test/permissions.test.ts`
- Delete: `packages/timer-core/test/permissions-differential.test.ts`
- Delete: `packages/timer-core/test/participants.test.ts`
- Modify: `packages/timer-core/src/index.ts:88-92`

**Interfaces:**
- Consumes: なし（この段の起点）
- Produces: `removalNotificationFor(actorParticipantId: string, targetParticipantId: string): RemovalNotification`、
  `type RemovalNotification = "LEFT_ROOM" | "REMOVED_FROM_ROOM"`。
  **`checkPermission` / `isAllowed` / `Role` / `PermissionInput` / `canDemote` / `canRemoveParticipant` は以後存在しない。**

- [ ] **Step 1: 移設先のテストを書く（先に失敗させる）**

`packages/timer-core/test/removal-notification.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { removalNotificationFor } from "../src/removal-notification.js";

describe("removalNotificationFor", () => {
  it("実行者と対象が同一なら自分の意思による退出として扱う", () => {
    expect(removalNotificationFor("p1", "p1")).toBe("LEFT_ROOM");
  });

  it("実行者と対象が異なるなら他者の操作による退出として扱う", () => {
    expect(removalNotificationFor("p1", "p2")).toBe("REMOVED_FROM_ROOM");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd packages/timer-core && corepack pnpm exec vitest run test/removal-notification.test.ts`
Expected: FAIL（`Failed to resolve import "../src/removal-notification.js"`）

- [ ] **Step 3: `removal-notification.ts` を作る**

`packages/timer-core/src/removal-notification.ts`:

```ts
/**
 * 退出させられた本人へ送る通知の種類（Issue #32: 誰の操作かで分かれる）。
 *
 * #95 S3 で役割とホストを廃止した際、`participants.ts`（役割由来の不変条件）から
 * この 2 つだけを切り出した。**役割とは無関係な判定**であり、全員同格になっても
 * 「自分で抜けた」と「他の人に外された」の区別は残る。
 */

/** 退出させられた本人へ送る通知の種類。 */
export type RemovalNotification = "LEFT_ROOM" | "REMOVED_FROM_ROOM";

/**
 * 退出させられた本人へ送る通知の種類を、実行者と対象の関係から決める。
 *
 * 自分が自分を対象に退出を実行したのなら、それは本人自身の意思による退出であり、
 * 他者に外されたかのように伝えてはならない。
 */
export function removalNotificationFor(
  actorParticipantId: string,
  targetParticipantId: string,
): RemovalNotification {
  return actorParticipantId === targetParticipantId ? "LEFT_ROOM" : "REMOVED_FROM_ROOM";
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `cd packages/timer-core && corepack pnpm exec vitest run test/removal-notification.test.ts`
Expected: PASS（2 件）

- [ ] **Step 5: 旧ファイルと旧テストを消す**

```bash
cd /workspaces/claym/local/Tasuki
git rm packages/timer-core/src/permissions.ts \
       packages/timer-core/src/participants.ts \
       packages/timer-core/test/permissions.test.ts \
       packages/timer-core/test/permissions-differential.test.ts \
       packages/timer-core/test/participants.test.ts
```

- [ ] **Step 6: `index.ts` の公開面から 5 行を落とし、1 行を足す**

`packages/timer-core/src/index.ts:88-92` を丸ごと次で置き換える:

```ts
export type { RemovalNotification } from "./removal-notification.js";
export { removalNotificationFor } from "./removal-notification.js";
```

- [ ] **Step 7: 型検査で「この時点で壊れている場所」を洗い出す（緑にはならない）**

Run: `corepack pnpm exec turbo run typecheck --filter=@tasuki/timer-core`
Expected: `aggregate.ts` / `schemas.ts` / `error-messages.ts` が `Role` を参照して FAIL。
**この赤は Task 2 で解消する。**エラーの一覧を控えて Task 2 の入力にする。

- [ ] **Step 8: コミット（ここではまだ緑にならない。Task 2 と 1 つの論理変更なので commit は分けるが push は Task 2 の後）**

```bash
git add -A packages/timer-core
git commit -m "refactor: 権限判定と役割由来の不変条件を timer-core から外す（#95 S3）

- permissions.ts（checkPermission・Role・PermissionInput）を削除
- participants.ts の canDemote / canRemoveParticipant を削除
- 役割と無関係な removalNotificationFor は removal-notification.ts へ移設"
```

---

### Task 2: timer-core の集約と wire 契約から役割・ホストを落とす

**Files:**
- Modify: `packages/timer-core/src/aggregate.ts:94`（`role`）・`:114`（`hostParticipantId`）・`:240-260`（`transferHost`）
- Modify: `packages/timer-core/src/schemas.ts:268-275`（`role.set` / `host.transfer` コマンド）・`:336`（`role`）・`:382`（`hostParticipantId`）・`:477`（`hostToken`）
- Modify: `packages/timer-core/src/error-messages.ts`（`CANNOT_CHANGE_HOST_ROLE` / `LAST_MANAGER_DEMOTE` 等）
- Modify: `packages/timer-core/src/index.ts`
- Delete: `packages/timer-core/test/transfer-host.test.ts`
- Modify: `packages/timer-core/test/{aggregate,schemas,error-messages.specificity}.test.ts`

**Interfaces:**
- Consumes: Task 1 の削除結果
- Produces: `Participant` から `role` が消え、`Room` から `hostParticipantId` が消える。
  `Command` union から `role.set` / `host.transfer` が消える。
  `room.created` フレームから `hostToken` が消える。**`transferHost` は存在しない。**

- [ ] **Step 1: 壊れることを先に固定するテストを書く**

`packages/timer-core/test/schemas.test.ts` に追記:

```ts
  it("役割とホストのコマンドは受理しない（#95 S3 で廃止）", () => {
    // 廃止したコマンドは variant のどの枝にも当たらないので境界で落ちる。
    expect(v.safeParse(CommandSchema, { command: "role.set", participantId: "p1", role: "viewer" }).success)
      .toBe(false);
    expect(v.safeParse(CommandSchema, { command: "host.transfer", participantId: "p1" }).success)
      .toBe(false);
  });

  it("参加者のスキーマは role を持たない（#95 S3 で廃止）", () => {
    const participant = {
      participantId: "p1",
      displayName: "あかり",
      connId: "c1",
      presence: "online",
      hasAiKey: false,
      joinedAt: 0,
    };
    // 余剰キーを拒否する厳格スキーマなので、role を足すと落ちる。
    expect(v.safeParse(ParticipantSchema, { ...participant, role: "host" }).success).toBe(false);
    expect(v.safeParse(ParticipantSchema, participant).success).toBe(true);
  });
```

> **注意:** `ParticipantSchema` が `v.object`（余剰キーを黙って捨てる）の場合、後半の
> 否定は空振りする。**先に `schemas.ts` の該当スキーマが `v.strictObject` かを読んで確かめ、
> `v.object` なら「role を含む値をパースした結果に `role` キーが無いこと」で固定する**。
> 否定の空振りは過去に実際に「通っていないのに緑」を作っている（[[playwright-assertion-traps]] と同じ型）。

- [ ] **Step 2: 失敗を確認する**

Run: `cd packages/timer-core && corepack pnpm exec vitest run test/schemas.test.ts`
Expected: FAIL（`role.set` が現在は受理されるため）

- [ ] **Step 3: 集約から `role` と `hostParticipantId` を落とす**

`packages/timer-core/src/aggregate.ts`:
- `Participant` インターフェース（`:94`）から `role: "host" | "editor" | "viewer";` の行を削除する。
- `Room` インターフェース（`:114`）から `hostParticipantId: ParticipantId;` の行を削除する。
- `transferHost` 関数（`:240` 付近の JSDoc を含む定義全体）を削除する。

- [ ] **Step 4: wire 契約から落とす**

`packages/timer-core/src/schemas.ts`:
- `:268-272` の `role.set` コマンドスキーマ定義を削除する。
- `:274-276` の `host.transfer` コマンドスキーマ定義を削除する。
- `CommandSchema`（`:288`）の variant 配列から、上記 2 つの参照を削除する。
- 参加者スキーマ（`:336`）の `role: v.picklist([...])` の行を削除する。
- ルームスナップショット（`:382`）の `hostParticipantId: participantId,` の行を削除する。
- `room.created` フレーム（`:477`）の `hostToken: nonEmptyString,` の行を削除する。

- [ ] **Step 5: エラー文言表から役割由来のコードを落とす**

`packages/timer-core/src/error-messages.ts` から、役割・ホストが無ければ到達しなくなる
コードのエントリと、それを説明するコメント（`:88-107` の該当行）を削除する。対象:
`CANNOT_CHANGE_HOST_ROLE` / `LAST_MANAGER_DEMOTE` / `UNAUTHORIZED`（＋ホスト移譲でオフライン対象を拒否するコード）。

> **`UNAUTHORIZED` を消す前に確かめること。**`grep -rn '"UNAUTHORIZED"' --include='*.ts' apps packages | grep -v '\.test\.'`
> を走らせ、**役割以外の理由で送る経路が 1 つも残っていない**ことを確認する。
> 残っているなら `UNAUTHORIZED` は残す（消してよいのは役割由来の 3 つだけ）。

- [ ] **Step 6: `index.ts` から `transferHost` の再輸出を落とす**

Run: `grep -n "transferHost" packages/timer-core/src/index.ts` で行を特定し、その行を削除する。

- [ ] **Step 7: 旧テストを消し、残るテストを直す**

```bash
git rm packages/timer-core/test/transfer-host.test.ts
```

`packages/timer-core/test/aggregate.test.ts` / `error-messages.specificity.test.ts` は、
`role:` / `hostParticipantId:` を含む固定値と、消えたエラーコードの期待を落とす。
**「テストごと消す」のではなく「役割に関する記述だけを外す」**（他の性質を守っているため）。

- [ ] **Step 8: 緑を確認する**

Run: `cd /workspaces/claym/local/Tasuki && corepack pnpm exec turbo run test typecheck --filter=@tasuki/timer-core --force`
Expected: PASS（`Cached: 0 cached` を確認する）

- [ ] **Step 9: コミット**

```bash
git add -A packages/timer-core
git commit -m "refactor!: timer-core の集約と wire 契約から役割・ホストを外す（#95 S3）

- Participant.role と Room.hostParticipantId を削除
- role.set / host.transfer コマンドと transferHost を削除
- room.created から hostToken を削除（検証経路が製品コードに無い死んだ機構）"
```

---

### Task 3: tasuki-sync の timer 側から権限判定とホストを落とす

**Files:**
- Modify: `apps/tasuki-sync/src/application/handlers.ts`（`rejectIfUnauthorized` `:677-691`／`role.set` 分岐 `:361-366`／`host.transfer` 分岐 `:388-393`／`resolveIsSelfTarget` `:760-785`／`transferHostBeforeRemoval` `:790-` ／輸入 `:14,22`）
- Modify: `apps/tasuki-sync/src/application/presence.ts`（`scheduleHostAbsence` `:101-130` とその呼び出し・タイマー表）
- Modify: `apps/tasuki-sync/src/application/problem-delegation.ts:337-360`（`buildCandidates`）
- Modify: `apps/tasuki-sync/src/application/apply-room-level-event.ts:128`
- Modify: `apps/tasuki-sync/src/application/token-store.ts`（`issueHost` / `verifyHost` / `hostTokens`）
- Modify: `apps/tasuki-sync/src/application/command-handlers/{participant-remove,room-create,room-join}.ts`
- Delete: `apps/tasuki-sync/src/application/command-handlers/{role-set,host-transfer}.ts`
- Delete: `apps/tasuki-sync/test/{permissions-after-start,permissions-before-start,live-ws.permissions,host-transfer,handoff-host,self-role-change,authorize}.test.ts`
- Modify: 残る tasuki-sync のテスト 30 本

**Interfaces:**
- Consumes: Task 2 の `Participant`（`role` なし）・`Room`（`hostParticipantId` なし）・`Command`（2 コマンド減）
- Produces: `handleCommand` は在室確認とアクター解決のみを行い、**可否判定を持たない**。
  `TokenStore` は `issueResume` / `verifyResume` / パスフレーズのみを持つ（`issueHost` / `verifyHost` は無い）。
  `CreateResult` から `hostToken` が消える。

- [ ] **Step 1: 「全員が実行できる」ことを固定するテストを書く**

`apps/tasuki-sync/test/all-equal-permissions.test.ts`（新規）:

```ts
import { describe, it, expect } from "bun:test";
import { createTestServer } from "./support/test-server.js"; // ← 既存の支援名は実測して合わせる

describe("#95 S3: ルームに居る全員が同格である", () => {
  it("後から参加した人が開始前に session.abort を実行できる", async () => {
    const { creator, joiner, close } = await createTestServer();
    // 作成者ではない参加者が、かつてホスト限定だったコマンドを開始前に実行する。
    const result = await joiner.send({ command: "session.abort" });
    expect(result.type).not.toBe("error");
    await close();
  });

  it("後から参加した人が開始前に room.passphrase.set を実行できる", async () => {
    const { joiner, close } = await createTestServer();
    const result = await joiner.send({ command: "room.passphrase.set", passphrase: "ひらけごま2026" });
    expect(result.type).not.toBe("error");
    await close();
  });
});
```

> **支援モジュールの実名を先に確かめる。**`ls apps/tasuki-sync/test/support/` と
> `head -40 apps/tasuki-sync/test/permissions-before-start.test.ts` を読み、
> **既存テストと同じ組み立て方**に合わせること（模写を作らない）。
> `permissions-before-start.test.ts` は削除対象だが、**その中の「非ホストが開始前に
> 拒否される」ケースを反転させたものが、このテストの中身になる。**

- [ ] **Step 2: 失敗を確認する**

Run: `cd apps/tasuki-sync && bun test test/all-equal-permissions.test.ts`
Expected: FAIL（現在は `UNAUTHORIZED` が返る）

- [ ] **Step 3: 権限判定の呼び出しと関数を撤去する**

`apps/tasuki-sync/src/application/handlers.ts`:
- `:329-334` の `rejectIfUnauthorized(...)` 呼び出しブロックと、その直前の説明コメントを削除する。
- `:677-691` の `rejectIfUnauthorized` 関数定義を削除する。
- `:760-785` の `resolveIsSelfTarget` 関数定義を削除する（唯一の呼び出し元が消えるため）。
- `:361-366` の `role.set` 分岐と `:388-393` の `host.transfer` 分岐を削除する。
- 輸入から `checkPermission` を外す（`:14`）。`RemovalNotification`（`:22`）は残す。
- `handleRoleSet` / `handleHostTransfer` の生成と輸入を削除する。

- [ ] **Step 4: 退出のホスト引き継ぎと不変条件を撤去する**

- `handlers.ts` の `transferHostBeforeRemoval`（`:790` 付近の JSDoc「1. オンラインの編集者 …」を
  持つ関数）を削除し、`handleParticipantRemove` へ渡す deps からも外す。
- `command-handlers/participant-remove.ts`:
  - `:19-20` の輸入から `canRemoveParticipant` を外す（`removalNotificationFor` は残す）。
  - `:92` の `if (!canRemoveParticipant(...))` ガードと `LAST_MANAGER` エラー送出を削除する。
  - `:146-150` のホスト引き継ぎ（`roomBeforeRemoval` の分岐）を削除し、対象を単純に名簿から外す。
  - deps 型から `transferHostBeforeRemoval` を外す。

- [ ] **Step 5: ホスト不在の自動委譲を撤去する（A4）**

`apps/tasuki-sync/src/application/presence.ts`:
- `scheduleHostAbsence`（`:101-130`）と `clearHostAbsenceTimer`、`hostAbsenceTimers`、
  `HOST_ABSENCE_GRACE_MS` の定義と全呼び出しを削除する。
- **`scheduleDriverAbsence`（ドライバー不在の繰り上げ）は残す。**これは役割ではなく
  ローテーションの話であり、S3 の対象外である。

- [ ] **Step 6: AI 委譲の候補列からホスト優先を落とす（A3）**

`apps/tasuki-sync/src/application/problem-delegation.ts:337-360` を次で置き換える:

```ts
/**
 * 候補列を構築する（FR-026）。
 * `hasAiKey` の online を joinedAt 昇順に並べ、末尾に必ず定型確定のセンチネルを置く。
 *
 * #95 S3 で役割とホストを廃止したため、かつての「ホストを優先し、続いて editor+」という
 * 2 段の並びは無くなった。全員同格なので参加順だけで決まる。
 */
function buildCandidates(room: Room): string[] {
  const ordered = room.participants
    .filter((p) => p.presence === "online" && p.connId !== null && p.hasAiKey)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => p.participantId);

  return [...ordered, FALLBACK];
}
```

- [ ] **Step 7: 生成・参加・トークンから役割とホストを落とす**

- `command-handlers/room-create.ts`: `:79-83` の `role: "host"` を落とし、`:92` の
  `hostParticipantId` を落とす。`:30`・`:66`・`:107`・`:113`・`:120` の `hostToken` 一式を削除する
  （`CreateResult` 型の `hostToken` フィールドも）。
- `command-handlers/room-join.ts`: `:154` の `role: "editor"` を落とし、`:146` の
  「純粋な見学者は host が role.set で viewer へ降格できる」というコメントを削除する。
- `apply-room-level-event.ts`: `:128` の `role: "editor"` を落とす。
  **`:133`・`:161`・`:170` の `driverEligible` は残す**（別概念）。
- `token-store.ts`: `issueHost` / `verifyHost` / `hostTokens` と、`releaseRoom`（`:68`）の
  `hostTokens.delete(roomCode)` を削除する。`resumeTokens` と `roomPassphrases` は残す。

- [ ] **Step 8: 新しいテストが通ることを確認する**

Run: `cd apps/tasuki-sync && bun test test/all-equal-permissions.test.ts`
Expected: PASS（2 件）

- [ ] **Step 9: 未知コマンドが境界で落ちることを破壊検証する（差異 3 の確認）**

`checkPermission` のステップ 0 が消えたので、その穴が塞がっていることを実測する。

```bash
cd apps/tasuki-sync
cat > /tmp/claude-1000/unknown-command-check.test.ts <<'EOF'
import { describe, it, expect } from "bun:test";
import { CommandSchema } from "@tasuki/timer-core";
import * as v from "valibot";

describe("境界の default-deny", () => {
  it("union に無いコマンドは valibot で落ちる", () => {
    expect(v.safeParse(CommandSchema, { command: "role.set", participantId: "p1", role: "viewer" }).success).toBe(false);
    expect(v.safeParse(CommandSchema, { command: "totally.unknown" }).success).toBe(false);
  });
  it("対照: 正当なコマンドは通る", () => {
    expect(v.safeParse(CommandSchema, { command: "session.abort" }).success).toBe(true);
  });
});
EOF
cp /tmp/claude-1000/unknown-command-check.test.ts test/unknown-command-boundary.test.ts
bun test test/unknown-command-boundary.test.ts
```

Expected: PASS（3 件。**対照の 1 件が通ることまで確認する** → [[checks-need-a-control-run]]）。
このテストは**残す**（境界が default-deny を担っていることの継続的な証拠になるため）。

- [ ] **Step 10: 概念ごと消えるテストを削除する**

```bash
git rm apps/tasuki-sync/test/permissions-after-start.test.ts \
       apps/tasuki-sync/test/permissions-before-start.test.ts \
       apps/tasuki-sync/test/live-ws.permissions.test.ts \
       apps/tasuki-sync/test/host-transfer.test.ts \
       apps/tasuki-sync/test/handoff-host.test.ts \
       apps/tasuki-sync/test/self-role-change.test.ts \
       apps/tasuki-sync/test/authorize.test.ts
```

> **`authorize.test.ts` は消す前に中身を読むこと。**名前は権限由来だが、在室確認や
> アクター解決（役割と無関係で S3 後も残る性質）を守っている可能性がある。
> 役割以外の性質を含むなら、**その部分だけを残して書き換える**。

- [ ] **Step 11: 残る 30 本のテストを直す**

`role:` / `hostParticipantId:` / `hostToken` を含む固定値を落とし、
「ホストだから通る／通らない」という期待を「誰でも通る」へ書き換える。
**期待値を消すだけにしない**（テストが恒真化する）。

Run: `cd apps/tasuki-sync && bun test`
Expected: PASS（全件）

- [ ] **Step 12: コミット**

```bash
git add -A apps/tasuki-sync
git commit -m "refactor!: 同期サーバーから権限判定とホストを外す（#95 S3）

- rejectIfUnauthorized / resolveIsSelfTarget と role.set / host.transfer のハンドラを削除
- 退出時のホスト引き継ぎとホスト不在の自動委譲（FR-018）を削除
- AI 委譲の候補列からホスト優先を外し参加順のみにする（FR-026）
- 検証経路が無かった hostToken の発行を廃止
- 未知コマンドが境界の valibot で落ちることを test/unknown-command-boundary.test.ts で固定"
```

---

### Task 4: timer-web から役割・ホストの表示と導線を落とす

**Files:**
- Delete: `apps/timer-web/src/ui/permission-hints.ts`・`apps/timer-web/src/ui/components/SpectatorSelfActions.tsx`・`apps/timer-web/src/ui/host-change.ts`
- Modify: `apps/timer-web/src/ui/{Lobby.tsx,Session.tsx,participant-label.ts}`
- Modify: `apps/timer-web/src/ui/components/{RosterPanel.tsx,SelfDriverToggle.tsx,StatusStrip.tsx,ProblemEditor.tsx}`
- Modify: `apps/timer-web/src/sync/{commands.ts,dispatch.ts,use-timer-sync.ts,client.ts}`
- Modify: `apps/timer-web/src/{App.tsx,ui/Join.tsx}`・`apps/timer-web/test/support/room-view.ts`
- Delete: `apps/timer-web/test/{host-change,ui/Lobby.host-absent,ui/Lobby.host-transfer,ui/Lobby.role,ui/Session.permissions,ui/permission-hints}.test.*`
- Modify: 残る timer-web のテスト 39 本

**Interfaces:**
- Consumes: Task 2 の `Participant`（`role` なし）・`Room`（`hostParticipantId` なし）、Task 3 の wire
- Produces: UI に「ホスト」バッジ・「見学者」盤・役割変更の導線が存在しない。
  `participant-label.ts` から `canTransferHostTo` が消え、`canRemoveParticipant` / `canReorderRotation` は
  **常に true を返す代わりに呼び出しごと消す**（下記 Step 5 の注意を読むこと）。

- [ ] **Step 1: 「誰にでも操作が出る」ことを固定するテストを書く**

`apps/timer-web/test/ui/RosterPanel.all-equal.test.tsx`（新規）:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import { makeRoom, makeParticipant } from "../support/room-view.js"; // ← 実名は実測して合わせる

describe("#95 S3: 名簿は全員を同格に描く", () => {
  it("自分が作成者でなくても他の参加者に退出の操作が出る", () => {
    const me = makeParticipant({ participantId: "p2", displayName: "みなと" });
    const other = makeParticipant({ participantId: "p1", displayName: "あかり" });
    render(<RosterPanel room={makeRoom({ participants: [other, me] })} meId="p2" onRemove={() => {}} />);
    // 「あかり」の行に退出の操作がある（かつては host のみ）。
    expect(screen.getByRole("button", { name: /あかり.*(退出|外す)/ })).toBeInTheDocument();
  });

  it("ホストのバッジをどこにも描かない", () => {
    render(<RosterPanel room={makeRoom({ participants: [makeParticipant({})] })} meId="p1" />);
    expect(screen.queryByText("ホスト")).toBeNull();
  });
});
```

> **`RosterPanel` の実際の props を先に読むこと**（`sed -n '1,60p' apps/timer-web/src/ui/components/RosterPanel.tsx`）。
> 上のコードは形を示すもので、props 名は実装に合わせる。
> **`queryByText("ホスト")` は否定の空振りを起こしやすい。**先に「バッジが出る状態」で
> このテストを走らせ、**赤になることを確かめてから**実装を直す（対照実行）。

- [ ] **Step 2: 失敗を確認する**

Run: `cd apps/timer-web && corepack pnpm exec vitest run test/ui/RosterPanel.all-equal.test.tsx`
Expected: FAIL

- [ ] **Step 3: 役割由来のモジュールを消す**

```bash
git rm apps/timer-web/src/ui/permission-hints.ts \
       apps/timer-web/src/ui/components/SpectatorSelfActions.tsx \
       apps/timer-web/src/ui/host-change.ts \
       apps/timer-web/test/ui/permission-hints.test.ts \
       apps/timer-web/test/host-change.test.ts
```

- [ ] **Step 4: 同期層から 2 コマンドとホスト交代検知を落とす**

- `src/sync/commands.ts:62-63`: `setRole` と `transferHost` を削除する。
- `src/sync/use-timer-sync.ts:172,738`: `prevHostRef` とホスト交代検知（R2-4）を削除する。
- `src/sync/dispatch.ts:97`: `hostToken: msg.hostToken,` を削除する。
- `src/sync/client.ts:18`: `hostToken?: string;` を削除する。
- `App.tsx` / `Session.tsx` / `Join.tsx` から `onSelfRoleChange` / `onTransferHost` の
  受け渡しを削除する。

- [ ] **Step 5: 画面から役割の表示と分岐を落とす**

- `src/ui/participant-label.ts`: `canTransferHostTo` を削除する。
  `canRemoveParticipant` / `canReorderRotation` は `ParticipantActionContext.canManage` を
  引数に取る（`:109` 付近）。**`canManage` が常に true になるので、これらは恒真な関数になる。**
  恒真な述語を残すと「検査が何も守っていない」状態が生まれるため、**関数ごと削除し、
  呼び出し側（`Lobby.tsx:362`・`RosterPanel.tsx:340`）の条件を外す。**
- `src/ui/components/RosterPanel.tsx`: ホストのバッジ表示と `canManage` の算出、
  `:290` の「host.transfer と同じ方針」というコメントを削除する。
- `src/ui/Lobby.tsx`: `:21,26` の輸入、`:145` のホスト presence 参照、
  `SpectatorSelfActions` の描画、役割バッジを削除する。
- `src/ui/Session.tsx`: `:18` の輸入、`:166` の `can()` ヘルパ、`:420,424` の
  `canLeaveRoom` / `canSpectate` を削除する。**「部屋を抜ける」導線そのものは残す**
  （不変条件が消えて常に可になるだけ）。
- `src/ui/components/SelfDriverToggle.tsx`: 「編集者以上にだけ出す」という前提を外し、
  全参加者へ出す（A2 の代替導線）。`:31` の「自分の役割を自分で変える」props を削除する。
- `src/ui/components/StatusStrip.tsx` / `ProblemEditor.tsx`: 役割による分岐を外す。

- [ ] **Step 6: 概念ごと消えるテストを削除する**

```bash
git rm apps/timer-web/test/ui/Lobby.host-absent.test.tsx \
       apps/timer-web/test/ui/Lobby.host-transfer.test.tsx \
       apps/timer-web/test/ui/Lobby.role.test.tsx \
       apps/timer-web/test/ui/Session.permissions.test.tsx
```

- [ ] **Step 7: 残るテストと支援モジュールを直す**

`apps/timer-web/test/support/room-view.ts` の固定値から `role` / `hostParticipantId` を落とす
（**ここを先に直すと 39 本の多くが自動的に通る**）。残りは個別に直す。

Run: `cd apps/timer-web && corepack pnpm exec vitest run`
Expected: PASS（全件）

- [ ] **Step 8: a11y と色のみ依存の検査が緑であることを確認する**

Run: `cd apps/timer-web && corepack pnpm exec vitest run test/ui/a11y.test.tsx test/ui/color-only-invariants.test.tsx`
Expected: PASS（バッジを消したことで対比・色のみ依存の検査が動くため、必ず個別に見る）

- [ ] **Step 9: コミット**

```bash
git add -A apps/timer-web
git commit -m "refactor!: timer の画面から役割・ホストの表示と導線を外す（#95 S3）

- permission-hints / SpectatorSelfActions / host-change を削除
- 名簿のホストバッジ・役割バッジ・役割変更とホスト移譲の導線を削除
- 進行から外れる導線は SelfDriverToggle（見送り）に一本化し全員へ出す"
```

---

### Task 5: poker-core からホストを落とす

**Files:**
- Modify: `packages/poker-core/src/round.ts:8-23,54,67`（`RoundError` / `requireHost` / `revealBy` / `nextRound`）
- Modify: `packages/poker-core/src/room.ts:11,58,66,106,109,117,142`（`isHost` と継承）
- Modify: `packages/poker-core/src/snapshot.ts:16`
- Modify: `packages/poker-core/src/protocol.ts:49,82`（`'not-host'` と `isHost`）
- Modify: `packages/poker-core/src/error-messages.ts:4,30`
- Modify: `packages/poker-core/tests/{room,snapshot,protocol}.test.ts`

**Interfaces:**
- Consumes: なし（poker は timer と独立）
- Produces: `revealBy(room: Room, participantId: string): Result<Room, RoundError>` は
  在室者なら誰でも成功する（`participantId` は在室確認のためだけに残す）。
  `RoundError` から `{ code: 'not-host' }` が消える。
  `Participant` と snapshot から `isHost` が消える。`ERROR_CODES` から `'not-host'` が消える。

- [ ] **Step 1: 「誰でも公開できる」ことを固定するテストを書く**

`packages/poker-core/tests/round.all-equal.test.ts`（新規）:

```ts
import { describe, it, expect } from 'vitest';
import { revealBy, nextRound } from '../src/round';
import { createRoom, joinRoom } from '../src/room'; // ← 実名は実測して合わせる

describe('#95 S3: poker は全員が同格である', () => {
  it('作成者でない参加者が手動公開できる', () => {
    const room = joinRoom(createRoom('R1', 'あかり')._unsafeUnwrap(), 'みなと')._unsafeUnwrap();
    const joiner = room.participants[1]!;
    const result = revealBy({ ...room, round: { status: 'voting', votes: new Map() } }, joiner.id);
    expect(result.isOk()).toBe(true);
  });

  it('作成者でない参加者が次のラウンドを始められる', () => {
    const room = joinRoom(createRoom('R1', 'あかり')._unsafeUnwrap(), 'みなと')._unsafeUnwrap();
    const joiner = room.participants[1]!;
    const result = nextRound({ ...room, round: { status: 'revealed', votes: new Map() } }, joiner.id);
    expect(result.isOk()).toBe(true);
  });
});
```

> `createRoom` / `joinRoom` の実名と戻り値の形は `sed -n '50,150p' packages/poker-core/src/room.ts` で先に確かめる。

- [ ] **Step 2: 失敗を確認する**

Run: `cd packages/poker-core && corepack pnpm exec vitest run tests/round.all-equal.test.ts`
Expected: FAIL（`{ code: 'not-host' }` が返る）

- [ ] **Step 3: `requireHost` を撤去する**

`packages/poker-core/src/round.ts`:
- `:13-23` の `requireHost` 関数を削除する。
- `:8` の `RoundError` から `| { code: 'not-host'; op: 'reveal' | 'next-round' }` を削除する。
- `revealBy`（`:54`）を次に置き換える:

```ts
/**
 * 手動公開（FR-009）。
 *
 * #95 S3 で役割とホストを廃止したため、在室者なら誰でも実行できる。
 * `participantId` は呼び出し側の在室確認と監査のために受け取り続ける。
 */
export function revealBy(room: Room, participantId: string): Result<Room, RoundError> {
  if (!room.participants.some((p) => p.id === participantId)) {
    return err({ code: 'not-voting', op: 'reveal' });
  }
  if (room.round.status !== 'voting') {
    return err({ code: 'not-voting', op: 'reveal' });
  }
  return ok({ ...room, round: { ...room.round, status: 'revealed' as const } });
}
```

> **在室していない `participantId` をどう扱うかは実装の現状に合わせる。**
> 上は「投票中でない」と同じ扱いにしているが、**呼び出し側（`apps/tasuki-sync/src/poker/`）が
> 既に在室確認をしているなら、この分岐は不要**である。先に呼び出し側を読み、
> 二重の確認を作らないこと。

- `nextRound`（`:67`）も同様に `requireHost(...).andThen(...)` の包みを外す。

- [ ] **Step 4: `isHost` を集約と wire から落とす**

- `src/room.ts`: `:11` の `isHost: boolean;`、`:66`・`:106`・`:142` の `isHost:` 初期化、
  `:109-117` のホスト継承ブロックを削除する。`:58` の引数名 `hostName` は `displayName` へ改名する。
- `src/snapshot.ts:16`: `isHost: p.isHost,` を削除する。
- `src/protocol.ts`: `:82` の `isHost: v.boolean(),` と `:49` の `'not-host',` を削除する。
- `src/error-messages.ts`: `:30` の `case 'not-host':` を削除し、`:4` のコメントから
  `not-host` の例示を外す。

- [ ] **Step 5: 通ることを確認する**

Run: `cd packages/poker-core && corepack pnpm exec vitest run`
Expected: PASS（新規 2 件を含む全件）

- [ ] **Step 6: コミット**

```bash
git add -A packages/poker-core
git commit -m "refactor!: poker-core からホストを外す（#95 S3）

- requireHost を撤去し reveal / next-round を在室者全員に開放
- Participant.isHost とホスト継承、snapshot の isHost を削除
- wire の ERROR_CODES から not-host を削除"
```

---

### Task 6: poker のサーバーと画面からホストを落とす

**Files:**
- Modify: `apps/tasuki-sync/src/poker/` 配下（`isHost` / `not-host` を参照する箇所）
- Modify: `apps/poker-web/src/pages/RoomPage.tsx:212,227,229,238-250,264-277`
- Modify: `apps/poker-web/src/components/ParticipantList.tsx:30`
- Modify: `apps/tasuki-sync/test/poker/{join,reconnect,session}.test.ts`
- Modify: `apps/poker-web/tests/{error-display,error-frame-forward-compat,sync-stale-notice}.test.tsx`

**Interfaces:**
- Consumes: Task 5 の `Room`（`isHost` なし）・`RoundError`（`not-host` なし）
- Produces: poker の画面に「ホスト」バッジが無く、公開・次ラウンドのボタンが全員に出る。

- [ ] **Step 1: 「全員にボタンが出る」ことを固定するテストを書く**

`apps/poker-web/tests/room-page.all-equal.test.tsx`（新規）:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomPage } from '../src/pages/RoomPage';

describe('#95 S3: poker は全員が同格である', () => {
  it('作成者でない参加者にも公開のボタンが出る', () => {
    const snapshot = {
      // ← 実際の snapshot の形は src/pages/RoomPage.tsx の props から起こす
      you: 'p2',
      participants: [{ id: 'p1', name: 'あかり', connected: true }, { id: 'p2', name: 'みなと', connected: true }],
      round: { status: 'voting', votes: {} },
    };
    render(<RoomPage snapshot={snapshot as never} sync={{ reveal: () => {} } as never} />);
    expect(screen.getByRole('button', { name: /公開/ })).toBeInTheDocument();
  });

  it('ホストのバッジをどこにも描かない', () => {
    // 対照: 実装を直す前にこのテストを走らせ、赤になることを確かめてから直す。
    expect(screen.queryByText('ホスト')).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd apps/poker-web && corepack pnpm exec vitest run tests/room-page.all-equal.test.tsx`
Expected: FAIL

- [ ] **Step 3: 画面からホストの分岐を落とす**

`apps/poker-web/src/pages/RoomPage.tsx`:
- `:212` の `const isHost = ...` を削除する。
- `:227`・`:229` の `isHost={isHost}` を削除する。
- `:238-242`・`:264-268` の props 型から `isHost` を外す。
- `:250`・`:277` の `{isHost && (` の包みを外し、中身を常に描く。

`apps/poker-web/src/components/ParticipantList.tsx:30`:
- `{p.isHost && <span className="badge host">ホスト</span>}` を削除する。

> **`badge host` の CSS が他で使われていないかを確かめる**
> （`grep -rn "badge host\|\.host" apps/poker-web/src --include='*.css' --include='*.tsx'`）。
> 使われていなければスタイル定義も落とす。生の色を残さない（デザインシステムの規範）。

- [ ] **Step 4: サーバー側の poker を直す**

Run: `grep -rn "isHost\|not-host" apps/tasuki-sync/src/poker/` で該当箇所を洗い、
`isHost` の受け渡しと `not-host` のエラー変換を削除する。

- [ ] **Step 5: 通ることを確認する**

Run: `cd /workspaces/claym/local/Tasuki && corepack pnpm exec turbo run test --filter=@tasuki/poker-web --filter=@tasuki/sync --force`
Expected: PASS（`Cached: 0 cached` を確認する）

- [ ] **Step 6: コミット**

```bash
git add -A apps/poker-web apps/tasuki-sync
git commit -m "refactor!: poker の画面とサーバーからホストを外す（#95 S3）

- 公開・次ラウンドのボタンを全参加者へ開放
- 名簿のホストバッジと未使用になったスタイルを削除"
```

---

### Task 7: E2E を新しい振る舞いへ向け直す

**Files:**
- Modify: `e2e/specs/timer.spec.ts`・`e2e/specs/poker.spec.ts`・`e2e/tests/ws-frames.test.ts`
- Modify: `e2e/support/poker.ts`

**Interfaces:**
- Consumes: Task 3・4・5・6 の結果
- Produces: E2E が「全員同格」を前提に緑になる。**新しいタグは足さない**（設計正本 §6.6）。

- [ ] **Step 1: 現状の失敗を確認する（先に赤を見る）**

Run: `cd /workspaces/claym/local/Tasuki && corepack pnpm e2e`
Expected: FAIL。**どのアサーションがなぜ落ちたかを控える。**
（`pnpm dev` と 8787 を共有するので、**先に `ss -tlnp | grep 8787` で空きを確かめる**）

- [ ] **Step 2: 役割前提のアサーションを書き換える**

- `e2e/support/poker.ts`: `isHost` を見ている補助を削除する。
- `e2e/specs/poker.spec.ts`: 「ホストだけが公開できる」という筋を
  「**2 人目の参加者が公開できる**」へ書き換える。
- `e2e/specs/timer.spec.ts`: ホストバッジ・役割変更の筋を落とし、
  「**後から参加した人が開始前に設定を変更できる**」を足す。
- `e2e/tests/ws-frames.test.ts`: `room.created` の期待から `hostToken` を落とし、
  snapshot の期待から `role` / `hostParticipantId` / `isHost` を落とす。

> **判定は文字列一致・`toContain`・否定の空振りを避ける**（設計正本 §6.6）。
> 「ホストバッジが無い」を `not.toContain("ホスト")` で書かない —— 画面に「ホスト」の
> 2 文字がどこにも無いことは、バッジが消えた証拠として弱い。
> **`getByRole` で操作が出ていることを肯定形で固定する**方を主にする。

- [ ] **Step 3: 緑を確認する**

Run: `cd /workspaces/claym/local/Tasuki && corepack pnpm e2e`
Expected: PASS（全件）

- [ ] **Step 4: コミット**

```bash
git add -A e2e
git commit -m "test: E2E を全員同格の振る舞いへ向け直す（#95 S3）

- poker は 2 人目の参加者が公開できることを固定
- timer は後から参加した人が開始前に設定を変更できることを固定
- wire フレームの期待から role / hostParticipantId / isHost / hostToken を削除"
```

---

### Task 8: 検査と規範文書を実態へ合わせ、全体を検証する

**Files:**
- Modify: `scripts/mutation-check.mjs`（変異 2・5）
- Delete: `scripts/mutations/m02-permissions-viewer-invert.patch`・`scripts/mutations/m05-can-remove-participant-guard.patch`
- Modify: `docs/timer/adr/0007-volatile-in-memory-state.md:21,56-61`
- Modify: 必要なら `scripts/audit-structure.mjs`（例外表・コメントの実例参照）

**Interfaces:**
- Consumes: Task 1〜7 のすべて
- Produces: `node scripts/mutation-check.mjs` が全件「検出が正」で通る。DoD 8 項目が満たされる。

- [ ] **Step 1: 死んだ変異を落とす**

変異 2（`checkPermission` の viewer 拒否を反転）と変異 5（`canRemoveParticipant` の
呼び出しを削る）は、**守っていた性質が概念ごと消えた**ので落とす。

```bash
cd /workspaces/claym/local/Tasuki
git rm scripts/mutations/m02-permissions-viewer-invert.patch \
       scripts/mutations/m05-can-remove-participant-guard.patch
```

`scripts/mutation-check.mjs` の `id: 2` と `id: 5` のエントリを削除する。
**`id` を振り直さない**（過去の記録との突き合わせが壊れる）。削除の理由を
その場のコメントに残す:

```js
  // id 2（checkPermission の viewer 拒否を反転）と id 5（canRemoveParticipant の
  // 呼び出しを削る）は #95 S3 で削除した。役割とホストを廃止したことで、
  // どちらも「守っていた性質が概念ごと消えた」変異である（設計正本 §6.5）。
  // 番号は詰めない —— 過去の記録が id で変異を指しているため。
```

- [ ] **Step 2: 変異検査を回す（作業ツリーを clean にしてから）**

```bash
cd /workspaces/claym/local/Tasuki
git status --porcelain    # ← 空であることを目で見る（[[verify-the-break-itself]]）
node scripts/mutation-check.mjs
```

Expected: 残る全変異が「検出が正」。**恒真化した変異が 1 つも無いこと。**
落ちたら、その変異が指すテストが役割の削除で骨抜きになっている（設計正本 §6.4 の警告どおり）。

- [ ] **Step 3: ADR 0007 を実態へ合わせる**

`docs/timer/adr/0007-volatile-in-memory-state.md`:
- `:21` の「同一役割として扱う（FR-019）。主催者が猶予 30 秒を超えて不在なら最古のオンライン
  編集者へ自動委譲」を、役割の無い記述へ書き換える。
- `:56-61` の改定節を、**実施済みの事実**へ更新する（`実施は S3・#244` → 実施した版と PR 番号）。

> **完了形を書く相手を間違えない。**この段で完了形にしてよいのは
> 「S3 で実際に消したもの」だけである。S4a 以降で消えるもの（`config.members`・
> ローテーションの `RotationEntry` 化など）を「廃止した」と書かないこと
> → [[record-decisions-not-completed-state]]。**1 つの PR で 3 回踏んだ前科がある。**

- [ ] **Step 4: 検査スクリプトの参照が腐っていないか確かめる**

```bash
cd /workspaces/claym/local/Tasuki
grep -rn "permissions\.ts\|participants\.ts\|permissions-differential\|transfer-host" scripts/ docs/adr/ docs/guides/ docs/constitution.md
```

消えたファイルを名指ししている箇所を直す。
**`docs/plans/` 配下の休眠文書は直さない**（「記録は移動・改名しない」という決定に従う）。
`scripts/audit-structure.mjs:524,1272` は**コメント内の実例参照**なので、
実在しないファイルを指す説明になっていないかだけ見て、必要なら文面を直す。

- [ ] **Step 5: 全体検査を通す**

```bash
cd /workspaces/claym/local/Tasuki
corepack pnpm test --force        # Cached: 0 cached を確認する
corepack pnpm exec turbo run typecheck lint build
node scripts/audit-structure.mjs
node scripts/check-links.mjs
node scripts/audit-dependency-direction.mjs
corepack pnpm e2e
```

Expected: すべて緑。**`--force` を付けて `Cached: 0 cached` を目で見る**
（turbo は既定でキャッシュに当てて 1.5 秒で偽の緑を出す）。

- [ ] **Step 6: 指標を実測して記録する**

Run: `node scripts/audit-structure.mjs`
S3 でパッケージは増減しないが、ファイルが 10 本減りテストが 15 本前後減るので
SC-032（テストの被覆率）と SC-039（公開記号）が動く。**過去の記録と比べず、
この版の実測値を PR 本文に書く。**

- [ ] **Step 7: 実画面で確かめる（憲法 原則 V）**

```bash
ss -tlnp | grep -E ':(8787|517[3-5])'   # 先に空きを確かめる
corepack pnpm dev
```

`http://localhost:5175/` から入り、次を目で見る:
1. timer でルームを作り、**別ブラウザで参加した人**が開始前に設定を変更できる
2. 名簿に「ホスト」バッジも「見学者」の盤も出ない
3. 見送り（`SelfDriverToggle`）が全員に出て、押すとローテーションから外れる
4. poker で**作成者でない人**が公開・次ラウンドを実行できる

**終わったら dev を止める**（[[free-dev-ports-when-done]]）。

- [ ] **Step 8: コミットして PR を出す**

```bash
git add -A
git commit -m "chore: 役割廃止に伴い変異検査と ADR 0007 を実態へ合わせる（#95 S3）

- 概念ごと消えた変異 2 件（id 2 / id 5）を削除。id は詰めない
- ADR 0007 の改定節を実施済みの記述へ更新"
git push -u origin feature/s3-remove-roles-and-host
gh pr create --title "feat: 役割とホストを廃止し全員を同格にする（#95 S3）" --body-file <(cat <<'BODY'
## 概要

#95 の S3。ルームに居る全員を完全に同格にし、`Role` 型・ホスト・それらに依存する
権限判定と不変条件を Tasuki 全体から取り除く。設計正本の D5 と `docs/timer/adr/0007` の
改定（2026-09-06）が定めた決定の実施。

## 変更内容

（Task 1〜8 の要約をここに書く）

## 消したテストと書き換えたテストの根拠

（設計正本 §6.5 に従い 1 本ずつ列挙する）

## テスト方法

- [ ] `corepack pnpm test --force`（`Cached: 0 cached` を確認）
- [ ] `corepack pnpm e2e`
- [ ] `node scripts/mutation-check.mjs`（全件「検出が正」）
- [ ] `node scripts/audit-structure.mjs` / `check-links.mjs` / `audit-dependency-direction.mjs`
- [ ] 実画面（`http://localhost:5175/`）で 4 点を目視

親: #95
BODY
)
```

> **`Closes` を本文へ書かない**（squash マージで意図せず閉じる）→ [[closes-keyword-must-not-be-in-backticks]]。
> Issue #244 は S3 の検証が済んでから手で閉じる。

- [ ] **Step 9: 敵対的レビューを掛ける**

Run: `/code-review high <PR番号>`
**PR 番号を必ず明示する**（worktree でなくてもブランチ取り違えの事故がある）。

S0 は 3 巡 16 件、S1 は 2 巡 10 件、S2 は 6 巡 26 件で、**いずれも偽陽性 0**だった。
**指摘を直したら同じだけ叩き直す** —— S2 では 26 件中 4 件が「前の巡の対応が
持ち込んだ／取りこぼした欠陥」だった（[[countermeasures-carry-the-flaw-they-fix]]）。
**コードの欠陥が 0 件になるまで巡を重ねる。**

---

## Self-Review

**1. Spec coverage（設計正本 §7 の S3 行「役割・ホストの廃止（ドメイン・サーバー・両 Web・E2E を同時に）」）**

| 対象 | 担当タスク |
|---|---|
| ドメイン（timer） | Task 1・2 |
| サーバー（timer） | Task 3 |
| Web（timer） | Task 4 |
| ドメイン（poker） | Task 5 |
| サーバー・Web（poker） | Task 6 |
| E2E | Task 7 |
| 変異検査（設計正本 §6.4）・R12 の検査（§6.2） | Task 8 Step 2 |
| ADR 0007 の実態合わせ | Task 8 Step 3 |

Issue #244 の完了条件 6 つ: `permissions.ts` / `participants.ts` の削除 → Task 1（A1 の断り付き）。
`Role` / `role.set` / `host.transfer` / poker の `isHost` → Task 2・3・5。
両 Web の表示 → Task 4・6。E2E → Task 7。変異検査 → Task 8。DoD → Task 8 Step 5〜8。

**2. Placeholder scan:** 「適切に処理する」「詳細は後で」の類は置いていない。
props 名やテスト支援モジュールの実名を「実測して合わせる」と書いた箇所が 5 つあるが、
これは**具体的な確認コマンドを併記してある**（`sed -n` / `grep` の実行形）。
コードを写経で示すと実装とずれた模写を作る危険があるため、意図的にこの形にした。

**3. Type consistency:** `removalNotificationFor` / `RemovalNotification` は Task 1 で定義し
Task 3 で消費する。名前は一致している。`buildCandidates` は Task 3 内で完結する。
`revealBy` / `nextRound` のシグネチャは Task 5 で定義し Task 6 で消費する。一致している。

## 残るリスク

- **`permissions.ts` の判定順序には過去の回帰が複数刻まれており、消したあとで
  「やはり主催者が要る」となった場合、同じ精度で書き直すのは容易でない**（設計正本 §8）。
  この PR をリバートできる形（1 ブランチ・squash 1 コミット）に保つこと。
- **合言葉の設定が全員可になる**（A6）。参加者の誰でも他の参加者を締め出しうる。
  受容済み（設計正本 §8）。運用上の問題が出たら別 Issue。
- **`role` を消すと `resolveIsSelfTarget` も消える。**「自己対象か」の算出は権限判定のためだけに
  あったが、`participant.remove` の通知種別（`removalNotificationFor`）は**別経路で
  実行者と対象を比べている**（`participant-remove.ts:115`）。Task 3 Step 3 で
  `resolveIsSelfTarget` を消すとき、**この別経路を巻き込んでいないことを確かめる。**
