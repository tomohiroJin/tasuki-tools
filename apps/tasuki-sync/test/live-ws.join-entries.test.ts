/**
 * 入口ごとの参加の結果の特性テスト（#366 Task 1）。
 *
 * hub・topic・roulette の参加は、同じ流れを入口ごとに写して作ってきた（#366）。それを 1 つの
 * ユースケースへまとめる前に、**入口ごとに送るフレームの並び**を実 WS 越しに固定する。
 * timer の参加はまとめないが、失敗の文言の引き方（`ROOM_NOT_FOUND` の書き分け）を共有するので
 * 同じ表に入れる。
 *
 * - 場面ごとに新しいサーバーを立てる（レート制限のバケツや名簿が、場面の間で混ざらないように）
 * - 値が毎回変わるもの（ルームのコード・参加者 ID・復帰トークン・時刻）は、出てきた順の記号に置き換えて比べる
 * - 期待値は、まとめる前の実装で得たフレームを直書きしたもの
 * - timer の成功は snapshot が大きいので、フレームの `type` の並びだけを見る（中身は timer のテストが見ている）
 */
import { afterEach, describe, expect, it } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import { createRoom, startLiveSyncServer, type LiveClient, type LiveSyncServer } from "./support/live-sync-server.js";

type Entry = "hub" | "topic" | "roulette" | "timer";
type Scene =
  | "新しく参加する"
  | "復帰する"
  | "2 度目の参加"
  | "表示名が規約に合わない"
  | "ルームが無い"
  | "合言葉が要る"
  | "合言葉が違う"
  | "参加の試しすぎ";

/** 送って受けるだけの、入口を問わないクライアントの形。 */
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

/** 送ってから届いたフレームを返す。 */
async function sendAndCollect(client: AnyClient, cmd: unknown): Promise<unknown[]> {
  const before = client.received.length;
  client.send(cmd);
  await settle(client);
  return client.received.slice(before);
}

/**
 * 毎回変わる値を、出てきた順の記号に置き換える。
 * ルームのコードは `<room>`、参加者 ID は `<p1>`・`<p2>`…、復帰トークンは `<token>`、時刻は `<t>`。
 */
function normalize(frames: unknown[], roomCode: string): unknown[] {
  const participants = new Map<string, string>();
  const walk = (value: unknown, key: string | undefined): unknown => {
    if (typeof value === "string") {
      if (value === roomCode) return "<room>";
      if (/^p_/.test(value)) {
        if (!participants.has(value)) participants.set(value, `<p${participants.size + 1}>`);
        return participants.get(value);
      }
      if (/^rt_/.test(value)) return "<token>";
      return value;
    }
    if (typeof value === "number" && (key === "createdAt" || key === "joinedAt")) return "<t>";
    if (Array.isArray(value)) return value.map((v) => walk(v, undefined));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    }
    return value;
  };
  return frames.map((f) => walk(f, undefined));
}

/** timer の成功は `type` の並びだけにする（上の冒頭の注記）。失敗はフレームのまま。 */
function summarize(entry: Entry, frames: unknown[]): unknown[] {
  if (entry !== "timer") return frames;
  return frames.map((f) => {
    const frame = f as { type: string };
    return frame.type === "error" ? frame : frame.type;
  });
}

const JOIN = (code: string, extra: Record<string, unknown> = {}) => ({
  command: "room.join",
  code,
  displayName: "さくら",
  ...extra,
});

/** 場面を演じ、その場面で観測するフレーム（正規化済み）を返す。 */
async function play(entry: Entry, scene: Scene): Promise<unknown> {
  const s = startLiveSyncServer();
  server = s;
  const owner: LiveClient = await s.connect("owner");
  const { code } = await createRoom(owner, "オーナー");
  const client = await connect(s, entry);

  switch (scene) {
    case "新しく参加する":
      return summarize(entry, normalize(await sendAndCollect(client, JOIN(code)), code));
    case "復帰する": {
      const first = await sendAndCollect(client, JOIN(code));
      const joined = first.find((f) => (f as { type: string }).type === "room.joined") as { resumeToken: string };
      const again = await connect(s, entry);
      const frames = await sendAndCollect(again, JOIN(code, { resumeToken: joined.resumeToken }));
      return summarize(entry, normalize([...first, ...frames], code).slice(first.length));
    }
    case "2 度目の参加": {
      const first = await sendAndCollect(client, JOIN(code));
      const frames = await sendAndCollect(client, JOIN(code));
      return summarize(entry, normalize([...first, ...frames], code).slice(first.length));
    }
    case "表示名が規約に合わない":
      return normalize(await sendAndCollect(client, JOIN(code, { displayName: "​" })), code);
    case "ルームが無い":
      return normalize(await sendAndCollect(client, JOIN("ZZZZZZ")), code);
    case "合言葉が要る":
    case "合言葉が違う": {
      owner.send({ command: "room.passphrase.set", passphrase: "ひみつ" });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const extra = scene === "合言葉が違う" ? { passphrase: "ちがう" } : {};
      return normalize(await sendAndCollect(client, JOIN(code, extra)), code);
    }
    case "参加の試しすぎ": {
      // 無いコードへの参加を、バケツの容量を超えて一度に送る（間を空けると補充されて拒まれない）。
      // 何回目で拒まれるかは補充の時刻で揺れるので、拒んだフレームの形だけを見る
      const before = client.received.length;
      for (let i = 0; i < DEFAULT_CAPACITY + 5; i++) client.send(JOIN("ZZZZZZ"));
      await settle(client);
      const frames = client.received.slice(before) as { code?: string }[];
      return normalize(
        frames.filter((f) => f.code === "JOIN_RATE_LIMITED").slice(0, 1),
        code,
      );
    }
  }
}

const ENTRIES: readonly Entry[] = ["hub", "topic", "roulette", "timer"];
const SCENES: readonly Scene[] = [
  "新しく参加する",
  "復帰する",
  "2 度目の参加",
  "表示名が規約に合わない",
  "ルームが無い",
  "合言葉が要る",
  "合言葉が違う",
  "参加の試しすぎ",
];

/** 期待値（まとめる前の実装で得たもの）。キーは `入口 / 場面`。 */
const EXPECTED: Record<string, unknown> = {
  "hub / 新しく参加する": [
    {
      "type": "room.joined",
      "code": "<room>",
      "participantId": "<p1>",
      "resumeToken": "<token>"
    },
    {
      "type": "roster",
      "room": {
        "code": "<room>",
        "participants": [
          {
            "participantId": "<p2>",
            "displayName": "オーナー",
            "presence": "online",
            "tools": [
              "timer"
            ]
          },
          {
            "participantId": "<p1>",
            "displayName": "さくら",
            "presence": "online",
            "tools": []
          }
        ]
      }
    },
    {
      "type": "topic",
      "state": {
        "topic": null,
        "generating": false,
        "degraded": false,
        "aiUnlocked": false
      }
    }
  ],
  "hub / 復帰する": [
    {
      "type": "room.joined",
      "code": "<room>",
      "participantId": "<p1>",
      "resumeToken": "<token>"
    },
    {
      "type": "roster",
      "room": {
        "code": "<room>",
        "participants": [
          {
            "participantId": "<p2>",
            "displayName": "オーナー",
            "presence": "online",
            "tools": [
              "timer"
            ]
          },
          {
            "participantId": "<p1>",
            "displayName": "さくら",
            "presence": "online",
            "tools": []
          }
        ]
      }
    },
    {
      "type": "topic",
      "state": {
        "topic": null,
        "generating": false,
        "degraded": false,
        "aiUnlocked": false
      }
    }
  ],
  "hub / 2 度目の参加": [
    {
      "type": "error",
      "code": "INVALID_COMMAND",
      "message": "コマンドの形式が不正です"
    }
  ],
  "hub / 表示名が規約に合わない": [
    {
      "type": "error",
      "code": "INVALID_COMMAND",
      "message": "表示名の形式が正しくありません"
    }
  ],
  "hub / ルームが無い": [
    {
      "type": "error",
      "code": "ROOM_NOT_FOUND",
      "message": "指定されたルームコードが見つかりません"
    }
  ],
  "hub / 合言葉が要る": [
    {
      "type": "error",
      "code": "PASSPHRASE_REQUIRED",
      "message": "このルームはパスフレーズが必要です。"
    }
  ],
  "hub / 合言葉が違う": [
    {
      "type": "error",
      "code": "PASSPHRASE_MISMATCH",
      "message": "パスフレーズが一致しません。"
    }
  ],
  "hub / 参加の試しすぎ": [
    {
      "type": "error",
      "code": "JOIN_RATE_LIMITED",
      "message": "参加の試行が多すぎます。しばらく待ってから再試行してください。"
    }
  ],
  "topic / 新しく参加する": [
    {
      "type": "room.joined",
      "code": "<room>",
      "participantId": "<p1>",
      "resumeToken": "<token>"
    },
    {
      "type": "topic",
      "state": {
        "topic": null,
        "generating": false,
        "degraded": false,
        "aiUnlocked": false
      }
    }
  ],
  "topic / 復帰する": [
    {
      "type": "room.joined",
      "code": "<room>",
      "participantId": "<p1>",
      "resumeToken": "<token>"
    },
    {
      "type": "topic",
      "state": {
        "topic": null,
        "generating": false,
        "degraded": false,
        "aiUnlocked": false
      }
    }
  ],
  "topic / 2 度目の参加": [
    {
      "type": "error",
      "code": "INVALID_COMMAND",
      "message": "コマンドの形式が不正です"
    }
  ],
  "topic / 表示名が規約に合わない": [
    {
      "type": "error",
      "code": "INVALID_COMMAND",
      "message": "表示名の形式が正しくありません"
    }
  ],
  "topic / ルームが無い": [
    {
      "type": "error",
      "code": "ROOM_NOT_FOUND",
      "message": "指定されたルームコードが見つかりません"
    }
  ],
  "topic / 合言葉が要る": [
    {
      "type": "error",
      "code": "PASSPHRASE_REQUIRED",
      "message": "このルームはパスフレーズが必要です。"
    }
  ],
  "topic / 合言葉が違う": [
    {
      "type": "error",
      "code": "PASSPHRASE_MISMATCH",
      "message": "パスフレーズが一致しません。"
    }
  ],
  "topic / 参加の試しすぎ": [
    {
      "type": "error",
      "code": "JOIN_RATE_LIMITED",
      "message": "参加の試行が多すぎます。しばらく待ってから再試行してください。"
    }
  ],
  "roulette / 新しく参加する": [
    {
      "type": "room.joined",
      "code": "<room>",
      "participantId": "<p1>",
      "resumeToken": "<token>"
    },
    {
      "type": "roster",
      "room": {
        "code": "<room>",
        "participants": [
          {
            "participantId": "<p2>",
            "displayName": "オーナー",
            "presence": "online",
            "tools": [
              "timer"
            ]
          },
          {
            "participantId": "<p1>",
            "displayName": "さくら",
            "presence": "online",
            "tools": [
              "roulette"
            ]
          }
        ]
      }
    },
    {
      "type": "roulette",
      "state": {
        "excluded": [],
        "guests": [],
        "drawn": [],
        "spin": null
      }
    }
  ],
  "roulette / 復帰する": [
    {
      "type": "room.joined",
      "code": "<room>",
      "participantId": "<p1>",
      "resumeToken": "<token>"
    },
    {
      "type": "roster",
      "room": {
        "code": "<room>",
        "participants": [
          {
            "participantId": "<p2>",
            "displayName": "オーナー",
            "presence": "online",
            "tools": [
              "timer"
            ]
          },
          {
            "participantId": "<p1>",
            "displayName": "さくら",
            "presence": "online",
            "tools": [
              "roulette"
            ]
          }
        ]
      }
    },
    {
      "type": "roulette",
      "state": {
        "excluded": [],
        "guests": [],
        "drawn": [],
        "spin": null
      }
    }
  ],
  "roulette / 2 度目の参加": [
    {
      "type": "error",
      "code": "INVALID_COMMAND",
      "message": "コマンドの形式が不正です"
    }
  ],
  "roulette / 表示名が規約に合わない": [
    {
      "type": "error",
      "code": "INVALID_COMMAND",
      "message": "表示名の形式が正しくありません"
    }
  ],
  "roulette / ルームが無い": [
    {
      "type": "error",
      "code": "ROOM_NOT_FOUND",
      "message": "指定されたルームコードが見つかりません"
    }
  ],
  "roulette / 合言葉が要る": [
    {
      "type": "error",
      "code": "PASSPHRASE_REQUIRED",
      "message": "このルームはパスフレーズが必要です。"
    }
  ],
  "roulette / 合言葉が違う": [
    {
      "type": "error",
      "code": "PASSPHRASE_MISMATCH",
      "message": "パスフレーズが一致しません。"
    }
  ],
  "roulette / 参加の試しすぎ": [
    {
      "type": "error",
      "code": "JOIN_RATE_LIMITED",
      "message": "参加の試行が多すぎます。しばらく待ってから再試行してください。"
    }
  ],
  "timer / 新しく参加する": [
    "room.joined",
    "snapshot",
    "snapshot",
    "topic"
  ],
  "timer / 復帰する": [
    "snapshot",
    "snapshot",
    "topic"
  ],
  "timer / 2 度目の参加": [
    "room.joined",
    "snapshot",
    "snapshot",
    "snapshot",
    "topic"
  ],
  "timer / 表示名が規約に合わない": [
    {
      "type": "error",
      "code": "INVALID_COMMAND",
      "message": "コマンドの形式が不正です"
    }
  ],
  "timer / ルームが無い": [
    {
      "type": "error",
      "code": "ROOM_NOT_FOUND",
      "message": "指定されたルームコードが見つかりません"
    }
  ],
  "timer / 合言葉が要る": [
    {
      "type": "error",
      "code": "PASSPHRASE_REQUIRED",
      "message": "このルームはパスフレーズが必要です。"
    }
  ],
  "timer / 合言葉が違う": [
    {
      "type": "error",
      "code": "PASSPHRASE_MISMATCH",
      "message": "パスフレーズが一致しません。"
    }
  ],
  "timer / 参加の試しすぎ": [
    {
      "type": "error",
      "code": "JOIN_RATE_LIMITED",
      "message": "参加の試行が多すぎます。しばらく待ってから再試行してください。"
    }
  ],
};

describe("入口ごとの参加の結果（#366 の特性テスト）", () => {
  for (const entry of ENTRIES) {
    for (const scene of SCENES) {
      it(`Given ${entry} の入口 / When ${scene} / Then まとめる前と同じフレームを送る`, async () => {
        // Given / When
        const observed = await play(entry, scene);
        // Then
        expect(observed).toEqual(EXPECTED[`${entry} / ${scene}`]);
      }, 20_000);
    }
  }
});
