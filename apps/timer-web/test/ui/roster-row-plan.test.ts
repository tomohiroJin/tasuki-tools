/**
 * 名簿の 1 行に出す操作の判断（#595。`RosterPanel.tsx` の行の描画から出した純粋関数）。判断は移す前のまま。
 */
import { describe, expect, it } from "vitest";
import { planRosterRow, type RosterRowInput } from "../../src/ui/roster-row-plan.js";

const base: RosterRowInput = {
  participant: { participantId: "b", presence: "online" },
  currentDriverId: "a",
  myParticipantId: "me",
  rotation: ["a", "b", "c"],
  selfHasExternalToggle: false,
  hasMove: true,
  hasRemove: true,
  hasAssignDriver: true,
};

describe("planRosterRow", () => {
  it("輪の中の位置は rotation の添字で決まり、現ドライバーは識別子で決まる", () => {
    const plan = planRosterRow(base);
    expect(plan.rotationIndex).toBe(1);
    expect(plan.inRotation).toBe(true);
    expect(plan.isCurrentDriver).toBe(false);
    expect(planRosterRow({ ...base, participant: { ...base.participant, participantId: "a" } }).isCurrentDriver).toBe(true);
  });

  it("現ドライバーの識別子が空なら誰も現ドライバーではない", () => {
    const plan = planRosterRow({ ...base, currentDriverId: "", participant: { participantId: "", presence: "online" } });
    expect(plan.isCurrentDriver).toBe(false);
  });

  it("輪に居ない人は見学で、並べ替え・一時離脱・指名は出ない", () => {
    const plan = planRosterRow({ ...base, participant: { participantId: "w", presence: "online" } });
    expect(plan.inRotation).toBe(false);
    expect(plan.rotationIndex).toBe(-1);
    expect(plan.canMove).toBe(false);
    expect(plan.skipToggle).toBeNull();
    expect(plan.canAssign).toBe(false);
  });

  it("rotation が無ければ全員が見学として扱われる", () => {
    const plan = planRosterRow({ ...base, rotation: undefined });
    expect(plan.inRotation).toBe(false);
    expect(plan.canMove).toBe(false);
  });

  it("並べ替えはドライバーが 2 人以上いて onMove があるときだけ", () => {
    expect(planRosterRow(base).canMove).toBe(true);
    expect(planRosterRow({ ...base, hasMove: false }).canMove).toBe(false);
    expect(planRosterRow({ ...base, rotation: ["b"] }).canMove).toBe(false);
  });

  it("先頭の上と末尾の下は押せない", () => {
    const first = planRosterRow({ ...base, participant: { participantId: "a", presence: "online" } });
    expect(first.moveUpDisabled).toBe(true);
    expect(first.moveDownDisabled).toBe(false);
    const last = planRosterRow({ ...base, participant: { participantId: "c", presence: "online" } });
    expect(last.moveUpDisabled).toBe(false);
    expect(last.moveDownDisabled).toBe(true);
  });

  it("退出は自分の行には出さず、onRemove が無ければ出さない", () => {
    expect(planRosterRow(base).canRemove).toBe(true);
    expect(planRosterRow({ ...base, myParticipantId: "b" }).canRemove).toBe(false);
    expect(planRosterRow({ ...base, hasRemove: false }).canRemove).toBe(false);
  });

  it("アイコンの操作の枠は、並べ替えか退出のどちらかがあるときだけ出す", () => {
    expect(planRosterRow(base).showIconActions).toBe(true);
    expect(planRosterRow({ ...base, hasRemove: false }).showIconActions).toBe(true);
    expect(planRosterRow({ ...base, hasMove: false }).showIconActions).toBe(true);
    expect(planRosterRow({ ...base, hasMove: false, hasRemove: false }).showIconActions).toBe(false);
  });

  it("一時離脱と復帰は、離脱中かどうかで切り替わる", () => {
    expect(planRosterRow(base).skipToggle).toBe("skip");
    const skipping = { ...base.participant, driverEligible: false };
    expect(planRosterRow({ ...base, participant: skipping }).skipToggle).toBe("resume");
    expect(planRosterRow({ ...base, participant: skipping }).isSkipping).toBe(true);
  });

  it("自分の行の一時離脱は、外部の自己トグルが無いときだけ出す（他人は常に出す）", () => {
    const mine = { ...base, myParticipantId: "b" };
    expect(planRosterRow(mine).skipToggle).toBe("skip");
    expect(planRosterRow({ ...mine, selfHasExternalToggle: true }).skipToggle).toBeNull();
    expect(planRosterRow({ ...base, selfHasExternalToggle: true }).skipToggle).toBe("skip");
  });

  it("ドライバーへの指名は、現ドライバー以外の輪の人で、onAssignDriver があるときだけ", () => {
    expect(planRosterRow(base).canAssign).toBe(true);
    expect(planRosterRow({ ...base, hasAssignDriver: false }).canAssign).toBe(false);
    const current = planRosterRow({ ...base, participant: { participantId: "a", presence: "online" } });
    expect(current.canAssign).toBe(false);
  });

  it("オフラインの実在の人は指名できず、オフラインの代理は指名できる", () => {
    const offline = { participantId: "b", presence: "offline" as const };
    expect(planRosterRow({ ...base, participant: offline }).canAssign).toBe(false);
    expect(planRosterRow({ ...base, participant: { ...offline, isPlaceholder: true } }).canAssign).toBe(true);
    expect(planRosterRow({ ...base, participant: { ...offline, isPlaceholder: false } }).canAssign).toBe(false);
  });
});
