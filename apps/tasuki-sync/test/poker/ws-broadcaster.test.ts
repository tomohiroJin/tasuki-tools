/**
 * Broadcaster アダプタ（接続レジストリ）の単体テスト（#165 PR-2 のレビュー指摘）。
 *
 * `createWsBroadcaster()` は in-process で動くので WS サーバーは立てない。
 * `RoomSocket` は `send(data: string): void` だけのインタフェースなので、
 * 受け取りを記録するだけのオブジェクトで足りる。
 *
 * ここで守るのは **「新規ルームの接続レジストリを作り直す」** 操作である。
 * ポート化のとき旧 `handleCreateRoom` の `socketsByRoom.set(room.id, new Map())` が
 * 落ちており、`attach` は `byRoom.get(roomId) ?? new Map()` で既存を再利用するため、
 * 到達不能なルームに残った接続が同一 ID の再採番で別ルームの配信を受けてしまった。
 */
import { describe, expect, it } from 'bun:test';
import { createRound, type ParticipantFragment } from '@tasuki/poker-core';
import { createWsBroadcaster } from '../../src/poker/adapters/ws-broadcaster';
import type { RoomSocket } from '../../src/poker/ports/broadcaster';

/** 受け取った本文を記録するだけのソケット */
function recordingSocket(): RoomSocket & { readonly received: string[] } {
  const received: string[] = [];
  return {
    received,
    send: (data) => {
      received.push(data);
    },
  };
}

/**
 * 1 人だけの名簿の断片（#95 S4a で `broadcastSnapshot` の引数がこの形になった）。
 * このファイルが見るのは配信の宛先だけなので、中身は最小で足りる。
 */
function rosterOf(participantId: string): ParticipantFragment[] {
  return [{ id: participantId, name: 'たろう', connected: true }];
}

describe('createWsBroadcaster', () => {
  it('resetRoom はそのルーム ID の接続を作り直し、古い接続には配信しない', () => {
    const broadcaster = createWsBroadcaster();
    const oldSocket = recordingSocket();
    const newSocket = recordingSocket();

    // Given: 到達不能になったルーム 'x' に、古い接続が残ったままである
    broadcaster.attach('x', 'A', oldSocket);

    // When: 同じ ID 'x' が再採番され、新しいルームが作られる
    broadcaster.resetRoom('x');
    broadcaster.attach('x', 'B', newSocket);
    broadcaster.broadcastSnapshot('x', createRound(), rosterOf('B'));

    // Then: 新しいルームの接続だけが受け取る
    expect(newSocket.received).toHaveLength(1);
    expect(oldSocket.received).toHaveLength(0);
  });

  // ⚠ **#95 S4b でこのテストの見方が変わった。** 守る不変条件は同じ
  // （「古いソケットの close が新しい接続を蹴り出さない」）だが、**守り方が変わった**。
  // S4a は `participantId → socket` の 1 対 1 で、古いソケットの detach を
  // 「登録が同一でなければ false を返して何もしない」と防いでいた。いまは
  // `participantId → ソケットの集合`なので、集合から**そのソケットだけ**が外れる。
  // したがって戻り値は true（実際に外した）になり、それでも新しいソケットは残る。
  it('古いソケットを外しても、同じ参加者の新しいソケットは配信先に残る', () => {
    const broadcaster = createWsBroadcaster();
    const oldSocket = recordingSocket();
    const newSocket = recordingSocket();

    // Given: 同じ roomId / participantId に 2 本のソケットが繋がっている
    broadcaster.attach('x', 'A', oldSocket);
    broadcaster.attach('x', 'A', newSocket);

    // When: 古いソケットで detach を呼ぶ
    const detached = broadcaster.detach('x', 'A', oldSocket);

    // Then: 外したのは古いソケットだけで、新しいソケットは配信を受け続ける
    expect(detached).toBe(true);
    broadcaster.broadcastSnapshot('x', createRound(), rosterOf('A'));
    expect(newSocket.received).toHaveLength(1);
    expect(oldSocket.received).toHaveLength(0);
  });

  // #95 S4b・R17。**選択画面とツールを別タブで開く同一人物が現実的な経路になった。**
  it('同じ参加者の 2 本のソケットは、どちらも同じ snapshot を受け取る（R17）', () => {
    const broadcaster = createWsBroadcaster();
    const tab1 = recordingSocket();
    const tab2 = recordingSocket();

    // Given: 1 人が 2 本繋いでいる
    broadcaster.attach('x', 'A', tab1);
    broadcaster.attach('x', 'A', tab2);

    // When
    broadcaster.broadcastSnapshot('x', createRound(), rosterOf('A'));

    // Then: 両方へ届き、内容も同一である（受信者別 snapshot は参加者ごとに 1 つ）
    expect(tab1.received).toHaveLength(1);
    expect(tab2.received).toHaveLength(1);
    expect(tab1.received[0]).toBe(tab2.received[0]!);
  });

  it('同じソケットを二度 attach しても配信は 1 通である（冪等）', () => {
    const broadcaster = createWsBroadcaster();
    const socket = recordingSocket();

    broadcaster.attach('x', 'A', socket);
    broadcaster.attach('x', 'A', socket);
    broadcaster.broadcastSnapshot('x', createRound(), rosterOf('A'));

    expect(socket.received).toHaveLength(1);
  });

  it('登録されていないソケットの detach は false を返し、残りに影響しない', () => {
    const broadcaster = createWsBroadcaster();
    const attached = recordingSocket();
    const stranger = recordingSocket();
    broadcaster.attach('x', 'A', attached);

    expect(broadcaster.detach('x', 'A', stranger)).toBe(false);

    broadcaster.broadcastSnapshot('x', createRound(), rosterOf('A'));
    expect(attached.received).toHaveLength(1);
  });

  // かつてここには「最後の 1 人を detach したあと countIn は 0 を返す」があった。
  // 守っていたのは `application/handlers.ts` の `countIn(roomId) === 0 → store.remove`
  // （旧 FR-014 の即時破棄）で、**#95 S4a でその分岐ごと撤去した**（寿命は
  // `application/destroy-room.ts` と `room-reclaimer` に一本化）。`countIn` は最後の
  // 呼び出し元を失ったのでポートからも外した。
  //
  // 下の 1 本が守るのは **`detach` の `sockets.delete(participantId)`**、
  // つまり「外れたソケットへはもう配信されない」ことだけである。
  //
  // ⚠ **`detach` のもう 1 行（`if (sockets.size === 0) byRoom.delete(roomId)`）は
  // ここでは見ていない。** `broadcastSnapshot` は `byRoom.get(roomId)` が空の Map でも
  // ループが 0 周するだけなので、**その行を落としてもこのテストは緑のまま**である。
  // 旧テストの `countIn` も `?? 0` で「集合が消えた」と「集合が空」を区別できておらず、
  // 同じ行を守れていなかった（＝この書き換えで守備範囲は減っていない）。
  //
  // **そして、この行はテストの足し方の問題ではない —— 現行の `Broadcaster` ポート越しには
  // 原理的に観測できない。** `detach` は「集合から外す」→「空になったら `byRoom` ごと消す」の
  // 2 段で、前段は残るので、後段を落として残るのは**すでに空の Map** である。そのあと
  // `attach` を呼んでも `byRoom.get(roomId) ?? new Map()` が返すのは「新しい空 Map」でも
  // 「再利用された空 Map」でも中身が同じものになり、同じ参加者への `detach` は不在でも空でも
  // false を返し、`broadcastSnapshot` はどちらも 0 周する。ポートは集合の大きさもキー集合も
  // 晒していない（`attach` / `detach` / `resetRoom` / `broadcastSnapshot` / `sendTo` だけ）。
  // **「別の 1 本を足せば固定できる」ではない** —— 固定したいなら、内部状態を晒す変更
  // そのものが要る。後段はメモリ解放のための掃除であって、**振る舞いとして観測できない
  // ことのほうが正常**なので、ここは足さないままでよい。
  it('最後の 1 人を detach したあと、そのルームへの配信は誰にも届かない', () => {
    // Given
    const broadcaster = createWsBroadcaster();
    const socket = recordingSocket();
    broadcaster.attach('x', 'A', socket);

    // When
    expect(broadcaster.detach('x', 'A', socket)).toBe(true);
    broadcaster.broadcastSnapshot('x', createRound(), rosterOf('A'));

    // Then: 外れたソケットへは配信されない（集合から消えていなければ届いてしまう）
    expect(socket.received).toHaveLength(0);
  });
});
