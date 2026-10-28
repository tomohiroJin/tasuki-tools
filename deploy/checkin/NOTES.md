# checkin（Check-in Cards）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## 配布の手順（#406）

> **未配布。** この資材は置いただけで、本番へは配っていない。配るのは**利用者の明示の指示を得てから**で、
> **利用者が使っていない時間帯**に行う（`deploy.sh timer` の再起動で、すべてのツールのルームが消える）。
> 同期サーバー（`?tool=checkin`）と web を同じ回で配る。

### 順序

**checkin → main 側の未配布の静的アプリ → landing → timer。** 静的なものと timer は**間を空けずに続けて流す**。
同期サーバーを再起動するのは最後の `deploy.sh timer` だけである（ほかは `STATIC_ONLY=1`）。
静的アプリは landing の前に置く（未配布の変更がある静的アプリは landing より先。[`../roulette/NOTES.md`](../roulette/NOTES.md) の決め）。

| # | やること | なぜこの位置か |
|---|---|---|
| 1 | 初回の用意（下）で web root を作り、`caddy/70-checkin.conf` を設置して `caddy validate` → reload する（[`../caddy/README.md`](../caddy/README.md) の「設置」） | **置き忘れると `/checkin/` は包括フォールバック（玄関）に吸われ、札を押しても玄関が描き直されるだけになる** |
| 2 | `deploy.sh checkin` | ここから 5 までを続けて流す |
| 3 | `deploy.sh poker`・`deploy.sh topic`・`deploy.sh roulette`・`deploy.sh agenda` | **main 側の未配布の変更**（#447 段 1 のルーム画面の共通の見出し）。未配布の変更がある静的アプリは landing の前に置く。配る直前に `git log --oneline <最後のタグ>..HEAD -- 'apps/*-web' 'apps/timer*' packages/ui packages/invite-ui` で数え直し、増えていれば足す・配り済みなら外す |
| 4 | `deploy.sh landing` | 玄関に 6 枚目の札が出る。静的の最後に回し、札が見えてから同期サーバーの再起動までを短くする |
| 5 | `deploy.sh timer` | web を配ってから同期サーバーを再起動する。timer の web には #447 段 2（ロビーとセッションの見出し）も載る |
| 6 | 動作確認（下） | **`pnpm e2e:prod` は 5 まで配り終えてから流す** |

```bash
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh checkin
for app in poker topic roulette agenda; do TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh "$app"; done
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh landing
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer    # 同期サーバーもここで入れ替わる
```

### 配布中の窓

いずれも再読込と同期サーバーの再起動で閉じる。

1. **新しい checkin-web × 旧い同期サーバー**: 旧いサーバーは `?tool=checkin` を知らず、1008（Unknown tool）で閉じる。画面は「接続中です…」のまま
2. **新しい landing × 旧い同期サーバー**: 6 枚目の札は見えるが、押した先は 1 と同じ
3. **古い landing × 新しい同期サーバー**: 名簿の `tools` に `"checkin"` が載る。古い玄関は対応表に無い綴りを隠さず生のまま出すので、「checkin にいます」と出る（再読込で「Check-in Cards にいます」に直る）

### 配った後の確認

```bash
HOST=https://<公開ドメイン>
# 断片を置き忘れても玄関が 200 を返すので、状態コードでは見分けられない。資材の接頭辞を見る
curl -s "$HOST/checkin/" | grep -o '/checkin/assets/' | head -1   # 1 行出れば正常
```

⚠ **配布前の本番へ `pnpm e2e:prod` を当てると `@smoke`（`routing`・`site-exterior`）と `@core` が落ちる。**
`/checkin/` がまだ無いので、`/checkin/` を見るテストが失敗する。配り終えてから流す。

## 静的サイト

同期サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- `deploy.sh checkin` はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-checkin`）と Caddy 断片だけ

## 初回の用意（ホスト側・root）

```bash
# web root を DEPLOY_USER 所有で作る（転送が sudo 不要になる）
sudo install -d -o <DEPLOY_USER> -g <DEPLOY_USER> -m 755 /var/www/tasuki-checkin
# 断片の設置（70-checkin.conf）と、検証（caddy validate）・再読込（reload）は ../caddy/README.md の手順に従う
```

## base パスに注意

公開パス `/checkin/` は **`apps/landing/src/tools.ts`・`apps/checkin-web/vite.config.ts` の `base`・
`app.env` の `PUBLIC_PATH`・`caddy/70-checkin.conf` の 4 か所**で揃えている。どれか 1 つでも取り残すと、
白画面か 404 になる。
