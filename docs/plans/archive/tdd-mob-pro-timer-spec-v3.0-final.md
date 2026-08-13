# TDD Mob Pro Timer — プロダクト仕様書 v3.0（最終版）

> モブプログラミング × TDD のタイマー兼お題出題ツール。
> **確定アーキテクチャ**: モノレポ（フロント + 軽量 WebSocket 同期サーバー）。**Caddy** がフロント口（静的配信 + `/ws` リバースプロキシ + 自動 HTTPS）。
> サーバーは **同期ハブに徹し、秘密を持たず・状態は揮発**。タイマーは **サーバー権威（時刻一本化）**。同期は **full snapshot 方式**。AI は **ルーム代表生成**。
> **v3.0（最終）の主眼**: 実装前の最終調査を反映。モブプロ実践知に基づく機能追加（ナビゲーター役・休憩・強い交代通知・引き継ぎノート）、同期技術の最終判断（local-first 同期エンジンは見送り）、ランタイム判断の精緻化、運用・配布・ライセンス。

- バージョン: 3.0（最終）／ 最終更新: 2026-05-29 ／ 実装言語: **TypeScript（関数型）**
- v2.4 → v3.0 の変更点は **§16**。最終調査の新規知見は **§17**。

---

## 0. 設計スコープと方針

本アプリは 2〜10 人規模・共有状態は数百バイト程度。**「正しく削る」を優先**する。

- **同期は full snapshot 方式**: 変更のたびサーバーが完全な状態を全員へ送る。差分配信（patch/revision）・ギャップ検知・部分ロールバックは採用しない（状態が小さく不要、整合バグの温床を断つ）。
- **楽観更新は最小**: 自分の入力の即応のみ。**サーバー snapshot を常に正**とし上書き。
- 「純粋コア + Clock ポート」は堅く、ports/adapters の儀式は薄く。完全な event-sourcing は採らず Decider（`decide`/`evolve`）の最小形。重量級フル FP（Effect）・managed/subscription AI・後述の local-first 同期エンジンは将来枠。
- **実証済みの形に倣う**: 自己ホスト可能な WebSocket 製モブタイマー（mobtime 等）が「全員が同一時刻・同一設定をほぼ即時に共有」を実現しており、本仕様のサーバー権威 WS はこの実績ある形に沿う（§17）。

---

## 1. 現行仕様（抽出・要点のみ）

- **フェーズ**: `setup → ready → session → celebration`（completion で setup へ戻る）。
- **セッション状態**（現行 `sessionReducer`。v3.0 では §3 で `decide`/`evolve` に分割し、**時間系を集約の別フィールドに分離**）:
  ```typescript
  // 現行プロトタイプの形（参考）。時間系は §3.7 の ServerClock へ移す
  interface LegacySessionState { rotation: string[]; currentIndex: number; intervalSeconds: number; secondsLeft: number; isPaused: boolean; driverCounts: number[]; totalSwitches: number; elapsedSeconds: number; }
  ```
  アクション: `START / TICK / SWITCH / PAUSE / RESUME / RESET / ADD_MEMBER / REMOVE_MEMBER / MOVE_MEMBER`（**TICK は廃止**。§3.7）。不変条件: `rotation.length === driverCounts.length`、`currentIndex` が指す論理ドライバーの維持、全遷移が副作用なし。
- **Problem**: `{ title, description, requirements[], exampleTest, hints[] }`。`buildProblemPrompt` → AI → JSON パース → 失敗時 `FALLBACK_PROBLEMS` へ縮退。
- **CompletionRecord**: `{ id, roomId?, problemTitle, language, difficulty, elapsedSeconds, members[], totalSwitches, completedAt }`。
- **付帯**: Web Audio 合成音、キーボードショートカット（Space/S/P/M/Esc）、起動時自己テスト。
- **移植方針**: 純粋関数群は `@tasuki/timer-core` に集約しフロント・サーバーで共有。

> 定数: メンバー 2〜10、交代間隔 3/5/7/10/15 分（既定 5）、言語 10 種、難易度 3 種。
> 交代間隔は**短いほど集中と学習が高まる**（実践知では 3〜10 分が定番、10 人でも 3 分が機能する）。既定 5 分・推奨 5〜10 分とし、UI にこの指針を添える（§17）。

---

## 2. アーキテクチャ全体（モノレポ + Caddy + WS）

```
            ┌──────────────── Caddy（フロント口・自動HTTPS/WSS） ───────────────┐
ブラウザ ──▶│  静的SPA配信   ・/ws* → 同期サーバーへ reverse_proxy             │
 (複数)     │                ・実クライアントIPを X-Forwarded-For で伝達(S7)   │
            └───────────────┬──────────────────────────────────────────────────┘
                            │ ws (内部)
            ┌───────────────▼─────────────────────────────┐
            │  同期サーバー apps/sync（関数型 DDD・§3）     │
            │  ・ドメイン: 純粋 decide/evolve（集約一括）   │
            │  ・サーバー権威タイマー（時刻一本化・§3.7）  │
            │  ・状態 = インメモリ（揮発）／秘密ゼロ        │
            │  ・変更のたび full snapshot を配信（§5）      │
            └───────────────────────────────────────────────┘
   AI(BYOK) は各クライアントのブラウザから直接 api.anthropic.com（サーバーは鍵を持たない）
   ソロモード(§9.3) は WS を通らず完全ローカルで完結
```

```caddyfile
example.com {
  handle /ws* {
    reverse_proxy localhost:8787 {
      header_up X-Forwarded-For {remote_host}   # 実クライアントIPを伝達（S7）
    }
  }
  handle { root * /srv/web/dist; try_files {path} /index.html; file_server }
}
```

---

## 3. サーバー設計: 関数型 DDD / クリーンアーキテクチャ

### 3.1 採用パターン: Hexagonal（薄め）+ Decider

ドメインを中心に、外界（WS・AI・時計・保存）をポートで隔離。依存方向は「外 → ドメイン」。`evolve` は **集約全体（session + clock）を一貫更新**する。

```typescript
interface Aggregate { session: SessionState; clock: ServerClock; }
type Decide = (command: Command, agg: Aggregate, now: number) => Result<DomainEvent[], DomainError>;
type Evolve = (agg: Aggregate, event: DomainEvent, now: number) => Aggregate;
```

> `now`（サーバー時刻・`Clock` ポート供給）を引数で渡し、関数は純粋に保ちつつ時刻依存遷移（アンカー更新・elapsed 積算）を扱う。

### 3.2 `decide` と `evolve` の分割

- **`decide`**: コマンド + 現状から「起きるべきイベント列」を判断。**拒否は `Err(DomainError)`**（重複名・上限超過・最小人数割れ・権限外など現行 reducer の弾きロジックはここへ）。副作用なし。
- **`evolve`**: **検証済みイベントを必ず適用する全域関数**。集約（session + clock）を一貫更新。

```typescript
const decideAddMember = (cmd: AddMember, agg: Aggregate): Result<DomainEvent[], DomainError> => {
  const name = cmd.name.trim();
  if (!name) return err({ kind: 'EmptyName' });
  if (isDuplicateName(agg.session.rotation, name)) return err({ kind: 'DuplicateName' });
  if (agg.session.rotation.length >= MAX_MEMBERS) return err({ kind: 'MemberLimit' });
  return ok([{ type: 'MemberAdded', name }]);
};
const evolveSwitched = (agg: Aggregate, e: Switched, now: number): Aggregate => ({
  session: { ...agg.session,
    currentIndex: nextIndex(agg.session.currentIndex, agg.session.rotation.length),
    driverCounts: bump(agg.session.driverCounts, agg.session.currentIndex),
    totalSwitches: agg.session.totalSwitches + 1 },
  clock: { ...agg.clock, anchorServerTime: now, secondsLeftAtAnchor: agg.clock.intervalSeconds },
});
```

### 3.3 レイヤ構成（薄め運用）

```
domain      … 純粋。Aggregate/Command/DomainEvent/DomainError と decide/evolve。外部依存ゼロ。
application … ユースケース。ポート経由で validate→authorize→decide→evolve→保存→snapshot配信。
ports       … インターフェース（関数型）。Clock, Broadcaster, RoomStore, RoomCodeGen。
adapters    … 具体実装。WsAdapter, InMemoryRoomStore, SystemClock, NanoidCodeGen。
```

### 3.4 ポート一覧

```typescript
type Clock = () => number;                          // サーバー時刻（テストで差替・§14）
type Broadcaster = (roomCode: string, msg: ServerMsg, exclude?: ConnId) => void;
type RoomCodeGen = () => string;                    // nanoid（推測困難・S1）
interface RoomStore { get(code: string): Room | undefined; put(room: Room): void; remove(code: string): void; list(): Room[]; }
```

> AI 生成はサーバーに置かない（鍵を持たない）。お題は**ルーム代表クライアント**が生成・投入し、サーバーから見れば `ProblemSubmitted` という外部入力イベント（§6.4）。

### 3.5 関数型の実装方針

- ドメインでクラスを使わない。集約は `readonly` 値、振る舞いは純粋関数。
- 例外を投げず `Result<T,E>`（neverthrow）。
- 依存は引数注入。`makeHandlers({ clock, store, broadcast, codeGen })`（DI コンテナ不要）。
- **境界で 1 度だけ検証**（Valibot）。**`config.set` も必ず decide のドメイン検証を通す**。
- 制御副作用（タイマー・ブロードキャスト）は application/adapters に閉じ込め、domain は純粋。

### 3.6 リクエスト処理フロー（1コマンド・full snapshot）

```
WS message
  ─▶ parse + schema validate (Valibot)        ── 不正/巨大は即拒否(S3)
  ─▶ authorize(role, hostToken)               ── コマンドごとに再検証(S9)
  ─▶ decide(cmd, agg, now)
       ├─ Err(DomainError) ─▶ sender へ error
       └─ Ok(events) ─▶ agg' = events.reduce((a,e)=>evolve(a,e,now), agg)
                       ─▶ store.put(room')
                       ─▶ broadcast( snapshot(room') )   ── 全員へ完全な状態（差分なし）
```

### 3.7 タイマー: サーバー権威・時刻一本化

時間系の真実を `ServerClock`（集約の一部）に一本化。`SessionState` から時間系を排除。**1Hz の TICK は廃止。**

```typescript
interface ServerClock {
  running: boolean;
  intervalSeconds: number;
  anchorServerTime: number;     // 開始/再開/交代時のサーバー時刻(epoch ms)
  secondsLeftAtAnchor: number;  // その時点の残り秒数
  accumulatedElapsedMs: number; // 稼働区間の合計（停止時に確定加算）
  runningSince: number | null;  // 現在の稼働区間の開始時刻（停止中は null）
}
```

- サーバーは **1本の `setTimeout`** で「次の交代時刻」だけを待つ。発火で `Switched` 生成、`evolve` がアンカー更新、application が次の `setTimeout` を張り直す。
- **一時停止**: `setTimeout` クリア、`running=false`、`secondsLeftAtAnchor` に残りを凍結、`accumulatedElapsedMs += now − runningSince`、`runningSince=null`。
- **再開**: `running=true`、`anchorServerTime=now`、`runningSince=now`、再スケジュール。
- **残り秒数（クライアントは導出のみ）**:
  `secondsLeft = running ? secondsLeftAtAnchor − (now + clockOffset − anchorServerTime)/1000 : secondsLeftAtAnchor`
- **経過秒数（稼働区間積算・停止除外）**:
  `elapsedMs = accumulatedElapsedMs + (running ? (now + clockOffset) − runningSince : 0)`
- `clockOffset`（= サーバー時刻 − 自端末時刻）は接続時に数回 ping して中央値で推定。
- 交代の音・アニメは各クライアントが snapshot 内 `currentIndex` の変化を検知して再生（§5.2）。

### 3.8 サーバー側ディレクトリ

```
apps/sync/
├─ domain/        decide.ts  evolve.ts  aggregate.ts  events.ts  errors.ts
├─ application/   handlers.ts  schedule.ts  presence.ts
├─ ports/         clock.ts  broadcaster.ts  room-store.ts  code-gen.ts
├─ adapters/      ws-adapter.ts  in-memory-room-store.ts  system-clock.ts  nanoid-code-gen.ts
└─ server.ts
```

---

## 4. アイデンティティとライフサイクル

**接続 ID と参加者 ID を分離する。**

```typescript
type ConnId = string;          // WebSocket 接続ごと（揮発）
type ParticipantId = string;   // 人/端末の安定 ID（resumeToken に紐づく・再接続で不変）

interface Participant {
  participantId: ParticipantId; connId: ConnId | null;
  displayName: string;
  role: 'host' | 'editor' | 'viewer';
  presence: 'online' | 'idle' | 'offline';
  hasAiKey: boolean;            // 自己申告（代表選定のヒント・確証ではない）
  joinedAt: number;
}
```

- **トークン**: `room.create`/`room.join` で `resumeToken`、host には `hostToken` を発行。保持は **sessionStorage（既定）**。localStorage 永続はオプトイン＋ XSS 露出の注記（S4）。失効はルーム消滅時。
- **ホスト委譲**: `hostParticipantId` が猶予（既定 30 秒）超で offline なら最古の online editor へ自動委譲。再接続時は `hostParticipantId` で本人性確認し復帰。
- **サーバー再起動**: サーバーは揮発。再起動でルームは**失われる（許容）**。クライアントは再接続失敗時に「セッション終了（サーバー再起動）」を表示、各自のローカル記録は保持。クライアントからサーバー状態を再構成しない。永続化が要件化したら **§15 M4 の永続ストア**。

---

## 5. リアルタイム同期プロトコル（full snapshot）

### 5.1 Command（クライアント→サーバー・境界で Valibot 検証）

| command | payload | 権限 |
|---|---|---|
| `room.create` | `{ displayName, config? }` → `{ code, hostToken, resumeToken, participantId }` | — |
| `room.join` | `{ code, displayName, hasAiKey, resumeToken? }` | — |
| `config.set` | `Partial<SessionConfig>`（decide 検証を通す） | editor+ |
| `phase.set` | `{ phase }` | host |
| `problem.request` | `{ requestId }`（代表生成トリガ） | editor+ |
| `problem.submit` | `{ requestId, problem, usedFallback }`（委譲された代表のみ） | editor+ |
| `session.act` | `{ action }`（START/SWITCH(=skip)/PAUSE/RESUME/MOVE/ADD/REMOVE。**TICK 無し**） | editor+ |
| `session.complete` | `{}` | **host のみ** |
| `session.reset` | `{}`（setup へ戻す破壊的操作） | **host のみ** |
| `handoff.note.set` | `{ text }`（次ドライバーへの引き継ぎメモ・§9.1） | editor+ |
| `break.start` / `break.end` | `{}`（休憩の開始/終了・§9.1） | host |
| `role.set` | `{ participantId, role }` | host |
| `presence.ping` | `{}` | — |

### 5.2 Server → Client メッセージ（差分なし）

- **`snapshot`**: **唯一の状態同期手段**。`Room` 全体を含む。状態が変わるたび全員へ送り、クライアントは受信ごとに状態を置き換える。
- **`signal`（音・演出専用の付随通知。状態ではない）**: `switch`（交代）/ `celebration`（完成）/ `need-problem`（`{ requestId, deadlineMs }` 代表へ）。**真実は常に `snapshot`**で、欠落しても整合に無害（演出を1回逃すだけ）。
- **`error`**: `{ code, message }`。

### 5.3 楽観更新（最小）

- 自分の離散操作（メンバー編集・設定・フェーズ）に限りローカル先行適用。
- **サーバー snapshot を常に正**とし、受信したら楽観状態を捨てて置き換える。
- 時間系（カウントダウン・交代）は楽観しない（§3.7）。再接続後も最初の `snapshot` で完全同期。

---

## 6. AI 抽象化（ポートとしての ProblemProvider）

### 6.1 インターフェース

```typescript
interface ProblemProvider {
  id: 'none' | 'byok' | 'subscription' | 'managed';
  requiresKey: boolean; browserCompatible: boolean;
  isAvailable(): Promise<boolean>;
  generate(req: { language: string; difficulty: string; recentTitles: string[] }):
    Promise<{ problem: Problem; source: 'ai' | 'fallback'; providerId: string }>;
}
```
全実装は失敗時 `pickFallback` へ縮退（`source:'fallback'`）。**お題生成は決して画面を壊さない。**

### 6.2 採用モード

- **`NoAiProvider`（既定 ✓）**: ローカルの拡充お題バンクのみ。キー・通信不要。
- **`ByokProvider`（主力 ✓）**: 本人 API キーで**ブラウザから直接** Anthropic API（CORS ヘッダー `anthropic-dangerous-direct-browser-access: true` / SDK `dangerouslyAllowBrowser: true`）。`model` 変更で Opus/Sonnet/Haiku、`baseURL` で互換ゲートウェイ経由の他モデルも可。
- **`SubscriptionProvider`（任意・ブラウザ不可 ⚠）**: Agent SDK の月次クレジット案。CLI バイナリ内包・Node 必須でブラウザ不可、第三者 claude.ai ログインは原則不可。**ローカル Node コンパニオン経由の個人利用**に限定（v1 スコープ外）。
- **`ManagedProvider`（任意）**: 運営キーを**同期サーバーと分離した**経路（サーバーレス関数）で代理。レート制限必須（v1 スコープ外）。

### 6.3 モード選択 UI

文言は「Claude 契約あり/なし」ではなく **「API キーあり/なし」**。現在モードと直近生成が `ai`/`fallback` かをバッジ表示。

### 6.4 ルーム代表生成（タイムアウト・再委譲つき）

```
誰かが problem.request{requestId} ─▶ サーバーが代表候補列を作成
   （host 優先 → 「editor+ かつ hasAiKey の online 参加者」を joinedAt 昇順 → 末尾に「fallback 担当」）
─▶ 先頭候補へ signal.need-problem{requestId, deadlineMs}
   ├─ deadline 内に problem.submit{requestId,...} ─▶ snapshot で全員へ反映・完了
   └─ タイムアウト/離脱/Err ─▶ 次候補へ再委譲（順に試行）
─▶ 全候補が失敗 or fallback 担当のみ ─▶ サーバーが pickFallback で確定し snapshot 配信
```

- **代表は editor+ かつ hasAiKey に限定**（submit が editor+ のため）。
- **生成中 UX**: 全クライアントは `requestId` に対し「生成中…」を表示。リロール（新 `requestId`）で旧依頼はキャンセル。
- **ルーム挙動**: editor+ に一人でもキー保有者がいればライブ AI、皆無なら全員定型。キー本体はサーバーを通らず代表ブラウザ内のみ。

---

## 7. セキュリティ設計

> **この節は `docs/adr/0011`（脅威モデルとデータ分類）へ昇格しました（2026-08-13・#136）。**
> 現行の脅威モデルは ADR 0011 を参照してください。以下は当時の記録として残します。
> S1（既定 role）・S4（DOMPurify）・S6（秘密ゼロ）は現行の実装と食い違っています。

サーバーは「秘密ゼロ・状態揮発・同期ハブ専任」。脅威ごとに対策を定める。

| # | 脅威 | 対策 |
|---|---|---|
| S1 | 見知らぬ第三者の入室 | 高エントロピーのルームコード（`nanoid`）。**新規参加者の既定 role を viewer**、host が editor へ昇格。任意で合言葉/入室承認。失敗 join のレート制限。 |
| S2 | Cross-Site WebSocket Hijacking | `Origin` を許可ドメインのみ検証。認可は Cookie でなく**最初のメッセージのトークン**。WSS 必須（Caddy）。 |
| S3 | 不正・巨大メッセージ/構造インジェクション | **境界で 1 度だけ Valibot 検証**。未知 type/余剰フィールド/サイズ超過は即拒否。メッセージ最大長を設定。 |
| S4 | XSS（メンバー名・お題の描画） | React 既定エスケープ。AI/ユーザー由来テキストに `dangerouslySetInnerHTML` を使わない。Markdown 描画時は **DOMPurify**。トークンは sessionStorage 既定。 |
| S5 | AI 出力の取り違え（マークダウン誤読） | AI 応答は**信頼しないデータ**として `Problem` 形へ Valibot 構造検証してから使用。生テキストを実行/レンダリング可能な形へ流さない。 |
| S6 | BYOK キーの漏洩 | キーを**同期サーバーに絶対送らない**（クライアントのみ）。既定メモリ保持、永続はオプトイン＋警告。端末利用者からは秘匿不可と UI 明言。広域配布ならキーを扱わず `managed`。 |
| S7 | DoS（接続・ルーム濫造） | **実クライアント IP（X-Forwarded-For）**あたり同時接続上限、全体ルーム数上限、ルーム参加者上限(10)、アイドルタイムアウトで揮発回収、コマンドのレート制限。 |
| S8 | AI コスト濫用 | BYOK は本人負担。`managed` 採用時はユーザー/ルーム単位レート制限必須。 |
| S9 | 権限のなりすまし | サーバーが**コマンドごとに role 再検証**。host 操作（complete/reset/role.set/phase.set/break）は `hostToken` 必須。 |
| S10 | 状態汚染 | クライアントは状態を直接書けない。**必ず `decide` を通す**。 |
| S11 | ログ漏洩 / PII | キー・プロンプトをログに残さない。保持データは表示名のみ・揮発。 |

---

## 8. データモデル（揮発と永続の分離）

```typescript
interface Room {
  code: string; createdAt: number;
  hostParticipantId: ParticipantId;
  config: SessionConfig;
  problem: Problem | null;
  session: SessionState;          // 時間系を含まない（§3.7）
  clock: ServerClock;             // 時間系の唯一の真実（elapsed 積算含む）
  phase: 'setup'|'ready'|'session'|'celebration';
  participants: Participant[];    // presence 含む
  sessionRecords: CompletionRecord[]; // セッション内のみ・揮発
  handoffNote: string;            // 次ドライバーへの引き継ぎメモ（§9.1）
  onBreak: boolean;               // 休憩中フラグ（§9.1）
}

interface SessionState { rotation: string[]; currentIndex: number; isPaused: boolean; driverCounts: number[]; totalSwitches: number; }

interface SessionConfig {
  language: string; difficulty: string; members: string[]; intervalMinutes: number;
  navigatorEnabled?: boolean;     // ナビゲーター役を明示（§9.1）
  breakEveryRotations?: number;   // N 巡ごとに休憩提案（§9.1）
  assertiveSwitch?: boolean;      // 交代時に強い全画面通知（§9.1）
}

interface CompletionRecord { id: string; roomId?: string; problemTitle: string; language: string; difficulty: string; elapsedSeconds: number; members: string[]; totalSwitches: number; completedAt: number; }
```

- **恒久記録はクライアント**: 完成時に各クライアントの IndexedDB に保存し、JSON エクスポート/インポートで持ち運ぶ。`Room.sessionRecords` は表示用の揮発コピー。

### 8.1 プレゼンスの扱い

- presence は `Room.participants` の一部（状態の一部）として snapshot に含める。
- ただし **`presence.ping` は配信を間引く**: 単なる生存通知では snapshot を再送せず、`online↔idle↔offline` の**遷移時や入退室時のみ**配信。

---

## 9. ユーザビリティ機能

### 9.1 必須（コア体験）

- **共有 URL とルーム参加**: コードを URL に埋め、ワンタップコピー / **QR 表示**。
- **再接続と復帰**: 指数バックオフで自動再接続 → `resumeToken` で同一参加者・同一 role に復帰。再接続後は最初の `snapshot` で完全同期。
- **遅延参加 / 観覧（viewer）**: 途中入室・観覧専用に対応（新規は既定 viewer・S1）。
- **プレゼンス**: 在室者・現/次ドライバーを常時可視化。
- **ナビゲーター役の明示（新・§17）**: モブはドライバーと**ナビゲーター**を回す。`navigatorEnabled` 時、次の人（または退役ドライバー）をナビゲーターとして UI で強調し、誰が指示役かを明確にする。
- **強い交代通知（新・§17）**: `assertiveSwitch` 時、交代の瞬間に**目立つ全画面オーバーレイ**＋音で割り込む（「強い割り込みが進行を保つ」という実践知）。既定はソフト（現行のアニメ＋音）。
- **休憩リマインダ（新・§17）**: 長時間セッション向けに `breakEveryRotations` 巡ごとに休憩を提案。`break.start/end`（host）で全員のタイマーを止め、`onBreak` を表示。
- **引き継ぎノート（新・§17）**: `handoffNote` に「次の人へ：いまここまで」を残せる。交代時に次ドライバーへ目立つ形で提示（リモートの文脈共有を補助）。
- **ホスト不在耐性**: 猶予超で最古 online editor へ自動委譲。サーバー再起動はセッション終了として明示。
- **画面スリープ防止**: セッション中 **Screen Wake Lock**。**`visibilitychange` で再取得**。
- **自分の番の通知**: 非アクティブ時に **Notification**（要許可 UX）。モバイルは **`navigator.vibrate`**（iOS Safari は無視前提で音と併用）。
- **記録の入出力**: JSON エクスポート/インポート、お題 Markdown コピー（現行流用）。
- **既存操作性**: 言語/難易度クイック切替・再生成・シャッフル・ミュート・ショートカット維持。

### 9.2 あると良い

- ロビー画面、スキップ要求/次へ投票、ルーム内お題履歴、ドライバー別統計（XP 拡張）、テーマ（ライト/ハイコントラスト）、PWA（§18）。

### 9.3 ソロモード

「一人で練習」は **WS を通らず完全ローカル**で完結（`NoAi`/`Byok` + ローカルタイマー + IndexedDB）。**タイマーは同一の集約 `evolve` を使い、ローカルの `setTimeout` がサーバーの schedule 層の役を担う**（コア共有）。

---

## 10. UI/UX 設計

### 10.1 デザイン言語

現行の**ダーク + グラスモーフィズム + グラデーション**（fuchsia → violet → cyan）を**デザイントークン**化し全画面で一貫。色だけに依存せずアイコン＋テキスト併記。`Card`/`PrimaryButton`/`GhostButton`/`Modal` を再利用。

### 10.2 画面別

- **Setup**: 「ルームを作る / 一人で練習」を選択 → 言語・難易度（`ShuffleableSelect`）、メンバー（重複検出）、交代間隔（推奨 5〜10 分の指針付き）、（任意）ナビゲーター/休憩/強い通知のトグル、完成履歴。
- **Lobby（新）**: ルームコード大表示 + コピー + QR、参加者プレゼンス、host の開始。
- **Ready**: お題プレビュー + ドライバー順（`RotationPreviewCard`）。共有時は host（代表）が生成し全員へ反映。生成中は全員「生成中…」表示。
- **Session（中核）**: 中央に `TeamOrbit` + 円形カウントダウン。上部プレゼンス列、現ドライバー大、次ドライバー/ナビゲーター明示。引き継ぎノート欄。下部に 一時停止/スキップ/休憩/完成/リセット（完成・リセット・休憩は host のみ活性）。右に `RotationStatsPanel`。交代時は `assertiveSwitch` 設定に応じてソフト or 全画面割り込み。
- **Celebration**: 完成時間を主役に紙吹雪（現行流用）。記録は IndexedDB へ。

### 10.3 レスポンシブ / モバイル

モバイルファースト。`TeamOrbit`・円形タイマーをスケール。コントロールは下部に集約・折返し。交代は**音 + バイブ**。

### 10.4 アクセシビリティ

- **`prefers-reduced-motion`** 尊重（紙吹雪・ドリフト・スピン抑制。**強い全画面通知も控えめ版に切替**）。
- **ARIA ライブリージョン**で「交代」「残り10秒」「一時停止」「休憩」を読み上げ。
- モーダルのフォーカストラップ + Esc。コントラスト確保。キーボードのみで全操作可能。

---

## 11. 国際化（i18n）

**基盤として M0/M1 で導入**（後付けは高コスト）。文字列を外部化し JP を主・EN を追加。`@tasuki/timer-core` のフォールバックお題・ドメインエラー文言もキー化。

---

## 12. ライブラリ・ランタイム選定（2026 最終調査）

| 用途 | 採用（推奨） | 理由 / 代替 |
|---|---|---|
| ランタイム + WS サーバー | **Bun（ネイティブ WS）** または **Node 24 + `ws`** | §12.1 参照。本件規模ではどちらも十分軽い。 |
| WS クライアント | ネイティブ WebSocket + 自前バックオフ、または **partysocket** | 再接続・ハートビート。 |
| 関数型エラー処理 | **neverthrow**（Result） | `decide` の戻り値に最適・軽量。**代替**: Effect（将来枠）。 |
| スキーマ検証（境界） | **Valibot** | 関数型・モジュラー・Zod の約 1/10。front/server で同一スキーマ共有。Standard Schema 準拠。**代替**: Zod 4。 |
| ドメイン設計 | Hexagonal（薄め）+ **Decider**（集約 evolve） | 現行 reducer と整合。参考: `hex-effect`。 |
| モノレポ | **pnpm workspaces + Turborepo**（Bun 採用時は Bun workspaces 可） | core を front/server 共有。 |
| ルームコード/ID | **nanoid** | URL 安全・推測困難（S1）。 |
| サニタイズ | **DOMPurify** | S4/S5。 |
| QR | `qrcode` | Lobby 用。 |
| フロント | React + TypeScript + Vite + Tailwind | 現行 UI 流用。 |
| テスト | **Vitest** + **fast-check**（プロパティ） | §14。 |

### 12.1 ランタイム判断（精緻化・§17）

- **Bun**: WebSocket/リアルタイムに非常に強く（uWebSockets 由来）、DX・起動速度・テスト/インストール速度が優秀。2026 は本番採用例も多い（X・Midjourney・Railway・Claude Code 等）。**側プロジェクト/新規には筋が良い**。
- **Node 24 + `ws`**: 15 年の運用実績・エコシステム最大・長時間プロセスでの安定性。**「退屈で堅い 24/7 サーバー」を最優先するならこちら**。Node 24 は WebSocket クライアント安定化・ネイティブ TS 等で DX 差も縮小。
- **折衷（多くのチームの最適解）**: **ツール/CI/テストは Bun、本番ランタイムは用途に応じて選択**。
- **本件の指針**: 公開・低保守を重視する 24/7 常駐サーバーなので、**「Bun の DX で開発し、本番は Bun か Node 24+ws のどちらか好みで」**。状態揮発・再起動安全なので万一の不安定さもリスクが小さい（再起動で回復）。**まず Bun で立ち上げ、運用で気になれば Node へ退避**できるよう、サーバーは `ws` 互換の薄い WS アダプタ越しに書く。

### 12.2 local-first 同期エンジンは見送り（§17）

2026 は Zero（Rocicorp）/ LiveStore / TanStack DB / Triplit / ElectricSQL / Jazz など同期エンジンが活況。だが本件には**不適合**として採用しない:

- これらは概ね **Postgres バックエンドや専用プロトコル/ホスト型サービス**を前提とし、本仕様の「**秘密ゼロ・状態揮発・小さな状態・自前 WS・full snapshot**」と噛み合わない。
- これらは**永続・クエリ可能なデータ**の同期に強みがある一方、本件の共有状態は数百バイト・揮発で、過剰。
- ただし得られた知見は採用済み: 「**データ同期と一時的なリアルタイムイベントは別物**」という設計原則が、本仕様の `snapshot`（状態）と `signal`（演出）の分離（§5.2）を裏づける。
- 将来、恒久的なチーム記録・横断クエリが要件化したら、**クライアント側の記録層に TanStack DB（新サーバー不要・バックエンド非依存）**を検討する余地がある（§15 M4）。

---

## 13. 型定義 & モノレポ構成

```typescript
interface Problem { title: string; description: string; requirements: string[]; exampleTest: string; hints: string[]; }
interface SessionConfig { language: string; difficulty: string; members: string[]; intervalMinutes: number; navigatorEnabled?: boolean; breakEveryRotations?: number; assertiveSwitch?: boolean; }
interface SessionState { rotation: string[]; currentIndex: number; isPaused: boolean; driverCounts: number[]; totalSwitches: number; }
interface ServerClock { running: boolean; intervalSeconds: number; anchorServerTime: number; secondsLeftAtAnchor: number; accumulatedElapsedMs: number; runningSince: number | null; }
interface Aggregate { session: SessionState; clock: ServerClock; }
interface CompletionRecord { id: string; roomId?: string; problemTitle: string; language: string; difficulty: string; elapsedSeconds: number; members: string[]; totalSwitches: number; completedAt: number; }

type ConnId = string; type ParticipantId = string;
interface Participant { participantId: ParticipantId; connId: ConnId | null; displayName: string; role: 'host'|'editor'|'viewer'; presence: 'online'|'idle'|'offline'; hasAiKey: boolean; joinedAt: number; }
interface Room { code: string; createdAt: number; hostParticipantId: ParticipantId; config: SessionConfig; problem: Problem | null; session: SessionState; clock: ServerClock; phase: 'setup'|'ready'|'session'|'celebration'; participants: Participant[]; sessionRecords: CompletionRecord[]; handoffNote: string; onBreak: boolean; }

type Decide = (command: Command, agg: Aggregate, now: number) => Result<DomainEvent[], DomainError>;
type Evolve = (agg: Aggregate, event: DomainEvent, now: number) => Aggregate;
```

```
tdd-mob-pro-timer/
├─ packages/core/   # @tasuki/timer-core: aggregate/decide/evolve, problem, format, records, schemas(Valibot), i18n keys, Vitest+fast-check
├─ apps/web/        # React+Vite+Tailwind / ai(NoAi,Byok) / ws client(partysocket) / IndexedDB / solo-mode
├─ apps/sync/       # 関数型DDD: domain/application/ports/adapters/server.ts（薄いWSアダプタ越し・Bun↔Node 退避可）
└─ deploy/Caddyfile
```

---

## 14. テスト戦略

- **ドメイン（最重要）**: `decide`/`evolve`（集約一括）を純粋関数として網羅。現行 `runSelfTests` を Vitest へ昇格。`now` 引数で時刻依存も決定論的に検証。
- **プロパティテスト（fast-check）**: 任意の操作列で不変条件（`rotation.length === driverCounts.length`、`currentIndex` 妥当、`clock` と `session` の整合）が保たれる。
- **時計の決定論性**: `Clock` 注入 + フェイクタイマーで交代・一時停止・再開・**elapsed の停止除外**・休憩を再現。
- **同期/整合**: full snapshot の冪等な置き換え、再接続後の整合、ホスト委譲、代表生成タイムアウト→再委譲→フォールバック収束。
- **CI 必須**。

---

## 15. マイルストーン（TDD で進行）

1. **M0**: `@tasuki/timer-core`（集約 `decide`/`evolve` 分割・時間系分離・elapsed 積算）、Valibot スキーマ、i18n キー化、Vitest + fast-check、モノレポ骨組み。
2. **M1（脱 Artifact）**: `window.storage`→IndexedDB、AI を `ProblemProvider`（NoAi + Byok ブラウザ直叩き）へ。ソロモード。「API キーあり/なし」UI。
3. **M2（同期サーバー）**: `apps/sync`（集約 evolve・サーバー権威時計・揮発・秘密なし・full snapshot）。薄い WS アダプタ（Bun/Node 退避可）。WS クライアント（partysocket）。Caddy 前段（X-Forwarded-For）。
4. **M3（共有仕上げ）**: ルームコード/QR・参加者 ID/トークン・既定 viewer・権限/委譲（complete/reset/break は host 限定）・再接続復帰・代表生成（editor+ 限定・タイムアウト/再委譲）・プレゼンス間引き・**ナビゲーター役/休憩/強い交代通知/引き継ぎノート**・Wake Lock・通知/バイブ・記録入出力。
5. **M4（堅牢化・拡張）**: §7 セキュリティ網羅・a11y・PWA（§18）・（任意）managed/subscription・チーム共有記録ストア（TanStack DB 等の検討）。

---

## 16. v2.4 → v3.0 変更点（最終調査反映）

| 区分 | 対応 |
|---|---|
| 機能追加（モブ実践知） | **ナビゲーター役の明示**・**休憩リマインダ（break.start/end・onBreak）**・**強い交代通知（assertiveSwitch）**・**引き継ぎノート（handoffNote）** を追加（§9.1・§5.1・§8） |
| 交代間隔の指針 | 既定 5 分・推奨 5〜10 分・短いほど集中/学習向上を UI に明記（§1・§10.2） |
| ランタイム判断 | Bun / Node 24+ws の使い分けを精緻化、薄い WS アダプタで退避可能に（§12.1・§13） |
| 同期技術の最終判断 | local-first 同期エンジン（Zero/LiveStore/TanStack DB 等）を**検討の上で見送り**、知見（snapshot/signal 分離）は採用（§12.2） |
| 運用・配布 | §18 を新設（小規模常駐・揮発ゆえ再起動安全・ヘルスチェック・PWA・ライセンス） |
| 設計の裏づけ | 実証済み WS 製モブタイマー（mobtime 等）に倣う旨を明記（§0・§17） |

---

## 17. 最終調査で得た知見・新規アイデアの根拠

- **モブ実践知**: ドライバーと**ナビゲーター**を回すのが定番。交代は**短い方が集中・学習が高まる**（10 人でも 3 分が機能、5〜10 分が定番）。**強い割り込み（目立つ通知）が進行を保つ**。**長時間ゆえ休憩を意識的に取る**。次の人への**文脈共有（引き継ぎ）**が遠隔では重要。→ ナビゲーター明示・休憩・強い通知・引き継ぎノート・間隔指針として反映。
- **実証済みの形**: 自己ホスト可能な WS 製モブタイマー（mobtime 等）が「全員が同一時刻をほぼ即時共有」を実現済み。本仕様のサーバー権威 WS + full snapshot はこの実績に沿う。
- **同期エンジンの潮流**: 2026 は local-first 同期エンジンが活況だが、Postgres/ホスト型前提で本件の秘匿ゼロ・揮発・極小状態には過剰。**「データ同期と一時イベントは別概念」**という業界知見のみ採用（snapshot/signal 分離）。
- **ランタイム**: Bun は WS/DX に強く側プロジェクト向き、Node 24+ws は長時間運用の堅さ。状態揮発で再起動安全なため Bun で開始し必要なら Node へ退避できるよう薄い WS アダプタを挟む。

---

## 18. 運用・配布・ライセンス（新規）

- **小規模常駐で十分**: 同期サーバーは入室時の握手と小さな JSON 中継のみ。無料枠〜月数ドルの小インスタンスで足りる。
- **再起動安全**: 状態は揮発・秘密なし。クラッシュ/デプロイでの再起動は「進行中セッションの終了」を意味するだけで、復旧手順は不要（クライアントは再接続失敗を検知して案内）。**ヘルスチェック + 自動再起動**だけ用意すれば運用は軽い。
- **デプロイ**: `apps/web` をビルドして Caddy で静的配信、`apps/sync` を常駐（systemd / コンテナ）、Caddy が前段で自動 HTTPS と `/ws` プロキシ。
- **PWA**: インストール可能・オフラインでソロ練習可能（`NoAi` + IndexedDB）。
- **ライセンス**: 公開 OSS なら **MIT** を既定案（依存ライブラリと整合しやすい）。AI 生成お題の扱い・第三者ライブラリの著作権表記を README に明記。
- **プライバシー**: 既定で外部送信なし（BYOK のみ本人ブラウザ→Anthropic）。アクセス解析を入れる場合はオプトイン・匿名で。

---

## 付録: 調査根拠（参照 URL）

- ブラウザ直叩き（CORS）: https://platform.claude.com/docs/en/api/sdks/typescript ／ https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/
- サブスク Agent SDK クレジット: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- Agent SDK のブラウザ非対応 / 第三者ログイン制限: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk ／ https://code.claude.com/docs/en/agent-sdk/overview
- WS ライブラリ（Bun ネイティブ=uWebSockets, ws）: https://bun.com/docs/runtime/http/websockets
- Bun/Node 2026 比較: https://tech-insider.org/bun-vs-node-js-2026/ ／ https://strapi.io/blog/bun-vs-nodejs-performance-comparison-guide
- スキーマ検証（Valibot vs Zod4 vs ArkType, Standard Schema）: https://www.pkgpulse.com/guides/valibot-vs-zod-v4-typescript-validator-2026
- 関数型 DDD / Hexagonal（参考実装 hex-effect）: https://github.com/jkonowitch/hex-effect
- local-first 同期エンジン 2026: https://johnny.sh/blog/choosing-a-sync-engine-in-2026/ ／ https://www.pkgpulse.com/guides/tanstack-db-vs-zero-vs-livestore-sync-engines-2026
- モブプロ実践知（リモート・ローテーション・休憩）: https://www.remotemobprogramming.org/ ／ https://agilealliance.org/resources/experience-reports/one-year-of-remote-mob-programming/ ／ https://github.com/remotemobprogramming/mob

> 注: 実装着手前に、Agent SDK のクレジット規約・配布ポリシー、各ライブラリのメジャーバージョンを再確認すること。
