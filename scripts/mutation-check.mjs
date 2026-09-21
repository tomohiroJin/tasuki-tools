#!/usr/bin/env node
/**
 * 変異検査（FR-098）。
 *
 * `scripts/mutations/*.patch` の変異を1件ずつ適用し、対応する「検出を期待するテスト」
 * （既定）または属するパッケージ全体（--full）を実行して、検出できたか（テストが落ちたか）
 * を記録したあと、必ず `git checkout --` で元に戻す。
 *
 * plan.md 「変異と『検出を期待するテスト』の対応表」の実装。表が正本であり、
 * このスクリプトの MUTATIONS 定義はその実装にすぎない。
 *
 * 使い方:
 *   node scripts/mutation-check.mjs         絞り込み実行（対応表のテストファイルのみ）
 *   node scripts/mutation-check.mjs --full   変異の属するパッケージ全体を実行
 *
 * テストランナー:
 * リポジトリには 3 種類のランナーが混在する（apps/tasuki-sync は bun test、
 * packages/ui は node --test、それ以外は vitest）。全パッケージへ npx vitest を
 * 決め打ちすると、ランナーが違うパッケージでは「コマンドが見つからない」まま
 * exit code が非 0 になり、テストを 1 件も実行せずに「検出」と誤報告する
 * （#136 で発覚。apps/tasuki-sync の変異 #3・#5・#10 がこの状態だった）。
 * これを避けるため、対象ディレクトリの package.json の scripts.test からランナーを
 * 判定し（detectRunner）、そのランナーで直接テストファイルを指定して実行する。
 *
 * 変異の対象は「パッケージ」に限らない。`scripts/` は package.json を持たないが
 * 検査本体とその自己テストが同居しており、ここも変異対象にする（#174）。
 * package.json を持たないディレクトリのランナーは node（`node --test`）を既定にする
 * （detectRunner の docstring を参照）。
 *
 * 対照実行（コントロール）:
 * 各変異について、**変異を当てる前の素のコードで同じコマンドを実行し、まず
 * 通ることを確認する**。対照が通らない場合は「検出」と報告せず、即座にエラー
 * 終了する。対照が無いと、ランナー自体が起動できない・テストが存在しない
 * といった「検査が空振りしているだけ」の状態を「全件検出」と読み違える
 * （上と同じ #136 の欠陥）。対照はこれを一般的に塞ぐので、ランナーごとに
 * 「テストが見つからない」旨のメッセージを文字列一致で拾う個別ガードは不要になる
 * （かつてはここに vitest 専用の "No test files found" 一致があったが、対照実行に
 * 一本化して削除した）。
 *
 * 安全性:
 * - 作業ツリーに未コミット変更がある状態では実行を拒否する（変異が復元で消えると
 *   取り返しがつかないため）。
 * - 復元は git checkout -- で行い、異常終了（Ctrl-C 含む）時にも必ず実行する。
 *   「現在適用中の変異」をモジュールスコープの変数で追跡し、シグナルハンドラ・
 *   uncaughtException ハンドラの両方から同じ復元処理を呼べるようにしている。
 * - **同じ作業ツリーで 2 つ以上を同時に走らせない**（ロックで拒む）。
 *   2 つが同時に走ると、片方の `git apply` を片方の `git checkout --` が消し、
 *   互いの復元の帳簿（`currentlyAppliedFiles` とマーカー）が食い違う。結果として
 *   **変異が当たったまま残り、マーカーも消える**という、どちらの復旧経路でも
 *   拾えない状態になる。2026-09-08 に実際に起きた —— レビューを並列で回した
 *   エージェントの 1 体が共有の作業ツリーでこれを完走させ、`stale-frame.ts` に
 *   変異が残った。踏んだ側は原因を「9p マウント固有の失敗」と誤診している。
 */

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  diffTargets,
  hasTargetDrift,
  formatTargetDiff,
  hasZeroScanTargets,
} from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, ".."); // Tasuki/（ワークスペースのルート）
const MUTATIONS_DIR = path.join(SCRIPT_DIR, "mutations");

/**
 * リポジトリのルート（`.git` を持つ場所）。単一ワークスペース化により
 * WORKSPACE_ROOT と一致するが、git 操作は常に rev-parse で解決した値を使う。
 * パッチの diff パスはリポジトリルート起点なので、git 操作の cwd はここに固定する。
 */
const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: WORKSPACE_ROOT,
  encoding: "utf8",
}).trim();

/**
 * 変異定義。
 *
 * pkg: 対象ディレクトリ（WORKSPACE_ROOT からの相対パス）。--full 実行時と、
 *      絞り込み実行時にランナーを呼ぶ cwd の両方に使う。パッケージとは限らない
 *      （`scripts/` のように package.json を持たないディレクトリも取れる。#174）。
 * tests: 検出を期待するテストファイル（pkg からの相対パス）。
 * note: plan.md の対応表からの読み替えがあれば、その内容と理由をここに記録する。
 *       **plan.md より後に足した変異もここに理由を書く。** 対応表は
 *       `docs/plans/codebase-refactoring/plan.md` の作業記録であり、以後に
 *       書き換えた実装（ADR-0006 決定 4 が変異を要求する）はそこに追記されない。
 */
export const MUTATIONS = [
  {
    id: 1,
    label: "advanceDriver の交代を (i+1)%n → (i+2)%n",
    patch: "m01-advance-driver-plus2.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note:
      "advanceDriver は nextEligibleIndex(aggregate.ts) に委譲しているため、" +
      "実際の変異先は同ファイルの (currentIndex + 1) % len。関数の分割位置が" +
      "異なるだけで、同じ「交代先の計算式が1つずれる」欠陥の型。",
  },
  // id 2（checkPermission の viewer 拒否を反転）と id 5（canRemoveParticipant の
  // 呼び出しを削る）は #95 S3 で削除した。役割とホストを廃止したことで、
  // どちらも「守っていた性質が概念ごと消えた」変異である（設計正本 §6.5）。
  // 番号は詰めない —— 過去の記録が id で変異を指しているため。
  {
    id: 3,
    label: "computeIneligibleIndices から placeholder の除外を削る",
    patch: "m03-ineligible-placeholder.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/proxy-auto-switch.test.ts", "test/manual-skip-eligible.test.ts"],
  },
  {
    id: 4,
    label: "normalizeDisplayName の正規化を1段無効化（制御文字の除去を外す）",
    patch: "m04-display-name-control-chars.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
  },
  // id 48（normalizeDisplayName の段を #284 以前の順序へ戻す）は #284 の 3 巡目で削除した。
  // **等価変異になったためである。** 段の順序は「制御文字でラベルの見出しを割る」ことを
  // 防いでいたが、3 巡目でラベルの照合が**伏せた写し**の上で行われるようになり、
  // その写しは `\p{Cc}`（制御文字を含む）も伏せる。順序を戻しても出力は変わらない
  // —— 生成した 30 万件で差 0 件を実測した。いま同じ性質を守るのは id 49（照合を生の
  // 文字列に戻す）と id 53（伏せる集合を狭める）である。
  // 番号は詰めない —— 過去の記録が id で変異を指しているため。
  {
    id: 49,
    label: "ラベルの照合を「目に映る姿」ではなく生の文字列に戻す（画面に出ない文字で見出しを割れる）",
    patch: "m49-label-match-without-view.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** ラベルの照合を「目に映る姿」ではなく生の文字列に戻す。ZWJ や U+00AD のように**出力からは落とせない**文字で見出しを割れるようになる（総当たりで 544 件）。",
  },
  {
    id: 50,
    label: "第2層の不可視文字を性質から旧列挙へ戻す（見た目が同じ名前の骨格が割れる）",
    patch: "m50-skeleton-invisible-enumeration.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** 第 2 層（`nameSkeleton`）が不可視を抜いた後の NFKC を外す。抜いたことで解禁された合成が適用されず、`\"Jose\" + ZWJ + U+0301` が `\"José\"` と別の骨格になって曖昧判定が発火しない。",
  },
  {
    id: 51,
    label: "normalizeDisplayName の末尾の NFKC を外す（掛けた回数で答えが変わる）",
    patch: "m51-normalize-not-idempotent.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** `normalizeDisplayName` 末尾の NFKC を外す。不可視・制御文字を抜くとそこで合成が解禁されるため、掛けた回数で答えが変わる（`\"A\" + U+200B + U+030A`）。玄関が提示した値とサーバーが保存する値が食い違う。",
  },
  {
    id: 52,
    label: "剥がしを 20 回で打ち切る（入れ子 21 段で剥がし残しが通る）",
    patch: "m52-strip-passes-capped.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** 剥がしの回数上限（20）を戻す。上限 40 文字は正規化の**後**に課されるので「表示名は短いから数回で収まる」は成り立たず、境界の前段が通す 720 文字ぶんだけ入れ子を書ける。21 段で `\"Bob(ID: rqdK)ID: rqdK)\"` がそのまま返り、冪等性も同時に崩れる。",
  },
  {
    id: 53,
    label: "伏せる集合を Default_Ignorable 単独へ狭める（\p{Cf} の 32 点が漏れる）",
    patch: "m53-invisible-source-narrowed.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** `Default_Ignorable_Code_Point` は `\\p{Cf}` から前置結合記号・割注・聖刻文字の書式制御を差し引いて定義される。単独で使うと U+0600–0605 / U+FFF9–FFFB / U+13430–1343F など 32 点が漏れ、そこでラベルの見出しを割れる。**和集合であることが要件である。**",
  },
  {
    id: 54,
    label: "字面の無い表示名の判定を長さだけに戻す（何も見えない参加者が名簿に並ぶ）",
    patch: "m54-renders-as-nothing-length-only.patch",
    pkg: "packages/room-core",
    tests: ["tests/display-name.test.ts"],
    note:
      "#284。**対応表より後に足した変異。** ZWJ・U+FE0F・U+00AD などは正当な用途のために出力へ残すので、それ 1 文字だけの名前は「長さ 1」で通る。境界も玄関も弾かず、名簿に**何も見えない行**が並ぶ。",
  },
  {
    id: 55,
    label: "同名の代理追加を理由も出さずにフォームごと畳む（黙って失敗する姿へ戻す）",
    patch: "m55-proxy-duplicate-silent.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291。**対応表より後に足した変異。** 拒否そのものは残し、**押した場所に何も残さない**形へ戻す" +
      "（理由を出さず、フォームを閉じ、入力を捨てる）。利用者が実画面で踏んだのはこの姿である ——" +
      "サーバーの `DuplicateName` バナーはページ上端に出ていたが、名簿を下までスクロールした操作地点からは" +
      "**ビューポートの 1075px 上**で、4 秒で自動消去されていた。**「フォームを閉じる処理を共通化した」で" +
      "実際に起こりうる形**にしてあり、判定も早期 return も残るのでコードを読んだだけでは欠陥に見えない。",
  },
  {
    id: 56,
    label: "代理を送った直後に無条件でフォームを畳む（サーバーの返事を待たない）",
    patch: "m56-proxy-closes-before-server-answers.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291 の敵対的レビュー。**#291 の最初の修正が実際にこの形だった。** 画面の同名判定は名簿と席しか" +
      "見ておらず、サーバーの `occupants` より狭い。**選択画面に居るだけの人との同名**は実 WS で" +
      "`DuplicateName` が返ることを測ってある（輪が満席・表示名の規約違反も画面には予測できない）。" +
      "畳むとその経路だけで入力ごと消え、**#291 の症状が戻る**。",
  },
  {
    id: 57,
    label: "改名の同名判定から自分自身の除外を落とす（画面がサーバーより厳しくなる）",
    patch: "m57-rename-forgets-to-exclude-self.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291 の敵対的レビュー。サーバーは `conflictsWithExisting(residents, displayName, target.participantId)` と" +
      "対象を除外して比べる。落とすと**こちら向きの誤り（画面のほうが厳しい）**になり、" +
      "**保険が無い** —— サーバーが通す操作を画面が拒むので、利用者は正当な操作をできなくなる。",
  },
  {
    id: 58,
    label: "拒否の理由を名簿の変化に追随させない（もう追加できる名前に「まだ駄目」と言う）",
    patch: "m58-rejection-ignores-roster-change.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291 の敵対的レビュー。**理由の文言そのものを state に置く素朴な実装は必ずこうなる。**" +
      "正規形を持って描画時にいまの名簿へ尋ねる形にしてあるのはそのためである。",
  },
  {
    id: 59,
    label: "代理が現れたとき入力欄の中身を見ずに畳む（打ちかけの入力が黙って消える）",
    patch: "m59-arrival-discards-retyped-input.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/RosterPanel.duplicate-proxy.test.tsx"],
    note:
      "#291。**対策そのものが持つ欠陥である**（[[countermeasures-carry-the-flaw-they-fix]]）。" +
      "送ったあと返事を待つ間に別の名前を打ち始めていると、あとから届いた名簿で畳んだ拍子に" +
      "**打ちかけの入力が黙って消える** —— #291 が直しているものとまったく同じ形。",
  },
  {
    id: 6,
    label: "freezeRunningClock の凍結を外す（一時停止で満タンに戻る）",
    patch: "m06-freeze-running-clock.patch",
    pkg: "packages/timer-core",
    tests: ["test/pause-freeze.test.ts", "test/break-freeze.test.ts"],
  },
  {
    id: 7,
    label: "帳簿を持たない snapshot を生成中側へ倒す（旧サーバーで画面が固まる）",
    patch: "m07-generating-guesses-when-ledger-missing.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/problem-generation.test.ts"],
    note:
      "#283。**かつては `shouldClearGenerating` の内容比較を参照比較に変える変異だった** —— " +
      "生成中をクライアントが内容差分で降ろしていた頃の対象で、その関数ごと消えたので" +
      "同じ欠陥の新しい住所へ移した。塞いだ形は**「無い情報を推測で埋める」**である。" +
      "配布の窓（新しい画面 × 旧サーバー）では帳簿そのものが来ないので、" +
      "推測すると**降ろす者が誰も居ない生成中**がお題パネルを固める。",
  },
  {
    id: 8,
    label: "deriveConnectionStatus の sessionLost 分岐を反転",
    patch: "m08-derive-connection-status-invert.patch",
    pkg: "apps/timer-web",
    // ⚠ apps/timer-web/test/ui/connection-status.test.tsx ではない。同名の別ファイルで、
    // そちらは StatusStrip コンポーネントの表示を検証する別物（plan.md 参照）。
    tests: ["test/connection-status.test.ts"],
  },
  {
    id: 9,
    label: "buildNoticeMessage の「あなた」判定を反転",
    patch: "m09-build-notice-message-invert.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/notice-message.test.ts"],
    note:
      "#276 の呼び名プールの統一（labelPool・敵対的レビュー #276 指摘1）で label() 周辺に" +
      "行が足されて当たらなくなったので当て直した。反転する条件式" +
      "（`participantId === ctx.selfParticipantId` → `!==`）自体は元のパッチと一字一句同じで、" +
      "作る欠陥（実行者が自分なのに「あなた」と出ない／他人なのに「あなた」と出る）も変わらない。",
  },
  {
    id: 10,
    label: "createRefEncoder.room が相関 ID ではなくルームコードをそのまま返す",
    patch: "m10-ref-encoder-passthrough.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/log/ref-encoder.test.ts", "test/log/reclaim-log.test.ts"],
    note:
      "資格情報がログへ戻る欠陥の型。ADR 0012 D2 の「部分表示も生の値も出さない」" +
      "という決定がテストで固定されていることを確かめる。",
  },
  {
    id: 11,
    label: "IPv6 の /64 丸めを無効化（アドレス全体を鍵にする）",
    patch: "m11-ipv6-prefix-full-address.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/client-key.test.ts"],
    note:
      "攻撃者が /64 内で送信元アドレスを回すだけでレート制限を回避できる欠陥。" +
      "client-key.test.ts の「下位 64 ビットが違っても同じ鍵になる」が検出する" +
      "（実測確認済み。同義表記の丸めを固定する他のテストも複数連鎖して落ちる）。",
  },
  {
    id: 12,
    label: "レート制限の判定をルーム照会の後ろへ移す",
    patch: "m12-rate-limit-check-after-lookup.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/join-rate-limit.test.ts", "test/live-ws.rate-limit.test.ts"],
    note:
      "残量が無いときに ROOM_NOT_FOUND が返り、トークンを消費せずに存在確認を" +
      "続けられる欠陥。設計正本 D3 が API を分けている理由そのもの。" +
      "in-process（join-rate-limit）と実 WS（live-ws.rate-limit）の両方で検出することを" +
      "実測で確認済み（設計正本 6.2 は実 WS を指定している）。",
  },
  {
    id: 13,
    label: "WS アダプタの鍵導出が X-Real-IP を（X-Forwarded-For より優先して）読む",
    patch: "m13-adapter-reads-x-real-ip.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/fail-closed.test.ts", "test/live-ws.rate-limit.test.ts"],
    note:
      "最終レビュー W-1。X-Real-IP は攻撃者が自由に付けられるヘッダ（Caddy は除去・" +
      "上書きしない）。接続のたびに値を変えるだけで毎回まっさらな鍵になり、#103 が" +
      "塞いだ「再接続でリセット」が復活する欠陥。poker 側にも同型のテストを足したが、" +
      "mutation-check の対象は timer 側の 1 件のみとした（W-1 の指示どおり）。",
  },
  {
    id: 14,
    label: "audit-domain-side-effects の FORBIDDEN から Math.random( を落とす",
    patch: "m14-forbidden-drop-math-random.patch",
    pkg: "scripts",
    tests: ["audit-domain-side-effects.test.mjs"],
    note:
      "検査の射程を「赤を消す最短経路」で狭める欠陥の型（#174）。検査本体だけを狭めても " +
      "audit-domain-side-effects.test.mjs の REQUIRED_FORBIDDEN が落ちる、という " +
      "同ファイルの docstring の主張を実際に確かめる。scripts/ は package.json を " +
      "持たないため、以前は detectRunner が例外で落ちてこの型を検査できなかった。",
  },
  {
    id: 16,
    label: "indicatesStaleRoom から room 配下の経路の判定を落とす",
    patch: "m16-stale-frame-room-prefix.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/stale-frame.test.ts"],
    note:
      "#209 で新設した判定。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと壊れた snapshot（room.config.members.0）が「画面を古くしない」側へ回り、" +
      "利用者への表出そのものが消える。",
  },
  {
    id: 17,
    label: "handleRoom から syncStale の解除を落とす",
    patch: "m17-sync-stale-never-cleared.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/use-timer-sync.test.tsx"],
    note:
      "#209 で新設した解除点。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと「同期できていません」が一度立ったきり二度と下りない。" +
      "**立てる側だけを変異させても、この欠陥は捕まらない。**",
  },
  {
    id: 18,
    label: "捨てたときに syncStale を立てるのをやめる",
    patch: "m18-poker-stale-never-raised.patch",
    pkg: "apps/poker-web",
    tests: ["tests/sync-stale-notice.test.tsx"],
    note:
      "#212 で新設した表出の起点。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと #212 以前へ戻る（捨てるが黙る）。**devtools の記録だけが残るので、" +
      "console を見ている開発者には気づけて利用者には気づけない**という、" +
      "本 Issue が塞いだ状態そのものになる。",
  },
  {
    id: 19,
    label: "有効なフレームを受け取ったときの syncStale の解除を落とす",
    patch: "m19-poker-stale-never-cleared.patch",
    pkg: "apps/poker-web",
    tests: ["tests/sync-stale-notice.test.tsx"],
    note:
      "#212 で新設した解除点。plan.md の対応表より後に書いたので、そちらには載っていない。" +
      "落とすと「同期できていません」が一度立ったきり二度と下りない。" +
      "**立てる側だけを変異させても、この欠陥は捕まらない。**",
  },
  {
    id: 15,
    label: "list-scan-targets から死んだ除外の検知を削る",
    patch: "m15-dead-exclusion-detection-removed.patch",
    pkg: "scripts",
    tests: ["list-scan-targets.test.mjs"],
    note:
      "「除外が 1 件も一致しなくなったら落とす」（#135・ADR-0014 決定 2）が静かに " +
      "消える欠陥の型。除外は本番の宣言では空なので、この検知が消えても走査結果は " +
      "1 バイトも変わらない。落ちるのは単体テストだけであり、そのテストが本当に " +
      "恒真化していないことをここで見る。",
  },
  {
    id: 20,
    label: "audit-supply-chain-config から「版を持たない除外」の検出を削る",
    patch: "m20-versionless-exclusion-undetected.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#135 経路⑤そのもの。除外エントリが `名前@版` から `名前` へ退化すると、以後その " +
      "パッケージの全版が降格検査の対象外になる。pnpm から見れば「より広い除外」として " +
      "正常に動作し、警告も出ない。**本番の宣言は正しい書式なので、この検出が消えても " +
      "検査結果は 1 バイトも変わらない**（id 15 と同じ型）。落ちるのは単体テストだけであり、" +
      "そのテストが恒真化していないことをここで見る。",
  },
  {
    id: 21,
    label: "install-with-supply-chain-check の証跡判定を「常に見つかった」にする",
    patch: "m21-verification-evidence-always-found.patch",
    pkg: "scripts",
    tests: ["install-with-supply-chain-check.test.mjs"],
    note:
      "#135 経路⑫。供給網ポリシーの検証は 2 段の短絡（optimisticRepeatInstall / " +
      "検証キャッシュ）で無警告のまま走らなくなる。証跡の判定が甘くなると、CI は " +
      "install が成功しただけで緑を出し、minimumReleaseAge と trustPolicy の再適用が " +
      "止まったことに誰も気づけない。**CI では現に検証が走っているので、この判定を " +
      "壊しても CI の色は変わらない**。落ちるのは単体テストだけである。",
  },
  {
    id: 22,
    label: "audit-plan-gate から原則の突き合わせを外す（見出しの有無だけを見る）",
    patch: "m22-plan-gate-principles-unchecked.patch",
    pkg: "scripts",
    tests: ["audit-plan-gate.test.mjs"],
    note:
      "#135 経路⑨。ゲートの検査が「節があるか」だけになると、**空の節を置けば通る** —— " +
      "塞ごうとしている「節はあるが実質が無い」をそのまま再生産する（対策が自分の塞ぐ " +
      "欠陥を持つ型）。**要求対象は現在 0 件なので、この判定を外しても検査結果は " +
      "1 バイトも変わらない**（id 15・20 と同じ型）。落ちるのは単体テストだけであり、" +
      "そのテストが恒真化していないことをここで見る。",
  },
  {
    id: 23,
    label: "audit-log-hygiene の走査対象から .tsx を落とす",
    patch: "m23-log-hygiene-drops-tsx.patch",
    pkg: "scripts",
    tests: ["audit-log-hygiene.test.mjs"],
    note:
      "#157 で広げた射程を、赤を消す最短経路で狭める欠陥の型（#174 と同じ）。" +
      "**この変異は検査本体も赤にする** —— ALLOWED_FILES に載せた History.tsx が " +
      "走査結果から消え、findStaleAllowances が「陳腐化した許可」として落とすためである。" +
      "ここで見たいのはそちらではなく、**拡張子を主張する単体テストが恒真化していないこと**。" +
      "宣言を切り出す前は、収集から .tsx を落としても自己テストは緑のままだった。",
  },
  {
    id: 24,
    label: "shouldAutoReveal から「接続中が 0 人なら立たない」の番人を外す",
    patch: "m24-should-auto-reveal-empty-roster.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note:
      "#95 S4a で名簿を poker-core の外へ出し、`shouldAutoReveal` は在室者を**引数で**" +
      "受け取るようになった（設計正本 §6.4）。`every` は空集合で真になるので、" +
      "`connected.length > 0` の番人が無いと**名簿を渡し忘れた／空の名簿しか渡さない**" +
      "呼び出しが全部『全員投票済み』になる。番人そのものを外すのがこの変異で、" +
      "殺す 1 本は「接続中が 0 人なら自動公開しない」である。" +
      "**番人が無い実装でも、空でない名簿しか渡さないテストは全部緑のまま通る** —— " +
      "この変異は、その恒真化を殺す 1 本が実在することだけを見る。",
  },
  {
    id: 25,
    label: "ドライバーの適格判定を presence へ戻す（timer の在席を見なくする）",
    patch: "m25-ineligible-by-presence.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/presence-model.test.ts"],
    note:
      "#95 S4b（D21）。S4a までは `presence === \"online\"` が「timer を見ている」と" +
      "同義だった（参加者が持てる接続が timer のものだけだったため）。多接続模型では" +
      "**ハブや poker のタブが生きている人も online** なので、この変異は" +
      "「タイマーを見ていない人にドライバーが回る」を作る。" +
      "**S4a のテストでは殺せない変異である** —— 殺すには「online だが timer に" +
      "在席していない参加者」を作るテストが要る（設計正本 §6.2 が R14 に要求した形）。",
  },
  {
    id: 27,
    label: "timer の参加者一覧から在席の絞り込みを外す（選択画面に居る人が出る）",
    patch: "m27-timer-roster-not-filtered.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts"],
    note:
      "#95 S5a（R5 / R6）。選択画面へ戻った人が timer の一覧に残り続ける欠陥。" +
      "**名簿からは消えないので、サーバーの状態を見ても気づけない** —— wire の形だけが違う。",
  },
  {
    id: 28,
    label: "ハブへの配信先を timer の接続へすり替える（選択画面が更新されない）",
    patch: "m28-hub-broadcast-to-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.hub.test.ts"],
    note:
      "#95 S5a（R3）。名簿が変わっても選択画面に届かない欠陥。" +
      "**timer は正しく動き続ける**ので、ハブの実 WS テストでしか捕まらない。",
  },
  {
    id: 29,
    label: "参加の合言葉の照合を落とす（保護ルームの名簿が読める）",
    patch: "m29-join-skips-passphrase.patch",
    pkg: "apps/tasuki-sync",
    tests: [
      "test/live-ws.hub.test.ts",
      "test/passphrase.test.ts",
      "test/live-ws.tool-entry.test.ts",
    ],
    note:
      "#95 S5a で timer とハブが守りを共有し、**S5b で poker も同じ関門を通る**ように" +
      "なった（`room-entry.ts`。入口の門の置き換え）。照合そのものを落とす。" +
      "S4a では同型の欠陥（合言葉を通さずに保護ルームの snapshot が読めた）が実機で出ている。",
  },
  {
    id: 33,
    label: "poker の参加者一覧から在席の絞り込みを外す（選択画面に居る人が切断中として出る）",
    patch: "m33-poker-roster-not-filtered.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（R5）。timer 側の m27 と対になる。**実画面で見つけた欠陥である** ——" +
      "1 つのルームが両ツールを持つようになり、選択画面に居るだけの人が poker の一覧に" +
      "「切断中」として並んだ。接続は生きているので事実に反する。",
  },
  {
    id: 30,
    label: "poker のラウンドを遅延生成しない（選択画面から poker へ入れない）",
    patch: "m30-poker-round-not-lazily-created.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（D8）。ハブで作ったルームはラウンドを持たないので、遅延生成が無いと" +
      "**選択画面から poker を選んだ人が「ルームが見つかりません」に落ちる**。" +
      "poker の既存テストは自分で作ったルームしか見ないので、この欠陥を捕まえない。",
  },
  {
    id: 31,
    label: "timer の状態を遅延生成しない（poker で作ったルームへ timer から入れない）",
    patch: "m31-timer-state-not-lazily-created.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（D8）。m30 の裏返し。**片方だけ遅延生成にしても気づけない**ので、" +
      "両方向に変異を置く。",
  },
  {
    id: 32,
    label: "退出しても票を捨てない（名簿に居ない人の票が集計に混ざる）",
    patch: "m32-discard-vote-noop.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.tool-entry.test.ts"],
    note:
      "#95 S5b（R8）。S4a では到達経路が無く実装ごと落としていた。1 つのルームが" +
      "両ツールを持てるようになって経路が生まれたので、呼び出し元ごと戻した。" +
      "**`packages/poker-core` を変異させ、配線側のテストで殺す**（純関数のテストだけだと" +
      "呼び出し元が外れても緑のまま）。",
  },
  {
    id: 26,
    label: "attachConnection が前の接続を奪う（1 本模型へ戻す）",
    patch: "m26-attach-steals-connection.patch",
    pkg: "packages/room-core",
    tests: ["tests/room.test.ts"],
    note:
      "#95 S4b（D14・R17）。後から繋いだタブが前のタブの接続を名簿から追い出すので、" +
      "配信の宛先（`connectionsIn`）から前のタブが消え、その画面は以後 1 通も更新を" +
      "受け取らない（黙って古くなる）。復帰の組を localStorage へ置いた D12 によって" +
      "「選択画面とツールを別タブ」が現実的な経路になったため、実害のある変異である。",
  },
  {
    id: 34,
    label: "?view=history でも room.join を送る（判定の正本を decideEntry から外す）",
    patch: "m34-history-view-joins-room.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.entry.test.tsx"],
    note:
      "#95 S5c（#249）。**レビューで実際に見つかった欠陥である。** 入口の判定を " +
      "`decideEntry` 1 つに寄せる前は、ここが独自に `?room=` だけを見ていた。" +
      "選択画面の「記録を見る」は `?view=history&room=CODE` を作り、開く人は必ず " +
      "そのルームの復帰の組を持っているので、**記録を見るだけのつもりの人が " +
      "`room.join` を送り、他の参加者の名簿に現れた**（在席は接続に紐づく・#95 S4b）。" +
      "変異は当時の実装そのもので、`?view=` が無い経路は変えない —— " +
      "**対照（`?room=` だけなら送る）を持つテストでしか殺せない**。",
  },
  {
    id: 35,
    label: "「新しいセッション」でルームをロビーへ戻さない（phase.set を送らない）",
    patch: "m35-new-session-keeps-celebration.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/use-timer-sync.test.tsx"],
    note:
      "#95 S5c（C-1）。**実画面で見つけた欠陥である。** 玄関へ送るだけで `celebration` を " +
      "残すと、同じルームへ戻った人は timer を開くたび完了画面に着き、往復のたびに " +
      "端末の完了記録が増え続ける。**poker は使えるのに timer だけ死んだルーム**になる。" +
      "遷移（`redirectTo`）は残すので、**行き先だけを見るテストでは捕まらない** —— " +
      "送るコマンドを見て初めて殺せる。",
  },
  {
    id: 36,
    label: "接続 URL の ?tool= を無視して常に timer の層へ流す",
    patch: "m36-tool-query-always-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter-tool-query.test.ts"],
    note:
      "#95 S5c（#249）。入口を `/ws` の 1 本に畳んだので、**経路ではツールを決められない**。" +
      "振り分けの根拠はクエリだけになった。無視すると poker のコマンドが timer の " +
      "メッセージ層へ落ち、**繋がるのにコマンドが通らない**という静かな壊れ方をする。" +
      "`?tool=` 無し（ハブ）は変えないので、**ハブの接続を見るテストでは緑のまま**である。",
  },
  {
    id: 37,
    label: "旧リンク（/poker/room/<id>）の誘導先からルームコードを落とす",
    patch: "m37-poker-legacy-path-drops-code.patch",
    pkg: "apps/poker-web",
    tests: ["tests/router.test.ts"],
    note:
      "#95 S5c（R9）。旧入口を撤去して玄関へ送るようにしたが、**コードを落とすと " +
      "ブックマークから来た人が入りたかったルームを失う**。玄関そのものは開くので、" +
      "**「玄関へ送る」ことだけを見るテストは素通りする**。",
  },
  {
    id: 38,
    label: "ルームコードが無くても玄関へ送り返さない（空のコードでルーム扱いにする）",
    patch: "m38-entry-without-code-stays.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/entry.test.ts"],
    note:
      "#95 S5c（R9）。旧入口（`Setup` / `Join`）を撤去した以上、**ルームコードを伴わない " +
      "URL には行き先が無い**。送り返さないと、空のコードのまま入室しようとして " +
      "**名乗る場所の無い画面に取り残される**（撤去前はそこに `Setup` が居た）。" +
      "この段の前提そのものなので、退化を無言で許さないように置く。",
  },
  {
    id: 39,
    label: "「新しいセッション」でロビーへ戻っても前のお題を落とさない",
    patch: "m39-new-session-keeps-old-problem.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts", "test/lobby-problem-autorequest.test.ts"],
    note:
      "#273。#249（#95 S5c）が「新しいセッション」をロビーへ戻す形にしたことで、" +
      "**同じルームで 2 本目を始める経路が初めてできた**。落とさないと 2 本目が " +
      "1 本目と同じお題で始まる。**埋め直しは `lobby-problem.ts` の不変条件が勝手に " +
      "やる**ので、落とす側を消しても例外は出ず、ロビーは普通に描画される —— " +
      "お題の中身を見て初めて殺せる。",
  },
  {
    id: 40,
    label: "落とすときに「ロビーでお題を扱う範囲」を見ない（`celebration` を出たら常に落とす）",
    patch: "m40-drop-ignores-lobby-scope.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts"],
    note:
      "#273 のレビュー 2 巡目。落とす条件は「`celebration` 発」と「行き先が " +
      "`usesLobbyProblem` の範囲」の 2 つでできており、**後者を外しても #273 の検査は " +
      "全部緑のままだった**（実測。全パッケージで落ちたのは別の性質を見ている " +
      "`live-ws.multi-connection.test.ts` の 1 本だけ）。恒真化していた側なので " +
      "恒久的に塞ぐ。殺すのは 2 つの経路である —— 遅れて届いた `phase.set session` で " +
      "**始まったばかりのセッションがお題を失う**ことと、お題を使わない設定のルームで " +
      "**落としたきり誰も埋めず完成記録が消える**こと。",
  },
  {
    id: 41,
    label: "seatSkipReason から一時離脱の優先を削る",
    patch: "m41-seat-skip-reason-ignores-standdown.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts"],
    note:
      "#276 D3。一時離脱（entry.eligible === false）は在席より先に見る。" +
      "削ると、timer に在席したまま一時離脱している人の理由が null（番が回る）に" +
      "化けるか、away/disconnected という別の理由に化ける。" +
      "**画面が言う理由とサーバーの判断がずれる**という #276 そのものの欠陥。",
  },
  {
    id: 42,
    label: "snapshot の nextIndex を (currentIndex + 1) % len へ戻す",
    patch: "m42-next-index-naive.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts", "test/handlers.driver-advance.test.ts"],
    note:
      "#276 が直した欠陥そのもの。飛ばされる席を数に入れるため、画面が出す「次」と" +
      "実際の交代先が食い違う。殺せないなら、直したことの証拠が無い。",
  },
  {
    id: 43,
    label: "確定時に生成中を降ろす条件へ「お題が変わったなら」を足す",
    patch: "m43-finalize-clears-only-on-change.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/problem-generation-state.test.ts"],
    note:
      "#283 の穴 1。**これは #283 より前のクライアント実装（内容差分で降ろす）を" +
      "サーバーへ移した形である** —— `pickFallback` は候補の中から選ぶので、" +
      "「別のお題にする」で同じ候補に当たると降りない。殺せないなら、" +
      "サーバー権威にした意味（内容に依存せず降りる）の証拠が無い。",
  },
  {
    id: 44,
    label: "依頼の冒頭の配信を「待ちが残る依頼だけ」に絞る（押下が画面に出ない）",
    patch: "m44-request-skips-pending-announcement.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/problem-generation-state.test.ts"],
    note:
      "#283 のレビュー指摘 3（当初実装そのもの）。**本番のロビーがこの絞り込みに落ちる** —— " +
      "実クライアントは常に `hasAiKey: false` を送るので候補が定型センチネルだけになり、" +
      "依頼と確定が同じ tick で終わる。帳簿として「いま作り直している」と言える瞬間が" +
      "1 本も残らず、途中から繋いだ端末はその依頼を知る術が無い。" +
      "**押下の手応えのほうは m46 / m47 が守っている**（送信元では生成中の snapshot が" +
      "確定と同じ描画に畳まれるため、この 1 本目では見えない・実測 10 回中 0 回）。",
  },
  {
    id: 45,
    label: "委譲の行き止まりで帳簿を整えない（降ろせない生成中が残る）",
    patch: "m45-dead-end-leaves-generating-on.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/problem-generation-state.test.ts"],
    note:
      "#283 のレビュー指摘 4。`offerToCurrent` の行き止まりへは **`onDeadline` の " +
      "setTimeout からも入る**ので、降ろしてくれる呼び出し側が居ない。" +
      "**65 秒の安全弁を落とした以上、画面側に逃げ道が無い** —— " +
      "以後どの snapshot を受け取ってもお題パネルは操作不能のままになる。",
  },
  {
    id: 46,
    label: "直前のお題の同一性を title 比較から参照比較へ変える（除外が空振りする）",
    patch: "m46-pickfallback-excludes-by-reference.patch",
    pkg: "packages/timer-core",
    tests: ["test/problem.test.ts"],
    note:
      "#283 のレビュー。確定時に写しを作るので参照は決して一致せず、**除外が何も外さなくなる**。" +
      "生成中の snapshot は送信元の端末では確定と同じ描画に畳まれる（実測で押した本人は " +
      "10 回中 0 回）ので、**結果が変わること以外に押下の手応えが無い**。",
  },
  {
    id: 47,
    label: "サーバーが pickFallback へ直前のお題を渡さない（配線だけが切れる）",
    patch: "m47-delegator-forgets-previous-problem.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/problem-generation-state.test.ts"],
    note:
      "#283 のレビュー。除外そのものは生きているので **pickFallback 単体の検査では気づけない**。" +
      "「別のお題にする」が同じお題を返しうる状態へ戻る。",
  },
  {
    id: 60,
    label: "room.join の答えを待つ期限を張らない（無言で永久に待つ状態へ戻る）",
    patch: "m60-join-deadline-never-armed.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** 入口の effect が `room.join` を送った直後の" +
      "期限を張らなくなる。切断ならバナーが出るが、**繋がっているのに答えが返らない場合は" +
      "「読み込んでいます…」だけが永久に出続ける** —— #292 が塞いだ欠陥そのものである。",
  },
  {
    id: 61,
    label: "混雑で入室を拒まれたときに期限を畳まない（待てば入れる人を無応答と断じる）",
    patch: "m61-join-deadline-survives-rate-limit.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** `JOIN_RATE_LIMITED` は「待てば入れる」経路で、" +
      "#147 の待ちは回を追うごとに倍になり最大 30 秒＋ばらつき。**期限（10 秒）を必ず追い越す。**" +
      "⚠ **1 回目の拒否だけでは検出できない** —— 入り直しの送信が期限を張り直してしまうため、" +
      "検出には**待ちが期限を追い越す回**まで進める必要がある（テスト側の注記を参照）。",
  },
  {
    id: 62,
    label: "退出が成立したときに期限を畳まない（去った後に行き止まりが出る）",
    patch: "m62-join-deadline-survives-leave.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** `leave-room` は `mode` を `null` に戻すので、" +
      "玄関へ遷移し終えるまでの間この受け皿が出る。畳まないと、抜けたはずの人が最後に" +
      "「ルームの情報を読み込めませんでした」を見る（`cancelJoinRetry` が #147 で塞いだのと同じ型）。",
  },
  {
    id: 63,
    label: "待っている間の接続状態を Loading から落とす（読み込み中に接続が読めなくなる）",
    patch: "m63-loading-hides-connection-state.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx", "test/ui/Loading.test.tsx"],
    note:
      "#292 EARS 2。**対応表より後に足した変異。** `StatusStrip` は `mode !== null` の" +
      "ときしか描かれないので、ここを落とすと**ルームの画面が決まる前は接続状態を読む場所が" +
      "どこにも無くなる**。切断と無応答の区別が付かなくなるのが実害である。",
  },
  {
    id: 64,
    label: "snapshot が届いても期限のタイマーを畳まない（印が立ったまま残る）",
    patch: "m64-join-deadline-survives-snapshot.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292。**対応表より後に足した変異。** ⚠ **画面には何も出ない** —— ルームの画面が" +
      "決まった後は `Loading` が描かれないので、印が立っても誰の目にも触れない。" +
      "「表示が出ないこと」を見るアサーションでは**畳んでも畳まなくても緑になる**ため、" +
      "検出しているのは残っているタイマーの数そのものを測るテストである。",
  },
  {
    id: 65,
    label: "混雑の入り直しを使い切っても待ち続ける（諦めのバナーの下で読み込み中が残る）",
    patch: "m65-join-retry-exhausted-keeps-waiting.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。使い切りの枝は**送信せずに `return` する**ので、" +
      "期限を張り直す相手が居ない。印を立てないと、諦めのバナー（`autoDismiss: false`）の下で" +
      "本文が「読み込んでいます…」と言い続け、**次にできることが出ない**。" +
      "⚠ 期限の発火を待つ形では直らない —— **張られていないものは切れない。**",
  },
  {
    id: 66,
    label: "接続状態の初期値を online へ戻す（繋がる前から接続中と断言する）",
    patch: "m66-conn-state-starts-online.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。`SyncConnection` が通知するのは `onopen` と `onclose` だけで、" +
      "**確立前は何も来ない**。ソケットが `CONNECTING` のまま滞留する状況（中間装置が " +
      "SYN を落とす・キャプティブポータル）で、行き止まりの横に「接続中」が並ぶ —— " +
      "接続状態を読める場所を足した目的と逆向きになる。",
  },
  {
    id: 67,
    label: "再読み込みを置き換え遷移で代用する（# を持つ URL で効かない）",
    patch: "m67-reload-via-replace.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。`location.replace()` はフラグメントだけが違う URL への遷移を" +
      "**同一文書内のスクロール**として扱うため、`#` があると再読み込みが起きない。" +
      "いま timer に `#` を作る経路は無いが、**行き止まりの唯一の主操作がこの一行に乗る。**",
  },
  {
    id: 68,
    label: "入り直しの時刻に復帰の組が無くても待ち続ける（送れないまま読み込み中が残る）",
    patch: "m68-resume-missing-keeps-waiting.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.loading-timeout.test.tsx"],
    note:
      "#292 のレビュー。m65 と同じ穴のもう 1 つの枝。**別タブが同じルームの復帰の組を" +
      "捨てた場合**（鍵は `localStorage`・ルームコード別）に成立し、送信が無いので" +
      "期限も張られない。2 つの枝を別の変異にしてあるのは、片方だけ直しても" +
      "もう片方が残るためである。",
  },
  {
    id: 69,
    label: "繰り上げの在席優先を潰す（presenceRank が常に同じ値を返す）",
    patch: "m69-pick-promotion-target-presence-rank-flat.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/pick-promotion-target.test.ts"],
    note:
      "#290・D2。`presenceRank` が在席・離席を区別しなくなると、joinedAt の早い順だけで" +
      "繰り上げ先が決まる。**先に参加した離席者が、後から来た在席者より優先される** —— " +
      "#276 が扱った「席は在るのに誰も居ない」状態を、繰り上げ自身が作り直すことになる。",
  },
  {
    id: 70,
    label: "玄関の departed 分岐を潰す（gone のとき常に 'gone' を返す）",
    patch: "m70-hub-departed-branch-flat.patch",
    pkg: "apps/landing",
    tests: ["tests/hub/hub-state.test.ts"],
    note:
      "#290・D4。`screenFor` が `departed` を見なくなると、`?left=`（自分の退出の結果" +
      "ルームが消えた）を持つ人にも死んだ招待 URL と同じ「不在の知らせ」が出る。" +
      "**自分で押した操作の結果なのに、何かが壊れたように読める画面へ落ちる。**",
  },
];

/**
 * 作業ツリーの汚れを見る。ただし本スクリプト自身の置き場（scripts/mutation-check.mjs と
 * scripts/mutations/）は除外する。
 *
 * 理由（鶏と卵の問題）: T004〜T006（本スクリプトと変異パッチの新設）は、この安全確認の
 * 対象になる「作業ツリーの変更」そのものである。これらは patch の適用・復元が一切
 * 触らないパスであり、除外しても「変異を適用してから git checkout -- で戻す」際の
 * 安全性には影響しない。真に守るべきは、パッチが触る製品/テストコードに既存の
 * 未コミット変更が残っていないことである。
 */
function gitStatusPorcelain() {
  return execFileSync(
    "git",
    [
      "status",
      "--porcelain",
      "--",
      ".",
      ":(exclude)scripts/mutation-check.mjs",
      ":(exclude)scripts/mutations",
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );
}

/** パッチ本文から、変更対象ファイル（REPO_ROOT からの相対パス）を抽出する。 */
function affectedFilesOf(patchPath) {
  const content = fs.readFileSync(patchPath, "utf8");
  const files = new Set();
  for (const line of content.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) files.add(m[1]);
  }
  return [...files];
}

/** 現在適用中（未復元）の変異のファイル一覧。異常終了時の復元に使う。 */
let currentlyAppliedFiles = [];

/**
 * 適用中の変異をディスクに残すマーカー。
 *
 * **なぜメモリだけでは足りないか。** 下の signal ハンドラは SIGINT/SIGTERM/SIGHUP しか捕まえられない。
 * **SIGKILL と、親プロセスごと殺される形の中断は捕捉できず**、`currentlyAppliedFiles` は
 * 復元されないまま失われる。実際にこれが起き、変異を適用したままの製品コードが
 * 作業ツリーに残った（`deriveConnectionStatus` の分岐が反転したまま）。
 *
 * そのときの唯一の防波堤は main() 冒頭の「未コミット変更があれば実行を拒否する」検査だが、
 * これは**次の実行を止めるだけで、変異が残っていること自体は教えてくれない**。
 * マーカーを残せば、次回起動時に何が適用されたままかが分かり、自動で戻せる。
 */
const MARKER_PATH = path.join(MUTATIONS_DIR, ".applied");

function writeMarker(files) {
  fs.writeFileSync(MARKER_PATH, files.join("\n"), "utf8");
}

function clearMarker() {
  if (fs.existsSync(MARKER_PATH)) fs.rmSync(MARKER_PATH);
}

/**
 * 同時実行を拒むためのロック。自分の PID を書く。
 *
 * **マーカー（`.applied`）とは役目が違う。** あちらは「異常終了した過去の実行」の
 * 後始末で、こちらは「いま並走している別の実行」を止める。片方だけでは、
 * 2 つが同時に走って互いの復元を潰し合う経路（ヘッダの docstring）を塞げない。
 */
const LOCK_PATH = path.join(MUTATIONS_DIR, ".lock");

/**
 * その PID のプロセスが生きているか。
 *
 * `process.kill(pid, 0)` はシグナルを送らずに存在だけを確かめる。`EPERM` は
 * 「居るが自分には送れない」なので**生きている**側に数える（別ユーザーの実行を
 * 死んだものと見なして踏み潰さない）。
 */
export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/**
 * 既存のロックを見て、実行を拒む理由を返す（拒まないなら null）。
 *
 * **判定を純粋関数にしてある**（I/O は呼び出し側）。ロックの有無で分岐する経路は
 * 実際に 2 つ走らせないと再現できず、そのままではテストが書けないため。
 *
 * 壊れたロック（PID として読めない中身）は**無いものとして扱う**。中身が壊れるのは
 * 書き込みの途中で殺された場合が主で、そのとき書き手はもう死んでいる。拒む側へ
 * 倒すと、誰も走っていないのに永久に実行できなくなる（消し方を知らない人が詰む）。
 * 代わりに呼び出し側が警告を出す。
 */
export function lockRefusalReason(rawLockText, isAlive = isPidAlive) {
  if (rawLockText === null || rawLockText === undefined) return null;
  const pid = Number.parseInt(String(rawLockText).trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (!isAlive(pid)) return null;
  return (
    `[mutation-check] 同じ作業ツリーで別の実行（PID ${pid}）が走っています。\n` +
    "2 つを同時に走らせると、片方の変異をもう片方の復元が消し、**変異が当たったまま**\n" +
    "残ることがあります。終わるのを待ってから再実行してください。\n\n" +
    `そのプロセスがもう居ないと分かっている場合だけ、${path.relative(REPO_ROOT, LOCK_PATH)} を消してください。`
  );
}

/** ロックを取る。取れなければ理由を出して非 0 で終わる。 */
function acquireLock() {
  const raw = fs.existsSync(LOCK_PATH) ? fs.readFileSync(LOCK_PATH, "utf8") : null;
  const reason = lockRefusalReason(raw);
  if (reason !== null) {
    console.error(reason);
    process.exit(1);
  }
  if (raw !== null) {
    console.error(
      `[mutation-check] 前回の実行が残したロックを引き取ります（中身: ${JSON.stringify(raw.trim())}）。`,
    );
  }
  // 置き場が無いことがある（エントリ判定のテストはこのスクリプトだけを一時ディレクトリへ
  // 複製して起動する）。ロックが取れないせいで main() に入れないのは筋が違うので作る。
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, String(process.pid), "utf8");
  // **exit で必ず外す。** main() は複数の場所で process.exit するので、
  // 呼び出し箇所ごとに解放を書くと必ずどれかが漏れる。
  process.on("exit", releaseLock);
}

/** ロックを外す。**自分が書いたものだけ**を消す。 */
function releaseLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return;
    if (fs.readFileSync(LOCK_PATH, "utf8").trim() !== String(process.pid)) return;
    fs.rmSync(LOCK_PATH);
  } catch {
    // 解放に失敗しても終了は妨げない。次の実行が「死んだ PID のロック」として引き取る。
  }
}

/**
 * 前回の実行が変異を適用したまま異常終了していないかを調べ、していれば復元する。
 * **未コミット変更の検査より前に呼ぶこと。** そうしないと自分が残した変異で自分が止まる。
 */
function recoverFromCrashedRun() {
  if (!fs.existsSync(MARKER_PATH)) return;
  const files = fs
    .readFileSync(MARKER_PATH, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  clearMarker();
  if (files.length === 0) return;
  // eslint-disable-next-line no-console
  console.error(
    "[mutation-check] 前回の実行が変異を適用したまま異常終了していました。復元します:\n" +
      files.map((f) => `  - ${f}`).join("\n"),
  );
  try {
    execFileSync("git", ["checkout", "--", ...files], { cwd: REPO_ROOT, stdio: "inherit" });
    // eslint-disable-next-line no-console
    console.error("[mutation-check] 復元しました。");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[mutation-check] 復元に失敗しました。手動で確認してください。");
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
}

/** 復元の再試行回数と待機時間。index.lock の競合は一過性という前提で決めた値。 */
const RESTORE_MAX_ATTEMPTS = 5;
const RESTORE_RETRY_DELAY_MS = 300;

/**
 * 復元を再試行込みで実行し、最終的に戻ったかどうかを判定する。
 *
 * **「コマンドが成功した」と「実際に戻った」は別の事実である。** `git checkout --` の
 * 失敗（`.git/index.lock` の競合等）は一過性なので、`checkoutFn` が例外を投げても
 * 即座には諦めない。一方 `checkoutFn` が例外を投げずに終わっても、それだけでは
 * 戻ったとは判定しない —— 必ず `isRestoredFn` で実際に HEAD と一致したかを確かめる。
 * 両方の意味で「コマンドの結果」を鵜呑みにしない。
 *
 * **判定を純粋関数にしてある**（実 I/O は呼び出し側が注入する）。git のロック競合は
 * 実際に再現しなくても、「コマンドは成功したのにファイルが戻っていない」状況を
 * 注入した関数で作れば、再試行の回数・打ち切りの判定はテストできる。
 *
 * @param {string[]} files - 復元対象（REPO_ROOT からの相対パス）
 * @param {object} io
 * @param {() => void} io.checkoutFn - 復元コマンドを 1 回試みる。失敗時は投げてよい
 *   （ここで捕まえ、次の試行へ回す。最後の試行の例外も握りつぶし、戻ったかどうかは
 *   常に isRestoredFn で判定する）
 * @param {() => boolean} io.isRestoredFn - files が HEAD と一致していれば true
 * @param {(attempt: number) => void} io.waitFn - 次の試行前の待機（試行番号を渡す）
 * @param {number} [io.maxAttempts]
 * @returns {{ restored: boolean, attempts: number }}
 */
export function restoreWithRetry(
  files,
  { checkoutFn, isRestoredFn, waitFn, maxAttempts = RESTORE_MAX_ATTEMPTS },
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      checkoutFn();
    } catch {
      // 投げても即座には諦めない。index.lock の競合は一過性であり得るため、
      // 最終判定は下の isRestoredFn に委ねる（コマンドの成否では判定しない）。
    }
    if (isRestoredFn()) return { restored: true, attempts: attempt };
    if (attempt < maxAttempts) waitFn(attempt);
  }
  return { restored: false, attempts: maxAttempts };
}

/**
 * 復元に失敗したときの、見逃しようのないメッセージを組み立てる（純粋関数）。
 *
 * 長い走行のログに `console.error` の 1 行が流れて見逃された実例があるため、
 * **致命的である旨・試行回数・残っているファイル名**を必ず含める。
 */
export function formatRestoreFailureMessage(files, attempts) {
  return (
    `[mutation-check] 致命的: ${attempts} 回試行しても復元できませんでした。\n` +
    "製品コードに変異が当たったままです（認証バイパスや入力検証の迂回を含みうる）。\n" +
    "手動で以下を確認し、必要なら git checkout -- で戻してください:\n" +
    files.map((f) => `  - ${f}`).join("\n")
  );
}

/** files が HEAD と一致しているか（`git status --porcelain` の出力が空かどうかで見る）。 */
function isRestoredToHead(files) {
  const out = execFileSync("git", ["status", "--porcelain", "--", ...files], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.trim() === "";
}

/** 再試行の待機（同期）。SharedArrayBuffer + Atomics.wait は追加依存なしで同期待機できる。 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function restoreCurrentMutation() {
  // マーカーは git apply の**前**に書くため、apply 自体が失敗した場合は
  // currentlyAppliedFiles が空のままマーカーだけが残る。ここで先に消しておかないと、
  // 次回の実行が「前回は異常終了した」と誤って報告する（実際に m05 のパッチが
  // 適用できなくなったときにこれが起きた）。
  clearMarker();
  if (currentlyAppliedFiles.length === 0) return;
  const files = currentlyAppliedFiles;
  currentlyAppliedFiles = [];

  const result = restoreWithRetry(files, {
    checkoutFn: () =>
      execFileSync("git", ["checkout", "--", ...files], { cwd: REPO_ROOT, stdio: "inherit" }),
    isRestoredFn: () => isRestoredToHead(files),
    waitFn: () => sleepSync(RESTORE_RETRY_DELAY_MS),
    maxAttempts: RESTORE_MAX_ATTEMPTS,
  });

  if (result.restored) {
    // eslint-disable-next-line no-console
    console.error(
      `[mutation-check] 復元しました: ${files.join(", ")}` +
        (result.attempts > 1 ? `（${result.attempts} 回目の試行で確認）` : ""),
    );
    return;
  }

  // 復元自体が失敗するのは最悪のケース。ここで握りつぶさず、非 0 で終了して必ず知らせる。
  // eslint-disable-next-line no-console
  console.error(formatRestoreFailureMessage(files, result.attempts));
  process.exit(1);
}

// 異常終了（Ctrl-C・kill・未捕捉例外）でも必ず復元する。
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    restoreCurrentMutation();
    process.exit(130);
  });
}
process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[mutation-check] 捕捉されない例外:", err);
  restoreCurrentMutation();
  process.exit(1);
});

function applyMutation(mutation) {
  const patchPath = path.join(MUTATIONS_DIR, mutation.patch);
  const files = affectedFilesOf(patchPath);
  // マーカーを**先に**書く。git apply の後に書くと、その間に殺された場合に取りこぼす。
  writeMarker(files);
  execFileSync("git", ["apply", patchPath], { cwd: REPO_ROOT, stdio: "inherit" });
  currentlyAppliedFiles = files;
}

function restoreMutation() {
  restoreCurrentMutation();
}

/**
 * 変異が検出を期待するテストファイルが実在するか確かめる。
 *
 * vitest は指定したテストファイルが 1 つも見つからないとき「No test files found」で
 * exit 1 を返す。runTests は status !== 0 を「検出」とみなすので、**テストが消えると
 * 変異検査は全件「検出」と報告して緑になる**。検査が守るはずの「検査が静かに効かなく
 * なる」を、検査自身が起こしていた（#70 の破壊検証で発覚）。
 */
function assertMutationTestsExist() {
  const missing = [];
  for (const mutation of MUTATIONS) {
    for (const rel of mutation.tests) {
      const abs = path.join(WORKSPACE_ROOT, mutation.pkg, rel);
      if (!fs.existsSync(abs)) missing.push(`変異 #${mutation.id}: ${mutation.pkg}/${rel}`);
    }
  }
  if (missing.length === 0) return;
  console.error("検出を期待するテストファイルが見つかりません:");
  for (const m of missing) console.error(`  ${m}`);
  console.error("\n対応表（MUTATIONS）と実ファイルがずれています。どちらかを直してください。");
  process.exit(1);
}

/**
 * 対応表と patch ファイルが全単射であることを確かめる（#135 経路①）。
 *
 * **限界**: 対応表の項目と patch ファイルを**両方**消せば全単射は保たれ、
 * この検査は通る。件数の下限を直書きする対策は採らない — 下限を下げるのが
 * 赤を消す最短経路になり、対応表から項目を消すのと同じ穴になるため
 * （ADR-0014 決定 8）。patch の削除が diff に現れることをレビューの拠り所とする。
 *
 * 下の 0 件ガードは「下限の直書き」の例外（ADR-0014 決定 8 の但し書き）。
 * 0 件（空振り）は「何も検証していない」状態そのものであり、維持コストが
 * 要る閾値ではないため、下限を直書きしない MUST NOT の対象に含めない。
 */
function assertMutationPatchesBijective() {
  // 0 件（空振り）の判定は共有モジュールへ寄せる（ADR-0014 決定 8。集約は #135 設計正本 D10）。
  if (hasZeroScanTargets(MUTATIONS.length)) {
    console.error("[mutation-check] 変異が 0 件です（検査が空振りします）");
    process.exit(1);
  }
  const declared = MUTATIONS.map((m) => m.patch);
  const actual = fs.readdirSync(MUTATIONS_DIR).filter((f) => f.endsWith(".patch"));
  const diff = diffTargets(declared, actual);
  if (hasTargetDrift(diff)) {
    console.error(formatTargetDiff("mutation-check", diff, `変異 ${declared.length} 件`));
    process.exit(1);
  }
}

/**
 * bun の実行体を解決する。PATH 上に無ければ既定の設置場所へフォールバックする
 * （CI では oven-sh/setup-bun@v2 が PATH へ足すが、ローカルの導入形態は環境によって
 * ばらつくため）。
 */
let bunBinCache = null;
function resolveBunBin() {
  if (bunBinCache !== null) return bunBinCache;
  const onPath = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (onPath.status === 0) {
    bunBinCache = "bun";
    return bunBinCache;
  }
  const fallback = path.join(os.homedir(), ".bun", "bin", "bun");
  if (fs.existsSync(fallback)) {
    bunBinCache = fallback;
    return bunBinCache;
  }
  throw new Error(
    "bun 実行体が見つかりません（PATH にも ~/.bun/bin/bun にも無い）。" +
      "apps/tasuki-sync の変異には bun test が必要です。",
  );
}

/**
 * 対象ディレクトリの package.json の scripts.test を見て、実際のテストランナーを判定する。
 * 決め打ちしないのは、ランナーが違うパッケージへ間違ったコマンドを投げると
 * 「テストを1件も実行せずに exit code が非 0 になる」形で誤検出するため
 * （このファイル冒頭のコメント参照）。
 *
 * **package.json を持たないディレクトリは node（`node --test`）を既定にする**（#174）。
 * `scripts/` がそれで、検査本体とその自己テストが同居しているのに package.json が無いため、
 * 以前はここが例外で落ちて変異対象にできなかった。既定を node にするのは、
 * 「設定を持たないディレクトリで、設定なしに動く唯一のランナー」だからである。
 * **`pkgDir` の名前を見て `scripts` なら node、という特別扱いはしない** — 対象が
 * 増えるたびに腐る（列挙ではなく機構で指す）。
 *
 * この既定が誤った対象へ当たっても、誤検出には育たない。宣言の `pkg` が実在しない
 * ディレクトリなら {@link assertMutationTestsExist} が先に落とし、ランナーが違えば
 * 変異を当てる前の対照実行が落ちる。既定は「静かに間違える」経路を新しく作らない。
 *
 * **「無い」と「読めない」は混ぜない。** package.json が実在するのに壊れている・
 * 未知のランナーを指しているときは、既定へ倒さず例外にする。倒すと、設定を
 * 黙って無視して別のランナーで走らせることになる。
 */
export function detectRunner(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return "node";
  let testScript;
  try {
    testScript = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).scripts?.test ?? "";
  } catch (e) {
    throw new Error(`package.json の読み込みに失敗しました（${pkgJsonPath}）: ${e.message}`, { cause: e });
  }
  if (testScript.includes("bun test")) return "bun";
  if (/^node --test\b/.test(testScript)) return "node";
  if (testScript.includes("vitest")) return "vitest";
  throw new Error(
    `未知のテストランナーです。scripts.test の内容から判定できません: "${testScript}"（${pkgJsonPath}）`,
  );
}

/** ランナーごとに、実行コマンドと引数を組み立てる。 */
export function buildCommand(runner, mutation, full) {
  switch (runner) {
    case "vitest":
      return { cmd: "npx", args: full ? ["vitest", "run"] : ["vitest", "run", ...mutation.tests] };
    case "bun":
      return { cmd: resolveBunBin(), args: full ? ["test"] : ["test", ...mutation.tests] };
    case "node": {
      if (full) {
        // package.json があれば scripts.test（例: "node --test tests/*.test.mjs"）を
        // そのまま使う。パッケージが自分で決めた「全体実行」がそれだからである。
        const pkgJsonPath = path.join(WORKSPACE_ROOT, mutation.pkg, "package.json");
        if (fs.existsSync(pkgJsonPath)) {
          const testScript = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).scripts.test;
          const [cmd, ...args] = testScript.split(/\s+/);
          return { cmd, args };
        }
        // package.json が無い対象（scripts/ 等）は、ファイルを 1 つも指定せずに
        // `node --test` を対象ディレクトリで走らせ、**探索は node 自身に任せる**。
        // ここへテストファイルの列挙やグロブを書くと、CI が使っている導出
        // （`node scripts/list-scan-targets.mjs script-tests`）と二重管理になり、
        // 片側だけ直したときに黙ってずれる（#135・ADR-0014）。
        return { cmd: "node", args: ["--test"] };
      }
      return { cmd: "node", args: ["--test", ...mutation.tests] };
    }
    default:
      throw new Error(`未対応のランナーです: ${runner}`);
  }
}

/**
 * 対象パッケージのテストを、パッケージの実際のランナー（bun test / node --test / vitest）で
 * 実行する。
 * full=false: 対応表のテストファイルのみ（絞り込み実行・既定）。
 * full=true : パッケージ全体（--full）。
 * @returns {{passed: boolean, exitCode: number|null, output: string, command: string}}
 *          passed は「テストが 1 件も落ちずに完走した」= exit code 0。
 *          「検出」かどうかの解釈は呼び出し側（対照実行か変異後の実行か）で決める。
 */
function runTests(mutation, full) {
  const pkgDir = path.join(WORKSPACE_ROOT, mutation.pkg);
  const runner = detectRunner(pkgDir);
  const { cmd, args } = buildCommand(runner, mutation, full);
  const result = spawnSync(cmd, args, {
    cwd: pkgDir,
    stdio: "pipe",
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    passed: result.status === 0,
    exitCode: result.status,
    output,
    command: `${cmd} ${args.join(" ")}（cwd: ${mutation.pkg}, runner: ${runner}）`,
  };
}

function main() {
  const full = process.argv.includes("--full");

  // **復元より前にロックを取る。** 復元自体が `git checkout --` を撃つので、
  // 並走している実行の変異をここで消してしまう経路がある。
  acquireLock();

  // 未コミット変更の検査より前に行う。前回の異常終了で残った変異を、
  // その検査に引っかからせるのではなく自分で片付けるため。
  recoverFromCrashedRun();

  assertMutationTestsExist();
  assertMutationPatchesBijective();

  const status = gitStatusPorcelain();
  if (status.trim() !== "") {
    console.error(
      "[mutation-check] 作業ツリーに未コミットの変更があります。変異検査は復元のために\n" +
        "git checkout -- を使うため、未コミット変更があると消えてしまいます。\n" +
        "コミットまたは退避してから再実行してください。\n\n" +
        "git status --porcelain の出力:\n" +
        status,
    );
    process.exit(1);
  }

  console.log(`[mutation-check] モード: ${full ? "--full（パッケージ全体）" : "絞り込み実行（対応表のテストのみ）"}`);
  console.log(`[mutation-check] リポジトリルート: ${REPO_ROOT}`);
  console.log(`[mutation-check] 変異数: ${MUTATIONS.length}\n`);

  const results = [];

  for (const mutation of MUTATIONS) {
    console.log(`--- 変異 #${mutation.id}: ${mutation.label} ---`);

    // 対照実行: 変異を当てる前の素のコードで、同じコマンドがまず通ることを確認する。
    // ここが通らない場合、この後の「検出」判定はランナーが起動できているかどうかすら
    // 保証されておらず無意味なので、「検出」とは報告せず即座に止める。
    const control = runTests(mutation, full);
    if (!control.passed) {
      console.error(
        `\n[mutation-check] 変異 #${mutation.id} の対照実行が失敗しました` +
          `（変異を当てる前の素のコードでテストが通りませんでした）。\n` +
          `  実行コマンド: ${control.command}\n` +
          `  exit code: ${control.exitCode}\n\n` +
          "対応表（MUTATIONS）のパッケージ・テストパス・ランナー判定を確認してください。\n" +
          "この状態で先へ進むと、変異が原因で落ちたのか元から落ちていたのか区別できません。\n\n" +
          "--- 対照実行の出力（末尾） ---\n" +
          control.output.split("\n").slice(-40).join("\n"),
      );
      process.exit(1);
    }
    console.log(`  対照: ○ 通過（${control.command}）`);
    console.log(
      "    " +
        control.output
          .trim()
          .split("\n")
          .slice(-3)
          .join("\n    "),
    );

    let outcome;
    try {
      applyMutation(mutation);
      const testResult = runTests(mutation, full);
      outcome = { ...mutation, detected: !testResult.passed, exitCode: testResult.exitCode, output: testResult.output };
    } finally {
      restoreMutation();
    }
    console.log(
      `  検出: ${outcome.detected ? "○ 検出された" : "× 検出されなかった"}` +
        `（exit code ${outcome.exitCode}）`,
    );
    if (!outcome.detected) {
      // 検出できなかった詳細はベースラインの妥当性検査で重要になるので出力しておく。
      console.log("  --- テスト出力（末尾） ---");
      console.log(outcome.output.split("\n").slice(-40).join("\n"));
    }
    results.push(outcome);
  }

  // ─── 結果表 ────────────────────────────────────────────────────────────
  console.log("\n=== 変異検査 結果表 ===");
  console.log("# | 検出 | 対象パッケージ | 変異");
  for (const r of results) {
    console.log(`${r.id} | ${r.detected ? "検出" : "未検出"} | ${r.pkg} | ${r.label}`);
  }

  const undetected = results.filter((r) => !r.detected);

  // ─── T006: ベースラインの妥当性検査 ────────────────────────────────────
  // 「検出されない変異は前後比較の材料にならず、表が一致したという誤った安心を
  //  与える」（plan.md）ため、1件でも未検出があれば必ずエラー終了する。
  if (undetected.length > 0) {
    console.error(
      `\n[mutation-check] ベースラインの妥当性検査に失敗しました: ` +
        `${undetected.length} 件の変異が検出されませんでした（# ${undetected.map((r) => r.id).join(", ")}）。\n` +
        "変異を差し替えるか、検出できるテストを先に追加してください（FR-098）。",
    );
    process.exit(1);
  }

  console.log("\n[mutation-check] 全変異が検出されました（ベースラインとして妥当）。");
  process.exit(0);
}

// 直接実行されたときだけ走らせる。自己テスト（mutation-check.test.mjs）は
// このファイルから import するだけで、変異は当てない。
if (isDirectRun(import.meta.url, process.argv[1])) main();
