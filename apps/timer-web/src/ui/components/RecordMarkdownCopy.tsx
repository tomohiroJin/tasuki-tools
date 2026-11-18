import { useCopyText } from "@tasuki/invite-ui";
import type { CompletionRecord } from "@tasuki/timer-core";
import { formatRecordMarkdown } from "../../records/record-markdown.js";
import "../../styles/record-markdown-copy.css";

const COPY_LABEL = "Markdown をコピー";

interface RecordMarkdownCopyProps {
  record: CompletionRecord;
  recordLabel?: string;
}

export function RecordMarkdownCopy({ record, recordLabel }: RecordMarkdownCopyProps) {
  const markdown = formatRecordMarkdown(record);
  const { copy, state } = useCopyText(markdown, { keepFailure: true });
  const message = state === "done" ? "コピーしました" : state === "failed" ? "コピーできませんでした" : "";

  return (
    <div className="record-markdown-copy">
      <button
        type="button"
        className="ui-button ui-button--secondary"
        aria-label={recordLabel ? `${COPY_LABEL}（${recordLabel}）` : undefined}
        onClick={() => { void copy(); }}
      >
        {COPY_LABEL}
      </button>
      <p className="ui-note record-markdown-copy-status" aria-live="polite">{message}</p>
      {state === "failed" && (
        <textarea
          aria-label="手動コピー用の Markdown"
          className="ui-input record-markdown-copy-text"
          readOnly
          rows={5}
          value={markdown}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
