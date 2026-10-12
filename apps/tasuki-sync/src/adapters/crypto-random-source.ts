/**
 * `node:crypto` の乱数源（#94 spec R4）。`randomInt` は剰余の偏りが無い。
 */
import { randomInt } from "node:crypto";
import { SETTLE_MAX, SETTLE_MIN } from "@tasuki/roulette-core";
import type { RandomSource } from "../ports/random-source.js";

/** `settle` の粒度。0 以上 1 以下の一様な値を 100 万分の 1 刻みで作る。 */
const SETTLE_RESOLUTION = 1_000_000;

export function createCryptoRandomSource(): RandomSource {
  return {
    randomInt: (n) => randomInt(n),
    randomSettle: () => SETTLE_MIN + (randomInt(SETTLE_RESOLUTION + 1) / SETTLE_RESOLUTION) * (SETTLE_MAX - SETTLE_MIN),
  };
}
