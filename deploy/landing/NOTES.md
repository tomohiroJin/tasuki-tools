# landing（玄関 LP）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## ルート（`/`）の玄関

S4（#19）でルートへ移した。**包括フォールバックは LP が持つ**ため、
`caddy/90-landing.conf` は必ず最後に読ませる（番号 90 はそのため）。

- **S3（#18）**: 暫定パス `/home/` で配信していた（既存 URL `/` = timer には触れなかった）
- **S4（#19）**: ルート `/` へ移し、timer を `/timer/` へ移設した

⚠ **ホスト上の旧 `30-landing.conf` を消すこと。** 残すと `/home/` でも LP に到達でき、
公開 URL が 2 つある状態になる（手順は [`../caddy/README.md`](../caddy/README.md)）。

## 静的サイト

sync サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- `deploy.sh landing` はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-home`）と Caddy 断片だけ

## base パスに注意

`vite.config.ts` の `base` が公開パスと一致していないと、アセットの参照が壊れます。
**移設するときは `base`・`app.env` の `PUBLIC_PATH`・Caddy 断片をまとめて変えること。**
どれか 1 つでも取り残すと、白画面か 404 になります（`WEB_ROOT` は S4 でも据え置き）。

| 段階 | `base` | 公開パス |
|---|---|---|
| S3 | `/home/` | `/home/` |
| S4（現在） | `/` | `/` |

## 遷移先

各カードの `href` は `src/tools.ts` の 1 箇所にまとまっています。値は
`tests/App.test.tsx` が直接押さえているため、変え忘れに気づけます。

## Caddy 断片の並び順は自動で検査している

`tests/caddy-fragment-order.test.ts` が `deploy/*/caddy/*.conf` を走査し、
**包括フォールバックが 1 本だけで、ファイル名順で最後に来ること**を固定しています。
断片を足す・番号を変えるときはこのテストが落ちて気づけます。

このテストが LP のパッケージにあるのは、包括フォールバックを持つのが LP の断片だからです。
加えて CI が実行するのはパッケージの test タスクだけで、`scripts/` 配下の検査は手動実行
のため、そちらに置くと静かに効かなくなります。
