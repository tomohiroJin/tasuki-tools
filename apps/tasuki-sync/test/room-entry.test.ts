/**
 * ルームへ入れるかの判定（`room-entry.ts`）の順序の契約（#596）。
 *
 * 契約: **復帰が成立した人は合言葉の関門を通さない。** 関門（`checkPassphrase`）は、復帰の判定
 * （`findResumableParticipant`）が成立しなかった印（`ResumeMiss`）を受け取るので、判定を飛ばして
 * 関門だけを呼ぶ配線は型で止まる（呼び出しの順を型で示すもので、トークン無しで判定を呼ぶ迂回までは止めない）。ここは、その型の止め方と、判定の結果の形を見る。
 */
import { describe, expect, it } from "bun:test";
import type { Room } from "@tasuki/room-core";
import { checkPassphrase, findResumableParticipant } from "../src/application/room-entry.js";
import { createTokenStore } from "../src/application/token-store.js";
import { aRoom } from "./support/room-builder.js";

async function roomWithToken(): Promise<{ room: Room; code: string; hostId: string; tokens: ReturnType<typeof createTokenStore> }> {
  const { store, code, ids } = await aRoom().build();
  const tokens = createTokenStore();
  tokens.issueResume("tok-host", { participantId: ids["Host"]!, roomCode: code });
  return { room: store.get(code)!, code, hostId: ids["Host"]!, tokens };
}

describe("復帰の判定と合言葉の関門の順序（room-entry）", () => {
  it("WHEN 有効な復帰の組を示す THE 判定 SHALL 参加者とトークンを持つ resumed を返す", async () => {
    const { room, code, hostId, tokens } = await roomWithToken();

    const outcome = findResumableParticipant(tokens, room, code, "tok-host");

    expect(outcome.kind).toBe("resumed");
    if (outcome.kind !== "resumed") throw new Error("unreachable");
    expect(outcome.participant.id).toBe(hostId);
    expect(outcome.resumeToken).toBe("tok-host");
  });

  it.each<[string, (code: string) => { token: string | undefined; code: string }]>([
    ["トークンを示さない", (code) => ({ token: undefined, code })],
    ["未発行のトークン", (code) => ({ token: "no-such", code })],
    ["別のルームのコードで示す", () => ({ token: "tok-host", code: "other-room" })],
  ])("WHEN 復帰の組が成立しない（%s） THE 判定 SHALL miss を返し、関門へ進める", async (_label, make) => {
    const { room, code, tokens } = await roomWithToken();
    const { token, code: presentedCode } = make(code);

    const outcome = findResumableParticipant(tokens, room, presentedCode, token);

    expect(outcome.kind).toBe("miss");
    if (outcome.kind !== "miss") throw new Error("unreachable");
    // miss を受け取った関門だけが、合言葉の有無で判定する
    expect(checkPassphrase("secret", "wrong", outcome).isErr()).toBe(true);
    expect(checkPassphrase("secret", "secret", outcome).isOk()).toBe(true);
    expect(checkPassphrase(undefined, undefined, outcome).isOk()).toBe(true);
  });

  it("WHEN 復帰の判定を経ずに関門を呼ぶ THE コンパイル SHALL 通らない（型が呼び出しの順を示す。トークン無しの判定を経る迂回は可能）", () => {
    // 実行時に確かめるものは無い。下の 2 行が「型エラーになること」を typecheck が見張る。
    // `@ts-expect-error` が不要になった（＝型エラーが出なくなった）ら typecheck が赤くなる。
    const skipped = () => {
      // @ts-expect-error 第 3 引数（復帰を試みて成立しなかった印）が無い
      checkPassphrase("secret", "secret");
      // @ts-expect-error 印を手で作っても通らない（unique symbol のキーを持てない）
      checkPassphrase("secret", "secret", { kind: "miss" });
    };
    expect(typeof skipped).toBe("function");
  });
});
