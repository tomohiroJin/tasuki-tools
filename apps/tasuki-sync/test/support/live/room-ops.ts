/** 実 WS 越しの前提の構築（ルーム作成・参加・ローテーションへの追加）。失敗は throw する。 */

import type { Command } from "@tasuki/timer-core";
import { LiveSetupError } from "./waiting";
import type { LiveClient, MsgOf } from "./timer-client";

/** 実 WS 越しにルームを作る。エラーが返ったら throw する（前提の構築の失敗）。 */
export async function createRoom(
  client: LiveClient,
  displayName: string,
  extra: Omit<Extract<Command, { command: "room.create" }>, "command" | "displayName"> = {},
): Promise<MsgOf<"room.created">> {
  client.send({ command: "room.create", displayName, ...extra });
  const msg = await client.takeMatching(
    (m) => m.type === "room.created" || m.type === "error",
    "room.created",
  );
  if (msg.type !== "room.created") {
    // takeMatching は ServerMsg 全体を返すので、述語で絞った先を型にも伝える
    // （error 以外はここへ来ない。来たなら type をそのまま出す）
    throw new LiveSetupError(
      `room.create("${displayName}") が ${msg.type === "error" ? msg.code : msg.type} で失敗した`,
    );
  }
  return msg;
}

/** 実 WS 越しにルームへ参加する。エラーが返ったら throw する（前提の構築の失敗）。 */
export async function joinRoom(
  client: LiveClient,
  code: string,
  displayName: string,
  extra: { passphrase?: string } = {},
): Promise<MsgOf<"room.joined">> {
  client.send({
    command: "room.join",
    code,
    displayName,
    ...(extra.passphrase !== undefined ? { passphrase: extra.passphrase } : {}),
  });
  const msg = await client.takeMatching(
    (m) => m.type === "room.joined" || m.type === "error",
    "room.joined",
  );
  if (msg.type !== "room.joined") {
    throw new LiveSetupError(
      `room.join("${displayName}") が ${msg.type === "error" ? msg.code : msg.type} で失敗した`,
    );
  }
  return msg;
}

/**
 * 参加者をローテーションへ加える（`member.add`）。反映済みの snapshot を待つ。
 *
 * ⚠ **未読の先頭から探す（`until` ではなく `takeMatching` を使う）。** 履歴全体を見ると、
 * 送信より前に届いていた snapshot が条件を満たしてしまい、コマンドが
 * `DuplicateName` で弾かれていても素通りする。実際、ルーム作成者は
 * `room.create` の時点で既にローテーションに並んでいる（room-create.ts）ため、
 * 作成者に対する `member.add` は常に失敗する。エラーは throw して気づけるようにする。
 */
export async function addToRotation(client: LiveClient, participantId: string): Promise<void> {
  client.send({ command: "member.add", participantId });
  const msg = await client.takeMatching(
    (m) =>
      m.type === "error" ||
      (m.type === "snapshot" && m.room.session.rotation.includes(participantId)),
    `member.add(${participantId}) の反映`,
  );
  if (msg.type === "error") {
    throw new LiveSetupError(`member.add(${participantId}) が ${msg.code} で失敗した`);
  }
}
