/**
 * いまのお題（#91・spec §5.5）。**poker は読むだけ**（spec T4）。
 *
 * 本文は畳んでおき、開けるようにする（見積もりの画面を本文で押し下げない）。
 * 見出しの段: h2「お題」→ h3 タイトル → 本文の見出しは h4 から。
 *
 * **本文だけを象牙の札（topic-web の `.topic-card` と同じ地）に載せる**
 * （#91 PR 3 Task 4・修正 1 回目）。`.md-link`/`.md-code`/`.md-quote` は
 * 象牙地の上で読める色（`--coal`/`--coal-soft`）に写し元（topic-web）で
 * 決めてあり、poker の暗い `.topic`（`--felt-900`）へ直接乗せると読めなく
 * なる（実測: `.md-link` 約 1.03:1）。タイトルと「説明を見る」は暗い地の
 * ままで、既定の文字色（`--ivory`）で読める（実測: 約 13.24:1）。
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
          <div className="topic-body">
            <Markdown source={topic.body} />
          </div>
        </details>
      )}
    </section>
  );
}
