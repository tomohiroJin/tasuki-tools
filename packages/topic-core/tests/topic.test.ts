import { describe, expect, it } from "vitest";
import {
  INITIAL_TOPIC_STATE, clearTopic, setManualTopic, settleWithAi, settleWithFallback,
  startGeneration, unlockAi, type Topic, type TopicState,
} from "../src/index.js";

const AI_TOPIC: Topic = { title: "FizzBuzz", body: "3 の倍数で…", source: "ai" };
const FALLBACK_TOPIC: Topic = { title: "文字列の反転", body: "…", source: "fallback" };
/** 「定型に落ちた」知らせが立っていて、生成中でもある状態(取り下げを見るための出発点) */
const DEGRADED_AND_GENERATING: TopicState = {
  topic: FALLBACK_TOPIC, generating: true, degraded: true, aiUnlocked: true,
};

/**
 * @requirements #91 E1・E3・E7〜E11・E20(spec §5.1 の帳簿の遷移表)
 */
describe("お題の帳簿の遷移", () => {
  it("既定はお題なし・生成していない・縮退していない・未解錠", () => {
    expect(INITIAL_TOPIC_STATE).toEqual({
      topic: null, generating: false, degraded: false, aiUnlocked: false,
    });
  });

  it("作り始めると生成中になり、縮退の知らせを取り下げ、お題は据え置く", () => {
    const s: TopicState = { ...DEGRADED_AND_GENERATING, generating: false };
    expect(startGeneration(s)).toEqual({ ...s, generating: true, degraded: false });
  });

  it("AI のお題で確定すると生成中を降ろし、縮退なしで掲げる", () => {
    expect(settleWithAi(DEGRADED_AND_GENERATING, AI_TOPIC)).toEqual({
      topic: AI_TOPIC, generating: false, degraded: false, aiUnlocked: true,
    });
  });

  it("定型で確定するとき、縮退かどうかは呼び出し側が決める", () => {
    expect(settleWithFallback(DEGRADED_AND_GENERATING, FALLBACK_TOPIC, true)).toEqual({
      topic: FALLBACK_TOPIC, generating: false, degraded: true, aiUnlocked: true,
    });
    expect(settleWithFallback(DEGRADED_AND_GENERATING, FALLBACK_TOPIC, false)).toEqual({
      topic: FALLBACK_TOPIC, generating: false, degraded: false, aiUnlocked: true,
    });
  });

  it("手で掲げると source は manual になり、生成中と縮退を降ろす", () => {
    expect(setManualTopic(DEGRADED_AND_GENERATING, { title: "t", body: "b" })).toEqual({
      topic: { title: "t", body: "b", source: "manual" },
      generating: false, degraded: false, aiUnlocked: true,
    });
  });

  it("下ろすとお題なしになり、生成中と縮退を降ろし、解錠は残す", () => {
    expect(clearTopic(DEGRADED_AND_GENERATING)).toEqual({
      topic: null, generating: false, degraded: false, aiUnlocked: true,
    });
  });

  it("解錠は立つだけで、ほかを変えない", () => {
    expect(unlockAi(INITIAL_TOPIC_STATE)).toEqual({ ...INITIAL_TOPIC_STATE, aiUnlocked: true });
  });
});
