# ADR-0005: 境界の型安全と関数型中心（Result 型のエラー処理と Valibot 境界検証）

- **ステータス**: Accepted（2026-08-10）
- **関連**: [#68](https://github.com/tomohiroJin/tasuki-tools/issues/68)（規範とアーキテクチャの確立、
  親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）/
  `docs/timer/adr/0006`（本 ADR の昇格元）/
  `docs/constitution.md` 原則 IV（境界の型安全）/
  `packages/poker-core/src/protocol.ts:1`（契約の単一情報源の実例）

## 背景

Tasuki には現在 timer と poker の 2 系統のドメイン（`packages/timer-core` /
`packages/poker-core`）と、それぞれの同期サーバー（`apps/timer-sync` /
`apps/poker-sync`）がある。どちらも WebSocket 越しの外部入力を受け取り、
ドメイン側は多くの拒否条件（人数上限、フェーズ競合、権限不足など）を持つ。
例外で表現すると起こり得るエラーが型に現れず、握り漏れが起きる。

`docs/timer/adr/0006` は timer の実装でこの問題に対し、外部入力は **Valibot**
で境界検証し、ドメイン操作の失敗は **neverthrow** の `Result` 型で表現する、
という決定を先に下していた。実際に数えると、この決定は timer に留まらず
プロジェクト全体へすでに広がっている。

- `neverthrow` を依存に持つパッケージ/アプリは **6**（`packages/protocol`,
  `packages/timer-core`, `packages/poker-core`, `apps/timer-web`,
  `apps/timer-sync`, `apps/poker-sync`。各 `package.json` の `dependencies` を
  実際に grep して確認）
- `valibot` を依存に持つパッケージ/アプリは **5**（`packages/protocol`,
  `packages/timer-core`, `packages/poker-core`, `apps/timer-web`,
  `apps/timer-sync`。同様に実測）
- `packages/poker-core/src/protocol.ts:1` は
  `// WS メッセージプロトコル（contracts/ws-protocol.md の実装。契約の単一情報源）` /
  `// 境界での検証は Valibot、結果は neverthrow の Result（憲法原則 IV）` という
  コメントをすでに持ち、poker 側もこの決定を前提に実装されている

つまりこの決定は「timer だけの選択」ではなく、すでに事実上プロジェクト全体の
規約として運用されている。憲法（`docs/constitution.md`）原則 IV
「境界の型安全」はこれを条文化したが、条文だけでは根拠が残らない。本 ADR は
その根拠を記録し、timer 固有の決定を全体標準へ正式に昇格する。

## 決定

**外部入力は Valibot、ドメイン操作は neverthrow の `Result`、ドメインは例外を
投げない、をプロジェクト全体の標準とする。** 新規・既存を問わず、
すべてのパッケージ・アプリがこれに従う。

- 外部からの入力（WebSocket メッセージ等）は、境界で **Valibot** スキーマに
  よる検証を必ず通す（MUST）。未知 type・過大サイズ・不正形式は境界で拒否する。
- ドメイン操作の失敗は **neverthrow** の `Result<T, E>` で表現する（MUST）。
  ドメイン層は例外を制御フローとして使用しない（MUST NOT）。
- 契約（WS プロトコル・スキーマ等）には単一の情報源を宣言する（MUST）。
  `packages/poker-core/src/protocol.ts:1` のように、実装ファイルの先頭で
  何を実装したものかを明記する。
- 契約による設計（DbC）としては「事前条件 = 境界検証・不変条件 = 型」で表す。

**timer 固有の詳細（表示名の境界正規化、NFKC 変換前後の二重長さ制限、
AI 出力の `validateProblem` 検証など）は、本 ADR では扱わない。** 
それらは引き続き `docs/timer/adr/0006` が正本として持つ。本 ADR は
「Valibot による境界検証・neverthrow による Result・例外を投げないドメイン」
という決定そのものを全体標準として宣言するに留める。

## 影響

- 本決定は `docs/constitution.md` 原則 IV「境界の型安全」の根拠を
  記録するものである。
- 既存の 6/5 パッケージはすでにこの標準に従っており、本 ADR による変更は無い。
  今後新設するパッケージ・アプリ（poker-sync の再編を扱う #72 など）もこの
  標準に従う。
- **本 ADR の時点ではコード（`apps/` `packages/` `e2e/` `scripts/`）を
  変更しない。** 実測は grep による確認のみで、実装・テストへの変更は伴わない。

## 追記（2026-08-30・#181）— 検証は両方向に要る

**上の MUST（「外部からの入力（WebSocket メッセージ等）は、境界で Valibot スキーマに
よる検証を必ず通す」）は、timer では片方向しか守られていなかった。**

実測（2026-08-30・main `d5ffe58`）:

- `packages/timer-core/src/schemas.ts` の `ServerMsgSchema` を参照する**製品コードは 0 件**
  だった。参照していたのはテストと構造監査の例外表だけである
- 受信側 `apps/timer-web/src/sync/dispatch.ts` は `JSON.parse(raw) as ServerMsg` の
  **型アサーションのみ**で、防いでいたのは `JSON.parse` の例外だけだった。
  **JSON として読めることと、契約を満たすことは別である**
- 送信側 `apps/timer-sync/src/adapters/ws-adapter.ts` の `send` / `broadcast` は
  `data: unknown` で、`broadcastSnapshot` とエラーフレーム 3 経路は型注釈を通らなかった
- 逆方向（クライアント → サーバー）は `parseBoundaryMessage(CommandSchema, ...)` を
  通しており、**成立していたのは片方向だけ**だった

**決定は変えない。実装を規範へ合わせた。**

- **受信側に実行時の門番を置く**（MUST）。`dispatchServerMessage` は
  `v.safeParse(ServerMsgSchema, ...)` を通し、落ちたフレームは画面へ渡さない。
  **黙って捨てるのではなく、捨てたことは `onInvalidFrame` で外へ知らせる**（下記）
- **送信側は型で塞ぐ**（MUST）。`WsAdapter.send` / `broadcast` は `ServerMsg` を受ける。
  `broadcaster` を経由できない 3 経路（`MESSAGE_TOO_LARGE` / `INVALID_JSON`・
  `INVALID_COMMAND` / `INTERNAL_ERROR`）は `sendFrame(ws, msg: ServerMsg)` を通す。

  **「型で塞ぐ」の射程を取り違えないこと。** TypeScript の型が止めるのは、
  未知のキー・キー名の誤り・`type` のリテラル違い・必須項目の欠落・粗い型の不一致
  までである。**スキーマの絞り込み（`minLength` / `maxLength` など）は型では表せない。**
  該当するのは `Problem` の `title` / `description` / `exampleTest`、
  `SessionConfig` の `members`、`CompletionRecord` の各項目などで、
  **`tsc` を通ったフレームが受信側で落ちうる非対称が残る**（送信側は実行時検証 0、
  受信側は全検証）。この残余の帰結は下記「残っているリスク」に書く。

  **もう 1 つ、書き方によっても抜ける。** 余剰キーを止めているのは
  TypeScript の余剰プロパティ検査で、これは**その場で書いたオブジェクトリテラル
  にしか効かない**。変数に組み立ててから渡すと素通りする（実測。
  `sendFrame({ …, errorCode: "x" })` は TS2353 だが、
  `const m = { …, nonsense: 1 }; sendFrame(m)` は exit 0）。
  **フレームを作るヘルパを挟んだ時点でこの MUST の根拠は静かに消える**ので、
  送信箇所ではその場のリテラルを渡すこと
- **送信側は実行時検証にしない**（MUST NOT）。「契約から外れたので送らない」経路を
  本番に新設すると、**形が少し違うフレームが届くより、何も届かないほうが利用者には悪い**。
  送信側は型で止め、実行時の門番は受信側に一本化する

**揃うのは方針であって、配管ではない。** `apps/poker-web` は
`packages/poker-core` の `parseServerMessage`（→ `@tasuki/protocol` の
`parseBoundaryMessage`）を経由するが、timer は `dispatch.ts` の中で
`JSON.parse` と `v.safeParse` を直に呼ぶ。**「受信側の境界で契約に通す」という
決定は同じで、そこへ至る道具が違う。** timer 側も core に
`parseServerMessage` を置いて揃える案はあるが、`packages/timer-core` に
`@tasuki/protocol` 依存を足す変更になるため #181 では採らなかった。

**検査**（いずれも壊して赤を確認済み）:

| 守るもの | 検査 | 壊し方と結果 |
|---|---|---|
| 受信側の実行時検証 | `apps/timer-web/test/sync/dispatch.test.ts` | `safeParse` を型アサーションへ戻す → 2 件が赤 |
| 捨てたことの観測 | 同上 | `onInvalidFrame` の呼び出しを削る／経路ではなく値を渡す → いずれも赤 |
| 形そのものが違うフレームの診断 | 同上 | 根で落ちたときの `<root>` を外して空配列に戻す → 3 件が赤 |
| 送信側の型 | `tsc --noEmit` | `broadcastSnapshot` のキーを `roomData` にする → TS2353 |
| 同上 | `tsc --noEmit` | エラーフレームのキーを `errorCode` にする → TS2353 |

**対照**: `send` / `broadcast` / `sendFrame` を `unknown` へ戻すと、同じ契約違反が
`tsc` を **exit 0 で素通り**する。型注釈が仕事をしていることの裏づけである。

**副次的に分かったこと**:

- 構造監査の SC-039③ 例外表から `ServerMsgSchema` を外した。製品コードが参照するように
  なったため、**監査自身が「例外が不要になりました」と落とした**
- timer-web のフィクスチャ 6 箇所が `exampleTest: ""` を送っており、`ProblemSchema` の
  最小長 1 を満たしていなかった。**実サーバーが作れない形をテストが流していた**ことになる。
  **検証を入れた 2026-08-30 に 47 件が一斉に赤になって初めて露見した**
  （件数はその日の値で、以後は動く。ここでは「一斉に赤になった」という出来事の記録である）

**残っているリスク（#209 として切り出した）**:

**`error` や `signal` を 1 通捨てるのは一過性だが、`snapshot` を捨てる状況はほぼ必ず
継続する。** 契約に合わない値はサーバー側のルームに残り続けるため、以後すべての
`snapshot` が捨てられ、**画面は生きて見えたまま古い状態で固まる**。

具体的な経路: `apps/timer-sync/src/application/handlers.ts` の `rotationDisplayNames()` は
対応する参加者が居ない ID に空文字を返し、その値は `config.members` に載る。
`SessionConfigSchema.members` の要素は `displayNameStr`（`minLength(1)`）なので落ちる。

**現時点でこの状態へ至る経路は見つかっていない。** 根拠は `rotation` に在室しない ID が
残りうる 4 経路を追ったことで、**テストが緑だったことではない**（全件が緑なのは
「テストが通る経路では作れなかった」ことしか示さない）。追った 4 経路:

- `member.add` — `handlers.ts` が在室を確かめてから足す（`PARTICIPANT_NOT_FOUND`）
- `config.set` — `build-domain-command.ts` が `members` を落とす（wire から直接は書けない）
- `member.remove` / `participant.remove` — どちらも `rotation.length <= 1` を守る

ただし**失敗の質は変わった** —— 本 ADR の変更以前は「名前欄が空で表示される」だけだった。

暫定の手当てとして、捨てたことを `onInvalidFrame(paths)` で外へ知らせる。渡すのは
**落ちた項目の経路だけ**（例: `room.config.members.0`）で、落ちた値は渡さない。

**出力先は `dispatch.ts` が決めない。** 同ファイルはブラウザに依存しない純関数として
単体テストに載っており、直接の `console` は ADR 0012 D1 が禁じている（実測: 置いたら
`scripts/audit-log-hygiene.mjs` が落ちた）。`SyncClient` を通して
`apps/timer-web/src/sync/use-timer-sync.ts`（ログ衛生の `ALLOWED_FILES`）まで運び、
そこだけが `console.warn` を呼ぶ。

**開発者は気づけるが利用者は気づけない**ので、利用者への表出は
[#209](https://github.com/tomohiroJin/tasuki-tools/issues/209) で扱う。
