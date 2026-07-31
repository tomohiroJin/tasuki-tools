/**
 * リジューム識別情報のセッション保存（Issue #24）
 *
 * WS の自動再接続後に、利用者の操作なしで `room.join`（resumeToken 付き）を再送するため、
 * 自分の参加者情報を保持する。
 *
 * **保存先は sessionStorage（localStorage ではない）。**
 * resumeToken はルーム限定・短命でサーバー再起動でも失効するため、タブを跨いだ永続化には
 * 意味がなく、むしろ「別タブで開いた同名参加者が誤って乗っ取る」リスクを生む。
 * 再接続は同一タブ内で起きる事象なので sessionStorage が要件に合致する
 * （docs/plans/resume-token-wiring/spec.md 非機能要件を参照）。
 */

const RESUME_IDENTITY_KEY = "tdd-mob:resume-identity";

/** 自分の参加者を再接続時に特定するための組。displayName は room.join の再送に必要
 *  （サーバー側スキーマで必須フィールドのため）。 */
export interface ResumeIdentity {
  code: string;
  participantId: string;
  resumeToken: string;
  displayName: string;
}

/** リジューム識別情報を sessionStorage に保存する。 */
export function saveResumeIdentity(identity: ResumeIdentity): void {
  sessionStorage.setItem(RESUME_IDENTITY_KEY, JSON.stringify(identity));
}

/** 保存済みのリジューム識別情報を返す。未保存・破損 JSON なら null（防御的）。 */
export function loadResumeIdentity(): ResumeIdentity | null {
  const raw = sessionStorage.getItem(RESUME_IDENTITY_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as ResumeIdentity;
  } catch {
    return null;
  }
}

/** リジューム識別情報を破棄する（明示的な退出・セッション喪失時に呼ぶ）。 */
export function clearResumeIdentity(): void {
  sessionStorage.removeItem(RESUME_IDENTITY_KEY);
}
