import { useDeferredValue, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { TopicState } from '@tasuki/topic-core';
import {
  CLEAR_BUTTON,
  CLOSE,
  CURRENT_HEADING,
  DRAFT_STAMP,
  EMPTY_TEXT,
  PREVIEW_EMPTY,
  READER_TABS_LABEL,
  READ_MORE,
  TAB_CURRENT,
  TAB_DRAFT,
} from '../copy';
import { Markdown } from './Markdown';

export interface Draft {
  readonly title: string;
  readonly body: string;
}

interface Props {
  readonly state: TopicState | null;
  readonly notice: string | null;
  readonly enabled: boolean;
  readonly draft: Draft;
  onClear(): void;
}

type TabId = 'current' | 'draft';
const TABS: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: 'current', label: TAB_CURRENT },
  { id: 'draft', label: TAB_DRAFT },
];

/**
 * いまのお題。**読む面（部品 `.ui-reader`・#316）にする。** 象牙の札に見出し（h2）とタブを固定し、
 * 本文は札の中でスクロールする。タブは「いまのお題」と「下書きの見え方」の 2 つ。
 * 64rem 未満では本文を 3 行で切り、「続きを読む」から下からのシート（`.ui-drawer` の `<dialog>`）に
 * いまのお題の全文を出す（poker の `CurrentTopic` と同じ作り。部品は共有、React は各アプリ）。
 *
 * **生成中は全員の画面で `aria-busy` を立てる**（spec §5.4・E10）。
 * 知らせ（`role="status"`）は section の**外**（直前の兄弟）に置く。ARIA 1.2 では
 * `aria-busy` の要素の内容変化は支援技術が busy の間は無視してよい（MAY）ため、
 * section の中に置くと「作っています…」が読み上げられない恐れがある（レビュー指摘）。
 * `aria-busy` 自体は section に残す（既存テストが region の aria-busy を見ている）。
 *
 * **自動切り替えの規則**: 下書きが「空 → 空でない」に変わった瞬間だけ「下書きの見え方」へ、
 * 「空でない → 空」（送った・消した）に変わった瞬間だけ「いまのお題」へ戻す。それ以外
 * （毎打鍵）は利用者の選択を保つ。空の判定はプレビューと同じく前後の空白を無視する。
 * 状態の遷移は描画中に「前の値」と比べて起こす（effect だと 1 描画ぶん古いタブが見える）。
 *
 * タブは WAI-ARIA Tabs（矢印で移動・選んだタブだけ `tabIndex=0`）。timer-web の `Tabs` と同じ作法だが
 * 部品は共有しない（見た目が札の上のタブで違う）。
 * **受け入れた限界**: シートを開いたまま 64rem 以上へ広げたとき、またはお題が下ろされて
 * アンマウントされたときは、フォーカスが body に落ちる（poker と同じ・直さない）。
 */
export function CurrentTopic({ state, notice, enabled, draft, onClear }: Props) {
  const topic = state?.topic ?? null;
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState<TabId>('current');

  const filled = draft.title.trim() !== '' || draft.body.trim() !== '';
  const [wasFilled, setWasFilled] = useState(filled);
  if (wasFilled !== filled) {
    setWasFilled(filled);
    setActive(filled ? 'draft' : 'current');
  }
  // 打つたびの Markdown の解析で入力が止まらないよう、描く値は遅らせる（プレビューと同じ）
  const draftTitle = useDeferredValue(draft.title);
  const draftBody = useDeferredValue(draft.body);

  const tabId = (id: TabId) => `${baseId}-tab-${id}`;
  const panelId = (id: TabId) => `${baseId}-panel-${id}`;
  const onTabKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    if (next === undefined) return;
    setActive(next.id);
    // 選択に実フォーカスも付いてくる（自動で選ぶ方式）。要素は常に描画済みなので id で引ける
    document.getElementById(tabId(next.id))?.focus();
  };

  const hasBody = topic !== null && topic.body !== '';
  // フォーカスを「続きを読む」へ戻す経路は `onClose` の 1 本（閉じるボタンも Esc も `close` イベントを通る）
  const closeDrawer = () => dialogRef.current?.close();
  const titleId = `${baseId}-title`;
  const draftTitleId = `${baseId}-draft-title`;
  const draftBlank = draftTitle.trim() === '' && draftBody.trim() === '';

  return (
    <>
      {notice && (
        <p className="topic-notice ui-note" role="status">
          {notice}
        </p>
      )}
      <section
        className="topic-current ui-reader"
        aria-labelledby={`${baseId}-heading`}
        aria-busy={state?.generating ?? false}
      >
        <div className="ui-reader-head">
          <h2 id={`${baseId}-heading`}>{CURRENT_HEADING}</h2>
        </div>
        <div className="topic-reader-tabs" role="tablist" aria-label={READER_TABS_LABEL}>
          {TABS.map((t, i) => {
            const selected = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={tabId(t.id)}
                className="topic-tab"
                aria-selected={selected}
                aria-controls={panelId(t.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(t.id)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {/* 選ばれていないパネルは描かない（同じタイトルが 2 つの見出しにならない）。属性だけ残して hidden にする */}
        {TABS.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={panelId(t.id)}
            aria-labelledby={tabId(t.id)}
            className="topic-reader-panel"
            hidden={t.id !== active}
          >
            {t.id === 'current' && active === 'current' && (
              <>
                {topic === null ? (
                  <p className="topic-empty ui-note topic-reader-pad">{EMPTY_TEXT}</p>
                ) : (
                  <>
                    <h3 id={titleId} className="topic-title topic-reader-pad">{topic.title}</h3>
                    {hasBody && (
                      <>
                        <div className="ui-reader-body" role="region" aria-labelledby={titleId} tabIndex={0}>
                          <Markdown source={topic.body} className="topic-body" />
                        </div>
                        <button
                          ref={moreRef}
                          type="button"
                          className="secondary ui-reader-more"
                          onClick={() => dialogRef.current?.showModal()}
                        >
                          {READ_MORE}
                        </button>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {t.id === 'draft' && active === 'draft' && (
              <>
                <p className="topic-draft-stamp topic-reader-pad">{DRAFT_STAMP}</p>
                {draftBlank ? (
                  <p className="topic-empty ui-note topic-reader-pad">{PREVIEW_EMPTY}</p>
                ) : (
                  <>
                    {draftTitle.trim() !== '' && (
                      <h3 id={draftTitleId} className="topic-title topic-reader-pad">{draftTitle}</h3>
                    )}
                    <div
                      className="ui-reader-body"
                      role="region"
                      aria-label={TAB_DRAFT}
                      tabIndex={0}
                    >
                      <Markdown source={draftBody} className="topic-body" />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        {topic !== null && (
          <div className="topic-reader-foot">
            <button type="button" className="secondary" onClick={onClear} disabled={!enabled}>
              {CLEAR_BUTTON}
            </button>
          </div>
        )}
        {topic !== null && hasBody && (
          <dialog
            ref={dialogRef}
            className="ui-drawer"
            aria-labelledby={`${baseId}-drawer-title`}
            onClose={() => moreRef.current?.focus()}
          >
            <div className="ui-drawer-head">
              <h3 id={`${baseId}-drawer-title`}>{topic.title}</h3>
              <button type="button" className="secondary" onClick={closeDrawer}>
                {CLOSE}
              </button>
            </div>
            <div className="ui-drawer-body">
              <Markdown source={topic.body} className="topic-body" />
            </div>
          </dialog>
        )}
      </section>
    </>
  );
}
