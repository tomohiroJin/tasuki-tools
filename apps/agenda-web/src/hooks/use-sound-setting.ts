/**
 * 音あり／音なしの設定（#429 spec §4.7 判断 J14）。**端末ごと**に localStorage へ覚える。
 *
 * - 既定は「音なし」（解錠には操作が要る。押していない画面は鳴らせない）
 * - 「音あり」にするときは、押した操作の中で解錠する
 * - 読めない・書けない端末（プライベートモードなど）では覚えないだけで、画面の切り替えは効く
 * - **覚えた「音あり」と解錠の状態は別物**（最終レビュー I-2）。開き直した端末は「音あり」を覚えていても解錠されて
 *   いない（操作が要る）。その間は `locked`（「音を有効に」）と出し、押せば 1 回で解錠して `on` になる。
 *   画面のどこかに触れて解錠されたときも `on` になる。鳴らすのは `on` のときだけ
 */
import { useCallback, useState, useSyncExternalStore } from 'react';
import { isAudioUnlocked, subscribeAudioState, unlockAudio } from '../platform/sound';

/** off = 音なし・locked = 音ありを覚えているが解錠前（押して有効にする）・on = 音あり（鳴らせる） */
export type SoundState = 'off' | 'locked' | 'on';

export const SOUND_SETTING_KEY = 'tasuki.agenda.sound';

function readSetting(): boolean {
  try {
    return localStorage.getItem(SOUND_SETTING_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeSetting(on: boolean): void {
  try {
    localStorage.setItem(SOUND_SETTING_KEY, on ? 'on' : 'off');
  } catch {
    /* 覚えられないだけ。いまの画面の切り替えは効く */
  }
}

export function useSoundSetting(): { soundState: SoundState; soundOn: boolean; toggleSound: () => void } {
  const [remembered, setRemembered] = useState(readSetting);
  const unlocked = useSyncExternalStore(subscribeAudioState, isAudioUnlocked, () => false);
  const soundState: SoundState = !remembered ? 'off' : unlocked ? 'on' : 'locked';
  const toggleSound = useCallback(() => {
    // 解錠は押した操作の中で行う（あとからの時打ちは操作の外で鳴る）
    if (soundState === 'locked') {
      unlockAudio();
      return;
    }
    const next = soundState === 'off';
    setRemembered(next);
    writeSetting(next);
    if (next) unlockAudio();
  }, [soundState]);
  return { soundState, soundOn: soundState === 'on', toggleSound };
}
