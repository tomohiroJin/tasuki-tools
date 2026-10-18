// poker の入口から幽霊（接続を 1 本も持たない人）を外す（#419・G-4〜G-8）。
//
// 同じプロセスの timer と poker をまたぐ性質（timer の状態を作らない・輪から外す）を見るので、
// 実 WS の in-process サーバー（`startLiveSyncServer`）を使う。
import { afterEach, describe, expect, it } from 'bun:test';
import {
  joinRoom,
  startLiveSyncServer,
  addToRotation,
  type LivePokerClient,
  type LiveSyncServer,
} from '../support/live-sync-server.js';

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

interface PokerJoined {
  type: 'joined';
  roomId: string;
  participantId: string;
  token: string;
}
interface PokerState {
  type: 'room-state';
  participants: Array<{ id: string; connected: boolean; hasVoted: boolean; spectator?: boolean }>;
  round: { status: string };
}

const CARD = { kind: 'number', value: 5 } as const;
const isState = (m: unknown) => (m as { type: string }).type === 'room-state';
const isError = (code: string) => (m: unknown) =>
  (m as { type: string; code?: string }).type === 'error' && (m as { code?: string }).code === code;

/** poker で A が部屋を作り、B が入る */
async function twoInPoker() {
  server = startLiveSyncServer();
  const a = await server.connectPoker('a');
  a.send({ type: 'create-room', name: 'あ' });
  const aJoined = (await a.take((m) => m.type === 'joined', 'joined')) as unknown as PokerJoined;
  const b = await server.connectPoker('b');
  b.send({ type: 'join-room', roomId: aJoined.roomId, name: 'い' });
  const bJoined = (await b.take((m) => m.type === 'joined', 'joined')) as unknown as PokerJoined;
  return {
    a,
    b,
    code: aJoined.roomId,
    aId: aJoined.participantId,
    bId: bJoined.participantId,
    aToken: aJoined.token,
    bToken: bJoined.token,
  };
}

/** A に、B が居ない（connected=false）room-state が届くまで待つ */
async function untilGhost(a: LivePokerClient, bId: string): Promise<void> {
  await a.take(
    (m) => {
      const s = m as unknown as PokerState;
      return s.type === 'room-state' && s.participants.some((p) => p.id === bId && !p.connected);
    },
    'B が未接続になった room-state',
  );
}

describe('poker から幽霊を外す（#419）', () => {
  it('幽霊を外せる: 接続を閉じた B が A の participants から消える', async () => {
    const { a, b, aId, bId } = await twoInPoker();
    await b.close();
    await untilGhost(a, bId);

    a.send({ type: 'remove-participant', participantId: bId });

    const state = (await a.take(
      (m) => isState(m) && !(m as unknown as PokerState).participants.some((p) => p.id === bId),
      'B が消えた room-state',
    )) as unknown as PokerState;
    expect(state.participants.map((p) => p.id)).toEqual([aId]);
  });

  it('接続している人は外せない: not-removable で B は残る', async () => {
    const { a, bId, code } = await twoInPoker();

    a.send({ type: 'remove-participant', participantId: bId });

    await a.take(isError('not-removable'), 'not-removable');
    expect(server!.store.get(code)!.participants.some((p) => p.id === bId)).toBe(true);
  });

  it('自分は外せない: not-removable', async () => {
    const { a, aId, code } = await twoInPoker();

    a.send({ type: 'remove-participant', participantId: aId });

    await a.take(isError('not-removable'), 'not-removable');
    expect(server!.store.get(code)!.participants.some((p) => p.id === aId)).toBe(true);
  });

  it('居ない人: participant-not-found', async () => {
    const { a } = await twoInPoker();

    a.send({ type: 'remove-participant', participantId: 'nobody' });

    await a.take(isError('participant-not-found'), 'participant-not-found');
  });

  it('名簿に居ない接続の操作は not-joined（G-9）', async () => {
    const { bId, code } = await twoInPoker();
    // 入室していない別の接続 c から送る（名簿に居ない接続の操作は何も変えない）
    const c = await server!.connectPoker('c');
    c.send({ type: 'remove-participant', participantId: bId });

    await c.take(isError('not-joined'), 'not-joined');
    expect(server!.store.get(code)!.participants.some((p) => p.id === bId)).toBe(true);
  });

  it('poker だけのルームでは timer の状態を作らない。のちに timer から入ると初期状態が返る', async () => {
    const { a, b, code, bId } = await twoInPoker();
    await b.close();
    await untilGhost(a, bId);
    expect(server!.hasTimerState(code)).toBe(false);

    a.send({ type: 'remove-participant', participantId: bId });
    await a.take(
      (m) => isState(m) && !(m as unknown as PokerState).participants.some((p) => p.id === bId),
      'B が消えた room-state',
    );

    // 外した後も timer の状態は作られていない
    expect(server!.hasTimerState(code)).toBe(false);
    // timer の入口から入ると、遅延生成で初期状態の timer が返る
    const t = await server!.connect('t');
    const joined = await joinRoom(t, code, 'う');
    const snap = await t.take('snapshot');
    // 初期状態: 輪には入ってきた人だけ・時計は止まって満タン・段階は setup
    expect(snap.room.session.rotation).toEqual([joined.participantId]);
    expect(snap.room.clock.running).toBe(false);
    expect(snap.room.clock.secondsLeftAtAnchor).toBe(snap.room.clock.intervalSeconds);
    expect(snap.room.phase).toBe('setup');
    expect(server!.hasTimerState(code)).toBe(true);
  });

  it('timer の輪に居る幽霊を外すと輪からも外れ、timer の在室者に知らせが届く', async () => {
    const { a, b, code, aId, bId, aToken, bToken } = await twoInPoker();
    // A・B とも復帰トークンで timer にも入る（同じ人として）。B は輪に席を持つ
    const aTimer = await server!.connect('a-timer');
    aTimer.send({ command: 'room.join', code, displayName: 'あ', resumeToken: aToken });
    await aTimer.take('snapshot');
    const bTimer = await server!.connect('b-timer');
    bTimer.send({ command: 'room.join', code, displayName: 'い', resumeToken: bToken });
    await bTimer.take('snapshot');
    await addToRotation(aTimer, bId);
    expect(server!.timers.get(code)!.session.rotation.some((e: unknown) => JSON.stringify(e).includes(bId))).toBe(true);
    // B の全接続（poker と timer）を閉じる
    // 最後に閉じる接続が poker のもの（poker への配信は poker の切断が起点になる）
    await bTimer.close();
    await b.close();
    await untilGhost(a, bId);

    a.send({ type: 'remove-participant', participantId: bId });

    const notice = (await aTimer.take(
      'signal',
      (m) => m.signal === 'notice' && m.action === 'participant-removed',
    )) as unknown as { targetParticipantId: string; actorParticipantId: string };
    expect(notice.targetParticipantId).toBe(bId);
    expect(notice.actorParticipantId).toBe(aId);
    expect(server!.timers.get(code)!.session.rotation.some((e: unknown) => JSON.stringify(e).includes(bId))).toBe(false);
    expect(server!.store.get(code)!.participants.some((p) => p.id === bId)).toBe(false);
  });

  it('外した幽霊の票と見学が消える: 残る A が投票すれば B の票なしで開く', async () => {
    const { a, b, bId } = await twoInPoker();
    b.send({ type: 'vote', card: CARD });
    await a.take(
      (m) =>
        isState(m) &&
        (m as unknown as PokerState).participants.some((p) => p.id === bId && p.hasVoted),
      'B の投票',
    );
    await b.close();
    await untilGhost(a, bId);
    a.send({ type: 'remove-participant', participantId: bId });
    await a.take(
      (m) => isState(m) && !(m as unknown as PokerState).participants.some((p) => p.id === bId),
      'B が消えた room-state',
    );

    // B の票が残っていれば、A の投票の前に開く・開いても B の票が混ざる
    a.send({ type: 'vote', card: CARD });

    const state = (await a.take(
      (m) => isState(m) && (m as unknown as PokerState).round.status === 'revealed',
      '開票済み',
    )) as unknown as PokerState & { round: { votes: Array<{ participantId: string }> } };
    expect(state.round.votes.map((v) => v.participantId)).not.toContain(bId);
  });
});
