/**
 * いまのお題（#91・spec §5.5）。**poker は読むだけ**（spec T4）。
 *
 * **読む面（部品 `.ui-reader`・#316）にする。** 象牙の札に見出し（h2「お題」・h3 タイトル）と
 * 本文を載せる。64rem 以上では本文が札の中でスクロールし、64rem 未満では 3 行で切って
 * 「続きを読む」から下からのシート（`.ui-drawer` の `<dialog>`）に全文を出す。
 * かつての `<details>`（「説明を見る」= `TOPIC_BODY_TOGGLE`）は、広い幅で本文を畳む理由が無くなり、
 * 狭い幅の全文はシートが担うので消した。
 * 見出しの段: h2「お題」→ h3 タイトル → 本文の見出しは h4 から。
 *
 * 札の上の字の色は `.ui-reader` が `--coal` で持つ。Markdown のコード・引用の枠の色（`--coal-soft`）も
 * 象牙地の上で読めるように決めてある（暗い地へ直接乗せると約 2.07:1 まで落ちる。#91 PR 3）。
 * 本文の `tabIndex={0}` は 64rem 以上で本文をキーボードでスクロールするため
 * （64rem 未満は切って見せるだけだが、フォーカスは受けるので害は無い）。
 */
import { useRef } from 'react';
import type { Topic } from '@tasuki/topic-core';
import { Markdown } from './Markdown';

export const TOPIC_HEADING = 'お題';
export const READ_MORE = '続きを読む';
export const CLOSE = '閉じる';

export function CurrentTopic({ topic }: { topic: Topic }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const hasBody = topic.body !== '';
  const close = () => {
    dialogRef.current?.close();
    moreRef.current?.focus();
  };
  return (
    <section className="topic ui-reader" aria-labelledby="poker-topic-heading">
      <div className="ui-reader-head">
        <h2 id="poker-topic-heading">{TOPIC_HEADING}</h2>
        <h3 className="topic-title">{topic.title}</h3>
      </div>
      {hasBody && (
        <>
          <div className="ui-reader-body" role="region" aria-label={topic.title} tabIndex={0}>
            <Markdown source={topic.body} />
          </div>
          <button
            ref={moreRef}
            type="button"
            className="secondary ui-reader-more"
            onClick={() => dialogRef.current?.showModal()}
          >
            {READ_MORE}
          </button>
          <dialog
            ref={dialogRef}
            className="ui-drawer"
            aria-labelledby="poker-topic-drawer-title"
            onClose={() => moreRef.current?.focus()}
          >
            <div className="ui-drawer-head">
              <h3 id="poker-topic-drawer-title">{topic.title}</h3>
              <button type="button" className="secondary" onClick={close}>
                {CLOSE}
              </button>
            </div>
            <div className="ui-drawer-body">
              <Markdown source={topic.body} />
            </div>
          </dialog>
        </>
      )}
    </section>
  );
}
