// 名前ルール（#95 S4a で `room.ts` から引っ越した。**値も規則も変えていない**）。
//
// **`@tasuki/room-core` の `MAX_DISPLAY_NAME`（40）と食い違うが、S4a では寄せない。**
// 寄せると poker の入力規則が変わり、「振る舞いを変えていない」という S4a の主張が崩れる。
// 統合は入口が 1 つになる S5 の仕事である（設計正本 §7）。
import { err, ok, type Result } from 'neverthrow';

export type RoomError = { code: 'invalid-name' };

/** 名前ルールの単一情報源（プロトコルスキーマ・画面のフォームもこれを参照する） */
export const NAME_MAX_LENGTH = 24;

export function isValidName(raw: string): boolean {
  const name = raw.trim();
  return name.length >= 1 && name.length <= NAME_MAX_LENGTH;
}

/**
 * 名前を検証してトリム済みの値を返す（旧 `room.ts` の private な `validateName` そのもの）。
 *
 * `createRoom` / `joinRoom` を削ったことで呼び出し元がアプリ層へ移ったため、公開している。
 * **判定も戻り値も以前と同一**であり、境界（`protocol.ts` の `NameSchema`）が先に弾くので
 * WS 越しには届かないが、ドメイン検証は `docs/adr/0005` の MUST なので残る。
 */
export function validateName(raw: string): Result<string, RoomError> {
  if (!isValidName(raw)) {
    return err({ code: 'invalid-name' });
  }
  return ok(raw.trim());
}
