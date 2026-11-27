/**
 * ファイルの保存（#476 第 2 段 B9）。ダウンロードの URL は、クリックの直後には手放さない。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVOKE_DELAY_MS, downloadTextFile } from '../src/platform/download';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('downloadTextFile', () => {
  it('Given 保存を押した / When クリックの直後 / Then URL はまだ手放さず、少し後に手放す', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadTextFile('a.csv', 'x');

    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
