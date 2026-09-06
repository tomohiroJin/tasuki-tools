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
| `poker` | `tasuki-poker-sync` | 3311 | `/opt/tasuki-poker` / `/var/www/tasuki-poker` | `/poker/` | 公開中 |

> **3 系統は 2026-08-28 に本番へ出た（#66）。** Planning Poker と玄関 LP はこのときが初回公開。
> 再起動でルームが全消滅するため、デプロイは指示を得てまとめて 1 回行う方針は変わらない。

### 公開範囲の方針（重要）

**本番に公開しているのは TDD Mob Pro Timer（`packages/timer-core` / `apps/timer-*`）のみである。**

- Planning Poker（`packages/poker-core` / `apps/poker-*`）は同一リポジトリにあるが未公開。
  デプロイはアプリ単位（`./deploy/deploy.sh <app>`）で、poker を明示的に指定しない限り
  転送されない。さらに Caddy 断片 `20-poker.conf` を設置していないため、**仮に配置しても
  公開されない**（S2 / #17 で入れた二重の歯止め）。
- 公開ドメインの `/poker` パスが 200 を返すことがあるのは、Caddy の SPA フォールバックにより
  timer の `index.html` が返っているだけで、Planning Poker の実体ではない。
- **Planning Poker の公開は #66（S4 の成果を本番へ出す）で行う。** 上記の S4 注記のとおり
  epic #15 の全段階が終わってから 1 回にまとめて実施する方針であり、個別の前倒しは行わない。

`landing` は **sync サーバーを持たない静的サイト**で、Caddy が直接配信する。`app.env` に
`STATIC_ONLY=1` を置くと、`deploy.sh` はバンドルとサービス再起動の段を飛ばし、
`setup.sh`（systemd ユニット・sudoers）も不要になる。

> `timer` のサービス名が命名規約（`tasuki-<tool>-sync`）から外れているのは、
> **稼働中のユニットを改名しない**と決めたため。改名は「旧停止 → 新起動」の切り替えを
> 伴い、失敗すればサービス断になる。得られるのは命名の一貫性だけで機能上の利得が無い。

## 通常運用（更新）

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

## 動作確認

```bash
HOST=https://<公開ドメイン>

# ① 新版が確実に出た決定的証拠: 配信中のハッシュとローカルビルドの一致
LOCAL=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' apps/timer-web/dist/index.html | head -1)
REMOTE=$(curl -s "$HOST/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
[ "$LOCAL" = "$REMOTE" ] && echo 一致 || echo 不一致

# ② ヘッダとステータス
curl -sI "$HOST/" | grep -Ei 'HTTP/|x-robots-tag|strict-transport'

# ③ WebSocket は 426 が正常（200 なら SPA フォールバックに吸われている）
curl -s -o /dev/null -w '%{http_code}\n' "$HOST/ws"

# ④ クラッシュループしていないこと（20 秒あけて 2 回・NRestarts と MainPID を見る）
ssh "$TASUKI_SSH_HOST" 'systemctl --no-pager show tasuki-sync -p ActiveState -p NRestarts -p MainPID'
sleep 20
ssh "$TASUKI_SSH_HOST" 'systemctl --no-pager show tasuki-sync -p ActiveState -p NRestarts -p MainPID'

# ⑤ 起動ログに異常が無いこと
ssh "$TASUKI_SSH_HOST" 'journalctl -u tasuki-sync -n 12 -o cat'
```

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
| `CLAUDE_CODE_OAUTH_TOKEN` | `/opt/tasuki/tasuki-sync.env`（600） | AI お題生成の子プロセスへ渡す |
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
| `CLAUDE_CODE_OAUTH_TOKEN` | Anthropic のコンソールでトークンを失効させ、`claude setup-token` で再発行して env を更新 |
| `AI_UNLOCK_KEY` | env の値を変えて `sudo systemctl restart tasuki-sync`。**利用者へ新しい合言葉を配り直す** |
| `ADMIN_TOKEN` | 同上（配り直しは運用者のみ） |

いずれも再起動を伴う。影響は前述の「[⚠ 再起動でルームは全消滅する](#-再起動でルームは全消滅する)」のとおり。緊急でなければ利用者のいない時間帯に行う。

**AI 機能を丸ごと止めたいとき**は `CLAUDE_CODE_OAUTH_TOKEN` か `AI_UNLOCK_KEY` の
どちらかを消して再起動する。どちらかが未設定なら AI は無効になり、解錠も常に失敗する
（`docs/timer/adr/0008`）。

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
| デプロイ後の検証 | 配信ハッシュの一致・`/timer/ws` と `/poker/ws` の応答・3 系統の応答を手で確認する（`deploy.sh` は確認コマンドを案内するだけで実行しない）。**起動の確認（`is-active` 2 回と `NRestarts`）だけは `deploy.sh` が実行する**（#146） |

（3 系統とも #66 で公開済み）

最後に、サイト全体を外から通しで確認します。

```bash
TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm e2e:prod
```

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| `ERROR: 接続先が未設定です` | `TASUKI_SSH_HOST` を指定する。既定値は意図的に置いていない |
| `systemctl start` が即失敗する | ユニットの `ExecStart` の bun パスが実際と違う。`which bun` に合わせる（`BUN_PATH=` で指定可） |
| リモートでパスワード入力待ちになる | passwordless sudo が未設定。`setup.sh` を実行する |
| `/ws` が 426 でなく 200 を返す | Caddy の包括フォールバック（`90-*.conf`）が先に評価されている。断片の順序を確認（`deploy/caddy/README.md`） |
| 配信中のハッシュがローカルと違う | rsync が失敗しているか、web root が想定と違う。`app.env` の `WEB_ROOT` を確認 |
