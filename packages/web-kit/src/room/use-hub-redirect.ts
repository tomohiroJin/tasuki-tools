import { useEffect, useRef } from 'react';

export interface HubRedirectOptions<Departure extends string> {
  /** 抜けた・外されたときの理由（無ければ null）。玄関が告知を出せるよう、理由を運ぶ（#290）。 */
  readonly departed: Departure | null;
  /** 名乗りが要る（玄関で済ませる）。理由なしで送る。 */
  readonly needsHub: boolean;
  readonly roomCode: string;
  /**
   * いま居る道具の ID（#638）。名乗り・合言葉のために玄関へ送るとき（`needsHub`）に運び、通ったあと
   * 玄関が元の道具へ戻す。抜けた・外されたとき（`departed`）は運ばない（戻すと、外されたまま入り直す往復になる）。
   */
  readonly returnTo?: string;
  /** 玄関のそのルームの URL（各アプリの `router.ts`）。 */
  readonly hubPathFor: (roomCode: string, departure?: Departure, returnTo?: string) => string;
  /** 履歴に残さず移動する（各アプリの `router.ts`。テストは `vi.mock` で差し替える）。 */
  readonly redirectTo: (to: string) => void;
}

/** 玄関へ送り返す。**判定は同期フック、適用はここ 1 箇所**。理由つき（departed）を先に見る。 */
export function useHubRedirect<Departure extends string>({ departed, needsHub, roomCode, returnTo, hubPathFor, redirectTo }: HubRedirectOptions<Departure>): void {
  // 関数は描くたびに新しくなりうる（ラムダ）。依存に入れると遷移が描くたびに発火するので、最新のものを ref で持つ
  const latest = useRef({ hubPathFor, redirectTo, returnTo });
  useEffect(() => {
    latest.current = { hubPathFor, redirectTo, returnTo };
  });
  useEffect(() => {
    const { hubPathFor: pathFor, redirectTo: go, returnTo: from } = latest.current;
    if (departed !== null) go(pathFor(roomCode, departed));
    else if (needsHub) go(pathFor(roomCode, undefined, from));
  }, [departed, needsHub, roomCode]);
}
