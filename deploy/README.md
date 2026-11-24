# デプロイ手順（アプリ共通）

Tasuki の各アプリは「自分の systemd ユニット + 固有ポート + Caddy 断片 + env」を持ち、
**互いに無干渉でデプロイできる**。共通のドライバがアプリ名を受け取って動く。

アプリ固有の値は `deploy/<app>/app.env` にのみ書く。スクリプトやテンプレートに値を
散らさないのは、Issue #51 で起きた「ユニットのユーザー名がスクリプトとテンプレートで
食い違い、片方だけ直っていた」を構造的に防ぐため。

## アプリ一覧

| アプリ | サービス | ポート | 配置先 | 公開パス | 状態 |
|---|---|---|---|---|---|
| `landing` | （無し・静的） | — | `/var/www/tasuki-home` | `/`（玄関） | 公開中 |
| `timer` | `tasuki-sync` | 8787 | `/opt/tasuki` / `/var/www/tasuki` | `/timer/` | 公開中 |
| `poker` | （無し・静的） | — | `/var/www/tasuki-poker` | `/poker/` | 公開中 |
| `topic` | （無し・静的） | — | `/var/www/tasuki-topic` | `/topic/` | 公開中 |
| `roulette` | （無し・静的） | — | `/var/www/tasuki-roulette` | `/roulette/` | 公開中 |
| `agenda` | （無し・静的） | — | `/var/www/tasuki-agenda` | `/agenda/` | 公開中 |
| `checkin` | （無し・静的） | — | `/var/www/tasuki-checkin` | `/checkin/` | 公開中 |
| `track` | （無し・静的） | — | `/var/www/tasuki-track` | `/track/` | 未公開（#476。配る順と初回の用意は [`track/NOTES.md`](track/NOTES.md)） |

> **#668（Caddy 2.11.7 → 2.11.9・同期サーバーの Bun 1.4.3 → 1.4.4・PR #678）は 2026-11-22 の昼に配った**（`v4.7.1`）。
> 画面とメッセージの形は変わらない（上限を超えたフレームの close のコードだけが 1006 から 1009 になった。Bun の変更で、画面は close のコードを見ない）。
> root の作業は 2 本（Caddy の deb の入れ替え・Bun の実体の入れ替え）を人が端末で流し、そのあと `deploy.sh timer` で同期サーバーを 1.4.4 のバンドルで再起動した。
> timer の画面は `deploy.sh timer` で同じ中身を配り直した。ほかの 6 本の静的アプリは配り直していない。
> 流す直前ごとに 8787 の接続が 0 本なのを確かめた（Caddy の前・Bun の実体の入れ替えの前・`deploy.sh timer` の前）。
> Caddy は `build-info` で go1.27.3・x/net v0.60.0、状態コードは上げる前と同じ。Bun は `/proc/<PID>/exe --version` で 1.4.4・NRestarts=0。
> timer の画面のハッシュは、配ったビルド・本番の配信・Node 26 で作り直したビルドの 3 つで一致。⚠ 人の端末の配布は Node 22 で画面をビルドしていた（`toolchain.json` の宣言は Node 26.13.1。`deploy.sh` は版を確かめない）。
> 今回は中身が同じだったが、次からは `PATH=<Node 26 の bin>:$PATH` を前に付けて配る。e2e:prod は Caddy の後・Bun の後とも 62 passed。Bun 1.4.5 は #679。

> **#459（AI お題生成の認証を API キーへ）・#638（合言葉の設定を玄関へ）・#640（ルーレットの変わった動き）・#634・#635 ほか、v4.6.1 以降の 21 PR は 2026-11-22 にまとめて配った**（`v4.7.0`）。
> 新しいアプリは無く、`deploy/` の差分も文書だけなので root 作業は無し。wire が変わった PR の配る順の決まりを満たすよう、
> **roulette → timer → landing → topic → checkin → agenda → poker** の順に流した
> （#640 は roulette-web が先・同期サーバーが後〔[`roulette/NOTES.md`](roulette/NOTES.md) の「#640」〕、#638 は timer → landing を続けて〔下の「合言葉の設定の移設」〕、
> #634 は `topic.generate` に `category` を足し、#635 はやり方を 14 から 26 に増やして小見出しのくじのコマンド（`checkin.method.draw-side`・`draw-group`）を足したので、どちらも同期サーバーが先）。
> `roulette/NOTES.md` の冒頭の「未配布の変更がある静的アプリは landing の前に足す」（#94 の初回公開で、玄関に新しい札を出したときの決め）には従っていない。
> 今回は玄関に新しい札が無く、#638 が timer → landing を続けて流すことを求め、#634・#635 が静的アプリより同期サーバーを先に求めたので、静的アプリを landing の後に回した。
> 新しいアプリ（玄関の新しい札）を出す回は、#94 の決めをもう一度当てる。
> #459 は、配る前に本番の env へ `ANTHROPIC_API_KEY` を追記し、旧 `CLAUDE_CODE_OAUTH_TOKEN` を残したまま配った（下の「[AI お題生成を OAuth トークンから API キーへ切り替える](#ai-お題生成を-oauth-トークンから-api-キーへ切り替える459利用者の作業)」の手順 2〜4）。
> 起動ログの `ai enabled=true`・本番での AI の生成・Console の使用量（反映は数分遅れた）を確かめてから、旧トークンの行を消して失効させた（手順 5・6）。
> 8787 の接続 0 本の時間帯に流し、7 本のハッシュ一致・NRestarts=0・`/ws` 426・e2e:prod 62 passed。配布のコマンドは人が端末で流した（手元の設定の deny のため）。

> **#482（アーキテクチャと設計原則の見直し）・#595（名簿の欄の IME の Enter・PR #627）ほか、v4.6.0 以降の 29 PR は 2026-11-18 にまとめて配った**（`v4.6.1`）。
> 新しいアプリは無く、`deploy/` の差分も文書だけなので root 作業は無し。wire は `packages/*-core/src` のスキーマに差分が無く、
> 同期サーバーに触れた PR（道具の列挙を寄せた #602・同期サーバーを分けた #611 ほか）もスキーマに触れておらず（#602 で変わるのは
> お題フレームの接続間の送信順だけ。#611 は「振る舞いと wire は変えない」としていた）、順を選ぶ必要は無かったが、
> 標準どおり同期サーバーを先にした（timer → poker → topic → roulette → agenda → checkin → landing）。
> 443・8787 とも接続 0 本の時間帯に流し、7 本のハッシュ一致・NRestarts=0・`/ws` 426・e2e:prod 62 passed。
> 配布のコマンドは v4.6.0 と同じく人が端末で流した（手元の設定の deny のため）。
> ⚠ タグ `v4.6.1` の本文の「timer の画面の大きいフックと部品（…）」は誤り。責務で分けた 6 つのフックと部品は、
> timer（use-timer-sync・RosterPanel）・玄関（use-hub-sync）・poker（useRoomEntry）・agenda（ScenarioBuilder）・
> roulette（RegularsSection）の 4 つの道具と玄関にまたがる（敵対的レビューで見つかった）。

> **#479（画面の崩れ）・#480・#465・#468・#469・#574 ほか、v4.5.0 以降の 66 PR は 2026-11-12 にまとめて配った**（`v4.6.0`）。
> 新しいアプリは無く、`deploy/` の差分も文書だけなので root 作業は無し。poker → topic → roulette → agenda → checkin → landing → timer
> の順に続けて流し、同期サーバーの再起動（ルームが消える）を最後の 1 回にした。7 本のハッシュ一致・NRestarts=0・e2e:prod 62 passed。
> ⚠ **この順は標準（同期サーバーが先・画面が後。[`../docs/guides/architecture.md`](../docs/guides/architecture.md)・`docs/adr/0026`・
> PR #466 の「配布の注意」）から外れていた。** `apps/tasuki-sync/src` に差分が無いことを「wire が変わっていない」と取り違えたためで、
> 実際には checkin のやり方の ID（`packages/checkin-core` の `METHOD_IDS`。コマンドとフレームの picklist）が 4 つ増えており、
> 新しい checkin 画面 × 旧い同期サーバーの窓では新しいやり方を選ぶと `INVALID_COMMAND` になる。接続 0 本の時間帯に数十秒で
> 続けて流したので害は無かった。次からは timer を先にし、wire の変化は `packages/*-core/src` のスキーマと各 PR 本文の
> 「配布の注意」で見る（敵対的レビューで見つかった）。配布のコマンドは人が端末で流した（Claude Code の手元の設定（追跡外の
> `settings.local.json`）が `ssh` と配布のスクリプトを deny していたため。`docs/adr/0032` の Claude Code のフックは人に聞く作りで、
> deny ではない。Codex の入口は deny）。

> **#406（Check-in Cards）・#447・#455・#403・#458 は 2026-10-30 にまとめて配った**（`v4.5.0`）。初回の用意（web root と
> `/checkin/` の断片）を root で済ませてから、timer → checkin → roulette → agenda → poker → topic → landing の順に流した。
> #455・#458 の「同期サーバーが先」に合わせて timer を先頭にした。記録は [`checkin/NOTES.md`](checkin/NOTES.md)。

> **#429 第 2 段（くりかえし #433）・フィードバック（#435）・#434（サイトの外側）は 2026-10-24 にまとめて配った**（`v4.4.0`）。
> web は timer → agenda → landing → poker → topic → roulette、続けて root で Caddy の 7 本を入れた。本番の Caddy 2.6.2 で
> 404 に immutable が付いたので、#437 の後に `site.conf` だけを入れ直した。手順と記録は [`agenda/NOTES.md`](agenda/NOTES.md)・
> [`caddy/README.md`](caddy/README.md) の「#434 の配布」。

> **#429（進行タイマー）は 2026-10-21 に配った**（`v4.3.0`）。初回の用意（web root と `/agenda/` の断片）を済ませてから、
> agenda → landing → timer の 3 本を続けて流した。手順は [`agenda/NOTES.md`](agenda/NOTES.md)。

> **#94（ルーレット）は、#91 の配布（2026-09-27）より後にマージした未配布分（PR #318〜#383）とまとめて、
> 5 アプリを 1 回で配った**（2026-10-14・`v4.1.0`）。順序は roulette → poker → topic → landing → timer で、`/roulette/` の断片を先に置いた。手順は [`roulette/NOTES.md`](roulette/NOTES.md)。

> **#91（お題）は 4 本をまとめて 1 回で配った**（2026-09-27）。順序は topic → poker → landing → timer で、
> `/topic/` の断片を先に置き、間を空けずに続けて流す。配布中の窓と手順は
> [`topic/NOTES.md`](topic/NOTES.md) の「配布の手順」にある。**`topic` だけ・`landing` だけを配らないこと** ——
> 玄関に 3 枚目の札が出るのに、同期サーバーがまだお題を知らない状態になる。

> **3 系統は 2026-08-28 に本番へ出た（#66）。** Planning Poker と玄関 LP はこのときが初回公開。
> 再起動でルームが全消滅するため、デプロイは指示を得てまとめて 1 回行う方針は変わらない。

> **#95 S2 で同期サーバーを 1 本に統合した。** `tasuki-sync`（8787）が timer と poker の
> 両方の WebSocket を受ける。`poker` は web を配るだけの静的アプリになり、`app.env` が
> `STATIC_ONLY=1` になった。旧ユニット `tasuki-poker-sync` の停止手順は
> [`poker/NOTES.md`](poker/NOTES.md) にある。**timer の再起動で poker のルームも消える**
> ようになったので、デプロイの重さは 2 アプリぶんに増えている。
>
> **切り替え時は実 env の `MAX_CONNECTIONS` を手で直すこと**（同 NOTES の手順 1）。
> `setup.sh` は既存の env を上書きしないので、`env.example` を直しただけでは届かない。

### 公開範囲の方針

公開中かどうかはアプリごとに上の表の「状態」が正本である（timer / poker / landing は 2026-08-28・#66、
`topic` は 2026-09-27・#91、`roulette` は 2026-10-14・#94 に初回公開）。同期サーバーはすべてのアプリで共用の 1 本（`tasuki-sync`）で、
`topic`・`roulette`・`agenda`・`checkin`・`track` は `poker` / `landing` と同じ静的アプリである。
デプロイはアプリ単位（`./deploy/deploy.sh <app>`）で、指定したアプリだけが転送される。

`timer` 以外（表で「サービス」が無いもの）は **sync サーバーを持たない静的サイト**で、Caddy が直接配信する。`app.env` に
`STATIC_ONLY=1` を置くと、`deploy.sh` はバンドルとサービス再起動の段を飛ばし、
`setup.sh`（systemd ユニット・sudoers）も不要になる。

> `timer` のサービス名が命名規約（`tasuki-<tool>-sync`）から外れているのは、
> **稼働中のユニットを改名しない**と決めたため。改名は「旧停止 → 新起動」の切り替えを
> 伴い、失敗すればサービス断になる。得られるのは命名の一貫性だけで機能上の利得が無い。

## 配る時の確認の一覧

配る回ごとに、上から順にたどる（#675）。**配布そのものは自動化しない**（下の「[自動化していない作業](#自動化していない作業)」）。
機械が流すのは、配った後の読むだけの確かめ（`pnpm verify:prod`）だけで、ほかは人が見て決める。

### 配る前

- [ ] **main の CI が緑**。配る元は main の HEAD で、作業ツリーに未コミットの変更が無い（`deploy.sh` は手元の作業ツリーをそのまま配る）
- [ ] **道具の版が宣言と合う**: `node scripts/check-toolchain.mjs test`（Node・pnpm・Bun。`deploy.sh` は版を確かめない。
      v4.7.1 では人の端末が Node 22 で画面をビルドしていた）
- [ ] **wire の差分**: `git diff <前のタグ>..HEAD --stat -- 'packages/*-core/src/*'` と、各 PR 本文の「配布の注意」。
      `apps/tasuki-sync/src` に差分が無いことを「wire が変わっていない」と取り違えない（v4.6.0 の記録）。
      末尾の `/*` を落とさない（引用符つきの `'packages/*-core/src'` は下のファイルに届かず、差分があっても何も出ない。#675 のレビューで実測）
- [ ] **`deploy/` の差分**: `git diff <前のタグ>..HEAD --stat -- deploy`。文書だけなら root の作業は無い。
      Caddy 断片・`app.env`・`service.tmpl`・`setup.sh` が変わっていれば、その道具の `NOTES.md` の手順を先に済ませる
- [ ] **新しい道具を出す回**は、初回の用意（web root と Caddy 断片）を済ませ、冒頭の「[アプリ一覧](#アプリ一覧)」の状態を「公開中」に直しておく
      （`pnpm verify:prod` は、この表で「未公開」の道具を飛ばす）
- [ ] **接続数が 0 本**（流す直前ごとに）: `ssh <ホスト別名> "ss -Htn state established '( sport = :8787 )' | wc -l"`。
      同期サーバーの再起動でルームは全消滅する（下の「[⚠ 再起動でルームは全消滅する](#-再起動でルームは全消滅する)」）

### 配る順

- [ ] **前のタグからの変更を並べる**: `pnpm changes:since <前のタグ>`（例: `pnpm changes:since v4.7.1`。#675）。
      コミット（PR）ごとに、wire（`packages/<名前>-core/src`）・同期サーバー（`apps/tasuki-sync/src`）・`deploy/`（文書だけか、それ以外か）に
      触れたかの印と、種類ごとの PR の番号が出る。**印の付いた PR は、本文の「配布の注意」を必ず読む**
  - 読むだけで、順は出さない。印は読む PR を漏らさないためのもので、wire が変わったかどうかの判定ではない
    （`*-core/src` の内部の整理にも印が付く。逆に、印の無い PR が受け方を変えていることもある）
  - 手元にタグが無い・タグが HEAD の祖先でない（浅い複製・別の枝）ときは、空の一覧を出さずに止まる。
    `git fetch origin tag <前のタグ>` で取り、main で流す
- [ ] **順は人が決める。** 標準は、同期サーバー（`deploy.sh timer`）が先・画面が後（[`../docs/guides/architecture.md`](../docs/guides/architecture.md)・`docs/adr/0026`）
- [ ] wire が変わった PR は、本文の「配布の注意」と各 `NOTES.md` の注記を突き合わせ、すべての決まりを満たす順にする。
      決まりどうしが食い違ったら、どれに従い、どれに従わなかったかと理由を、配った回の注記に書く（v4.7.0 の記録）
- [ ] 窓を短くするため、間を空けずに続けて流す

### 配った後

- [ ] **すべて配り終えてから**、配った端末（配ったビルドの `dist` が残っている作業ツリー）で流す:
      `TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm verify:prod --e2e`
      （公開中の道具すべての配信ハッシュ・公開パス・`/ws` の 426 を読み、揃っていれば続けて `pnpm e2e:prod` を流す。下の「[動作確認](#動作確認)」）
- [ ] **時間をおいて**、同期サーバーの `ActiveState`・`NRestarts` を見直す（「動作確認」の ③。`ssh` が要るので `pnpm verify:prod` には含めていない）
- [ ] 配る前に本番の env・Caddy・Bun に触った回は、その手順の確かめ（起動ログ・`/proc/<PID>/exe --version` ほか）も済ませる

### タグ

- [ ] **版の番号**を人が確かめる（前のタグ `git ls-remote --tags origin` と、上げる桁）
- [ ] **本文**を、前のタグからの PR 本文と突き合わせて書く
- [ ] **本文を、書いたのとは別のエージェントのレビューに回してから push する**（[敵対的レビュー](../docs/guides/procedures/adversarial-review.md)。
      v4.6.0・v4.6.1 では本文の誤りが push の後に見つかった。push したタグは打ち直さない）

### 記録

- [ ] この README の冒頭の注記に、配った回（日付・タグ・配った順とその理由・確かめた結果）を足す文書 PR を出す
- [ ] 道具ごとの `NOTES.md`・「アプリ一覧」の状態に、変わったことがあれば同じ PR で直す

## 通常運用（更新）

> AI のエージェント（Claude Code）がこのディレクトリのスクリプトや `systemctl`・`caddy reload` を走らせようとすると、
> フックが人に承認を求める（`docs/adr/0032`）。人が自分の端末で叩く手順は変わらない。

接続先は環境変数で必ず指定する。**既定値は用意していない**（実在しないホスト名を
既定にしていたため README の手順がそのまま失敗していた＝ #51 B）。

```bash
# 事前に ~/.ssh/config へホスト別名を定義しておく（下記「SSH の準備」）
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer
```

実行される内容:

1. `turbo --filter` で**対象アプリの web だけ**をビルド
2. `bun build` で sync を単一ファイルにバンドル
3. `rsync -az --delete` で web dist を配置（`index.html` の存在を確認してから）
4. 前版の `server.js` を `server.js.bak-<日時>` へ退避してから、`scp` で新しい `server.js` を配置
5. `sudo systemctl restart <そのアプリの service>` （他アプリには触れない）
6. **起動し続けていることを確かめる**（#146）。失敗すれば `deploy.sh` は**非 0 で終了**し、
   切り戻しのコマンドをそのまま出す

何が実行されるかを先に見たいときは `DRY_RUN=1` を付ける。

```bash
DRY_RUN=1 TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer
```

### 起動の確認は deploy.sh が行う（#146）

再起動のあと、`deploy.sh` は次の 3 つを確かめてから「完了」と言う。どれかに引っかかれば
**非 0 で終了**し、切り戻しのコマンドと `journalctl` の見方を出力する。

1. `systemctl restart` そのものが成功したか
2. **間を空けて 2 回**、`systemctl is-active --quiet` が通るか
3. その 2 回の間に `NRestarts` が増えていないか（クラッシュループの検知）

2 と 3 を分けているのは、ユニットが `Restart=on-failure` を持つため
**落ちて再起動している最中でも一瞬 active に見える**から。待ち時間は既定 5 秒 × 2 回で、
`SETTLE_SECS` で変えられる。

**実測（2026-08-29）。** 本番 VPS に使い捨ての `tasuki-probe.service` を一時的に置き、
実際の systemd で 4 パターンを確かめた（**本番サービスには触れていない**。確認後に削除済み）。

| ダミーの振る舞い | `deploy.sh` の再起動段 | 出力 |
|---|---|---|
| 起動して生き続ける | `exit 0` | `OK: … active のままで、NRestarts は 0 から増えていません` |
| 即座に落ちる（fail-closed と同じ形） | `exit 1` | `ERROR: … が起動していません` |
| 1 回目は通り、あとで落ちる | `exit 1` | `ERROR: … が起動後に落ちました` |
| 2 回とも active に見えるが再起動を繰り返す | `exit 1` | `ERROR: … が再起動を繰り返しています（NRestarts 0 → 1）` |

**同じ壊れたサービスに対して、旧実装の 1 行は `exit 0` で終わった。**

**以前は再起動の失敗を検知できなかった**（`;` 区切りと `| head -5` により、リモートの
終了コードが握り潰されていた）。#103 が足した 3 つの fail-closed（`ALLOWED_ORIGINS` 未設定・
`HOST` がループバック外・`NODE_ENV` が未知の値）は「起動しないことで守る」設計なので、
起動失敗を検知できることが前提になっている。

### ⚠ 再起動でルームは全消滅する

sync サーバーは**揮発インメモリ設計**で、再起動すると稼働中のルームが全て消える
（仕様どおり）。**利用者のいない時間帯に実施すること。**

## 合言葉の設定の移設（#638）

合言葉（ルームのパスフレーズ）の設定が、timer のコマンド（`room.passphrase.set`）から玄関のルームの画面（ハブのコマンド）へ移った。
**サーバーが新旧の両方を受ける段は挟まない**（利用者の判断。この 1 つの変更で、ハブのコマンドを足し、玄関に口を足し、timer の口とコマンドを外す）。

配る順は次のとおり。**`deploy.sh timer`（同期サーバーと timer の画面を一緒に配る）→ `deploy.sh landing`（玄関）**。そのあとに `topic`・`roulette`・`agenda`・`checkin`・`poker` を順不同で。

```bash
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer   # 同期サーバーを含む（sync は単一ファイルで全アプリが共有する）
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh landing
```

- **窓**: `deploy.sh timer` は同期サーバーと timer の画面を一緒に配る（上の「通常運用」）ので、配り終えた時点で timer の画面から口が消え、サーバーは timer 経由の設定を受けない。
  玄関（`landing`）を配るまでの間は、**合言葉を設定する口がどこにも無い**。同期サーバーの再起動でルームは全消滅する（上の注意）ので、合言葉の付いたルームも元から消える。
  古い timer の画面を開いたままの人の「設定」は失敗する（サーバーは `INVALID_COMMAND` を返す）
- 窓を短くするため、**`deploy.sh timer` と `deploy.sh landing` を続けて流す**。各アプリの `NOTES.md` に個別の注意はない（資材の置き場・環境変数は変わらない）
- 合言葉の付いたルームへ各道具の URL から入った人は、玄関で合言葉を求められ、通ると元の道具へ戻る（`?from=`）。古い道具（まだ配っていない画面）は `?from=` を運ばないので、
  通ったあとは選択画面に着く（機能は失われない。道具を選び直す）
- 確かめるもの: `e2e/specs/landing-passphrase.spec.ts`（`e2e:prod` ではなく `local` 専用。本番では玄関で設定し、別の文脈から道具の URL を開いて戻ることを手で見る）

## 動作確認

```bash
HOST=https://<公開ドメイン>

# ① 新版が確実に出た決定的証拠: 公開中の道具すべての配信ハッシュと手元のビルドの一致・公開パスの応答・/ws の 426（#675）
#    --e2e を付けると、揃っているときだけ続けて pnpm e2e:prod を流す
TASUKI_E2E_BASE_URL="$HOST" pnpm verify:prod

# ② ヘッダとステータス
curl -sI "$HOST/" | grep -Ei 'HTTP/|x-robots-tag|strict-transport'

# ③ クラッシュループしていないこと（20 秒あけて 2 回・NRestarts と MainPID を見る）
ssh "$TASUKI_SSH_HOST" 'systemctl --no-pager show tasuki-sync -p ActiveState -p NRestarts -p MainPID'
sleep 20
ssh "$TASUKI_SSH_HOST" 'systemctl --no-pager show tasuki-sync -p ActiveState -p NRestarts -p MainPID'

# ④ 起動ログに異常が無いこと
ssh "$TASUKI_SSH_HOST" 'journalctl -u tasuki-sync -n 12 -o cat'
```

### `pnpm verify:prod` が見るもの（#675）

**読むだけ**で、本番へは何も書かない（`scripts/verify-prod.mjs`。判定は `scripts/lib/prod-verify.mjs`）。
接続先は `pnpm e2e:prod` と同じ `TASUKI_E2E_BASE_URL` で、既定値は無い。https だけを受け取り、ローカル宛は拒む。

| 見るもの | 揃っていないとき |
|---|---|
| 公開中の道具ごとに、公開パスが 200 を返す | 道具と状態コードを名指しする |
| 配信の `index.html` が指す `assets/` の js・css の名前が、手元の `<WEB_DIST>/index.html` と同じ | 手元だけにある名前・配信だけにある名前を並べる |
| その js・css の 1 本ずつが 200 で、名前どおりの種類として返る | 名前を名指しする（SPA のフォールバックに吸われると html が返る） |
| `/ws` が 426 | 状態コードを出す（200 なら SPA のフォールバックに吸われている） |

- **道具の一覧は `deploy/<app>/app.env` と冒頭の「アプリ一覧」の表から導く。** 表で「未公開」の道具は飛ばし、飛ばしたことを出す。
  表に行の無い道具・状態が「公開中」「未公開」のどちらでも始まらない道具があれば、本番を読まずに止まる
- **「一致」と言わない形**: 手元の `dist` が無い・手元か配信の `index.html` に `assets/` の js が無い（空の応答・別のページ）・
  対象が 0 本。どれも比べずに NG にする（過去に、空どうしの比較で偽の「一致」が出た）
- **手元の `dist` は作り直さない。** 配った端末で流す。別の場所で流すなら、配ったコミットを同じ版の道具（`toolchain.json`）で
  `pnpm build` してから流す（版が違うとハッシュが変わりうる）
- ずれがあれば exit 1、接続先・引数が決まらなければ exit 2。`--e2e` で E2E まで進んだときは、E2E の終了コードで終わる
  （E2E が赤なら、その終了コードと「NG: E2E が通っていません」の行。起動できない・シグナルで落ちたときは 1）
- **見ないもの**: 同期サーバーの `ActiveState`・`NRestarts`・起動ログ（上の ③・④。`ssh` が要る）、ヘッダ（上の ②）、
  画面の動き（`--e2e` で続けて流す `pnpm e2e:prod`）、js・css の本文（名前・状態コード・種類だけを見る）、
  `index.html` が指さない遅延読み込みのファイル
- **配り忘れは見つけない。** `deploy.sh` は渡した道具だけをビルドするので、配り忘れた道具は手元の `dist` も本番も前のままで、揃って見える。
  配った道具の一覧は、人が配る順の控えと突き合わせる
- **一部だけ配る回**（例: `v4.7.1` は timer だけ）で、配っていない道具に未配布の変更があり、手元でその道具をビルドし直していれば、
  その道具は「ずれ」と出る（本番が手元より古い、という事実どおり）。道具を絞る引数は無い。その回は、配った道具の行が OK なのを読み、
  `pnpm e2e:prod` は別に流す（`--e2e` は 1 本でもずれていれば E2E を流さない）

## 切り戻し

**退避は `deploy.sh` が毎回行う**（#146。`server.js.bak-<日時>`）。手で退避したいときは次のとおり。

```bash
ssh "$TASUKI_SSH_HOST" "cp -p /opt/tasuki/server.js /opt/tasuki/server.js.bak-$(date +%Y%m%d-%H%M)"
```

戻すとき（起動に失敗した場合は `deploy.sh` がこの形のコマンドを退避先つきで出力する）:

```bash
ssh "$TASUKI_SSH_HOST" 'cp -p /opt/tasuki/server.js.bak-<日付> /opt/tasuki/server.js && sudo systemctl restart tasuki-sync'
```

web 側は前コミットを checkout して `deploy.sh` を再実行する。

## 初回セットアップ（VPS 側・アプリごとに 1 回）

> 前提: VPS は Debian 12・非 root のログインユーザーで運用する。実行ユーザーは
> `deploy/setup.sh` の `DEPLOY_USER` で一元管理する（#51 A）。

```bash
# 1) Bun を VPS に導入し /usr/local/bin/bun へ置く（未導入なら）

# 2) 資材を転送
scp -r deploy "$TASUKI_SSH_HOST:/tmp/tasuki-deploy"

# 3) VPS で実行（root）。DEPLOY_USER は SSH のログインユーザー名。
ssh -t "$TASUKI_SSH_HOST" 'sudo DEPLOY_USER=$(whoami) bash /tmp/tasuki-deploy/setup.sh timer'

# 4) env を実値へ編集（ALLOWED_ORIGINS 等）
ssh -t "$TASUKI_SSH_HOST" 'sudo -e /opt/tasuki/tasuki-sync.env'

# 5) Caddy 断片を設置（deploy/caddy/README.md 参照）

# 6) 配置して起動
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer
ssh "$TASUKI_SSH_HOST" 'sudo systemctl start tasuki-sync'
```

`setup.sh` が行うこと（冪等・再実行可）:

- ディレクトリ作成と所有権設定（`DEPLOY_USER` 所有 = 転送に sudo が要らなくなる）
- env ファイル作成（**既存があれば上書きしない**）
- systemd ユニットを `service.tmpl` から生成（`DEPLOY_USER` / パス / ポートを置換）
- `deploy.sh` 用の sudoers ルールを `visudo` で検証してから設置

**安全装置**: 既存ユニットの `User=` と指定した `DEPLOY_USER` が食い違う場合、
上書きせず中断する（再起動でサービスが起動しなくなるのを防ぐ）。意図した変更なら
`FORCE=1` を付ける。

生成されるユニットを事前に確認したいときは root なしで実行できる。

```bash
RENDER_ONLY=1 DEPLOY_USER=<user> bash deploy/setup.sh timer
```

## Bun を上げる

Bun は**本番・手元・CI を同じ版に揃えて固定**しています。版の正本はリポジトリ直下の `toolchain.json` の
`bun` の 1 か所で、CI（`.github/workflows/ci.yml`）はそこから読みます。手元の版が違うと、`pnpm test`・
変異検査が始まる前に止まります（`docs/adr/0031`）。CI だけを上げると、本番と違う版で試すことになります
（2026-10-22 に 1.4.4 で同期サーバーの試験が 1 件落ち、CI を固定しました。原因は 1.4.4 の正当な変更で、
上限を超えたフレームの close が 1006 から 1009 になったため。#668 で試験を合わせて 1.4.4 へ上げました）。
Renovate の Bun の更新は Dependency Dashboard の承認制です（`renovate.json`・#442）。
承認すると `renovate/bun` の PR が出るので、その PR の中で次を済ませます。

1. **手元**: `bun upgrade`（公式のインストーラーで入れた `~/.bun/bin/bun` を上げる）または版を指定して入れ直し、
   `bun --version` で確かめる。新しい版で全件（同期サーバーの試験を含む）を流し、赤があれば先に調べる
2. **CI**: Renovate の PR が `toolchain.json` の `bun` を上げる（`renovate.json` の `customManagers`）。`@types/bun` も同じ PR に入る
3. **本番**（root が要る・**人のいない時間に**。同期サーバーの再起動でルームが消える）:
   1. 公式の配布物（GitHub Releases の `bun-linux-x64.zip`）を `SHASUMS256.txt` と照合して取得する
   2. 今の `/usr/local/bin/bun` を `/usr/local/bin/bun-<旧版>` へ退避し、新しい実体に `install -m 755 <新しい実体> /usr/local/bin/bun` で
      入れ替える（入れ替えだけで再起動はしない。動いている実体へ `cp` で上書きすると `Text file busy` で失敗する）
   3. `TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer` で、手元の新しい Bun でバンドルし直して再起動する。
      **手元の作業ツリーの同期サーバーと timer の画面がそのまま配られる**ので、配る元は「本番に出ている中身 ＋ Bun の変更だけ」の
      コミットにする（未配布の変更を混ぜない）。試験と E2E はソースを `bun run` で起動していて、バンドルを起動しないので、
      配る前に新しい Bun で `bun build` したバンドルを手元で 1 回起動して接続を確かめる（#668 のレビュー）。
      流す直前に `ssh <ホスト別名> "ss -Htn state established '( sport = :8787 )' | wc -l"` で WS が 0 本なのを見る
   4. `/proc/<PID>/exe --version` で動いている版を確かめ、`pnpm e2e:prod` を流す
4. PR をマージする

切り戻しは、退避した実体と、`deploy.sh` が退避した前の `server.js` の両方を戻して再起動します。

1. `sudo install -m 755 /usr/local/bin/bun-<旧版> /usr/local/bin/bun`（`cp` は同期サーバーが動いている間は
   `Text file busy` で失敗する。`install` は消してから作り直すので通る。#668 で確かめた）
2. `cp -p /opt/tasuki/server.js.bak-<日時> /opt/tasuki/server.js`（`deploy.sh` が配る前に作った退避。旧い Bun で作ったバンドル）
3. `sudo systemctl restart tasuki-sync` → `/proc/<PID>/exe --version` で旧版を確かめる

`deploy.sh timer` で戻さないこと。手元の Bun（新しい版）と手元の作業ツリーでバンドルし直すので、前の状態には戻らない（#668 の /code-review）。

## Caddy を上げる

Caddy も**本番・E2E・CI を同じ版に揃えて固定**しています。版の正本はリポジトリ直下の `toolchain.json` の
`caddy` の 1 か所で、E2E のハーネス（`e2e/harness/paths.ts`）と CI のキャッシュの鍵はそこから読みます。
版が違うと、本番でだけ効かない書き方が緑のまま出ます（#434 で 2.6.2 と 2.11.4 の差を踏みました）。

本番の Caddy は他のサイトと共用で、Caddy 公式の apt リポジトリ（`dl.cloudsmith.io/public/caddy/stable`）
から入れています（2026-10-25 に Debian の 2.6.2 から 2.11.7 へ切り替え、2026-11-22 に 2.11.9 へ上げた。#668・`v4.7.1`。
上げた理由は、2.11.7 のビルドに使われた Go 1.26.8・`golang.org/x/net` v0.59.0 に HTTP/2 サーバーの脆弱性が残っていたこと）。このリポジトリは
unattended-upgrades の対象外で、さらに `apt-mark hold caddy` で止めています。他のサイトの作業で
`apt upgrade` を流しても上がりません。**上げるときは手で**次を済ませます。

1. **手元**: 本番の設定一式（`/etc/caddy/Caddyfile` と `/etc/caddy/tasuki/`）を写し、今の版と新しい版の両方で
   `caddy adapt` の結果と、起動したときの応答（状態コード・ヘッダー・本文）を比べる。他のサイトの設定も含める。
   `/ws` の先に受け取ったヘッダーを返すだけのサーバーを置き、偽の `X-Forwarded-For` が実際の接続元で
   上書きされることも比べる（IP 単位のレート制限の前提・#103）
2. **E2E と CI**: `toolchain.json` の `caddy` を新しい版へ上げる PR を出し、手元と CI の E2E を通す。**この PR はまだマージしない**
3. **本番**（root が要る・**人のいない時間に**。Caddy の再起動で全サイトが数秒止まる。同期サーバーは再起動しないので
   ルームは残るが、**全員の WebSocket が同時に切れる**。画面は 1→2→4→8 秒と間を空けて繋ぎ直し
   （`packages/sync-client/src/backoff.ts`）、Check-in Cards は切断から 10 秒で回が自動で開く
   （`CHECKIN_DISCONNECT_REVEAL_GRACE_MS`）。8787 の WS が 0 本なのを確かめてから流す）:
   1. 今の版の deb を版を指定して取っておく（`apt-get download caddy=$(dpkg-query -W -f='${Version}' caddy)`。
      版を付けないと新しい版の deb が来て、切り戻せなくなる）。`/usr/bin/caddy` と `/etc/caddy` も退避する
   2. 入れる前に、新しい版の deb を `apt-get download caddy=<新版>` で取り、`dpkg-deb -x` で一時ディレクトリへ
      展開して、その本体で `caddy validate --config /etc/caddy/Caddyfile` を通す（caddy ユーザーで実行する）
   3. `apt-mark unhold caddy` → `apt-get install -o Dpkg::Options::=--force-confold caddy=<新版>`
      （今の Caddyfile を残す。付けないと設定ファイルの置き換えを対話で聞かれる）→ `apt-mark hold caddy`。
      **deb の postinst が自分で `try-restart caddy.service … || true` を流す**ので、`systemctl restart` は重ねない
      （重ねると 2 回切れる。#668 で postinst を読んで確かめた）。`|| true` のため起動に失敗しても apt は成功で終わるので、
      `systemctl is-active caddy` と `/proc/<PID>/exe version` で新しい版が動いていることを見る。
      途中で止まっても `apt-mark hold caddy` を戻す
   4. 各サイトの状態コードと `pnpm e2e:prod` で確かめる。`caddy build-info | grep -E '^go|caddy/v2|golang.org/x/net'` で、ビルドに使われた Go と依存の版も見る
      （脆弱性が Caddy 本体でなく Go や `golang.org/x/net` の側にあることがある。#668）
4. **すぐに** PR をマージする。本番を上げてからマージまでの間は、main の E2E が古い版のままになる。
   その間は Caddy の設定（`deploy/caddy/`）に触る PR をマージしない

切り戻しは、`apt-mark unhold caddy` → 退避した deb を `apt-get install --allow-downgrades -o Dpkg::Options::=--force-confold`
で入れ直す → `apt-mark hold caddy` → `systemctl restart caddy` です。E2E の版も戻します。
`apt-get update` が `EXPKEYSIG` で落ちたら、`/usr/share/keyrings/caddy-stable-archive-keyring.gpg` の署名用の
副鍵の期限が切れています。公式の `gpg.key` を取り直し、主鍵の指紋（`6576 0C51 EDEA 2017 CEA2 CA15 155B 6D79 CA56 EA34`）を
確かめてから置き換えます（2026-10-25 に踏みました）。

## 同一 IP の同時接続数制限（#143）

**同一送信元 IP からの 443 同時接続を 80 本までに制限する。** 適用は
`deploy/firewall/connlimit.sh`（**実際に効く値の正本はこのスクリプトの `CONNLIMIT_MAX`**）。

### 何の対策か

同時接続上限（`MAX_CONNECTIONS`・本番 200）は**グローバルで IP 単位ではない**ため、
単一 IP が枠を占有すると正規利用者を締め出せる（ADR 0011 脅威 S7）。それをネットワーク層で止める。
**アプリ側の IP 単位レート制限（#103）とは別軸**である —— あちらは入室・解錠の**失敗回数**、
こちらは**同時接続数**を見る。

### 上限を 80 にした根拠

1 人あたり約 2 接続（HTTP/2 多重化）なので、**同一拠点 40 人までは無傷**。
グローバル 200 枠に対して単一 IP が取れるのは 40% までで、独占はできない。
想定より大きい拠点が出たら緩める。**値を変えるときは、このスクリプトとこの節の両方を直すこと。**

### 使い方（root が要るので利用者のターミナルで実行する）

```bash
scp deploy/firewall/connlimit.sh niku9:~/connlimit.sh
ssh -t niku9 'sudo bash ~/connlimit.sh status'                          # 現状を見る
ssh -t niku9 'sudo bash ~/connlimit.sh apply --rollback-after 10min'    # 安全網つきで適用
# 正規利用に問題が無いことを確かめてから
ssh -t niku9 'sudo bash ~/connlimit.sh confirm'                         # 確定（自動巻き戻しを取消）
ssh -t niku9 'sudo bash ~/connlimit.sh rollback'                        # 手で戻す
```

- **22/tcp には触らないので SSH ロックアウトは起きない。** 残るリスクは
  「上限が低すぎて正規利用者を締め出す」ことだけなので `--rollback-after` で安全網を掛ける
- `before.rules` / `before6.rules` は適用時に日付つきで退避される
- スクリプトは冪等。既に入っていれば何もしない

### ⚠ CDN・リバースプロキシを前段に置くときは必ず外す

**Cloudflare のような CDN を前に置くと、全利用者の接続が CDN の少数の IP から来る。**
その瞬間、この規則は**全員を 80 本で頭打ちにする**（同一 IP と見なされるため）。
前段を増やすなら、このルールを外すか、CDN の IP を除外する必要がある。
#103 が `X-Forwarded-For` の信頼で同じ構造の罠を持っているのと同じ形である。

**退避ファイルは apply のたびに増える。** `/etc/ufw/before{,6}.rules.bak-<日時>` が
溜まるので、確定後は古いものを消してよい（消さなくても動作には影響しない）。

**`--rollback-after` の機構は確認済み**（2026-09-06）。`status` を積んだ使い捨てタイマーを
1 分後に仕掛け、予約時刻ちょうどに発火して root でスクリプトが完走することを journal で確認した。
`rollback` も手で実行して動作を確認済みだが、**「タイマー経由で `rollback` が走る」という
組み合わせそのものは、まだ観測していない**。

ファイアウォールを触らずに機構だけ試すには次を使う（transient なので完走後に自動で消える）:

```bash
sudo systemd-run --on-active=1min --unit=rb-test /bin/bash ~/connlimit.sh status
sudo journalctl -u rb-test.service --no-pager -n 30   # 発火の証拠はここにしか残らない
```

### 踏んだ罠（2026-09-06）

**IPv4 と IPv6 でチェーン名が違う。** `before.rules` は `ufw-before-input`、
`before6.rules` は **`ufw6-before-input`** である。同じ名前を両方へ書くと
`ip6tables-restore: No chain/target/match by that name` で `ufw reload` が失敗し、
**壊れたルールファイルが残って以後の起動でも失敗し続ける**（実際に本番で踏んだ）。

スクリプトは 2 つの手当てを持つ。

- 書く前に `:<チェーン名>` がそのファイルで定義されているかを確かめ、無ければ**書き換えずに落ちる**
- `ufw reload` に失敗したら、**その場で退避から戻して** reload し直す

**検証は `/usr/share/ufw/iptables/before{,6}.rules`（パッケージ同梱・誰でも読める）で行うこと。**
`/etc/ufw/` は root でないと読めないが、未編集なら同梱テンプレートと同一である。
自分で作った「stock 相当」のファイルで試すと、この罠は見つからない。

**`ufw reload` は無効時に黙って飛ばされる。** `ENABLED=no` のとき reload は
`Firewall not enabled (skipping reload)` と出して**何もせず成功を返す**。この状態で
適用すると、古いルールが残っているだけなのに検証が通り「入った」と誤判定する。
さらに悪いことに、**ルール投入に失敗した `ufw reload` は ufw を無効のまま残す**。
本番で実際に起きた（不正な v6 ルール → reload 失敗 → `ENABLED=no`）。復旧は
`sudo ufw --force enable`。スクリプトは適用前に `ufw status` が active であることを
確かめ、無効なら何もせず落ちる。

### 守らないもの（限界）

- **QUIC / HTTP/3（UDP 443）は数えない。** 本ルールは TCP の connlimit である。
  WebSocket は TCP を通るので接続枠の独占は防げるが、UDP 側は射程外
- **複数 IP へ分散する攻撃者は防げない**（#103 と同じ限界。ADR 0011 決定4）
- **IPv6 側は現在不活性。** 本番にグローバル IPv6 が無いため（ULA のみ）。
  後で有効にしたときに静かに穴が開かないよう、`before6.rules` にも
  **/64 で丸めた**同じルールを先に入れてある（#103 決定 D1 と同じ丸め方）

## 秘密の取り扱い

**秘密はリポジトリに置かない。** 実体は VPS 上の env ファイルだけに存在する。

| 秘密 | 置き場 | 用途 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/opt/tasuki/tasuki-sync.env`（600） | AI お題生成の子プロセスへ渡す（Console の API キー。#459） |
| `AI_UNLOCK_KEY` | 同上 | AI 生成の解錠合言葉。**一様乱数で生成する**（`openssl rand -hex 20`）。長さ・文字種の規範は `docs/adr/0011-threat-model-and-data-classification.md` 決定5 |
| `ADMIN_TOKEN` | 同上 | 管理エンドポイントの認証 |

- **権限は 600 を維持する。** `setup.sh` が作成時に設定するが、手で編集した後も
  `ls -l /opt/tasuki/tasuki-sync.env` で確認する
- **配り方**: `ssh -t "$TASUKI_SSH_HOST" 'sudo -e /opt/tasuki/tasuki-sync.env'` で
  VPS 上で直接編集する。ローカルに控えを作らない。scp で送らない
- **中身をログ・Issue・PR へ貼らない。** 値が必要な話は「どの変数か」だけで書く
- **`deploy/<app>/app.env` は追跡下にある。ここに秘密を書かない**（配備設定のみ）

### 失効の手順

漏洩を疑ったら、**まず失効させてから原因を調べる。**

| 秘密 | 失効のしかた |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Console（API keys）でキーを失効させ、新しいキーを発行して env を更新 |
| `AI_UNLOCK_KEY` | env の値を変えて `sudo systemctl restart tasuki-sync`。**利用者へ新しい合言葉を配り直す** |
| `ADMIN_TOKEN` | 同上（配り直しは運用者のみ） |

いずれも再起動を伴う。影響は前述の「[⚠ 再起動でルームは全消滅する](#-再起動でルームは全消滅する)」のとおり。緊急でなければ利用者のいない時間帯に行う。

**AI 機能を丸ごと止めたいとき**は `ANTHROPIC_API_KEY` か `AI_UNLOCK_KEY` の
どちらかを消して再起動する。どちらかが未設定なら AI は無効になり、解錠も常に失敗する
（`docs/timer/adr/0008`）。

### AI お題生成を OAuth トークンから API キーへ切り替える（#459・利用者の作業）

> **2026-11-22（`v4.7.0`）に、下の手順 1〜6 をすべて済ませた**（記録は冒頭の注記と #459 のコメント）。以下は記録と、組み直すとき（キーを発行し直す・別の環境で同じ切り替えをする）の手順として残す。

リポジトリは `CLAUDE_CODE_OAUTH_TOKEN` を読まなくなった。本番で次を**利用者が**行う
（Claude はサーバーの env を触らない）。決定の記録は `docs/adr/0012` の追記（2026-11-19・#459）。

⚠ **切り替わるのは、#459（PR #646）を含む同期サーバーを配ったときである。** それより前の版（`v4.6.1` まで）は
`CLAUDE_CODE_OAUTH_TOKEN` だけを読み、`ANTHROPIC_API_KEY` を読まない。古い版のまま旧トークンの行を消して
`systemctl restart` だけを流すと、**AI は無効になる**。新しい版は旧トークンを読まず、子プロセスにも渡さないので、
2 本を並べて置いても害は無い。そこで、キーを先に足し、旧トークンは新しい版を配って確かめてから消す。

1. Anthropic Console で、Max（または Team）プランに連携した組織の API キーを発行する。
   **自動チャージは無効**にする（クレジット切れで生成が止まり、定型へ縮退する。プランへの追加課金は無い）
2. `ssh -t "$TASUKI_SSH_HOST" 'sudo -e /opt/tasuki/tasuki-sync.env'` で `ANTHROPIC_API_KEY` を**追記する**
   （600 を維持）。`CLAUDE_CODE_OAUTH_TOKEN` の行はまだ消さない。再起動もしない（動いている古い版は旧トークンで動き続ける）。
   置けたかは、値を出さずに件数だけで確かめる。4 つとも `1` と出ればよい
   （前の 2 つは行の数で、重複が無いこと。後の 2 つは値が既定の形 `sk-ant-` で始まる行の数で、空・引用符つき・空白だけの値は数えない）:
   `ssh -t "$TASUKI_SSH_HOST" 'sudo ls -l /opt/tasuki/tasuki-sync.env; sudo grep -c "^ANTHROPIC_API_KEY=" /opt/tasuki/tasuki-sync.env; sudo grep -c "^CLAUDE_CODE_OAUTH_TOKEN=" /opt/tasuki/tasuki-sync.env; sudo grep -c "^ANTHROPIC_API_KEY=sk-ant-" /opt/tasuki/tasuki-sync.env; sudo grep -c "^CLAUDE_CODE_OAUTH_TOKEN=sk-ant-" /opt/tasuki/tasuki-sync.env'`
   （sudo がパスワードを聞くので、端末の付いたシェルで流す）
3. #459 を含む同期サーバーを配る（`deploy.sh timer`。ルームが全消滅するので利用者のいない時間帯に。
   ほかのアプリと配る順は、その回の注記に従う）。すでに #459 を含む版が動いているなら `sudo systemctl restart tasuki-sync`
4. 本番で確かめる（**5・6 へ進む前に**。ここで AI が無効なら、旧トークンが残っているうちに旧版へ戻せる）:
   - 起動ログ（`journalctl -u tasuki-sync`）の `ai` の行が `enabled=true` である（キーか解錠の合言葉のどちらかが欠けると false）。
     `enabled=false` で `ai-legacy-oauth-token-ignored` の警告も出ていたら、キーの行が無いか値が空のまま配っている（2 をやり直し、新しい版はもう動いているので `sudo systemctl restart tasuki-sync` で読み直させる）
   - AI の生成が成功する（お題ツールで解錠して生成する。キーの値そのものの誤り・失効は、ここでしか分からない）
   - Console の使用量（クレジット）が減り、プラン側の Claude Code 使用量が増えない
   - Console の自動チャージが無効（または意図した上限）である
   - **API キーだけで認証されていること**: `claude` の子プロセスは本番の HOME（`/opt/tasuki/claude-home`）の
     資格情報を持ち得る。それが先に使われてプラン側へ精算されていないかを、上の使用量の増減で見る
     （手元では測れない。プラン側へ付くなら、HOME の資格情報を外す）
5. 4 を確かめてから、env の `CLAUDE_CODE_OAUTH_TOKEN` の行を消す（新しい版は読まないので、再起動は要らない）。
   消した後で同期サーバーを #459 より前の版へ戻すと（`server.js.bak-*` からの切り戻し）、AI は無効になる
6. 旧 OAuth トークン（`claude setup-token` で発行したもの）を失効させる

## SSH の準備

`deploy.sh` は `rsync` / `scp` / `ssh` を非対話で叩くため、**パスフレーズ無しの鍵**を
使うか ssh-agent に載せておく。

```
# ~/.ssh/config
Host <ホスト別名>
  HostName <VPS の IP>
  User <ログインユーザー>
  IdentityFile ~/.ssh/<鍵>
  IdentitiesOnly yes
```

`deploy.sh` は SSH 先で `sudo systemctl restart` を実行する。一般ユーザーで運用する
場合は passwordless sudo が必要（`setup.sh` が設置する）。

## ファイル

```
deploy/
├── README.md                このファイル（共通手順の正本）
├── deploy.sh                共通ドライバ:  ./deploy/deploy.sh <app>
├── setup.sh                 共通 VPS セットアップ:  sudo bash setup.sh <app>
├── lib/common.sh            app.env の読込・検証
├── caddy/                   サイトブロックと設置手順
└── <app>/
    ├── app.env              このアプリの値（唯一の定義場所）
    ├── service.tmpl         systemd ユニットのテンプレート
    ├── env.example          env のテンプレート（実体はコミットしない）
    ├── caddy/*.conf         Caddy 断片
    └── NOTES.md             このアプリ固有の経緯・注意
```

## 自動化していない作業

**デプロイの自動化は行わないと決めています**（[`docs/adr/0009`](../docs/adr/0009-ci-scope-and-checks.md) D5）。
再起動で稼働中のルームが全消滅するため、実行のタイミングは利用状況を知っている人が判断します。
CI から自動デプロイもしません。

`deploy/deploy.sh` が行うのはアプリ 1 つ分のビルド・転送・再起動だけです。
次は**すべて手作業**です。

| 作業 | 内容 |
|---|---|
| Caddy 断片の設置 | `deploy/caddy/tasuki.conf` をサーバーへ置き、旧ファイルを消す |
| 反映前の検証 | `caddy validate` を通してから reload する |
| 全アプリの一括切替 | 一括の手段は無い。`deploy.sh` をアプリごとに叩く |
| 切り戻し | スクリプト化していない。本 README の手順を手でたどる（**退避だけは `deploy.sh` が行う**・#146） |
| デプロイ後の検証 | 配信ハッシュの一致・`/ws` の応答（唯一の WS 入口。#95 S5c）・各アプリの公開パスの応答は、人が `pnpm verify:prod` を流して確かめる（#675。上の「[動作確認](#動作確認)」。`deploy.sh` はこのコマンドを案内するだけで実行しない）。**起動の確認（`is-active` 2 回と `NRestarts`）だけは `deploy.sh` が実行する**（#146） |
| 配る順・タグ・記録 | 人が決めて書く。たどる項目は上の「[配る時の確認の一覧](#配る時の確認の一覧)」。前のタグからの変更の一覧だけは `pnpm changes:since <前のタグ>` が出す（順は出さない） |

（各アプリの公開の状態は冒頭の表、配った回の記録はその下の注記を見る。2026-10-30 の `v4.5.0` で 7 本すべてが公開中）

最後に、配るアプリをすべて出し終えてから、サイト全体を外から通しで確認します（`--e2e` は、ハッシュ・公開パス・`/ws` が揃っているときだけ、続けて `pnpm e2e:prod` を流します）。

```bash
TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm verify:prod --e2e
```

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| `ERROR: 接続先が未設定です` | `TASUKI_SSH_HOST` を指定する。既定値は意図的に置いていない |
| `systemctl start` が即失敗する | ユニットの `ExecStart` の bun パスが実際と違う。`which bun` に合わせる（`BUN_PATH=` で指定可） |
| リモートでパスワード入力待ちになる | passwordless sudo が未設定。`setup.sh` を実行する |
| `/ws` が 426 でなく 200 を返す | Caddy の包括フォールバック（`90-*.conf`）が先に評価されている。断片の順序を確認（`deploy/caddy/README.md`） |
| 配信中のハッシュがローカルと違う（`pnpm verify:prod` が「ずれ」と出す） | rsync が失敗しているか、web root が想定と違う。`app.env` の `WEB_ROOT` を確認。配った後に手元で `pnpm build` し直していれば、手元の方が変わっている |
| `pnpm verify:prod` が「手元の … がありません」と出す | 手元にビルドが無い。配った端末で流すか、配ったコミットを `pnpm build` してから流す |
