/**
 * エラーコードを受けて画面が次に何をするかの決定（Issue #32・FR-127/FR-129）。
 */

/** 画面の次の動作。誰の操作で退出したかにより行き先が分かれる。 */
export type ErrorAction =
  | { kind: "session-lost" }
  | { kind: "leave-room"; destination: "join" | "setup" }
  | { kind: "transient" };

/**
 * エラーコードから画面の次の動作を決める。
 *
 * **既定は `transient`（画面を移さない）。** 画面を移す・状態を破棄するコードだけを
 * 明示的に列挙する。こうしておけば、サーバー側に新しいエラーコードが増えても、
 * ここへ列挙し忘れた新規コードは安全側（画面が飛ばない・操作できる画面に留まる）に倒れる。
 */
export function errorAction(code: string): ErrorAction {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return { kind: "session-lost" };
    case "LEFT_ROOM":
      return { kind: "leave-room", destination: "setup" };
    case "REMOVED_FROM_ROOM":
    case "REMOVED_BY_HOST":
      return { kind: "leave-room", destination: "join" };
    default:
      return { kind: "transient" };
  }
}
