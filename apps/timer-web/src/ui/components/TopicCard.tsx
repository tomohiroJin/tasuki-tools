/**
 * いまのお題（#91・spec §5.5）。**timer は読むだけ**で、変えるのはお題ツールである（spec T4）。
 *
 * **読む面（部品 `.ui-reader`・#316 PR 3・#314）にする。** セッションでは脇（右・22rem）の先頭に置く。
 * 象牙の札に見出し（h2「お題」・h3 タイトル）と本文を載せ、64rem 以上では本文が札の中でスクロールし
 * （高さの上限は `topic-card.css`）、64rem 未満では 3 行で切って「続きを読む」から下からのシート
 * （`.ui-drawer` の `<dialog>`）に全文を出す。長い説明がタイマーを最初の画面から押し出さない。
 * 構造は poker の `CurrentTopic.tsx` と同じ。
 * 見出しの段: h2「お題」→ h3 タイトル → 本文の見出しは h4 から（`headingBase={4}`）。
 * 本文は `Markdown`（部品の `.ui-md-*`）で描く。
 * シートが開いたままアンマウントされたとき、または幅が 64rem を超えたときは、フォーカスが body に落ちる（直さない・poker の `CurrentTopic.tsx` と同じ受容）。
 * 本文（`.ui-reader-body`）は 64rem 以上だけ描き、`tabIndex={0}` は本文をキーボードでスクロールするため。
 * 64rem 未満は同じ本文を `inert` の写し（`.ui-reader-preview`）で 3 行に切って見せ、切った中身のリンクを Tab の行き先から外す。
 */
import React, { useId, useRef } from "react";
import type { Topic } from "@tasuki/topic-core";
import { Markdown } from "./Markdown.js";

/** 札の見出し。書体の常用の層に収まることを `topic-copy-fits-font-base.test.ts` が見る。 */
export const TOPIC_CARD_HEADING = "お題";
export const TOPIC_READ_MORE = "続きを読む";
export const TOPIC_CLOSE = "閉じる";

export function TopicCard({ topic }: { topic: Topic }) {
  const uid = useId();
  const headingId = `${uid}-heading`;
  const titleId = `${uid}-title`;
  const drawerTitleId = `${uid}-drawer-title`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const hasBody = topic.body !== "";
  // フォーカスを「続きを読む」へ戻す経路は `onClose` の 1 本（閉じるボタンも Esc も `close` イベントを通る）
  const close = () => dialogRef.current?.close();
  return (
    <section className="ui-reader timer-topic" aria-labelledby={headingId}>
      <div className="timer-topic-head">
        <h2 id={headingId} className="timer-topic-heading">{TOPIC_CARD_HEADING}</h2>
        {/* 区切りの無い長いタイトルが横へはみ出さないように折り返す（PR 2 の実画面で topic-web が踏んだ） */}
        <h3 id={titleId} className="timer-topic-title">{topic.title}</h3>
      </div>
      {hasBody && (
        <>
          {/* 64rem 未満の 3 行の写し。inert で Tab の行き先と読み上げから外す（全文は「続きを読む」のシート） */}
          <div className="ui-reader-preview" inert>
            <Markdown source={topic.body} headingBase={4} />
          </div>
          <div className="ui-reader-body" role="region" aria-labelledby={titleId} tabIndex={0}>
            <Markdown source={topic.body} headingBase={4} />
          </div>
          <button
            ref={moreRef}
            type="button"
            className="ui-button ui-button--secondary ui-button--sm ui-reader-more"
            onClick={() => dialogRef.current?.showModal()}
          >
            {TOPIC_READ_MORE}
          </button>
          <dialog
            ref={dialogRef}
            className="ui-drawer"
            aria-labelledby={drawerTitleId}
            onClose={() => moreRef.current?.focus()}
          >
            <div className="ui-drawer-head">
              <h3 id={drawerTitleId} className="timer-topic-title">{topic.title}</h3>
              <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={close}>
                {TOPIC_CLOSE}
              </button>
            </div>
            <div className="ui-drawer-body">
              <Markdown source={topic.body} headingBase={4} />
            </div>
          </dialog>
        </>
      )}
    </section>
  );
}
