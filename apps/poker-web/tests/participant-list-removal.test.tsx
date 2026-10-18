/**
 * 席の一覧の呼び分けと、接続の無い人の片付け（#419・設計 §7a.1 G-1・§7a.2 G-4）。
 *
 * @requirements #419 spec §7a.1, §7a.2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { ParticipantList } from '../src/components/ParticipantList';

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };

beforeEach(() => {
  // jsdom は `showModal` / `close` を持たないので、open 属性と close イベントだけ模す
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
  cleanup();
});

const p = (id: string, name: string, connected = true) => ({
  id,
  name,
  connected,
  hasVoted: false,
  spectator: false,
});

function names(): string[] {
  return [...document.querySelectorAll('.participants li .name')].map((n) =>
    (n.textContent ?? '').replace('（あなた）', ''),
  );
}

describe('同名の呼び分け（G-1）', () => {
  it('Given 同名の 2 人 / When 描く / Then 両方に（ID: 末尾 4）が付く', () => {
    render(
      <ParticipantList
        participants={[
          p('aaaa-1111', 'あや'),
          p('bbbb-2222', 'あや'),
          p('cccc-3333', 'うみ'),
        ]}
        you="aaaa-1111"
        votes={null}
        onRemove={() => {}}
      />,
    );
    expect(names()).toEqual(['あや（ID: 1111）', 'あや（ID: 2222）', 'うみ']);
  });

  it('Given 同名が居ない / When 描く / Then ID は付かない', () => {
    render(
      <ParticipantList
        participants={[p('a', 'あや'), p('b', 'うみ')]}
        you="a"
        votes={null}
        onRemove={() => {}}
      />,
    );
    expect(names()).toEqual(['あや', 'うみ']);
  });
});

describe('接続の無い人を外す（G-4）', () => {
  const people = [
    p('me-0001', 'あや', false),
    p('x-0002', 'あや', false),
    p('y-0003', 'うみ', true),
    p('z-0004', 'えり', false),
  ];

  it('Given 切断中の自分・切断中の他人・接続中の他人 / When 描く / Then 「退出させる」は切断中の他人の行だけ', () => {
    render(
      <ParticipantList
        participants={people}
        you="me-0001"
        votes={null}
        onRemove={() => {}}
      />,
    );
    const rows = [
      ...document.querySelectorAll('.participants li'),
    ] as HTMLElement[];
    const has = rows.map(
      (r) => within(r).queryByRole('button', { name: '退出させる' }) !== null,
    );
    // 自分（切断中でも無い）・接続中は無い
    expect(has).toEqual([false, true, false, true]);
  });

  it('Given ボタンを押す / When キャンセル / Then 送らず、確認は閉じてフォーカスは押した行へ戻る', () => {
    const onRemove = vi.fn();
    render(
      <ParticipantList
        participants={people}
        you="me-0001"
        votes={null}
        onRemove={onRemove}
      />,
    );
    const row = screen.getByText('えり').closest('li') as HTMLElement;
    const trigger = within(row).getByRole('button', { name: '退出させる' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'えり さんを退出させますか？',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('Given 確認が開いている / When 「退出させる」で確定 / Then removeParticipant 相当に ID を渡す（1 回だけ）', () => {
    const onRemove = vi.fn();
    render(
      <ParticipantList
        participants={people}
        you="me-0001"
        votes={null}
        onRemove={onRemove}
      />,
    );
    const row = screen.getByText('えり').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '退出させる' }));
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.click(within(dialog).getByRole('button', { name: '退出させる' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('z-0004');
  });

  it('Given 同名の幽霊 / When 確認を開く / Then 題に ID が付く', () => {
    render(
      <ParticipantList
        participants={people}
        you="me-0001"
        votes={null}
        onRemove={() => {}}
      />,
    );
    const row = screen
      .getByText(/あや（ID: 0002）/)
      .closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '退出させる' }));
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'あや さん（ID: 0002）を退出させますか？',
    );
  });
});
