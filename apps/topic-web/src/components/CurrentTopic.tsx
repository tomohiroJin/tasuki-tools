import type { TopicState } from '@tasuki/topic-core';
import { CLEAR_BUTTON, CURRENT_HEADING, EMPTY_TEXT } from '../copy';
import { Markdown } from './Markdown';

interface Props {
  readonly state: TopicState | null;
  readonly notice: string | null;
  readonly enabled: boolean;
  onClear(): void;
}

/**
 * いまのお題。**生成中は全員の画面で `aria-busy` を立てる**（spec §5.4・E10）。
 *
 * 知らせ（`role="status"`）は section の**外**（直前の兄弟）に置く。ARIA 1.2 では
 * `aria-busy` の要素の内容変化は支援技術が busy の間は無視してよい（MAY）ため、
 * section の中に置くと「作っています…」が読み上げられない恐れがある（レビュー指摘）。
 * `aria-busy` 自体は section に残す（既存テストが region の aria-busy を見ている）。
 */
export function CurrentTopic({ state, notice, enabled, onClear }: Props) {
  const topic = state?.topic ?? null;
  return (
    <>
      {notice && (
        <p className="topic-notice" role="status">
          {notice}
        </p>
      )}
      <section className="topic-current" aria-labelledby="topic-current-heading" aria-busy={state?.generating ?? false}>
        <h2 id="topic-current-heading">{CURRENT_HEADING}</h2>
        {topic === null ? (
          <p className="topic-empty">{EMPTY_TEXT}</p>
        ) : (
          <article className="topic-card">
            <h3 className="topic-title">{topic.title}</h3>
            {topic.body !== '' && <Markdown source={topic.body} className="topic-body" />}
          </article>
        )}
        {topic !== null && (
          <button type="button" className="secondary" onClick={onClear} disabled={!enabled}>
            {CLEAR_BUTTON}
          </button>
        )}
      </section>
    </>
  );
}
