/**
 * 押して止める（#401 押して止める spec §3・§4）。偽の WebSocket と偽の時計で、回っている円盤を押して止めたときに
 * 送る値・その場で止まること・ほかの人が止めたときに寄せて止まること・Space・30 秒の自動の停止を見る。
 */
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_AUTO_STOP_MS, pressPositionAt } from '@tasuki/roulette-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  MODE_HEADING,
  MODE_PRESS,
  PICK_COUNT_LABEL,
  PRESS_AUTO_TEXT,
  PRESS_IDLE,
  PRESS_SPINNING,
  STOP_BUTTON,
  pressDecidedText,
  pressStoppedText,
  topicNoteText,
} from '../src/copy';
import { seatAt } from '../src/press-view';
import { IDLE_ROULETTE, RESUME, ScriptedWebSocket, latestSocket } from './support/scripted-web-socket';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

beforeEach(() => {
  ScriptedWebSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  localStorage.clear();
  window.history.replaceState(null, '', '/roulette/?room=R1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NAMES = ['あや', 'ゆう', 'れん', 'みお'];
const ROSTER = {
  type: 'roster',
  room: {
    code: 'R1',
    participants: NAMES.map((n, i) => ({ participantId: `p${i + 1}`, displayName: n, presence: 'online', tools: ['roulette'] })),
  },
};
const WHEEL = NAMES.map((n, i) => ({ id: `p${i + 1}`, name: n }));
const PRESS_IDLE_STATE = { ...IDLE_ROULETTE, pickCount: 1, mode: 'press', order: null };
const PRESS = { p0: 1.5, rate: 20 };

/** 押して止める回転。止まっていれば、サーバーと同じく当たりの席と picks を止まった位置にそろえる */
function pressSpin(stop: { index: number; settle: number; by: string | null; atMs: number } | null = null, elapsedMs = 0) {
  const picked = stop === null ? { winnerIndex: 0, settle: 0.2, picks: [] } : { winnerIndex: stop.index, settle: stop.settle, picks: [{ index: stop.index, settle: stop.settle }] };
  return {
    ...PRESS_IDLE_STATE,
    spin: { seq: 1, wheel: WHEEL, ...picked, press: { ...PRESS, stop }, spunBy: 'ゆう', durationMs: PRESS_AUTO_STOP_MS, elapsedMs },
  };
}

function enterRoom(state: unknown): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver({ type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' });
    latestSocket().deliver(ROSTER);
    latestSocket().deliver({ type: 'roulette', state });
  });
}
const deliver = (state: unknown): void => {
  act(() => latestSocket().deliver({ type: 'roulette', state }));
};
const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const caption = () => document.querySelector('.roulette-caption')?.textContent;
const rotor = () => document.querySelector('.wheel-rotor')?.getAttribute('transform');
const cardName = () => document.querySelector('.roulette-card-name-text')?.textContent;
/** 真鍮の席の数（円盤の字は jsdom では測れないので、席の印で見る） */
const goldSeats = () => document.querySelectorAll('.wheel-segment--winner').length;
const stopButton = () => screen.getByRole('button', { name: STOP_BUTTON });

/**
 * @requirements #401 押して止める P1（決め方の面）
 */
describe('決め方の面', () => {
  it('Given 押して止める / When 脇を見る / Then 3 つ目が押された状態で、選ぶ人数は出ない。一言は回す前の説明', () => {
    // Given / When
    enterRoom(PRESS_IDLE_STATE);
    // Then
    const group = screen.getByRole('group', { name: MODE_HEADING });
    expect(within(group).getByRole('button', { name: MODE_PRESS })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: PICK_COUNT_LABEL })).toBeNull();
    expect(caption()).toBe(PRESS_IDLE);
  });
});

/**
 * @requirements #401 押して止める P2・P3・P9
 */
describe('押して止める', () => {
  it('Given 回っている / When 止めるを押す / Then 描いていた位置を送り、その場で止まる（返事を待たない）', () => {
    // Given
    enterRoom(pressSpin());
    advance(120);
    expect(caption()).toBe(PRESS_SPINNING);
    expect(document.querySelector('.roulette-stage')).toHaveAttribute('data-pick', 'single');
    latestSocket().sent.length = 0;
    // When
    act(() => stopButton().click());
    const sent = latestSocket().sentJson()[0] as { command: string; seq: number; index: number; settle: number };
    const at = rotor();
    advance(500);
    // Then
    expect(sent.command).toBe('roulette.stop');
    expect(sent.seq).toBe(1);
    expect(rotor()).toBe(at);
    expect(stopButton()).toBeDisabled();
    // When: 自分の押下が採られた返事が届く
    deliver(pressSpin({ index: sent.index, settle: sent.settle, by: 'あや', atMs: 130 }, 130));
    // Then: 動かずに、札と一言が出る
    expect(rotor()).toBe(at);
    expect(caption()).toBe(pressStoppedText('あや') + pressDecidedText(NAMES[sent.index]!));
    expect(cardName()).toBe(NAMES[sent.index]);
    expect(goldSeats()).toBe(1);
  });

  it('Given お題がある / When 回っている / Then 添え書きは 1 人を決める言い方のまま（止まるまで選ばれた人が空でも）', () => {
    // Given
    enterRoom(pressSpin());
    // When
    act(() =>
      latestSocket().deliver({ type: 'topic', state: { topic: { title: 'FizzBuzz', body: '', source: 'manual' }, generating: false, degraded: false, aiUnlocked: false } }),
    );
    // Then
    expect(screen.getByText(topicNoteText('FizzBuzz'))).toBeInTheDocument();
  });

  it('Given 回っている / When 文字の欄の外で Space を押す / Then 止める', () => {
    // Given
    enterRoom(pressSpin());
    advance(80);
    latestSocket().sent.length = 0;
    // When
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    // Then
    expect(latestSocket().sentJson()).toHaveLength(1);
    expect(latestSocket().sentJson()[0]).toMatchObject({ command: 'roulette.stop', seq: 1 });
  });

  it('Given 回っている / When 名前の欄で Space を打つ / Then 止めない', () => {
    // Given
    enterRoom(pressSpin());
    latestSocket().sent.length = 0;
    const input = document.querySelector('input[type="text"], input:not([type])') as HTMLInputElement;
    // When
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    // Then
    expect(latestSocket().sentJson()).toEqual([]);
  });

  it('Given 回っている / When ほかの人が止めた位置が届く / Then 前へ進んで寄せ、寄せ終わってから札と一言を出す', () => {
    // Given
    enterRoom(pressSpin());
    advance(100);
    // When: ゆうが 2 番の席で止めた
    deliver(pressSpin({ index: 2, settle: 0.5, by: 'ゆう', atMs: 90 }, 120));
    // Then: 寄せている間はまだ出さない
    expect(caption()).toBe(PRESS_SPINNING);
    expect(goldSeats()).toBe(0);
    advance(1700);
    expect(caption()).toBe(pressStoppedText('ゆう') + pressDecidedText('れん'));
    expect(cardName()).toBe('れん');
    expect(goldSeats()).toBe(1);
  });

  it('Given 止まった後に開いた / When 最初の描画 / Then 寄せずに止まった位置で結果が出ている', () => {
    // Given / When
    enterRoom(pressSpin({ index: 3, settle: 0.5, by: 'ゆう', atMs: 900 }, 5000));
    // Then
    expect(caption()).toBe(pressStoppedText('ゆう') + pressDecidedText('みお'));
    expect(goldSeats()).toBe(1);
    expect(cardName()).toBe('みお');
  });

  it('Given 誰も押さない / When 30 秒たつ / Then 30 秒の時点で指していた人に決まり、止める人がいなかったと言う', () => {
    // Given
    enterRoom(pressSpin());
    const expected = NAMES[seatAt(pressPositionAt({ press: { ...PRESS, stop: null }, wheel: WHEEL }, PRESS_AUTO_STOP_MS), 4).index]!;
    // When: 30 秒の時点で止まり、寄せ終わる
    advance(PRESS_AUTO_STOP_MS + 100);
    advance(2000);
    // Then
    expect(caption()).toBe(PRESS_AUTO_TEXT + pressDecidedText(expected));
    expect(cardName()).toBe(expected);
  });

  it('Given 動きを減らす設定 / When 回っている / Then 押して止めるときは円盤が回る（spec P8）', () => {
    // Given
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    enterRoom(pressSpin());
    const before = rotor();
    // When
    advance(130);
    // Then
    expect(rotor()).not.toBe(before);
    expect(caption()).toBe(PRESS_SPINNING);
  });
});
