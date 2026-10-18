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
import { PARTICIPANTS_HEADING_ID, ParticipantList } from '../src/components/ParticipantList';

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

  it('Given 見学者と投票者が同名 / When 描く / Then 両方に識別子が付く', () => {
    render(
      <ParticipantList
        participants={[p('aaaa-1111', 'あや'), { ...p('bbbb-2222', 'あや'), spectator: true }]}
        you="aaaa-1111"
        votes={null}
        onRemove={() => {}}
      />,
    );
    expect(names()).toEqual(['あや（ID: 1111）', 'あや（ID: 2222）']);
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

  const open = (list = people) => {
    const onRemove = vi.fn();
    const props = { you: 'me-0001', votes: null, onRemove };
    const view = render(<ParticipantList participants={list} {...props} />);
    const row = screen.getByText('えり').closest('li') as HTMLElement;
    const trigger = within(row).getByRole('button', { name: '退出させる' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    return { view, props, trigger, dialog, onRemove };
  };

  it('Given 切断中 / When offline / Then 「退出させる」は押せない', () => {
    render(<ParticipantList participants={people} you="me-0001" votes={null} onRemove={() => {}} offline />);
    for (const b of screen.getAllByRole('button', { name: '退出させる' })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('Given 確認が開いている / When 対象が他の人に外されて一覧から消える / Then 確認は閉じ、フォーカスは見出しへ', () => {
    const heading = document.createElement('h2');
    heading.id = PARTICIPANTS_HEADING_ID;
    heading.tabIndex = -1;
    document.body.appendChild(heading);
    const { view, props } = open();
    view.rerender(<ParticipantList participants={people.filter((x) => x.id !== 'z-0004')} {...props} />);
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(heading);
    heading.remove();
  });

  it('Given 確認が開いている / When 対象が再接続する / Then 確認は閉じ、再び切断しても勝手に開かない', () => {
    const heading = document.createElement('h2');
    heading.id = PARTICIPANTS_HEADING_ID;
    heading.tabIndex = -1;
    document.body.appendChild(heading);
    const { view, props } = open();
    const back = people.map((x) => (x.id === 'z-0004' ? { ...x, connected: true } : x));
    view.rerender(<ParticipantList participants={back} {...props} />);
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(heading);
    view.rerender(<ParticipantList participants={people} {...props} />);
    expect(document.querySelector('dialog')).toBeNull();
    heading.remove();
  });

  it('Given 確定した / When 行が消えた再描画 / Then 見出しへ。それまでは押したボタンに留まる', () => {
    const heading = document.createElement('h2');
    heading.id = PARTICIPANTS_HEADING_ID;
    heading.tabIndex = -1;
    document.body.appendChild(heading);
    const { view, props, trigger, dialog } = open();
    fireEvent.click(within(dialog).getByRole('button', { name: '退出させる' }));
    expect(document.activeElement).toBe(trigger);
    view.rerender(<ParticipantList participants={people.filter((x) => x.id !== 'z-0004')} {...props} />);
    expect(document.activeElement).toBe(heading);
    heading.remove();
  });

  it('Given 確定したがサーバーが拒み行が残る / When 再描画 / Then フォーカスは押したボタンのまま', () => {
    const heading = document.createElement('h2');
    heading.id = PARTICIPANTS_HEADING_ID;
    heading.tabIndex = -1;
    document.body.appendChild(heading);
    const { view, props, trigger, dialog } = open();
    fireEvent.click(within(dialog).getByRole('button', { name: '退出させる' }));
    view.rerender(<ParticipantList participants={[...people]} {...props} />);
    expect(document.activeElement).toBe(trigger);
    heading.remove();
  });

  it('Given 拒否で行が残った / When 利用者が別の欄へ移ったあとで対象が消える / Then フォーカスは奪わない', () => {
    const heading = document.createElement('h2');
    heading.id = PARTICIPANTS_HEADING_ID;
    heading.tabIndex = -1;
    const field = document.createElement('input');
    document.body.append(heading, field);
    const { view, props, dialog } = open();
    fireEvent.click(within(dialog).getByRole('button', { name: '退出させる' }));
    // 拒否: 対象は接続中として残る
    const rejected = people.map((x) => (x.id === 'z-0004' ? { ...x, connected: true } : x));
    view.rerender(<ParticipantList participants={rejected} {...props} />);
    field.focus();
    view.rerender(<ParticipantList participants={rejected.filter((x) => x.id !== 'z-0004')} {...props} />);
    expect(document.activeElement).toBe(field);
    heading.remove();
    field.remove();
  });

  it('Given 確定したが拒否の再描画が無い / When 行が消えるまでに別の欄へ移る / Then フォーカスは奪わない', () => {
    const heading = document.createElement('h2');
    heading.id = PARTICIPANTS_HEADING_ID;
    heading.tabIndex = -1;
    const field = document.createElement('input');
    document.body.append(heading, field);
    const { view, props, dialog } = open();
    fireEvent.click(within(dialog).getByRole('button', { name: '退出させる' }));
    field.focus();
    view.rerender(<ParticipantList participants={people.filter((x) => x.id !== 'z-0004')} {...props} />);
    expect(document.activeElement).toBe(field);
    heading.remove();
    field.remove();
  });

  it('Given 確認が開いている / When offline になる / Then 確認の「退出させる」も押せない', () => {
    const { view, props, dialog } = open();
    expect((within(dialog).getByRole('button', { name: '退出させる' }) as HTMLButtonElement).disabled).toBe(false);
    view.rerender(<ParticipantList participants={people} {...props} offline />);
    expect((within(dialog).getByRole('button', { name: '退出させる' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Given 幽霊の行 / When 描く / Then 「退出させる」は薄めの外で折り返さない印（remove-ghost）を持つ。確認は部品の並び（ui-actions）を使う', () => {
    render(<ParticipantList participants={people} you="me-0001" votes={null} onRemove={() => {}} />);
    const row = screen.getByText('えり').closest('li') as HTMLElement;
    expect(within(row).getByRole('button', { name: '退出させる' }).classList.contains('remove-ghost')).toBe(true);
    fireEvent.click(within(row).getByRole('button', { name: '退出させる' }));
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.querySelector('.ui-actions')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: '退出させる' }).classList.contains('ui-button--danger')).toBe(true);
  });

  it('Given 見学者と投票者 / When 描く / Then 見学者の席にも札と同じ枠があり、印はその中にある', () => {
    render(
      <ParticipantList
        participants={[p('a', 'あかり'), { ...p('b', 'いずみ'), spectator: true }]}
        you="a"
        votes={null}
        onRemove={() => {}}
      />,
    );
    const row = screen.getByText('いずみ').closest('li') as HTMLElement;
    const slot = row.querySelector('.seat-slot') as HTMLElement;
    expect(slot.querySelector('.badge.spectator')?.textContent).toBe('見学');
    expect(row.firstElementChild).toBe(slot);
  });
});

describe('開票後に票を持つ見学者の印', () => {
  it('Given 票が札として残る見学者 / When 描く / Then 札のほかに「見学」の印も出る', () => {
    render(
      <ParticipantList
        participants={[p('a', 'あかり'), { ...p('b', 'いずみ'), spectator: true }]}
        you="a"
        votes={new Map([['b', { kind: 'number', value: 8 }]])}
        onRemove={() => {}}
      />,
    );
    const row = screen.getByText('いずみ').closest('li') as HTMLElement;
    expect(within(row).getByRole('img').getAttribute('aria-label')).toBe('8');
    expect(within(row).getByText('見学')).toBeTruthy();
  });
});
