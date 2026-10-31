/**
 * 接続の告知の帯（#471・#463-C2）。checkin・roulette・topic・poker・agenda が同じ文・同じ役割で出す。
 *
 * **オラクルは文字列と役割を手で書く**（実装の定数を引かない）。文 3 つの正本はこの入口の 1 か所である。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConnectionBanner, connectionNotice } from '../src/room/index.js';

afterEach(cleanup);

describe('connectionNotice（種類 → 文）', () => {
  it('Given 4 種の種類 / When 文を当てる / Then 手で書いた文と一致する', () => {
    expect(connectionNotice('none')).toEqual({ kind: 'none' });
    expect(connectionNotice('reconnecting')).toEqual({
      kind: 'reconnecting',
      text: '接続中です…（切断された場合は自動で再接続します）',
    });
    expect(connectionNotice('unreachable')).toEqual({
      kind: 'unreachable',
      text: '同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。',
    });
    expect(connectionNotice('stale')).toEqual({
      kind: 'stale',
      text: '同期できていません。表示が最新でない可能性があります。',
    });
  });

  it('Given 繋がらない / When 文を見る / Then 操作できない理由まで書き、「作成」とは言わない', () => {
    const notice = connectionNotice('unreachable');
    expect(notice.kind === 'unreachable' && notice.text).toContain('参加できません');
    expect(notice.kind === 'unreachable' && notice.text).not.toContain('作成');
  });

  it('Given 同期できていない / When 文を見る / Then 再読込を促さない（直らない）', () => {
    const notice = connectionNotice('stale');
    expect(notice.kind === 'stale' && notice.text).not.toContain('再読込');
  });
});

describe('ConnectionBanner', () => {
  it('Given none / When 描く / Then 何も描かない', () => {
    const { container } = render(<ConnectionBanner kind="none" />);
    expect(container.firstChild).toBeNull();
  });

  it('Given reconnecting / When 描く / Then ui-banner の p を role=status で出す', () => {
    render(<ConnectionBanner kind="reconnecting" />);
    const banner = screen.getByRole('status');
    expect(banner.tagName).toBe('P');
    expect(banner.className).toBe('ui-banner');
    expect(banner.textContent).toBe('接続中です…（切断された場合は自動で再接続します）');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Given stale / When 描く / Then role=status で同期できていない文を出す', () => {
    render(<ConnectionBanner kind="stale" />);
    const banner = screen.getByRole('status');
    expect(banner.className).toBe('ui-banner');
    expect(banner.textContent).toBe('同期できていません。表示が最新でない可能性があります。');
  });

  it('Given unreachable / When 描く / Then ui-banner--unreachable を重ね role=alert で出す', () => {
    render(<ConnectionBanner kind="unreachable" />);
    const banner = screen.getByRole('alert');
    expect(banner.tagName).toBe('P');
    expect(banner.className).toBe('ui-banner ui-banner--unreachable');
    expect(banner.textContent).toBe('同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
