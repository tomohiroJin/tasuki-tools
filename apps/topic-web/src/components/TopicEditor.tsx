import { useId, useState } from 'react';
import { MAX_TOPIC_BODY, MAX_TOPIC_TITLE, type Topic } from '@tasuki/topic-core';
import { BODY_LABEL, REWRITE_BUTTON, SET_BUTTON, TITLE_LABEL, WRITE_HEADING } from '../copy';
import { canSubmitTopic } from '../topic-view';

interface Props {
  readonly current: Topic | null;
  readonly enabled: boolean;
  onSubmit(title: string, body: string): void;
}

/**
 * 手で書いてお題にする（spec §5.4 の「書く」）。
 *
 * **下書きはこの部品だけが持ち、届いたお題で上書きしない。** 書いている途中に別の人がお題を
 * 変えても、入力は消さない。いまのお題を下書きへ写すのは「書き直す」を押したときだけ。
 */
export function TopicEditor({ current, enabled, onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const titleId = useId();
  const bodyId = useId();
  const canSubmit = canSubmitTopic(title, enabled);

  return (
    <section className="topic-panel" aria-labelledby={`${titleId}-heading`}>
      <h2 id={`${titleId}-heading`}>{WRITE_HEADING}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit(title.trim(), body);
          setTitle('');
          setBody('');
        }}
      >
        <label htmlFor={titleId}>{TITLE_LABEL}</label>
        <input id={titleId} value={title} maxLength={MAX_TOPIC_TITLE} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor={bodyId}>{BODY_LABEL}</label>
        <textarea id={bodyId} value={body} rows={6} maxLength={MAX_TOPIC_BODY} onChange={(e) => setBody(e.target.value)} />
        <div className="topic-actions">
          <button type="submit" disabled={!canSubmit}>
            {SET_BUTTON}
          </button>
          {current !== null && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setTitle(current.title);
                setBody(current.body);
              }}
            >
              {REWRITE_BUTTON}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
