/**
 * 端末に置く同一性（#95 D12）。**3 つの画面が同じ鍵を読み書きする。**
 *
 * ## なぜ共有するのか（#95 S5b）
 *
 * S5a の時点で、同じ綴り（`tasuki:resume:<ルームコード>`）の読み書きが
 * `apps/landing` と `apps/timer-web` に 1 つずつあった。S5b で poker がハブ経由に
 * なると**同じものを 3 つ目に書く**ことになり、しかも 3 つが一致していなければ
 * 「選択画面で名乗った人が、ツールでは別人として扱われる」。
 * 写しを増やす前に、規約ごとここへ寄せた（原則 X の下限は利用者 2 つ）。
 *
 * ## 2 つに分ける
 *
 * - **復帰の組**（`participantId` / `resumeToken` / 表示名）は**ルームコード別**
 * - **既定の表示名**は**ルーム非依存**。次に別のルームへ入るときの初期値に使う（D12 の後半）
 *
 * ## 保存値を信じない
 *
 * `localStorage` は誰でも書き換えられる。**型注釈ではなく形で検める**（原則 IV）。
 * 壊れた値はその鍵ごと捨てる —— 残すと、毎回同じ壊れた値で参加に失敗し続ける。
 *
 * ## 秘密ではない
 *
 * `resumeToken` は**そのルーム限定・短命**（サーバー再起動で失効する）。同じ判断で
 * poker は公開以来この形で動いており、S4b で timer も、S5b で 3 つとも揃えた。
 *
 * ## 保管庫そのものが使えないことがある（#284）
 *
 * `localStorage` は**「必ずある」ものではない**。cookie を全面禁止した Chrome では
 * **読むだけで** `SecurityError` が飛び、容量超過では書き込みが投げる。ここが投げると、
 * 呼び手（玄関は描画の初期化子でこれを読む）が巻き添えで落ち、**画面が真っ白になる**。
 * **使えない保管庫は「何も保存されていない」と同じに扱う** —— 端末に覚えられない
 * だけで、名乗って参加すること自体はできる。
 */

/** 復帰の組の鍵。**ルームコードごとに 1 組**。 */
const RESUME_PREFIX = "tasuki:resume:";
/** 既定の表示名の鍵。**ルームコードを含まない**（D12 の後半）。 */
const DISPLAY_NAME_KEY = "tasuki:display-name";

const resumeKeyOf = (code: string): string => `${RESUME_PREFIX}${code}`;

/**
 * 保管庫から読む。**使えない保管庫は「未保存」と同じ**（#284）。
 *
 * `localStorage` の取得そのものが投げる環境があるので、参照ごと try の中へ入れる。
 */
function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 保管庫へ書く。**書けなくても諦めるだけ**（次の訪問で覚えていないだけである）。 */
function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 使えない保管庫（cookie 全面禁止・容量超過）。覚えないまま進む
  }
}

/** 保管庫から消す。**消せなくても諦めるだけ。** */
function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 同上
  }
}

/**
 * 自分の参加者を復帰時に特定するための組。
 *
 * `displayName` を持つのは、`room.join` の再送に表示名が要るためである
 * （サーバー側スキーマで必須）。
 */
export interface ResumeIdentity {
  code: string;
  participantId: string;
  resumeToken: string;
  displayName: string;
}

/** 復帰の組を、そのルームコードの鍵で保存する。 */
export function saveResumeIdentity(identity: ResumeIdentity): void {
  writeItem(resumeKeyOf(identity.code), JSON.stringify(identity));
}

/** そのルームの復帰の組。未保存・破損・項目欠け・鍵と中身の食い違いなら null。 */
export function loadResumeIdentity(code: string): ResumeIdentity | null {
  const raw = readItem(resumeKeyOf(code));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isResumeIdentity(parsed) && parsed.code === code) return parsed;
  } catch {
    // 壊れた JSON は下で捨てる
  }
  removeItem(resumeKeyOf(code));
  return null;
}

/** そのルームの復帰の組を破棄する（明示的な退出・ルーム消滅時に呼ぶ）。 */
export function clearResumeIdentity(code: string): void {
  removeItem(resumeKeyOf(code));
}

/**
 * 保存された値が復帰の組の形をしているか。
 *
 * **保存は誰でも書き換えられる**ので、型注釈だけを信じない（境界の検証・原則 IV）。
 * 鍵と中身のルームコードが食い違う値も捨てる —— その値で join すると、別のルームへ
 * 入ろうとして黙って失敗する。
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

/** 次に名乗るときの初期値。**空白だけの名前は残さない**（次のフォームが空白で埋まる）。 */
export function saveDefaultDisplayName(name: string): void {
  const trimmed = name.trim();
  if (trimmed === "") {
    removeItem(DISPLAY_NAME_KEY);
    return;
  }
  writeItem(DISPLAY_NAME_KEY, trimmed);
}

/** 保存済みの既定の表示名（無ければ空文字。フォームの初期値にそのまま使える）。 */
export function loadDefaultDisplayName(): string {
  return readItem(DISPLAY_NAME_KEY) ?? "";
}
