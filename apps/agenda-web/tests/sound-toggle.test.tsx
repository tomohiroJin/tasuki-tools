/**
 * 「音を有効に」を押したときの実際の順序（最終レビュー I-2 の実機の欠陥）。
 *
 * 押すと `pointerdown`（キーなら `keydown`）が `click` より先に起きる。画面全体の解錠（`installAudioUnlock`）が
 * そこで解錠すると、`click` の時点で状態はもう「音あり」になっており、押下が「音なし」へ倒していた。
 * ここでは音のモジュールをモックせず、解錠すると running になる偽の AudioContext で順序を再現する。
 *
 * @requirements #429 spec §4.7・§12.5
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_LOCKED, SOUND_ON } from '../src/copy';

let state: AudioContextState = 'suspended';

class FakeAudioContext {
  private readonly listeners: Array<() => void> = [];
  get state(): AudioContextState {
    return state;
  }
  addEventListener(_type: string, l: () => void): void {
    this.listeners.push(l);
  }
  resume = vi.fn(() => {
    state = 'running';
    this.listeners.forEach((l) => l());
    return Promise.resolve();
  });
}

beforeEach(() => {
  vi.resetModules();
  state = 'suspended';
  localStorage.clear();
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderToggle() {
  const { SoundToggle } = await import('../src/components/SoundToggle');
  const { useSoundSetting, SOUND_SETTING_KEY } = await import('../src/hooks/use-sound-setting');
  localStorage.setItem(SOUND_SETTING_KEY, 'on');
  function Harness() {
    const { soundState, toggleSound } = useSoundSetting();
    return <SoundToggle state={soundState} onToggle={toggleSound} />;
  }
  render(<Harness />);
  return SOUND_SETTING_KEY;
}

/** 別のタスクで起きる次の操作の前に、resume の後始末（マイクロタスク）を流す */
const flush = () => act(async () => {});

describe('「音を有効に」を押す順序', () => {
  it('Given 覚えた音あり・未解錠 / When pointerdown → click の順で押す / Then 「音あり」になり、覚えた設定は on のまま', async () => {
    const key = await renderToggle();
    const button = screen.getByRole('button', { name: SOUND_LOCKED });
    fireEvent.pointerDown(button);
    await flush();
    fireEvent.click(button);
    await flush();
    expect(screen.getByRole('button', { name: SOUND_ON })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(key)).toBe('on');
  });

  it('Given 覚えた音あり・未解錠 / When keydown → click の順で押す（キーボード） / Then 「音あり」になり、覚えた設定は on のまま', async () => {
    const key = await renderToggle();
    const button = screen.getByRole('button', { name: SOUND_LOCKED });
    fireEvent.keyDown(button, { key: 'Enter' });
    await flush();
    fireEvent.click(button);
    await flush();
    expect(screen.getByRole('button', { name: SOUND_ON })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(key)).toBe('on');
  });

  it('Given 覚えた音あり・未解錠 / When 切り替えの外を押す / Then 解錠して「音あり」になる', async () => {
    await renderToggle();
    fireEvent.pointerDown(document.body);
    await flush();
    expect(screen.getByRole('button', { name: SOUND_ON })).toBeInTheDocument();
  });
});
