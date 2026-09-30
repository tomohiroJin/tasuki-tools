import { useDeferredValue, useId, useLayoutEffect, useRef, useState } from 'react';
import { MAX_TOPIC_BODY, MAX_TOPIC_TITLE, type Topic } from '@tasuki/topic-core';
import {
  BODY_HINT,
  BODY_LABEL,
  COMPOSE_MODE_LABEL,
  PREVIEW_BUTTON,
  PREVIEW_EMPTY,
  REWRITE_BUTTON,
  SET_BUTTON,
  TITLE_LABEL,
  WRITE_HEADING,
  WRITE_MODE_BUTTON,
} from '../copy';
import { canSubmitTopic, toSingleLine } from '../topic-view';
import { TopicSheet } from './TopicSheet';

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
 *
 * **タイトルは複数行の欄だが、改行は持たせない**（#313 正本 D3）。長い文を折り返して全体を見せるための
 * 欄で、タイトル自体は各画面で見出しの素の文字として出る。Enter は 1 行の欄のときと同じく送信にする。
 *
 * **プレビューはいまのお題と同じ札（`TopicSheet`）で描く**（#313 正本 D6）。打つたびの Markdown の解析で
 * 入力が止まらないよう、描く値は `useDeferredValue` を通す。打つたびに読み上げないよう `aria-live` にしない。
 *
 * **並べるか切り替えるかは CSS が決める**（#313 正本 D7）。「書く」の容器が広ければ説明の欄とプレビューを並べ、
 * 切り替えのボタンを隠す。React の木は幅によらず同じで、ここが持つのは狭いときにどちらを出すか（`mode`）だけ。
 * 切り替えのボタンは要素層のボタン（押している方）と `.secondary`（押していない方）で組み、部品層に置かない（D8）。
 */
export function TopicEditor({ current, enabled, onSubmit }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // 改行を空白にして値を書き直すと、ブラウザはカーソルを末尾へ移す。書き直した直後に戻す位置
  const titleCaret = useRef<number | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const previewId = useId();
  const canSubmit = canSubmitTopic(title, enabled);
  const previewTitle = useDeferredValue(title);
  const previewBody = useDeferredValue(body);
  const previewBlank = previewTitle.trim() === '' && previewBody.trim() === '';

  useLayoutEffect(() => {
    const caret = titleCaret.current;
    if (caret === null) return;
    titleCaret.current = null;
    titleRef.current?.setSelectionRange(caret, caret);
  }, [title]);

  return (
    <section className="topic-panel ui-panel" aria-labelledby={`${titleId}-heading`}>
      <h2 id={`${titleId}-heading`}>{WRITE_HEADING}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit(title.trim(), body);
          setTitle('');
          setBody('');
          // 送ったら次に書く欄を出す（正本 D9。狭い画面でプレビューのまま欄が隠れているのを防ぐ）
          setMode('write');
        }}
      >
        <label htmlFor={titleId}>{TITLE_LABEL}</label>
        <textarea
          id={titleId}
          className="ui-input topic-title-field"
          rows={2}
          value={title}
          maxLength={MAX_TOPIC_TITLE}
          aria-describedby={`${titleId}-count`}
          ref={titleRef}
          onChange={(e) => {
            const raw = e.target.value;
            const next = toSingleLine(raw);
            // 改行を含む文を途中に貼ったとき、カーソルを差し込んだ文の後ろに残す。欄の値の改行は常に \n の
            // 1 字（textarea は \r\n をそろえて持つ）で、空白 1 字に置き換えても位置は変わらない
            if (next !== raw) titleCaret.current = e.target.selectionStart;
            setTitle(next);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // 変換の確定の Enter では送らない（Safari は確定の Enter で isComposing が偽になり、keyCode が 229 になる）
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            // Shift+Enter でも改行を入れない。送れるかどうかは onSubmit の 1 か所で決める
            e.preventDefault();
            if (!e.shiftKey) e.currentTarget.form?.requestSubmit();
          }}
        />
        <p className="topic-field-meta ui-note">
          <span id={`${titleId}-count`}>{`${title.length} / ${MAX_TOPIC_TITLE}`}</span>
        </p>
        <div className="topic-compose" data-mode={mode}>
          <div className="topic-compose-toggle" role="group" aria-label={COMPOSE_MODE_LABEL}>
            <button
              type="button"
              className={mode === 'write' ? undefined : 'secondary'}
              aria-pressed={mode === 'write'}
              onClick={() => setMode('write')}
            >
              {WRITE_MODE_BUTTON}
            </button>
            <button
              type="button"
              className={mode === 'preview' ? undefined : 'secondary'}
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              {PREVIEW_BUTTON}
            </button>
          </div>
          <div className="topic-compose-panes">
            <div className="topic-compose-write">
              <label htmlFor={bodyId}>{BODY_LABEL}</label>
              <textarea
                id={bodyId}
                className="ui-input topic-body-field"
                rows={8}
                value={body}
                maxLength={MAX_TOPIC_BODY}
                aria-describedby={`${bodyId}-count`}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="topic-field-meta ui-note">
                <span>{BODY_HINT}</span>
                <span id={`${bodyId}-count`}>{`${body.length} / ${MAX_TOPIC_BODY}`}</span>
              </p>
            </div>
            <section className="topic-compose-preview" aria-labelledby={previewId}>
              <p id={previewId} className="topic-compose-caption">
                {PREVIEW_BUTTON}
              </p>
              {previewBlank ? <p className="ui-note">{PREVIEW_EMPTY}</p> : <TopicSheet title={previewTitle} body={previewBody} />}
            </section>
          </div>
        </div>
        <div className="topic-actions">
          <button type="submit" disabled={!canSubmit}>
            {SET_BUTTON}
          </button>
          {current !== null && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                // 境界スキーマは改行を拒まないので、AI や別の接続から届いたタイトルも 1 行にして写す（正本 D3）
                setTitle(toSingleLine(current.title));
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
