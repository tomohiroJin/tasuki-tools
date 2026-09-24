import type { TopicState } from '@tasuki/topic-core';
import { CLEAR_BUTTON, CURRENT_HEADING, EMPTY_TEXT } from '../copy';

interface Props {
  readonly state: TopicState | null;
  readonly notice: string | null;
  readonly enabled: boolean;
  onClear(): void;
}

/**
 * いまのお題。**生成中は全員の画面で `aria-busy` を立てる**（spec §5.4・E10）。
 * 知らせは `role="status"`（控えめな読み上げ）で出し、操作の邪魔をしない。
 */
export function CurrentTopic({ state, notice, enabled, onClear }: Props) {
  const topic = state?.topic ?? null;
  return (
    <section className="topic-current" aria-labelledby="topic-current-heading" aria-busy={state?.generating ?? false}>
      <h2 id="topic-current-heading">{CURRENT_HEADING}</h2>
      {notice && (
        <p className="topic-notice" role="status">
          {notice}
        </p>
      )}
      {topic === null ? (
        <p className="topic-empty">{EMPTY_TEXT}</p>
      ) : (
        <article className="topic-card">
          <h3 className="topic-title">{topic.title}</h3>
          {topic.body !== '' && <p className="topic-body">{topic.body}</p>}
        </article>
      )}
      {topic !== null && (
        <button type="button" className="secondary" onClick={onClear} disabled={!enabled}>
          {CLEAR_BUTTON}
        </button>
      )}
    </section>
  );
}
