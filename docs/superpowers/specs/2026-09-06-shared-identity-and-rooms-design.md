# 参加者とルームを Tasuki 全体で共通化する（#95）— 設計正本

- **Issue**: [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95)（epic / proposal）
- **日付**: 2026-09-06
- **実測時点**: main `caeb289`
- **前提となる規範**: [`docs/constitution.md`](../../constitution.md) 原則 III（揮発インメモリ）/
  IV（境界の型安全）/ VI（依存は内向き）/ VII（検査は壊して確かめる）/ VIII（記録が正本）/
  IX（小さく回す）/ X（抽象は実需で）
- **前提となる ADR**: [`docs/adr/0007`](../../adr/0007-abstraction-criteria.md)（抽象の導入基準）/
  [`docs/adr/0015`](../../adr/0015-web-layer-structure.md)（web 層の 3 責務）/
  [`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（ドメインの表現は選択制）/
  [`docs/timer/adr/0007`](../../timer/adr/0007-volatile-in-memory-state.md)（揮発インメモリ状態）
- **番号の注意**: **`docs/adr/0007`（抽象の導入基準）と `docs/timer/adr/0007`（揮発インメモリ状態）は
  別の文書である。** 本文書では番号だけで指さず、必ずパスで書く
- **この文書の位置づけ**: **実測値・決定の正本はこの文書**。Issue 本文・PR・子 Issue へ
  表を転記せず、ここを参照する。

## 1. 範囲

#95 が掲げる「一度名乗れば持ち歩ける」を、**利用者の経路として成立させるところまで**扱う。

利用者から見た完成形は次の 4 つである。

1. 主催者は LP でルーム名と自分の名前を入れて新しいルームを作る
2. ルームができると**選択画面**が出る。そこにはツールの札・ルーム名・参加者一覧・参加用 URL が並ぶ
3. 参加者は参加用 URL から入り、名乗ると同じ選択画面に着く。**主催者と参加者に差は無い**
4. ツールを選ぶと今まで通り使える。**選択画面へ戻って別のツールへ移れる**

### 本 Issue で扱わないもの

- 通知・音・見た目の設定の共通化（決定 D13）
- ルームの永続化。揮発インメモリ（原則 III・`docs/timer/adr/0007`）は維持する
- 単一 SPA シェルへの統合。3 アプリのまま全ページ遷移で繋ぐ
- アプリケーション層のパッケージ化（`packages/*-app`）。実需が出るまで行わない

## 2. Issue #95 本文との差異

本文の実測時点は 2026-08-09 / main `ecd1652` で、1 か月古い。

**骨格の主張 6 点は 2026-09-06 時点でも成立していた。**
`packages/protocol/src/` が 2 ファイルであること、`index.ts` の再輸出が 3 記号であること、
`Participant` が `timer-core/src/aggregate.ts` と `poker-core/src/room.ts` に二重定義
されていること、`NAME_MAX_LENGTH = 24`、`display-name.ts` の存在、救済断片
`deploy/timer/caddy/40-timer-legacy-room.conf` の存在。いずれも実在した。

一方、**本文が列挙する「実装時に決めること」8 件のうち 6 件は、本文が想定していない
形で決着した**。詳細は §4 の決定表を参照。

本文に無く、着手時に見つかった事実が 3 つある（§3.4 / §3.5 / §3.6）。

## 3. 実測した事実（2026-09-06・main `caeb289`）

### 3.1 配信の構成

3 アプリは**同一オリジンの別パス**で配信されている（`/` = landing、`/timer/`、`/poker/`）。
`localStorage` は既に 3 アプリで共有されている。同一性を端末に持ち回ることは、
新しい機構を要しない。

同期サーバーは 2 本（timer `:8787` = `/timer/ws`、poker `:3311` = `/poker/ws`）。

### 3.2 timer-core では集約の分離が半分できている

`Aggregate = { session, clock }` は**セッションの集約**であり、参加者を持たない。
参加者を抱えているのは `Room` の方である。つまり timer-core の内部には既に
「セッション」と「メンバーシップ」の境界線が引かれている。

`decide` → `DomainEvent[]` → `evolve` の Decider パターンで実装されている。

### 3.3 poker-core は名簿と密結合している

`round.ts` の `castVote` / `shouldAutoReveal` / `requireHost` は、いずれも `Room` 全体
（参加者名簿込み）を引数に取る。投票ラウンドという概念が名簿から独立していない。

### 3.4 systemd ユニットは既に汎用名である

`deploy/timer/app.env` の `SERVICE=tasuki-sync`。ポート 8787、`APP_DIR=/opt/tasuki`、
`ENV_FILE=tasuki-sync.env`。**統合しても稼働ユニットの改名は発生しない。**
同ファイルには「稼働ユニットの改名は行わない」という決定が記録されている。

### 3.5 旧救済断片が新しい参加用 URL と衝突する

`deploy/timer/caddy/40-timer-legacy-room.conf` は「`/` かつ `?room=` が付いていたら
`/timer/` へ 301」する。これは本設計の参加用 URL `/?room=CODE` と**完全に同じ形**である。
放置すると新しい招待リンクが全部タイマーへ飛ばされ、選択画面に到達できない。

### 3.6 依存の向きを見る検査が無い

`scripts/*.mjs` の非テスト 14 本すべてを調べた結果、**パッケージ間の依存方向を見る検査は 1 つも無い**。
原則 VI「依存は内向き」は MUST でありながら、機械的な守りを持っていない。

紛らわしい隣接物が 2 つあるので区別しておく。

- `audit-web-sync-boundary.mjs` は **1 つの web アプリ内のファイル単位の import 許可リスト**
  （同期クライアントを import してよいファイルはどれか）であり、パッケージ間の方向は見ない
- `audit-assembly-wiring.mjs` は**組み立ての集約**（エントリが `create-sync-server` を
  経由すること）を見るもので、これも方向の検査ではない

### 3.7 影響範囲の実測

| 対象 | 件数 |
|---|---|
| 全テストファイル | 267 |
| 役割・ホストに触れるテストファイル | 96 |
| ── `apps/timer-web` | 45 |
| ── `apps/timer-sync` | 34 |
| ── `packages/timer-core` | 7 |
| ── `packages/poker-core` / `apps/poker-sync` / `apps/poker-web` | 各 3 |
| ── `e2e` | 1 |
| `Participant` に触れる非テストファイル | 44 |

判定に用いた正規表現は `\brole\b|isHost|hostParticipantId|"host"|hostToken|host\.transfer|role\.set`。
`location.host` を巻き込む素朴な `host` 検索では 143 本になり、**約 1.5 倍に膨らむ**。

### 3.8 両同期サーバーは Bun で揃っている

`apps/timer-sync` は `bun test`、`apps/poker-sync` も `bun test --timeout 15000`。
どちらも `bun run src/server.ts` で起動する。**ランナーの差は統合の障害にならない。**

### 3.9 `docs/timer/adr/0007` は自動委譲を明記している

同 ADR 本文（21〜22 行目）に「参加者は安定 ID（participantId）と接続 ID（connId）を分離し、
復帰トークンで再接続後も同一参加者・同一役割として扱う（FR-019）。**主催者が猶予 30 秒を
超えて不在なら最古のオンライン編集者へ自動委譲**（FR-018）」とある。

Issue 本文の記述はここについて正確だった。D5 はこの記述の改定を伴う。

### 3.10 `audit-web-sync-boundary.mjs` は `apps/landing` を見ていない

同スクリプトは走査対象を **`apps/*-web/package.json` から導出**している。
`apps/landing` はこの形に一致しないため、**LP が同期クライアントになっても検査の対象外の
まま**になる。スクリプト自身のコメントは「新設した web アプリ（例: `apps/admin-web`）が
宣言に載らないまま」という失敗を想定しているが、想定しているのは `-web` で終わる名前だけである。

同じ理由で `docs/adr/0015`（web 層の 3 責務）の適用範囲も **`apps/*-web`** と書かれており、
`apps/landing` を含まない。**規範の対象外で同期フックを持つアプリが 1 つできる。**

これは #135 が扱った「走査対象の健全性」（`docs/adr/0014`）と同じ機序である。

### 3.11 `audit-log-hygiene.mjs` は workspace の実体と全単射で照合する

`SCANNED_PACKAGES` は `apps/landing` を**既に含んでいる**。ハードコード配列をやめて
workspace の実体と突き合わせる形（#135 経路⑪）になっているため、**パッケージを足すか
名前を変えると、対象表を更新するまで検査が落ちる**。これは望ましい挙動であり、
本作業では段階 1・2・4 で必ず踏む。

### 3.12 上限とレート制限は 2 プロセスに分かれて効いている

`apps/timer-sync/src/config.ts` と `apps/poker-sync/src/config.ts` は、**どちらも独立に**
`MAX_CONNECTIONS`（既定 200）と `MAX_ROOMS`（既定 50）を持つ。現在の本番は 2 プロセスなので、
実効枠は合計 400 接続 / 100 ルームである。

`deploy/timer/env.example` は両方を有効な値として持ち、`deploy/poker/env.example` は
両方をコメントアウトしている（poker は `config.ts` の既定値 200 / 50 で動く）。

`@tasuki/rate-limit` も両サーバーがそれぞれのインスタンスを持つ。同一 IP の攻撃者は
現在 2 つのバケツを別々に消費できる。

**統合するとどちらも 1 つになる**（D9 の帰結）。値を据え置くと実効枠が半減し、
poker の接続が timer の枠を食う。レート制限は逆に厳しくなる（サービス全体で 1 IP 1 バケツ）。
#103 が値を決めた前提が変わるため、段階 6 で見直す（D22）。

### 3.13 参加者は明示的な退出でしか名簿から消えない

切断しても参加者は `presence: "offline"` のまま名簿に残り続ける。名簿から消える経路は
`participant.remove`（明示的な退出）だけである。`room-reclaimer` は**ルーム単位**で、
「全参加者が offline のまま TTL を超えた」ときにルームごと削除する。

猶予 30 秒（`presence.ts` の `HOST_ABSENCE_GRACE_MS` / `DRIVER_ABSENCE_GRACE_MS`）は
**ホスト委譲とドライバー繰り上げのためのもの**であり、名簿からの除去ではない。

**この事実が D12 の判断を変える。** タブを閉じたり別タブで開いたりするたびに新しい参加者が
増え、古い参加者は残り続ける。**幽霊が選択画面の参加者一覧に溜まる。**

### 3.14 ストレージの規範は `localStorage` と `sessionStorage` を区別しない

`docs/plans/resume-token-wiring/spec.md` の **FR-006** は「`resumeToken` は `sessionStorage`
に保持しなければならない（`localStorage` は用いない）」という MUST であり、その非機能要件は
根拠として `.claude/rules/security.md` を挙げている。

実測すると、

- **このリポジトリに `.claude/` の追跡ファイルは 0 件**で、`.claude/rules/` は存在しない。
  当該ルールは作業環境（claym ワークスペース）側のものである
- そのルールは **「localStorage / sessionStorage」を 1 つの節で扱い、「機密情報（トークン・
  パスワード等）の保存禁止」と両者を同列に禁じている**
- リポジトリ側の規範（`docs/guides/security.md`・17KB）には **`localStorage` /
  `sessionStorage` / ストレージ の語が 1 件も無い**

つまり**このルールは 2 つのストレージを区別する根拠にならない**。区別の根拠は FR-006 の
非機能要件が挙げるもう一方の理由 —— 「別タブで開いた同名参加者が誤って乗っ取る」 —— だけである。
なお `apps/poker-web/src/storage.ts` は participant token を `localStorage` に保存しており、
同じルールの下で既に別の判断が動いている。

## 4. 決定

### D1: 文脈を 3 つに割る。共有カーネルを作らない

「`Participant` が 2 箇所で定義されている」は症状であり、原因は**境界づけられた文脈が
切られていない**ことである。timer と poker はそれぞれ独立した文脈でありながら、
どちらも「メンバーシップ」という第三の文脈を各自で抱え込んでいる。

型を 1 つにまとめる共有カーネルを作ると、早晩「両方のツールが必要とするもの置き場」に
腐る。共通化するのは型ではなく、**文脈そのものを 1 つ立てて上流に置くこと**である。

```
        packages/room-core          メンバーシップ文脈（上流・純粋）
        ┌─────────┴─────────┐
  packages/timer-core   packages/poker-core   ツール文脈（下流・純粋）
        └─────────┬─────────┘
            apps/tasuki-sync        合成ルート
```

### D2: ツールのコアは room-core に依存しない

`ParticipantId` は不透明な文字列として受け取る。依存させれば型安全は上がるが、
下流が上流に縛られ、ツール単体で完結する性質を失う。つなぐのはアプリケーション層の責務。

### D3: 文脈間の整合は明示的なユースケースで合成する

イベントバスを入れない。購読者 2 つで導入するのは原則 X に反する。
合成が 1 関数に集まっていれば「ツールを足すときに触る場所は 1 箇所」という目的は
同じだけ果たせる。

### D4: 名簿は 1 つ。表示はツール別

ルームの名簿が唯一の正本（同じ人・同じ名前・同じ ID）。ただし各ツールの画面には
**そのツールを開いている人だけ**を出す。poker で未投票が永遠に埋まらない、timer の
ローテーションに不在者が並ぶ、といった破綻を避ける。

### D5: 役割とホストを廃止する

ルームに居る全員が完全に同格になる。廃止対象は `Role` 型・`permissions.ts`・
`participants.ts`（「編集者以上が 1 名以上残る」不変条件）・`role.set`・`host.transfer`・
poker の `isHost`・`docs/timer/adr/0007` のホスト自動委譲。

timer で主催者が効いていたのは**開始前だけ**（`HOST_ONLY_BEFORE_START` の 13 コマンド）で、
開始後は既に全員同格である（FR-063）。したがって廃止は FR-066（開始前の主催者主導）の
撤廃を意味する。合言葉の設定（`room.passphrase.set`）も全員が行えるようになる。

**この決定は既存の振る舞いを変える。** `docs/timer/adr/0007` の改定と、timer の要求（FR-063〜073 系）の
改定を伴う。

### D6: 代理参加者はローテーション上のエントリにする

ブラウザを持たない代理参加者は D4 と衝突する（「そのツールを開いている人」に永遠に
該当しない）。代理は同一性も接続も持たずルームに名乗り出られないので、**メンバーシップ
文脈の住人ではない**。timer 文脈の中だけの概念にする。

```ts
type RotationEntry =
  | { kind: "member"; participantId: ParticipantId; eligible: boolean }
  | { kind: "proxy"; label: string; eligible: boolean };
```

代理に対する操作（追加・見送り・復帰・並べ替え・削除・ドライバーとして回る）は
**すべてローテーション操作なので残る**。`driverEligible` は今も参加者の属性というより
ローテーションの属性であり（`decide` は参加者ではなく `ineligible: ReadonlySet<number>` を
受け取る）、型の上で正直にするだけである。

副次的に `handlers.ts:893` の例外 —— 「オフラインの人は自動で見送る。ただし代理は常に
オフラインなので除外する」（`p.isPlaceholder !== true`）—— が**不要になる**。
オフライン自動見送りは `kind: "member"` のエントリにしか適用しようがないため。

**代理はハブの参加者一覧にも、timer の参加者一覧にも出ない。出るのはローテーションだけである。**
timer の画面には「そのツールに在席している参加者の一覧」（D4）と「ドライバーのローテーション」の
2 つが並ぶ。代理は後者にのみ現れる。この 2 つを 1 つの一覧として実装してはならない
（実装すると D4 と D6 のどちらかが必ず壊れる）。

### D7: 入口を LP に一本化する

ルーム作成と名乗りの場所を 1 つにする。`apps/timer-web` の `Setup.tsx` / `Join.tsx` と
`apps/poker-web` の `TopPage.tsx` / `NameForm.tsx` は廃止する。ルームコード無しで
`/timer/` や `/poker/` を開いた場合は `/` へ送る。

### D8: ツール状態はルームに属し、離脱で消えない

全員が選択画面に戻ってもタイマーは走り続け、戻れば続きから。poker の投票も保たれる。
「戻る」が安全な操作になる。ルーム自体の寿命は `docs/timer/adr/0007` のまま（全員切断から一定時間で消滅）。

ツール状態は `enterTool` の初回で遅延生成する。ルーム作成時には作らない。

### D9: 合成ルートは `apps/tasuki-sync`。`apps/poker-sync` を退役させる

`apps/timer-sync` をリポジトリ内で改名して合成ルートにする。逆向き（poker-sync を土台に
する）を採らないのは、timer-sync 側にレート制限ゲート・ルーム数上限・room-reclaimer・
ログ衛生・合言葉・resume トークン・admin が既にあり、統合サーバーにそのまま要るためである。

§3.4 のとおり本番の systemd ユニット名・ポート・`APP_DIR` は変わらない。

### D10: WebSocket の入口を `/ws` に一本化する

3 アプリすべてが同じ入口に繋ぐ。`sync-url.ts` にある「ルート直下の `/ws` に繋いでは
いけない」というコメントは、**その断片が存在しないから**であった。Caddy はマッチャの
具体性で並べるため、`handle /ws` を置けば包括フォールバックより先に評価される。
包括フォールバックは 1 本のままなので `apps/landing/tests/caddy-fragment-order.test.ts` の
不変条件は壊れない。

移行中（段階 2〜5）は `/ws`・`/timer/ws`・`/poker/ws` の 3 つを受け、段階 6 で `/ws` だけにする。

### D11: 参加用 URL は `/?room=CODE`。旧救済断片を撤去する

§3.5 の衝突を解く。旧救済断片が救うのは 2026-08-05 以前に配られた `/?room=CODE` 形式の
リンクだが、**ルームは揮発インメモリでその頃のルームはとうに存在しない**。開いても
「ルームが見つからない」に着地する。実質的な価値はほぼ残っていない一方、放置すると
新しい招待リンクが機能しない。

poker の `/poker/room/<id>` というパス方式も `?room=` に揃える。ルームコードには日本語が
入りうる（`朝会モブ-a1b2`）ため、クエリの方が符号化を既存の `buildRoomUrl` に任せられる。

| 経路 | URL |
|---|---|
| 参加用 URL（配るもの） | `/?room=CODE` |
| タイマー | `/timer/?room=CODE` |
| ポーカー | `/poker/?room=CODE` |
| 選択画面へ戻る | `/?room=CODE` |

### D12: 同一性は 2 つに分ける

- **復帰の組（`participantId` / `resumeToken` / 表示名）はサーバー発行・`localStorage` に
  ルームコード別で保存する。** poker が現在採っている形（`apps/poker-web/src/storage.ts`）に揃える
- **表示名は加えてルーム非依存の既定値としても `localStorage` に置く。** 次に別のルームへ
  入るときの初期値に使う

**`sessionStorage` を採らない。FR-006 を撤廃する。** これは §3.13 の実測から導かれた変更で、
当初は FR-006 のまま（`sessionStorage`）で設計していた。

理由は 3 つある。

1. **幽霊が溜まる。** §3.13 のとおり、切断した参加者は名簿に残り続ける。`sessionStorage` だと
   タブを閉じて参加用 URL を開き直すたびに**別人として join し、前の自分が残る**。
   選択画面の参加者一覧は #95 の中心的な成果物であり、そこが幽霊で埋まるのは受け入れられない
2. **FR-006 の根拠のうち規範側は成立しない。** §3.14 のとおり、引かれているルールは 2 つの
   ストレージを同列に禁じており、区別の根拠にならない。残る根拠は「別タブの同名参加者に
   よる誤った乗っ取り」だが、**ルームコード別に鍵を分けたサーバー発行トークン**では、
   復帰できるのは同じブラウザプロファイルの同じルームだけであり、それは同一人物である
3. **poker の既存挙動が実地の証拠になる。** poker は公開以来この形で動いており、
   本設計で `sessionStorage` を選ぶと poker 利用者にとっては後退になる

**残る幽霊の経路**: 別のブラウザ・別プロファイル・ストレージを消した場合は復帰できず、
新しい参加者になる。この場合は前の自分が名簿に残る。**役割を廃止した（D5）ため
`participant.remove` は全員が実行でき**、選択画面から手で片付けられる。
自動退去（無接続が一定時間続いたら名簿から外す）は**入れない** —— ローテーションの
持ち順を失わせるうえ、この経路の頻度に見合わない。

**データ分類（原則 XI が MUST とする判断）。** `docs/adr/0011` 決定 1 の表で、表示名は
分類**「個人に紐づく」**（扱い: 揮発のみ・ログへ出さない）に当たる。

- **表示名の `localStorage` 保存は、この「揮発のみ」に抵触しない。** 同表の扱いは
  **サーバーが保持する共有状態**についての規範であり（原則 III が「クライアント側の
  ローカル保存はこの限りではない」と明示している）、端末内に留まり他者へ配信されない。
  **`apps/poker-web/src/storage.ts` が既に表示名を `localStorage` に保存している**という
  前例もある。ただし本 ADR の表がこの区別を明示していないため、**ADR-0011 に「分類は
  サーバー保持を対象とする」旨の明確化を加える**（§9）
- **在席（誰がいまどのツールを見ているか）の全員配信は新しい出力**である。
  分類は**「個人に紐づく」**とする。扱いは表示名と同じく
  「揮発のみ・ログへ出さない・ルーム内へは配信する」（`docs/adr/0011` 決定 3 と同じ形）
- `resumeToken` は分類**「資格情報」**。既存の扱い（ログへ出さない・自分の分だけ返す・
  定数時間比較）を変えない

### D13: 設定（通知・音）の共通化は見送る

poker には通知も音も無く、共通化すべき実体がまだ 1 つしかない（原則 X）。
2 つ目のツールが設定を持った時点（#91 / #94 が候補）で切り出す。

### D14: 在席は接続に紐づける。参加者は接続を複数持てる

画面遷移は全ページ読み込みで WS が張り直しになるため、**接続時にどのツールに居るかを
宣言する**（`room.join { code, resumeToken?, tool }`）。追加の退出コマンドなしに D4 の
表示規則が成立する。

**遷移中に部屋から落ちることはない。** §3.13 のとおり、切断は在室そのものを終わらせない
（名簿から消えるのは明示的な退出だけ）。当初ここに「30 秒の猶予が守る」と書いていたが、
あの猶予はホスト委譲とドライバー繰り上げのためのもので、在室の保護ではない。

**在席は参加者ではなく接続に属するので、参加者は接続を複数持てる。**
D12 で復帰の組を `localStorage` に置いた結果、**選択画面とツールを別々のタブで開いた同一人物**が
現実的な経路になった（従来は別人として 2 人並んでいた）。参加者が接続を 1 本しか持てない
模型のままだと、後から繋いだタブが前のタブの接続を奪い、前のタブは更新を受け取らなくなる。

```ts
export interface Participant {
  id: ParticipantId;
  displayName: string;
  /** 接続 ID → その接続が宣言しているツール（ハブなら null） */
  connections: ReadonlyMap<ConnId, ToolId | null>;
  joinedAt: number;
}
```

- **在席**（ツール T に居る）= `connections` の値に T があること
- **presence** = `connections` が空でなければ `online`、空なら `offline`
- 接続が 1 本閉じても、他が残っていれば `online` のまま

### D15: `config.members` を廃止する

timer の `config.members` はローテーションの表示名ミラー（D6b）だが、timer-core は
もう名簿を持たないので表示名を解決できない。表示名の解決は DTO 組み立て
（アプリケーション層）の仕事になる。ローテーションの人数制約（2〜10）はミラーではなく
ローテーション自身の長さで判定する。

### D16: スナップショットの DTO はアプリケーション層で組む

選択画面には各ツールの様子（稼働中か・何人居るか）を出したくなる。**これをドメインに
持たせない。** `Room` がツールの状態を知った瞬間に「Room が tools を内包する大きすぎる
集約」に戻る。

名簿は room-core から、ツールの要約は各ツールストアから取り、**合成した結果だけを外へ
出す**。ドメインは互いを知らないままにする。

### D17: 依存の向きを許可リストで機械的に固定する

§3.6 のとおり原則 VI に守りが無い。表に無い依存を拒否する検査を足す。
判定は `package.json` の `dependencies` と `import` 文の**両方**を見る（片方だけだと、
宣言せずに import する経路が抜ける）。

```
room-core    → （workspace 依存なし）
timer-core   → （workspace 依存なし）
poker-core   → （workspace 依存なし）
protocol     → （workspace 依存なし）
rate-limit   → （workspace 依存なし）
ui           → （workspace 依存なし）
sync-client  → protocol
tasuki-sync  → room-core, timer-core, poker-core, protocol, rate-limit
landing      → protocol, sync-client, ui
timer-web    → protocol, sync-client, timer-core, ui
poker-web    → protocol, sync-client, poker-core, ui
```

**この表は本設計の完了時点の目標状態である**（現状は `timer-web` / `poker-web` が
`protocol` に依存していないなど、いくつか差がある）。段階ごとに表を更新しながら進める。

**表は全パッケージ・全アプリを網羅する。** 一部だけを列挙する形にすると、
表に載っていないものが「検査されていない」のか「依存が無い」のか区別できなくなる。

パッケージを足したら表を更新するまで赤になる。**それが望む挙動である** —— 新しい
パッケージの依存方向は決定であって、黙って通してよいものではない。

### D18: 同期クライアントの接続部分を `packages/sync-client` へ切り出す

timer-web（`sync/backoff.ts` / `join-retry.ts`）と poker-web（`join-retry.ts` /
`join-retry-plan.ts` / `connection-notice.ts`）が接続・指数バックオフ・再参加をそれぞれ
独自に実装している。ここに LP が 3 番目の利用者として加わる。呼び出し箇所が 3 つに
なるため原則 X の「1 つしか無いものを抽出しない」に抵触しない。
ツール固有のコマンドと画面状態は各アプリに残す。

### D19: `room-core` は `docs/adr/0016` の「必ず揃える点」に従う

同 ADR の決定 2 は、表現の選択に関わらず次を課す。`room-core` も例外ではない。

1. ドメイン操作の失敗は `Result<T, E>` で表す（MUST）
2. `index.ts` は公開記号を**明示列挙**する。`export *` を使わない（MUST NOT）
3. ドメインエラーは判別子（`type` または `code`）と機械可読な詳細のみを持ち、
   表示文言は文言生成関数が担う（MUST）
4. ドメイン内で `Date.now()` / `Math.random()` を呼ばない（MUST NOT）。時刻・乱数は引数で注入する

表現そのものは**直接遷移関数 ＋ `Result`** を採る。メンバーシップにイベント履歴・再生・
段階適用の要求は無く、`docs/adr/0007`（抽象の導入基準）の基準 3 を満たさないため。
同 ADR の決定 1 は「どちらを採ったかと理由を記録する（MUST）」を課すので、
**この選択を §9 の ADR に明記する**。

### D20: `docs/adr/0015` の適用範囲を `apps/landing` へ広げる

§3.10 の穴を塞ぐ。LP が同期クライアントになる以上、web 層の 3 責務（純粋関数への切り出し・
同期フック 1 本への集約・画面は表示に徹する）は LP にも掛かるべきである。

同時に `scripts/audit-web-sync-boundary.mjs` の走査対象を **`apps/*-web` という名前の形から、
「web アプリであること」を判定できる実体へ**変える。名前の綴りに依存した走査は、
`apps/landing` のように規約から外れた名前が現れた瞬間に静かに空振りする
（`docs/adr/0014`）。

### D21: ローテーションの対象は「在席」で判定する。`presence` では判定しない

`computeIneligibleIndices`（`handlers.ts:887-901`）は、ドライバーの対象外を
`driverEligible === false || (presence === "offline" && !isPlaceholder)` で判定している。

**この判定は統合後に壊れる。** 現在 `presence === "offline"` が「timer を見ていない」と
同義なのは、参加者が持つ接続が timer にしか無いからである。D4（ツール別の表示）と
D8（離れても状態は残る）を入れると、**ハブや poker に居る人はルームに対して `online`** に
なり、**タイマーを見ていない人にドライバーが回る**。

判定を在席へ切り替える。

```
対象外 = eligible === false
       ∨ （kind === "member" かつ その参加者が timer に在席していない）
```

在席は D14 の `connections` から導く（`isPresentIn(p, "timer")`）。

代理（`kind === "proxy"`）は在席の概念を持たないため、常に対象である（D6 のとおり、
現行の `isPlaceholder` 例外はこの形で自然に吸収される）。

**対象者が 0 名になった場合は現在のドライバーを維持する。** これは現行の
「全員 ineligible なら現状維持」（`handlers.ts:224` 付近）と同じ縮退挙動であり、
D8（全員が離れてもタイマーは走り続ける）と整合する。

### D22: 統合に伴い上限とレート制限の値を見直す

§3.12 のとおり、`MAX_CONNECTIONS` / `MAX_ROOMS` の実効枠が半減し、レート制限は 1 IP
1 バケツへ厳しくなる。**値の正本は `deploy/timer/env.example`（上限）と #103 設計正本
（レート制限）であり、本文書は値を転記しない。** 段階 6 で両正本を参照して決める。

`deploy/poker/app.env` は sync を持たなくなるため、**web だけを配る形へ変える**
（`SYNC_ENTRY` / `SERVICE` / `PORT` / `ENV_FILE` が宛先を失う）。

### 決定と Issue 本文「実装時に決めること」の対応

| 本文の項目 | 決定 |
|---|---|
| 1. 共通の自分の範囲 | 表示名のみ（D12・D13） |
| 2. 同一性の保持場所 | 復帰の組はサーバー発行・`localStorage` にルームコード別（D12。FR-006 を撤廃する） |
| 3. ルーム共通化の深さ | 本文の (c)。ただし**ルームがツールを内包する形ではなく**、文脈を割って上流下流にする（D1・D16） |
| 4. sync サーバーの構成 | 1 本に統合（D9） |
| 5. ホストの概念の統一 | **どちらへも寄せず廃止**（D5） |
| 6. ルームの寿命 | `docs/timer/adr/0007` を維持。ツール状態はルームに属する（D8） |
| 7. 共通化した模型の置き場 | 新パッケージ `packages/room-core`（D1）。`protocol` は契約のまま |
| 8. 移行の道筋 | 旧救済断片は撤去する（D11）。段階分割は §7 |

## 5. 設計

### 5.1 `packages/room-core` — メンバーシップ文脈

```ts
export type ParticipantId = string;          // p_xxxx
export type ConnId = string;                 // 接続の識別子。再接続で変わる
export type RoomCode = string;               // slug-8文字（既存の生成規則を踏襲）
export type ToolId = string;                 // 不透明。room-core はツールを知らない

export interface Participant {
  id: ParticipantId;
  displayName: string;                       // normalizeDisplayName 済みの正規形
  /** 接続 ID → その接続が宣言しているツール（ハブなら null）。D14 */
  connections: ReadonlyMap<ConnId, ToolId | null>;
  joinedAt: number;
}

/** 在席・presence は connections から導く。参加者に持たせない（二重定義になるため） */
export function isPresentIn(p: Participant, tool: ToolId): boolean;
export function presenceOf(p: Participant): "online" | "offline";

export interface Room {
  code: RoomCode;
  name: string;
  createdAt: number;
  participants: Participant[];
}
```

`packages/timer-core/src/display-name.ts` を**そのまま移設する**。表示名の正規化（第1層）と
見え方による曖昧判定（第2層）を持つ実質的な値オブジェクトであり、敵対的検証を経た資産である。
poker は現在 `NAME_MAX_LENGTH = 24` しか持たず、なりすまし対策が無い。文脈を上流に立てる
だけで**poker がこの防御を無償で得る**。

`ToolId` を不透明にするのは、ツールを増やすときに room-core を触らせないためである。
境界での妥当性検証（原則 IV）に要るツール ID の許可リストは `packages/protocol` に置く。
見せ方（名前・要約・意匠・公開パス）は `apps/landing/src/tools.ts` が既に正本なので
そこに残す。**ID の正本は protocol、見せ方の正本は landing** という分担を機械的に固定する
（原則 VIII）。

### 5.2 `packages/timer-core` — モブタイマー文脈

| 残るもの | 消えるもの |
|---|---|
| `config` / `problem` / `session` / `clock` / `phase` / `sessionRecords` / `handoffNote` / `onBreak` | `participants` / `hostParticipantId` |
| `decide` / `evolve` / `events`（Decider はそのまま） | `permissions.ts` / `participants.ts` / `Role` / `role.set` / `host.transfer` |
| `RotationEntry[]` になったローテーション（D6） | `display-name.ts`（room-core へ移設）/ `config.members`（D15） |

### 5.3 `packages/poker-core` — 見積もり文脈

`Room` インターフェースが消え、**`Round` が集約ルートになる**。

```ts
export function castVote(round: Round, voter: ParticipantId, card: Card): Result<Round, RoundError>;
export function reveal(round: Round): Result<Round, RoundError>;
export function shouldAutoReveal(round: Round, presentIds: ReadonlySet<ParticipantId>): boolean;
```

必要な名簿の断片だけを引数で受け取る。`requireHost` は D5 で消える。
`Participant` / `isHost` / `findParticipantByToken` / `markDisconnected` のホスト継承も消える。

### 5.4 アプリケーション層（`apps/tasuki-sync`）

| ユースケース | 合成の内容 |
|---|---|
| `createRoom(roomName, displayName)` | メンバーシップのみ。ツール状態は作らない |
| `joinRoom(code, displayName, resumeToken?)` | メンバーシップのみ |
| `declareTool(connId, toolId \| null)` | その接続が居るツールを宣言する＋そのツールの状態が無ければ生成。`room.join` に含まれる |
| `leaveRoom(participantId)` | 名簿から除く → timer のローテーションから外す → poker の投票を捨てる。**明示的な退出のときだけ**呼ぶ |
| `onDisconnect(connId)` | その接続を `connections` から外す。**残りが 0 本でも名簿からは外さない**（§3.13・D12） |

**`exitTool` は要らない。** 選択画面へ戻る操作は全ページ読み込みで、新しい接続が
`tool: null` を宣言する。D14 のとおり追加の退出コマンドは不要である。
| `handleToolCommand(toolId, ...)` | 該当文脈へ委譲 |

**文脈間の整合は `leaveRoom` と `onDisconnect` に閉じ込める。** ツールを足すときに触るのは
ここだけである。

### 5.5 ポートとアダプタ

各文脈が自分のリポジトリポートを持つ。**単一の巨大ストアにはしない**（D16 と同じ理由）。

```
ports/     RoomStore  TimerStore  PokerStore  Clock  Broadcaster  CodeGen
           RateLimiter  ServerProblemProvider
adapters/  ws-adapter  in-memory-*-store  system-clock  nanoid-code-gen
           claude-cli-problem-provider
```

`Broadcaster` が配信範囲を持つ。D4 はここで実装される。

```ts
sendTo(connId, msg)
broadcastToRoom(code, msg)          // room.snapshot
broadcastToTool(code, toolId, msg)  // timer.snapshot / poker.snapshot
```

### 5.6 エラー処理

原則 IV のまま変えない。境界で Valibot（`packages/protocol`）、ドメインは `Result`、
ユースケースも `Result` を返し、WS ハンドラが `ErrorCode` に落として `sendError` で返す。

### 5.7 画面と経路

LP（`apps/landing`）を同期クライアント化し、URL と参加状態で 3 つに分岐させる。

| URL | 参加状態 | 表示 |
|---|---|---|
| `/` | — | ルーム名＋自分の名前を入れて**作成** |
| `/?room=CODE` | 未参加 | 自分の名前を入れて**参加** |
| `/?room=CODE` | 参加済み | **選択画面**（ツールの札・ルーム名・参加者一覧・参加用 URL） |

選択画面の札は既存の `apps/landing/src/tools.ts` の `TOOLS` をそのまま使い、`href` に
`?room=CODE` を付ける。手札の意匠は変えない。新しいツールを足すときに触るのは、
今と同じくこの 1 ファイルである。

## 6. 検証

### 6.1 EARS

| # | 要求 |
|---|---|
| R1 | 利用者がルーム名と表示名を入力してルームを作成したとき、システムは選択画面を表示し、ルーム名・参加者一覧・参加用 URL を示すこと |
| R2 | 利用者が参加用 URL を開いたとき、システムは表示名の入力を求め、入力後は作成者と同じ選択画面を表示すること |
| R3 | ルームに参加者が加わったとき、システムはそのルームの全参加者へ更新後の名簿を配信すること |
| R4 | 利用者がツールを選択したとき、システムはそのツールの画面を表示し、その接続が当該ツールに在席していると扱うこと |
| R5 | ツールの画面が表示されている間、システムはそのツールに在席している参加者のみを当該ツールの参加者一覧に示すこと |
| R6 | 利用者が選択画面へ戻ったとき、システムは当該ツールの状態を保持したまま、当該利用者を当該ツールの一覧から外すこと |
| R7 | ルームの全参加者がツールから離れている間も、システムはそのツールの状態を保持し続けること |
| R8 | 利用者がルームから退出したとき、システムはその利用者をローテーションから外し、その利用者の投票を破棄すること |
| R9 | 利用者がルームコードを伴わずにツールの URL を開いた場合、システムは選択画面の入口へ誘導すること |
| R10 | ルームの全参加者が切断され猶予時間が経過したならば、システムはルームとそのツール状態を破棄すること |
| R11 | 参加者が接続を失い猶予時間内に復帰トークンを伴って再接続した場合、システムは同じ参加者として同じルームへ復帰させること |
| R12 | ルームに参加する操作が行われるとき、システムは主催者と参加者を区別せず、同一の操作権限を与えること |
| R13 | 表示名が入力されたとき、システムはこれを正規化したうえで保持し、見え方が紛らわしい表示名には識別子を添えて示すこと |
| R14 | ドライバーの対象を決めるとき、システムは当該ツールに在席していない参加者を対象から外すこと |
| R15 | ドライバーの対象者が 1 名も居ないならば、システムは現在のドライバーを維持すること |
| R16 | 同じ端末・同じブラウザで参加用 URL を開き直したとき、システムは同じ参加者として復帰させ、新しい参加者を作らないこと |
| R17 | 1 人の参加者が複数の接続を持つ間、システムはいずれかの接続が生きている限りその参加者を在室として扱うこと |

### 6.2 EARS と検査の対応

完了条件の突合はこの表で行う（主張ではなく手段を固定する）。

| 要求 | 検査 |
|---|---|
| R1 / R2 | E2E（作成 → 選択画面 → 別ブラウザで参加 → 両者の一覧に相手が出る） |
| R3 | アプリケーション層のユースケーステスト＋`Broadcaster` の配信範囲テスト |
| R4 / R5 | E2E（timer に居る人だけが timer の一覧に出る）＋`broadcastToTool` の単体テスト |
| R6 / R7 | E2E（全員が選択画面に戻ってもタイマーが走り続ける） |
| R8 | `leaveRoom` のユースケーステスト（timer と poker 両方への波及を 1 本で検証） |
| R9 | E2E（ルームコード無しで `/timer/` を開くと `/` へ） |
| R10 | room-reclaimer のテスト（ツール状態も破棄されることを含む） |
| R11 | 既存の resume テストを新しい `room.join` へ向け直す |
| R12 | 権限判定の削除を変異検査で確かめる（何を壊しても通る状態になっていないこと） |
| R13 | `room-core` へ移設した `display-name` のテスト（poker からも通ること） |
| R14 | ローテーション適格判定の単体テスト（**ハブに居る `online` の参加者が対象外になること**を明示的に固定する。`offline` だけで判定していると通ってしまうため、`online` かつ timer に在席していない事例を必ず置く） |
| R15 | 同上（全員が離席した状態でドライバーが変わらないこと） |
| R16 | E2E（名乗って参加 → タブを閉じる → 同じ URL を開き直す → **名簿の人数が増えないこと**を数で固定する） |
| R17 | `presenceOf` / `isPresentIn` の単体テスト（2 接続のうち 1 本だけ閉じても `online` のまま） |
| D17 | 依存の向きの検査＋その破壊検証 |
| D19 | `audit-public-surface.mjs`（`export *` の禁止）と `audit-domain-side-effects.mjs`（`Date.now` / `Math.random`）の走査対象に `room-core` が載ること |
| D20 | `audit-web-sync-boundary.mjs` の走査対象に `apps/landing` が載ること。**載らない状態で赤になることを先に確かめる** |

### 6.3 破壊検証（原則 VII）

D17 の検査は、追加したら意図的に壊して赤を確認する。

1. `packages/timer-core` から `room-core` を import する → 赤になること
2. `package.json` にだけ書いて import しない → 赤になること
3. どちらもしない状態で緑になること（対照実行）

### 6.4 変異検査

段階 3a・3b の直後に `node scripts/mutation-check.mjs` を回す（作業ツリーが clean でないと
走らない）。ツールのコアから参加者を抜くと、**既存のテストが「参加者を渡さないので何を
壊しても通る」状態に倒れる**危険がある。`shouldAutoReveal` が典型で、名簿を引数で受け取る
形に変えたあと空集合しか渡さないテストは常に緑になる。

### 6.5 削除するテストの扱い

96 本のうち**消してよいのは、守っていた性質が概念ごと消えたものだけ**である。
`permissions-differential.test.ts` は「層②の権限が失われる回帰」を検出するもので、
役割が無くなればその回帰は起こりえない。一方 `display-name` 系は移設先があるので移す。
PR 本文で 1 本ずつ「消した／移した」と根拠を示す。

### 6.6 E2E

既存タグの語彙は増やさない。判定は文字列一致・`toContain`・否定の空振りを避ける
（通っていないのに緑になる型が過去に実際に出ている）。

- 作成 → 選択画面 → 参加用 URL を別ブラウザで開く → 名乗る → 両者の一覧に相手が出る
- timer を選ぶ → 使う → 選択画面へ戻る → poker を選ぶ → 使う
- timer に居る人だけが timer の一覧に出る（R5）
- 全員が選択画面に戻ってもタイマーが走り続ける（R7）
- ルームコード無しで `/timer/` を開いたら `/` へ送られる（R9）
- 全員が退出したらルームが消える（R10）

### 6.7 実画面検証（原則 V）

段階 4・5 のあと `pnpm dev` の実経路（`http://localhost:5175/`）で全遷移を通す。
ユニットテストはアセットパス・公開パス・SPA フォールバックの食い違いを検出できない。
デプロイ後は本番に対して `pnpm e2e:prod` を流す。

## 7. 段階分割

| # | 内容 | 振る舞い | 検証 |
|---|---|---|---|
| 0 | ADR と子 Issue（文脈分割／役割・ホスト廃止／入口一本化と URL 体系） | 不変 | リンク検査。実装は 1 行も足さない |
| 1 | `packages/room-core` 新設＋`display-name.ts` の移設 | 不変 | 既存テストがそのまま緑 |
| 2 | サーバーを 1 本に寄せる（`apps/timer-sync` → `apps/tasuki-sync`、poker を移設、`apps/poker-sync` 退役） | 不変 | 旧実装を復元して新旧比較 |
| 3a | 役割・ホストの廃止 | **変わる** | 96 本の大半がここで動く。変異検査 |
| 3b | 名簿を 1 つにする（ツールのコアから参加者を抜く。`Round` を集約ルートに。`RotationEntry`） | **変わる** | 文脈ごとの単体＋合成のユースケーステスト。変異検査 |
| 4 | LP のハブ化＋`packages/sync-client` の抽出 | **変わる** | 実画面 |
| 5 | ツール側の入口廃止・戻る導線・`?room=` 統一 | **変わる** | 実画面・全経路 |
| 6 | 配備資材と E2E（Caddy 断片・`app.env`・`deploy.sh`・旧救済撤去・**上限とレート制限の見直し**（D22）） | — | `pnpm e2e` → 本番で `pnpm e2e:prod` |
| 7 | 振り返り（`docs/adr/0003` が epic に MUST） | — | — |

**段階 2 が要石である。** 純粋な移設で振る舞いを一切変えないので、既存の全テストが
「変更していない」ことの証拠になる。逆に言えば、ここで振る舞いを変えると以降の段階すべてで
足場を失う。危険な移設なので、最後に旧実装を復元して突き合わせる。

**段階 3a と 3b を分けたのは、役割廃止と名簿統合が別の論理的変更だからである**（原則 IX）。
3a を先に済ませると、3b が運ぶ荷物から役割・ホスト・自動委譲・「編集者以上が 1 名以上残る」
不変条件がまるごと落ちる。

### 既知の地雷

1. **9p マウントでディレクトリの rename が壊れる。** 段階 2 の `apps/timer-sync` →
   `apps/tasuki-sync` が直撃する。`git mv` で行い、`git status --porcelain` で全ファイルが
   `R` として認識されているかを必ず確認する
2. **構造監査の指標が動く。** パッケージが増減するので `SC-039`・`SC-031`・`SC-032` の母数が
   変わる。段階ごとに `node scripts/audit-structure.mjs` を実測し、過去の記録と比べない
3. **リンク検査は `git ls-files` を見る。** 新規ファイルは `git add` するまで走査されない
4. **ツール ID の正本を 2 つ作らない。** `protocol` が ID、`landing/src/tools.ts` が見せ方
5. **96 本のテストを「消す」か「書き換える」かを取り違えると検査が恒真化する**（§6.4・§6.5）
6. **`pnpm e2e` は `pnpm dev` と 8787 / 3311 を共有する。** 同時に走らせない
7. **`deploy.sh` はアプリ単位。** 今回は timer / poker / **landing の 3 つとも**配布対象になる
8. **`audit-log-hygiene.mjs` の `SCANNED_PACKAGES` は workspace の実体と全単射で照合する**（§3.11）。
   段階 1（`room-core` 追加）・段階 2（`timer-sync` 改名・`poker-sync` 削除）・
   段階 4（`sync-client` 追加）で必ず落ちる。**落ちたら対象表を更新するのが正しい対応**であり、
   検査を緩めてはならない
9. **`audit-web-sync-boundary.mjs` は `apps/landing` を見ていない**（§3.10）。段階 4 で LP が
   同期クライアントになる前に、D20 の走査対象の付け替えを済ませる。**順序を逆にすると、
   規範の外で同期フックが 1 本できる**

### デプロイ

原則 III・IX に従い、**段階 0〜7 がすべて終わってから 1 回だけ**行う。揮発インメモリなので
デプロイのたびに稼働中のルームが全部消える。実行前に必ず利用者の承認を取る。

## 8. 残るリスクと申し送り

- **D5（役割・ホストの廃止）は後戻りが高い。** `permissions.ts` の判定順序には過去の回帰が
  複数刻まれており、消したあとで「やはり主催者が要る」となった場合、同じ精度で書き直すのは
  容易でない。判断は利用者が 2026-09-06 に下しているが、この性質は記録しておく
- **合言葉の設定が全員可になる。** 参加者の誰でもルームの合言葉を変更でき、他の参加者を
  締め出しうる。#145 が定めたエントロピー規範は入力の強度の話であり、この権限の話ではない。
  運用上の問題が出たら別 Issue で扱う
- **段階 2 の統合サーバーは障害の影響範囲を 1 つに集約する。** これまで timer が落ちても
  poker は生きていたが、今後は両方が同時に落ちる。`docs/timer/adr/0007` の揮発設計のもとでは
  「ルームが消える」という結果は同じなので、影響の深さは変わらず広さだけが変わる
- **`packages/sync-client` の抽出（D18）は段階 4 に置いた。** 段階 4 の時点で利用者は LP・
  timer-web・poker-web の 3 つになる。もし段階 4 を分割する必要が出た場合、抽出だけを
  先行させると利用者 1 つの抽象になり原則 X に触れる。分割するなら「LP を先に作り、
  抽出を後」の順にする
- **D12 は FR-006 を撤廃する。** 復帰の組を `localStorage` へ置く判断は、幽霊の蓄積
  （§3.13）を根拠にしている。**利用者の承認が要る決定である** —— 資格情報の保存先を
  変えるため、D5（役割の廃止）と同じく既存の MUST を撤廃する
- **同一ブラウザで同じルームを 2 タブ開くと、1 人が 2 接続を持つ。** D14 の多接続模型で
  正しく扱えるが、**timer の既存実装は `connId` を 1 本しか持たない**ので、段階 3b で
  模型を変えるまでは後から繋いだタブが前を奪う。段階の順序を守ること
- **別ブラウザ・ストレージ消去の場合は幽霊が 1 つ残る。** 頻度が低く、`participant.remove` で
  片付けられるため自動退去は入れない（D12）
- **#91（お題の LP 移設）と #94（ファシリテーター）は、この設計の完了後に軽くなる。**
  どちらも選択画面の一機能として置けるようになる。#92 / #93 は poker 内で完結するため
  この作業を待たない

## 9. 成果物

- 本設計文書（決定と実測の正本）
- ADR 4 本
  - `docs/adr/`（横断）: ①文脈分割とパッケージ構成（`room-core` の表現の選択と理由を含む。
    `docs/adr/0016` 決定 1 が MUST とする記録）／②入口一本化と URL 体系（旧救済断片の撤去を含む）／
    ③`docs/adr/0015` の適用範囲を `apps/landing` へ広げる（D20）
  - `docs/adr/0011` の改定: ①脅威 S9 が名指しする「権限規則の正本
    `packages/timer-core/src/permissions.ts`」が D5 で消えるため、S9 の対策を書き直す
    （役割の再検証から、参加者同一性の検証へ）。②S1 の対策文にある「新規参加者の既定
    role は editor」の記述を現行化する。③決定 1 の分類表が**サーバー保持を対象とする**
    ことを明確化し、在席（どのツールに居るか）を分類へ追加する（D12）
  - `docs/timer/adr/0007` の改定: 役割・ホストの廃止と自動委譲の撤廃（D5）
  - **FR-006 の撤廃**（`docs/plans/resume-token-wiring/spec.md`）: 復帰の組を `localStorage` へ
    移す（D12）。撤廃の理由と、代わりに満たす性質を ADR へ記録する
- 子 Issue（§7 の段階に対応。振る舞いは §6.1 の EARS を写す）
- 実装計画（`docs/superpowers/plans/` に別途）
