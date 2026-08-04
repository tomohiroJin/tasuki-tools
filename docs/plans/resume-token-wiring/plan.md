# 実装計画: 再接続時の自動リジューム配線（Issue #24）
**入力:** spec.md ・ **ステータス:** Draft

## 技術コンテキストと意思決定
| 意思決定 | 選択 | 根拠 | 紐づく要件 |
|---|---|---|---|
| 保存先 | `sessionStorage` | タブ単位で完結・再接続は同一タブで起きる・サーバー側も再起動で失効するため長寿命化に意味がない | FR-006 |
| 保存モジュール | 新規 `apps/web/src/sync/resume-identity.ts` | 既存の `apps/web/src/sync/` 配下（client.ts と同居）に薄い純粋関数として置く。App.tsx から直接 Web Storage API を叩かず、テスト可能な関数に閉じ込める | FR-001, FR-004, FR-005, FR-006 |
| 再接続検知 | `SyncClient` に `onReconnected` コールバックを追加 | 「初回 `connect()` の `onopen`」と「切断後にスケジュールされた再接続の `onopen`」を区別できるのは `SyncClient` 内部の状態（`disposed` や再接続タイマー経由で呼ばれたか）だけであり、App 側からは区別できない。既存の `onConnectionChange`（UI 状態のみ）とは責務を分ける | FR-002, FR-003 |
| 再送のトリガー元 | `App.tsx` の `makeClient` 内で `onReconnected` を購読し、`resume-identity` から読んだ値で `room.join` を送る | サーバーへ送る内容（displayName・resumeToken の組み立て）はドメイン知識であり App 側の責務。SyncClient は「再接続した」という事実だけを通知する疎結合を保つ | FR-002 |

## 規約チェック（Constitution Check）
| 原則 | ステータス | 備考 |
|---|---|---|
| セキュリティ規約（security.md） | PASS | resumeToken は localStorage ではなく sessionStorage に保存。spec.md の非機能要件に整合根拠を明記済み |
| TDD（tdd-workflow） | PASS | resume-identity.ts と client.ts の onReconnected 追加は、先に失敗するテストを書いてから実装する |
| 担当領域の遵守 | PASS | apps/web/src/App.tsx, apps/web/src/sync/client.ts, apps/web/src/sync/ 配下の新規モジュールのみを変更。Lobby.tsx・apps/sync・packages/core は不変更 |
| App.tsx 最小変更（#41 引き継ぎ） | PASS | 既存の state/ref 構造（roomRef, participantIdRef 等）を再利用し、新規 state は追加しない。新規 ref を1つ追加するのみ |

## アーキテクチャ
```
[SyncClient.connect()]
   onopen (1回目) ─────────────────▶ onConnected / onConnectionChange("online")
   onopen (2回目以降゠再接続) ───────▶ onConnected / onConnectionChange("online") + onReconnected

[App.tsx makeClient]
   onIdentity(identity, code?) ──▶ setParticipantId + saveResumeIdentity({code, participantId, resumeToken, displayName})
   onReconnected ──▶ loadResumeIdentity() があれば client.send({command:"room.join", ...resumeToken付き})
   onError(leave-room) ──▶ clearResumeIdentity()
   onError(session-lost) ──▶ clearResumeIdentity()
```

## コンポーネントとインターフェース
- **`apps/web/src/sync/resume-identity.ts`（新規）**
  - `export interface ResumeIdentity { code: string; participantId: string; resumeToken: string; displayName: string; }`
  - `export function saveResumeIdentity(identity: ResumeIdentity): void` — `sessionStorage.setItem(KEY, JSON.stringify(identity))`
  - `export function loadResumeIdentity(): ResumeIdentity | null` — 読み取り＋壊れた JSON は `null` を返す（防御的）
  - `export function clearResumeIdentity(): void` — `sessionStorage.removeItem(KEY)`
  - `sessionStorage` が使えない環境（SSR 等）は try/catch で握りつぶし `null`/no-op にする（Web アプリなので通常は起きないが、防御的に）
- **`apps/web/src/sync/client.ts`（変更）**
  - `SyncClientOptions` に `onReconnected?: () => void;` を追加
  - 内部に `private hasConnectedOnce = false;` を追加
  - `connect()` の `onopen` 内: 既存処理の前後で
    ```
    const isReconnect = this.hasConnectedOnce;
    this.hasConnectedOnce = true;
    ...
    if (isReconnect) this.options.onReconnected?.();
    ```
    （`onConnected`/`onConnectionChange` の発火順は変えない。`onReconnected` はそれらの後に追加で呼ぶ）
  - `dispose()` 済みインスタンスが再利用されることはない（既存仕様通り）ため `hasConnectedOnce` のリセットは不要
- **`apps/web/src/App.tsx`（変更・最小）**
  - **実装時の見直し**: `Identity`（`sync/client.ts`）は `room.joined` に `code` を含まない
    （`packages/core/src/schemas.ts` の `RoomJoinedMsg`）。`dispatch.ts`/`client.ts` の
    `Identity` 型を拡張すれば早期に `code` を得られるが、`dispatch.ts` は担当領域外の
    既存ファイルであり変更対象に含めていないため、次の設計に変更した:
    - 新規 ref `pendingResumeRef`（`{ participantId, resumeToken } | null`）を `onIdentity` で
      書き込み、`resumeDisplayNameRef`（新規 ref、表示名のみ）を `handleCreateRoom`/
      `handleJoinRoom` 冒頭で書き込む
    - `onRoom`（snapshot、`r.code` を含む）の先頭で `pendingResumeRef.current` があれば
      `r.code` と `resumeDisplayNameRef.current` を組み合わせて `saveResumeIdentity` を呼び、
      `pendingResumeRef.current = null` にする（以降の snapshot では再保存しない）
  - `makeClient` の `onReconnected` で `loadResumeIdentity()` を読み、存在すれば
    `newClient.send({ command: "room.join", code, displayName, hasAiKey: false, resumeToken })` を送る
  - `leave-room` エラー経路の既存の後始末処理に `clearResumeIdentity()` を1行追加
  - `session-lost` エラー経路の既存の後始末処理に `clearResumeIdentity()` を1行追加

## データモデル
```
ResumeIdentity {
  code: string          // ルームコード（例: "ABC123"）
  participantId: string // サーバー発行の参加者ID
  resumeToken: string   // サーバー発行のリジュームトークン（短命・ルーム限定）
  displayName: string   // room.join 再送に必要（サーバー側 schema で必須フィールド）
}
```
sessionStorage キー: `tdd-mob:resume-identity`（他の web アプリ状態キーと衝突しない prefix）

## API / インターフェース契約
サーバー側の `room.join` コマンド契約は変更しない（担当領域外・既存のまま）。
```
Client -> Server (再送内容):
{ command: "room.join", code, displayName, hasAiKey: false, resumeToken }

Server -> Client（resumeToken 一致時、既存実装）:
{ type: "snapshot", room }  // room.joined は送られない = onIdentity は再送時に発火しない
```
このため、再送後の participantId は「新規発行」ではなく sessionStorage に保存済みの値を
そのまま使い続けてよい（サーバーは既存 participantId のまま `presence` を更新するだけ）。

## プロジェクト構成
実測の結果、本リポジトリの web パッケージはテストを `src/` に同居させず
`apps/web/test/` 配下にミラー構成で置く慣習だった（`client.connection.test.ts` 等）。
これに合わせる。
```
apps/web/src/sync/
  client.ts                        (変更: onReconnected 追加)
  resume-identity.ts               (新規)
apps/web/test/sync/
  client.reconnect.test.ts         (新規)
  resume-identity.test.ts          (新規)
apps/web/src/
  App.tsx                          (変更: 最小限の配線)
```

## エラー処理とセキュリティ
- `sessionStorage` アクセスは try/catch で保護し、例外時は機能を無効化するだけで
  アプリ全体をクラッシュさせない。
- 保存する値に機密情報（パスワード等）は含まない。resumeToken 自体はルーム限定・短命の
  ランダムトークンであり、パスワードや API キーと同列の機密ではないが、念のため
  console 等へは出力しない。
- リジューム失敗（`ROOM_NOT_FOUND` 相当）は既存の `session-lost` 経路にそのまま委譲する。

## テスト戦略
- **単体テスト**: `resume-identity.test.ts`（保存・読込・破損 JSON・未設定時の null）、
  `client.test.ts`（初回 onopen では onReconnected が呼ばれない／2回目の onopen で呼ばれる）
- **結合テスト**: App.tsx 側は既存の App.tsx 用テストファイルがあれば、そこに
  「onReconnected 経由で room.join が resumeToken 付きで再送される」ケースを追加検討する
  （App.tsx に既存の統合テストが無ければ、client.ts / resume-identity.ts の単体テストで
  十分なカバレッジとし、App.tsx 内の配線はレビューで確認する。実ブラウザでの確認は
  親エージェントの統合試験に委ねる）。
- 自分の担当ファイルの `pnpm --filter @tasuki/timer-web test` はテスト対象ファイルを絞って実行する
  （全件は17分かかるため）。

## 段階分け（Sequencing）
1. `resume-identity.ts` を TDD で実装（save/load/clear）
2. `client.ts` に `onReconnected` を TDD で追加
3. `App.tsx` の配線（保存・再送・クリア）
4. ドキュメント更新（該当すれば README / BACKLOG）
5. PR 作成・敵対的レビュー

## 未解決の論点
（なし）
