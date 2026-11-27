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
import { MAX_PASSPHRASE } from "./passphrase.js";

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
  /**
   * 合言葉が付いているか（#638）。**合言葉そのものは載せない。**
   *
   * 玄関の設定の口が「設定中／未設定」を映すための印である。省略は「付いていない」と同じに読む
   * （古いサーバーはこの項目を送らない。非 strict のスキーマで受ける理由と同じ）。
   */
  passphraseProtected?: boolean | undefined;
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
  passphraseProtected: v.optional(v.boolean()),
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
    }
  /**
   * ルームの生死だけを尋ねる（#274）。**名前を受け取らない。**
   *
   * 招待リンクを踏んだ人が、名乗る前に不在を知るための問い合わせである。
   * 応答は**無いときだけ**返る（`HubServerMsg` の `error` / `ROOM_NOT_FOUND`）。
   * 在るときの肯定は返さない —— 無音で足りるうえ、確定的な肯定は開示が大きい。
   */
  | { command: "room.check"; code: string }
  /**
   * 合言葉を設定・解除する（#638。もとは timer のコマンド）。**空文字で解除。**
   *
   * ルームに居る接続から届く。**宛先は接続が決める**ので `code` を持たない（持つと、別ルームの
   * 合言葉を書き換える経路の入口になる）。役割は無いので（#95）、在室者なら誰でも実行できる。
   */
  | { command: "room.passphrase.set"; passphrase: string }
  /**
   * ルームのほかの在室者を、指した道具へ呼ぶ（#677）。**呼ばれた側は自分で「移る」を選ぶ**（画面は自動で移らない）。
   *
   * 合言葉の設定と同じく、**宛先は接続が決める**ので `code` を持たない。役割は無いので（#95）、在室者なら誰でも呼べる。
   * 道具の綴りが実在するかはサーバーが見る（この文脈は綴りを知らない・冒頭の規律）。
   */
  | { command: "room.call"; tool: string };

/**
 * 呼びかけの道具の綴りの長さの上限（#677）。綴りの実在はサーバーが見るので、ここは長すぎる値を境界で落とすだけ。
 * いまの最長は `roulette`（8 字）。道具の名前が伸びても足りるよう余裕を持たせる。
 */
export const MAX_CALL_TOOL_LENGTH = 32;

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
    // 上限は timer の入口と同じ 1 つの値（`./passphrase.ts`・#377）。超えたら境界で INVALID_COMMAND。
    passphrase: v.optional(v.pipe(v.string(), v.maxLength(MAX_PASSPHRASE))),
  }),
  // **ここだけ strict にする。** 余剰フィールドを拒むのは `docs/adr/0011` 決定2 の
  // 脅威 S3 が MUST とする規律で、poker の `ClientMessage`（`poker-core/src/protocol.ts`）は
  // 既に `v.strictObject` で揃えてある。
  //
  // 上の `room.create` / `room.join` が非 strict なのは**古い取り決めの名残**である。
  // このファイルの冒頭が挙げる非 strict の理由（サーバーが項目を足したとき、古い
  // クライアントがフレームごと捨てるのを避ける）は、**サーバーから画面へ送る
  // `HubServerMsg` の話**であって、画面からサーバーへ送るコマンドには当てはまらない。
  // 新設のこのコマンドには古いクライアントが居ないので、厳しい側から始める。
  v.strictObject({
    command: v.literal("room.check"),
    code: nonEmptyString,
  }),
  // 新設のコマンドなので古いクライアントは居ない。`room.check` と同じく strict から始める。
  // 上限は参加の `room.join` と同じ 1 つの値（`./passphrase.ts`）。
  v.strictObject({
    command: v.literal("room.passphrase.set"),
    passphrase: v.pipe(v.string(), v.maxLength(MAX_PASSPHRASE)),
  }),
  // 新設のコマンドなので strict から始める（#677）。
  v.strictObject({
    command: v.literal("room.call"),
    tool: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_CALL_TOOL_LENGTH)),
  }),
]);

/**
 * ハブの言葉の名前の全件。**鍵が `HubCommand["command"]` の全件を要求する**（`Record`）ので、ハブのコマンドを足して
 * ここを足し忘れると型検査が落ちる。
 */
const HUB_COMMAND_NAMES: Record<HubCommand["command"], true> = {
  "room.create": true,
  "room.join": true,
  "room.check": true,
  "room.passphrase.set": true,
  "room.call": true,
};

/**
 * ハブの言葉か。道具の接続（topic・roulette・agenda・checkin）は、ハブの言葉との和を受けるが、
 * 受けてよいのは `room.join` だけである。**`room.join` 以外のハブの言葉は、この関数で見分けて既定で拒む**
 * （新しいハブのコマンドを足しても、道具の接続側の一覧を直さずに拒まれる）。
 */
export function isHubCommand(cmd: { readonly command: string }): cmd is HubCommand {
  return Object.prototype.hasOwnProperty.call(HUB_COMMAND_NAMES, cmd.command);
}

/**
 * サーバーがハブへ送るメッセージ。
 *
 * `room.created` / `room.joined` は**自分の接続にだけ**返る（復帰の組は本人のもの）。
 * `roster` はそのルームのハブ接続すべてへ配信される（R3）。ただし合言葉の設定で印が変わらないときは、
 * 送った人にだけ 1 通返す（#638）。
 */
export type HubServerMsg =
  | { type: "room.created"; code: string; participantId: string; resumeToken: string }
  | { type: "room.joined"; code: string; participantId: string; resumeToken: string }
  | { type: "roster"; room: RosterRoom }
  /**
   * 呼びかけを受け付けた（#677）。**呼んだ本人の接続にだけ**返る。玄関はこれを受けてから、呼んだ道具へ移る
   * （送ってすぐ移ると、ページを離れる時にコマンドが届かないことがある）。
   */
  | { type: "room.called"; tool: string }
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
  v.object({ type: v.literal("room.called"), tool: nonEmptyString }),
  v.object({ type: v.literal("error"), code: nonEmptyString, message: v.string() }),
]);

/**
 * 呼びかけの中身（#677）。`fromName` は呼んだ人のいまの表示名（サーバーが名簿から引く）。
 * 道具の綴りはサーバーの一覧（`apps/tasuki-sync` の `tool-id.ts`）のもので、見せ方（名前・公開パス）は画面が引く。
 */
export interface RoomCall {
  tool: string;
  fromParticipantId: string;
  fromName: string;
}

/**
 * 呼びかけの知らせ（#677）。**ルームの全接続（ハブとすべての道具）へ届く**ので、ハブの言葉（{@link HubServerMsg}）
 * とは分け、各画面が**自分の契約より先に**見分ける（お題の `topic` フレームと同じ置き方・`docs/adr/0021` 決定 2）。
 *
 * サーバーから画面へ送る言葉なので非 strict にする（冒頭の規律）。古い画面（この知らせを知らない画面）は、
 * 玄関なら黙って捨て、道具の画面なら「契約に合わないフレームを捨てた」として同期の告知を出す
 * （次の正しいフレームで下りる）。**配る順は同期サーバーが先・画面が後**（`deploy/README.md`）。
 */
export interface RoomCallFrame {
  type: "room.call";
  call: RoomCall;
}

export const RoomCallFrameSchema: v.GenericSchema<RoomCallFrame> = v.object({
  type: v.literal("room.call"),
  call: v.object({
    tool: nonEmptyString,
    fromParticipantId: nonEmptyString,
    fromName: nonEmptyString,
  }),
});
