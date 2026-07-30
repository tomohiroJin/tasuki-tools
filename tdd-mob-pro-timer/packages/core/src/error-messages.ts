/**
 * ドメインエラーコード → 利用者向け文言の一元管理（T064・FR-105）。
 *
 * **正本はここ。** 元は `apps/web/src/App.tsx` にだけ定義されていた
 * `ERROR_MESSAGES`（クライアントが実際に画面へ表示している文言）を、
 * 1文字も変えずにそのまま移したもの。
 *
 * 調査で判明した事実（詳細は docs/plans/codebase-refactoring/plan.md 変更5）:
 * サーバー（apps/sync）が WebSocket で送る `message` は画面に一度も表示されていない。
 * `apps/web/src/sync/dispatch.ts` は `cb.onError?.(msg.code, msg.message)` と渡しているが、
 * `apps/web/src/App.tsx` の `onError: (code) => ...` は第2引数（message）を受け取らずに
 * 捨てている。画面表示は常にこの表を `code` だけで引く `friendlyError(code)` が行う。
 *
 * したがって、このテーブルこそが「利用者に見える文言」の唯一の正本である。
 * サーバー側で同じコードに複数の文言リテラルが独立に実装されていた箇所
 * （LAST_MANAGER / CANNOT_CHANGE_HOST / PARTICIPANT_NOT_FOUND / PARTICIPANT_OFFLINE /
 * RATE_LIMITED の5種）は、画面表示上は元々この表の1文言にしか見えていなかったため、
 * ここへ寄せる（T066）。
 */
export const ERROR_MESSAGES: Record<string, string> = {
  BelowMinMembers: "最後のドライバーは外れられません。",
  DuplicateName: "その名前はすでに使われています。",
  EmptyName: "名前を入力してください。",
  MemberLimitExceeded: "メンバーが上限に達しています。",
  InvalidInterval: "その交代間隔は選べません。",
  UNAUTHORIZED: "この操作の権限がありません。",
  RATE_LIMITED: "試行が多すぎます。しばらく待ってから再試行してください。",
  // ホスト移譲（R2-3）の失敗理由を利用者向けの日本語にする。
  // ⚠ 以下 2 件（PARTICIPANT_OFFLINE / CANNOT_CHANGE_HOST）は Issue #29 で
  // 操作ごとの新コード（DRIVER_ASSIGN_OFFLINE / HOST_TRANSFER_OFFLINE /
  // CANNOT_CHANGE_HOST_ROLE 等）へ細分化された旧コードで、`apps/sync/src` の
  // どの拒否箇所からももう返らない（`SYNC_ERROR_CODES` の語彙からも外してある）。
  // それでも文言はここに残す。理由は、配備前から開かれたままのタブが
  // 旧サーバー（この細分化より前のバージョン）の応答としてこれらのコードを
  // 受け取り得るためである（FR-137）。文言を消すと、その画面の表示は
  // `displayMessageFor` の既定文言（「操作を完了できませんでした。」）へ
  // 退化してしまう（SC-047）。
  // 語彙からは外れているのに文言だけ残るのは矛盾ではない。
  // `apps/sync/test/error-code-coverage.test.ts` の「列挙されたコードは、
  // すべてソースに実在する」検査が、SYNC_ERROR_CODES に「もう返らないコード」を
  // 残すことを許さない一方、この ERROR_MESSAGES というテーブルにはその制約が
  // 無いためである（語彙＝サーバーが現在返し得るコードの集合、文言テーブル＝
  // 過去に返していたコードも含めて画面表示を決める場所、という役割の違い）。
  // 同じ理由で残っている前例として下の REMOVED_BY_HOST（旧サーバー互換のための
  // クライアント専用受理コード）も参照のこと。
  PARTICIPANT_OFFLINE: "オフラインの相手にはホストを移譲できません。",
  CANNOT_CHANGE_HOST: "自分自身にはホストを移譲できません。",
  PARTICIPANT_NOT_FOUND: "対象の参加者が見つかりません。",
  // ─── ルームの入退室 ───
  // 節見出しの分類は `packages/core/src/errors.ts` の `SYNC_ERROR_CODES` と
  // そろえてある（T120）。同じ内訳を2箇所へ別々の言葉で書くと、片方だけ直して
  // 食い違う事故の元になるため、分類名はそちらの節見出しをそのまま踏襲する。
  // 任意ルームパスフレーズ（R4-2）の join 失敗理由。
  PASSPHRASE_REQUIRED: "このルームはパスフレーズが必要です。",
  PASSPHRASE_MISMATCH: "パスフレーズが一致しません。",
  // 自己退出（Issue #32）。遷移先の入口画面が既に「名前を入れてルームを作る」導線を
  // 示しているため、文言でそれを繰り返さず1文に留める。他者に外されたわけではないので
  // 「〜させられました」という表現は使わない。
  LEFT_ROOM: "ルームから抜けました。",
  // 他者に退出させられた（Issue #22・FR-075）。元は apps/web/src/App.tsx に直書きされていた
  // 文言を1文字も変えずにここへ移した（FR-105: 文言の定義箇所は1つ）。
  // REMOVED_FROM_ROOM と REMOVED_BY_HOST の2つのキーに同じ文言を持たせるのは、
  // REMOVED_BY_HOST が旧サーバー互換のためのコードだからである。web と sync は
  // 同時デプロイだが、デプロイ前から開いたままのタブが旧サーバーの応答
  // （REMOVED_BY_HOST）を受け取りうるため、両方を受理し続ける必要がある。
  REMOVED_FROM_ROOM: "ルームから退出しました。再参加するには名前を入力してください。",
  REMOVED_BY_HOST: "ルームから退出しました。再参加するには名前を入力してください。",
  // AI お題生成の解錠（合言葉不一致・未設定サーバ共通）。
  AI_UNLOCK_FAILED: "合言葉が違います。",
  // 「進行できる人が1名以上残る」不変条件（Issue #22・FR-072/073）。
  // 退出と降格の両方から返るため、どちらでも通じる文言にする。
  // ⚠ Issue #29 で LAST_MANAGER_LEAVE / LAST_MANAGER_DEMOTE へ操作ごとに
  // 細分化された旧コード。`apps/sync/src` からはもう返らず、`SYNC_ERROR_CODES`
  // の語彙からも外してある。上の PARTICIPANT_OFFLINE / CANNOT_CHANGE_HOST と
  // 同じ理由（配備前から開かれた画面が旧サーバーの応答を受け取り得るため。
  // FR-137・SC-047）で文言だけ残す。
  LAST_MANAGER: "進行できる人がいなくなるため実行できません。他の人が進行に加わってから操作してください。",
  // ─── 失敗の説明を、実際に行った操作と一致させる（Issue #29） ───
  // 同一のコードが複数の操作から返り、説明がどちらか一方の操作に寄っていた
  // 5 種類を、操作ごとに区別できる新コードへ分ける（plan.md「新旧の対応表」）。
  // 以下の節見出しも `errors.ts` の `SYNC_ERROR_CODES` と同じ分類・同じ順序に
  // そろえてある（T120。誤って NOT_IN_ROTATION だけ指名の節から離れていたのを是正）。
  // ─── 指名（driver.assign） ───
  // driver.assign（指名）でオフラインの対象を拒否したとき。
  DRIVER_ASSIGN_OFFLINE: "オフラインの参加者はドライバーに指名できません。",
  // driver.assign（指名）で対象は実在するが輪（rotation）に居ない（見学者）とき。
  NOT_IN_ROTATION: "見学者はドライバーに指名できません。先にドライバーへ加えてください。",
  // ─── ホストの移譲・役割の変更 ───
  // host.transfer（ホスト移譲）でオフラインの対象を拒否したとき。
  HOST_TRANSFER_OFFLINE: "オフラインの相手にはホストを移譲できません。",
  // role.set でホストを対象にしたとき（役割の変更は移譲とは別経路）。
  CANNOT_CHANGE_HOST_ROLE: "ホストの役割は変更できません。先にホストを移譲してください。",
  // host.transfer で現ホストを対象にしたとき。実行者と対象は同一とは限らない
  // （開始後は編集者以上が実行できるため）ため、主語を対象側に置く（FR-138）。
  ALREADY_HOST: "その相手はすでにホストです。",
  // ─── 退出・降格の不変条件 ───
  // participant.remove（退出）で進行できる人が残らなくなるとき。
  LAST_MANAGER_LEAVE: "進行できる人がいなくなるため退出できません。他の人が進行に加わってから操作してください。",
  // role.set（viewer 化）で進行できる人が残らなくなるとき。
  LAST_MANAGER_DEMOTE: "進行できる人がいなくなるため見学者にできません。他の人が進行に加わってから操作してください。",
  // ─── ルームへの参加 ───
  // room.join（参加）の試行が閾値を超えたとき。
  JOIN_RATE_LIMITED: "参加の試行が多すぎます。しばらく待ってから再試行してください。",
};

/** テーブルに該当コードが無い場合の既定文言（元の `friendlyError` の既定値と同一）。 */
export const DEFAULT_ERROR_MESSAGE = "操作を完了できませんでした。";

/**
 * **サーバー（`apps/sync`）が wire の `message` に載せるだけで、画面には表示されないコードの文言。**
 *
 * ⚠ **`ERROR_MESSAGES` と統合してはならない。**
 * `apps/web/src/App.tsx` の `friendlyError(code)` は `ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE`
 * であり、**表に載っているかどうかで画面の文言が変わる**。
 * これらのコードは元々クライアントの表に無く、画面には既定文言
 * （「操作を完了できませんでした。」）が出ていた。統合すると**表示が変わる**（FR-114 違反）。
 *
 * 実際に一度統合してしまい、`NOT_IN_ROOM` の表示が
 * 「操作を完了できませんでした。」→「ルームに参加していません」に変わる退行を作った。
 * **型検査もテストも通る**（テストはコードだけを見ており、文言を見ていない）ため、
 * 実機確認の直前まで気づけなかった。
 *
 * 分けたうえで `apps/sync` からの引き当てを 1 箇所にすれば、FR-105（文言は単一の箇所で定義する）は
 * 満たされる。**要件が求めるのは「定義箇所が 1 つ」であって「テーブルが 1 つ」ではない。**
 */
const SERVER_ONLY_ERROR_MESSAGES: Record<string, string> = {
  NOT_IN_ROOM: "ルームに参加していません",
  DELEGATION_UNAVAILABLE: "お題生成が利用できません",
};

/**
 * **画面に表示する文言を引く。** サーバー専用の文言は決して返さない。
 *
 * 元は `apps/web/src/App.tsx` の `friendlyError()` という**モジュール内の private 関数**だった。
 * そのためテストから触れず、「どのコードのとき利用者に何が見えるか」を検証する手段が無かった。
 * T066 で `NOT_IN_ROOM` の表示が変わる退行を作ったとき、
 * **型検査もテストも通ってしまった原因はここにある**（規則がテストの届かない場所にあった）。
 *
 * 規則をここへ出し、`App.tsx` は必ずこれを経由する（FR-107: 全ての箇所が共通の実装を経由する）。
 */
export function displayMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
}

/**
 * **wire の `message` フィールドに載せる文言を引く。画面表示には使わない。**
 *
 * 画面表示は `displayMessageFor()` を使うこと。こちらはサーバー専用の文言も返すため、
 * 画面で使うと本来 既定文言が出ていたコードにサーバーの文言が出てしまう。
 *
 * `ERROR_MESSAGES[code]` の直接参照は `Record<string, string>` の索引アクセスが
 * `string | undefined` になる（`noUncheckedIndexedAccess`）ため、必ずここを経由させて
 * `string` を保証する。
 */
export function errorMessageFor(code: string): string {
  return ERROR_MESSAGES[code] ?? SERVER_ONLY_ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
}
