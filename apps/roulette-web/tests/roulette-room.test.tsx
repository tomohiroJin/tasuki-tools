/**
 * ルーレットのルームの画面（#94 PR 2）。偽の WebSocket と偽の時計で、受け取ったフレームから
 * 画面に何が出るかを見る。サーバーは立てない。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOM_HEADER_TEXT } from '@tasuki/invite-ui';
import { MAX_DISPLAY_NAME } from '@tasuki/room-core';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { REGULARS_KEY } from '../src/storage/regulars';
import { App } from '../src/App';
import {
  CAPTION_IDLE,
  GUEST_ADD_BUTTON,
  GUEST_HINT,
  SPINNING_BUTTON,
  SPIN_AGAIN_BUTTON,
  SPIN_BUTTON,
  TOO_FEW_TEXT,
  TWIN_MARK,
  guestRemoveLabel,
  resultText,
  spunByText,
  topicNoteText,
} from '../src/copy';
import { redirectTo } from '../src/router';
import { stageCaption } from './support/stage-caption';
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

const caption = stageCaption;
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
 * 一周の規則は無い。止まった後も一覧に「選ばれた」は付かず、一周の行も「一周をやり直す」も出ない。
 *
 * @requirements #427 F
 */
describe('一周の印は画面に出ない', () => {
  it('Given 当たりが決まった（wire の drawn に古い記録があっても） / When 回っている間と止まった後 / Then 一周の行・選ばれた・一周をやり直すはどちらにも無い', () => {
    // Given
    enterRoom();
    act(() => latestSocket().deliver({ type: 'roulette', state: { ...spinState(1, 0), drawn: ['p2'] } }));
    const none = (): void => {
      expect(screen.queryByText(/選ばれた/)).toBeNull();
      expect(screen.queryByText(/一周/)).toBeNull();
      expect(screen.queryByRole('button', { name: /やり直す/ })).toBeNull();
    };
    // When / Then
    none();
    act(() => vi.advanceTimersByTime(4100));
    none();
  });
});

describe('回す・入る人の操作', () => {
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

  it('Given ゲストの名前欄 / When 上限を見る / Then 表示名の規約の上限と同じ字数まで打てる（#373）', () => {
    // Given / When
    enterRoom();
    const input = screen.getByLabelText<HTMLInputElement>(GUEST_HINT);
    // Then: 自前の数字ではなく正本（`MAX_DISPLAY_NAME`）と突き合わせる。jsdom の fireEvent は
    // maxLength を無視して値を入れてしまうので、打てる字数は属性で見る（24 字で切れていた欠陥の赤）
    expect(input.maxLength).toBe(MAX_DISPLAY_NAME);
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

  it('Given 回っている / When 一覧の操作を見る / Then 外すは押せない', () => {
    // Given
    enterRoom();
    act(() => latestSocket().deliver({ type: 'roulette', state: spinState(1, 0) }));
    // When / Then
    expect(screen.getByRole('checkbox', { name: /^ゆう/ })).toBeDisabled();
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

  it('Given 入れていた / When 切れる / Then 再接続中と伝える', () => {
    // Given / When: 入れていた画面が切れる
    enterRoom();
    act(() => latestSocket().drop());
    // Then: 告知の種類は共有の規則（`@tasuki/sync-client`）が決め、文は `@tasuki/web-kit/room` の正本になる
    expect(screen.getByText('接続中です…（切断された場合は自動で再接続します）')).toBeInTheDocument();
  });

  it('Given 一度も繋がらない / When 失敗する / Then 繋がらないと警告する', () => {
    // Given
    saveResumeIdentity(RESUME);
    render(<App />);
    // When
    act(() => latestSocket().drop());
    // Then
    expect(screen.getByRole('alert')).toHaveTextContent('同期サーバーに接続できません。復旧するまでルームに参加できません。再試行を続けています。');
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

describe('ルームの見出しは共通の部品が描く（#447 段 1）', () => {
  it('Given 入室したルーム / When 描く / Then 招待は見出しに 1 つだけ', () => {
    // Given / When
    enterRoom();
    // Then: 招待リンクのコピーは見出しの中に 1 つだけ。脇の「仲間を招く」は無い
    const copyButtons = screen.getAllByRole('button', { name: ROOM_HEADER_TEXT.copy });
    expect(copyButtons).toHaveLength(1);
    expect(copyButtons[0]?.closest('.ui-room-header')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '仲間を招く' })).toBeNull();
    // ルームコードも見出しに出る（招待 URL の中の 'R1' とは区別し、コードの値だけを見る）
    expect(document.querySelector('.ui-room-header-code-value')?.textContent).toBe('R1');
  });
});

describe('いつものメンツを入れる（#458）', () => {
  const seedGroups = (items: { id: string; name: string; usedAt: number; members: string[] }[]): void => {
    localStorage.setItem(REGULARS_KEY, JSON.stringify({ version: 1, items }));
  };

  it('Given 自分の名前を含む組 / When 札を押す / Then addMany を送り、とばした知らせが出て、組が先頭へ動いてもフォーカスは札のまま', () => {
    // Given: あや（自分）・ゆうが在室。組に あや が入っている
    seedGroups([
      { id: 'a', name: '朝会', usedAt: 1, members: ['あや', 'さとう', 'すずき'] },
      { id: 'b', name: '夕会', usedAt: 2, members: ['たなか'] },
    ]);
    enterRoom();
    expect(screen.getAllByRole('button', { name: /を入れる$/ })[0]).toHaveTextContent('夕会');
    // When
    fireEvent.click(screen.getByRole('button', { name: '朝会 3 人を入れる' }));
    // Then
    expect(latestSocket().sentJson()).toContainEqual({ command: 'roulette.guest.addMany', names: ['あや', 'さとう', 'すずき'] });
    expect(screen.getAllByRole('status').map((el) => el.textContent)).toContain('2 人を入れました。1 人はもう入っているので、とばしました');
    const picks = screen.getAllByRole('button', { name: /を入れる$/ });
    expect(picks[0]).toHaveTextContent('朝会');
    expect(document.activeElement).toBe(picks[0]);
    expect(JSON.parse(localStorage.getItem(REGULARS_KEY) ?? '{}').items.find((g: { id: string }) => g.id === 'a').usedAt).toBeGreaterThan(2);
  });

  it('Given 切断した / When 描く / Then 札は押せず、直す・新しく作るは押せる', () => {
    seedGroups([{ id: 'a', name: '朝会', usedAt: 1, members: ['さとう'] }]);
    enterRoom();
    act(() => latestSocket().drop());
    expect(screen.getByRole('button', { name: '朝会 1 人を入れる' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '朝会 を直す' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '新しく作る' })).toBeEnabled();
  });

  it('Given ゲストが 1 人いる / When 追加した名前から作る / Then 複数行欄にそのゲストの名前', () => {
    enterRoom({ ...IDLE_ROULETTE, guests: [{ id: 'g-1', name: 'さとう' }] });
    fireEvent.click(screen.getByRole('button', { name: '追加した名前から作る' }));
    expect(screen.getByLabelText('入る人の名前（1 行に 1 人）')).toHaveValue('さとう');
  });

  it('Given 離席中（offline）の参加者と同じ名前を含む組 / When 札を押す / Then 名簿の全員と比べて、その人はとばす', () => {
    // Given: ゆうは名簿にいるが在室ではない。members を在室者だけにすると、ゆうが「入る」と数えられてしまう
    seedGroups([{ id: 'a', name: '朝会', usedAt: 1, members: ['ゆう', 'さとう'] }]);
    enterRoom();
    act(() =>
      latestSocket().deliver({
        type: 'roster',
        room: {
          code: 'R1',
          participants: [
            { participantId: 'p1', displayName: 'あや', presence: 'online', tools: ['roulette'] },
            { participantId: 'p2', displayName: 'ゆう', presence: 'offline', tools: [] },
          ],
        },
      }),
    );
    // When
    fireEvent.click(screen.getByRole('button', { name: '朝会 2 人を入れる' }));
    // Then
    expect(screen.getAllByRole('status').map((el) => el.textContent)).toContain('1 人を入れました。1 人はもう入っているので、とばしました');
  });
});
