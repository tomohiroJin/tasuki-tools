// 参加者トークンの保存（research R3: localStorage にルーム ID 別で保存）
export interface StoredIdentity {
  token: string;
  name: string;
}

const key = (roomId: string) => `poker:participant:${roomId}`;

export function saveIdentity(roomId: string, identity: StoredIdentity): void {
  localStorage.setItem(key(roomId), JSON.stringify(identity));
}

export function loadIdentity(roomId: string): StoredIdentity | null {
  const raw = localStorage.getItem(key(roomId));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredIdentity).token === 'string' &&
      typeof (parsed as StoredIdentity).name === 'string'
    ) {
      return parsed as StoredIdentity;
    }
  } catch {
    // 壊れた値は捨てる
  }
  localStorage.removeItem(key(roomId));
  return null;
}

/** ルーム消滅時などに削除（参加失敗時の再試行ループ防止） */
export function clearIdentity(roomId: string): void {
  localStorage.removeItem(key(roomId));
}
