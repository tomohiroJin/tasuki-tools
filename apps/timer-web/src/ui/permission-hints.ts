/**
 * 拒否理由の表示文言（Issue #22・FR-069/FR-080）。
 *
 * 実行できない操作は原則として画面に出さないが、出す場合（無効化して残す場合）は
 * 「いつ・誰が実行できるか」を伝える。ボタンを黙って隠すだけでは、見学者が
 * 「進行に加われば自分で解消できる」ことに気づけず、詰みが続く。
 *
 * 可否の判定そのものは `@tasuki/timer-core` の `checkPermission()` が単独で持つ（FR-071）。
 * ここが持つのは表示の責務だけで、独自の規則は一切持たない。
 * サーバーが返す message とは別物である（あちらはコマンド名を含む開発者向けの文言）。
 */

import { checkPermission, type PermissionInput } from "@tasuki/timer-core";

/**
 * 実行できない理由を日本語のヒントで返す。実行できるなら null。
 *
 * **どの制約が binding かを反実仮想で特定する。** 見学者がホスト限定のコマンドを
 * 押せないとき、理由は「見学者だから」と「開始前だから」の両方が真になる。
 * このとき「進行に加わると実行できます」と案内するのは嘘で、加わっても実行できない。
 * 役割を差し替えて `checkPermission` を引き直し、実際に解消する条件だけを提示する。
 */
export function permissionHint(input: PermissionInput): string | null {
  if (checkPermission(input).allowed) return null;

  // 弱い方の昇格（見学者→編集者）から先に試す。これで解消するなら binding なのは
  // 「見学者であること」であり、本人の操作だけで解消できる。
  // 順序を逆にすると、開始前の config.set のように「ホストでも編集者でも実行できる」
  // コマンドで「開始前はホストだけ」と誤って案内してしまう。
  if (input.role === "viewer") {
    if (checkPermission({ ...input, role: "editor" }).allowed) {
      // ボタン名は SpectatorSelfActions が実際に描画するラベルと一致させること。
      // 画面に無い名前を案内すると、利用者は指示された操作を探せない。
      return "見学中は実行できません。「進行に加わる」を押すと実行できるようになります。";
    }
  }

  // 編集者でも解消せず、ホストなら実行できる → binding なのは「開始前のホスト限定」。
  if (input.role !== "host" && !input.started) {
    if (checkPermission({ ...input, role: "host" }).allowed) {
      return input.isSelfTarget
        ? "セッション開始前は、ホストだけが実行できます。"
        : "セッション開始前は、他の参加者への操作をホストだけが実行できます。";
    }
  }

  // 上記のどれでも解消しない（規則表に無いコマンド等）。内部のコマンド名は画面に出さない。
  return "この操作は実行できません。";
}
