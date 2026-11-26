/**
 * 組む画面の「時間切れの音」の欄（#669 D4・D9）。表示だけの部品なので、音の仕組みは渡さず、
 * 渡した関数が押した操作どおりに呼ばれることと、描かれる文言・並びを確かめる。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHIME_LABEL, PREVIEW_CHIME_BUTTON, SOUND_OFF, SOUND_ON, SOUND_SETTINGS_HEADING } from '../src/copy';
import { SoundSettings } from '../src/components/SoundSettings';
import type { SoundState } from '../src/hooks/use-sound-setting';

const CHIMES = [
  { id: 'tick', label: '時打ち' },
  { id: 'call', label: '呼び出しチャイム' },
  { id: 'voice-male', label: '音声（男声）' },
] as const;

function setup(overrides: { state?: SoundState; chimeId?: string } = {}) {
  const onToggle = vi.fn();
  const onChimeChange = vi.fn();
  const onPreview = vi.fn();
  render(
    <SoundSettings
      state={overrides.state ?? 'on'}
      onToggle={onToggle}
      chimes={CHIMES}
      chimeId={overrides.chimeId ?? 'tick'}
      onChimeChange={onChimeChange}
      onPreview={onPreview}
    />,
  );
  return { onToggle, onChimeChange, onPreview };
}

describe('時間切れの音の欄', () => {
  it('Given 欄を描く / When 画面を見る / Then 見出しと音の種類の選択と試しに鳴らすが並ぶ', () => {
    setup();
    expect(screen.getByText(SOUND_SETTINGS_HEADING)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: CHIME_LABEL })).toBeInTheDocument();
    const preview = screen.getByRole('button', { name: PREVIEW_CHIME_BUTTON });
    expect(preview).toHaveAttribute('type', 'button');
  });

  it('Given 3 つの音 / When 選択肢を見る / Then 渡した順に並び、value は id で、選んでいる音が選ばれている', () => {
    setup({ chimeId: 'call' });
    const select = screen.getByRole('combobox', { name: CHIME_LABEL });
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['時打ち', '呼び出しチャイム', '音声（男声）']);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['tick', 'call', 'voice-male']);
    expect(select).toHaveValue('call');
  });

  it('Given 時打ちを選んでいる / When 音声（男声）を選ぶ / Then onChimeChange が id で呼ばれる', () => {
    const { onChimeChange } = setup();
    fireEvent.change(screen.getByRole('combobox', { name: CHIME_LABEL }), { target: { value: 'voice-male' } });
    expect(onChimeChange).toHaveBeenCalledTimes(1);
    expect(onChimeChange).toHaveBeenCalledWith('voice-male');
  });

  it('Given 音あり / When 試しに鳴らすを押す / Then onPreview が 1 回呼ばれる', () => {
    const { onPreview } = setup({ state: 'on' });
    fireEvent.click(screen.getByRole('button', { name: PREVIEW_CHIME_BUTTON }));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('Given 音なし / When 試しに鳴らすを押す / Then 押せて onPreview が呼ばれる（明示の操作なので鳴らす）', () => {
    const { onPreview } = setup({ state: 'off' });
    const preview = screen.getByRole('button', { name: PREVIEW_CHIME_BUTTON });
    expect(preview).toBeEnabled();
    fireEvent.click(preview);
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['on', SOUND_ON, 'true'],
    ['off', SOUND_OFF, 'false'],
  ] as const)('Given 音の状態が %s / When 欄を描く / Then 切り替えに「%s」が出る', (state, label, pressed) => {
    setup({ state });
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', pressed);
  });

  it('Given 音あり / When 切り替えを押す / Then onToggle が呼ばれ、試しに鳴らすは呼ばれない', () => {
    const { onToggle, onPreview } = setup({ state: 'on' });
    fireEvent.click(screen.getByRole('button', { name: SOUND_ON }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
  });
});
