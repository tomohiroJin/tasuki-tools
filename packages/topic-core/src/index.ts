export { MAX_TOPIC_TITLE, MAX_TOPIC_BODY, MAX_AI_UNLOCK_KEY, LANGUAGES, DIFFICULTIES } from "./limits.js";
export type { Language, Difficulty } from "./limits.js";

export {
  INITIAL_TOPIC_STATE,
  startGeneration,
  settleWithAi,
  settleWithFallback,
  setManualTopic,
  clearTopic,
  unlockAi,
} from "./topic.js";
export type { Topic, TopicSource, TopicState } from "./topic.js";

// `TopicSchema`・`TopicStateSchema`・`TopicErrorCodeSchema` は載せない（#365）。外の製品コードは
// フレーム（`TopicFrameSchema`・`TopicErrorFrameSchema`）を通して使う。
export { TopicFrameSchema, TopicCommandSchema, TOPIC_ERROR_CODES, TopicErrorFrameSchema } from "./schemas.js";
export type { TopicCommand, TopicErrorCode } from "./schemas.js";

export { topicErrorMessageFor } from "./error-messages.js";

export { validateTopicDraft } from "./validate.js";
export type { TopicDraft, TopicDraftError } from "./validate.js";

// 定型バンク（`TOPIC_BANK`）は載せない（#365）。外からは `pickTopicFallback` を通して使う。
export { pickTopicFallback } from "./fallback.js";

export { buildTopicPrompt } from "./prompt.js";
