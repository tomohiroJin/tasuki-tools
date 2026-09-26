/**
 * ハブ（選択画面）のメッセージ層（#95 S5a）。
 *
 * **名簿の言葉しか話さない。** 受けるのはルームの作成・参加と、生死の照会で、
 * 返すのは復帰の組（`room.created` / `room.joined`）と名簿（`roster`）だけである。
 * タイマーの状態も票もここを通らない（`docs/adr/0017` の文脈分割）。
 * **例外はお題の状態（#91）** —— お題はルーム全体の資産なので、作成・参加の成功時に
 * いまのお題を 1 通送る。送るのはお題の配信（`topic-broadcast.ts`）で、ここは呼ぶだけである。
 *
 * ## 守りは timer と共有する
 *
 * レート制限・入口の門・合言葉・復帰は `join-room.ts` が持ち、timer の入口と同じものを
 * 通る。**ここに写しを書かない** —— 片方だけが直ると、合言葉を知らない人が選択画面から
 * 保護ルームの名簿を読める（S4a で実際に出た欠陥と同型）。
 *
 * ## 表示名の規約も timer と共有する
 *
 * 適用は `display-name-rule.ts` にあり、timer（`normalize-command-names.ts` 経由）・
 * poker と**同じ 1 つ**を通る（#95 S5b）。
 *
 * ⚠ **S5a のここは判定が死んでいた。** `normalizeDisplayName(raw) === null` を見ていたが、
 * あの関数は `string` しか返さない —— 空文字も 1000 文字も素通りしていた。
 * 入口ごとに適用を書くと、この形の抜けは何度でも起きる。
 */
import {
  HubCommandSchema,
  findParticipantByConnId,
  type HubCommand,
  type ToolId,
} from "@tasuki/room-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import { errorMessageFor } from "@tasuki/timer-core";
import type { TimerStore } from "../ports/timer-store.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";
import { checkRoom } from "./check-room.js";
import { createRoom, type CreateRoomDeps } from "./create-room.js";
import { applyDisplayNameRule, INVALID_DISPLAY_NAME_MESSAGE } from "./display-name-rule.js";
import { joinRoom, ROOM_NOT_FOUND_MESSAGE, type JoinRoomDeps } from "./join-room.js";
import { saveRoster, type SaveRosterDeps } from "./save-roster.js";
import type { TopicBroadcaster } from "./topic-broadcast.js";

/**
 * ハブの接続が宣言するツール。**どれでもない**（設計正本 D14・S5a の裁定）。
 *
 * 綴りの正本を `tool-id.ts` に置いているのと同じ理由でここに名前を与える ——
 * 生の `null` が配線のあちこちに散ると、「宣言し忘れ」と「ハブである」の区別がつかない。
 */
export const TOOL_HUB: ToolId | null = null;

/**
 * コマンドの形が不正なときの文言（#91 PR 3 Task 5）。
 *
 * `handleMessage` の JSON パース失敗時と、**既にどこかのルームに居る接続からの
 * 2 度目の `room.join` / `room.create`**（`isInAnyRoom` 参照）の、両方で使う。
 * 後者は形は正しいコマンドだが、正規の画面（玄関）からは絶対に届かない組み合わせ
 * なので、届いたら「壊れたクライアント」として同じ失敗の形で突き返す。
 * 文言を 2 か所に書くと片方だけが直る（過去に何度も踏んだ型）ので定数にする。
 */
const INVALID_COMMAND_MESSAGE = "コマンドの形式が不正です";

export interface HubHandlerDeps extends CreateRoomDeps, JoinRoomDeps, SaveRosterDeps {
  timers: TimerStore;
  hub: HubBroadcaster;
  /**
   * お題の状態の配信（#91）。作成・参加に成功した本人へ、いまのお題を 1 通送る（E4）。
   *
   * **必須にしてある**（`HandlerDeps.hub` と同じ理由）。省略可にすると、本番の配線から
   * 落ちても全テストが緑のまま、玄関にだけお題が届かない。
   */
  topicBroadcaster: Pick<TopicBroadcaster, "sendCurrent">;
}

export interface HubHandlers {
  /** ハブの接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
}

export function makeHubHandlers(deps: HubHandlerDeps): HubHandlers {
  const { hub, timers, topicBroadcaster } = deps;

  function fail(connId: string, code: string, message: string): void {
    hub.sendTo(connId, { type: "error", code, message });
  }

  /**
   * 表示名を名簿の規約で正規化する。**空になったり上限を超えたら拒む。**
   *
   * 見えない文字だけの名前や、正規化で消える名前を通すと、選択画面に無名の行が並ぶ。
   * 上限を超える名前を通すと、保存・配信・描画される値がそのまま伸びる。
   */
  function normalized(connId: string, raw: string): string | null {
    const applied = applyDisplayNameRule(raw);
    if (applied.isErr()) {
      fail(connId, "INVALID_COMMAND", INVALID_DISPLAY_NAME_MESSAGE);
      return null;
    }
    return applied.value;
  }

  /**
   * この接続がどれかのルームに（ツールを問わず）在席しているか。
   *
   * 2 度目の `room.join` / `room.create` を拒むために引く（#91 PR 3 Task 5）。
   * `topic-handlers.ts` の同名関数と同じ作り —— 店（`store`）の全ルームを走査し、
   * `connId` を持つ参加者が居るかで判定する。ここを名簿の保管と噛み合わない
   * 別の判定（例えば「最後に作った/入ったルーム」を覚えておく）にすると、
   * 復帰やタブの多重化で簡単にずれる。
   */
  function isInAnyRoom(connId: string): boolean {
    return deps.store.list().some((r) => findParticipantByConnId(r, connId) !== undefined);
  }

  function handleCreate(connId: string, cmd: Extract<HubCommand, { command: "room.create" }>): void {
    // 既にどこかのルームに居る接続からの作成は拒み、何も変えない。
    //
    // 玄関（`apps/landing/src/hub/use-hub-sync.ts`）は 1 本の接続につき、
    // URL に `?room=` が無いページでしか `room.create` を送らない —— そのページでは
    // まだどのルームにも入っていない。したがって正規の画面からは「既に入っている
    // 接続からの作成」は届かない。届くのは改造したクライアントだけであり、
    // お題の接続（`topic-handlers.ts`）で PR 1 が下した判断（変異 m86）と揃える。
    if (isInAnyRoom(connId)) {
      fail(connId, "INVALID_COMMAND", INVALID_COMMAND_MESSAGE);
      return;
    }

    const displayName = normalized(connId, cmd.displayName);
    if (displayName === null) return;

    const created = createRoom(deps, {
      connId,
      displayName,
      roomName: cmd.roomName,
      // ハブの接続はどのツールも宣言しない（選択画面に居る）。
      tool: TOOL_HUB,
    });

    if (created.isErr()) {
      // 文言は timer の文言表から引く（言い回しの正本を 2 つ作らない）。
      fail(connId, created.error, errorMessageFor(created.error));
      return;
    }

    const { code, participantId, resumeToken, membership } = created.value;

    // **ツールの状態は作らない**（#95 S5b・D8）。選択画面はどのツールも要求せず、
    // timer の状態も poker のラウンドも、最初にそのツールへ入った人が作る。
    // S5a はここで timer の状態を作っていた（当時は入口ごとの門があり、状態が無いと
    // 選択画面から timer へ入れなかったため）。門を廃止したのでその必要が消えた。
    hub.sendTo(connId, { type: "room.created", code, participantId, resumeToken });
    // 保管と配信は対にする（`save-roster.ts`）。作成者自身にも名簿が届く。
    saveRoster(deps, membership);
    // いまのお題（作った直後は「お題なし」）を本人へ（E4）。お題の状態はここで置かれる。
    topicBroadcaster.sendCurrent(connId, code);
  }

  /**
   * ルームの生死だけを返す（#274）。**名乗る前に尋ねられる唯一の問い合わせである。**
   *
   * 規則は `check-room.ts` が持つ。**合言葉の関門は通さない**（同ファイルの理由を参照）。
   * 在るときは何も返さない —— 無音で足りるうえ、確定的な肯定は開示が大きい。
   */
  function handleCheck(connId: string, cmd: Extract<HubCommand, { command: "room.check" }>): void {
    const checked = checkRoom(deps, { connId, code: cmd.code });
    if (checked.isErr()) {
      // 文言の引き方は `handleJoin` と同じにする（言い回しの正本を 2 つ作らない）。
      const code = checked.error;
      fail(connId, code, code === "ROOM_NOT_FOUND" ? ROOM_NOT_FOUND_MESSAGE : errorMessageFor(code));
    }
  }

  function handleJoin(connId: string, cmd: Extract<HubCommand, { command: "room.join" }>): void {
    // 既にどこかのルームに居る接続からの 2 度目の参加は拒み、何も変えない
    // （同じルームへの 2 度目でも、別のルームへの参加でも）。
    //
    // 通すと 1 本のソケットが 2 つのルームの名簿に載り、切断の片付けが片方しか
    // 外さず、幽霊の参加者が残ってルームが回収されなくなる（#91 PR 3 Task 5 の
    // 特徴づけで実測）。玄関は 1 本の接続で URL の `?room=` のルームにしか
    // 参加しないので、正規の画面からは 2 度目の参加は届かない —— 届くのは
    // 改造したクライアントだけであり、`topic-handlers.ts` の `isInAnyRoom` と
    // 同じ判断・同じ失敗の形で返す。
    if (isInAnyRoom(connId)) {
      fail(connId, "INVALID_COMMAND", INVALID_COMMAND_MESSAGE);
      return;
    }

    const displayName = normalized(connId, cmd.displayName);
    if (displayName === null) return;

    const joined = joinRoom(deps, {
      connId,
      code: cmd.code,
      displayName,
      tool: TOOL_HUB,
      ...(cmd.resumeToken !== undefined ? { resumeToken: cmd.resumeToken } : {}),
      ...(cmd.passphrase !== undefined ? { passphrase: cmd.passphrase } : {}),
    });

    if (joined.isErr()) {
      // **文言の正本は 1 つにする**（`@tasuki/timer-core` の文言表と `ROOM_NOT_FOUND_MESSAGE`）。
      // ここで書き下ろすと、同じコードに 2 つの言い回しが生まれ、片方だけが直る。
      //
      // ⚠ **ハブは「存在しないルーム」と「合言葉が要るルーム」を区別して返す。**
      // 前者は `ROOM_NOT_FOUND`、後者は `PASSPHRASE_REQUIRED` で、文言も違う。
      // ハブは合言葉を送れるので、これは意図された開示である（選択画面で合言葉を
      // 通ってからツールを選ぶのが正規の経路）。区別させないのは**合言葉を送れない
      // 入口**（poker）の側の規律であり、そちらは `room-entry.ts` が受け持つ。
      // S4a の入口ごとの門があった頃は、ここにも「区別させない」と書いてあったが、
      // 門の廃止（#95 S5b）で対象を失っていた（#274 で訂正）。
      const code = joined.error;
      fail(
        connId,
        code,
        code === "ROOM_NOT_FOUND" ? ROOM_NOT_FOUND_MESSAGE : errorMessageFor(code),
      );
      return;
    }

    const { participantId, resumeToken, membership, timer } = joined.value;

    // 復帰でも新規でも、本人には復帰の組を返す。**ハブは `localStorage` にこれを持つ**
    // ので、復帰のときに返さないと次の読み込みで組が空になる（D12）。
    hub.sendTo(connId, { type: "room.joined", code: cmd.code, participantId, resumeToken });

    // ハブからの参加（ツールを宣言しない）では、`joinRoom` は既存の timer の状態を
    // そのまま返すので、この保管は何も変えない。#91 PR 3 までは AI 鍵の欄（`aiKeyHolders`）が
    // ここで変わりえたので保管していた。`joinRoom` の返り値の扱いを入口の間で揃えるために残す。
    if (timer !== undefined) timers.put(timer);
    saveRoster(deps, membership);
    // いまのお題を本人へ 1 通（E4）。**名簿の保管のあとに呼ぶ**（ルームの在否を名簿で見るため）。
    topicBroadcaster.sendCurrent(connId, cmd.code);
  }

  return {
    async handleMessage(connId: string, raw: string): Promise<void> {
      // 境界のパースは `@tasuki/protocol` に一本化してある（timer / poker と同じ入口）。
      const parsed = parseBoundaryMessage(HubCommandSchema, raw);
      if (parsed.isErr()) {
        const code = parsed.error.stage === "json" ? "INVALID_JSON" : "INVALID_COMMAND";
        const message =
          parsed.error.stage === "json" ? "JSON の形式が不正です" : INVALID_COMMAND_MESSAGE;
        fail(connId, code, message);
        return;
      }

      const cmd = parsed.value;
      if (cmd.command === "room.create") {
        handleCreate(connId, cmd);
        return;
      }
      if (cmd.command === "room.check") {
        handleCheck(connId, cmd);
        return;
      }
      handleJoin(connId, cmd);
    },
  };
}
