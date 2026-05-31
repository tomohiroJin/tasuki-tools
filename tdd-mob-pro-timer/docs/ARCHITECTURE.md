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
│  ソロは WS    │ ··· BYOK 直接 ······▶ │（揮発・秘密ゼロ・再起動安全）│
│  を通らない   │   api.anthropic.com   └──────────────────────────┘
└─────────────┘
        │  共有                         共有
        └────────▶ packages/core（@tdd-mob/core）◀────────┘
                    純粋ドメイン・スキーマ・お題・記録
```

- **依存方向**: 外側（adapters / application）→ ドメイン（純粋）。ドメインは外部依存ゼロ。
- **core を front/server で共有**: 同じ `decide`/`evolve` をサーバーとソロモードの双方が使うため、
  共有セッションとソロで挙動が一致します（[ADR-0001](./adr/0001-monorepo-shared-core.md),
  [ADR-0002](./adr/0002-decider-pure-domain.md)）。

## packages/core — 純粋ドメイン

時刻・I/O・乱数に依存しない純粋関数群です。

| ファイル | 役割 |
|---|---|
| `aggregate.ts` | 集約型（`Aggregate = { session, clock }`）、`secondsLeft`/`elapsedMs` の導出関数 |
| `decide.ts` | `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` — コマンド→イベント |
| `evolve.ts` | `evolve(agg, event, now): Aggregate` — イベント→次状態（全域関数） |
| `events.ts` / `errors.ts` | `DomainEvent` 合併型 / `DomainError` 合併型 |
| `schemas.ts` | Valibot スキーマ（Command / ServerMsg / Problem / SessionConfig） |
| `problem.ts` | 定型お題バンク・`validateProblem`・`pickFallback`・プロンプト生成 |
| `records.ts` | 完成記録の生成（所要時間は稼働区間のみ積算） |
| `i18n/` | 日本語（主）・英語のメッセージ |

### Decider パターン（decide / evolve）

状態遷移を「決定（decide）」と「適用（evolve）」に分離します。

- `decide` は副作用なしでコマンドを検証し、`neverthrow` の `Result` を返します（例外を投げない）。
  不正は `Err(DomainError)`（`EmptyName` / `DuplicateName` / `MemberLimitExceeded` /
  `Unauthorized` / `PhaseConflict` / `InvalidInterval` 等）。
- `evolve` はイベントを適用して次の集約を返す全域関数です。
- 詳細: [ADR-0002](./adr/0002-decider-pure-domain.md)、[ADR-0006](./adr/0006-result-and-boundary-validation.md)。

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
  handlers.ts        validate → authorize → decide → evolve → store → broadcast
  schedule.ts        サーバー権威タイマー（1 本の setTimeout で次交代のみ待つ）
  presence.ts        プレゼンス間引き・ホスト委譲（猶予 30 秒）
  problem-delegation.ts  お題の代表生成・タイムアウト・再委譲・定型縮退
ports/   clock / broadcaster / room-store / code-gen（インターフェース）
adapters/ ws-adapter / in-memory-room-store / system-clock / nanoid-code-gen
server.ts  依存注入と起動
```

### リクエスト処理フロー（1 コマンド・full snapshot）

```
WS message
 ─▶ parse + Valibot 検証（未知 type・過大サイズ・不正を即拒否）
 ─▶ authorize(role)（コマンドごとに再検証）
 ─▶ decide(cmd, agg, now)
      ├─ Err ─▶ 送信者へ error
      └─ Ok(events) ─▶ agg' = events.reduce(evolve)
                      ─▶ store.put(room') ─▶ broadcast(snapshot(room'))
```

状態同期は **full snapshot のみ**（差分なし）。受信側は丸ごと置き換えます。整合バグの温床を断つ設計です
（[ADR-0004](./adr/0004-full-snapshot-sync.md)）。

### 状態の揮発性とトークン

ルーム状態は `InMemoryRoomStore` に保持し、永続化しません。サーバー再起動は「進行中セッションの終了」を
意味するのみで復旧手順を要しません（再起動安全）。ホストトークン・復帰トークンは `makeHandlers`
クロージャ内の `Map` に保持し、モジュールグローバルを避けます（テスト間汚染防止）。
詳細: [ADR-0007](./adr/0007-volatile-in-memory-state.md)。

### お題の代表生成（秘密ゼロ）

サーバーは AI 鍵を持ちません。共有ルームでは代表クライアントが自分の鍵で生成し、`problem.submit` で
サーバーへ届けます。候補順は「主催者 → 編集者以上かつ AI 鍵保有の online（参加時刻昇順）→ 定型担当」。
deadline 内に投入が無ければ次候補へ再委譲し、全滅なら定型お題で確定します。
詳細: [ADR-0005](./adr/0005-secret-zero-byok-problem.md)。

## apps/web — フロントエンド

- `sync/client.ts`: WS クライアント。snapshot 置き換え・`clockOffset` 推定・指数バックオフ再接続。
  **未接続時に送られたコマンドはキューに退避し、`onopen` でフラッシュ**します（接続確立前の
  `room.create` 取りこぼしを防ぐ）。
- `sync/dispatch.ts`: 受信メッセージの純粋な振り分け（snapshot / error / signal / time.pong）。
- `solo/local-engine.ts`: ソロモード。ローカル `setTimeout` が schedule 層を担い、core の `evolve` を使う。
- `ai/`: `ProblemProvider`（`NoAiProvider` / `ByokProvider`）。失敗時は `pickFallback` で定型縮退。
- `records/`: IndexedDB 永続化と JSON 入出力。
- `ui/`: 画面（Setup / Lobby / Session / Celebration）。`screenForPhase` で `room.phase` に追従。
- `platform/`: Wake Lock・通知/振動。

### 画面遷移は phase 駆動

共有セッションでは、各クライアントは受信 snapshot の `room.phase`（`setup`/`ready`/`session`/
`celebration`）から表示画面を導出します（`ui/screen.ts`）。これにより主催者の開始・完成・リセットが
全参加者の画面に一斉反映されます。

## WS メッセージ契約

`packages/core/src/schemas.ts` の Valibot スキーマが front/server で共有される単一の契約です。

**Command（クライアント→サーバー）**: `room.create` / `room.join` / `config.set` / `phase.set` /
`problem.request` / `problem.submit` / `session.act`（START/SWITCH/PAUSE/RESUME）/ `session.complete` /
`session.reset` / `member.add|remove|move` / `role.set` / `handoff.note.set` / `break.start|end` /
`presence.ping` / `time.ping`。

**Server→Client**: `snapshot`（唯一の状態同期）/ `signal`（演出専用: switch / celebration /
need-problem）/ `error` / `time.pong` / `room.created` / `room.joined`。

## テスト戦略

- **ドメイン単体**: `decide`/`evolve` を純粋関数として網羅。`now` 引数で時刻依存を決定論的に検証。
- **プロパティテスト**: fast-check で任意操作列の不変条件（`rotation.length === driverCounts.length`、
  `currentIndex` 妥当性、clock/session 整合）を検証（FR-008 / SC-010）。
- **同期/結合**: full snapshot の冪等置き換え、resume、ホスト委譲、代表生成の再委譲→縮退。
- **外部ブラックボックス検証**: 起動済みサーバーへ WS で接続するシナリオ検証、実ブラウザ（Playwright）
  での UI 検証を実施済み。

## 非機能・セキュリティの要点

- **境界検証**: 全 WS メッセージを Valibot で一度だけ検証（未知 type・過大・不正を即拒否）。
- **XSS**: React 既定エスケープ。AI/ユーザー由来テキストへ `dangerouslySetInnerHTML` 不使用。
- **秘密ゼロ**: AI 鍵はクライアントのみ。サーバー送信・ログ出力をしない。
- **WSS / Origin**: 本番は Caddy で WSS 強制・許可 Origin 検証（`ALLOWED_ORIGINS`）。
- **可用性**: 状態揮発・再起動安全。

## 未実装・将来枠（M4 以降）

実装範囲は M0〜M3 です。以下は計画済みだが本実装に含みません（[tasks.md](../../docs/plans/tdd-mob-pro-timer/tasks.md) 参照）:

- 資源上限（IP あたり同時接続・ルーム総数・アイドル回収・レート制限）
- サーバー側セッション喪失時の「セッション終了」明示（FR-020）
- PWA・managed/subscription Provider・チーム横断の永続記録ストア
