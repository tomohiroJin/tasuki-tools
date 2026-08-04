/**
 * NanoidCodeGen — nanoid を使ったルームコード生成
 * T032: FR-011
 */

import { nanoid, customAlphabet } from "nanoid";
import type { RoomCodeGen } from "../ports/code-gen.js";

/** ルームコード用のアルファベット（読みやすい文字のみ） */
const roomCodeAlphabet = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);
/** ルーム名に付ける短い接尾辞（推測困難さ・衝突回避用・小文字英数） */
const shortSuffix = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 4);

/** ルーム名を URL 安全な slug にする。Unicode 文字（日本語等）は保持。 */
function slugify(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export class NanoidCodeGen implements RoomCodeGen {
  generate(seed?: string): string {
    const slug = seed ? slugify(seed) : "";
    return slug ? `${slug}-${shortSuffix()}` : roomCodeAlphabet();
  }

  generateParticipantId(): string {
    return `p_${nanoid(16)}`;
  }

  generateResumeToken(): string {
    return `rt_${nanoid(32)}`;
  }
}
