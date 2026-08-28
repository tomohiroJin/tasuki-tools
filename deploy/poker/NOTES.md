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

## 稼働情報

| 項目 | 値 |
|---|---|
| サービス | `tasuki-poker-sync` |
| ポート | 3311（`127.0.0.1` のみ待受） |
| 配置先 | `/opt/tasuki-poker`（server.js・env）/ `/var/www/tasuki-poker`（web） |
| 公開パス | `/poker/` |

timer とは**別ポート・別 systemd ユニット・別 Caddy 断片**で同居します。共有されるのは
Caddy プロセスのみです。

## 接続・フレーム層の防御（[#63](https://github.com/tomohiroJin/tasuki-tools/issues/63)）

公開に耐えるための防御は sync サーバー側にあります。**設定値は env が単一の入口**で、
既定値は `apps/poker-sync/src/config.ts` にまとまっています（つまみは `env.example` 参照）。

| 防御 | 振る舞い |
|---|---|
| Origin 検査 | `ALLOWED_ORIGINS` 以外からの接続を 1008 で閉じる。**本番で未設定なら起動しない** |
| 待ち受けアドレス | 既定で `127.0.0.1` のみ。Caddy を迂回した直接接続が届かない |
| メッセージサイズ | 64KB 超はエラー応答（**接続は保つ**）。バイト数で測る |
| フレームサイズ | メッセージ上限の 2 倍（既定 128KB）超はプロトコル層で切断。応答の余地が無い帯域 |
| 同時接続数 | 上限超過を 1013 で拒否 |
| ルーム数 | 上限超過時は**新規作成のみ**拒否。既存ルームへの参加は妨げない |
| 死活監視 | ping/pong。応答の無い接続を切り、他の参加者から `disconnected` に見えるようにする |

`ALLOWED_ORIGINS` を実値にし忘れたまま本番起動すると、サーバーは**起動を拒否して
即座に落ちます**（`systemctl status` に理由が出る）。黙って全 Origin を許可するより
落ちる方が安全という判断です。

## web のビルド設定

`apps/poker-web` は `vite.config.ts` で `base: '/poker/'` を指定しています。ビルド成果物の
参照は `/poker/assets/...` になるため、**`/poker/` 以外のパスへ配置すると壊れます**。

## 公開時（S4）にやること

1. `sudo DEPLOY_USER=<user> bash deploy/setup.sh poker`（ディレクトリ・env・ユニット・sudoers）
2. `/opt/tasuki-poker/tasuki-poker-sync.env` の `ALLOWED_ORIGINS` を実値へ
3. **`deploy/poker/caddy/20-poker.conf` を `/etc/caddy/tasuki/apps/` へ設置**
   （置いた瞬間に公開される。順序は `10-` の後・`90-` の前）
4. `TASUKI_SSH_HOST=<host> ./deploy/deploy.sh poker`
5. `sudo systemctl start tasuki-poker-sync`
6. **相互無干渉の実証**（#17 から引き取った項目）:
   poker の WebSocket セッションを繋いだまま timer を再デプロイし、poker 側が切れないこと

## SDD 成果物

仕様・設計・受け入れ基準は [`../../docs/poker/specs/`](../../docs/poker/specs/) にあります。
