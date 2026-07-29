/**
 * 拒否理由の表示文言のテスト（host-spof-relaxation G5）
 *
 * ボタンを隠すだけでは「なぜ押せないか」が伝わらず、詰みの自己解消につながらない。
 * 「いつ・誰が実行できるか」を1箇所で日本語にする。
 *
 * @requirements FR-069, FR-080
 */

import { describe, it, expect } from "vitest";
import { permissionHint } from "../../src/ui/permission-hints.js";

describe("permissionHint", () => {
  it("実行できる場合は null を返す（ヒントを出さない）", () => {
    const hint = permissionHint({
      command: "session.abort",
      role: "editor",
      started: true,
      isSelfTarget: false,
    });

    expect(hint).toBeNull();
  });

  describe("開始前のホスト限定が効いているとき", () => {
    it("段階（開始前）と誰が実行できるか（ホスト）の両方を伝える", () => {
      const hint = permissionHint({
        command: "session.abort",
        role: "editor",
        started: false,
        isSelfTarget: false,
      });

      expect(hint).toContain("開始前");
      expect(hint).toContain("ホスト");
    });

    it("見学者であっても、開始前のホスト限定が binding ならそちらを伝える", () => {
      // 進行に加わっても実行できない（ホスト限定なので）。
      // 「進行に加われば実行できます」と案内すると嘘になる。
      const hint = permissionHint({
        command: "session.abort",
        role: "viewer",
        started: false,
        isSelfTarget: false,
      });

      expect(hint).toContain("開始前");
    });
  });

  describe("見学者の制限が効いているとき", () => {
    it("進行に加われば実行できることを伝える（自己解消の導線）", () => {
      const hint = permissionHint({
        command: "session.abort",
        role: "viewer",
        started: true,
        isSelfTarget: false,
      });

      expect(hint).toContain("見学");
      // 案内するボタン名は SpectatorSelfActions が実際に出すラベルと一致していなければ、
      // 利用者は画面上でそれを探せない。鉤括弧ごと固定して食い違いを検出する
      // （"進行に加わる" だけだと "進行に加わると" のような別表現にも偶然マッチする）。
      expect(hint).toContain("「進行に加わる」");
    });

    it("開始前でもホスト限定でないコマンドなら見学者の制限を伝える", () => {
      // config.set は EDITOR_PLUS。ホストに昇格しなくても、編集者になれば実行できる。
      const hint = permissionHint({
        command: "config.set",
        role: "viewer",
        started: false,
        isSelfTarget: false,
      });

      expect(hint).toContain("見学");
    });
  });

  describe("開始前の他人対象の制限", () => {
    it("他の参加者への操作である旨を伝える", () => {
      const hint = permissionHint({
        command: "participant.rename",
        role: "editor",
        started: false,
        isSelfTarget: false,
      });

      expect(hint).toContain("他の参加者");
    });

    it("自分対象なら実行できるので null を返す", () => {
      const hint = permissionHint({
        command: "participant.rename",
        role: "editor",
        started: false,
        isSelfTarget: true,
      });

      expect(hint).toBeNull();
    });
  });

  describe("規則表にないコマンド", () => {
    it("汎用の文言を返す（内部コード名を画面に出さない）", () => {
      const hint = permissionHint({
        command: "unknown.command",
        role: "host",
        started: true,
        isSelfTarget: false,
      });

      expect(hint).not.toBeNull();
      expect(hint).not.toContain("unknown.command");
    });
  });
});
