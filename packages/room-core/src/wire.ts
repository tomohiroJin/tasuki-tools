/**
 * 名簿の wire（#95 S5a）。**選択画面（ハブ）とサーバーの間の言葉である。**
 *
 * ここに timer / poker の語彙を持ち込まない。ハブが知ってよいのは「誰が居て、
 * いまどのツールに居るか」だけで、タイマーの状態も票も知らない（`docs/adr/0017` の文脈分割）。
 * ツールの識別子は不透明な文字列のままにする —— 綴りの正本は `apps/tasuki-sync` である。
 *
 * ## 組み立てはアプリケーション層の仕事である（D16）
 *
 * ここにあるのは**型と、境界で検証するためのスキーマ**だけで、`Room` から
 * {@link RosterRoom} を作る関数は置かない。名簿（このパッケージ）とツールの状態は
 * アプリケーション層でしか出会わないという規律を、ここでも崩さない。
 *
 * ## スキーマは非 strict の `v.object` にする
 *
 * `timer-core` の `RoomSchema` と同じ規律である。サーバーが項目を足したときに、
 * 古いクライアントが**フレームごと捨てる**（＝画面が更新されなくなる）のを避ける。
 * 落とすのは「必要な項目が無い」ときだけにする。
 */

import * as v from "valibot";

const nonEmptyString = v.pipe(v.string(), v.minLength(1));

/** 選択画面に並ぶ 1 人。 */
export interface RosterParticipant {
  participantId: string;
  displayName: string;
  /** 接続が 1 本でもあれば `online`（どのツールに居るかは問わない）。 */
  presence: "online" | "offline";
  /**
   * その人がいま居るツール（宣言順・重複なし）。**選択画面だけに居る人は空配列**である。
   *
   * 「どのツールに何人居るか」を選択画面が示すための欄で、ツールの識別子は
   * サーバーが決める綴りをそのまま運ぶ（この文脈は中身を解釈しない）。
   */
  tools: string[];
}

/** 選択画面が映すルーム。 */
export interface RosterRoom {
  code: string;
  participants: RosterParticipant[];
}

/**
 * **export しない。** 製品コードの利用者は {@link RosterRoomSchema} だけで、
 * 公開すると「公開契約にあるが誰も使わない値」（SC-039③④）が増える。
 */
const RosterParticipantSchema = v.object({
  participantId: nonEmptyString,
  displayName: nonEmptyString,
  presence: v.picklist(["online", "offline"]),
  tools: v.array(v.string()),
});

/**
 * **export しない。** 名簿は必ず {@link HubServerMsgSchema} の `roster` として運ばれる ——
 * 単体で検証する利用者は製品コードに居ない（同じ理由で参加者のスキーマも公開しない）。
 */
const RosterRoomSchema: v.GenericSchema<RosterRoom> = v.object({
  code: nonEmptyString,
  participants: v.array(RosterParticipantSchema),
});

/**
 * ハブがサーバーへ送るコマンド。
 *
 * **timer の `room.create` / `room.join` と同じ名前にしてある。** 同じ出来事を指すので
 * 別の名前を与えると、サーバーの中で「どちらの作成か」を毎回言い分けることになる。
 * どのメッセージ層が受けるかは**接続が来た入口**で決まる（設計正本 D14・S5a の裁定）。
 */
export type HubCommand =
  | { command: "room.create"; roomName: string; displayName: string }
  | {
      command: "room.join";
      code: string;
      displayName: string;
      // **`| undefined` を明示する。** `exactOptionalPropertyTypes` の下では
      // 「キーが無い」と「キーはあるが undefined」が別物で、スキーマの推論は後者を出す。
      // 省くと `HubCommandSchema` に型注釈を付けられず、検証の出力とこの型が静かにずれる。
      resumeToken?: string | undefined;
      passphrase?: string | undefined;
    };

export const HubCommandSchema: v.GenericSchema<HubCommand> = v.variant("command", [
  v.object({
    command: v.literal("room.create"),
    roomName: v.string(),
    displayName: v.string(),
  }),
  v.object({
    command: v.literal("room.join"),
    code: nonEmptyString,
    displayName: v.string(),
    resumeToken: v.optional(v.string()),
    passphrase: v.optional(v.string()),
  }),
]);

/**
 * サーバーがハブへ送るメッセージ。
 *
 * `room.created` / `room.joined` は**自分の接続にだけ**返る（復帰の組は本人のもの）。
 * `roster` はそのルームのハブ接続すべてへ配信される（R3）。
 */
export type HubServerMsg =
  | { type: "room.created"; code: string; participantId: string; resumeToken: string }
  | { type: "room.joined"; code: string; participantId: string; resumeToken: string }
  | { type: "roster"; room: RosterRoom }
  | { type: "error"; code: string; message: string };

const identityFields = {
  code: nonEmptyString,
  participantId: nonEmptyString,
  resumeToken: nonEmptyString,
};

export const HubServerMsgSchema: v.GenericSchema<HubServerMsg> = v.variant("type", [
  v.object({ type: v.literal("room.created"), ...identityFields }),
  v.object({ type: v.literal("room.joined"), ...identityFields }),
  v.object({ type: v.literal("roster"), room: RosterRoomSchema }),
  v.object({ type: v.literal("error"), code: nonEmptyString, message: v.string() }),
]);
