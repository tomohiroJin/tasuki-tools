/**
 * 合言葉の長さの上限を、どの入口の `room.join` でも同じに確かめる（#377）。
 *
 * かつて timer の入口だけが 128 字の上限を掛け、玄関（hub）とそのスキーマを通る
 * topic・roulette は上限なしで比べる処理まで通していた。上限の正本は
 * `@tasuki/room-core` の `MAX_PASSPHRASE` ひとつで、実 WS 越しに 4 つの入口が
 * 同じエラーコードで断ることを見る。
 */
import { afterEach, describe, expect, it } from "bun:test";
import { MAX_PASSPHRASE } from "@tasuki/room-core";
import { createRoom, startLiveSyncServer, type LiveSyncServer } from "./support/live-sync-server.js";

type Entry = "hub" | "topic" | "roulette" | "agenda" | "checkin" | "timer";
const ENTRIES: readonly Entry[] = ["hub", "topic", "roulette", "agenda", "checkin", "timer"];

interface AnyClient {
  readonly received: readonly unknown[];
  send(cmd: unknown): void;
}

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function connect(s: LiveSyncServer, entry: Entry): Promise<AnyClient> {
  switch (entry) {
    case "hub":
      return s.connectHub();
    case "topic":
      return s.connectTopic();
    case "roulette":
      return s.connectRoulette();
    case "agenda":
      return s.connectAgenda();
    case "checkin":
      return s.connectCheckin();
    case "timer":
      return s.connect();
  }
}

/** 新しいフレームが 150ms 届かなくなるまで待つ。 */
async function settle(client: AnyClient): Promise<void> {
  let seen = -1;
  while (seen !== client.received.length) {
    seen = client.received.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** 合言葉つきのルームへ、長さ `length` の（違う）合言葉で参加し、返ったエラーのコードを返す。 */
async function joinWithPassphraseOf(entry: Entry, length: number): Promise<string | undefined> {
  const s = startLiveSyncServer();
  server = s;
  const owner = await s.connect("owner");
  const { code } = await createRoom(owner, "オーナー");
  owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
  await settle(owner);

  const client = await connect(s, entry);
  const before = client.received.length;
  client.send({ command: "room.join", code, displayName: "さくら", passphrase: "a".repeat(length) });
  await settle(client);
  const frames = client.received.slice(before) as { type?: string; code?: string }[];
  return frames.find((f) => f.type === "error")?.code;
}

describe("room.join の合言葉の長さの上限（#377）", () => {
  for (const entry of ENTRIES) {
    it(`Given ${entry} の入口 / When 上限を 1 字超える合言葉で参加する / Then INVALID_COMMAND で断る`, async () => {
      expect(await joinWithPassphraseOf(entry, MAX_PASSPHRASE + 1)).toBe("INVALID_COMMAND");
    }, 20_000);

    it(`Given ${entry} の入口 / When 上限ちょうどの（違う）合言葉で参加する / Then 比べたうえで PASSPHRASE_MISMATCH で断る`, async () => {
      expect(await joinWithPassphraseOf(entry, MAX_PASSPHRASE)).toBe("PASSPHRASE_MISMATCH");
    }, 20_000);
  }

  it("Given timer の入口 / When 上限を 1 字超える合言葉を掛ける / Then INVALID_COMMAND で断る", async () => {
    // Given
    const s = startLiveSyncServer();
    server = s;
    const owner = await s.connect("owner");
    await createRoom(owner, "オーナー");
    const before = owner.received.length;

    // When
    owner.send({ command: "room.passphrase.set", passphrase: "a".repeat(MAX_PASSPHRASE + 1) });
    await settle(owner);

    // Then
    const frames = owner.received.slice(before) as { type?: string; code?: string }[];
    expect(frames.find((f) => f.type === "error")?.code).toBe("INVALID_COMMAND");
  }, 20_000);
});
