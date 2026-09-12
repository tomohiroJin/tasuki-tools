/**
 * ハブ（選択画面）のメッセージ層（#95 S5a）。
 *
 * **名簿の言葉しか話さない。** 受けるのは `room.create` と `room.join` の 2 つで、
 * 返すのは復帰の組（`room.created` / `room.joined`）と名簿（`roster`）だけである。
 * タイマーの状態も票もここを通らない（`docs/adr/0017` の文脈分割）。
 *
 * ## 守りは timer と共有する
 *
 * レート制限・入口の門・合言葉・復帰は `join-room.ts` が持ち、timer の入口と同じものを
 * 通る。**ここに写しを書かない** —— 片方だけが直ると、合言葉を知らない人が選択画面から
 * 保護ルームの名簿を読める（S4a で実際に出た欠陥と同型）。
 *
 * ## 表示名の正規化もここで掛ける
 *
 * timer の入口は `normalize-command-names.ts` が境界で掛けている（#95 S4b）。
 * ハブは別の入口なので、**同じ規約（`@tasuki/room-core` の `normalizeDisplayName`）を
 * ここでも通す**。規約そのものは向こうに 1 つしか無い（R13）。
 */
import {
  HubCommandSchema,
  normalizeDisplayName,
  type HubCommand,
  type ToolId,
} from "@tasuki/room-core";
import { parseBoundaryMessage } from "@tasuki/protocol";
import type { TimerStore } from "../ports/timer-store.js";
import type { HubBroadcaster } from "../ports/hub-broadcaster.js";
import { createRoom, type CreateRoomDeps } from "./create-room.js";
import { joinRoom, type JoinRoomDeps } from "./join-room.js";
import { saveRoster, type SaveRosterDeps } from "./save-roster.js";

/**
 * ハブの接続が宣言するツール。**どれでもない**（設計正本 D14・S5a の裁定）。
 *
 * 綴りの正本を `tool-id.ts` に置いているのと同じ理由でここに名前を与える ——
 * 生の `null` が配線のあちこちに散ると、「宣言し忘れ」と「ハブである」の区別がつかない。
 */
export const TOOL_HUB: ToolId | null = null;

export interface HubHandlerDeps extends CreateRoomDeps, JoinRoomDeps, SaveRosterDeps {
  timers: TimerStore;
  hub: HubBroadcaster;
}

export interface HubHandlers {
  /** ハブの接続から届いた生テキストを捌く。**境界の検証はここで行う**（原則 IV）。 */
  handleMessage(connId: string, raw: string): Promise<void>;
}

export function makeHubHandlers(deps: HubHandlerDeps): HubHandlers {
  const { hub, timers } = deps;

  function fail(connId: string, code: string, message: string): void {
    hub.sendTo(connId, { type: "error", code, message });
  }

  /**
   * 表示名を名簿の規約で正規化する。**空になったら拒む。**
   *
   * 見えない文字だけの名前や、正規化で消える名前を通すと、選択画面に無名の行が並ぶ。
   */
  function normalized(connId: string, raw: string): string | null {
    const name = normalizeDisplayName(raw);
    if (name === null) {
      fail(connId, "INVALID_COMMAND", "表示名の形式が正しくありません");
      return null;
    }
    return name;
  }

  function handleCreate(connId: string, cmd: Extract<HubCommand, { command: "room.create" }>): void {
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
      fail(
        connId,
        created.error,
        "サーバーのルーム数が上限に達しています。時間をおいて再試行してください。",
      );
      return;
    }

    const { code, participantId, resumeToken, membership, timer } = created.value;

    // **timer の状態も作る**（2026-09-13 の裁定③）。入口の門はそのまま効き、
    // 選択画面から timer へ入れる。poker のラウンドは S5b（#248）で遅延生成にする。
    timers.put(timer);
    hub.sendTo(connId, { type: "room.created", code, participantId, resumeToken });
    // 保管と配信は対にする（`save-roster.ts`）。作成者自身にも名簿が届く。
    saveRoster(deps, membership);
  }

  function handleJoin(connId: string, cmd: Extract<HubCommand, { command: "room.join" }>): void {
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
      // **文言は timer の入口と同じにする。** 選択画面から総当たりされたときに、
      // 「存在しないルーム」と「入れないルーム」を区別させない（ADR 0011）。
      const code = joined.error;
      fail(connId, code, hubErrorMessage(code));
      return;
    }

    const { participantId, resumeToken, membership, timer } = joined.value;

    // 復帰でも新規でも、本人には復帰の組を返す。**ハブは `localStorage` にこれを持つ**
    // ので、復帰のときに返さないと次の読み込みで組が空になる（D12）。
    hub.sendTo(connId, { type: "room.joined", code: cmd.code, participantId, resumeToken });

    // AI 鍵の欄は timer の状態にある。ハブからの参加では変わらないが、
    // `joinRoom` が返した状態をそのまま保管して取りこぼしを防ぐ。
    if (timer !== undefined) timers.put(timer);
    saveRoster(deps, membership);
  }

  /** 利用者へ返す文言。**timer の入口と同じ言い回しにする。** */
  function hubErrorMessage(code: string): string {
    switch (code) {
      case "ROOM_NOT_FOUND":
        return "指定されたルームコードが見つかりません";
      case "PASSPHRASE_REQUIRED":
        return "このルームは合言葉で保護されています";
      case "PASSPHRASE_MISMATCH":
        return "合言葉が違います";
      case "JOIN_RATE_LIMITED":
        return "参加の試行が多すぎます。しばらく待ってから試してください";
      default:
        return "参加できませんでした";
    }
  }

  return {
    async handleMessage(connId: string, raw: string): Promise<void> {
      // 境界のパースは `@tasuki/protocol` に一本化してある（timer / poker と同じ入口）。
      const parsed = parseBoundaryMessage(HubCommandSchema, raw);
      if (parsed.isErr()) {
        const code = parsed.error.stage === "json" ? "INVALID_JSON" : "INVALID_COMMAND";
        const message =
          parsed.error.stage === "json" ? "JSON の形式が不正です" : "コマンドの形式が不正です";
        fail(connId, code, message);
        return;
      }

      const cmd = parsed.value;
      if (cmd.command === "room.create") {
        handleCreate(connId, cmd);
        return;
      }
      handleJoin(connId, cmd);
    },
  };
}
