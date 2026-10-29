# Caddy 設定の設置手順

ホストの Caddy は他サイト（gallery / play 等）と共用しているため、**Tasuki のブロックは
import で切り離す**。アプリを増やしてもホストの `Caddyfile` に触らずに済む。

## 構成

```
/etc/caddy/
├── Caddyfile                        # 他サイトと共用。Tasuki 行は import 1 行だけ
└── tasuki/
    ├── site.conf                    # deploy/caddy/tasuki.conf
    └── apps/
        ├── 05-hub-ws.conf           # deploy/landing/caddy/（唯一の WS 入口。#95 S5c）
        ├── 20-poker.conf            # deploy/poker/caddy/
        ├── 30-timer-spa.conf        # deploy/timer/caddy/
        ├── 40-topic.conf            # deploy/topic/caddy/（#91 の配布で設置。順序は deploy/topic/NOTES.md）
        ├── 50-roulette.conf         # deploy/roulette/caddy/（#94 の配布で設置。順序は deploy/roulette/NOTES.md）
        ├── 60-agenda.conf           # deploy/agenda/caddy/（#429 の配布で設置。順序は deploy/agenda/NOTES.md）
        ├── 70-checkin.conf          # deploy/checkin/caddy/（#406 の配布で設置。順序は deploy/checkin/NOTES.md）
        └── 90-landing.conf          # deploy/landing/caddy/（包括フォールバック）
```

## 評価順の実際（2026-08-05 に Caddy 2.11.4 で実測）

**断片の記述順（＝ファイル名順）は、そのままでは評価順にならない。**
Caddyfile アダプタはルートを**マッチャの具体性**で並べ替える。パス指定のない
`handle`（包括フォールバック）は、書いた位置に関わらず最後に回る。

実測: 包括フォールバックの断片を `90-landing.conf` → `05-landing.conf` に改名して
先頭に置いても、`caddy adapt` が生成するルートの並びは**完全に同一**だった。
起動して叩いても `/`・`/timer/`・`/poker/`・`/timer/ws` すべて正常。

**ファイル名順が効くのは、具体性が同じマッチャ同士の並びを決めるときだけ。**
その場合は名前が先のものが勝ち、**後のものは一度も評価されない**
（実測: 包括 `handle {}` を 2 本置くと、名前が先の方だけが応答した）。

### 本当に危ないのは「順序」ではなく「衝突」

| 状況 | 何が起きるか |
|---|---|
| 包括フォールバックが 2 本 | 名前が後の方が**到達不能**。設定は有効なので気づけない |
| 同じパスを 2 本が宣言 | 同上 |
| ある経路の断片が**存在しない** | 包括フォールバックに吸われる。**本番の `/poker` 事故はこれ**（順序ではない） |

`apps/landing/tests/caddy-fragment-order.test.ts` がこの 3 つを機械的に押さえている
（包括はちょうど 1 本・ルーティングの鍵に重複が無い・配信断片は自分の root を宣言）。

番号接頭辞は**人が読むための規約**であって、安全性の根拠ではない。

## S4（#19）での入れ替え — 旧ファイルの削除

S4 で包括フォールバックが timer から LP へ移ったため、2 本の断片が改名されている。

| 旧 | 新 |
|---|---|
| `90-timer-spa.conf`（包括） | `30-timer-spa.conf`（`/timer/*` 限定） |
| `30-landing.conf`（`/home/*`） | `90-landing.conf`（包括） |

**旧ファイルを消し忘れても `/timer/` は壊れない**（実測で確認済み）。残ると起きるのは:

- `30-landing.conf` が残る → **`/home/` でも LP に到達できる二重公開 URL**になる
- `90-timer-spa.conf` が残る → 包括が 2 本になり、名前が先の `90-landing.conf` だけが
  効く。timer 側は死んだ設定として残り続ける

いずれも「壊れないが、意図しない状態が黙って残る」ので削除する。

```bash
sudo rm -f /etc/caddy/tasuki/apps/30-landing.conf \
           /etc/caddy/tasuki/apps/90-timer-spa.conf
```

## 設置

```bash
# 1) 転送（ローカルから）
TASUKI_SSH_HOST=<host>
scp deploy/caddy/tasuki.conf                    "$TASUKI_SSH_HOST:/tmp/site.conf"
scp deploy/landing/caddy/05-hub-ws.conf         "$TASUKI_SSH_HOST:/tmp/"
scp deploy/timer/caddy/*.conf                   "$TASUKI_SSH_HOST:/tmp/"
scp deploy/poker/caddy/20-poker.conf            "$TASUKI_SSH_HOST:/tmp/"
scp deploy/landing/caddy/90-landing.conf        "$TASUKI_SSH_HOST:/tmp/"
scp deploy/topic/caddy/40-topic.conf            "$TASUKI_SSH_HOST:/tmp/"
# ↑ /topic/ の断片（#91）。置き忘れると /topic/ は包括フォールバック＝玄関に吸われる
scp deploy/roulette/caddy/50-roulette.conf      "$TASUKI_SSH_HOST:/tmp/"
# ↑ /roulette/ の断片（#94）。置き忘れると /roulette/ は包括フォールバック＝玄関に吸われる
scp deploy/agenda/caddy/60-agenda.conf          "$TASUKI_SSH_HOST:/tmp/"
# ↑ /agenda/ の断片（#429）。置き忘れると /agenda/ は包括フォールバック＝玄関に吸われる
scp deploy/checkin/caddy/70-checkin.conf        "$TASUKI_SSH_HOST:/tmp/"
# ↑ /checkin/ の断片（#406）。置き忘れると /checkin/ は包括フォールバック＝玄関に吸われる

# 2) 設置 その 1 — **配信物より先に入れてよい断片だけ**（VPS で・root）
# #95 S5c で 10-timer-ws.conf を撤去した。WS の入口は 05-hub-ws.conf（/ws）の 1 本だけ
# ——これを設置し忘れると本番の WS が一切繋がらない（timer も poker もハブも）。
#
# ⚠ **ここで入れるのは site.conf と 05-hub-ws.conf の 2 本だけである。**
# 20-poker.conf は **/poker/ws の handle を落としてある**ので、旧 poker がまだ配信されて
# いる段で入れると、手順 7 の reload の時点で /poker/ws が SPA フォールバックに吸われ、
# `deploy.sh poker` が走るまで poker の WS が死ぬ。30-timer-spa.conf と 90-landing.conf も
# 同じ段（下の「その 2」）へ送る —— 内容は S4 から変わっておらず、いつ入れても同じである。
# site.conf は S5a・S5c ともに差分が「断片の顔ぶれ」のコメントだけなので、先に入れて無害。
sudo mkdir -p /etc/caddy/tasuki/apps
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak."$(date +%Y%m%d-%H%M)"   # 必ず退避
sudo install -m 644 /tmp/site.conf /etc/caddy/tasuki/site.conf
sudo install -m 644 /tmp/05-hub-ws.conf /etc/caddy/tasuki/apps/

# #91（お題）の配布では、40-topic.conf もこの段で入れる。/topic/* は既存の断片と接頭辞が
# 重ならず、古い玄関には札が無いので、配信物より先に入れても誰も辿り着かない
# （順序の正本は ../topic/NOTES.md の「配布の手順」。web root を先に作っておくこと）。
# ⚠ 40 番は、撤去済みの旧 40-timer-legacy-room.conf と同じ番号の別物である。
sudo install -m 644 /tmp/40-topic.conf /etc/caddy/tasuki/apps/
# #94（ルーレット）の配布では、50-roulette.conf もこの段で入れる（理由は 40-topic.conf と同じ。
# 順序の正本は ../roulette/NOTES.md の「配布の手順」）。
sudo install -m 644 /tmp/50-roulette.conf /etc/caddy/tasuki/apps/
# #429（進行タイマー）の配布では、60-agenda.conf もこの段で入れる（順序の正本は ../agenda/NOTES.md）。
sudo install -m 644 /tmp/60-agenda.conf /etc/caddy/tasuki/apps/
# #406（Check-in Cards）の配布では、70-checkin.conf もこの段で入れる（順序の正本は ../checkin/NOTES.md）。
sudo install -m 644 /tmp/70-checkin.conf /etc/caddy/tasuki/apps/

# **旧共有リンクの救済（40-timer-legacy-room.conf・S5a で撤去）はこの段で消す。**
# 後回しにできない —— 残したまま `deploy.sh landing` を走らせると、新しい玄関が配る
# 参加用 URL（/?room=CODE）が `permanent` 301 で /timer/ へ飛び、**その 301 を
# ブラウザがキャッシュする**。開いた端末は断片を消した後も飛ばされ続ける
# （../timer/NOTES.md の「旧共有リンクの救済」）。ここで消しておけば、その窓が開かない。
# 先に消しても壊れるのは S4 時代の `/?room=` リンクだけで、旧 LP に着地するだけである。
sudo rm -f /etc/caddy/tasuki/apps/40-timer-legacy-room.conf

# 3) 旧断片を削除し、残りの断片を設置する（S4 の入れ替え。上記「旧ファイルの削除が必須」を参照）
# 10-timer-ws.conf は #95 S5c で撤去した。ホストに残っていても実害は無い（WS 入口は
# クエリで振り分けており、この断片は timer 側の /timer/ws という死んだ handle でしかない）が、
# 「/ws の 1 本だけ」という前提と食い違う設定を残さないため一緒に消す。
#
# ⚠ **S5a〜S5c の初回配布では、この手順 3 だけを後回しにする。** ここを上から順に
# 実行すると、手順 2（設置）と手順 3（削除）の間に配信物の入れ替えが挟まらず、
# 手順 7 の reload 1 回で「旧 timer が配信されたまま /timer/ws が消える」状態になる。
# 残っていても実害が無いのは真だが、**配信物より先に消すと害がある**（逆向きの事実）。
# 正しい順序は ../timer/NOTES.md の「#95 S5c を配布するときに行うこと」の順序表にある
# ——「①site.conf と 05-hub-ws.conf を設置＋40 を削除 → ②deploy.sh を 3 本 → ③ここ」。
# **つまりこの README は 2 度通す。** 1 度目は手順 2 まで（＋4〜7）、2 度目がここである。
sudo rm -f /etc/caddy/tasuki/apps/30-landing.conf \
           /etc/caddy/tasuki/apps/90-timer-spa.conf \
           /etc/caddy/tasuki/apps/10-timer-ws.conf

# 設置 その 2 — 配信物を入れ替えた後に入れる断片（新しい 20-poker.conf はここ）
#
# **まっさらなホストへの初回設置では、手順 2 と手順 3 を分けなくてよい。** 分けるのは
# 「いま動いている旧い配信物」を壊さないためであり、それが無ければ守るものが無い。
sudo install -m 644 /tmp/20-poker.conf /tmp/30-timer-spa.conf /tmp/90-landing.conf \
                    /etc/caddy/tasuki/apps/

# 4) site.conf の <公開ドメイン> を実値へ置換（初回のみ）
sudo sed -i 's|<公開ドメイン>|tasuki.example.com|' /etc/caddy/tasuki/site.conf

# 5) ホストの Caddyfile に import 1 行があることを確認（初回のみ・エディタで手作業）
#      import /etc/caddy/tasuki/site.conf

# 6) 設置後の顔ぶれを目視（旧ファイルが残っていないこと・包括が 1 本だけであること）
ls /etc/caddy/tasuki/apps/
grep -l '^handle\s*{' /etc/caddy/tasuki/apps/*.conf   # 1 本だけ出れば正常

# 7) 検証してから反映（NG なら反映しない）
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 切り戻し

```bash
sudo cp /etc/caddy/Caddyfile.bak.<日付> /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

断片を戻す場合は、前の版の `apps/*.conf` を入れ直したうえで**今回追加した分を消す**。
消し忘れると順序が崩れる。

## 確認

```bash
HOST=https://<公開ドメイン>

curl -sI "$HOST/"                                        # 200・x-robots-tag: noindex, nofollow・HSTS
curl -s "$HOST/" | grep -o '<title>[^<]*</title>'        # LP の題名が出る

# 各系統が並存すること（/topic/ は #91 の配布から）
for p in / /timer/ /poker/ /topic/ /roulette/ /agenda/ /checkin/; do
  curl -s -o /dev/null -w "$p → %{http_code}\n" "$HOST$p"
done
# **/topic/ は断片を置き忘れても玄関が 200 を返す**（90-landing.conf の包括フォールバック）ので、
# 状態コードでは見分けられない。資材の接頭辞が出ることを見る（1 行出れば正常。
# e2e/specs/routing.spec.ts の資材の接頭辞の見方と同じ）
curl -s "$HOST/topic/" | grep -o '/topic/assets/' | head -1
curl -s "$HOST/roulette/" | grep -o '/roulette/assets/' | head -1   # #94 の配布から
curl -s "$HOST/agenda/" | grep -o '/agenda/assets/' | head -1   # #429 の配布から
curl -s "$HOST/checkin/" | grep -o '/checkin/assets/' | head -1   # #406 の配布から

# WebSocket が SPA に吸われていないこと。統合 sync（apps/tasuki-sync）は
# 非 Upgrade の HTTP に 426 を返す。
# （#95 S2 の統合前、poker-sync だけは 400 を返していた。統合で 426 に揃った。）
#
# **#95 S5c から、WS の入口は /ws の 1 本だけ。** 旧パス（/timer/ws・/poker/ws）は
# 断片ごと撤去したので、SPA フォールバックに吸われて 200 が返るのが正しい
# （e2e/specs/routing.spec.ts が具体値で固定している）。
curl -s -o /dev/null -w 'ws（唯一の WS 入口。426 が正しい） → %{http_code}\n' "$HOST/ws"
curl -s -o /dev/null -w 'timer/ws（旧入口。200 が正しい） → %{http_code}\n' "$HOST/timer/ws"
curl -s -o /dev/null -w 'poker/ws（旧入口。200 が正しい） → %{http_code}\n' "$HOST/poker/ws"

# **#95 S5a から /?room=CODE は参加用 URL そのものである。** 旧共有リンクの救済断片
# （40-timer-legacy-room.conf）は撤去した——残っていると、いま配っている招待リンクが
# 301 で timer へ飛ばされ、選択画面に着地しない（deploy/timer/NOTES.md）。
# **ここで 301 が返ったら断片が消し残っている。** 200（玄関 LP）が正しい。
curl -s -o /dev/null -w '?room 付き（200 が正しい） → %{http_code} %{redirect_url}\n' "$HOST/?room=TEST"
```

## #434 の配布（サイトの外側）

紹介の画像・アイコン・`robots.txt` などを公開し、実体の無いファイルを 404 にし、
キャッシュを指定する変更の配布手順。**配布は利用者の明示の指示を待つ**（勝手に配らない。
ルームは揮発インメモリなので、配布で全消滅する）。

> **2026-10-24 に配った**（`v4.4.0`）。この手順で 7 本を入れた後の `pnpm e2e:prod` が 1 件赤だった:
> 当時の本番の Caddy は Debian の apt の **2.6.2** で（2026-10-25 に 2.11.7 へ上げた。`../README.md` の「Caddy を上げる」）、当時の `header @hashed { …; match status 2xx }` を条件として
> 読まず、消えた資材の 404 に immutable が付いた（E2E は 2.11.4 だったので緑）。PR #437 で `handle_errors` の形に
> 直し、E2E の Caddy を 2.6.2 に揃えたうえで、`site.conf` の 1 本だけを入れ直した（Tasuki は再起動していない）。
> その後の `pnpm e2e:prod` は全件通った。以下の手順は記録として残す（入れ直しは、手順 2〜5 を `site.conf` の 1 本だけで行った形。手順 4 の `<公開ドメイン>` の置換と手順 5 の validate・reload も要る）。

`pnpm e2e:prod` は、web と Caddy の両方を配るまで、新しい @smoke（site-exterior）で赤のままになる。

1. **ローカルで** web を全アプリ配る。順序は #433 の決めを守る（timer → agenda）。公開ファイル
   （`og.png`・アイコン・`robots.txt`・`site.webmanifest`・`.well-known/security.txt`）は LP の
   `apps/landing/public` に入っているので、LP の配布で届く。
2. **ローカルで** 7 ファイル（`tasuki.conf` は `site.conf` の名で）を、新しい専用ディレクトリへ送る。
   `/tmp` 直下には前の配布の古いファイルが残りうるので、そこからは入れない。
   ```bash
   export TASUKI_SSH_HOST=<ユーザー@ホスト>   # deploy.sh と同じ変数
   ssh "$TASUKI_SSH_HOST" 'rm -rf /tmp/tasuki-434 && mkdir -p /tmp/tasuki-434'
   scp deploy/caddy/tasuki.conf "$TASUKI_SSH_HOST":/tmp/tasuki-434/site.conf
   scp deploy/landing/caddy/90-landing.conf deploy/timer/caddy/30-timer-spa.conf \
       deploy/poker/caddy/20-poker.conf deploy/topic/caddy/40-topic.conf \
       deploy/roulette/caddy/50-roulette.conf deploy/agenda/caddy/60-agenda.conf \
       "$TASUKI_SSH_HOST":/tmp/tasuki-434/
   ```
3. **サーバーで（root）** 設置先ごと退避してから `/tmp/tasuki-434/` から `install` する。
   ```bash
   sudo cp -a /etc/caddy/tasuki /etc/caddy/tasuki.bak."$(date +%Y%m%d-%H%M)"
   sudo install -m 644 /tmp/tasuki-434/site.conf /etc/caddy/tasuki/site.conf
   cd /tmp/tasuki-434
   sudo install -m 644 20-poker.conf 30-timer-spa.conf 40-topic.conf \
       50-roulette.conf 60-agenda.conf 90-landing.conf /etc/caddy/tasuki/apps/
   ```
4. **サーバーで（root）** `<公開ドメイン>` を置換し、アドレスの行を目で確かめる。
   ```bash
   sudo sed -i 's|<公開ドメイン>|tasuki.niku9.click|' /etc/caddy/tasuki/site.conf
   grep -n '{$' /etc/caddy/tasuki/site.conf   # 行頭のアドレスが tasuki.niku9.click になっているか見る
   ```
5. **サーバーで（root）** 検証して reload する。
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```
6. **サーバーで（root）** 通らない・挙動がおかしいときは、退避したディレクトリを戻す
   （`/etc/caddy/Caddyfile.bak` では戻らない。#434 が変えるのは `/etc/caddy/tasuki` の中）。
   消す前に、退避の名前が実在するか確かめる。
   ```bash
   ls -d /etc/caddy/tasuki.bak.*     # 戻す退避の名前を確かめる（無ければ rm しない）
   sudo rm -rf /etc/caddy/tasuki
   sudo cp -a /etc/caddy/tasuki.bak.<日付-時刻> /etc/caddy/tasuki
   sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```

**途中の見え方と戻し方。** 手順 1（web）から Caddy の reload までのあいだ、そして Caddy だけを戻したあと
（web は新しいまま）は、古い断片が欠けたファイルにも index.html を 200 で返す。
`/timer/robots.txt` などが 200 に見えるのはそのためで、害は無く、新しい Caddy を入れれば終わる。
全部を戻すときは、Caddy に加えて前の web も要る（前のタグから `deploy.sh` を流す）。

**ローカルで** 確認する。
```bash
HOST=https://tasuki.niku9.click   # 先に定義する。空だと curl が黙って失敗し、最後の 0 が偽の緑になる
curl -s -o /dev/null -w 'robots.txt → %{http_code}\n' "$HOST/robots.txt"
curl -s -o /dev/null -w 'og.png → %{http_code} %{content_type}\n' "$HOST/og.png"
curl -s -o /dev/null -w '実体の無いファイル（404 が正しい） → %{http_code}\n' "$HOST/no-such.txt"
curl -s -o /dev/null -w '?room 付き（200 が正しい） → %{http_code}\n' "$HOST/?room=TEST"
curl -s -o /dev/null -w '/poker/room/TEST（200 が正しい） → %{http_code}\n' "$HOST/poker/room/TEST"
curl -sI "$HOST/" | grep -i '^cache-control'                  # no-cache
# 資材: HTML の本文から最初の資材を取り、そのヘッダを見る（immutable が正しい）
ASSET=$(curl -s "$HOST/timer/" | grep -o '/timer/assets/[^"]*' | head -1)
curl -sI "$HOST$ASSET" | grep -i '^cache-control'
# 欠落した資材は 404 で no-cache（immutable の件数だけを数えると、見出しが無くても 0 で合格に見える）
curl -sI "$HOST/timer/assets/no-such.js" | grep -i -E '^HTTP|^cache-control'   # 404 と no-cache
```

配布後は Slack に URL を貼り、紹介（OGP）とアイコンが実物で出ることを目で確かめる
（約束する相手は Slack。`Disallow: /` を残すので、robots.txt を守る X の Twitterbot などは取らない）
（設計 `docs/superpowers/specs/2026-10-23-site-exterior-design.md` の §7）。
