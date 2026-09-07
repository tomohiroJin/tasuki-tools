/** IdGen の実装。ルーム ID は UUID の先頭 8 文字を英数字小文字にしたもの（research R4） */
import type { IdGen } from '../ports/id-gen';

export function createCryptoIdGen(): IdGen {
  return {
    roomIdCandidate: () => crypto.randomUUID().replaceAll('-', '').slice(0, 8).toLowerCase(),
    participantId: () => crypto.randomUUID(),
    token: () => crypto.randomUUID(),
  };
}
