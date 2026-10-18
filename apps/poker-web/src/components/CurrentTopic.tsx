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
 * 本文（`.ui-reader-body`）は 64rem 以上だけ描き、`tabIndex={0}` は本文をキーボードでスクロールするため。
 * 64rem 未満は同じ本文を `inert` の写し（`.ui-reader-preview`）で 3 行に切って見せる。切った中身のリンクが
 * Tab の行き先に残らず、見えないリンクにフォーカスが入らない（全文とそのリンクはシートが持つ）。
 * **受け入れた限界**: シートを開いたまま 64rem 以上へ広げたとき、またはお題が下ろされて
 * アンマウントされたときは、フォーカスが body に落ちる（直さない）。
 * **受け入れた限界（もう 1 つ）**: お題が下ろされる瞬間は札の包みだけが消える（お題の中身が無いので残せない）。
 * 札は即座に消えるが、脇は記録のために残る（#93）ので、64rem 以上の列は動かない（#348 の D7・D8 の「列が滑る」は
 * #93 で無くなった。札の包みだけが高さ 0 へ畳まれる）。
 */
import type { Topic } from '@tasuki/topic-core';
import { Markdown, useReaderDrawer } from '@tasuki/web-kit/reader';

export const TOPIC_HEADING = 'お題';
export const READ_MORE = '続きを読む';
export const CLOSE = '閉じる';
/** 切り替えのボタン（RoomPage）の文言と、それが指す札の id。書体の検査が文言を拾う。 */
export const TOPIC_HIDE = 'お題を隠す';
export const TOPIC_SHOW = 'お題を見る';
export const TOPIC_CARD_ID = 'poker-topic-card';

export function CurrentTopic({ topic }: { topic: Topic }) {
  // 開閉と、閉じたときに「続きを読む」へフォーカスを戻す処理は共有のフック（`@tasuki/web-kit/reader`）
  const drawer = useReaderDrawer();
  const hasBody = topic.body !== '';
  return (
    <section id={TOPIC_CARD_ID} className="topic ui-reader" aria-labelledby="poker-topic-heading">
      <div className="topic-head">
        <h2 id="poker-topic-heading">{TOPIC_HEADING}</h2>
        <h3 id="poker-topic-title" className="topic-title">{topic.title}</h3>
      </div>
      {hasBody && (
        <>
          {/* 64rem 未満の 3 行の写し。inert で Tab の行き先と読み上げから外す（全文は「続きを読む」のシート） */}
          <div className="ui-reader-preview" inert>
            <Markdown source={topic.body} headingBase={4} />
          </div>
          <div className="ui-reader-body" role="region" aria-labelledby="poker-topic-title" tabIndex={0}>
            <Markdown source={topic.body} headingBase={4} />
          </div>
          <button
            ref={drawer.triggerRef}
            type="button"
            className="ui-button ui-button--secondary ui-button--sm ui-reader-more"
            onClick={drawer.open}
          >
            {READ_MORE}
          </button>
          <dialog
            ref={drawer.dialogRef}
            className="ui-drawer"
            aria-labelledby="poker-topic-drawer-title"
            onClose={drawer.onClose}
          >
            <div className="ui-drawer-head">
              <h3 id="poker-topic-drawer-title">{topic.title}</h3>
              <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={drawer.close}>
                {CLOSE}
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
