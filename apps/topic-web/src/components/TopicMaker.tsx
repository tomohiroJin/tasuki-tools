import { useId, useState } from 'react';
import { DIFFICULTIES, LANGUAGES, MAX_AI_UNLOCK_KEY, type Difficulty, type Language } from '@tasuki/topic-core';
import {
  AI_BUTTON,
  DIFFICULTY_LABEL,
  DIFFICULTY_NAMES,
  FALLBACK_BUTTON,
  LANGUAGE_LABEL,
  MAKE_HEADING,
  UNLOCK_BUTTON,
  UNLOCK_LABEL,
} from '../copy';
import { canUnlock } from '../topic-view';

interface Props {
  readonly aiUnlocked: boolean;
  readonly enabled: boolean;
  onGenerate(mode: 'ai' | 'fallback', language: Language, difficulty: Difficulty): void;
  onUnlock(key: string): void;
}

/**
 * AI か定型で作る（spec §5.4 の「作る」）。**選択肢は topic-core の許可リストから引く**
 * （画面と境界で別の一覧を持つと、選べるのに拒まれる値が生まれる・`docs/adr/0012` D10）。
 *
 * 未解錠なら合言葉の欄を出し、「AI で作る」は出さない。合言葉は送ったら欄から消す
 * （平文を画面の状態に残さない）。
 */
export function TopicMaker({ aiUnlocked, enabled, onGenerate, onUnlock }: Props) {
  const [language, setLanguage] = useState<Language>(LANGUAGES[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [key, setKey] = useState('');
  const id = useId();

  return (
    <section className="topic-panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{MAKE_HEADING}</h2>
      <label htmlFor={`${id}-language`}>{LANGUAGE_LABEL}</label>
      <select
        id={`${id}-language`}
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
      <label htmlFor={`${id}-difficulty`}>{DIFFICULTY_LABEL}</label>
      <select
        id={`${id}-difficulty`}
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
      <div className="topic-actions">
        {aiUnlocked && (
          <button type="button" onClick={() => onGenerate('ai', language, difficulty)} disabled={!enabled}>
            {AI_BUTTON}
          </button>
        )}
        <button type="button" className="secondary" onClick={() => onGenerate('fallback', language, difficulty)} disabled={!enabled}>
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
          <input
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            maxLength={MAX_AI_UNLOCK_KEY}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="submit" disabled={!canUnlock(key, enabled)}>
            {UNLOCK_BUTTON}
          </button>
        </form>
      )}
    </section>
  );
}
