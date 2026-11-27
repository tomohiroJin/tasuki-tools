/**
 * ハブへ送るコマンドの組み立て（#595・`use-hub-sync.ts` から分けた）。
 *
 * 入室のコマンドは、復帰・自動の再試行・利用者の名乗りの 3 か所で作る。形を 1 か所に置き、
 * 「合言葉が無いときは鍵ごと載せない」（`room.join` の `passphrase` は optional）をそろえる。
 */
import type { HubCommand } from '@tasuki/room-core';

/** 直近の名乗り。自動で入り直すときに使う。 */
export interface LastJoin {
  readonly displayName: string;
  readonly passphrase?: string;
}

/** 名乗りの引数から直近の名乗りを作る。合言葉が無ければ鍵を持たない。 */
export function lastJoinOf(displayName: string, passphrase?: string): LastJoin {
  return { displayName, ...(passphrase !== undefined ? { passphrase } : {}) };
}

/** ルームを作る。 */
export function createCommand(roomName: string, displayName: string): HubCommand {
  return { command: 'room.create', roomName, displayName };
}

/** 保存済みの組で入り直す（再接続・読み込み時の復帰）。 */
export function resumeCommand(
  code: string,
  saved: { readonly displayName: string; readonly resumeToken: string },
): HubCommand {
  return { command: 'room.join', code, displayName: saved.displayName, resumeToken: saved.resumeToken };
}

/** ルームの生死だけを尋ねる（#274）。名前を持たない。 */
export function checkCommand(code: string): HubCommand {
  return { command: 'room.check', code };
}

/** 名乗って入る。合言葉が無ければ鍵を載せない。 */
export function joinCommand(code: string, last: LastJoin): HubCommand {
  return {
    command: 'room.join',
    code,
    displayName: last.displayName,
    ...(last.passphrase !== undefined ? { passphrase: last.passphrase } : {}),
  };
}

/**
 * ルームの合言葉を設定・解除する（#638。もと timer のコマンド）。**空文字で解除。**
 * 宛先は接続が在席しているルームで、コードは載せない。
 */
export function passphraseCommand(passphrase: string): HubCommand {
  return { command: 'room.passphrase.set', passphrase };
}

/**
 * ルームの全員を同じ道具へ呼ぶ（#677）。宛先のルームは接続が在席しているルームで、コードは載せない。
 * 道具の綴りの実在はサーバーが検める（知らない綴りは形の誤りで返る）。
 */
export function callCommand(tool: string): HubCommand {
  return { command: 'room.call', tool };
}

/**
 * 混雑で弾かれた後の送り直し。
 *
 * **`last === null` は「まだ名乗っていない」** ＝ 送ったのは照会だけである（#274）。
 * エラーのフレームに相関の手がかりが無いので、送った側の状態で見分ける。
 */
export function retryCommand(code: string, last: LastJoin | null): HubCommand {
  return last === null ? checkCommand(code) : joinCommand(code, last);
}
