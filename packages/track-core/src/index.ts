export {
  MAX_LABEL,
  MAX_LABEL_INPUT,
  MAX_POSITION_MS,
  MAX_SEGMENTS,
  MAX_PINNED,
  MAX_CANDIDATES,
  BACK_MINUTES,
  UNDO_WINDOW_MS,
  LONG_RUNNING_NOTICE_MS,
  MIN_SEGMENT_MS,
  MAX_LOOKBACK_MS,
} from "./limits.js";
export type { BackMinutes } from "./limits.js";

export type { SegmentKind, Segment, UndoKind, UndoSlot, TrackState, SegmentView, TrackView } from "./types.js";

export { TRACK_DOMAIN_ERROR_CODES } from "./errors.js";
export type { TrackDomainErrorCode, TrackError } from "./errors.js";

export { hasControlChars, normalizeLabel, isValidLabel } from "./label.js";

export { createTrackState, start, stop, undo, autoStop, dismissOffer, clear, pin, toView } from "./track.js";

export { setSegment, adjustRangeOf, adjustSegment, splitSegment, insertSegment, away, removeSegment } from "./edit.js";
export type { SegmentEdge } from "./edit.js";

export { advanceNow, runningSegmentOf, durationOf, totalsOf, candidatesOf, previousLabelOf, longRunningOf } from "./projection.js";
export type { TotalRow, Totals, Candidate } from "./projection.js";

export { MARKDOWN_TEXT, formatDuration, formatClock, formatDate, escapeLabel, toMarkdown } from "./markdown.js";

export { CSV_COLUMNS, csvField, toCsv, csvFileName } from "./csv.js";

export { TrackCommandSchema, TrackFrameSchema, TrackErrorFrameSchema, TRACK_ERROR_CODES } from "./schemas.js";
export type { TrackCommand, TrackErrorCode } from "./schemas.js";

export { trackErrorMessageFor } from "./error-messages.js";
