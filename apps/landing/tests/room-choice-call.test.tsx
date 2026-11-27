/**
 * 選択画面の「みんなを呼ぶ」（#677）。同期フックを通さず、画面が受け取った値をどう映し・何を呼ぶかを見る。
 * 同期フックとの配線は `tests/hub/hub-call.test.tsx` が受け持つ。
 *
 * @requirements #677
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { outsideBase } from '@tasuki/test-css/font-base';
import { RoomChoice, type RoomChoiceProps } from '../src/screens/RoomChoice.js';

afterEach(cleanup);

function showChoice(overrides: Partial<RoomChoiceProps> = {}) {
  const onCall = vi.fn();
  const view = render(
    <RoomChoice
      code="朝会-ab12"
      inviteUrl="https://example.test/?room=ab12"
      roster={null}
      connection="online"
      topicTitle={null}
      passphraseProtected={false}
      onSetPassphrase={() => undefined}
      onCall={onCall}
      {...overrides}
    />,
  );
  return { onCall, ...view };
}

const select = () => screen.getByLabelText('呼ぶ道具') as HTMLSelectElement;
const callButton = () => screen.getByRole('button', { name: '呼んで移る' });

describe('選択画面のみんなを呼ぶ', () => {
  it('Given 選択画面 / When 見る / Then 参加者の領域の中に「みんなを呼ぶ」の操作がある', () => {
    showChoice();

    const roster = screen.getByRole('heading', { name: '参加者' }).closest('section')!;
    expect(roster).toContainElement(select());
    expect(roster).toContainElement(callButton());
  });

  it('Given 道具を選んだ / When 呼んで移るを押す / Then その道具の ID で呼ぶ', () => {
    const { onCall } = showChoice();

    fireEvent.change(select(), { target: { value: 'agenda' } });
    fireEvent.click(callButton());

    expect(onCall).toHaveBeenCalledExactlyOnceWith('agenda');
  });

  it('Given 受け付けを待っている / When 見る / Then 押せず、送信しても呼ばない', () => {
    const { onCall } = showChoice({ calling: true });

    fireEvent.change(select(), { target: { value: 'agenda' } });

    expect(callButton()).toBeDisabled();
    fireEvent.submit(select().closest('form')!);
    expect(onCall).not.toHaveBeenCalled();
  });

  it('Given 同期サーバーに繋がっていない / When 見る / Then 押せず、送信しても呼ばない（送信が黙って積まれる）', () => {
    const { onCall } = showChoice({ connection: 'reconnecting' });

    fireEvent.change(select(), { target: { value: 'agenda' } });

    expect(callButton()).toBeDisabled();
    fireEvent.submit(select().closest('form')!);
    expect(onCall).not.toHaveBeenCalled();
  });

  it('Given 道具を選んでいない / When 送信する / Then 呼ばない', () => {
    const { onCall } = showChoice();

    fireEvent.submit(select().closest('form')!);

    expect(onCall).not.toHaveBeenCalled();
  });

  it('Given 呼びかけの失敗の文言 / When 見る / Then この操作の中に alert で出る', () => {
    showChoice({ callError: '少し待ってから呼んでください。' });

    expect(select().closest('form')).toContainElement(screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent('少し待ってから呼んでください。');
  });

  it('Given 失敗が無い / When 見る / Then alert は出ない', () => {
    showChoice();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('呼びかけの知らせ', () => {
  const call = { tool: 'poker', fromParticipantId: 'p2', fromName: 'いお' };

  it('Given 呼びかけ / When 見る / Then 知らせが出て、閉じるで onDismissRoomCall を呼ぶ', () => {
    const onDismissRoomCall = vi.fn();
    showChoice({ roomCall: call, onDismissRoomCall });

    expect(screen.getByRole('link', { name: '移る' })).toHaveAttribute('href', `/poker/?room=${encodeURIComponent('朝会-ab12')}`);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onDismissRoomCall).toHaveBeenCalledOnce();
  });

  it('Given 呼びかけが無い / When 見る / Then 知らせは出ない', () => {
    showChoice({ roomCall: null });

    expect(screen.queryByRole('link', { name: '移る' })).toBeNull();
  });
});

// 文言の字は書体の常用の層（base）に収める（`packages/ui/README.md`）。
describe('みんなを呼ぶの文言は書体の常用の層に収まる', () => {
  it('Given 失敗の文言つきの画面 / When 描かれた文字を base 層に当てる / Then 外れる字は無い', () => {
    showChoice({ callError: '少し待ってから呼んでください。' });

    const text = select().closest('form')?.textContent ?? '';
    expect(text.length).toBeGreaterThan(20);
    expect(outsideBase([text])).toEqual([]);
  });
});
