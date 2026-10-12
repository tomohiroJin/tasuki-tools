/**
 * ルーレットのルームの画面（#94 PR 2）。偽の WebSocket と偽の時計で、受け取ったフレームから
 * 画面に何が出るかを見る。サーバーは立てない。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { App } from '../src/App';
import {
  CAPTION_IDLE,
  CYCLE_NOTE,
  DRAWN_MARK,
  GUEST_ADD_BUTTON,
  GUEST_HINT,
  SPINNING_BUTTON,
  SPIN_AGAIN_BUTTON,
  SPIN_BUTTON,
  TOO_FEW_TEXT,
  TWIN_MARK,
  CYCLE_RESET_BUTTON,
  cycleProgressText,
  guestRemoveLabel,
  resultText,
  spunByText,
  topicNoteText,
} from '../src/copy';
import { redirectTo } from '../src/router';
import { IDLE_ROULETTE, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, spinState } from './support/scripted-web-socket';

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
  vi.mocked(redirectTo).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 動きを減らす設定の差し替え（`matchMedia` は jsdom に無い） */
function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const JOINED = { type: 'room.joined', code: 'R1', participantId: 'p1', resumeToken: 't1' };

/** 入室して、名簿（あや・ゆう）と回す前の状態を受け取った画面。 */
function enterRoom(state: unknown = IDLE_ROULETTE): void {
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver(JOINED);
    latestSocket().deliver(ROSTER_FRAME);
    latestSocket().deliver({ type: 'roulette', state });
  });
}

const caption = () => screen.getByRole('status');
const spinButton = () => screen.getByRole('button', { name: new RegExp(`${SPIN_BUTTON}|${SPINNING_BUTTON}|${SPIN_AGAIN_BUTTON}`) });

/**
 * 回している間は当たりの名前を言わない。止まってから言う。
 * **見るのは回っている最中**（止まった後に見るだけでは、先に言う誤実装も通る）。
 *
 * @requirements #94 E19
 */
describe('結果の一言は止まってから当たりを言う', () => {
  it('Given 回し始めた / When 回っている間 / Then 一言は回した人だけを言い、当たりの名前は出ない', () => {
    // Given: あや（p1）が回し、当たりはゆう（p2）
    enterRoom();
    // When: 受け取った直後と、止まる直前
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 0) }));
    const atStart = caption().textContent;
    act(() => vi.advanceTimersByTime(3900));
    const nearEnd = caption().textContent;
    // Then
    expect(atStart).toBe(spunByText('あや'));
    expect(nearEnd).toBe(spunByText('あや'));
    expect(nearEnd).not.toContain('ゆう');
  });

  it('Given 回っている / When 回転の時間が過ぎる / Then 一言が結果になる', () => {
    // Given
    enterRoom();
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 0) }));
    // When
    act(() => vi.advanceTimersByTime(4100));
    // Then
    expect(caption()).toHaveTextContent(resultText('ゆう'));
  });

  it('Given 回転の途中で入った（経過 3 秒） / When 残りの時間が過ぎる / Then それまで回しているで、過ぎたら結果になる', () => {
    // Given
    enterRoom();
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 3000) }));
    expect(caption()).toHaveTextContent(spunByText('あや'));
    // When / Then
    act(() => vi.advanceTimersByTime(900));
    expect(caption()).toHaveTextContent(spunByText('あや'));
    act(() => vi.advanceTimersByTime(200));
    expect(caption()).toHaveTextContent(resultText('ゆう'));
  });

  it('Given 回転が終わった後に入った / When 状態を受け取る / Then 受け取った直後から結果が出る', () => {
    // Given / When
    enterRoom(spinState(1, 4000));
    // Then
    expect(caption()).toHaveTextContent(resultText('ゆう'));
  });

  it('Given 動きを減らす設定 / When 回転を受け取る / Then 受け取った直後に結果が出る。主ボタンは回転の間だけ押せない', () => {
    // Given
    stubReducedMotion(true);
    enterRoom();
    // When
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 0) }));
    // Then: 一言は結果。ただしサーバーは次の回転を拒むので、主ボタンは回転の間 押せない
    expect(caption()).toHaveTextContent(resultText('ゆう'));
    expect(spinButton()).toBeDisabled();
    expect(spinButton()).toHaveTextContent(SPINNING_BUTTON);
    act(() => vi.advanceTimersByTime(4100));
    expect(spinButton()).toBeEnabled();
  });

  it('Given 回す前 / When 画面を見る / Then 回すとの案内と主ボタン', () => {
    // Given
    // When
    enterRoom();
    // Then
    expect(caption()).toHaveTextContent(CAPTION_IDLE);
    expect(spinButton()).toHaveTextContent(SPIN_BUTTON);
    expect(spinButton()).toBeEnabled();
  });
});

/**
 * 回っている間、一覧の「選ばれた」と一周の数に今回の当たりを入れない。
 *
 * @requirements #94 E19
 */
describe('一覧と一周の数は止まってから今回の当たりを数える', () => {
  const rowOf = (name: string) => screen.getByText(new RegExp(`^${name}`)).closest('li') as HTMLElement;

  it('Given 回している / When 回っている間と止まった後 / Then 当たりの行に選ばれたが出るのは止まった後', () => {
    // Given: 当たりはゆう。ゆうの行を見る
    enterRoom();
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 0) }));
    // When / Then: 回っている間
    expect(within(rowOf('ゆう')).queryByText(DRAWN_MARK)).toBeNull();
    expect(screen.getByText(CYCLE_NOTE)).toBeInTheDocument();
    // When / Then: 止まった後
    act(() => vi.advanceTimersByTime(4100));
    expect(within(rowOf('ゆう')).getByText(DRAWN_MARK)).toBeInTheDocument();
    expect(screen.getByText(cycleProgressText(1, 2))).toBeInTheDocument();
  });
});

describe('回す・入る人・一周の操作', () => {
  it('Given 入る人が 2 人 / When 主ボタンを押す / Then 回すコマンドを送る', () => {
    // Given
    enterRoom();
    // When
    fireEvent.click(spinButton());
    // Then
    expect(latestSocket().sentJson().at(-1)).toEqual({ command: 'roulette.spin' });
  });

  it('Given 入る人が 1 人（相手が離席中） / When 画面を見る / Then 主ボタンは押せず、2 人から回せますと出る', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => {
      latestSocket().open();
      latestSocket().deliver(JOINED);
      latestSocket().deliver({
        type: 'roster',
        room: {
          code: 'R1',
          participants: [
            { participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['roulette'] },
            { participantId: 'p2', displayName: 'ゆう', presence: 'offline', tools: [] },
          ],
        },
      });
      latestSocket().deliver({ type: 'roulette', state: IDLE_ROULETTE });
    });
    // When / Then
    expect(spinButton()).toBeDisabled();
    expect(caption()).toHaveTextContent(TOO_FEW_TEXT);
  });

  it('Given 一覧のチェック / When 外す / Then 外すコマンドを送る', () => {
    // Given
    enterRoom();
    // When
    fireEvent.click(screen.getByRole('checkbox', { name: /^ゆう/ }));
    // Then
    expect(latestSocket().sentJson().at(-1)).toEqual({ command: 'roulette.include', id: 'p2', included: false });
  });

  it('Given 自分 / When 一覧を見る / Then あなたの印が付く', () => {
    // Given / When
    enterRoom();
    // Then
    expect(screen.getByRole('checkbox', { name: /^あや（あなた）/ })).toBeInTheDocument();
  });

  it('Given ゲストを追加する / When 名前を書いて追加を押す / Then 追加コマンドを送り、欄を空にする', () => {
    // Given
    enterRoom();
    const input = screen.getByLabelText(GUEST_HINT);
    // When
    fireEvent.change(input, { target: { value: 'はな' } });
    fireEvent.click(screen.getByRole('button', { name: GUEST_ADD_BUTTON }));
    // Then
    expect(latestSocket().sentJson().at(-1)).toEqual({ command: 'roulette.guest.add', name: 'はな' });
    expect(input).toHaveValue('');
  });

  it('Given ゲストが 2 人 / When 消すボタンを見る / Then 名前で区別でき、押すと消すコマンドを送る', () => {
    // Given
    enterRoom({
      ...IDLE_ROULETTE,
      guests: [
        { id: 'g-1', name: 'はな' },
        { id: 'g-2', name: 'そう' },
      ],
    });
    // When
    const second = screen.getByRole('button', { name: guestRemoveLabel('そう') });
    // Then
    expect(screen.getByRole('button', { name: guestRemoveLabel('はな') })).toBeInTheDocument();
    fireEvent.click(second);
    expect(latestSocket().sentJson().at(-1)).toEqual({ command: 'roulette.guest.remove', id: 'g-2' });
  });

  it('Given 在室者と同じ名前のゲスト / When 一覧を見る / Then そのチェックは押せず、読み上げが印の文言で理由を言う', () => {
    // Given: 在室のゆうと同じ名前のゲスト
    enterRoom({ ...IDLE_ROULETTE, guests: [{ id: 'g-1', name: 'ゆう' }] });
    // When
    const boxes = screen.getAllByRole('checkbox', { name: /^ゆう/ });
    // Then: 2 つ目（ゲスト）だけ押せず、説明が印の文言になる
    expect(boxes.map((b) => (b as HTMLInputElement).disabled)).toEqual([false, true]);
    expect(boxes[1]).toHaveAccessibleDescription(TWIN_MARK);
  });

  it('Given 一周をやり直す / When 押す / Then やり直すコマンドを送る', () => {
    // Given
    enterRoom();
    // When
    fireEvent.click(screen.getByRole('button', { name: CYCLE_RESET_BUTTON }));
    // Then
    expect(latestSocket().sentJson().at(-1)).toEqual({ command: 'roulette.cycle.reset' });
  });

  it('Given 回っている / When 一覧の操作を見る / Then 外す・足す・やり直すは押せない', () => {
    // Given
    enterRoom();
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 0) }));
    // When / Then
    expect(screen.getByRole('checkbox', { name: /^ゆう/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: CYCLE_RESET_BUTTON })).toBeDisabled();
  });
});

/**
 * @requirements #94 E20
 */
describe('お題の添え書き', () => {
  const topicFrame = (title: string | null) => ({
    type: 'topic',
    state: {
      topic: title === null ? null : { title, body: '', source: 'manual' },
      generating: false,
      degraded: false,
      aiUnlocked: false,
    },
  });

  it('Given お題がある / When 画面を見る / Then お題のタイトルを入れた添え書きが出る', () => {
    // Given
    enterRoom();
    // When
    act(() => latestSocket().deliver(topicFrame('FizzBuzz')));
    // Then
    expect(screen.getByText(topicNoteText('FizzBuzz'))).toBeInTheDocument();
  });

  it('Given お題が無い / When 画面を見る / Then 添え書きは出ない。お題が下りたら消える', () => {
    // Given
    enterRoom();
    // When
    act(() => latestSocket().deliver(topicFrame(null)));
    // Then
    expect(screen.queryByText(/の進行役を決めます/)).toBeNull();
    act(() => latestSocket().deliver(topicFrame('FizzBuzz')));
    expect(screen.getByText(topicNoteText('FizzBuzz'))).toBeInTheDocument();
    act(() => latestSocket().deliver(topicFrame(null)));
    expect(screen.queryByText(/の進行役を決めます/)).toBeNull();
  });
});

describe('入り方と戻り方', () => {
  it('Given 復帰の組が無い / When 開く / Then 繋がずに玄関のそのルームへ送り返す', () => {
    // Given: 復帰の組を置いていない
    // When
    render(<App />);
    // Then
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1');
  });

  it('Given 入れた / When 抜けた知らせが届く / Then 理由を持って玄関へ戻る', () => {
    // Given
    enterRoom();
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'LEFT_ROOM', message: 'x' }));
    // Then
    expect(redirectTo).toHaveBeenCalledWith('/?room=R1&left=self');
  });

  it('Given ルームが消えていた / When ROOM_NOT_FOUND が返る / Then 見つからないと伝える', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    act(() => latestSocket().open());
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' }));
    // Then
    expect(screen.getByRole('heading', { name: 'ルームが見つかりません' })).toBeInTheDocument();
  });

  it('Given 操作の失敗が届く / When 画面を見る / Then サーバーの文を見せる', () => {
    // Given
    enterRoom();
    // When
    act(() => latestSocket().deliver({ type: 'error', code: 'GUEST_NAME_TAKEN', message: 'この名前はすでにいます' }));
    // Then
    expect(screen.getByRole('alert')).toHaveTextContent('この名前はすでにいます');
  });
});
