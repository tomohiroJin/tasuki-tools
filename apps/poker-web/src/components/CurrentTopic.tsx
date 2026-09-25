/**
 * いまのお題（#91・spec §5.5）。**poker は読むだけ**（spec T4）。
 *
 * 本文は畳んでおき、開けるようにする（見積もりの画面を本文で押し下げない）。
 * 見出しの段: h2「お題」→ h3 タイトル → 本文の見出しは h4 から。
 */
import type { Topic } from '@tasuki/topic-core';
import { Markdown } from './Markdown';

export const TOPIC_HEADING = 'お題';
export const TOPIC_BODY_TOGGLE = '説明を見る';

export function CurrentTopic({ topic }: { topic: Topic }) {
  return (
    <section className="topic" aria-labelledby="poker-topic-heading">
      <h2 id="poker-topic-heading">{TOPIC_HEADING}</h2>
      <h3 className="topic-title">{topic.title}</h3>
      {topic.body !== '' && (
        <details className="topic-details">
          <summary>{TOPIC_BODY_TOGGLE}</summary>
          <Markdown source={topic.body} />
        </details>
      )}
    </section>
  );
}
