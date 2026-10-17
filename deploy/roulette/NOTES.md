# roulette（進行役ルーレット）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## 配布の手順（#94 を 1 回で配る）

**#94 の 3 本の PR が main に入った後、1 回だけ配る**（設計正本
[`docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md`](../../docs/superpowers/specs/2026-10-12-facilitator-roulette-design.md) §7）。
配るのは**利用者の明示の指示を得てから**で、**利用者が使っていない時間帯**に行う
（`deploy.sh timer` の再起動で timer・poker・お題・ルーレットのルームがすべて消える）。
#318 以降の未配布分とまとめて 1 回にする。

> **2026-10-14 に配った**（`v4.1.0`）。初回の用意（web root と断片）を済ませてから、
> roulette・poker・topic・landing・timer の **5 本**を続けて流した。下の手順の 3 本（roulette → landing → timer）に、
> 未配布の変更があった poker と topic（どちらも `STATIC_ONLY=1`）を landing の前へ足した形である。
> **以後に配るときも、未配布の変更があるアプリは同じく静的の位置（landing の前）に足し、`pnpm e2e:prod` はすべて配り終えてから流す**。配った後の `pnpm e2e:prod` は、`roulette.spec.ts` の
> 読み方の競合（テスト側・#384 で修正）の 1 本を除いて通った。以下の手順は記録として残す。

### 順序

**roulette → landing → timer。** 静的な 2 本と timer は**間を空けずに続けて流す**。
同期サーバーを再起動するのは最後の `deploy.sh timer` だけである（ほかは `STATIC_ONLY=1`）。

| # | やること | なぜこの位置か |
|---|---|---|
| 1 | 初回の用意（下の「初回の用意」）で web root を作り、`caddy/50-roulette.conf` を設置して `caddy validate` → reload する（[`../caddy/README.md`](../caddy/README.md) の「設置」） | 断片を置いた時点で `/roulette/` は公開されるが、中身はまだ空で、古い玄関には札が無いので誰も辿り着かない。**置き忘れると `/roulette/` は包括フォールバック（玄関）に吸われ、3 で出る札を押しても玄関が描き直されるだけになる** |
| 2 | `deploy.sh roulette` | ここから 4 までを続けて流す |
| 3 | `deploy.sh landing` | 玄関に 4 枚目の札が出る。**静的の最後に回す**のは、札が見えてから同期サーバーの再起動までの時間を短くするため（下の窓 1・2） |
| 4 | `deploy.sh timer` | timer の web を配ってから同期サーバーを再起動する（`deploy.sh` の内部の順序は選べない —— #276） |
| 5 | 動作確認（下の「配った後の確認」） | **`pnpm e2e:prod` は 4 まで配り終えてから流す**（下の注意） |

```bash
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh roulette
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh landing
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer    # 同期サーバーもここで入れ替わる
```

### 配布中の窓（3 つ）

いずれも**画面の再読込で閉じ、同期サーバーの再起動でルームはどのみち全部消える**ので受容する（設計正本 §7.3）。

1. **新しい roulette-web × 旧い同期サーバー**（2 を配ってから、4 の再起動までの間）:
   旧いサーバーは `?tool=roulette` を知らず、1008（Unknown tool）で閉じる。
   ルーレットの画面は「接続中です…」を出し続ける。札は landing を配るまで見えないので、ここに来るのは URL を直に開いた人だけ
2. **新しい landing × 旧い同期サーバー**（3 を配ってから、4 の再起動までの数十秒）:
   4 枚目の札は見えるが、押した先は 1 と同じ
3. **古い web × 新しい同期サーバー**（再起動の後、開いたままの画面）: 名簿の `tools` に `"roulette"` が載る。
   **古い玄関は在席の表示の対応表（`whereLabel`）に無い綴りを、隠さず生のまま出す**（現物で確認:
   `apps/landing/src/screens/RoomChoice.tsx` は `?? id` で引く）ので、ルーレットに居る人が
   「roulette にいます」と出る。再読込で「Facilitator Roulette にいます」に直る。
   timer・poker・お題にはルーレットのフレームも名簿も送らない（宛先がルーレットの接続だけのため）

### #401（選ぶ人数）を配るときの窓

#401 は同期サーバー（PR 1）と roulette-web（PR 2）にまたがる。**PR 2 まで入れてから、上と同じ順（roulette → … → timer）で 1 回で配る。**
窓はどちらも再読込と同期サーバーの再起動で閉じるので受容する（[設計正本](../../docs/superpowers/specs/2026-10-16-roulette-multi-pick-design.md) §5.3）。

1. **新しい roulette-web × 旧い同期サーバー**: 人数の切り替え（`roulette.pick.set`）は `INVALID_COMMAND` で拒まれ、1 人のまま回る
2. **古い roulette-web × 新しい同期サーバー**（再起動の後、開いたままの画面）: 古い画面は `picks` を知らず、1 人目だけを当たりとして描く。
   `durationMs` は k 人ぶんなので、1 人目へ向かってゆっくり回る。古い画面には人数の切り替えが無いので、古い画面だけのルームでは 1 人のまま

### #401（順番に回す）を配るときの窓

同期サーバーと roulette-web を同じ順（roulette → … → timer）で 1 回で配る。窓は再読込と同期サーバーの再起動で閉じるので受容する
（[設計正本](../../docs/superpowers/specs/2026-10-17-roulette-turn-order-design.md) §4）。

1. **新しい roulette-web × 旧い同期サーバー**: 決め方の切り替え（`roulette.mode.set`）は `INVALID_COMMAND` で拒まれ、1 回で決めるのまま
2. **古い roulette-web × 新しい同期サーバー**（開いたままの画面）: 古い画面には決め方の切り替えが無い。新しい画面が順番に回すにすると、
   古い画面は順番の回転を「次の進行役は ○○ さんです」と読み、最後の 1 人（回転の無い番）は出ない

### #401（押して止める）を配るときの窓

同期サーバーと roulette-web を同じ順で 1 回で配る。窓は再読込と同期サーバーの再起動で閉じるので受容する
（[設計正本](../../docs/superpowers/specs/2026-10-17-roulette-press-stop-design.md) P11）。

1. **新しい roulette-web × 旧い同期サーバー**: 「止めて決める」（`roulette.mode.set` の `press`）は `INVALID_COMMAND` で拒まれる
2. **古い roulette-web × 新しい同期サーバー**（開いたままの画面）: 古い画面には決め方の切り替えも「止める」も無い。新しい画面が押して止める回転を回すと、
   古い画面は止まる席を知らないまま 30 秒かけて回る（再読込で直る）

### 配った後の確認

```bash
HOST=https://<公開ドメイン>
# 断片を置き忘れても玄関が 200 を返すので、状態コードでは見分けられない。資材の接頭辞を見る
curl -s "$HOST/roulette/" | grep -o '/roulette/assets/' | head -1   # 1 行出れば正常
```

⚠ **`pnpm e2e:prod` は 3 本を配り終えてから流す。** 配る前の本番へ当てると、`/roulette/` がまだ無いので
**`/roulette/` を見る `@core` のテストが落ちる**（`e2e/specs/roulette.spec.ts`。配信と転送の確認もこの 1 本の頭に入れてある）。

## 静的サイト

同期サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- `deploy.sh roulette` はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-roulette`）と Caddy 断片だけ

## 初回の用意（ホスト側・root）

```bash
# web root を DEPLOY_USER 所有で作る（転送が sudo 不要になる）
sudo install -d -o <DEPLOY_USER> -g <DEPLOY_USER> -m 755 /var/www/tasuki-roulette
# 断片の設置と検証・再読込は ../caddy/README.md の手順に従う
```

## base パスに注意

公開パス `/roulette/` は **`apps/landing/src/tools.ts`・`apps/roulette-web/vite.config.ts` の `base`・
`app.env` の `PUBLIC_PATH`・`caddy/50-roulette.conf` の 4 か所**で揃えている。どれか 1 つでも取り残すと、
白画面か 404 になる。
