# landing（玄関 LP）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## ⚠ 本番未公開

**S3（#18）の時点では公開していません。** 資材は用意してありますが、Caddy 断片
`caddy/30-landing.conf` を設置していないため、まだ誰も到達できません。

- **S3**: 暫定パス `/home/` で配信する（既存 URL `/` = timer には触れない）
- **S4（#19）**: ルート `/` へ移し、timer を `/timer/` へ移設する

## 静的サイト

sync サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- `deploy.sh landing` はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-home`）と Caddy 断片だけ

## base パスに注意

`vite.config.ts` の `base` が公開パスと一致していないと、アセットの参照が壊れます。

| 段階 | `base` | 公開パス |
|---|---|---|
| S3（現在） | `/home/` | `/home/` |
| S4 | `/` | `/` |

**S4 で移設するときは `base`・`app.env` の `WEB_ROOT`／`PUBLIC_PATH`・Caddy 断片を
まとめて変えること。** どれか 1 つでも取り残すと、白画面か 404 になります。

## 遷移先

各カードの `href` は `src/tools.ts` の 1 箇所にまとまっています。S4 で timer が
`/timer/` へ移るときは、ここを変えればテストも一緒に落ちます
（`tests/App.test.tsx` が値を直接押さえているため、変え忘れに気づけます）。
