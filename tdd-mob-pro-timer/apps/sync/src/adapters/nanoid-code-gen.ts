/**
 * NanoidCodeGen — nanoid を使ったルームコード生成
 * T032: FR-011
 */

import { nanoid, customAlphabet } from "nanoid";
import type { RoomCodeGen } from "../ports/code-gen.js";

/** ルームコード用のアルファベット（読みやすい文字のみ） */
const roomCodeAlphabet = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);

export class NanoidCodeGen implements RoomCodeGen {
  generate(): string {
    return roomCodeAlphabet();
  }

  generateParticipantId(): string {
    return `p_${nanoid(16)}`;
  }

  generateResumeToken(): string {
    return `rt_${nanoid(32)}`;
  }
}
