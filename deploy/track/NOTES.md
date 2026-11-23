# track（うちわけ）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## 配布の手順（#476）

> まだ配っていない。以下は配る前に書いた案である。配ったら、実際の順と確かめた結果をここへ記録する。

### 順序

**同期サーバー（timer の配布）が先、画面が後。** wire の決め（[`docs/adr/0026`](../../docs/adr/0026-facilitator-roulette.md)）に従う。
新しいアプリの断片を置いてから track の配布までは、続けて流す（空の web root を指す窓を短くする。
[`../checkin/NOTES.md`](../checkin/NOTES.md) の冒頭の記録）。

| # | やること | なぜこの位置か |
|---|---|---|
| 1 | timer の配布（同期サーバーが入れ替わる） | 新しい同期サーバーが `?tool=track` を受けられるようにする。接続が 0 本の時間帯に行う（ルームがすべて消える） |
| 2 | 初回の用意（下）で web root を作り、`caddy/80-track.conf` を設置して検証・再読込する（[`../caddy/README.md`](../caddy/README.md) の「設置」） | **置き忘れると `/track/` は包括フォールバック（玄関）に吸われ、札を押しても玄関が描き直されるだけになる** |
| 3 | track の配布 | 2 から間を空けずに流す |
| 4 | main 側に未配布の変更がある静的アプリの配布 | 配る直前に `git log --oneline <最後のタグ>..HEAD -- 'apps/*-web' packages/ui packages/invite-ui packages/web-kit` で数える。**書体の base 層（`packages/ui/src/fonts`）を作り直しているので、全アプリが対象になる** |
| 5 | landing の配布 | 玄関に 7 枚目の札が出る。静的の最後に回す |
| 6 | 動作確認（下） | **`pnpm e2e:prod` は 5 まで配り終えてから流す** |

### 配布中の窓

いずれも再読込と同期サーバーの再起動で閉じる。

1. **古い landing × 新しい同期サーバー**: 名簿の `tools` に `"track"` が載る。古い玄関は対応表に無い綴りを隠さず生のまま出すので、「track にいます」と出る（再読込で「Uchiwake にいます」に直る）
2. **断片を置いてから track を配るまで**: `/track/` が空の web root を指す。古い玄関には `/track/` への札が無いので、URL を直に打たない限り届かない
3. **新しい書体 × 古い画面**: base 層のファイル名は変わらず中身が変わる。古い `fonts.css` の `unicode-range` に無い字は ext 層から引かれるだけで、表示は崩れない

### 配った後の確認

```bash
HOST=https://<公開ドメイン>
# 断片を置き忘れても玄関が 200 を返すので、状態コードでは見分けられない。資材の接頭辞を見る
curl -s "$HOST/track/" | grep -o '/track/assets/' | head -1   # 1 行出れば正常
```

⚠ **配布前の本番へ `pnpm e2e:prod` を当てると `@smoke`（`routing`・`site-exterior`）と `@core` が落ちる。**
`/track/` がまだ無いので、`/track/` を見るテストが失敗する。配り終えてから流す。

実機で見ること: 2 台で同じルームを開き、切り替えが両方に出ること・裏のタブから戻って経過が合うこと・
全員が閉じて 1 分以上おいてから開き直すと、問いかけが出ること・Markdown のコピーを Slack と Markdown のエディタに貼って崩れないこと。

## 静的サイト

同期サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- track の配布はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-track`）と Caddy 断片だけ

## 初回の用意（ホスト側・root）

```bash
# web root を DEPLOY_USER 所有で作る（転送が sudo 不要になる）
sudo install -d -o <DEPLOY_USER> -g <DEPLOY_USER> -m 755 /var/www/tasuki-track
# 断片の設置（80-track.conf）と、検証（caddy validate）・再読込（reload）は ../caddy/README.md の手順に従う
```

## 記録は揮発する

うちわけの記録は同期サーバーのメモリにだけある。**同期サーバーの再起動（timer の配布）で、計測中の記録もすべて消える。**
利用者が持ち帰る手段は Markdown のコピーだけなので、配布は接続が 0 本の時間帯に行う。

## base パスに注意

公開パス `/track/` は **`apps/landing/src/tools.ts`・`apps/track-web/vite.config.ts` の `base`・
`app.env` の `PUBLIC_PATH`・`caddy/80-track.conf` の 4 か所**で揃えている。どれか 1 つでも取り残すと、
白画面か 404 になる。
