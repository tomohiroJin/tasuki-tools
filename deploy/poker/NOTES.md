# poker 固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## 初回公開は 2026-08-28（#66）

**本番へ出ています。** epic #15 の全段階が終わったあと、#66 で 3 系統をまとめて
1 回でデプロイしました。

公開前の `https://<公開ドメイン>/poker` が 200 を返していたのは、**timer の SPA
フォールバックが timer の `index.html` を返していただけ**で、poker の実体では
ありませんでした。`caddy/20-poker.conf` の設置によって実体が公開されています。
公開の確認は配信アセットのハッシュがローカルビルドと一致することで取りました
（200 が返るだけでは、上記のとおり公開の証拠になりません）。

公開に耐えるための防御（Origin 検査・サイズ制限・接続数上限・ルーム数上限・死活監視）は
[#63](https://github.com/tomohiroJin/tasuki-tools/issues/63) で入っています。

## 稼働情報（#95 S2 で変わりました）

| 項目 | 値 |
|---|---|
| サービス | **無し**（同期は統合サーバー `tasuki-sync` が受ける） |
| ポート | **無し**（WebSocket は 8787 の統合サーバーへ Caddy が中継） |
| 配置先 | `/var/www/tasuki-poker`（web のみ） |
| 公開パス | `/poker/` |

**poker は静的サイトになりました。** 同期サーバーは timer と 1 プロセスへ統合され
（`apps/tasuki-sync`）、poker 専用の systemd ユニット・ポート・env ファイルはありません。
共有されるのは Caddy プロセスと**同期サーバーのプロセス**です。

> ⚠ **障害の影響範囲が広がりました。** 統合前は timer が落ちても poker は生きていましたが、
> 今後は両方が同時に落ちます。揮発インメモリ設計（`docs/timer/adr/0007`）のもとでは
> 「ルームが消える」という結果は同じなので、影響の深さは変わらず広さだけが変わります。

### 旧ユニット（`tasuki-poker-sync`）の停止手順

統合後の版を配布したあと、**本番で 1 度だけ**実行します。順序を逆にすると
poker の同期が切れる時間ができます。

> ⚠ **手順 1 を飛ばすと実効枠が半減する。** `deploy/setup.sh` は
> `[ -f "$APP_DIR/$ENV_FILE" ]` のとき env を**上書きしない**（既存を保持する）ため、
> `deploy/timer/env.example` の `MAX_CONNECTIONS=400` は本番へ自動では届かない。
> 本番の `/opt/tasuki/tasuki-sync.env` は旧テンプレート（`MAX_CONNECTIONS=200`）から
> 作られており、そのままだと**統合後の timer と poker が合計 200 枠を共有する**
> （201 本目が 1013 で拒否される）。設計正本 D22 が避けようとした事態そのものである。

```bash
# 1. 本番の env を統合後の値へ直す（**配る前に**。setup.sh は既存 env を上書きしない）
#    env は DEPLOY_USER 所有の 600 で、ログインユーザーがそのまま編集できる（sudo は要らない。
#    このホストの sudo は systemctl の数コマンドしか NOPASSWD になっていない）。
ssh <ホスト別名> "sed -i 's/^MAX_CONNECTIONS=200\$/MAX_CONNECTIONS=400/' /opt/tasuki/tasuki-sync.env"
#    **必ず目で確かめる。** 値を手で変えてあった場合、上の sed は何もせず成功する
ssh <ホスト別名> "grep '^MAX_CONNECTIONS=' /opt/tasuki/tasuki-sync.env"

# 2. 統合後の版を配る（timer の app.env が統合サーバーを指している）
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh poker   # web のみ・STATIC_ONLY

# 3. 新しい 20-poker.conf（/poker/ws → 8787）を設置して Caddy を読み直す
#    ここまでで poker の WebSocket は統合サーバーが受けている
sudo systemctl reload caddy

# 4. 旧ユニットを停止・無効化する
sudo systemctl stop tasuki-poker-sync
sudo systemctl disable tasuki-poker-sync

# 5. 3311 が解放されたことを確かめる（何も出なければ解放済み）
ss -tlnp | grep ':3311'
```

ユニットファイル（`/etc/systemd/system/tasuki-poker-sync.service`）と
`/opt/tasuki-poker` は、しばらく残して切り戻せるようにしておきます。
撤去するときは `sudo systemctl daemon-reload` を忘れないこと。

## 接続・フレーム層の防御（[#63](https://github.com/tomohiroJin/tasuki-tools/issues/63)）

公開に耐えるための防御は sync サーバー側にあります。**設定値は env が単一の入口**で、
既定値は `apps/tasuki-sync/src/config.ts` にまとまっています
（つまみは [`../timer/env.example`](../timer/env.example) 参照。統合により poker 専用の
env テンプレートは無くなりました）。

| 防御 | 振る舞い |
|---|---|
| Origin 検査 | `ALLOWED_ORIGINS` 以外からの接続を 1008 で閉じる。**本番で未設定なら起動しない** |
| 待ち受けアドレス | 既定で `127.0.0.1` のみ。Caddy を迂回した直接接続が届かない |
| メッセージサイズ | 64KB 超はエラー応答（**接続は保つ**）。バイト数で測る |
| フレームサイズ | メッセージ上限の 2 倍（既定 128KB）超はプロトコル層で切断。応答の余地が無い帯域 |
| 同時接続数 | 上限超過を 1013 で拒否。**timer と共有の枠**（統合後は 1 プロセス 1 レジストリ） |
| ルーム数 | 上限超過時は**新規作成のみ**拒否。既存ルームへの参加は妨げない。枠は timer と別 |
| 死活監視 | ping/pong。応答の無い接続を切り、他の参加者から `disconnected` に見えるようにする |

`ALLOWED_ORIGINS` を実値にし忘れたまま本番起動すると、サーバーは**起動を拒否して
即座に落ちます**。黙って全 Origin を許可するより落ちる方が安全という判断です。

> ⚠ **#95 S2 の統合で、理由が journal に出なくなりました。** 統合前の poker は例外を
> 投げっぱなしにしていたので `systemctl status` に文言が出ましたが、統合サーバーは
> 例外を捕まえて `config-error name=Error` だけを出します（ADR 0012 D3。例外メッセージには
> 資格情報が載りうるため意図的に抑制しています）。`config-error` が出て落ちていたら、
> 起動時 fail-closed の 3 条件を疑ってください ——
> `ALLOWED_ORIGINS` が空 / `HOST` がループバック以外 / `NODE_ENV` が未知の値
> （判定は `apps/tasuki-sync/src/config.ts`）。

## web のビルド設定

`apps/poker-web` は `vite.config.ts` で `base: '/poker/'` を指定しています。ビルド成果物の
参照は `/poker/assets/...` になるため、**`/poker/` 以外のパスへ配置すると壊れます**。

## 相互無干渉について

**#95 S2 で成立しなくなりました。** 公開時（#66）に確かめた「poker の WebSocket
セッションを繋いだまま timer を再デプロイしても poker 側が切れない」は、
同期サーバーが 2 プロセスあることが前提でした。統合後は `tasuki-sync` の再起動で
両方のセッションが切れます。web の配信（`/var/www/*`）は従来どおり互いに独立です。

## SDD 成果物

仕様・設計・受け入れ基準は [`../../docs/poker/specs/`](../../docs/poker/specs/) にあります。
