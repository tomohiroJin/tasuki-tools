/**
 * お題と、その生成の帳簿(#91)。
 *
 * **表現は直接遷移関数である**(spec T12・`docs/adr/0016` 決定 1)。イベントの履歴・再生・
 * 段階適用が要らず、状態は 1 つのお題と生成の帳簿だけだからである。
 *
 * **帳簿の書き手は同期サーバーの `TopicGenerator` と `topic-handlers` だけ**にする。
 * 画面は `generating` / `degraded` を推測してはならない(#283 の教訓。推測の正体は
 * お題の内容差分で、それを落とすことが #283 の目的だった)。
 */
import type { TopicDraft } from "./validate.js";

export type TopicSource = "manual" | "ai" | "fallback";

export interface Topic {
  title: string;
  body: string;
  source: TopicSource;
}

export interface TopicState {
  /** null = お題なし(既定・spec T5) */
  topic: Topic | null;
  /** 生成中(#283 のサーバー権威を引き継ぐ) */
  generating: boolean;
  /** 直近の生成が、AI を求めたのに定型へ落ちた */
  degraded: boolean;
  /** AI 解錠。いったん立ったらルームの寿命の間続く(再施錠の操作は持たない) */
  aiUnlocked: boolean;
}

export const INITIAL_TOPIC_STATE: TopicState = {
  topic: null,
  generating: false,
  degraded: false,
  aiUnlocked: false,
};

/** 作り始めた。**縮退の知らせはここで取り下げる**(新しい依頼は前の結果を語らない)。 */
export function startGeneration(s: TopicState): TopicState {
  return { ...s, generating: true, degraded: false };
}

export function settleWithAi(s: TopicState, topic: Topic): TopicState {
  return { ...s, topic, generating: false, degraded: false };
}

/**
 * 定型で確定する。**縮退かどうかは呼び出し側が決める** —— 同じ定型でも、
 * 利用者が「定型から選ぶ」を押した結果なら縮退ではない。
 */
export function settleWithFallback(s: TopicState, topic: Topic, degraded: boolean): TopicState {
  return { ...s, topic, generating: false, degraded };
}

export function setManualTopic(s: TopicState, draft: TopicDraft): TopicState {
  return { ...s, topic: { ...draft, source: "manual" }, generating: false, degraded: false };
}

export function clearTopic(s: TopicState): TopicState {
  return { ...s, topic: null, generating: false, degraded: false };
}

export function unlockAi(s: TopicState): TopicState {
  return { ...s, aiUnlocked: true };
}
