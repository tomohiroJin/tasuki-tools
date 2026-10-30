/**
 * 変異検査（`scripts/mutation-check.mjs`）の宣言の表（#380 で機構から分けた）。
 *
 * 変異を足すときは、ここに宣言を足し、`scripts/mutations/` にパッチを置く。宣言とパッチは 1 対 1
 * （`mutation-check.mjs` の `assertMutationPatchesBijective` が実行の初めに見る）。
 * **ID は詰めない・使い回さない**（過去の記録が ID で変異を指している）。
 *
 * このファイルは `--changed` の「変異検査の機構」に数える（入口が import するため。宣言を書き足した枝は
 * 全件に倒れる）。作業ツリーの汚れの検査からは除外する（宣言を書き足した直後でも流せるように）。
 * どちらも `mutation-check.test.mjs` の「宣言の表の置き場（#380）」が見る。
 */

/**
 * 変異定義。
 *
 * pkg: 対象ディレクトリ（WORKSPACE_ROOT からの相対パス）。--full 実行時と、
 *      対応表のテストのみの実行時にランナーを呼ぶ cwd の両方に使う。パッケージとは限らない
 *      （`scripts/` のように package.json を持たないディレクトリも取れる。#174）。
 * tests: 検出を期待するテストファイル（pkg からの相対パス）。
 * note: plan.md の対応表からの読み替えがあれば、その内容と理由をここに記録する。
 *       **plan.md より後に足した変異もここに理由を書く。** 対応表は
 *       `docs/plans/codebase-refactoring/plan.md` の作業記録であり、以後に
 *       書き換えた実装（ADR-0006 決定 4 が変異を要求する）はそこに追記されない。
 */
const RESERVED_220_229 =
  "**対応表より後に足した変異。** 200〜249 は 2026-10-15 の並列修正（#373・#374・#376・#381・#382）に 10 ずつ割り当てた予約の範囲（#376 は 220〜229）。";

const RESERVED_250_259 =
  "**対応表より後に足した変異。** 250〜259 は 2026-10-15 の並列修正で #376 に追加で割り当てた予約の範囲（220〜229 が埋まったため）。";

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
    id: 73,
    label: "色を決められない塗り（url）の層を読み飛ばす（読めた層だけで緑を出す）",
    patch: "m73-unreadable-layer-ignored.patch",
    pkg: "e2e",
    tests: ["tests/contrast.test.ts"],
    note:
      "#296。**対応表より後に足した変異。** これは #279 まで実在した欠陥そのもので、" +
      "羅紗の織り目のような薄い粒なら実害は無いが、**不透明な写真を重ねると検査が嘘をつく**。" +
      "落とすと、読めた層（照明のグラデーション）だけで測って緑を出す形に戻る。",
  },
  {
    id: 74,
    label: "流れの中に箱を持つ擬似要素（罫線など）も地に数える",
    patch: "m74-in-flow-pseudo-counted-as-ground.patch",
    pkg: "e2e",
    tests: ["tests/contrast.test.ts"],
    note:
      "#296。**対応表より後に足した変異。** 擬似要素を地に含めるとき、`position` を見ないと" +
      "見出しの下の罫線まで下地に混ざる（実測で玄関に実在する）。**乗っていない塗りで字を測る**" +
      "ことになり、地が明るい側へ嘘をつく。対策そのものが持つ欠陥の型。" +
      "**判定は許可リスト（`absolute` / `fixed`）である** —— `static` だけを弾く形だと" +
      "`relative` と `sticky` が漏れ、この変異でも見えなかった（レビュー 2 巡目）。",
  },
  {
    id: 75,
    label: "字を塗る擬似要素（background-clip: text）も地に数える",
    patch: "m75-pseudo-glyph-paint-counted-as-ground.patch",
    pkg: "e2e",
    tests: ["tests/contrast.test.ts"],
    note:
      "#296。**対応表より後に足した変異。** 要素自身の背景には #279 でこのガードを入れたが、" +
      "#296 で新設した**擬似要素の経路には無かった**（敵対的検証の指摘）。落とすと、" +
      "擬似要素が字を塗る層の色をその擬似要素の**地**として測ることになる —— " +
      "**過去に一度塞いだ穴を、新しい経路で開け直す型**である。",
  },
  {
    id: 76,
    label: "language の検証を許可リストから任意の非空文字列へ戻す",
    patch: "m76-topic-language-not-enumerated.patch",
    pkg: "packages/topic-core",
    tests: ["tests/schemas.test.ts"],
    note:
      "#91・E13・docs/adr/0012 D10。`language` の検証を許可リスト（v.picklist）から" +
      "任意の非空文字列（v.pipe(v.string(), v.minLength(1))）へ戻す。プロンプトへ" +
      "任意の文字列が届く——2026-08-13 に持ち出し経路が本番で成立した入口。",
  },
  {
    id: 77,
    label: "お題生成の起動引数から --tools \"\" を落とす",
    patch: "m77-topic-provider-tools-flag-dropped.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/claude-cli-topic-provider.test.ts"],
    note:
      "#91・E12・docs/adr/0012 D10・spec §10。起動引数から `--tools \"\"` を消す。" +
      "本番の CLI（2.1.178）で `--tools \"\"` を落とすと、利用者設定のプラグインが" +
      "足す LSP 等の組み込みツールが残ることを実測している（2026-09-24）。",
  },
  {
    id: 78,
    label: "topic.set が進行中の生成を止めずに書く",
    patch: "m78-topic-set-skips-cancel.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-handlers.test.ts"],
    note:
      "#91・E11。`topic.set` から `generator.cancel(roomCode)` を消す。止めずに掲げると、" +
      "あとから届いた生成の結果が利用者の掲げたお題を上書きしうる。",
  },
  {
    id: 79,
    label: "クールダウンの判定を中断（cancel）より後ろへ移す",
    patch: "m79-cooldown-check-after-cancel.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-generation.test.ts"],
    note:
      "#91・E22・spec §5.3。`isCoolingDown` の判定を `cancel` より後ろへ移す。" +
      "先に中断すると、作り直しを拒んだはずのクールダウン中でも進行中の生成が" +
      "消え（signal が abort され）、「進行中の生成とお題を残す」という契約が壊れる。",
  },
  {
    id: 80,
    label: "ルーム破棄がお題の生成を中断しない",
    patch: "m80-destroy-room-skips-topic-cancel.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note:
      "#91・E6。ルーム破棄から `topicGenerator.cancel(roomCode)` を消す。" +
      "破棄されたルームの進行中のお題生成（子プロセス・AI の枠）が止まらないまま" +
      "走り続ける欠陥。#91 PR 3 で隣の `delegator?.cancel` が消えたので作り直した。",
  },
  {
    id: 81,
    label: "お題の ai.unlock へ room.join と別のレート制限ゲートを渡す",
    patch: "m81-topic-unlock-fresh-rate-limit-gate.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91・E21・spec §9。`makeTopicHandlers` へ渡す `rateLimitGate` を" +
      "`handlers.rateLimitGate`（room.join と共有する 1 個）ではなく、" +
      "`createRateLimitGate(rateLimiter)` で新しく作った別インスタンスにする。" +
      "バケツが connId→clientKey の登録ごと分かれるため、room.join を枯渇させても" +
      "ai.unlock は素通りし（逆も同様）、同じ IP からの総当たりが片方のツールを" +
      "迂回すれば通ってしまう。",
  },
  {
    id: 82,
    label: "お題の接続を poker の早期 return に乗せる",
    patch: "m82-topic-takes-poker-early-return.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter-tool-query.test.ts", "test/live-ws.topic.test.ts"],
    note:
      "#91・E21・spec §5.3 の MUST。お題の接続を poker と同じ早期 return（onConnect を" +
      "呼ばずに抜ける）に乗せる。onConnect が呼ばれないと `rateLimitGate.open` が" +
      "接続とクライアント鍵を結ばず、鍵が connId へ落ちる —— ai.unlock の総当たりが" +
      "接続を張り直すだけで枠を回避できる（直前の行のコメントが禁じている変更そのもの）。",
  },
  {
    id: 83,
    label: "timer の生 JSON が TopicCommandSchema に通るとお題の経路へ奪われる",
    patch: "m83-timer-messages-hijacked-by-topic-schema.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91・E5・spec T4「お題を変えられるのはお題ツールの接続だけ」。timer の接続の" +
      "メッセージも、生 JSON が `TopicCommandSchema` に通ればお題の経路" +
      "（`onTopicMessage`）へ回してしまう。2 段目（`roomCodeOf` がお題ツールの接続だけを" +
      "数える。m86 が壊す）があるのでお題そのものは変わらないが、timer 側の INVALID_COMMAND" +
      "ではなくお題の経路の NOT_IN_ROOM が返り、テストは応答コードの違いで検出する。",
  },
  {
    id: 84,
    label: "お題生成の起動引数から --setting-sources \"\" を落とす",
    patch: "m84-topic-provider-setting-sources-dropped.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/claude-cli-topic-provider.test.ts"],
    note:
      "R11・docs/adr/0012 D10・spec §10。起動引数から `--setting-sources \"\"` を消す" +
      "（`--tools \"\"` は残す）。本番の CLI（2.1.178）で `--tools \"\"` だけでは" +
      "利用者設定のプラグインが足す LSP 等の組み込みツールが残ることを実測している" +
      "（2026-09-24）——`--setting-sources \"\"` はその実測を埋める側であり、これを" +
      "落とすと利用者・プロジェクト設定を読み込む状態へ戻る。",
  },
  {
    id: 85,
    label: "お題の配信先からハブを落とす",
    patch: "m85-topic-broadcast-drops-hub.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-handlers.test.ts"],
    note:
      "R9・spec §9。`TOPIC_RECIPIENT_TOOLS` からハブ（`TOOL_HUB`）を落とし、" +
      "お題の接続だけへ配る。ハブ（玄関の選択画面）はお題の掲げ直しを見られなくなり、" +
      "「玄関で待っている間もお題が読める」という契約（spec §9・E2・E4）が壊れる。" +
      "#91 PR 3 で配信先に timer・poker が加わり行が変わったので作り直した" +
      "（timer を落とす形は m96）。",
  },
  {
    id: 86,
    label: "お題の在室判定がツールを見ず、接続 ID だけでルームを引く",
    patch: "m86-topic-room-lookup-ignores-tool.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/topic-handlers.test.ts"],
    note:
      "#91・E5・spec T4 の 2 段目。`roomCodeOf` がお題ツールの接続かどうかを見ない。" +
      "1 段目（ws-adapter の `?tool=topic` による振り分け。m83 が壊す）が崩れると、" +
      "timer やハブの接続として在席している接続がお題を掲げ・下ろせてしまう。",
  },
  {
    id: 6,
    label: "freezeRunningClock の凍結を外す（一時停止で満タンに戻る）",
    patch: "m06-freeze-running-clock.patch",
    pkg: "packages/timer-core",
    tests: ["test/pause-freeze.test.ts", "test/break-freeze.test.ts"],
  },
  // id 7（帳簿を持たない snapshot を生成中側へ倒す）は #91 PR 3 で削除した。
  // お題の生成中の帳簿（`Room.problemGeneration`）と timer-web の生成中の表示
  // （`ui/problem-generation.ts`）が実装ごと消えた —— お題はお題ツールが作り、timer は配られた
  // お題を読むだけになった（spec T11）。番号は詰めない —— 過去の記録が id で変異を指しているため。
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
      "**名簿からは消えないので、サーバーの状態を見ても気づけない** —— wire の形だけが違う。" +
      "#91 PR 3 で直前の行（AI の鍵を持つ人の集合）が消えたので、同じ壊し方で作り直した。",
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
  // id 39・40（「新しいセッション」でロビーへ戻るときに前のお題を落とす規則を壊す。#273）は
  // #91 PR 3 で削除した。お題は timer のルームの状態ではなくなり、落とす規則ごと廃止した
  // （spec T11。お題は掲げた人が下ろすまで残る）。番号は詰めない。
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
  // id 43〜47（お題の生成の帳簿 `ProblemDelegator` と `pickFallback` を壊す。#283）は
  // #91 PR 3 で削除した。`problem-delegation.ts` と timer-core の `problem.ts` が実装ごと消えた
  // （お題の生成はお題ツールの `TopicGenerator` が担う。そちらは m80 などが守る）。番号は詰めない。
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
  {
    id: 71,
    label: "自分を引けないときの縮退で輪の先頭の席の名前を借りる",
    patch: "m71-self-name-borrows-first-seat.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.self-name.test.tsx"],
    note:
      "#294。#294 以前の縮退（当時の出所は `config.members[0]`。値は席の 0 番と同じ）へ" +
      "戻す変異。輪は並べ替えられるので、出るのは自分でも作成者でもない他人である。" +
      "**復帰トークンが拒まれてから新しい participantId が届くまでの窓**で実際に効く。",
  },
  // id 72（端末が完成記録の表示名を席ではなく名簿の並びから引く。#294）は #91 PR 3 で削除した。
  // 端末は完成記録を組み立てなくなり（Task 6）、サーバーが作った記録をそのまま保存する。
  // 同じ性質（記録の表示名は輪の順）を守る場所はサーバーへ移ったので、m109 が引き継ぐ。
  {
    id: 87,
    label: "玄関の whereLabel が ID ではなく並び順で名前を引く",
    patch: "m87-whereLabel-index-not-id.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note:
      "#91 PR 2。`whereLabel` が `TOOLS.find` によるツール ID 引きをやめ、" +
      "`['timer', 'poker']` という古い並び順の添字で名前を引くようになる。この表に" +
      "お題ツールは無いので `indexOf('topic')` が -1 になり、`TOOLS[-1]` は undefined で" +
      "名前の代わりに生の ID「topic」が出る（「Topic Board」と出ない）。",
  },
  {
    id: 88,
    label: "玄関の use-hub-sync.ts が topic フレームを検めずに捨てる",
    patch: "m88-hub-topic-frame-not-checked.patch",
    pkg: "apps/landing",
    tests: ["tests/hub/use-hub-sync.test.tsx"],
    note:
      "#91 PR 2・spec T3。`TopicFrameSchema` で見分ける分岐を消し、`topic` フレームを" +
      "ハブのスキーマにしか通さなくなる。ハブの契約に合わないので黙って捨てられ、" +
      "選択画面の「いまのお題」が一生更新されない。",
  },
  {
    id: 89,
    label: "お題ツールの操作可否が参加を見ない",
    patch: "m89-topic-web-operate-ignores-join.patch",
    pkg: "apps/topic-web",
    tests: ["tests/topic-room.test.tsx", "tests/topic-view.test.ts"],
    note:
      "#91 PR 2。`canOperate` が `joined` を見ず `status === 'open'` だけで決める。" +
      "**切断中だけを見るテストはこの変異で緑のまま残る**（切断で `joined` も下りるため、" +
      "参加の判定が壊れていても隠れる・検出力の検証で実測）。殺すのは" +
      "「繋ぎ直して参加の返事を待つ窓」を見るテストである —— `SyncConnection` は" +
      "入り直しの `room.join` より先に送信キューを流すため、参加前に押した操作は" +
      "`NOT_IN_ROOM` で拒まれ、利用者から見ると押したのに何も起きない。",
  },
  {
    id: 90,
    label: "お題ツールの下書きが届いたお題で上書きされる",
    patch: "m90-topic-editor-draft-overwritten.patch",
    pkg: "apps/topic-web",
    tests: ["tests/topic-room.test.tsx"],
    note:
      "#91 PR 2。`TopicEditor` に `current` が変わるたび下書きを上書きする `useEffect` を" +
      "足す。書いている途中に別の人がお題を変えると、打ちかけの下書きが黙って消える —— " +
      "コンポーネント冒頭のコメントが禁じている性質（「届いたお題で上書きしない」）そのもの。",
  },
  {
    id: 91,
    label: "GENERATION_COOLDOWN の文が書体の base 層から外れる字へ戻る",
    patch: "m91-generation-cooldown-kanji-reverts.patch",
    pkg: "apps/topic-web",
    tests: ["tests/copy-fits-font-base.test.ts"],
    note:
      "#91 PR 2。topic-core の `GENERATION_COOLDOWN` を「暫く待ってから、もう一度" +
      "作ってください。」へ変える。「暫」は書体の常用の層（base）の範囲に無い。元は「少し」だったが、" +
      "#406 で「少」を base 層に足したので、まだ範囲外の「暫」に替えた（2026-10-29）。" +
      "「しばらく」へ言い換えたのは計画を書く段の実測で「少」が外れていたためである" +
      "（global-constraints「実測で spec から外したこと」）。`packages/topic-core/" +
      "tests/error-messages.test.ts` も赤になるが、対応表に載せるのは書体の検査である" +
      "（「base 層に収める」を守っている本体はこちら）。",
  },
  {
    id: 92,
    label: "同期フックの onClose から cancelRetry() を外す",
    patch: "m92-use-topic-sync-onclose-skips-cancel-retry.patch",
    pkg: "apps/topic-web",
    tests: ["tests/use-topic-sync.test.tsx"],
    note:
      "#91 PR 2。混雑で入り直しの待ちが走っている途中に切れると、待っていたタイマーが" +
      "生き残ったまま繋ぎ直り、`onReconnected` の送信と合わせて `room.join` が 2 通" +
      "流れる（2 通目はサーバーが「コマンドの形式が不正です」で拒む）。",
  },
  {
    id: 93,
    label: "planForError が抜けた知らせを left ではなく show へ落とす",
    patch: "m93-join-error-plan-left-falls-to-show.patch",
    pkg: "apps/topic-web",
    // #94 PR 2 で規則を `@tasuki/sync-client` の `planForJoinError` へ寄せた（パッチの対象もそちら）。
    // 単体は sync-client のテストが持ち、ここでは利用側の同期フックの配線で見る。
    tests: ["tests/use-topic-sync.test.tsx"],
    note:
      "#91 PR 2。`LEFT_ROOM` / `REMOVED_FROM_ROOM` / `REMOVED_BY_HOST` の 2 行を消す。" +
      "抜けた・外された知らせが、玄関へ理由つきで戻す `left` ではなく「その場でサーバーの" +
      "文を伝える」`show` へ落ちる。本人は玄関へ戻らず、お題の画面にエラー文だけが" +
      "出た状態に取り残される。",
  },
  // id 94・95（topic-web・timer-web の Markdown の写しを行区切りで止まらなくする）は #91 PR 3 で
  // 削除した。解析は `@tasuki/markdown` の 1 か所へ移り、両アプリの写しは消えた。m107 が引き継ぐ。
  {
    id: 96,
    label: "お題の配信先から timer を落とす",
    patch: "m96-topic-broadcast-drops-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91 PR 3・spec T3・E2。`TOPIC_RECIPIENT_TOOLS` から `TOOL_TIMER` を落とす。" +
      "timer を開いている人には、お題の掲げ直しも取り下げも届かなくなる" +
      "（参加の直後の 1 通だけが届き、そのあと古いお題を読み続ける）。",
  },
  {
    id: 97,
    label: "お題を掲げて完了したときだけ完成記録を作る",
    patch: "m97-record-only-with-topic.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts"],
    note:
      "#91 PR 3・spec T9・E17。`SessionCompleted` で `event.topicTitle === null` なら記録を作らずに" +
      "celebration へ移す。お題なしが既定なので、大半のセッションで完成記録が消える" +
      "（#273 の欠陥の拡大版）。",
  },
  {
    id: 98,
    label: "timer の参加でいまのお題を送らない",
    patch: "m98-timer-join-skips-topic.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.topic.test.ts"],
    note:
      "#91 PR 3・E4。timer の `room.join`（`command-handlers/room-join.ts`）から" +
      "`topicBroadcaster.sendCurrent` を消す。後から timer を開いた人・再読込した人は、" +
      "次にお題が掲げ直されるまで、いま掲げられているお題を読めない。",
  },
  {
    id: 99,
    label: "timer-web の dispatch がお題のフレームを先に見分けない",
    patch: "m99-timer-dispatch-drops-topic-frame.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/dispatch.test.ts"],
    note:
      "#91 PR 3・spec §5.5・E15。`TopicFrameSchema` で先に見分ける分岐を消す。`topic` フレームが" +
      "timer の契約で落ち、お題が画面に出ないうえ、届くたびに「同期できていません」（#209）が立つ。",
  },
  {
    id: 100,
    label: "poker-web の useSync がお題のフレームを先に見分けない",
    patch: "m100-poker-sync-drops-topic-frame.patch",
    pkg: "apps/poker-web",
    tests: ["tests/topic-sync.test.tsx"],
    note:
      "#91 PR 3・spec §5.5・E15。`TopicFrameSchema` で先に見分ける分岐を消す。`topic` フレームが" +
      "poker の契約で落ち、お題が画面に出ないうえ、届くたびに #212 の告知（同期できていません）が立つ。",
  },
  {
    id: 101,
    label: "端末の旧い記録の problemTitle を読まない",
    patch: "m101-stored-record-ignores-problem-title.patch",
    pkg: "apps/timer-web",
    tests: ["test/records/stored-record.test.ts"],
    note:
      "#91 PR 3・E18。`normalizeStoredRecord` が旧い記録の `problemTitle` を読まず null にする。" +
      "#91 PR 3 より前に端末へ保存した記録が、履歴ですべて「お題なし」に化ける" +
      "（端末の記録には他所に写しが無いので取り返せない）。",
  },
  {
    id: 102,
    label: "履歴の削除ボタンの名前から完了日時を落とす",
    patch: "m102-history-delete-name-without-date.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/History.test.tsx"],
    note:
      "#91 PR 3・E23。お題なしが既定になったので「お題なし」の記録が並びやすく、" +
      "支援技術からどの記録の削除ボタンかを区別できなくなる。",
  },
  {
    id: 103,
    label: "完了へ入ったとき、記録が増えたかを見ずに保存する",
    patch: "m103-intents-persist-without-new-record.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/snapshot-intents.test.ts"],
    note:
      "#91 PR 3（Task 6）・E17。記録が 1 件でもあれば末尾を保存して「完成」と出す。" +
      "別の人が中断した回でも、押していない端末は前の回の記録をもう一度保存し、" +
      "画面は「完成」と言う（終わり方は記録が増えたかでしか分からない）。",
  },
  {
    id: 104,
    label: "前の snapshot が無くても完了の判定をする",
    patch: "m104-intents-decide-without-prev.patch",
    pkg: "apps/timer-web",
    tests: ["test/sync/snapshot-intents.test.ts"],
    note:
      "#91 PR 3（Task 6）・spec §10。比べる相手が無いのに「前は 0 件」とみなす。" +
      "再読込や完了の後に入ってきた端末が、その回に居なかった人の端末にも記録を保存し、" +
      "終わり方を決めてしまう。",
  },
  {
    id: 105,
    label: "完了の topicTitle をお題の保管から埋めない（常に null）",
    patch: "m105-complete-skips-topic-title.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts"],
    note:
      "#91 PR 3・spec T9・E17。`handleRoomCommand` で `session.complete` の `topicTitle` を埋める" +
      "3 行を消す。お題を掲げて完了しても、完成記録はすべて「お題なし」になる。",
  },
  {
    id: 106,
    label: "@tasuki/markdown のリンクの表示と URL の上限を外す",
    patch: "m106-markdown-link-unbounded.patch",
    pkg: "packages/markdown",
    tests: ["tests/performance.test.ts"],
    note:
      "#91 PR 3・spec §5.4（PR #311 の申し送り）。`INLINE_RE` の `{0,200}` / `{0,2000}` を `*` に戻す。" +
      "`[` を並べた本文の解析が O(N²) になる（20 万字で手元約 23 秒・上限 7 秒）。本文はサーバーが長さしか" +
      "見ずに配るので、そのルームでお題を表示する全員のタブが固まる。",
  },
  {
    id: 107,
    label: "@tasuki/markdown の改行の正規化から U+2028 / U+2029 を外し、前進の保証を消す",
    patch: "m107-markdown-line-separator.patch",
    pkg: "packages/markdown",
    tests: ["tests/blocks.test.ts"],
    note:
      "#91 PR 3・spec §5.4。m94 / m95 の引き継ぎ。**m94 / m95 と違い、無限ループにはならない**" +
      "（実測。ワーカーのメモリ切れではなくアサーションで落ち、手元で数秒）。`@tasuki/markdown` は" +
      "見出しの判定と段落の停止条件が同じ `HEADING_RE` を使うので両者が食い違わず、前進の保証は" +
      "いま到達しない（保証だけを外す変異は等価）。殺すのは「行区切りを改行と同じに扱う」ことを" +
      "見る等値のアサーションで、行区切りを含む本文が 1 行の段落として解析されるため赤になる。",
  },
  {
    id: 108,
    label: "ハブの room.join が二重参加を拒まない",
    patch: "m108-hub-join-allows-double.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.hub.test.ts"],
    note:
      "#91 PR 3（Task 5 のレビュー）。`hub-handlers.ts` の `room.join` から `isInAnyRoom` による" +
      "拒否を外す。1 本のハブ接続が 2 つのルームの名簿に載り（同じルームなら人数が増え）、" +
      "お題の配信先と在席の数え上げがずれる。",
  },
  {
    id: 109,
    label: "サーバーの完成記録の表示名を輪ではなく名簿の並びから引く",
    patch: "m109-record-names-from-roster-order.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/handlers.lifecycle.test.ts"],
    note:
      "#294 → #91 PR 3（Task 6）。m72 の引き継ぎ（端末が記録を組み立てなくなり、性質の住所が" +
      "サーバーへ移った）。記録の `members` は `driverCounts` と添字で対になって描かれる" +
      "（timer-web の `ui/Summary.tsx`）ので、**別人の回数が別人の名前の横に並ぶ**。" +
      "名簿は輪の外の人も含み、代理を含まないので長さも合わない。",
  },
  {
    id: 110,
    label: "ハブの room.create が二重参加を拒まない",
    patch: "m110-hub-create-allows-double.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.hub.test.ts"],
    note:
      "#91 PR 3（Task 5 のレビュー）。m108 の片割れ。既にルームに居るハブ接続が新しいルームを" +
      "作れてしまい、1 本の接続が 2 つのルームの名簿に載る。1 本の変異で両方を外すと" +
      "片方のテストだけで殺せてしまうので、入口ごとに分けた。",
  },
  {
    id: 111,
    label: "audit-ui-components の型の照合で大文字小文字を区別する",
    patch: "m111-ui-components-type-case-sensitive.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D10 の 1。HTML の型名は大文字小文字を区別しないので、`SELECT {}` と書けば" +
      "写しが検査を素通りする（#280 の検査が大文字を見逃したのと同じ型）。",
  },
  {
    id: 112,
    label: "audit-ui-components が何も免除していない ui-exempt: を見逃す",
    patch: "m112-ui-components-dead-exempt-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D9。写しを直したのに申告だけが残り、`git grep ui-exempt` の台帳が" +
      "「外れている箇所」について嘘をつく。",
  },
  {
    id: 113,
    label: "audit-ui-components が var() の第 2 引数の生の色を隠す",
    patch: "m113-ui-components-var-fallback-hidden.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 1・設計正本 D10 の 3。カスタムプロパティの名前を消す代わりに `var()` ごと消すと、" +
      "`var(--a, #fff)` の `#fff` が見えなくなる。赤を消す最短の書き方がそのまま穴になる型。",
  },
  {
    id: 114,
    label: "audit-ui-components が画面の CSS の生の色を見逃す",
    patch: "m114-ui-components-screen-raw-colors-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note:
      "#320 PR 5・設計正本 D10 の 3。画面の CSS の通常の規則から生の色の判定を外す。@keyframes の段と" +
      "部品の CSS の側は落とし続けるので、画面の通常の規則の族だけが赤になる。",
  },
  {
    id: 115,
    label: "audit-timer-classes が className の置換を見逃す",
    patch: "m115-timer-classes-template-accepted.patch",
    pkg: "scripts",
    tests: ["audit-timer-classes.test.mjs"],
    note:
      "#321 PR 1・設計正本 D1。`${tone}` のような置換を許すと、クラス名を組み立てる書き方が戻り、" +
      "取り残したクラスを字面で数えられなくなる。",
  },
  {
    id: 118,
    label: "design-tokens.test の ALLOW に使われない項目が残る",
    patch: "m118-design-tokens-unused-allow.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/design-tokens.test.ts"],
    note:
      "#321 PR 1・設計正本 D10。生の色を直した後に例外だけが残ると、同じ場所に生の色を書き戻しても通る。",
  },
  {
    id: 119,
    label: "audit-timer-classes が timer の CSS にも部品層にも定義の無いクラス名を見逃す",
    patch: "m119-timer-classes-undefined-class-accepted.patch",
    pkg: "scripts",
    tests: ["audit-timer-classes.test.mjs"],
    note:
      "#321 PR 1・設計正本 D1・計画 P8。字面のクラス名が timer の CSS にも部品層にも無くても落とさない。" +
      "定義の無いクラス名（打ち間違い・消した CSS の取り残し）が黙って通る。Tailwind のクラスはどちらにも定義されないので、書き戻したときもここで落ちる。",
  },
  {
    id: 120,
    label: "audit-supply-chain-config が Renovate の脆弱性の PR の待機期間を見ない",
    patch: "m120-renovate-vulnerability-age-unchecked.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#334・docs/adr/0024。Renovate の既定は vulnerabilityAlerts.minimumReleaseAge: null で、" +
      "書かなければ脆弱性の PR だけが待機期間を素通りする。本番の renovate.json は正しく書いてあるので、" +
      "この検出が消えても検査結果は変わらない（id 20 と同じ型）。",
  },
  {
    id: 121,
    label: "audit-ui-components が @media の幅の境目の値を見ない",
    patch: "m121-ui-components-media-width-any-length.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1・ADR 0025 決定 1。48rem・px・em の境目が黙って通り、段の約束が崩れる。",
  },
  {
    id: 122,
    label: "audit-ui-components が幅の旧構文（min-width / max-width）を値だけで見る",
    patch: "m122-ui-components-media-legacy-syntax-accepted.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1。値が段（40rem）なら旧構文が通る。書き方が 2 つになり、目で突き合わせられなくなる。",
  },
  {
    id: 123,
    label: "audit-ui-components が TSX の要素層の .page を見ない",
    patch: "m123-ui-components-legacy-page-class-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1・設計正本 D2。消した .page を書き戻すと、器の幅を持たない素の main になる。",
  },
  {
    id: 124,
    label: "audit-ui-components が画面の CSS の @media を見ない",
    patch: "m124-ui-components-screen-media-ignored.patch",
    pkg: "scripts",
    tests: ["audit-ui-components.test.mjs"],
    note: "#316 PR 1。述語は正しくても、画面の CSS へ配線されていなければ検査は死んでいる。",
  },
  {
    id: 125,
    label: "文字の大きさの検査の射程からアプリの CSS を落とす",
    patch: "m125-typography-scale-apps-out-of-scope.patch",
    pkg: "packages/ui",
    tests: ["tests/typography-scale.test.mjs"],
    note: "#316 PR 4。射程からアプリが落ちても、部品層だけを見て緑になる。射程の自己テストが捕まえる。",
  },
  {
    id: 130,
    label: "まとめの器を部屋の器から外す（完了の瞬間に帯ごと幅が跳ねる）",
    patch: "m130-timer-summary-page-prose.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.page-tier.test.tsx"],
    note: "#352・設計 D1。まとめはロビー・セッションと同じ部屋の段階。器を変えると、上のステータスの帯ごと 1536px から 640px へ縮む。",
  },
  {
    id: 131,
    label: "器の既定の枝を wide にする（読み込み中まで 96rem になる）",
    patch: "m131-timer-default-page-wide.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.page-tier.test.tsx"],
    note: "#352・設計 D1。「全部 wide にすれば跳ねない」という直し方を止める。読み込み中と行き先の無い URL の画面は読む画面の段のまま。",
  },
  {
    id: 140,
    label: "公開で席の札を作り直す",
    patch: "m140-seat-card-remounts-on-reveal.patch",
    pkg: "apps/poker-web",
    tests: ["tests/participant-list.test.tsx"],
    note: "#348・設計正本 D1。key に状態を混ぜると transition の起点が無く、めくれずに表が出る。U2 が同じ要素かを見る。",
  },
  {
    id: 141,
    label: "席の札のめくり順を定数にする",
    patch: "m141-seat-flip-order-constant.patch",
    pkg: "apps/poker-web",
    tests: ["tests/participant-list.test.tsx"],
    note: "#348・設計正本 D2。--seat-order が全員 0 だと一斉にめくれる。U3 が席順を見る。",
  },
  {
    id: 142,
    label: "公開後も席の札の名前が投票済みのまま",
    patch: "m142-seat-name-stays-voted-after-reveal.patch",
    pkg: "apps/poker-web",
    tests: ["tests/participant-list.test.tsx"],
    note: "#348・設計正本 D6。表の値が読み上げに出ない。U1 が公開後の名前を見る。",
  },
  {
    id: 143,
    label: "閉じたお題の脇を DOM から外す",
    patch: "m143-topic-side-unmounts-when-closed.patch",
    pkg: "apps/poker-web",
    tests: ["tests/current-topic.test.tsx"],
    note: "#348・設計正本 D7。閉じると区画ごと消え、列が滑って閉じられない。U5 が区画が同じ要素で残ることを見る。",
  },
  {
    id: 144,
    label: "閉じたお題の脇が inert にならない",
    patch: "m144-topic-side-not-inert-when-closed.patch",
    pkg: "apps/poker-web",
    tests: ["tests/current-topic.test.tsx"],
    note: "#348・設計正本 D7。閉じた札が Tab の行き先と読み上げに残る。U5・U6 が inert を見る。",
  },
  {
    id: 145,
    label: "動きを抑える設定でも演出の遅延が残る",
    patch: "m145-reduced-motion-keeps-delays.patch",
    pkg: "packages/ui",
    tests: ["tests/reduced-motion.test.mjs"],
    note: "#348・設計正本 D5。遅延が残ると fill-mode: both の演出が 0% の姿で消えたまま待つ。実際の効きは poker-a11y の E2E も見る。",
  },
  {
    id: 154,
    label: "poolOf が離席中の参加者も入れる",
    patch: "m154-pool-includes-offline.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/pool.test.ts"],
    note: "#94 E4・spec R7。離席中の 1 人を除くと 2 人未満になる局面で、回せてしまう誤りとして出る。",
  },
  {
    id: 155,
    label: "poolOf が外した人を除かない",
    patch: "m155-pool-ignores-excluded.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/pool.test.ts"],
    note: "#94 E4・spec R7。外した参加者が入ってしまう。",
  },
  {
    id: 153,
    label: "回転中の拒否を外す",
    patch: "m153-spin-allows-while-spinning.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette.test.ts"],
    note: "#94 E5・spec R9。2 回目の回転が 1 回目を上書きし、画面ごとにどちらを見ているかがずれる。",
  },
  {
    id: 157,
    label: "ゲストの上限を見ない",
    patch: "m157-guest-limit-unchecked.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette.test.ts"],
    note: "#94 E13・spec R13。",
  },
  {
    id: 168,
    label: "ルーレットのコマンドの strictObject を object に戻す",
    patch: "m168-command-schema-loosened.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/schemas.test.ts"],
    note: "#94 E15・docs/adr/0011 決定 2 S3。余剰フィールドが黙って通る。",
  },
  {
    id: 160,
    label: "ルーム破棄でルーレットの状態を消さない",
    patch: "m160-destroy-keeps-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note: "#94 E10・spec §5.4。破棄したルームのコードを引き継いだ別のルームに、古い一周の記録が残る。",
  },
  {
    id: 156,
    label: "ゲストの名前を表示名の規約に通さない",
    patch: "m156-guest-name-skips-display-rule.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 E13・spec R13。空白だけ・不可視文字だけの名前が全員の画面に出る。",
  },
  {
    id: 161,
    label: "elapsedMs を回した時点の値のまま送る",
    patch: "m161-elapsed-sent-as-started.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 E7・E8・spec R5。回転の途中で参加した接続で見る（回した直後の 1 通では見分けが付かない）。",
  },
  {
    id: 150,
    label: "ハブの層からルーレットのハンドラも呼ぶ",
    patch: "m150-hub-message-reaches-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 E9・spec R11。ルーレットの層は『ルーレットとして在席しているか』で 2 段目を守るので状態は変わらないが、ハブの接続が 2 通目の拒否を受け取る。4 種の接続で拒否が 1 通ずつであることを見る。",
  },
  {
    id: 158,
    label: "名簿の宛先からルーレットの接続を落とす",
    patch: "m158-roster-excludes-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 E11・spec R14。ルーレットの画面が入る人を描けない。",
  },
  {
    id: 159,
    label: "お題の配信先からルーレットを落とす",
    patch: "m159-topic-excludes-roulette.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 E12・spec R15。ルーレットの画面が『お題「…」の進行役を決めます』を出せない。",
  },
  {
    id: 167,
    label: "ルーレットの接続の受理で onConnect を通さない",
    patch: "m167-roulette-skips-on-connect.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.roulette.test.ts"],
    note: "#94 §5.2。poker の早期 return に足す。レート制限の鍵が接続 ID に落ち、room.join の総当たりが接続を張り直すだけで枠を回避できる。",
  },
  {
    id: 170,
    label: "poolOf が在室者と同じ名前のゲストを外さない",
    patch: "m170-pool-keeps-same-name-guest.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/pool.test.ts"],
    note: "#94 E4・E13・spec R13（PR #355 のレビュー）。ゲストを足した後で同じ名前の人が参加すると、同じ人が円盤に 2 席になる。",
  },
  {
    id: 171,
    label: "ルーレットの commit が状態の変わらないときも保管・配信する",
    patch: "m171-commit-publishes-unchanged.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 §5.2（PR #355 のレビュー）。知らない ID の押下や連打のたびに全接続へ同じフレームが飛ぶ。",
  },
  {
    id: 172,
    label: "回す要求の失敗の経路で状態を保管する",
    patch: "m172-failed-spin-stores-pruned.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#94 §5.2（PR #355 のレビュー）。名簿から消えた記録を落とした状態を保管だけして配らず、保管と画面が食い違う。",
  },
  {
    id: 173,
    label: "同名で外れたゲストに印を付けない",
    patch: "m173-twin-guest-unmarked.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#94 spec R13。在室者と同じ名前のゲストが、理由の分からないまま円盤から居なくなる（黙って外れる姿）。",
  },
  {
    id: 165,
    label: "回し始めた時点で結果の一言に当たりの名前を出す",
    patch: "m165-caption-names-winner-while-spinning.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-room.test.tsx", "tests/roulette-view.test.ts"],
    note: "#94 E19・spec §6.8。読み上げが演出（回転）より先に結果を言う。止まった後に見るだけのテストでは殺せない（最後は同じ文になる）ので、回っている最中に見る。",
  },
  {
    id: 169,
    label: "玄関の札の ID が同期サーバーの綴りとずれる",
    patch: "m169-hub-tool-id-mismatch.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note: "#94 spec §7.3。在席の表示がルーレットに居る人を札の名前で出せず、「roulette にいます」と生の綴りが出る。型は綴りのずれを拾わない。",
  },
  {
    id: 162,
    label: "web が状態を受けるたびに回転の時刻の基準を取り直す",
    patch: "m162-web-receivedat-refreshed-every-frame.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/use-roulette-sync.test.tsx"],
    note: "#94 E17・spec §6.4。同じ回転（seq が同じ）の状態を繰り返し受けるたびに経過が 0 に戻り、円盤が回し直しになる。",
  },
  {
    id: 180,
    label: "同じ回転のフレームで基準の時刻は古いまま新しい経過を採る",
    patch: "m180-web-same-seq-takes-new-elapsed.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/use-roulette-sync.test.tsx"],
    note: "#94 E17・spec §6.4（PR #357 のレビュー）。回転中の外す・戻すや再接続で同じ seq が届くたびに経過を二重に数え、止まる時刻が前へずれる。",
  },
  {
    id: 181,
    label: "同名で外れたゲストのチェックを押せるままにする",
    patch: "m181-twin-guest-check-enabled.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts", "tests/roulette-room.test.tsx"],
    note: "#94 spec R13（PR #357 のレビュー）。押しても入る人に戻らない（何も起きない）チェックが残る。",
  },
  {
    id: 182,
    label: "結果の一言で入る人の数を止まった結果より先に見る",
    patch: "m182-caption-too-few-hides-result.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#94 spec §6.8（PR #357 のレビュー）。発表の後で入る人が 1 人に減ると、発表した結果が「2 人から回せます」に消える。",
  },
  {
    id: 163,
    label: "止まる角度の端数が回し始めの角度を引かない",
    patch: "m163-final-angle-ignores-start.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-motion.test.ts"],
    note: "#94 spec §6.4。回し始めの角度が 0° 以外の画面（前の回転の止まった位置から回す画面）だけ別の席で止まる。開始角 0° だけのテストでは殺せない。",
  },
  {
    id: 164,
    label: "動きを減らす設定でも回す",
    patch: "m164-reduced-motion-still-spins.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx", "tests/roulette-room.test.tsx"],
    note:
      "#94 spec §6.5。rAF の回転は CSS の一括の手当ての外なので JS が止める。忘れると設定を無視して 4 秒回り、当たりの席と札が回転の後まで出ない。" +
      "止まったかの判定は局面（`phaseOf`）の 1 か所なので、壊す場所もそこ（PR #383 のレビュー）。",
  },
  {
    id: 174,
    label: "回転の終わりを timer で保証しない",
    patch: "m174-spin-end-relies-on-raf.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.4。裏のタブ・ヘッドレスでは rAF が止まる。終わりを rAF に頼ると、当たりの席と札の表が出ないまま止まって見える。" +
      "終わりの timer は画面の `useNowMs` の 1 つ（PR #383 のレビューで円盤の自前の timer を外した）。",
  },
  {
    id: 175,
    label: "止まったとき札が見えていても必ず寄せる",
    patch: "m175-scroll-card-always.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note: "#94 spec §6.4・E22。見えているのに画面を動かす。隠れているときに呼ぶことだけを見るテストでは殺せない。",
  },
  {
    id: 176,
    label: "札が見えるかの判定が下端の帯を数えない",
    patch: "m176-scroll-ignores-dock.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note: "#94 spec E22・§6.7。320×640 で下端に留まる帯が札を覆っても、窓に収まっていれば寄せない（名前が帯に隠れたまま）。",
  },
  {
    id: 177,
    label: "縦書きの席の欧文の字を立てない（text-orientation を既定の mixed に戻す）",
    patch: "m177-vertical-latin-sideways.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-glyphs.test.tsx"],
    note:
      "#94 spec §6.3。縦書きの欧文の字が 90° 回って横倒しに描かれる（2026-10-13 の実画面の「Mika」）。" +
      "4 版では全角主体の名前に混じった欧文の字だけがここに来る。関数の戻り値だけを測る単体では殺せない。" +
      "ブラウザの実際の姿は E2E（`roulette.spec.ts` の `expectWheelGlyphsUpright`）が `getRotationOfChar` で測る。",
  },
  {
    id: 178,
    label: "当たりの席の名前を 700 の太さで描く（名前の漢字がシステムの書体に落ちる）",
    patch: "m178-winner-label-bold.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-glyphs.test.tsx"],
    note:
      "#94 spec §6.3。書体の 700 には base 層しか無い。落ちた先は縦書きの送りが 0 で、当たりの席の「健太」が" +
      "1 字に重なり縁の外へはみ出した（2026-10-13 の 320）。E2E は CDP で使われた書体を読む（`expectWheelLabelsUseWebFonts`）。",
  },
  {
    id: 179,
    label: "縦の半径の席の欧文を縦に積む（半径を横切る横書きにしない）",
    patch: "m179-latin-stacked-vertical.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-glyphs.test.tsx", "tests/wheel-motion.test.ts"],
    note:
      "#94 spec §6.3 の 4 版（利用者の決定 案 2）。立てて積んだ「M／i／k／a」は読めない。" +
      "字の傾きは 30° 以内に収まるので、字の傾きだけを見る物差しでは殺せない。",
  },
  {
    id: 183,
    label: "回転中にマウントした舞台を、測る前の既定値（縦積み）のまま凍らせる",
    patch: "m183-stage-layout-frozen-before-measure.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.7（PR #383 のレビュー）。再読み込み・途中入室の画面が広い舞台でも回っている間ずっと縦積み（指し針が下）で、" +
      "止まった瞬間に横並びへ跳び、止まる角度が 90° 変わって円盤が一瞬で回る。",
  },
  {
    id: 184,
    label: "円盤が自前の時計で「止まった」を決める",
    patch: "m184-wheel-settles-on-own-clock.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.4（PR #383 のレビュー）。終わり際に札と当たりの席は止まった姿、結果の一言と脇の一覧はまだ回転中、と食い違う。" +
      "止まった後だけを見るテストでは殺せない（終わりの時刻の前後を細かく刻んで見る）。",
  },
  {
    id: 185,
    label: "止まった後の円盤を、いまの入る人の並びで描く",
    patch: "m185-settled-wheel-draws-current-pool.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note:
      "#94 spec §6.3（PR #383 のレビュー）。止まった角度は回したときの席数で計算するので、止まった後にゲストを足す・" +
      "名簿の順が変わると、針が別の人を指し、札は本当の当たりを見せる。",
  },
  {
    id: 186,
    label: "--changed の条件 1（pkg 配下の変更で選ぶ）を外す",
    patch: "m186-select-without-pkg-rule.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#387。**対応表より後に足した変異。** 選び方そのものが静かに狭まると、手元で流すべき変異を流さなくなる。",
  },
  {
    id: 187,
    label: "変異検査の機構が変わっても --changed を全件に倒さない",
    patch: "m187-select-without-mechanism-fallback.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#387。**対応表より後に足した変異。** 機構を変えた枝で、変えた機構の影響を手元で見ない。",
  },
  {
    id: 240,
    label: "INVALID_SETTLE を受けてもログを残さない",
    patch: "m240-invalid-settle-without-log.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382。**対応表より後に足した変異。** 乱数源の契約違反の片方だけが痕跡を残さない元の欠陥。内部の誤りを本番で知る手がかりが消える。",
  },
  {
    id: 241,
    label: "INVALID_SETTLE のログを error より軽い水準にする",
    patch: "m241-invalid-settle-log-below-error.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382。**対応表より後に足した変異。** INVALID_RANDOM の行（error）と水準を揃える。warn では error を拾う監視から外れる。",
  },
  {
    id: 242,
    label: "INVALID_SETTLE を INVALID_RANDOM と同じ行で残す",
    patch: "m242-invalid-settle-logs-as-range-error.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382。**対応表より後に足した変異。** 2 つの契約違反がログで区別できなくなる（理由を語彙に置いた意味が消える）。",
  },
  {
    id: 243,
    label: "乱数源の契約違反の判定を全失敗に広げる",
    patch: "m243-violation-check-always-true.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382（/code-review）。**対応表より後に足した変異。** `isRandomViolation` を常に真にする。人数不足など利用者の操作で起きる失敗が、契約違反として扱われる（本物の違反でない失敗にログと INTERNAL_ERROR を返す）。",
  },
  {
    id: 244,
    label: "INVALID_RANDOM の reason を invalid-settle にする",
    patch: "m244-invalid-random-reason-is-invalid-settle.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#382（/code-review）。**対応表より後に足した変異。** 監視が reason で 2 つの契約違反を区別できなくなる。",
  },
  {
    id: 230,
    label: "timer の内部エラーが、また timer だけの別の文を返す",
    patch: "m230-timer-internal-error-own-text.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts", "test/connection-error-text-sources.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** timer の内部エラーのフレームを正本（`connectionErrorFrame`）から" +
      "取らず「内部エラーが発生しました」を直書きすると、timer だけ文が違う状態（#381 以前）に戻る。",
  },
  {
    id: 231,
    label: "メッセージ層の reject で on-message-error を残さない",
    patch: "m231-reject-without-log.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** 非同期の失敗（reject）のログを落とすと、かつての timer のように" +
      "失敗が無言になる。4 つの接続で同じログが出ることを固定したテストが検出する。",
  },
  {
    id: 232,
    label: "on-message-error に、どの接続の失敗かを示す protocol を出さない",
    patch: "m232-log-without-protocol.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts", "test/ws-adapter.message.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** 4 つの接続が同じログ行を出すので、`protocol` が無いと" +
      "ログからどの接続の失敗か分からない。接続ごとの `protocol` の値を固定したテストが検出する。",
  },
  {
    id: 233,
    label: "poker の失敗のログに protocol を出さない",
    patch: "m233-poker-log-without-protocol.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter.message.test.ts", "test/connection-error-text.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** poker の受け口は `createTextChannel` ではなく自前の `try/catch` でログを" +
      "出すので、m232 では検出されない。poker の隔離のテストが `protocol=poker` を固定している。",
  },
  {
    id: 234,
    label: "poker の close 失敗のログに protocol を出さない",
    patch: "m234-poker-close-failure-log-without-protocol.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/connection-error-text.test.ts"],
    note:
      "#381。**対応表より後に足した変異。** m233 は poker の失敗の 1 行目だけで、close 自体の失敗の 2 行目は" +
      "実 WS では起こしにくい。受け口を直接呼び、close も throw させるテストが検出する。",
  },
  {
    id: 200,
    label: "ルーレットのゲストの名前欄の上限を、表示名の規約でなく 24 に戻す",
    patch: "m200-roulette-guest-name-cap-24.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-room.test.tsx"],
    note: "#373。輪に載せられる数の上限（24）と取り違え、25〜40 字の名前を入れられなかった。",
  },
  {
    id: 201,
    label: "結果の札の名前を、長さによらず最大の段（lg）で描く",
    patch: "m201-card-name-always-large.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。40 字の名前が札の上下にはみ出し、一言と回すボタンに重なる。",
  },
  {
    id: 202,
    label: "結果の札が名前の段（data-size）を付けない",
    patch: "m202-result-card-without-data-size.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/result-card.test.tsx"],
    note: "#373。段の選び方が正しくても描画に届かず、長い名前が札からはみ出す。",
  },
  {
    id: 203,
    label: "札の名前の表示幅を、書記素でなくコードポイントで数える",
    patch: "m203-card-name-counts-code-points.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。ZWJ の絵文字・国旗が複数字と数えられ、段が不必要に下がる。",
  },
  {
    id: 204,
    label: "最大の段（lg）の名前の要素から 2 行の line-clamp を外す",
    patch: "m204-card-name-lg-without-clamp.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/result-card.test.tsx"],
    note: "#373。幅の広い欧文が札の上下にはみ出す安全網が無くなる。",
  },
  {
    id: 205,
    label: "円盤の席の名前（fitLabel）を、書記素でなくコードポイントで回す",
    patch: "m205-fit-label-counts-code-points.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。ZWJ の絵文字・国旗・結合文字が途中で切られる。",
  },
  {
    id: 206,
    label: "Intl.Segmenter が無いときの代替が、コードポイントでなく全体を 1 つとして返す",
    patch: "m206-grapheme-fallback-returns-whole.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。無い環境で幅が全く数えられず、段が常に最大になる。",
  },
  {
    id: 207,
    label: "札の最大の段の上限を、1 行に収まる 5.5 でなく 6 に戻す",
    patch: "m207-card-name-lg-limit-6.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/card-name-size.test.ts"],
    note: "#373。全角 6 字が 2 行になり、札の高さを超える。",
  },
  {
    id: 208,
    label: "札の「さん」から white-space: nowrap を外す",
    patch: "m208-card-san-without-nowrap.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/result-card.test.tsx"],
    note: "#373。「さん」が 1 字ずつ縦に折れる。",
  },
  {
    id: 220,
    label: "空の輪・範囲外の添字で次の担当に NaN を返す",
    patch: "m220-evolve-empty-rotation-nan.patch",
    pkg: "packages/timer-core",
    tests: ["test/aggregate.test.ts"],
    note:
      RESERVED_220_229 +
      "#376。空の輪で `(removedIndex + 1) % 0` が NaN を作る（修正前の evolve の `% 0` と同じ欠陥の型）。",
  },
  {
    id: 221,
    label: "範囲外の添字の MemberRemoved を無視しない",
    patch: "m221-evolve-remove-out-of-range-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。誰も外さずに現ドライバーの番号だけを詰める。decide の InvalidIndex が止めるので、evolve へ直接渡すテストで殺す。",
  },
  {
    id: 222,
    label: "範囲外の添字の MemberMoved を無視しない",
    patch: "m222-evolve-move-out-of-range-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。負の添字は splice が末尾から数え、別の席を動かす。",
  },
  {
    id: 223,
    label: "運転中の末尾の人を外したとき先頭へ回さない",
    patch: "m223-evolve-remove-without-wrap.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。末尾の運転者を外すと次の担当が輪の長さちょうどになり、範囲外を指す。",
  },
  {
    id: 224,
    label: "輪が空でも時計を止めない",
    patch: "m224-evolve-empty-rotation-keeps-running.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392 のレビュー）。担当の居ない輪でタイマーが回る。",
  },
  {
    id: 225,
    label: "整数でない添字を席の添字として受け入れる",
    patch: "m225-evolve-fractional-seat-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。decide と evolve が共有する述語。0.5 は splice が 0 に切り捨て、先頭の席を動かす。",
  },
  {
    id: 226,
    label: "範囲外の交代先の DriverSwitched を無視しない",
    patch: "m226-evolve-switch-out-of-range-index.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。currentIndex が範囲外を指し、担当回数・交代回数も進む。",
  },
  {
    id: 227,
    label: "順列でない order の MembersShuffled を無視しない",
    patch: "m227-evolve-shuffle-non-permutation.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。席が欠ける・増える・undefined が入る。",
  },
  {
    id: 228,
    label: "順列の判定から長さの一致を外す",
    patch: "m228-evolve-permutation-without-length.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。重複で集合の大きさだけが輪の長さに一致する長い order を順列とみなし、席が 1 つ増える。",
  },
  {
    id: 229,
    label: "順列の判定から重複の無さを外す",
    patch: "m229-evolve-permutation-without-distinct.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_220_229 +
      "#376（PR #392）。重複する order を順列とみなし、同じ席が 2 つ並び別の席が消える。",
  },
  {
    id: 250,
    label: "運転中の人を外したとき、運ばれた次の担当を使わない",
    patch: "m250-evolve-remove-ignores-next-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。decide が資格で選んだ次の担当が捨てられ、位置で次の席（一時離脱の人でも）に運転が回る。",
  },
  {
    id: 251,
    label: "運ばれた次の担当を範囲を確かめずに使う",
    patch: "m251-evolve-remove-trusts-next-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。範囲外の nextDriverIndex で currentIndex が範囲外を指す（ほかの不正な入力と違い、集約が変わる）。",
  },
  {
    id: 252,
    label: "decide の member.remove が資格を見ずに次の担当を選ぶ",
    patch: "m252-decide-remove-without-ineligible.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。運転中の人が外れると、一時離脱・不在の人に運転が回る（本番の経路）。",
  },
  {
    id: 253,
    label: "participant.remove が資格を見ずに次の担当を選ぶ",
    patch: "m253-participant-remove-without-ineligible.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/manual-skip-eligible.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。運転中の人がルームを抜けると、一時離脱・不在の人に運転が回る（本番の経路）。",
  },
  {
    id: 254,
    label: "member.remove に資格の集合を埋めない",
    patch: "m254-member-remove-without-ineligible-filled.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/manual-skip-eligible.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。decide は全員適格として次の担当を選び、一時離脱の人に運転が回る。",
  },
  {
    id: 255,
    label: "止まっている時計にも空の輪で一時停止を立てる",
    patch: "m255-evolve-empty-rotation-pauses-stopped-clock.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。休憩中に輪が空になると一時停止が立ち、席を足し直しても BreakEnded で走り出せない。",
  },
  {
    id: 256,
    label: "空の輪の時計を走らせる操作を拒まない",
    patch: "m256-decide-switch-on-empty-rotation.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。空の輪へ開始・再開・交代・やり直しを出す（evolve は時計を止め直すが、拒否は decide の仕事）。",
  },
  {
    id: 257,
    label: "次の担当を外した後の添字へ詰めない",
    patch: "m257-next-driver-without-shift.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts", "test/aggregate.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 2 巡目）。外した席より後ろの人を選ぶと、1 つ後ろの人に運転が回る（外した後の輪で数え直していない）。",
  },
  {
    id: 258,
    label: "外した後の輪が空のとき、次の担当 0 を正しい値とみなさない",
    patch: "m258-current-index-rejects-empty-rotation.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts", "test/properties.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。最後の 1 席を外す MemberRemoved が常に無視され、空の輪へ届かない（evolve の全域の主張が、空の輪を作らないことで成り立ってしまう）。",
  },
  {
    id: 259,
    label: "空の輪の拒否を BelowMinMembers で返す",
    patch: "m259-decide-empty-rotation-as-below-min.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide.test.ts"],
    note:
      RESERVED_250_259 +
      "#376（PR #392 の 3 巡目）。「最後のドライバーは外れられません。」が出て、状況と食い違う。",
  },
  {
    id: 210,
    label: "evolve が交代のときに直前のドライバーを書かない",
    patch: "m210-evolve-forgets-previous-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#374。**対応表より後に足した変異。** 集約が直前のドライバーを持たなければ、ナビは常に出ない。",
  },
  {
    id: 211,
    label: "snapshot が直前のドライバーの席を送らない（常に null）",
    patch: "m211-dto-drops-previous-driver-index.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts", "test/manual-skip-eligible.test.ts"],
    note: "#374。**対応表より後に足した変異。** 集約が正しくても wire に載らなければ画面はナビを出さない。",
  },
  {
    id: 212,
    label: "ナビが直前のドライバーの席の飛ばされる状態を見ない",
    patch: "m212-navigator-ignores-skip-state.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/session-view.test.ts"],
    note: "#374。**対応表より後に足した変異。** 運転した後に見送り・切断した人（ナビを務められない人）をナビに出す。",
  },
  {
    id: 213,
    label: "ナビを輪の上の 1 つ前の席へ戻す",
    patch: "m213-navigator-is-seat-before-current.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/session-view.test.ts", "test/ui/Session.derived.test.tsx"],
    note: "#374。**対応表より後に足した変異。** 欠陥そのもの —— 飛ばされた席の人（運転していない人）をナビに出す。",
  },
  {
    id: 214,
    label: "運転中の人が輪から外れても、直前のドライバーを書き換えない",
    patch: "m214-removal-keeps-stale-previous-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** 新しい運転者のナビに 2 つ前の人が出る。",
  },
  {
    id: 215,
    label: "snapshot が、いまの運転者と同じ席を直前のドライバーとして送る",
    patch: "m215-dto-sends-current-as-previous.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/timer-snapshot-dto.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** wire の注記（同じ席なら null）と食い違う。",
  },
  {
    id: 216,
    label: "不在（away）でもナビを隠す",
    patch: "m216-navigator-hides-on-away.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/session-view.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** timer のタブを切り替えるたびに全員の画面でナビが点滅する。",
  },
  {
    id: 217,
    label: "名簿の変化で席の情報が変わっても timer の画面へ配らない",
    patch: "m217-tool-join-skips-timer-broadcast.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.timer-seat-presence.test.ts", "test/save-roster.timer-seat.test.ts"],
    note: "#374。**対応表より後に足した変異。** timer から選択画面へ移った人が、ほかの人の timer で「未接続」のまま残り、ナビが隠れる。",
  },
  {
    id: 218,
    label: "開始が直前のドライバーを null に戻さない",
    patch: "m218-start-keeps-previous-driver.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** ロビーの名残の人が、開始直後からナビに出る。",
  },
  {
    id: 219,
    label: "呼び出し側が自分で配るときも timer へ配る（二重に配る）",
    patch: "m219-save-roster-double-broadcast.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/save-roster.timer-seat.test.ts"],
    note: "#374（PR #396 のレビュー）。**対応表より後に足した変異。** timer のコマンドで名簿が変わるたびに snapshot が 2 通届く。",
  },
  {
    id: 260,
    label: "上限まで空いたコードが出なくても、最後に引いたコードでルームを作る",
    patch: "m260-create-room-proceeds-with-taken-code.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/create-room.test.ts", "test/handlers.room.test.ts"],
    note: "#375。**対応表より後に足した変異。** 事後条件（返すコードは空いている）が外れ、既にあるルームを上書きする。",
  },
  {
    id: 261,
    label: "poker のルーム ID が上限まで空かなくても、最後に引いた ID で作る",
    patch: "m261-poker-room-id-returns-taken-id.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/create-sync-server.substitution.test.ts"],
    note: "#375。**対応表より後に足した変異。** 既にあるルーム（名簿・ラウンド）を上書きする。",
  },
  {
    id: 262,
    label: "玄関の room.join の合言葉に、timer と違う上限を掛ける",
    patch: "m262-hub-join-passphrase-without-limit.patch",
    pkg: "packages/room-core",
    tests: ["tests/wire.test.ts"],
    note: "#377。**対応表より後に足した変異。** 入口ごとに合言葉の長さの契約が違う（玄関・topic・roulette だけが超過を通す）。",
  },
  {
    id: 263,
    label: "timer の受け口が合言葉の長さの規約を当てない",
    patch: "m263-timer-receiver-skips-passphrase-rule.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.passphrase-limit.test.ts"],
    note: "#377。**対応表より後に足した変異。** timer の wire スキーマは形だけを見るので、timer の入口だけが上限なしになる。",
  },
  {
    id: 264,
    label: "合言葉を掛けるときに長さの上限を見ない",
    patch: "m264-passphrase-rule-skips-set.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/passphrase-rule.test.ts", "test/live-ws.passphrase-limit.test.ts"],
    note: "#377。**対応表より後に足した変異。** 上限を超える合言葉を掛けられ、どの入口からもその合言葉では入れないルームができる。",
  },
  {
    id: 265,
    label: "timer の既定のエラーの文言だけを句点付きに戻す",
    patch: "m265-timer-default-error-with-period.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/default-error-text.test.ts"],
    note: "#378。**対応表より後に足した変異。** コードの分からないエラーの文言が、timer だけほかのツールと違う。",
  },
  {
    id: 266,
    label: "玄関の合言葉の欄に上限を掛けない",
    patch: "m266-landing-passphrase-field-without-limit.patch",
    pkg: "apps/landing",
    tests: ["tests/join-room-passphrase.test.tsx"],
    note: "#377。**対応表より後に足した変異。** 長い合言葉を貼った人が「コマンドの形式が不正です」で断られ、理由を知る手段が無い。",
  },
  {
    id: 270,
    label: "見積もりの割れの閾値を超えたときだけにする（2 段で割れない）",
    patch: "m270-spread-threshold-exclusive.patch",
    pkg: "packages/poker-core",
    tests: ["tests/spread.test.ts"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。3 と 8 のように 2 段離れた票で促しが出ない。",
  },
  {
    id: 271,
    label: "見積もりの割れを段ではなく札の値の差で比べる",
    patch: "m271-spread-compares-values.patch",
    pkg: "packages/poker-core",
    tests: ["tests/spread.test.ts"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。13 と 21 のような隣同士が割れに数えられる。",
  },
  {
    id: 272,
    label: "見積もりの割れで、同じ札を出した人を 1 人に絞る",
    patch: "m272-spread-keeps-one-voter.patch",
    pkg: "packages/poker-core",
    tests: ["tests/spread.test.ts"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。最大や最小を複数人が出したとき、先に出した人だけが名指しされる。",
  },
  {
    id: 273,
    label: "結果の節が見積もりの割れの促しを描かない",
    patch: "m273-results-hides-spread.patch",
    pkg: "apps/poker-web",
    tests: ["tests/results.test.tsx", "tests/room-page-derived.test.tsx"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。",
  },
  {
    id: 274,
    label: "ルーム画面が見積もりの割れを結果の節へ渡さない",
    patch: "m274-room-page-drops-spread.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-derived.test.tsx"],
    note: "#405。**対応表より後に足した変異。** 270〜279 は #405 に割り当てた（#402 の並行作業とぶつからないよう 267〜269 を空けた）。判定と描画の単体テストは緑のまま、画面に促しが出ない（配線の変異）。",
  },
  {
    id: 275,
    label: "最大の側の名前が 1 人も引けなくても促しを出す",
    patch: "m275-spread-prompt-ignores-missing-high.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-view.test.ts"],
    note: "#405（PR #412 のレビュー）。**対応表より後に足した変異。** 最大の札を出した人が抜けると、名前の無い「を出した  と、」の促しが出る。",
  },
  {
    id: 280,
    label: "@tasuki/markdown が文の無いタスクの項目もタスクにする",
    patch: "m280-markdown-task-empty-text.patch",
    pkg: "packages/markdown",
    tests: ["tests/blocks.test.ts"],
    note: "#315 PR 1・spec D2・NFR-002。**対応表より後に足した変異。** 280〜289 は #315 に割り当てた（267〜269 は #402 のために、270〜279 は #405 のために空けてある）。印の後が空白だけの項目が名前の無いチェックボックスになる。",
  },
  {
    id: 281,
    label: "@tasuki/markdown が [X] をチェック済みにしない",
    patch: "m281-markdown-task-upper-x.patch",
    pkg: "packages/markdown",
    tests: ["tests/blocks.test.ts"],
    note: "#315 PR 1・spec D2・FR-002。**対応表より後に足した変異。** 280〜289 は #315 に割り当てた。GitHub と同じ `- [X]` が「[X] 文」という文のまま出る。",
  },
  {
    id: 282,
    label: "Markdown のタスクの項目が label で包まれず、チェックボックスが名前を失う",
    patch: "m282-web-kit-task-no-label.patch",
    pkg: "packages/web-kit",
    tests: ["tests/markdown.test.tsx"],
    note: "#315 PR 1・spec D4・FR-003。**対応表より後に足した変異。** 280〜289 は #315 に割り当てた。見た目は同じまま、支援技術からどの項目のチェックか区別できない。",
  },
  {
    id: 290,
    label: "isBreakDue が適格 0/1 席の周回でも休憩を入れる",
    patch: "m290-is-break-due-ignores-single-seat.patch",
    pkg: "packages/timer-core",
    tests: ["test/break-policy.test.ts"],
    note: "#402。**対応表より後に足した変異。** 席が 1 つ以下だと閾値が 0 席ぶんになり、交代のたびに休憩に入る。",
  },
  {
    id: 291,
    label: "知らせるだけの基準を常に baseline にする（知らせ直しを間隔まで待たない）",
    patch: "m291-suggest-uses-baseline.patch",
    pkg: "packages/timer-core",
    tests: ["test/break-policy.test.ts"],
    note: "#402。**対応表より後に足した変異。** 知らせたあとも毎回の交代で知らせ直す。",
  },
  {
    id: 292,
    label: "休憩中の拒否から driver.assign を外す",
    patch: "m292-decide-allows-assign-on-break.patch",
    pkg: "packages/timer-core",
    tests: ["test/decide-v3.test.ts"],
    note: "#402。**対応表より後に足した変異。** 休憩中に担当の指定で時計が走り出す。",
  },
  {
    id: 293,
    label: "完成・中断で時計を止めない",
    patch: "m293-session-ended-keeps-clock-running.patch",
    pkg: "packages/timer-core",
    tests: ["test/evolve.test.ts"],
    note: "#402。**対応表より後に足した変異。** 完成・中断のあとも時計が走り、自動交代が予約される。",
  },
  {
    id: 294,
    label: "交代が無くても休憩を判定する",
    patch: "m294-break-after-switch-without-switch-check.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/break-after-switch.test.ts"],
    note: "#402。**対応表より後に足した変異。** 交代の無いコミット（メモ更新など）のあとに休憩に入る。",
  },
  {
    id: 295,
    label: "休憩明けの運転者の繰り上げを外す",
    patch: "m295-break-end-skips-advance.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/break-after-switch.test.ts"],
    note: "#402。**対応表より後に足した変異。** 席を外した運転者のまま休憩が明ける。",
  },
  {
    id: 296,
    label: "休憩に入る交代の全画面の知らせを抑えない",
    patch: "m296-switch-alert-ignores-suppressed.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/Session.break.test.tsx"],
    note: "#402。**対応表より後に足した変異。** 休憩の知らせと全画面の知らせが二重に出る。",
  },
  {
    id: 302,
    label: "回転中の判定が人数を見ない",
    patch: "m302-spin-duration-ignores-picks.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec M6・E6。2 人目以降が止まる前に次の回転が始まる。",
  },
  {
    id: 303,
    label: "回すの下限が人数を見ない",
    patch: "m303-spin-min-two.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec M5・E5。入る人がちょうど k 人で全員が選ばれる。",
  },
  {
    id: 304,
    label: "選ぶ人数の上限を緩める",
    patch: "m304-pick-count-allows-five.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec M5・E2。札の 4 行に収まらない人数が通る。",
  },
  {
    id: 305,
    label: "wire の durationMs が人数を見ない",
    patch: "m305-view-duration-ignores-picks.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-multi-pick.test.ts"],
    note: "#401 PR 1・spec §5.1・E3。画面が 2 人目以降を待たずに止まる。",
  },
  {
    id: 306,
    label: "同期サーバーが送られた人数を使わない",
    patch: "m306-sync-pick-set-ignores-count.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#401 PR 1・spec M2・E1。人数を変えても全員の画面が 1 人のまま。",
  },
  {
    id: 307,
    label: "一人ずつ決まる時刻が止まる時刻とずれる",
    patch: "m307-web-reveals-late.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#401 PR 2・spec §6.2・E9。止まってから 200ms 遅れて決まる。円盤は止まっているのに札・一覧がまだ前の人数のまま。",
  },
  {
    id: 308,
    label: "止まった後の「置く」間を飛ばす",
    patch: "m308-web-move-skips-hold.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel-motion.test.ts"],
    note: "#401 PR 2・spec M6。止まった瞬間に次へ動き出し、誰に止まったかが見えない。",
  },
  {
    id: 309,
    label: "1 人のときに組の札を出す",
    patch: "m309-web-single-uses-group-card.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/multi-pick.test.tsx"],
    note: "#401 PR 2・spec M11・E7。1 人の画面が #94 の札から変わる（崩さない約束を破る）。",
  },
  {
    id: 310,
    label: "画面の時計が次の 1 人ぶんしか起きない",
    patch: "m310-web-wakes-only-next-stop.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/multi-pick.test.tsx"],
    note: "#401 PR 2・spec §6.2・E8。rAF の止まった画面（裏のタブ）で、1 人目の後に止まったままになる。",
  },
  {
    id: 360,
    label: "recordReveal が閉じた束のあとでも末尾の束に行を足す",
    patch: "m360-core-record-appends-to-closed-group.patch",
    pkg: "packages/poker-core",
    tests: ["tests/estimate-log.test.ts"],
    note: "#93。**対応表より後に足した変異。** 360〜369 は #93 に割り当てた（300〜319 と 340〜359 は #401 の帯・#422 のレビュー）。閉じた束に次の開票が混ざり、アイテムごとの束が崩れる。",
  },
  {
    id: 361,
    label: "上限で落とすときに束の ID を振り直す",
    patch: "m361-core-trim-renumbers-groups.patch",
    pkg: "packages/poker-core",
    tests: ["tests/estimate-log.test.ts"],
    note: "#93。画面の束の同一性（key・ポイントの入れ直しの宛先）が揺れる。",
  },
  {
    id: 362,
    label: "自動公開が記録を足さない",
    patch: "m362-core-auto-reveal-skips-log.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#93。全員投票の自動公開だけ記録が落ちる（手動公開は記録される）。",
  },
  {
    id: 363,
    label: "再投票が item を空にする",
    patch: "m363-core-revote-clears-item.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#93。再投票でアイテム名が消える。",
  },
  {
    id: 364,
    label: "next-round を次のアイテムへ向ける",
    patch: "m364-sync-next-round-closes-group.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/estimate-log.test.ts", "test/poker/next-round.test.ts"],
    note: "#93。古いクライアントの next-round で束が閉じ item が消える。",
  },
  {
    id: 365,
    label: "アイテム名の欄が編集中に props の item で打ちかけを上書きする",
    patch: "m365-web-item-field-overwrites-draft.patch",
    pkg: "apps/poker-web",
    tests: ["tests/estimate-item-field.test.tsx"],
    note: "#93。他の参加者の入力で自分の打ちかけが消える。",
  },
  {
    id: 320,
    label: "順番に回すとき、番が決まった人がまた選ばれる",
    patch: "m320-order-ignores-done.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T2。まだの人から引かず、入る人の全体から引く。番が決まった人がまた選ばれ、円盤から抜けない。",
  },
  {
    id: 321,
    label: "最後の 1 人も回す",
    patch: "m321-order-spins-last-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T3。まだの人が 1 人でも回す。1 席の円盤が回り、壊れて見える（モック 2 版）。",
  },
  {
    id: 322,
    label: "回が終わった後に新しい回を始めない",
    patch: "m322-order-never-restarts.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T4。回が終わった後に押しても新しい回を始めない。「次の回を始める」が効かない。",
  },
  {
    id: 323,
    label: "回の途中でも決め方を変えられる",
    patch: "m323-mode-changes-mid-round.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T8。回の途中でも決め方を変えられる。済んだ人の記録の意味が変わる。",
  },
  {
    id: 324,
    label: "番が 0 から始まる",
    patch: "m324-order-turn-off-by-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す §5.1。番を 0 から数える。札と一言が「0 番」から始まる。",
  },
  {
    id: 325,
    label: "名簿から消えた人を番の記録から落とす",
    patch: "m325-prune-drops-order.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-turn-order.test.ts"],
    note: "#401 順番に回す T6・PR #418 のレビュー。名簿から消えた人を番の記録から落とす。後ろの人の番が繰り上がり、次の番が既出の番と重なる。",
  },
  {
    id: 326,
    label: "同期サーバーが決め方を使わない",
    patch: "m326-sync-mode-set-ignores-mode.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#401 順番に回す T1。同期サーバーが送られた決め方を使わない。1 回で決めるへ戻せない。",
  },
  {
    id: 327,
    label: "1 回で決めるで順番の回転の結果を出す",
    patch: "m327-web-once-shows-order-spin.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す §5.1。1 回で決めるへ戻した後も、順番の回転の結果を「次の進行役」として出す。",
  },
  {
    id: 328,
    label: "回っている間に番の印を出す",
    patch: "m328-web-reveals-turn-while-spinning.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す §5.3。回っている間に、いま選ばれる人の番の印を脇に出す（止まる前に結果が分かる）。",
  },
  {
    id: 329,
    label: "回が終わっても円盤を空にしない",
    patch: "m329-web-finished-keeps-wheel.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す T3（案 A）。回が終わっても円盤を空にしない。",
  },
  {
    id: 330,
    label: "主ボタンが「最後の 1 人」にならない",
    patch: "m330-web-no-last-button.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts", "tests/turn-order.test.tsx"],
    note: "#401 順番に回す T3。まだの人が 1 人でも主ボタンが「次の人を決める」のまま（回さずに出すことが伝わらない）。",
  },
  {
    id: 340,
    label: "止まった後の押下で上書きされる",
    patch: "m340-press-later-press-wins.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P3。止まった後の押下も採る。後から押した人の位置で上書きされ、画面ごとに違う人が出る。",
  },
  {
    id: 341,
    label: "位置が逆向きに進む",
    patch: "m341-press-position-wrong-way.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P2。位置が逆向きに進む。円盤の回る向きと指し針が指す席が食い違う。",
  },
  {
    id: 342,
    label: "30 秒で止まらない",
    patch: "m342-press-never-auto-stops.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P5。誰も押さないと止まらない。部屋が回りっぱなしになる。",
  },
  {
    id: 343,
    label: "席の中の位置 1 を受ける",
    patch: "m343-press-settle-allows-one.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-press.test.ts"],
    note: "#401 押して止める P4。席の中の位置 1 を受ける。次の席の端と同じ位置になり、札と真鍮の席が隣の人を指しうる。",
  },
  {
    id: 344,
    label: "押した人の名前が載らない",
    patch: "m344-sync-stop-drops-presser.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#401 押して止める §4.1。同期サーバーが押した人の名前を載せない。「○○ さんが止めました」が出ない。",
  },
  {
    id: 345,
    label: "押した画面がその場で止まらない",
    patch: "m345-web-presser-keeps-spinning.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P3。押した画面がその場で止まらず、返事が来るまで回り続ける（押した位置と見えた位置が食い違う）。",
  },
  {
    id: 346,
    label: "ほかの画面が寄せずに跳ぶ",
    patch: "m346-web-others-jump.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P3。ほかの画面が寄せずに止まった位置へ跳ぶ。",
  },
  {
    id: 347,
    label: "名前の欄の Space で止まる",
    patch: "m347-web-space-in-input-stops.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P9。名前の欄で空白を打つと止まってしまう。",
  },
  {
    id: 348,
    label: "動きを減らす設定で回らない",
    patch: "m348-web-reduced-motion-stops-press.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press.test.tsx"],
    note: "#401 押して止める P8。動きを減らす設定で円盤が回らない（このときも回すと決めた）。",
  },
  {
    id: 349,
    label: "同じ回転の止まった位置を捨てる",
    patch: "m349-web-sync-keeps-old-spin.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/use-roulette-sync.test.tsx", "tests/press.test.tsx"],
    note: "#401 押して止める。同じ回転のうちに届いた止まった位置を捨てる。ほかの人が止めても回り続ける。",
  },
  {
    id: 350,
    label: "自動の停止で札が空",
    patch: "m350-web-auto-stop-not-written.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/press-view.test.ts", "tests/press.test.tsx"],
    note: "#401 押して止める P5。30 秒の自動の停止を回転に書き込まない。一言は出るが、札と真鍮の席が空のまま。",
  },
  {
    id: 370,
    label: "止まり方が毎回出る",
    patch: "m370-style-hits-every-roll.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S3。1/24 の目を見ずに、毎回変わった止まり方を選ぶ（ごくまれでなくなる）。",
  },
  {
    id: 371,
    label: "止まり方で回転中の判定が延びない",
    patch: "m371-style-duration-not-extended.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S2。サーバーの回転中の判定が止まり方の分だけ延びない。画面が止まる前に次の回転を受け付ける。",
  },
  {
    id: 372,
    label: "wire の長さが止まり方を見ない",
    patch: "m372-view-duration-ignores-style.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S2・S5。wire の durationMs が延びない。画面が変わった止まり方の途中で結果を出す。",
  },
  {
    id: 373,
    label: "押して止めるにも止まり方を掛ける",
    patch: "m373-press-gets-style.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-stop-style.test.ts"],
    note: "#420 spec S4。押して止めるにも止まり方を載せる（押した位置と違う動きで嘘に見える）。",
  },
  {
    id: 374,
    label: "同期サーバーが止まり方を引かない",
    patch: "m374-sync-never-draws-style.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#420 spec S1。同期サーバーが止まり方の乱数を渡さない。変わった止まり方が一度も出ない。",
  },
  {
    id: 375,
    label: "画面が止まり方の延びを見ずに 2 人目を出す",
    patch: "m375-web-reveal-ignores-style.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style.test.tsx"],
    note: "#420 振る舞い 4。2 人以上のとき、真鍮の席・札の行が延びる前の時刻で決まる（円盤はまだ動いている）。",
  },
  {
    id: 376,
    label: "円盤が止まり方を描かない",
    patch: "m376-web-wheel-ignores-style.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style.test.tsx"],
    note: "#420 spec S1。円盤が止まり方を描かず普通に止まり、結果だけが遅れて出る。",
  },
  {
    id: 377,
    label: "止まり方の最後が当たりの位置からずれる",
    patch: "m377-motion-ends-off-seat.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style-motion.test.ts", "tests/stop-style.test.tsx"],
    note: "#420 振る舞い 3。じりじりの最後が当たりの席の位置まで進まない。止まった瞬間に跳ぶ。",
  },
  {
    id: 378,
    label: "動きの長さが core の表とずれる",
    patch: "m378-motion-length-off-table.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/stop-style-motion.test.ts"],
    note: "#420 spec S2。行き過ぎて戻るの動きが表より長い。結果が出た後も円盤が動いている（止まった瞬間に跳ぶ）。",
  },
  {
    id: 390,
    label: "自動公開が見学者を分母から外さない",
    patch: "m390-core-auto-reveal-counts-spectators.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。見学者が票を入れないので、残りが全員投票しても自動公開が立たない。",
  },
  {
    id: 391,
    label: "見学に切り替えても投票中の票を捨てない",
    patch: "m391-core-spectate-keeps-vote.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。見学者の票が集計に残る。",
  },
  {
    id: 392,
    label: "見学者の票を受ける",
    patch: "m392-core-cast-vote-accepts-spectator.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。spectating を返さず、見学者が投票できてしまう。",
  },
  {
    id: 393,
    label: "退出で見学の集合から外さない",
    patch: "m393-core-discard-keeps-spectator.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。退出した人が見学に残り、再入室しても見学のままになる。",
  },
  {
    id: 394,
    label: "commitRoomAction が名簿に居ない人を通す",
    patch: "m394-sync-commit-room-action-skips-roster-check.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/commit-room-action.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-9。片付けで外された人の接続が状態を動かす。",
  },
  {
    id: 395,
    label: "remove-participant が接続中の人も外す",
    patch: "m395-sync-remove-participant-removes-connected.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/commit-room-action.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-5。dispatch の門だけから接続中の対象を拒む条件を抜く。m395 は dispatch 側の門、m398 は removeFromRoom 側の門を守る。殺すテストは removeFromRoom を呼ばれたら throw するスタブにした commit-room-action.test.ts の dispatch 側の門。",
  },
  {
    id: 396,
    label: "removeFromRoom が timer の状態の無いルームで timers.put する",
    patch: "m396-sync-remove-from-room-creates-timer.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/remove-participant.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-6。poker だけのルームに timer の初期状態ができ、のちの timer 入室の遅延生成（D8）が働かない。",
  },
  {
    id: 397,
    label: "shortParticipantId が先頭 4 文字を取る",
    patch: "m397-room-core-short-id-takes-head.patch",
    pkg: "packages/room-core",
    tests: ["tests/participant-label.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。先頭は p_ で全員同じなので、同名の呼び分けにならない。",
  },
  {
    id: 398,
    label: "removeFromRoom の二段目の門が接続中の対象を拒まない",
    patch: "m398-sync-remove-from-room-gate-skips-connected.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/room-removal.test.ts"],
    note: "#419。**対応表より後に足した変異。** 390〜399 は #419 に割り当てた。G-5。m395 は dispatch 側の門、m398 は removeFromRoom 側の門だけを守る。removeFromRoom の「接続中の対象を拒む条件」だけを外す（dispatch の門は触らない）ので、dispatch を通らずに直接呼ぶ単体テストだけが殺せる。",
  },
  {
    id: 410,
    label: "記録しない間も開票で行を足す",
    patch: "m410-core-reveal-records-when-off.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#427 設計 D。**対応表より後に足した変異。** 410〜419 は #427 に割り当てた。記録のスイッチが開票に効かない。",
  },
  {
    id: 411,
    label: "切り替えで open の束を閉じない",
    patch: "m411-core-set-recording-keeps-open-group.patch",
    pkg: "packages/poker-core",
    tests: ["tests/round.test.ts"],
    note: "#427 J7。しない間の行が前の束に混ざる。",
  },
  {
    id: 412,
    label: "束の名前の書き換えが最後の行だけを変える",
    patch: "m412-core-set-group-item-last-entry-only.patch",
    pkg: "packages/poker-core",
    tests: ["tests/estimate-log.test.ts"],
    note: "#427 設計 E。古い行の名前が残る。",
  },
  {
    id: 413,
    label: "同期サーバーが set-group-item を受けても名前を捨てる",
    patch: "m413-sync-set-group-item-drops-name.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/estimate-log.test.ts"],
    note: "#427 設計 E。dispatch の枝が ok(round) を返し、束の名前が変わらない。",
  },
  {
    id: 414,
    label: "open の束が無くても開票後にポイントの欄を出す",
    patch: "m414-web-points-select-without-open-group.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-estimate.test.tsx"],
    note: "#427 設計 J8。記録していれば open の束が無くても帯にポイントの欄が出る。",
  },
  {
    id: 415,
    label: "poker が REMOVED_FROM_ROOM を未知のエラーとして帯に出す",
    patch: "m415-poker-removed-shown-as-unknown-error.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-redirect.test.tsx"],
    note: "#427 設計 A。外された・抜けた印を扱わず、組も接続も残して玄関へ戻らない。",
  },
  {
    id: 416,
    label: "1 回の回転で、すでに選んだ人を候補から外さない",
    patch: "m416-draw-repeats-within-spin.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/draw-picks.test.ts"],
    note: "#427 設計 F。1 回で決めるとき、1 回の回転の中で同じ人が 2 度選ばれる。",
  },
  {
    id: 417,
    label: "当たり以外の席にも winner の塗りを付ける",
    patch: "m417-wheel-non-winner-gets-winner-fill.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/wheel.test.tsx"],
    note: "#427 設計 F。円盤の色が「当たりかどうか」を表さなくなる（全席が真鍮の地になる）。",
  },
  {
    id: 430,
    label: "次へが区切り ID を見ず、古い押下で区切りが飛ぶ",
    patch: "m430-next-ignores-step-id.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 区切り ID が違う `next` を捨てず進めてしまう（古い押下で飛ぶ）。",
  },
  {
    id: 431,
    label: "区切りの所要から一時停止の時間が落ちる",
    patch: "m431-spent-excludes-pause.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda-invariant.test.ts"],
    note: "#429 区切りの所要を一時停止を除いた計時から計算する。所要は実時間であるべき。",
  },
  {
    id: 432,
    label: "終わる見込みに、飛ばした区切りの持ち時間が入る",
    patch: "m432-projection-counts-skipped.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/projection.test.ts"],
    note: "#429 終わる見込みに、飛ばした未開始の区切りの持ち時間を含める。",
  },
  {
    id: 433,
    label: "自動で次へが期限ではなく発火した時刻を境にし、発火の遅れを持ち込む",
    patch: "m433-auto-advance-starts-at-fire-time.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 自動で次へが、期限ではなく発火した時刻を境にする。発火の遅れが次の区切りへ持ち込まれる。",
  },
  {
    id: 434,
    label: "延長が区切り ID を見ず、違う区切りの延長も受け付ける",
    patch: "m434-extend-ignores-step-id.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 区切り ID が違う延長を捨てず、いまの区切りに適用してしまう。",
  },
  {
    id: 435,
    label: "一時停止中に次へを押すと、次の区切りが止まったまま始まる",
    patch: "m435-next-while-paused-stays-paused.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 一時停止中の次へで、次の区切りが動いて始まらず一時停止のまま残る。",
  },
  {
    id: 436,
    label: "コマンドの検めが緩み、余計なフィールドを通す",
    patch: "m436-command-schema-loosened.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/schemas.test.ts"],
    note: "#429 `agenda.next` のコマンドの検めが `v.strictObject` から `v.object` に緩み、余計なフィールドを通す。",
  },
  {
    id: 437,
    label: "進行中でもシナリオを置き換えられる",
    patch: "m437-replace-allowed-while-running.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts"],
    note: "#429 進行中でもシナリオの置き換えを許す。",
  },
  {
    id: 439,
    label: "ルーム破棄で進行タイマーの状態を消さない",
    patch: "m439-destroy-keeps-agenda.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note: "#429 設計 §5.2。ルーム破棄で進行タイマーの状態を消さない。破棄したルームのコードを引き継いだ別のルームに、古い進行の状態が残る。",
  },
  {
    id: 440,
    label: "延長しても自動で次へ進む期限を張り直さない",
    patch: "m440-extend-does-not-rearm.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/agenda-handlers.test.ts"],
    note: "#429 延長しても期限を張り直さない。延長した区切りが、元の期限で自動で次へ進んでしまう。",
  },
  {
    id: 438,
    label: "ハブの層から進行タイマーのハンドラも呼ぶ",
    patch: "m438-hub-message-reaches-agenda.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.agenda.test.ts"],
    note: "#429 進行タイマーの層は『進行タイマーとして在席しているか』で 2 段目を守るので状態は変わらないが、ハブの接続が 2 通目の拒否を受け取る。5 種の接続で拒否が 1 通ずつであることを見る。",
  },
  {
    id: 441,
    label: "お題の宛先から進行タイマーの接続を外す",
    patch: "m441-topic-excludes-agenda.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.agenda.test.ts"],
    note: "#429 進行タイマーを開いている人に、お題の掲げ直しも取り下げも届かなくなる。",
  },
  {
    id: 442,
    label: "進行タイマーの接続の受理で onConnect を通さない",
    patch: "m442-agenda-skips-on-connect.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.agenda.test.ts"],
    note: "#429 poker の早期 return に足す。レート制限の鍵が接続 ID に落ち、room.join の総当たりが接続を張り直すだけで枠を回避できる。",
  },
  {
    id: 443,
    label: "途中参加の画面へ届く経過が開始の瞬間で計られ 0 になる",
    patch: "m443-elapsed-sent-as-zero-on-join.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/agenda-handlers.test.ts"],
    note: "#429 状態を送るとき、経過を送る時点でなく開始の瞬間で計り、途中参加の画面の経過が 0 になる。publish の経路の経過にも効く。",
  },
  {
    id: 448,
    label: "表に戻ったとき agenda.sync を送らない",
    patch: "m448-visibility-does-not-resync.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/use-agenda-sync.test.tsx"],
    note: "#429 裏のタブで止まった時計が、次の操作かフレームまで直らない。表に戻ったときの 1 通を見る。",
  },
  {
    id: 444,
    label: "最初の描画で残りが 0 以下なら時打ちの合図を出す",
    patch: "m444-signal-on-first-view.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/timeout-signal.test.ts", "tests/agenda-room.test.tsx"],
    note: "#429 途中参加・再接続の画面が、過去に過ぎた 0 に対して鳴る。prev が null の 1 回を見る。",
  },
  {
    id: 446,
    label: "オーバー中の数字から「+」を落とす",
    patch: "m446-overrun-without-plus.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#429 残りとオーバーを見分ける手がかりが色だけになる（金と赤銅は明度がほぼ同じ）。",
  },
  {
    id: 447,
    label: "針をいまのステップの計時で進める",
    patch: "m447-needle-ignores-pause.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/dial-geometry.test.ts"],
    note: "#429 一時停止の間に針が止まり、内の環の先端と離れる。一時停止を挟んだ後でしか値が分かれないので、性質テストと一時停止の例で見る。",
  },
  {
    id: 450,
    label: "動きを減らす設定で針を描かない",
    patch: "m450-reduced-motion-hides-needle.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/dial.test.tsx"],
    note: "#429 timer の chrono-hand と同じ扱いにすると、押し巻きを読む要が盤から消える。",
  },
  {
    id: 445,
    label: "現在の版でない保存を移行せずに捨てる",
    patch: "m445-old-saved-version-dropped.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/saved-scenarios.test.ts"],
    note: "#429 版を上げたとき、利用者が端末に保存したシナリオが全部消える。偽の旧版を migrations に差し込んで読む。",
  },
  {
    id: 449,
    label: "玄関の札の ID が agenda の綴りとずれる",
    patch: "m449-hub-tool-id-mismatch-agenda.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note: "#429。在席の表示が進行タイマーに居る人を札の名前で出せず、「agenda にいます」と生の綴りが出る。型は綴りのずれを拾わない。",
  },
  {
    id: 451,
    label: "操作を当てる前に自動で次へ進めない",
    patch: "m451-command-skips-advance-if-due.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/agenda-handlers.test.ts"],
    note: "#429 PR #431 のレビュー。期限を過ぎてから予約が発火するまでの隙に届いた操作が古い区切りに当たり、所要が持ち時間を超えて確定し、一時停止なら終わったはずの区切りで止まる。",
  },
  {
    id: 452,
    label: "最初からに戻すとき、展開済みの区切りをまた回数倍して展開する",
    patch: "m452-reset-expands-already-expanded-steps.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/agenda.test.ts", "tests/agenda-invariant.test.ts"],
    note: "#429 第 2 段。`reset` が展開済みの区切りを定義として再展開すると、回数 3 の進行が戻すたびに 3 倍（N²）に増える。",
  },
  {
    id: 453,
    label: "合計の上限を 1 回あたりで見て、回数を掛けない",
    patch: "m453-total-limit-ignores-rounds.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/schemas.test.ts"],
    note: "#429 第 2 段。1 区切り 25 分 × 29 回（725 分）が 1 回あたり 25 分で通り、720 分の上限を回数で破れる（#455 で値を改めた）。",
  },
  {
    id: 454,
    label: "展開後の区切りの数の上限を見ない",
    patch: "m454-expanded-step-count-unchecked.patch",
    pkg: "packages/agenda-core",
    tests: ["tests/schemas.test.ts"],
    note: "#429 第 2 段。4 区切り × 16 回（64 区切り）が定義の上限 40 以下で通り、展開後の上限 60 を破れる。",
  },
  {
    id: 455,
    label: "ルームのシナリオを下書きへ写すとき、展開済みの全部を写す",
    patch: "m455-view-copies-all-expanded-steps.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts"],
    note: "#429 第 2 段。回数 6 の朝会が 6 区切り（回数なし）の下書きになり、読み込むたびに回数倍へ増える。",
  },
  {
    id: 456,
    label: "比べる鍵から回数を外す",
    patch: "m456-key-ignores-rounds.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts"],
    note: "#429 第 2 段。回数だけ違う下書きがルームと同じに見え、読み込みや変更の知らせが働かない。",
  },
  {
    id: 457,
    label: "回数 1 でも rounds: 1 を送る",
    patch: "m457-draft-sends-rounds-one.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts"],
    note: "#429 第 2 段。回数なしの定義と別の形になり、ルームとの比べが食い違う。",
  },
  {
    id: 458,
    label: "回の札を回数 1 でも出す",
    patch: "m458-round-badge-shows-for-single-round.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#429 第 2 段。回数 1 の盤の中央に「1 / 1 回」が出て、第 1 段の盤と変わる（回数 1 は第 1 段のまま、の反目標）。",
  },
  {
    id: 459,
    label: "進行表のいまの行へ scrollIntoView で合わせる",
    patch: "m459-step-list-scrolls-page.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx", "tests/projection-view.test.tsx", "tests/rendered-text-fits-font-base.test.tsx"],
    note: "#429 第 2 段。scrollIntoView は祖先のページまで動かし、区切りが移るたびに盤がページの外へ出る。枠の scrollTop だけを動かす。",
  },
  {
    id: 460,
    label: "進行表の行の位置を測るとき、枠の scrollTop を足し戻さない",
    patch: "m460-step-list-ignores-box-scroll-top.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#429 第 2 段。スクロール済みの枠では行の座標が scrollTop の分だけ手前に出る。足し戻さないと二段目の移動が足りず、いまの行が枠の外に残る。",
  },
  {
    id: 461,
    label: "下書きに中身があっても、確かめずにサンプルで置き換える",
    patch: "m461-sample-replaces-draft-unasked.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-builder.test.tsx"],
    note: "#429 フィードバック F3。組みかけの下書きが黙って消える。中身のある下書きでは「いまの下書きを消して読み込みますか」と確かめ、やめれば下書きはそのまま。",
  },
  {
    id: 462,
    label: "1 回あたり 1 ステップの回でも、回の見出しを出す",
    patch: "m462-single-step-rounds-show-headings.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#429 フィードバック F4。朝会（1 ステップ × 6 回）で見出しと行が交互に並び、12 項目になって枠からはみ出してバーが出る。1 回あたり 1 ステップは見出しを出さず、行の番号に回の数を出す。",
  },
  {
    id: 463,
    label: "poker の index.html から og:image を外す",
    patch: "m463-poker-drops-og-image.patch",
    pkg: "apps/landing",
    tests: ["tests/index-html-exterior.test.ts"],
    note: "#434。Slack などに貼った poker のリンクに画像が出ず、文字だけの地味な紹介になる。",
  },
  {
    id: 464,
    label: "agenda の og:description を tools.ts と食い違わせる",
    patch: "m464-agenda-og-description-diverges.patch",
    pkg: "apps/landing",
    tests: ["tests/index-html-exterior.test.ts"],
    note: "#434。貼ったリンクの紹介文が玄関の説明と食い違い、同じ道具が場所によって違う説明で見える。",
  },
  {
    id: 465,
    label: "timer の index.html から icon・apple-touch-icon・manifest の link を外す",
    patch: "m465-timer-drops-icon-links.patch",
    pkg: "apps/landing",
    tests: ["tests/index-html-exterior.test.ts"],
    note: "#434。タブにアイコンが出ず、ホーム画面に追加しても既定の絵になる。",
  },
  {
    id: 466,
    label: "お題ツールの配信を try_files {path} /index.html に戻す",
    patch: "m466-topic-spa-fallback-hides-missing.patch",
    pkg: "apps/landing",
    tests: ["tests/caddy-fragment-order.test.ts"],
    note: "#434。消えた資材や存在しないファイルが index.html の 200 に化け、欠落に気づけず画面が壊れたまま表示される。",
  },
  {
    id: 467,
    label: "エラーの応答を no-cache に上書きする handle_errors を外す",
    patch: "m467-error-responses-keep-immutable.patch",
    pkg: "apps/landing",
    tests: ["tests/caddy-fragment-order.test.ts"],
    note: "#434。404 や将来のエラーページにも 1 年の immutable が付き、配布の途中に覚えた欠落を利用者のブラウザが 1 年持ち続ける。",
  },
  {
    id: 468,
    label: "security.txt の Expires を近い日付にする",
    patch: "m468-security-txt-expires-soon.patch",
    pkg: "apps/landing",
    tests: ["tests/site-files.test.ts"],
    note: "#434。期限が切れた security.txt は無効と読まれ、脆弱性を見つけた人が連絡先を失う。",
  },
  {
    id: 469,
    label: "robots.txt の Disallow を空にして全クローラを許可する",
    patch: "m469-robots-allows-all.patch",
    pkg: "apps/landing",
    tests: ["tests/site-files.test.ts"],
    note: "#434。個人・チーム用の道具が検索結果に出てしまい、意図せず公開された形になる。",
  },
  {
    id: 470,
    label: "immutable の header に match status 2xx を戻す",
    patch: "m470-header-match-status-returns.patch",
    pkg: "apps/landing",
    tests: ["tests/caddy-fragment-order.test.ts"],
    note: "#434。Caddy 2.6.2（当時の本番）は match を条件と読まず、validate も E2E も通ったまま 404 に 1 年の immutable が付いた。",
  },
  {
    id: 471,
    label: "audit-supply-chain-config が hoistWorkspacePackages: true を通す",
    patch: "m471-hoist-workspace-packages-accepts-true.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#439。CI は仮想ストアを逃がさないので true でも緑のまま、逃がした手元の install だけが " +
      "ERR_PNPM_INVALID_DEPENDENCY_NAME で止まる。本番の pnpm-workspace.yaml は false なので、" +
      "この検出が消えても検査結果は変わらない（id 20 と同じ型）。",
  },
  {
    id: 472,
    label: "audit-supply-chain-config が lockFileMaintenance の無効を見ない",
    patch: "m472-lockfile-maintenance-unchecked.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#444・docs/adr/0024 の追記。Renovate は推移依存の修正を lockFileMaintenance にしか届けないので、" +
      "消えても CI は緑のまま推移依存の勧告が放置される。本番の renovate.json は有効なので、" +
      "この検出が消えても検査結果は変わらない（id 20 と同じ型）。",
  },
  {
    id: 473,
    label: "audit-supply-chain-config が絞り込みを足した規則の待機期間の外しを通す",
    patch: "m473-lockfile-maintenance-age-release-widened.patch",
    pkg: "scripts",
    tests: ["audit-supply-chain-config.test.mjs"],
    note:
      "#444。待機期間を外してよいのは種類が lockFileMaintenance だけで絞り込みの無い規則に限る。" +
      "絞り込みを足した規則まで通すと、例外の形を借りて特定のパッケージの待機期間を外せる。",
  },
  {
    id: 474,
    label: "見出しの QR を閉じている間も作る（useInviteQr(inviteUrl, true)）",
    patch: "m474-qr-built-while-closed.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。開かない人まで qrcode を読み込み、閉じた欄に画像が残る。QR は開くまで生成ライブラリを読まない約束。",
  },
  {
    id: 475,
    label: "見出しの QR の欄から hidden を外す",
    patch: "m475-qr-region-not-hidden.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。閉じたはずの欄（準備中・失敗の案内）が見えたまま残り、ボタンの aria-expanded と見た目が食い違う。",
  },
  {
    id: 476,
    label: "QR のボタンの aria-controls が QR の欄ではなく包む欄を指す",
    patch: "m476-qr-toggle-controls-wrong-id.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。開閉する先の読み上げが嘘になる。試験は aria-controls から欄を引いて hidden を見るので、指す先がずれると赤くなる。",
  },
  {
    id: 477,
    label: "見出しの戻るリンクが backHref を使わず根へ飛ぶ",
    patch: "m477-back-link-ignores-back-href.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。ルームの選択画面ではなく玄関の入口へ戻され、ルームを離れる。",
  },
  {
    id: 478,
    label: "titleExtras を見出しの隣ではなく .ui-page-header の直下に置く",
    patch: "m478-title-extras-under-page-header.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。行の子が 3 つになり、両端寄せの並びで戻るリンクが真ん中に浮く（poker の「お題を隠す」「記録する」を差し込む画面で起きる）。",
  },
  {
    id: 479,
    label: "見出しの URL の欄に aria-label を付ける",
    patch: "m479-invite-url-with-aria-label.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447。設計 R2。揃える向きは「付けない」。role の無い span の aria-label は読み上げの扱いが揺れ、見えている字と名前が二重になる。",
  },
  {
    id: 480,
    label: "玄関の札を作った順（topic が roulette の前）に戻す",
    patch: "m480-hub-tools-in-creation-order.patch",
    pkg: "apps/landing",
    tests: ["tests/App.test.tsx"],
    note: "#447。使う流れ（交代 → 見積もり → 進行 → お題 → 予定）と札の並びがずれる。",
  },
  {
    id: 481,
    label: "ルーレットの脇に「仲間を招く」を戻す（招待が二重）",
    patch: "m481-roulette-side-invite-returns.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-room.test.tsx"],
    note: "#447。設計 R1。招待が見出しと脇の二重になり、320px で脇の分だけ縦に伸びる。消した InviteLink は戻さず、同じ形の欄を書いて戻す。",
  },
  {
    id: 482,
    label: "agenda が映している間も共通の見出しを描く",
    patch: "m482-agenda-header-while-projecting.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/projection-view.test.tsx"],
    note: "#447。全画面の重ねの裏に押せるリンクとボタンが残り、Tab で映す表示から抜け出せる。",
  },
  {
    id: 483,
    label: "広い幅で「仲間を招く」を隠す規則の詳細度を (0,1,0) に戻す",
    patch: "m483-wide-invite-toggle-specificity-010.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447。設計 R6。後に読み込む `.ui-button` の `display: inline-flex` が後勝ちし、広い幅にも開閉のボタンが出る。" +
      "jsdom は @media を解かないので部品の試験では見えず、実際の見え方は E2E（`e2e/specs/panels-headers.spec.ts` の" +
      "「1280×800 と 320×640」）が見る。E2E の spec は変異検査のランナー（e2e は vitest で tests/ だけ）に載らないので、" +
      "変異検査の中で拾う側として詳細度と読み込み順を字で読む試験を足した。",
  },
  {
    id: 484,
    label: "狭い幅で招待の欄をたたむ display: none を消す",
    patch: "m484-narrow-invite-fold-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447。設計 §8 R6。320px で開く前から招待の欄が出て見出しが約 210px 高くなり、ルーレットの止まった札が下端の帯に隠れる。" +
      "jsdom は @media を解かないので部品の試験では見えない。m483 と同じ理由で、変異検査の中で拾う側として 40rem 未満の規則を字で読む。",
  },
  {
    id: 485,
    label: "compact を受け取っても見出しに詰めた見た目のクラスを付けない",
    patch: "m485-room-header-compact-class-dropped.patch",
    pkg: "packages/invite-ui",
    tests: ["tests/room-header.test.tsx"],
    note: "#447 段 2。timer のセッションで見出しが通常の高さに戻り、広い幅では「仲間を招く」が消えて招待の欄が開いたまま出る。",
  },
  {
    id: 486,
    label: "詰めた見た目で 40rem 以上の「仲間を招く」を出す規則を消す",
    patch: "m486-compact-wide-invite-toggle-hidden.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447 段 2。広い幅の timer のセッションで、招待の欄はたたまれたまま開くボタンも消え、招待に辿り着けない。" +
      "jsdom は @media を解かないので部品の試験では見えない。m483 と同じ理由で、変異検査の中で拾う側として 40rem 以上の規則を字で読む。",
  },
  {
    id: 487,
    label: "timer のセッションで見出しに compact を渡さない",
    patch: "m487-timer-session-not-compact.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。見出しが通常の高さになり、390×844 で計器が下端の帯に潜る。",
  },
  {
    id: 488,
    label: "timer の完了の画面で見出しを描かない",
    patch: "m488-timer-header-hidden-on-celebration.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。帯から戻るリンクを外したので、完了の画面からルームの選択画面へ戻る道が無くなる。",
  },
  {
    id: 489,
    label: "timer の休憩中に見出しを包む要素の inert を外す",
    patch: "m489-timer-header-not-inert-on-break.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。休憩の覆いの裏の戻るリンクと「仲間を招く」に Tab で入れ、覆いから抜け出せる。",
  },
  {
    id: 490,
    label: "timer でルームを失っても見出しを描く",
    patch: "m490-timer-header-after-room-lost.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。失ったルームの招待（コード・URL・QR）を配れてしまい、描かない帯とも食い違う。",
  },
  {
    id: 491,
    label: "timer の見出しの戻る先を /（ルームを付けない）にする",
    patch: "m491-timer-back-link-to-root.patch",
    pkg: "apps/timer-web",
    tests: ["test/ui/App.room-header.test.tsx"],
    note: "#447 段 2。ルームの選択画面ではなく玄関の入口へ戻され、ルームを離れる（m477 の、timer の配線の側）。",
  },
  {
    id: 492,
    label: "40rem 未満の詰めた見た目で道具名を隠す規則を消す",
    patch: "m492-compact-narrow-title-shown.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447 段 2。見出しが 2 行（約 90px）になり、390×844 の timer のセッションで計器が下端の帯に潜る。" +
      "実際の見え方は E2E（`e2e/specs/layout.spec.ts` の timer の幅 390）が見るが、E2E の spec は変異検査のランナーに載らないので、" +
      "m483 と同じ理由で、変異検査の中で拾う側として 40rem 未満の規則を字で読む試験を足した。",
  },
  {
    id: 493,
    label: "詰めた見た目で幅によらず招待の欄をたたむ規則を消す",
    patch: "m493-compact-invite-fold-removed.patch",
    pkg: "packages/ui",
    tests: ["tests/room-header-wide-toggle.test.mjs"],
    note:
      "#447 段 2。広い幅の timer のセッションで開く前から招待の欄が出て見出しが高くなり、「仲間を招く」の aria-expanded と見た目が食い違う。" +
      "40rem 未満は通常の見た目のたたみの規則が重ねて隠すので、狭い幅では見えない。@media の外の規則を字で読む試験を足した。",
  },
  {
    id: 495,
    label: "開く前の席に各人の札を載せる",
    patch: "m495-view-leaks-others-card-before-reveal.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/projection.test.ts", "tests/projection-invariant.test.ts"],
    note: "#406 段 1。誰が何を出したかが開く前に全員へ届き、札を伏せる意味が無くなる（設計 §6・E5）。匿名をサーバーで守る変異。",
  },
  {
    id: 496,
    label: "匿名で開いた後の山に出した人の名前を載せる",
    patch: "m496-anonymous-piles-carry-names.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/projection.test.ts"],
    note: "#406 段 1。匿名を選んだ回で誰がどの札かが全員に分かる（設計 §6・E6）。匿名をサーバーで守る変異。",
  },
  {
    id: 497,
    label: "匿名で開いた後も受け手に自分の札を返す",
    patch: "m497-anonymous-reveal-keeps-your-card.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/projection.test.ts"],
    note: "#406 段 1。画面が自分の札の山を印すと、肩越しに見た人に自分の札が分かる（判断 7）。匿名をサーバーで守る変異。",
  },
  {
    id: 498,
    label: "札が出た後も公開の仕方を変えられる",
    patch: "m498-visibility-unlocked-after-play.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。匿名のつもりで出した札が名前つきで開かれる（判断 5・E7）。匿名をサーバーで守る変異。",
  },
  {
    id: 499,
    label: "もう一回で前の回の公開の仕方を引き継ぐ",
    patch: "m499-again-keeps-visibility.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。前の回で名前つきに切り替えた ROTI が、次の回も名前つきのまま始まる（判断 8）。",
  },
  {
    id: 500,
    label: "自動公開で players から見学者を除かない",
    patch: "m500-auto-reveal-counts-spectators.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 段 1。見学者は札を出せないので、見学者が混じると全員が出しても開かない（E9）。" +
      "隣の「players が全員見学なら…開かない」はこの変異では赤にならない（除外の後の 0 人の判定を守る試験）。",
  },
  {
    id: 501,
    label: "くじの候補にいまのやり方を残す",
    patch: "m501-draw-includes-current-method.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。引き直しても同じやり方が出る（E2）。",
  },
  {
    id: 502,
    label: "出し直しを受けず最初の札が残る",
    patch: "m502-replay-keeps-first-card.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note: "#406 段 1。札を選び直せない（E10）。",
  },
  {
    id: 503,
    label: "札を出す操作で回の番号を見ない",
    patch: "m503-stale-seq-applies.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 段 1。もう一回の直後に届いた古い回の札が新しい回に入る（Review Focus 2）。" +
      "seq の検査を他の検査の後ろへ回す変形（playCard）も同じ試験が赤にすることを手で確かめた。setVisibility 側は m519 が受け持つ。",
  },
  {
    id: 504,
    label: "コマンドのスキーマが余計なフィールドを拒まない",
    patch: "m504-command-schema-loosened.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/schemas.test.ts"],
    note: "#406 段 1。v.strictObject を v.object に緩める。`docs/adr/0011` 決定 2 S3 の MUST に反する。",
  },
  {
    id: 505,
    label: "配信が受け手ごとでなく全員へ同じ投影を送る",
    patch: "m505-broadcast-one-view-to-all.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note: "#406 段 2。開く前に名簿の先頭の人の札が全員へ届く（設計 §6・E5）。匿名をサーバーで守る変異。",
  },
  {
    id: 506,
    label: "札を出す人をチェックインでなくルームの在席で数える",
    patch: "m506-players-by-presence-not-tool.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note: "#406 段 2。分母の誤り（選択画面〔ハブ〕だけに居る人が数えられ、チェックインを開いている全員が出しても開かない。判断 10）。匿名の漏れではなく、自動で開く判断が狂う実害を固定する。",
  },
  {
    id: 507,
    label: "名簿の変化で自動公開を測り直さない",
    patch: "m507-roster-change-skips-auto-reveal.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note: "#406 段 2。最後のまだの人がタブを閉じても、残った全員が出していながら開かない（Review Focus 3）。",
  },
  {
    id: 508,
    label: "合成ルートで名簿の変化をチェックインへ渡さない",
    patch: "m508-roster-hook-unwired.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.checkin.test.ts"],
    note: "#406 段 2。ハンドラの試験は rosterChanged を直に呼ぶので緑のまま。実 WS で、まだの人が閉じても開かないことを見る（Review Focus 3）。",
  },
  {
    id: 509,
    label: "チェックインの接続の受け口がハブの層へ渡す",
    patch: "m509-hub-message-reaches-checkin.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/ws-adapter-tool-query.test.ts", "test/live-ws.checkin.test.ts"],
    note: "#406 段 2。?tool=checkin の振り分けを崩す。チェックインの接続の札の操作がハブの層で拒まれる。",
  },
  {
    id: 510,
    label: "ルーム破棄でチェックインの状態を消さない",
    patch: "m510-destroy-keeps-checkin.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/destroy-room.test.ts"],
    note: "#406 段 2。破棄したルームのコードを引き継いだ別のルームに、古い回の札が残る。",
  },
  {
    id: 511,
    label: "お題の宛先からチェックインの接続を外す",
    patch: "m511-topic-excludes-checkin.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.checkin.test.ts"],
    note: "#406 段 2。チェックインを開いている人に、お題の掲げ直しも取り下げも届かなくなる。",
  },
  {
    id: 512,
    label: "チェックインの接続の受理で onConnect を通さない",
    patch: "m512-checkin-skips-on-connect.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/live-ws.checkin.test.ts"],
    note: "#406 段 2。poker の早期 return に足す。レート制限の鍵が接続 ID に落ち、room.join の総当たりが接続を張り直すだけで枠を回避できる。",
  },
  {
    id: 519,
    label: "公開の仕方を変える操作で回の番号を見ない",
    patch: "m519-stale-seq-sets-visibility.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 段 1。古い回の「名前つきにする」が既定が匿名の新しい回に当たり、匿名のつもりで出す札が名前つきで開かれる（判断 5・8）。" +
      "帯の予備を統括の判断で使った（匿名の保護に直結する）。",
  },
  {
    id: 520,
    label: "開いた回の prune が札を落とす",
    patch: "m520-revealed-prune-drops-cards.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts", "tests/projection.test.ts", "tests/projection-invariant.test.ts"],
    note:
      "#406 最終レビューの修正。匿名で開いた後に誰かが退出すると、前後 2 枚のフレームの山の差で抜けた人の札が分かる。" +
      "同期サーバーの試験（checkin-handlers.test.ts の〈m520〉）も赤になるが、宣言はパッケージ 1 つに絞る。帯の予備を統括の判断で使った。",
  },
  {
    id: 521,
    label: "公開の仕方を変えても回の番号を進めない",
    patch: "m521-visibility-change-keeps-seq.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 PR の自動レビューの修正。匿名の画面で押した札が、先に届いた「名前つき」の後の回に受理され、名前が付いて開かれる（判断 5・設計 §6）。" +
      "同期サーバーの試験（checkin-handlers.test.ts の〈m521〉）も赤になるが、宣言はパッケージ 1 つに絞る。帯を 521 まで広げた（統括の判断）。",
  },
  {
    id: 522,
    label: "やり方を選ぶ・引く操作で置き換える回の番号を見ない",
    patch: "m522-method-ignores-replaced-seq.patch",
    pkg: "packages/checkin-core",
    tests: ["tests/checkin.test.ts"],
    note:
      "#406 PR の自動レビューの修正。ほぼ同時の「ランダム」2 回や開いたままの選択画面からの押下が、札の入った新しい回を黙って捨てる。" +
      "同期サーバーの試験（checkin-handlers.test.ts の〈m522〉）も赤になるが、宣言はパッケージ 1 つに絞る。統括の判断で帯の外に 1 本足した。",
  },
  {
    id: 523,
    label: "切断による自動公開に猶予を置かない",
    patch: "m523-disconnect-reveals-without-grace.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/checkin-handlers.test.ts"],
    note:
      "#406 PR のレビューの修正。まだの人が再読み込みで一瞬切れただけで匿名の回が開き、戻った人には山 1 枚で残った人の札が分かる（ADR 0028）。" +
      "統括の判断で帯を 523 まで広げた。",
  },
  {
    id: 513,
    label: "見学中も手札を出す",
    patch: "m513-spectator-sees-hand.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/checkin-room.test.tsx", "tests/hand.test.tsx"],
    note: "#406 段 3。札を出す人に数えない見学者が札を押せ、見学をやめるも出ない（E9・判断 10）。",
  },
  {
    id: 514,
    label: "動きを減らす設定でも札の裏返る遅れを付ける",
    patch: "m514-reduced-motion-still-staggers.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/reveal-view.test.ts"],
    note: "#406 段 3。E12。RevealBoard は reduced で遅れを渡さないので画面の試験は緑のまま。純粋関数 revealSchedule の契約を守る変異。",
  },
  {
    id: 515,
    label: "誰かが出したあとも公開の仕方を押せる",
    patch: "m515-visibility-toggle-enabled-when-locked.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/prompt-panel.test.tsx", "tests/checkin-room.test.tsx"],
    note: "#406 段 3。サーバーは LOCKED で拒むが、押せる見た目が「変えられる」と誤らせる（E7・判断 5）。",
  },
  {
    id: 516,
    label: "同数の最多の山の最初の 1 つだけを強調する",
    patch: "m516-top-pile-first-only.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/reveal-view.test.ts", "tests/reveal-board.test.tsx"],
    note: "#406 段 3。割れているのに札の順で先の 1 つが勝ったように見え、要約も「ずつ」にならない（設計 §5）。",
  },
  {
    id: 517,
    label: "開く動きを席の側で起こす",
    patch: "m517-flip-at-seats.patch",
    pkg: "apps/checkin-web",
    tests: ["tests/reveal-board.test.tsx"],
    note:
      "#406 段 3。席の行を開く動きの板の中に置き、出した席の伏せ札を山と同じ動きで裏返す。匿名で席と札が結びついて見える（Review Focus 1）。" +
      "試験は 3.5 の修正で CheckinRoom に組んだ開いた後を reveal-board.test.tsx の中で描く。",
  },
  {
    id: 518,
    label: "玄関の札の ID が同期サーバーの綴り（checkin）とずれる",
    patch: "m518-hub-tool-id-mismatch-checkin.patch",
    pkg: "apps/landing",
    tests: ["tests/room-choice-layout.test.tsx"],
    note:
      "#406 段 4。m169・m449 と同じ型。札の id を引く在席の表示が、知らない綴りを生のまま「checkin にいます」と出す。型の綴りも合わせて変えるので型検査は通る。",
  },
  {
    id: 540,
    label: "役の判定で A-2-3-4-5 をストレートと認めない",
    patch: "m540-wheel-straight-not-recognized.patch",
    pkg: "packages/poker-core",
    tests: ["tests/hand-rank.test.ts"],
    note: "#403。A を 1 として使うストレートがハイカードに落ちる。",
  },
  {
    id: 541,
    label: "ゲームの投影で、開く前の手を全員へ載せる",
    patch: "m541-table-leaks-hands-before-show.patch",
    pkg: "packages/poker-core",
    tests: ["tests/snapshot-game.test.ts"],
    note: "#403 G-3。配った瞬間に他人の札が手元の JS に届く（隠しモードの手の秘匿が崩れる）。",
  },
  {
    id: 542,
    label: "全員 ☕ の開票 1 回でゲームを始める",
    patch: "m542-coffee-entry-starts-on-first.patch",
    pkg: "packages/poker-core",
    tests: ["tests/coffee-entry.test.ts"],
    note: "#403 E-1・E-2。普段の見積もりで全員がコーヒーブレイクを出しただけで隠しモードに入る。",
  },
  {
    id: 543,
    label: "チェンジを何度でも受ける",
    patch: "m543-exchange-twice.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game.test.ts"],
    note: "#403 G-6。1 回だけの約束が崩れ、引き直しで役を作れる。",
  },
  {
    id: 544,
    label: "ゲームの最中も見積もりの操作を通す",
    patch: "m544-vote-during-game.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/poker/card-game.test.ts"],
    note: "#403 G-11。テーブルに隠れた画面の裏で見積もりが動く。拒むのは振り分けの受けてよい操作の一覧 1 か所（コードレビュー 2026-10-28 の指摘 7 でドメインの 4 か所から寄せた）。",
  },
  {
    id: 545,
    label: "ゲームの最中も見積もりの帯を出す",
    patch: "m545-estimate-dock-during-game.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-card-table.test.tsx"],
    note: "#403 設計 §5.2。押しても table-in-play で拒まれるだけのボタンが並ぶ。",
  },
  {
    id: 546,
    label: "切れた人を猶予なしで待たない",
    patch: "m546-reveal-ignores-away-grace.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game.test.ts"],
    note: "#403 G-8a。一瞬の切断で、その人のチェンジを待たずに全員の手が開く（コードレビュー 2026-10-28 の指摘 2）。",
  },
  {
    id: 547,
    label: "テーブルの操作を返事の前にもう一度送れる",
    patch: "m547-exchange-sent-twice.patch",
    pkg: "apps/poker-web",
    tests: ["tests/card-table.test.tsx"],
    note: "#403。二重送信で正しい操作のあとに「チェンジは 1 回だけです」が出る（コードレビュー 2026-10-28 の指摘 3）。",
  },
  {
    id: 548,
    label: "テーブルの読み込みの失敗を受け止めない",
    patch: "m548-table-load-failure-unhandled.patch",
    pkg: "apps/poker-web",
    tests: ["tests/room-page-card-table-fallback.test.tsx"],
    note: "#403。ルーム画面ごと消え、ゲームを終える操作も失う（コードレビュー 2026-10-28 の指摘 1）。",
  },
  {
    id: 530,
    label: "長い会の境目を 180 分ちょうどから外す（`>=` を `>`）",
    patch: "m530-long-clock-threshold-exclusive.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。設計 §3.1。予定の合計がちょうど 180 分の会が m:ss（180:00）で出る。境目は「以上」と決めた。",
  },
  {
    id: 531,
    label: "時計の書き方を会でなく値の大きさで決める",
    patch: "m531-clock-style-per-value.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。設計 §3.1。同じ会の中で 1 時間をまたぐと桁の形が変わり（59:59 の次が 1:00:00）、長い会でも 1 時間未満の値が m:ss になる。書き方は会ごとに 1 つと決めた。",
  },
  {
    id: 532,
    label: "時計の書き方を延長込みの見込みで決める",
    patch: "m532-clock-style-from-projection.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。設計 §3.1。179 分の会を延長すると途中で h:mm:ss へ切り替わり、進行中に桁の形が変わる。",
  },
  {
    id: 533,
    label: "h:mm:ss の分を 2 桁に詰めない",
    patch: "m533-hms-minutes-not-padded.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-view.test.ts"],
    note: "#455。3 時間 5 分 9 秒が 3:5:09 と出て、桁の位置が揺れる。",
  },
  {
    id: 534,
    label: "結果の一覧が会の書き方を見ず、いつも m:ss で書く",
    patch: "m534-summary-table-always-mss.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/summary-table.test.tsx"],
    note: "#455。長い会の一覧が 180:00 のように m:ss で出て、文字盤の h:mm:ss と食い違う。",
  },
  {
    id: 535,
    label: "長い会の数字に dial-time--hms を付けない",
    patch: "m535-dial-time-without-hms-class.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/dial.test.tsx"],
    note: "#455。設計 §3.3。h:mm:ss の数字（最長 8 字）が m:ss の字の大きさのまま出て、文字盤の読む欄（盤の 56%）に収まらない。jsdom は大きさを測らないので、クラスの有無で見る。",
  },
  {
    id: 536,
    label: "回数 1 の進行表は行が多くても枠を持たない",
    patch: "m536-flat-list-never-scrolls.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#455。定義の上限が 40 になり、回数 1 の 40 行が枠なしで縦に伸びて文字盤を押し下げる。20 行を超えたら枠を持つ。",
  },
  {
    id: 537,
    label: "回の見出しを枠の有無から導く",
    patch: "m537-grouped-follows-scrolling.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/step-list.test.tsx"],
    note: "#455。回数 1 で 21 行を超えて枠を持つと「1 回」の見出しが出る。見出しは回数 2 以上で 1 回に 2 ステップ以上のときだけ。",
  },
  {
    id: 538,
    label: "ステップを足せる条件を 1 つずらし、41 行目を足せる",
    patch: "m538-add-step-allows-one-over.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/scenario-draft.test.ts", "tests/scenario-builder.test.tsx"],
    note: "#455。組む画面で定義の上限 40 を超えて足せ、送ると `checkDraft` がスキーマで止めて汎用の理由を出す。",
  },
  {
    id: 539,
    label: "開始を押した本人かを見ず、進行中に変わった全員の画面を寄せる",
    patch: "m539-start-arrival-for-everyone.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-room.test.tsx"],
    note: "#455。他の参加者が開始した画面（位相が進行中に変わっただけ）までページの先頭へ戻し、読んでいる途中の画面が勝手に動く。",
  },
  {
    id: 549,
    label: "切断の猶予の締切が過ぎても予約を返す",
    patch: "m549-away-deadline-includes-past.patch",
    pkg: "packages/poker-core",
    tests: ["tests/card-game.test.ts"],
    note: "#403 G-8a。残り 0 の予約がその場で発火し続け、同期サーバーがスタックの溢れで落ちる（コードレビュー 2026-10-29 の Critical）。sync の `test/poker/card-game-grace.test.ts` も本物の Scheduler で同じ場面を見る。",
  },
  {
    id: 550,
    label: "送った後の封鎖を、エラーと接続の切り替わりで解かない",
    patch: "m550-lock-kept-after-error.patch",
    pkg: "apps/poker-web",
    tests: ["tests/card-table.test.tsx"],
    note: "#403。拒まれた・失われた操作のあとも押せないまま残り、ゲームが止まる（コードレビュー 2026-10-29）。",
  },
  {
    id: 560,
    label: "束の中で先に足した名前と比べない",
    patch: "m560-batch-checks-only-existing.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。`addGuests` が同名の相手を呼ぶ前のゲストだけにし、束の中の表記違いの同じ名前（alice と ALICE）が 2 人とも入る。",
  },
  {
    id: 561,
    label: "同名が 1 人でもいれば束の全員を飛ばす",
    patch: "m561-batch-rejects-on-conflict.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。同名だけを飛ばして残りを足す決まりを、1 人でも同名がいれば何も足さない形に変える。いつものメンツの大半が在室していると誰も入らない。",
  },
  {
    id: 562,
    label: "束の同名の判定を在室の参加者だけと比べる",
    patch: "m562-batch-compares-present-only.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。比べる相手は名簿の全参加者（在室を問わない・`addGuest` と同じ）。在室だけにすると、席を外した参加者と同じ名前のゲストが入り、戻ったときに同じ名前が 2 人になる。",
  },
  {
    id: 563,
    label: "上限で入らない名前を skipped に数える",
    patch: "m563-batch-overflow-counted-as-skipped.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。ゲストの上限で入らなかった名前を「同名で飛ばした」と数え、画面の知らせが「もういる」と誤る。`planBatch` が同じ関数を呼ぶので apps/roulette-web/tests/regulars-view.test.ts でも赤になる（宣言の pkg は 1 つなので tests は中核の試験だけ）。",
  },
  {
    id: 564,
    label: "addMany の境界で束の大きさを縛らない",
    patch: "m564-batch-schema-unbounded.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/schemas.test.ts"],
    note: "#458。`v.maxLength(MAX_GUESTS)` を外すと、名前の規約を当てる前に巨大な配列がサーバーへ通る。",
  },
  {
    id: 565,
    label: "1 回で決めるときの主ボタンが入る人の上限を見ない",
    patch: "m565-spin-allows-over-wheel.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/roulette-view.test.ts"],
    note: "#458。いつものメンツを入れて入る人が 25 人以上になっても回すボタンが押せ、サーバーが拒む（円盤は 24 席まで）。",
  },
  {
    id: 566,
    label: "順番に回す回の途中も入る人の総数で上限を見る",
    patch: "m566-order-blocks-mid-round.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/turn-order-view.test.ts"],
    note: "#458。回の途中は「まだの人」で見る。総数で見ると、途中で人が増えて総数が 25 人以上になっただけで、まだの人が 24 人以下でも回の続きを押せない。",
  },
  {
    id: 567,
    label: "読めない保存のときも空として書き込む",
    patch: "m567-regulars-overwrites-unreadable.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-storage.test.ts"],
    note: "#458。設計 §5。壊れた JSON・知らない版の保存を空とみなして上書きし、新しい版の画面が書いた組を消す。",
  },
  {
    id: 568,
    label: "書き戻しで合わない項目を捨てる",
    patch: "m568-regulars-drops-invalid-items.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-storage.test.ts"],
    note: "#458。設計 §5。今の版で読めない項目を書き戻しで落とし、別の版の画面が持つ組を消す。",
  },
  {
    id: 569,
    label: "名前の列の重複を文字列の完全一致でだけ畳む",
    patch: "m569-regulars-parse-keeps-duplicates.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-storage.test.ts"],
    note: "#458。`foldMembers` が `conflictsWithExisting` を使わず、NFKC の後に大小だけが違う同じ名前を 2 人として残す（参加の重複拒否と食い違う）。`parseMemberLines` と `saveGroup` の両方を通る。",
  },
  {
    id: 570,
    label: "同期サーバーが束の名前に表示名の規約を当てない",
    patch: "m570-sync-batch-skips-name-rule.patch",
    pkg: "apps/tasuki-sync",
    tests: ["test/roulette-handlers.test.ts"],
    note: "#458。`roulette.guest.addMany` が `applyDisplayNameRule` を通さず生の名前を足す。制御文字や見えない名前が円盤に入り、正規化しないので同名の判定もすり抜ける。",
  },
  {
    id: 571,
    label: "入れた後に札へフォーカスを戻さない",
    patch: "m571-insert-focus-lost.patch",
    pkg: "apps/roulette-web",
    tests: ["tests/regulars-section.test.tsx"],
    note: "#458。入れると usedAt が変わって札が先頭へ移り、要素が付け替わってフォーカスが body へ落ちる。キーボードで続けて操作できない。",
  },
  {
    id: 572,
    label: "上限を足す前の件数で比べる",
    patch: "m572-batch-cap-compares-before-batch.patch",
    pkg: "packages/roulette-core",
    tests: ["tests/roulette-guest-batch.test.ts"],
    note: "#458。設計 §8。`addGuests` が上限を `state.guests.length`（束を足す前）で比べ、ゲスト 20 人に 8 人を渡すと 28 人入る。",
  },
  {
    id: 605,
    label: "届かない帯も status で出す",
    patch: "m605-banner-unreachable-is-status.patch",
    pkg: "packages/web-kit",
    tests: ["tests/connection-banner.test.tsx"],
    note: "#471。`ConnectionBanner` が届かないでも `role=\"status\"` で出し、割り込みで読まれるべき「繋がらない」が静かな更新に埋もれる。",
  },
  {
    id: 606,
    label: "同期できていないに再接続中の文を当てる",
    patch: "m606-notice-stale-says-reconnecting.patch",
    pkg: "packages/web-kit",
    tests: ["tests/connection-banner.test.tsx"],
    note: "#471。`connectionNotice('stale')` が再接続中の文を返し、画面が古いままなのに待てば戻ると伝える。文は手で書いた文字列と比べる。",
  },
  {
    id: 607,
    label: "agenda の帯へ notice を渡さない",
    patch: "m607-agenda-banner-not-wired.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-room.test.tsx"],
    note: "#471。進行中の画面の `ConnectionBanner` へ同期フックの `notice` を渡さず、切断しても告知が出ない（寄せる前の agenda の欠陥そのもの）。",
  },
  {
    id: 608,
    label: "agenda の入室前の画面に帯を描かない",
    patch: "m608-agenda-joining-without-banner.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/agenda-room.test.tsx"],
    note: "#471（#472 で部品へ寄せたのでパッチを作り直し）。入室前の画面（見出しだけ）で帯を渡さず、同期サーバーに繋がらないまま理由が伝わらない。",
  },
  {
    id: 609,
    label: "映している間も帯を映す表示の外に描く",
    patch: "m609-banner-outside-projection.patch",
    pkg: "apps/agenda-web",
    tests: ["tests/projection-view.test.tsx"],
    note: "#471 レビュー。映している間も告知の帯を映す表示の外（手前）に描き、fixed・全面の映す表示に覆われて切断が伝わらない。",
  },
  {
    id: 610,
    label: "参加中の画面で帯の位置の指定を無視する",
    patch: "m610-joining-banner-placement-ignored.patch",
    pkg: "packages/web-kit",
    tests: ["tests/room-gate.test.tsx"],
    note: "#472。`RoomJoiningView` が帯の位置の指定を無視して常に main の中へも描く。main の前に置くアプリ（roulette・topic）で帯が 2 重に出る。",
  },
  {
    id: 611,
    label: "ルームが無い画面の見出しを h1 にしない",
    patch: "m611-gone-heading-not-h1.patch",
    pkg: "packages/web-kit",
    tests: ["tests/room-gate.test.tsx"],
    note: "#472。`RoomGoneView` の見出しが h2 になり、ページの見出しの階層が壊れる（読み上げの見出し一覧に出ない）。",
  },
  {
    id: 612,
    label: "玄関への送り返しで理由つきを後回しにする",
    patch: "m612-hub-redirect-drops-departure.patch",
    pkg: "packages/web-kit",
    tests: ["tests/use-hub-redirect.test.tsx"],
    note: "#472。`useHubRedirect` が玄関が要る判定を理由つきの判定より先に見て、外された人に理由が運ばれない（玄関が告知を出せない・#290）。",
  },
  {
    id: 613,
    label: "動きを減らす設定を最初の描画で読まない",
    patch: "m613-reduced-motion-initial-ignored.patch",
    pkg: "packages/web-kit",
    tests: ["tests/use-prefers-reduced-motion.test.tsx"],
    note: "#472。`usePrefersReducedMotion` の初期値が常に false で、動きを減らす設定の人に、変化が来るまで回転が見える。",
  },
  {
    id: 614,
    label: "読み込み中の一言から status の役割を外す",
    patch: "m614-loading-view-without-status-role.patch",
    pkg: "packages/web-kit",
    tests: ["tests/room-gate.test.tsx"],
    note: "#472。`LoadingView` の一言が `role=\"status\"` を持たず、読み上げに「読み込んでいます」が伝わらない。",
  },
  {
    id: 615,
    label: "poker の告知で everConnected を固定する",
    patch: "m615-poker-notice-ever-connected-fixed.patch",
    pkg: "apps/poker-web",
    tests: ["tests/connection-banner-wiring.test.tsx"],
    note: "#471。poker の `notice` が `everConnected: true` 固定で、一度も繋がらないのに「再接続中」と出し、繋がらないことが伝わらない。",
  },
  {
    id: 616,
    label: "poker の告知で failedAttempts を固定する",
    patch: "m616-poker-notice-failed-attempts-zero.patch",
    pkg: "apps/poker-web",
    tests: ["tests/connection-banner-wiring.test.tsx"],
    note: "#471。poker の `notice` が `failedAttempts: 0` 固定で、失敗が続いても「繋がらない」へ移らない。",
  },
];
