# topic（お題ツール）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## まだ公開していない

**#91 の PR 3 が main に入った後、1 回だけ配る**（設計正本 `docs/superpowers/specs/2026-09-23-shared-topic-design.md` §6）。
PR 2 と PR 3 の間の main は、玄関でお題を出せるのに timer に出ない中間状態なので、**配らない**。
順序（topic → poker → landing → timer）と配布中の窓は §6 にあり、PR 3 でこの文書へ書き足す。

## 静的サイト

同期サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- `deploy.sh topic` はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-topic`）と Caddy 断片だけ

## 初回の用意（ホスト側・root）

```bash
# web root を DEPLOY_USER 所有で作る（転送が sudo 不要になる）
sudo install -d -o <DEPLOY_USER> -g <DEPLOY_USER> -m 755 /var/www/tasuki-topic
# 断片の設置と検証・再読込は ../caddy/README.md の手順に従う
```

## base パスに注意

公開パス `/topic/` は **`apps/landing/src/tools.ts`・`apps/topic-web/vite.config.ts` の `base`・
`app.env` の `PUBLIC_PATH`・`caddy/40-topic.conf` の 4 か所**で揃えている。どれか 1 つでも取り残すと、
白画面か 404 になる。
