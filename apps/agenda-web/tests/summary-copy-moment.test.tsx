/**
 * 終了の一覧の Markdown の見出しの日時（#676）。「この端末で終了の一覧を最初に出した時刻」で、
 * 映す表示の出入りでは変わらず、終了でなくなって（最初からやり直して）もう一度終わったら取り直す。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunScreen } from '../src/components/RunScreen';
import { PROJECT_BUTTON, SUMMARY_COPY_BUTTON, SUMMARY_COPY_MANUAL_FIELD } from '../src/copy';
import { summaryMarkdown } from '../src/summary-markdown';
import { Driver } from './support/agenda-states';

const T1 = new Date(Date.UTC(2026, 10, 23, 5, 5, 0));
const T2 = new Date(Date.UTC(2026, 10, 23, 6, 40, 0));
const T3 = new Date(Date.UTC(2026, 10, 23, 8, 15, 0));

const finished = new Driver([1, 2], '朝会').next(90_000).next(250_000).view(250_000);
const running = new Driver([1, 2], '朝会').view(30_000);
const noop = () => undefined;
const actions = { next: noop, pause: noop, resume: noop, extend: noop, setSkipped: noop, reset: noop };

/** その時刻で書かれるはずの見出しの行 */
const headingAt = (t: Date): string => summaryMarkdown(finished, { wallMs: t.getTime(), tzOffsetMin: -t.getTimezoneOffset() }).split('\n')[0]!;

beforeEach(() => {
  // コピーを失敗させ、書き出す文を手で選べる欄から読む
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  document.execCommand = () => false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const screenAt = (view: typeof finished, wallNow: Date, projecting: boolean) => (
  <RunScreen
    view={view}
    wallNow={wallNow}
    reducedMotion
    striking={false}
    canOperate
    actions={actions}
    soundToggle={null}
    onSpeakSummary={noop}
    projecting={projecting}
    onProjectingChange={noop}
    consumeStartArrival={() => false}
  />
);

async function copiedHeading(): Promise<string> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: SUMMARY_COPY_BUTTON }));
  });
  return (screen.getByRole('textbox', { name: SUMMARY_COPY_MANUAL_FIELD }) as HTMLTextAreaElement).value.split('\n')[0]!;
}

/**
 * @requirements #676
 */
describe('終了の一覧の Markdown の日時', () => {
  it('Given 終了の一覧を出した / When 映す表示へ入って戻り、時計が進んだ / Then 見出しの日時は最初に出した時刻のまま', async () => {
    const { rerender } = render(screenAt(finished, T1, false));
    expect(await copiedHeading()).toBe(headingAt(T1));
    rerender(screenAt(finished, T2, true));
    expect(screen.queryByRole('button', { name: SUMMARY_COPY_BUTTON })).toBeNull();
    rerender(screenAt(finished, T2, false));
    expect(screen.getByRole('button', { name: PROJECT_BUTTON })).toBeInTheDocument();
    expect(await copiedHeading()).toBe(headingAt(T1));
    expect(headingAt(T1)).not.toBe(headingAt(T2));
  });

  it('Given 終了の一覧を出した / When 開始前へ戻して（終了でなくなり）もう一度終わった / Then 見出しの日時は新しい時刻になる', async () => {
    const { rerender } = render(screenAt(finished, T1, false));
    expect(await copiedHeading()).toBe(headingAt(T1));
    rerender(screenAt(running, T2, false));
    expect(screen.queryByRole('button', { name: SUMMARY_COPY_BUTTON })).toBeNull();
    rerender(screenAt(finished, T3, false));
    expect(await copiedHeading()).toBe(headingAt(T3));
  });
});
