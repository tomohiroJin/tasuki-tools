/**
 * 端末に置く同一性（#95 D12）。
 *
 * ## 2 つに分ける
 *
 * - **復帰の組**（`participantId` / `resumeToken` / 表示名）は**ルームコード別**。
 *   鍵は `tasuki:resume:<ルームコード>` で、**`apps/timer-web/src/sync/resume-identity.ts`
 *   と同じ綴り**である（同じ端末・同じルームなら、ハブと timer が同じ人として振る舞う）
 * - **既定の表示名**は**ルーム非依存**。次に別のルームへ入るときの初期値に使う
 *   （D12 の後半。S4b から S5a へ送られた申し送り —— 初期値を使う画面がハブへ移る段だから）
 *
 * ## 保存値を信じない
 *
 * `localStorage` は誰でも書き換えられる。**型注釈ではなく形で検める**（原則 IV）。
 * 壊れた値はその鍵ごと捨てる —— 残すと、毎回同じ壊れた値で参加に失敗し続ける
 * （poker の `storage.ts` と timer の `resume-identity.ts` が同じ扱いをしている）。
 *
 * ## 秘密ではない
 *
 * `resumeToken` は**そのルーム限定・短命**（サーバー再起動で失効する）。同じ判断で
 * poker は公開以来この形で動いており、S4b で timer も揃えた（FR-006 の撤廃）。
 */

/** 復帰の組の鍵。**ルームコードごとに 1 組**。 */
const RESUME_PREFIX = 'tasuki:resume:';
/** 既定の表示名の鍵。**ルームコードを含まない**（D12 の後半）。 */
const DISPLAY_NAME_KEY = 'tasuki:display-name';

const resumeKeyOf = (code: string): string => `${RESUME_PREFIX}${code}`;

export interface ResumeIdentity {
  code: string;
  participantId: string;
  resumeToken: string;
  displayName: string;
}

export function saveResumeIdentity(identity: ResumeIdentity): void {
  localStorage.setItem(resumeKeyOf(identity.code), JSON.stringify(identity));
}

/** そのルームの復帰の組。未保存・破損・項目欠け・鍵と中身の食い違いなら null。 */
export function loadResumeIdentity(code: string): ResumeIdentity | null {
  const raw = localStorage.getItem(resumeKeyOf(code));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isResumeIdentity(parsed) && parsed.code === code) return parsed;
  } catch {
    // 壊れた JSON は下で捨てる
  }
  localStorage.removeItem(resumeKeyOf(code));
  return null;
}

export function clearResumeIdentity(code: string): void {
  localStorage.removeItem(resumeKeyOf(code));
}

function isResumeIdentity(value: unknown): value is ResumeIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['code'] === 'string' &&
    typeof v['participantId'] === 'string' &&
    typeof v['resumeToken'] === 'string' &&
    typeof v['displayName'] === 'string'
  );
}

/** 次に名乗るときの初期値。**空白だけの名前は残さない**（次のフォームが空白で埋まる）。 */
export function saveDefaultDisplayName(name: string): void {
  const trimmed = name.trim();
  if (trimmed === '') {
    localStorage.removeItem(DISPLAY_NAME_KEY);
    return;
  }
  localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
}

/** 保存済みの既定の表示名（無ければ空文字。フォームの初期値にそのまま使える）。 */
export function loadDefaultDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) ?? '';
}
