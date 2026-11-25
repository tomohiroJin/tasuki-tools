/**
 * 交代のイベントを組む（#660）。decide の SWITCH と `advanceDriver`（時間切れ・繰り上げ）が共有する。
 *
 * 交代先は {@link nextDriverIndex} が決める（輪の順でもランダム交代でも同じ入口）。snapshot の予告も同じ関数を
 * 呼ぶので、ここが返す `nextIndex` は予告した人の席になる。
 */

import type { Aggregate } from "./aggregate.js";
import { nextDriverIndex, randomRotationAfterSwitch } from "./aggregate.js";
import type { DomainEvent } from "./events.js";

/**
 * @param ineligible 交代先にしない席の添字（undefined = 全員適格）
 * @param randomOrder ランダム交代の引く順を作り直す順列（席の添字）。順列かどうかは呼び出し側が確かめる。
 *   順列でなければ（省略を含む）引く順は今のまま
 */
export function driverSwitchedEvent(
  session: Aggregate["session"],
  ineligible: ReadonlySet<number> | undefined,
  now: number,
  randomOrder: readonly number[] | undefined,
): Extract<DomainEvent, { type: "DriverSwitched" }> {
  const nextIndex = nextDriverIndex(session, session.currentIndex, ineligible);
  // 運転者が変わらない交代（ほかに適格な人が居ない）では袋を進めない
  const randomRotation = nextIndex === session.currentIndex ? null : randomRotationAfterSwitch(session, nextIndex, randomOrder);
  return { type: "DriverSwitched", nextIndex, ...(randomRotation !== null && { randomRotation }), now };
}
