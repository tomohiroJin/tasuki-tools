# 振り返り: #68 規範とアーキテクチャの確立

- **対象**: [#68](https://github.com/tomohiroJin/tasuki-tools/issues/68)（規範とアーキテクチャの確立、親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67)）
- **期間**: 2026-08-09〜2026-08-10（Task 1〜14）
- **型**: [`docs/guides/retrospective.md`](../guides/retrospective.md) の 3 部構成に従う

## 踏んだ罠（事実と再発条件）

### 1. Issue 本文・ブリーフの事実誤認が繰り返し出た

**事実**:

- Issue #68 本文は「timer 側のコードも憲法を参照している」という前提を含んでいたが、
  `grep -rn "憲法原則" --include="*.ts" --include="*.tsx" apps packages` を実際に打つと、
  該当参照は 7 箇所すべて poker 側（原則 III が 1、IV が 6）で、timer 系・`packages/ui`・
  `apps/landing` は 0 件だった。「timer 側のコードも参照」は誤りと判明した。
- `docs/guides/ears-writing.md` の「望まれない振る舞い」の実例は当初「不正なメッセージを
  受信した場合、システムはそのフレームを**無視**し切断しないこと」だったが、実装
  （`apps/poker-sync/src/server.ts:263-265`、`parseClientMessage` が失敗したら
  `sendError(ws, result.error.code, result.error.message)` を呼んで接続は維持する）は
  「無視」ではなく「invalid-message エラーを返す」であり、実例が実装と食い違っていた
  （最終レビュー I-3 として検出）。
- poker の「お題」機能はブリーフ・設計段階の記述で既存機能のように扱われた箇所があったが、
  実際は提案段階（[#93](https://github.com/tomohiroJin/tasuki-tools/issues/93)）であり
  未実装だった（Task 9 の作業台帳に記録）。

**原因**: Issue やブリーフに書かれた前提を一次情報として扱い、実コード・実行結果で
裏取りせずに設計文書・ガイドへそのまま転記していた。

**再発条件**: 「Issue にこう書いてある」をそのまま採用し、grep・ls・実行結果による
裏取りを省略する運用が続く限り、同種の事実誤認が再発する。

**対処**: 「主張は書く前に grep/ls で叩く」運用へ切り替えた。spec.md の突き合わせ表に
「Issue 記載 vs 実測結果」を明示する形式を導入し、以降のタスクでは実コードの grep 結果を
根拠として添えるようにした。この運用は #68 の残り作業で機能し、上記 3 件はいずれも
実装作業に入る前の段階で検出・訂正できた。

### 2. 全体憲法への書き直しで、旧文言のままだと公布初日から矛盾する条項が 2 つあった

**事実**:

- 原則 III（揮発インメモリ）の初稿は「状態はすべて揮発インメモリ」という無条件の
  主張だったが、`apps/timer-web/src/records/indexeddb.ts`（完成記録の IndexedDB 保存・
  本番経路）と矛盾していた（レビュー指摘 B-1・Critical）。
- 原則 VI（依存は内向き）は `packages/timer-core/src/problem.ts:70` の `Date.now()`
  （ドメイン層内で時計という副作用に直接依存している箇所）と矛盾していた
  （レビュー指摘 B-2・Critical）。

**原因**: 原則の文言を poker MVP 版から Tasuki 全体版へ一般化する際、適用範囲に入る
既存コード（特に timer 側）を網羅的に洗い出さないまま「べき論」で書いた。憲法の
初稿は poker 側の実装を主に参照しており、timer 側の既存コードとの突き合わせが漏れた。

**再発条件**: 新しい原則・規約を適用範囲の既存コードと突き合わせずに「べき」で
書く限り、公布した瞬間から既存コードと矛盾する条項が入り込む。

**対処**: レビュアーが実コードと突き合わせて両方の矛盾を検出した。原則 III は
適用対象を「同期サーバーが保持する共有状態」に限定し、「クライアント側のローカル
保存（設定・完成記録などの履歴）はこの限りではない」を明記して解消した
（`.specify/memory/constitution.md` 原則 III）。原則 VI は既知の逸脱として
Sync Impact Report の Follow-up TODO に記録し、適用段階（#72）でアダプタへ注入する
形に直す計画とした。いずれもコードは変更せず、憲法側の文言と記録で整合を取った。

## 検査の穴（緑のまま壊れていたものは何か・なぜ緑だったか）

### 1. check-links.mjs はアンカーとバッククォート内のコードパスを検査しない

**何が壊れていたのに緑だったか**:

- README 再編（Task 12）で `## 起動方法` 見出しが消えたが、`docs/timer/README.md:40` と
  `docs/poker/README.md:51` はその見出しへのアンカー付きリンク（例:
  `../../README.md#起動方法`）を案内し続けていた。`node check-links.mjs README.md
  docs/timer/README.md docs/poker/README.md` は `OK` を返し、リンク切れを検出しなかった。
- Task 6 で ADR（0006 相当）の本文が `apps/sync/test/error-code-coverage.test.ts`
  （実在しないパス。正しくは `apps/timer-sync/test/error-code-coverage.test.ts`）を
  バッククォートで引用していた。

**なぜ検出できなかったか**: `check-links.mjs` はスクリプト冒頭のコメントに明記の通り
「アンカーのみのリンク（`#foo`）は対象外」で、`path#anchor` 形式のリンクでも `#` 以降は
`split('#')` で切り捨てて素通しする実装になっている。加えて正規表現
`/\[[^\]]*\]\(([^)]+)\)/g` は Markdown のリンク構文（角カッコ＋丸カッコ）のみを拾い、
バッククォートで囲まれた素のパス文字列（コードスパン）は走査対象にならない。

**対処**: 両方ともタスク内の自己レビュー・コーディネーターレビューで手動検出し、
`docs/timer/README.md` `docs/poker/README.md` のアンカーリンクを
`docs/guides/development.md` への正しい案内へ差し替え、ADR 側のパス引用を
`apps/timer-sync/...` へ修正した。`check-links.mjs` 自体の改修（アンカー・
コードパス対応）は本ラウンドでは行っていない（申し送りへ記載）。

### 2. タスク単位レビューでは横断の矛盾が原理的に見えない

**何が壊れていたのに緑だったか**: 各タスクは自分が書いた 1 ファイル・1 節を対象に
レビューされ、その範囲では「正しい」と判定されていた。しかし複数ファイルにまたがる
整合や、後続タスクの完了によって前のタスクの記述が古くなる問題は、タスク単位
レビューの視野に入らなかった。全タスク完了後の最終ホールブランチレビュー
（`final-review-findings.md` 作成）で Important 指摘として 3 件検出した。

- **I-1**: `docs/timer/adr/README.md` の一覧表が、Task 7 で行った ADR 昇格・置換
  （0006 → `docs/adr/0005` へ昇格、0009 → `docs/adr/0006` へ昇格、0010 → `docs/adr/0002`
  により Superseded）を反映していなかった。一覧表の該当行が単なる `Accepted` の
  ままで、昇格・置換の事実が消えていた。
- **I-2**: `docs/guides/development.md` の冒頭が「現時点では README にも同内容が
  残っています…Task 12 以降、README はここへリンクするだけになります」という
  過渡期の説明のままだったが、Task 12（README 二部構成再編）は既に完了しており、
  最終レビュー時点で事実と異なる記述になっていた。
- **I-3**: `docs/guides/ears-writing.md` の EARS 実例が実装（前掲）と食い違っていた。

**なぜ検出できなかったか**: タスク単位レビューは「そのタスクが書いた内容が正しいか」
だけを判定しており、「後続タスクの完了によって前のタスクの記述が古くならないか」
「他ファイル・実コードとの整合が保たれているか」はレビュー範囲の外だった。タスクの
粒度でレビューを閉じる設計そのものが、横断的な整合性の欠陥を見落とす穴になっていた。

**対処**: 全タスク完了後に専用の最終ホールブランチレビューを実施し、上記 3 件
（および Minor 6 件）を検出・記録した。本 Issue の締め作業（#68 クローズ準備）で
9 件（I-1〜I-3・M-1〜M-3・M-5〜M-7）をすべて修正した。

## 次への申し送り（どの文書・Issue に反映したか）

- **[#70](https://github.com/tomohiroJin/tasuki-tools/issues/70)（検査の CI 組み込み）へ**:
  リンクチェックを CI へ組み込む際は、アンカー（`#見出し`）とバッククォート内の
  コードパスの両方を検査対象に含めること。`check-links.mjs`
  （`.superpowers/sdd/` 配下の一時スクリプト、コミット対象外）はどちらも対象外の
  実装になっているため、CI 化にあたっては書き直しが要る。
- **別 Issue 化**: pre-existing の壊れリンク `docs/poker/README.md` →
  `deploy/poker/README.md`（実在しない。`docs/poker/` 配下に実在するのは
  `NOTES.md` のみ）。main 時点から存在しており #68 のスコープ外のため、別 Issue として
  切り出す。
- **[#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（poker-sync の
  ポート/アダプタ再編）へ**: 憲法原則 VI の既知の逸脱
  （`packages/timer-core/src/problem.ts:70` の `Date.now()`）をアダプタへ注入する
  形に直すこと。`.specify/memory/constitution.md` の Sync Impact Report の
  Follow-up TODOs に記録済み。
