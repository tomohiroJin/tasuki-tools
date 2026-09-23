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

export {
  TopicSchema,
  TopicStateSchema,
  TopicFrameSchema,
  TopicCommandSchema,
  TOPIC_ERROR_CODES,
  TopicErrorCodeSchema,
  TopicErrorFrameSchema,
} from "./schemas.js";
export type { TopicCommand, TopicErrorCode } from "./schemas.js";

export { topicErrorMessageFor } from "./error-messages.js";

export { validateTopicDraft } from "./validate.js";
export type { TopicDraft, TopicDraftError } from "./validate.js";

export { TOPIC_BANK } from "./topic-bank.js";
export type { TopicBankEntry } from "./topic-bank.js";

export { pickTopicFallback } from "./fallback.js";

export { buildTopicPrompt } from "./prompt.js";
