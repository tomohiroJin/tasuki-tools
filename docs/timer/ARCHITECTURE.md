# アーキテクチャ

TDD Mob Pro Timer の構造・データフロー・設計原則をまとめます。個々の設計判断の経緯と
トレードオフは [adr/](./adr/) を参照してください。仕様の正本は
[../../docs/plans/tdd-mob-pro-timer/spec.md](../../docs/plans/tdd-mob-pro-timer/spec.md) です。

## 全体像

```
┌─────────────┐     wss/ws (/ws)      ┌──────────────────────────┐
│  ブラウザ複数  │ ───────────────────▶ │ apps/sync（同期サーバー）   │
│  apps/web    │ ◀─── full snapshot ── │  application → domain      │
│              │                       │  ports ← adapters          │
│              │                       │（揮発・再起動安全。AI お題は │
│              │                       │  サーバー常駐 claude -p）    │
└─────────────┘                       └──────────────────────────┘
        │  共有                         共有
        └────────▶ packages/core（@tasuki/timer-core）◀────────┘
                    純粋ドメイン・スキーマ・お題・記録
```

> **この図と以下の見出しは旧名のまま**です（`apps/sync` → `apps/tasuki-sync`、
> `apps/web` → `apps/timer-web`、`packages/core` → `packages/timer-core`。同期サーバーは
> [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95) S2 で timer と poker の 1 本に
> 統合された）。**ファイルを名指しする箇所は実在するパスへ直してある**ので、たどれない
> 参照は残っていない。図と見出しの改名は本文の書き換えを伴うため別途行う。

- **依存方向**: 外側（adapters / application）→ ドメイン（純粋）。ドメインは外部依存ゼロ。
- **core を front/server で共有**: 同じ `decide`/`evolve` をサーバー（`apps/sync`）と共有フロント
  （`apps/web`）の双方が使うため、挙動が一致します（[ADR-0001](./adr/0001-monorepo-shared-core.md),
  [ADR-0002](./adr/0002-decider-pure-domain.md)）。

## packages/core — 純粋ドメイン

時刻・I/O・乱数に依存しない純粋関数群です。

| ファイル | 役割 |
|---|---|
| `aggregate.ts` | 集約型（`Aggregate = { session, clock }`）、`secondsLeft`/`elapsedMs` の導出関数 |
| `decide.ts` | `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` — コマンド→イベント |
| `evolve.ts` | `evolve(agg, event, now): Aggregate` — イベント→次状態（全域関数） |
| `events.ts` / `errors.ts` | `DomainEvent` 合併型 / `DomainError` 合併型 |
| `schemas.ts` | Valibot スキーマ（Command / ServerMsg / Problem / SessionConfig）。境界で検証と**正規化**を行う。表示名の正規化（`normalizeDisplayName`）はメンバーシップ文脈の `packages/room-core` から取り込む（#95 S1 で移設。この取り込みは S4a で消える） |
| `removal-notification.ts` | 退出通知の種類を決める `removalNotificationFor`（Issue #32）。**#95 S3 以前は `participants.ts` に、在室者の不変条件（`canRemoveParticipant` / `canDemote` / `transferHost`）と同居していた。不変条件は役割ごと廃止し、この 1 関数だけが残ったので独立させた** |
| `problem.ts` | 定型お題バンク・`validateProblem`・`pickFallback`・プロンプト生成 |
| `records.ts` | 完成記録の生成（所要時間は稼働区間のみ積算） |
| `error-messages.ts` | エラーコード → 利用者向け文言の**単一の正本**（Issue #28・FR-105）。画面表示は `displayMessageFor()`、wire の `message` は `errorMessageFor()` を経由する。**コードと文言は 1 対 1**（Issue #29）— 同じコードを説明が異なるべき複数の操作から返さない |

### Decider パターン（decide / evolve）

状態遷移を「決定（decide）」と「適用（evolve）」に分離します。

- `decide` は副作用なしでコマンドを検証し、`neverthrow` の `Result` を返します（例外を投げない）。
  不正は `Err(DomainError)`（`EmptyName` / `DuplicateName` / `MemberLimitExceeded` /
  `PhaseConflict` / `InvalidInterval` 等）。
- `evolve` はイベントを適用して次の集約を返す全域関数です。
- 詳細: [ADR-0002](./adr/0002-decider-pure-domain.md)、[ADR-0006](./adr/0006-result-and-boundary-validation.md)。

### 権限 — 持たない（ルームに居る全員が同格）

**参加者ごとに区別される権限はありません。** ルームに居る人は全員が同格で、コマンドの受理は
まず在室しているかどうかを見ます。`Role` 型（`host` / `editor` / `viewer`）・
`Participant.role`・`Room.hostParticipantId`・可否判定モジュール（`permissions.ts` の
`checkPermission` / `isAllowed`）・在室者の不変条件（`participants.ts` の
`canRemoveParticipant` / `canDemote` / `transferHost`）は、いずれも
**#95 S3 で廃止しました**（[ADR-0007](./adr/0007-volatile-in-memory-state.md) の
改定（2026-09-08）／[設計正本](../superpowers/specs/2026-09-06-shared-identity-and-rooms-design.md) D5）。

**ただし在室だけで何でも通るわけではありません。** ドメイン側の事前条件
（`PhaseConflict` / `InvalidInterval` / `BelowMinMembers` 等）は残りますし、
**実行者で選別する関門も 1 つだけ残っています**。`problem.submit` は、いまお題の委譲が
オファーしている参加者本人からの投入しか受理しません（`problem-delegation.ts` の `submit`。
他の在室者へは `STALE_SUBMISSION` を返します）。これは参加者に貼り付く権限ではなく、
その時点の委譲順の話です。

**なぜ消したか。** 主催者が落ちた部屋で誰も操作できなくなる「詰み」を、役割を保ったまま
避けようとすると、段階（開始前／開始後）と対象（自分／他人）で権限を切り替える規則が要り、
その判定順序に過去の回帰が何本も刻まれました。全員同格にすると、規則そのものが消えます。

**代わりに残るもの。**

- **ドライバーの適格性**（`Participant.driverEligible`）は役割ではなく**ローテーションの話**として
  残っています。ただし輪の所属そのものではありません。輪に居るかどうかは `session.rotation`
  （参加者 ID の配列）で決まり、出入りは `member.add` / `member.remove` が行います
  （画面では「ドライバーに加わる」「列から外れる」）。`driver.skip` / `driver.resume`（「見送り」）は
  **輪に居たまま自分の順番を飛ばす**フラグで、枠は保持されます（画面では「一時離脱」「復帰」）。
  どちらも在室者なら誰でも自分に対して実行できます。もとから役割とは独立の 2 層構造で、
  S3 はそのうち役割の層だけを取り除きました。
- **合言葉**（`room.passphrase.set`）と **AI 解錠**（`ai.unlock`）は在室者なら誰でも実行できます。
  合言葉を誰でも設定できることの帰結（他の参加者を締め出しうる）は受容済みです（設計正本 §8）。

なお `Room.startedAt`（一度でもセッションを開始したか）は snapshot に残っていますが、
**権限判定が消えたことで読み手を持ちません**。撤去するかどうかは別の段で判断します。

### 参加者の同定 — 表示名ではなく識別子

ローテーション（`session.rotation`）は**参加者 ID の配列**です。表示名の配列ではありません。
同名の参加者（二重参加の幽霊・再接続）が居るとき、名前で枠を引くと別人の枠を巻き添えにします。
参加順など間接的な手掛かりで持ち主を推測する実装は2度失敗しており、枠と参加者を直接結び付けています。

表示名は**表示のためだけ**に使います。`config.members` は rotation の表示名ミラーで、
完成記録もこちらを使います。画面で人を指す呼び名は `ui/participant-label.ts` が1か所で決め、
同名が並ぶときだけ識別子の末尾を添えます（FR-084）。

表示名は境界（`schemas.ts`）で正規化されます。画面で同じに見えるものが同じ文字列になるよう、
空白の畳み込み・不可視文字の除去・NFKC・識別子ラベル書式の除去を行います。正規化で潰せない
見た目の衝突（キリル文字の `Вob` など）は、比較専用の骨格（`nameSkeleton`）で「曖昧」と判定し、
識別子を添えて区別します。**検出は寛容に、拒否は厳格に**——骨格は表示の判定にだけ使い、
サーバーの重複拒否には使いません（正当な名前を弾かないため）。

### 時刻の扱い — サーバー権威 ServerClock

時刻系は `ServerClock` に一本化し、残り時間・経過時間は**導出**します。クライアントは導出のみで、
端末ローカル時計でカウントを進めません。

```
secondsLeft = running ? secondsLeftAtAnchor − (now + offset − anchorServerTime)/1000
                      : secondsLeftAtAnchor
elapsedMs   = accumulatedElapsedMs + (running ? (now + offset) − runningSince : 0)
```

`accumulatedElapsedMs` は稼働区間のみ積算するため、一時停止中の時間は所要時間に含まれません
（FR-006 / SC-004）。`offset` は接続時の `time.ping` 往復から推定する `clockOffset` です。
詳細: [ADR-0003](./adr/0003-server-authoritative-clock.md)。

## apps/sync — 同期サーバー

Hexagonal（薄め）構成。アプリケーション層がフローを束ね、ドメインは core を再利用します。

```
application/
  handlers.ts        validate → decide → evolve → store → broadcast（#95 S3 で authorize の段が消えた）
  schedule.ts        サーバー権威タイマー（1 本の setTimeout で次交代のみ待つ）
  presence.ts        プレゼンス間引き・ドライバー不在の繰り上げ（猶予 30 秒）
  problem-delegation.ts  お題の代表生成・タイムアウト・再委譲・定型縮退
  ai-limits.ts       AI 生成の濫用抑制（同時 1・クールダウン・日次上限）
  room-reclaimer.ts  アイドルルームの回収
  admin.ts           管理エンドポイント（127.0.0.1 限定）
  secure-compare.ts  合言葉のタイミングセーフ比較
ports/   clock / broadcaster / room-store / code-gen（インターフェース）
adapters/ ws-adapter / in-memory-room-store / system-clock / nanoid-code-gen /
          claude-cli-problem-provider（AI お題生成・claude -p 子プロセス）
server.ts  依存注入と起動（maxConnections / maxRooms のグローバル資源上限）
```

### リクエスト処理フロー（1 コマンド・full snapshot）

```
WS message
 ─▶ parse + Valibot 検証（未知 type・過大サイズ・不正を即拒否）
 ─▶ decide(cmd, agg, now)
      ├─ Err ─▶ 送信者へ error
      └─ Ok(events) ─▶ agg' = events.reduce(evolve)
                      ─▶ store.put(room') ─▶ broadcast(snapshot(room'))
```

状態同期は **full snapshot のみ**（差分なし）。受信側は丸ごと置き換えます。整合バグの温床を断つ設計です
（[ADR-0004](./adr/0004-full-snapshot-sync.md)）。

### 状態の揮発性とトークン

ルーム状態は `InMemoryRoomStore` に保持し、永続化しません。サーバー再起動は「進行中セッションの終了」を
意味するのみで復旧手順を要しません（再起動安全）。復帰トークンは `makeHandlers`
クロージャ内の `Map` に保持し、モジュールグローバルを避けます（テスト間汚染防止）。
詳細: [ADR-0007](./adr/0007-volatile-in-memory-state.md)。

### お題の AI 生成（サーバー常駐・解錠式）

AI 生成はサーバー常駐の `claude -p` 子プロセス（`adapters/claude-cli-problem-provider.ts`）で行い、
`AI_UNLOCK_KEY` を知る在室者なら誰でも解錠できます（#95 S3 以前はホスト限定でした）。
OAuth トークンは子プロセスの env にのみ渡し、
argv・ログ・snapshot に混入させません。失敗（タイムアウト・検証失敗・トークン失効）は全経路で
定型バンクへ縮退し、濫用は `application/ai-limits.ts`（同時 1・クールダウン・日次上限）で抑制します。
詳細: [ADR-0008](./adr/0008-server-resident-ai-generation.md)
（旧 BYOK + 代表生成方式は [ADR-0005](./adr/0005-secret-zero-byok-problem.md) = Superseded）。

## apps/web — フロントエンド

- `sync/client.ts`: WS クライアント。snapshot 置き換え・`clockOffset` 推定・指数バックオフ再接続。
  **未接続時に送られたコマンドはキューに退避し、`onopen` でフラッシュ**します（接続確立前の
  `room.create` 取りこぼしを防ぐ）。**初回接続と、切断後の再接続を区別**し（`hasConnectedOnce`）、
  後者の `onopen` でのみ `onReconnected` を呼びます（Issue #24）。
- `sync/dispatch.ts`: 受信メッセージの純粋な振り分け（snapshot / error / signal / time.pong）。
- `sync/resume-identity.ts`: 自分の `resumeToken`/`participantId`/ルームコード/表示名を
  `sessionStorage` に保持します（**localStorage ではない** — resumeToken はルーム限定・短命で
  サーバー再起動により失効するため、タブ単位で完結する sessionStorage が要件に合致します）。
  `App.tsx` は WS の `onReconnected`（上記）でこれを読み、`resumeToken` 付きの `room.join` を
  利用者の操作なしに再送します。既存の参加者を復帰させるサーバー側処理
  （`apps/tasuki-sync/src/application/command-handlers/room-join.ts`）は本 Issue 以前から実装済みでしたが、
  web クライアントから一度も使われていませんでした（Issue #24・詳細は
  [docs/plans/resume-token-wiring/](../../docs/plans/resume-token-wiring/)）。
- `ai/`: `ProblemProvider`。現行は `NoAiProvider`（AI 生成はサーバー側 = ADR-0008）。
  **BYOK 一式（`byok.ts` / `key-storage.ts` / `AiSettingsModal.tsx`）は Issue #28 で撤去した。**
  「将来の再有効化に備えて残置」という休眠コードは持たない（US1・FR-087）。
- `records/`: IndexedDB 永続化（`indexeddb.ts`）と完成記録の組み立て（`persist.ts`）。
- `ui/`: 画面（Setup / Join / Lobby / Session / Summary / History）。`screenForPhase` で `room.phase` に追従。
  **`App.tsx` から切り出した純粋な判定関数群**も同じ階層に置きます（`screen.ts` /
  `connection-status.ts` / `problem-generation.ts` / `join-driver-intent.ts` /
  `error-action.ts` / `room-param.ts`）。`App.tsx` はそれらの結果を適用するだけにして、
  規則をテストの届く場所に置くのが方針です（`App.tsx` 自体の render テストは持たないため、
  判定を中に埋めると検証手段が無くなる）。**`host-change.ts` も同じ階層にありましたが、
  ホスト移譲の導線ごと #95 S3 で削除しました。**
- `platform/`: 通知（`notify.ts`）・交代音とカウントダウン音声（`sound.ts`）。

### 画面遷移は phase 駆動

共有セッションでは、各クライアントは受信 snapshot の `room.phase`（`setup`/`ready`/`session`/
`celebration`）から表示画面を導出します（`ui/screen.ts`）。これにより誰かの開始・完成・リセットが
全参加者の画面に一斉反映されます。

## WS メッセージ契約

`packages/timer-core/src/schemas.ts` の Valibot スキーマが front/server で共有される単一の契約です。

**Command（クライアント→サーバー）**: `room.create` / `room.join` / `room.passphrase.set` /
`config.set` / `phase.set` / `problem.request` / `problem.submit` / `problem.edit` / `problem.mode.set` /
`ai.unlock`（AI 生成の解錠 = ADR-0008）/ `session.act`（START/SWITCH/PAUSE/RESUME/RESTART）/
`session.complete` / `session.abort` / `session.reset` / `driver.skip|resume|assign` /
`member.add|remove|move|shuffle` / `participant.addProxy|rename|remove` / `handoff.note.set` /
`break.start|end`（**dormant**: v2.10 で休憩機能を撤去。スキーマは後方互換のため残置、受理されない）/
`presence.ping` / `time.ping`。正本は `packages/timer-core/src/schemas.ts` の Command union。

**Server→Client**: `snapshot`（唯一の状態同期）/ `signal`（演出専用: switch / celebration /
need-problem）/ `error` / `time.pong` / `room.created` / `room.joined`。

### 退出した本人への通知（Issue #32）

退出が成立すると、その本人は在室者でなくなるため **snapshot の宛先から外れます**。
本人に何も届かないと、退出前の画面に留まったまま操作だけが拒否される「取り残し」になります。
そこで `error` を 1 接続へ直送する経路を使い、**誰の操作による退出かで種類を分けます**。

| 誰が誰を | 本人へ送るコード | 本人の画面 | URL の `?room=` |
|---|---|---|---|
| 自分が自分を | `LEFT_ROOM` | 入口（Setup） | **除去する**（復帰は招待からやり直す） |
| 他者が自分を | `REMOVED_FROM_ROOM` | 参加（Join） | 保持する（再参加しやすくする） |
| 他者が自分を（旧サーバー） | `REMOVED_BY_HOST` | 参加（Join） | 保持する |
| 代理（クライアント無し） | 送らない | — | — |

種類の判定は core の `removalNotificationFor()`、画面の行き先は web の `errorAction()` が持ちます。
**画面を移すのは `errorAction()` が明示的に列挙したコードだけ**で、既定は `transient`（画面を移さない）です。
**#95 S3 以前はここに「退出が拒否された場合（`LAST_MANAGER_LEAVE` 等）」という実例が
ありました。役割由来の不変条件（「実在の編集者以上が 1 名以上残る」）は廃止しましたが、
退出が拒否されうる経路そのものは残っています** —— ローテーションを空にする退出は
`BelowMinMembers` で拒まれ（`command-handlers/participant-remove.ts` の rotation 長ガード。
`evolve` が `currentIndex` を決められなくなるのを防ぐためで、役割とは無関係。
**在室者が誰も残らないソロの部屋だけは例外で、拒まずにルームごと破棄します**（Issue #79））、
不正な対象は `INVALID`、居ない相手は `PARTICIPANT_NOT_FOUND` で拒まれます。
**いずれも `errorAction()` の既定の `transient` に落ちるので、画面は移りません。**

### エラーコードは操作と 1 対 1（Issue #29）

**同じコードを、説明が異なるべき複数の操作から返してはいけません。**
1 つのコードが複数の操作から返ると、そのコードに与える文言はどちらか一方に寄るしかなく、
もう一方の操作では**やっていない操作の説明**が出ます（実際に「指名の失敗が移譲の話として
説明される」欠陥が起きていました）。

| 操作 | コード |
|---|---|
| ドライバー指名・対象がオフライン | `DRIVER_ASSIGN_OFFLINE` |
| ドライバー指名・対象が輪に居ない | `NOT_IN_ROTATION` |
| ルーム参加・試行過多 | `JOIN_RATE_LIMITED` |

**これらの拒否はほとんどが UI 側で事前に抑止されています**（ボタンを描画しない・無効化する）。
つまり画面から通常操作では到達せず、レース（描画後に相手がオフラインになる等）・
旧クライアント・非 UI クライアントで発火するサーバー側の防御です。
**他に手がかりが無い状況だからこそ**、文言が操作と一致していることが要ります。

旧コード（`PARTICIPANT_OFFLINE` / `CANNOT_CHANGE_HOST` / `LAST_MANAGER`）は
**語彙（`SYNC_ERROR_CODES`）から外しつつ文言だけ残して**あります。
配備前から開かれた画面が旧サーバーの応答を受け取り得るため、文言を消すと表示が
既定文言へ退化します。`REMOVED_BY_HOST` と同じ扱いです。

**#95 S3 で外した 6 件（`UNAUTHORIZED` / `HOST_TRANSFER_OFFLINE` / `CANNOT_CHANGE_HOST_ROLE` /
`ALREADY_HOST` / `LAST_MANAGER_LEAVE` / `LAST_MANAGER_DEMOTE`）は扱いが違い、語彙も文言も
消しました。**上の 3 件は 1 つのコードを操作ごとへ細分化しただけで、指す事象は今も起こり得ます。
S3 が外した 6 件は事象そのもの（可否判定・ホスト移譲・役割変更・「進行できる人が残る」不変条件）が
無くなっており、旧サーバーの応答として届いても説明すべき操作が画面に存在しません。

## テスト戦略

- **ドメイン単体**: `decide`/`evolve` を純粋関数として網羅。`now` 引数で時刻依存を決定論的に検証。
- **プロパティテスト**: fast-check で任意操作列の不変条件（`rotation.length === driverCounts.length`、
  `currentIndex` 妥当性、clock/session 整合）を検証（FR-008 / SC-010）。
- **同期/結合**: full snapshot の冪等置き換え、resume、ドライバー不在の繰り上げ、代表生成の再委譲→縮退。
- **外部ブラックボックス検証**: 起動済みサーバーへ WS で接続するシナリオ検証、実ブラウザ（Playwright）
  での UI 検証を実施済み。

## 非機能・セキュリティの要点

- **境界検証**: 全 WS メッセージを Valibot で一度だけ検証（未知 type・過大・不正を即拒否）。
- **XSS**: React 既定エスケープ。AI/ユーザー由来テキストへ `dangerouslySetInnerHTML` 不使用。
- **トークン管理**: AI 用 OAuth トークンはサーバー env のみ。`claude -p` 子プロセスの env にのみ渡し、
  argv・ログ・snapshot に混入させない（ADR-0008）。
- **resumeToken の保存先**: `sessionStorage`（`sync/resume-identity.ts`）。`localStorage` は
  機密情報の保存禁止（セキュリティ規約）だが、`resumeToken` はルーム限定・短命でサーバー
  再起動により失効するため、タブ単位で完結する `sessionStorage` が要件に合致する（Issue #24）。
- **WSS / Origin**: 本番は Caddy で WSS 強制・許可 Origin 検証（`ALLOWED_ORIGINS`）。
- **可用性**: 状態揮発・再起動安全。

## 未実装・将来枠

初版の実装範囲は M0〜M3（以後 v2.x で拡張。グローバル資源上限・アイドル回収・AI 生成は実装済み）。
以下は未実装（[tasks.md](../../docs/plans/tdd-mob-pro-timer/tasks.md) 参照）:

- IP 単位のレート制限（[#103](https://github.com/tomohiroJin/tasuki-tools/issues/103) で追跡。グローバルな maxConnections / maxRooms は実装済み）
- PWA・チーム横断の永続記録ストア

（FR-020「セッション喪失の明示」は実装済み: `App.tsx` の sessionLost → `StatusStrip` の lost 表示）
