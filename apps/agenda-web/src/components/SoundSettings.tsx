/**
 * 組む画面の「時間切れの音」の欄（#669 D4・D9）。表示だけの部品で、音を鳴らす仕組みは持たない
 * （親が状態と操作を渡す）。音の種類は端末ごとの設定なので、参加前でも押せる。
 * 「試しに鳴らす」は明示の操作なので、音なしのときも押せる。
 */
import { useId } from 'react';
import { CHIME_LABEL, PREVIEW_CHIME_BUTTON, SOUND_SETTINGS_HEADING } from '../copy';
import type { SoundState } from '../hooks/use-sound-setting';
import { SoundToggle } from './SoundToggle';

interface Props {
  state: SoundState;
  onToggle: () => void;
  /** 選べる音（並びのまま出す） */
  chimes: readonly { readonly id: string; readonly label: string }[];
  chimeId: string;
  onChimeChange: (id: string) => void;
  /** 選んでいる音を押した操作の中で鳴らす（解錠も親が行う） */
  onPreview: () => void;
}

export function SoundSettings({ state, onToggle, chimes, chimeId, onChimeChange, onPreview }: Props) {
  const headingId = useId();
  const selectId = useId();
  return (
    <section className="ui-panel ui-stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{SOUND_SETTINGS_HEADING}</h2>
      <div className="builder-rounds">
        <label htmlFor={selectId}>{CHIME_LABEL}</label>
        <select id={selectId} className="ui-select" value={chimeId} onChange={(event) => onChimeChange(event.target.value)}>
          {chimes.map((chime) => (
            <option key={chime.id} value={chime.id}>{chime.label}</option>
          ))}
        </select>
      </div>
      <div className="builder-sound-actions">
        <SoundToggle state={state} onToggle={onToggle} />
        <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={onPreview}>
          {PREVIEW_CHIME_BUTTON}
        </button>
      </div>
    </section>
  );
}
