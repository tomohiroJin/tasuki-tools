import { useId, useLayoutEffect, useRef, useState } from 'react';
import { CATEGORIES, DIFFICULTIES, LANGUAGES, MAX_AI_UNLOCK_KEY, type Category, type Difficulty, type Language } from '@tasuki/topic-core';
import {
  AI_BUTTON,
  CATEGORY_LABEL,
  CATEGORY_NAMES,
  DIFFICULTY_LABEL,
  DIFFICULTY_NAMES,
  FALLBACK_BUTTON,
  GENERATING_TEXT,
  LANGUAGE_LABEL,
  MAKE_BUSY_MARK,
  MAKE_HEADING,
  UNLOCK_BUTTON,
  UNLOCK_LABEL,
} from '../copy';
import { canUnlock } from '../topic-view';

interface Props {
  readonly aiUnlocked: boolean;
  readonly enabled: boolean;
  /** 生成中か（全員に配られる `generating`）。生成中は作るの欄のボタンを押せなくする（#665）。 */
  readonly generating: boolean;
  onGenerate(mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty, category: Category): void;
  onUnlock(key: string): void;
}

/**
 * AI か定型で作る（spec §5.4 の「作る」）。**選択肢は topic-core の許可リストから引く**
 * （画面と境界で別の一覧を持つと、選べるのに拒まれる値が生まれる・`docs/adr/0012` D10）。
 *
 * 未解錠なら合言葉の欄を出し、「AI で作る」は出さない。合言葉は送ったら欄から消す
 * （平文を画面の状態に残さない）。
 *
 * **最初はたたんでおく**（`<details>`・#316 PR 1 の手直し。書くが主役）。
 *
 * **広いときは 1 行の帯に並べる**（#313 構成案 1）。ボタン 1 つで済む操作に、書くと同じ高さの面は要らない。
 * 並べるかどうかは CSS が面の幅で決める（`.topic-make` の容器クエリ）。
 */
export function TopicMaker({ aiUnlocked, enabled, generating, onGenerate, onUnlock }: Props) {
  // 生成中に押すと進行中の生成が中断される（E11）。待ちきれず押して捨てさせないよう、作るの欄のボタンだけ止める（#665）
  const canGenerate = enabled && !generating;
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [language, setLanguage] = useState<Language>(LANGUAGES[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [key, setKey] = useState('');
  const id = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const aiRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLButtonElement>(null);

  // 押せなくなる（生成中・切断）ボタンにフォーカスがあったら、作るの欄（region・押しても何も起きない所）へ移す。summary へ移すと 2 度目の Enter で欄が閉じる。移さないとフォーカスが文書の先頭へ落ちる。
  // ほかにあるとき（書く欄で打っている最中など）は動かさない。ほかの参加者の画面でも同じ規則（#665）
  useLayoutEffect(() => {
    if (canGenerate) return;
    const active = document.activeElement;
    if (active !== null && (active === aiRef.current || active === fallbackRef.current)) sectionRef.current?.focus();
  }, [canGenerate]);

  return (
    <section ref={sectionRef} tabIndex={-1} className="topic-panel topic-make ui-panel" aria-labelledby={`${id}-heading`}>
      {/* 書くが主役なので、作るは最初たたむ（`<details>`）。見出しは summary の中に置き、region の名前を保つ。
          生成中・定型に切り替えた知らせは `TopicRoom` がこの欄の外（すぐ下）に置くので、たたんだままでも見える。 */}
      <details className="topic-make-fold">
        <summary>
          <h2 id={`${id}-heading`}>{MAKE_HEADING}</h2>
          {/* たたんでいる間に生成中になっても見出しの横で分かるようにする。開いている間は中のボタンが言う */}
          {generating && (
            <span className="topic-make-busy" aria-hidden="true">
              {MAKE_BUSY_MARK}
            </span>
          )}
        </summary>
        <div className="topic-make-row">
          <div className="topic-make-field topic-make-category">
            <label htmlFor={`${id}-category`}>{CATEGORY_LABEL}</label>
            <select
              id={`${id}-category`}
              className="ui-select"
              value={category}
              onChange={(e) => {
                const next = CATEGORIES.find((c) => c === e.target.value);
                if (next !== undefined) setCategory(next);
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_NAMES[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="topic-make-field topic-make-language">
            <label htmlFor={`${id}-language`}>{LANGUAGE_LABEL}</label>
            <select
              id={`${id}-language`}
              className="ui-select"
              value={language}
              onChange={(e) => {
                const next = LANGUAGES.find((l) => l === e.target.value);
                if (next !== undefined) setLanguage(next);
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="topic-make-field topic-make-difficulty">
            <label htmlFor={`${id}-difficulty`}>{DIFFICULTY_LABEL}</label>
            <select
              id={`${id}-difficulty`}
              className="ui-select"
              value={difficulty}
              onChange={(e) => {
                const next = DIFFICULTIES.find((d) => d === e.target.value);
                if (next !== undefined) setDifficulty(next);
              }}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="ui-actions">
            {aiUnlocked && (
              <button ref={aiRef} type="button" className="ui-button ui-button--secondary" onClick={() => onGenerate('ai', language, difficulty, category)} disabled={!canGenerate}>
                {/* 幅は 2 つの文言の長いほうで最初から取る（文言が変わっても押した場所が動かない）。出していないほうは隠して読み上げから外す */}
                <span className="topic-make-label">
                  <span aria-hidden={generating} className={generating ? 'topic-make-label-off' : undefined}>{AI_BUTTON}</span>
                  <span aria-hidden={!generating} className={generating ? undefined : 'topic-make-label-off'}>{GENERATING_TEXT}</span>
                </span>
              </button>
            )}
            <button ref={fallbackRef} type="button" className="ui-button ui-button--secondary" onClick={() => onGenerate('fallback', language, difficulty, category)} disabled={!canGenerate}>
              {FALLBACK_BUTTON}
            </button>
          </div>
          {!aiUnlocked && (
            <form
              className="topic-unlock"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canUnlock(key, enabled)) return;
                onUnlock(key);
                setKey('');
              }}
            >
              <label htmlFor={`${id}-key`}>{UNLOCK_LABEL}</label>
              <div className="topic-unlock-row">
                <input
                  id={`${id}-key`}
                  className="ui-input"
                  type="password"
                  autoComplete="off"
                  maxLength={MAX_AI_UNLOCK_KEY}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
                <button type="submit" className="ui-button ui-button--secondary" disabled={!canUnlock(key, enabled)}>
                  {UNLOCK_BUTTON}
                </button>
              </div>
            </form>
          )}
        </div>
      </details>
    </section>
  );
}
