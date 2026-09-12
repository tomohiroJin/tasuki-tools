/**
 * メンバーシップ文脈のドメイン（#95 D1・D4・D14）。
 *
 * **ツールを知らない。** ここに timer / poker の語彙を持ち込むと、文脈を上流に立てた
 * 意味が消える。ツール固有の属性（お題の AI 鍵・ドライバー適格）は各ツールの状態が持つ。
 * {@link ToolId} を不透明な文字列にしているのは、ツールを増やすときにこの文脈を
 * 触らせないためである（設計正本 §5.1）。
 *
 * ## 在席と presence は欄ではなく導出である（#95 S4b・D14）
 *
 * 参加者が持つのは**接続の集まり**（{@link Participant.connections}）だけで、
 * 「在席しているか」（{@link isPresentIn}）と「オンラインか」（{@link presenceOf}）は
 * そこから導く。**欄として持たせない。** 持たせた瞬間に、接続の着脱と欄の更新が
 * ずれる経路ができる（S4a 以前は `connId` と `presence` の 2 欄があり、切断時に
 * 片方だけを更新する実装が実際に並んでいた）。
 *
 * 1 人が接続を複数持てるのは、選択画面とツールを別タブで開く利用者が現実的な経路に
 * なったからである（D12 で復帰の組を `localStorage` へ置いた帰結）。接続 1 本の模型
 * では、後から繋いだタブが前のタブの接続を奪い、前のタブは更新を受け取らなくなる。
 *
 * **presence の値域に `"idle"` は無い。** wire の契約（`RoomSchema`）には残っているが、
 * 代入する経路は S4a 時点で実測 0 件であり、導出にした S4b では表現できない。
 * wire の側は非 strict の `v.object` なので、値域が狭くなっても契約は満たす。
 */

export type ParticipantId = string;
export type ConnId = string;
export type RoomCode = string;
/** ツールの識別子。**この文脈は中身を解釈しない**（綴りの正本は `apps/tasuki-sync`）。 */
export type ToolId = string;

/** 名簿の 1 人。 */
export interface Participant {
  id: ParticipantId;
  displayName: string;
  /**
   * 接続 ID → その接続が宣言しているツール（ハブなら `null`）。
   *
   * **空でも名簿からは消えない。** 名簿から消える経路は明示的な退出だけである
   * （設計正本 §3.13）。切断は在室そのものを終わらせない。
   */
  connections: ReadonlyMap<ConnId, ToolId | null>;
  joinedAt: number;
}

export interface Room {
  code: RoomCode;
  createdAt: number;
  participants: Participant[];
}

export function findParticipant(room: Room, id: ParticipantId): Participant | undefined {
  return room.participants.find((p) => p.id === id);
}

/** 接続 ID から持ち主を引く。**1 人が複数の接続を持つので、参加者→接続は 1 対多である。** */
export function findParticipantByConnId(room: Room, connId: ConnId): Participant | undefined {
  return room.participants.find((p) => p.connections.has(connId));
}

export function addParticipant(room: Room, participant: Participant): Room {
  return { ...room, participants: [...room.participants, participant] };
}

export function removeParticipant(room: Room, id: ParticipantId): Room {
  return { ...room, participants: room.participants.filter((p) => p.id !== id) };
}

function updateParticipant(
  room: Room,
  id: ParticipantId,
  update: (p: Participant) => Participant,
): Room {
  return { ...room, participants: room.participants.map((p) => (p.id === id ? update(p) : p)) };
}

/**
 * 接続を結ぶ（その接続が居るツールの宣言を伴う）。
 *
 * **既にある接続を奪わない。** 同じ接続 ID を結び直したときだけ宣言を上書きする
 * （本数は増えない）。居ない参加者を指したときは名簿を変えない。
 */
export function attachConnection(
  room: Room,
  id: ParticipantId,
  connId: ConnId,
  tool: ToolId | null,
): Room {
  return updateParticipant(room, id, (p) => ({
    ...p,
    connections: new Map(p.connections).set(connId, tool),
  }));
}

/**
 * 接続を閉じる。**参加者 ID ではなく接続 ID で指す**（切断は接続の事象である）。
 *
 * S4a までは `detachConnection(room, participantId)` という別物があった。
 * 引数がどちらも `string` なので**取り違えても型検査を通ってしまう**ため、
 * 名前を変えて旧来の呼び出し側が必ずコンパイルエラーになるようにしてある。
 */
export function removeConnection(room: Room, connId: ConnId): Room {
  const owner = findParticipantByConnId(room, connId);
  if (!owner) return room;
  return updateParticipant(room, owner.id, (p) => {
    const next = new Map(p.connections);
    next.delete(connId);
    return { ...p, connections: next };
  });
}

/** そのツールに在席しているか（そのツールを宣言した接続を 1 本以上持つか）。 */
export function isPresentIn(participant: Participant, tool: ToolId): boolean {
  for (const declared of participant.connections.values()) {
    if (declared === tool) return true;
  }
  return false;
}

/** 接続が 1 本でもあれば `online`。**ツールは問わない**（ハブに居ても online である）。 */
export function presenceOf(participant: Participant): "online" | "offline" {
  return participant.connections.size > 0 ? "online" : "offline";
}

/**
 * その宛先へ配信すべき接続の一覧（宣言順）。
 *
 * **ツール別の配信範囲はここが決める**（設計正本 D4・§5.5 の `broadcastToTool`）。
 * ハブ（`tool: null`）の接続は、どのツールの配信先にも入らない。
 *
 * **`null` を渡すとハブ自身への配信先になる**（#95 S5a）。在席の導出
 * （{@link isPresentIn}）は宣言の無い接続を「どのツールにも在席していない」と読み、
 * こちらは同じ接続を「選択画面を見ている人」として宛先に数える。**同じ値が 2 つの
 * 意味を持つのではなく、「宣言が無い」という 1 つの事実を、在席と配信がそれぞれの
 * 向きから読んでいる。**
 */
export function connectionsIn(room: Room, tool: ToolId | null): ConnId[] {
  const ids: ConnId[] = [];
  for (const participant of room.participants) {
    for (const [connId, declared] of participant.connections) {
      if (declared === tool) ids.push(connId);
    }
  }
  return ids;
}

export function hasNoParticipants(room: Room): boolean {
  return room.participants.length === 0;
}
