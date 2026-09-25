# topic（お題ツール）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## 配布の手順（#91 を 1 回で配る）

**#91 の 3 本の PR（PR 1〜PR 3）が main に入った後、1 回だけ配る**（設計正本
[`docs/superpowers/specs/2026-09-23-shared-topic-design.md`](../../docs/superpowers/specs/2026-09-23-shared-topic-design.md) §6）。
配るのは**利用者の明示の指示を得てから**で、**利用者が使っていない時間帯**に行う
（`deploy.sh timer` の再起動で timer・poker・お題のルームがすべて消える）。

### 順序

**topic → poker → landing → timer。** 静的な 3 本と timer は**間を空けずに続けて流す**。
同期サーバーを再起動するのは最後の `deploy.sh timer` だけである（ほかは `STATIC_ONLY=1`）。

| # | やること | なぜこの位置か |
|---|---|---|
| 1 | 初回の用意（下の「初回の用意」）で web root を作り、`caddy/40-topic.conf` を設置して `caddy validate` → reload する（[`../caddy/README.md`](../caddy/README.md) の「設置」） | 断片を置いた時点で `/topic/` は公開されるが、中身はまだ空で、古い玄関には札が無いので誰も辿り着かない。**置き忘れると `/topic/` は包括フォールバック（玄関）に吸われ、4 で出る札を押しても玄関が描き直されるだけになる** |
| 2 | `deploy.sh topic` | ここから 5 までを続けて流す |
| 3 | `deploy.sh poker` | 新しい poker は `topic` フレームを先に見分ける。旧いサーバーはまだ送らないので、お題が出ないだけで害は無い |
| 4 | `deploy.sh landing` | 玄関に 3 枚目の札が出る。**静的な 3 本の最後に回す**のは、札が見えてから同期サーバーの再起動までの時間を短くするため（下の窓 1） |
| 5 | `deploy.sh timer` | timer の web を配ってから同期サーバーを再起動する（`deploy.sh` の内部の順序は選べない —— #276） |
| 6 | 動作確認（下の「配った後の確認」） | **`pnpm e2e:prod` は 5 まで配り終えてから流す**（下の注意） |

```bash
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh topic
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh poker
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh landing
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer    # 同期サーバーもここで入れ替わる
```

### 配布中の窓（3 つ）

いずれも**画面の再読込で閉じ、同期サーバーの再起動でルームはどのみち全部消える**ので受容する（設計正本 §6）。

1. **新しい静的 web × 旧い同期サーバー**（2〜4 を配ってから、5 の再起動までの間）:
   新しいお題ツールは、`?tool=topic` を知らない旧い同期サーバーに 1008 で閉じられ、再接続を繰り返す。
   新しい玄関と poker には `topic` フレームが届かないだけで、お題の表示が出ない
2. **新しい timer の web × 旧い同期サーバー**（5 の内側。web を先に配ってから再起動するまでの数十秒。
   順序は選べない —— #276）: 旧いサーバーの完成記録は `problemTitle` を持ち、新しい timer の契約（`topicTitle`）に合わない。
   **完成記録を持つルームのスナップショットは丸ごと検証に落ち**、timer は通知を出す（#209）
3. **古い web × 新しい同期サーバー**（再起動の後、開いたままの画面）: 古い timer は、`problem` / `config.language` などを
   必須とする旧い契約で新しいスナップショットを読むため、**`topic` フレームだけでなくスナップショットがすべて落ちる**。
   再読込するまで通知を出し続ける（#209）。古い timer が送るお題のコマンド（`ai.unlock` / `problem.*`）は
   `INVALID_COMMAND` が返るだけで、状態も接続も変わらない。古い poker は未知の `topic` フレームを捨てて通知を出す（#212）。
   古い玄関は黙って捨てる

### 配った後の確認

```bash
HOST=https://<公開ドメイン>
# 断片を置き忘れても玄関が 200 を返すので、状態コードでは見分けられない。資材の接頭辞を見る
curl -s "$HOST/topic/" | grep -o '/topic/assets/' | head -1   # 1 行出れば正常
```

⚠ **`pnpm e2e:prod` は 4 本を配り終えてから流す。** 配る前の本番へ当てると、`/topic/` がまだ無いので
**`/topic/` を見る `@smoke`・`@core` のテストが落ちる**（`e2e/specs/routing.spec.ts` と `e2e/specs/topic.spec.ts`）。

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
