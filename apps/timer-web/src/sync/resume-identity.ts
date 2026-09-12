/**
 * 復帰の組の保存（Issue #24。保存先は #95 S4b で変わった）。
 *
 * WS の自動再接続後と、参加用 URL を開き直したときに、利用者の操作なしで
 * `room.join`（resumeToken 付き）を送るため、自分の参加者情報を保持する。
 *
 * ## 保存先は `localStorage`・鍵はルームコード別（#95 D12・FR-006 の撤廃）
 *
 * S4a まで `sessionStorage` に 1 組だけ持っていた。**タブを閉じて参加用 URL を
 * 開き直すたびに別人として join し、前の自分が名簿に残る**（参加者は明示的な退出でしか
 * 名簿から消えないため。設計正本 §3.13）。選択画面の参加者一覧が幽霊で埋まるのは
 * 受け入れられないので、復帰の組を端末に持たせることにした。
 *
 * 同一人物の判定は**サーバー発行のトークン**で行う。表示名では照合しない ——
 * 他人が同じ名前を名乗るだけで成り済ませる。鍵をルームコード別に分けているため、
 * 復帰できるのは同じブラウザプロファイルの同じルームだけである。
 *
 * **`apps/poker-web/src/storage.ts` が公開以来採っている形に揃えてある**
 * （`poker:participant:<roomId>`）。壊れた値はその鍵ごと捨てるところも同じで、
 * 参加失敗の再試行ループを防ぐ。
 *
 * ## 旧 `sessionStorage` の値は読まない（移行しない）
 *
 * `resumeToken` はルーム限定・短命で、**サーバー再起動で失効する**（揮発インメモリ）。
 * 移して得られるのは「S4b の配布直前にタブを開いていた人が、配布後も同じタブから
 * 復帰できる」ことだけだが、配布はサーバーの再起動を伴うのでそのトークンは既に死んでいる。
 * 読む経路を残すぶんだけ分岐が増えるので足さない。
 */

/** 鍵の接頭辞。**ルームコードごとに 1 組**を持つ（D12）。 */
const KEY_PREFIX = "tasuki:resume:";

const keyOf = (code: string): string => `${KEY_PREFIX}${code}`;

/** 自分の参加者を再接続時に特定するための組。displayName は room.join の再送に必要
 *  （サーバー側スキーマで必須フィールドのため）。 */
export interface ResumeIdentity {
  code: string;
  participantId: string;
  resumeToken: string;
  displayName: string;
}

/** 復帰の組を、そのルームコードの鍵で保存する。 */
export function saveResumeIdentity(identity: ResumeIdentity): void {
  localStorage.setItem(keyOf(identity.code), JSON.stringify(identity));
}

/**
 * そのルームの復帰の組を返す。未保存・破損・項目欠けなら `null`。
 *
 * **壊れた値はその鍵ごと捨てる。** 残すと、毎回同じ壊れた値を読んで join に失敗する
 * ループになる（poker の `loadIdentity` と同じ扱い）。
 */
export function loadResumeIdentity(code: string): ResumeIdentity | null {
  const raw = localStorage.getItem(keyOf(code));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isResumeIdentity(parsed) && parsed.code === code) return parsed;
  } catch {
    // 壊れた JSON は下で捨てる
  }
  localStorage.removeItem(keyOf(code));
  return null;
}

/**
 * 保存された値が復帰の組の形をしているか。
 *
 * **保存は誰でも書き換えられる**ので、型注釈だけを信じない（境界の検証・原則 IV）。
 * 鍵と中身のルームコードが食い違う値も {@link loadResumeIdentity} が捨てる ——
 * 食い違った値で join すると、別のルームへ入ろうとして黙って失敗する。
 */
function isResumeIdentity(value: unknown): value is ResumeIdentity {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["code"] === "string" &&
    typeof v["participantId"] === "string" &&
    typeof v["resumeToken"] === "string" &&
    typeof v["displayName"] === "string"
  );
}

/** そのルームの復帰の組を破棄する（明示的な退出・セッション喪失時に呼ぶ）。 */
export function clearResumeIdentity(code: string): void {
  localStorage.removeItem(keyOf(code));
}

/**
 * ページ読み込み時に、参加画面を出さずそのまま復帰してよいかを判定する（#76 F-3）。
 *
 * 保存済みの組が URL のルームと一致するなら、それは「同じ人が同じ部屋に戻ってきた」ことに
 * 他ならない。**`localStorage` へ移った S4b 以降は、同じタブの再読込だけでなく
 * タブを閉じて開き直した場合・別タブで開いた場合もここを通る**（R16）。
 *
 * 一致を要求するのは、前のルームの情報が残った状態で別の招待リンクを開いたときに、
 * 勝手に前のルームへ引き戻さないため。**鍵がルーム別になった今も残す** ——
 * 呼び出し側は URL のコードで読むので通常は一致するが、この判定が
 * 「保存値を信じてよい最小条件」（トークンと表示名が揃っている）も兼ねている。
 */
export function shouldResumeOnLoad(
  saved: ResumeIdentity | null,
  codeFromUrl: string | null,
): saved is ResumeIdentity {
  if (saved === null || codeFromUrl === null) return false;
  if (saved.code !== codeFromUrl) return false;
  return saved.resumeToken.length > 0 && saved.displayName.length > 0;
}
