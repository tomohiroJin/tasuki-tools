import { useEffect, useRef } from 'react';

export interface HubRedirectOptions<Departure extends string> {
  /** 抜けた・外されたときの理由（無ければ null）。玄関が告知を出せるよう、理由を運ぶ（#290）。 */
  readonly departed: Departure | null;
  /** 名乗りが要る（玄関で済ませる）。理由なしで送る。 */
  readonly needsHub: boolean;
  readonly roomCode: string;
  /** 玄関のそのルームの URL（各アプリの `router.ts`）。 */
  readonly hubPathFor: (roomCode: string, departure?: Departure) => string;
  /** 履歴に残さず移動する（各アプリの `router.ts`。テストは `vi.mock` で差し替える）。 */
  readonly redirectTo: (to: string) => void;
}

/** 玄関へ送り返す。**判定は同期フック、適用はここ 1 箇所**。理由つき（departed）を先に見る。 */
export function useHubRedirect<Departure extends string>({ departed, needsHub, roomCode, hubPathFor, redirectTo }: HubRedirectOptions<Departure>): void {
  // 関数は描くたびに新しくなりうる（ラムダ）。依存に入れると遷移が描くたびに発火するので、最新のものを ref で持つ
  const latest = useRef({ hubPathFor, redirectTo });
  useEffect(() => {
    latest.current = { hubPathFor, redirectTo };
  });
  useEffect(() => {
    const { hubPathFor: pathFor, redirectTo: go } = latest.current;
    if (departed !== null) go(pathFor(roomCode, departed));
    else if (needsHub) go(pathFor(roomCode));
  }, [departed, needsHub, roomCode]);
}
