/**
 * NanoidCodeGen — nanoid を使ったルームコード生成
 * T032: FR-011
 */

import { nanoid, customAlphabet } from "nanoid";
import type { RoomCodeGen } from "../ports/code-gen.js";

/** ルームコード用のアルファベット（読みやすい文字のみ） */
const roomCodeAlphabet = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);
/**
 * ルーム名に付ける接尾辞（推測困難さ・衝突回避用・小文字英数）。
 *
 * **桁数はエントロピーの下限から決まる**（#144・ADR-0011 決定4）。下限は
 * 「想定される総当たり速度で全探索に要する時間が 1 年以上」であり、4 文字では
 * 単一 IP の持続レートでも 12.1 日で足りなかった。8 文字は分散攻撃（#103 設計正本
 * §3.4 が置く 1,000 回/秒）に対しても目標を満たす。**探索空間と所要時間の正本は
 * #103 設計正本 §3.3・§3.4** で、ここには転記しない。
 */
const shortSuffix = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 8);

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
