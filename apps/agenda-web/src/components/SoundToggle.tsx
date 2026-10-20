/**
 * 音あり／音なしの切り替え（#429 spec §4.7）。盤の隅に常に置き、押すことが解錠を兼ねる。
 * 押されている（音あり）かは `aria-pressed` で伝え、見た目は鈴の印と文言で示す（色だけに頼らない）。
 * 「音あり」を覚えていても解錠前なら「音を有効に」と出す（鳴らせないのに「音あり」と見せない。最終レビュー I-2）。
 */
import { useEffect } from 'react';
import { SOUND_LOCKED, SOUND_OFF, SOUND_ON } from '../copy';
import type { SoundState } from '../hooks/use-sound-setting';
import { installAudioUnlock } from '../platform/sound';

interface Props {
  state: SoundState;
  onToggle: () => void;
}

const LABEL: Record<SoundState, string> = { off: SOUND_OFF, locked: SOUND_LOCKED, on: SOUND_ON };

export function SoundToggle({ state, onToggle }: Props) {
  const soundOn = state === 'on';
  // 一度でも画面に触れたら解錠しておく（音ありで開き直した端末が、最初の時打ちを鳴らせるように）
  useEffect(() => installAudioUnlock(), []);
  return (
    <button
      type="button"
      className={soundOn ? 'sound-toggle is-on ui-button ui-button--quiet ui-button--sm' : 'sound-toggle ui-button ui-button--quiet ui-button--sm'}
      aria-pressed={soundOn}
      onClick={onToggle}
    >
      <span className="sound-toggle-mark" aria-hidden="true" />
      {LABEL[state]}
    </button>
  );
}
