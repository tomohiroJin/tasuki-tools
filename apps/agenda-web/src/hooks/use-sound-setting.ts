/**
 * 音あり／音なしの設定（#429 spec §4.7 判断 J14）。**端末ごと**に localStorage へ覚える。
 *
 * - 既定は「音なし」（解錠には操作が要る。押していない画面は鳴らせない）
 * - 「音あり」にするときは、押した操作の中で解錠する
 * - 読めない・書けない端末（プライベートモードなど）では覚えないだけで、画面の切り替えは効く
 */
import { useCallback, useState } from 'react';
import { unlockAudio } from '../platform/sound';

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

export function useSoundSetting(): { soundOn: boolean; toggleSound: () => void } {
  const [soundOn, setSoundOn] = useState(readSetting);
  const toggleSound = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    writeSetting(next);
    // 解錠は押した操作の中で行う（あとからの時打ちは操作の外で鳴る）
    if (next) unlockAudio();
  }, [soundOn]);
  return { soundOn, toggleSound };
}
