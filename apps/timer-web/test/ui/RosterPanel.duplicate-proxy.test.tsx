/**
 * 代理追加が同名で受け付けられないことを、**押した場所**で伝える（Issue #291）。
 *
 * 利用者の実画面フィードバックは「同姓同名の代理追加が何も言わずに失敗する」だった。
 * 実測すると拒否そのものは届いていた —— サーバーが `DuplicateName` を返し、画面も
 * バナーを出していた。**出ていた場所が操作地点から遠すぎた**（実ブラウザで
 * `getBoundingClientRect().top = -1075`＝ビューポートの 1075px 上。しかも 4 秒で消える）。
 * さらに押した瞬間にフォームが閉じ、入力が捨てられるので、直そうにも打ち直しになる。
 *
 * そこで**送る前に手元の名簿で衝突を見て、フォームの中に理由と次の手を出す**。
 * 同名の拒否そのものは緩めない（改名 `participant.rename` も同じ規則で拒む）。
 *
 * ## クライアントはサーバーより厳しくなってはいけない
 *
 * サーバーの判定プールは `occupants(state.membership, state.timer)`
 * （名簿の参加者**全員**＋輪の上の代理）で、画面が持つ `participants` / `seats` より
 * **広い**。広い側が拒み、狭い側が通すのは保険（サーバーの `DuplicateName` バナー）で
 * 拾える。逆向き —— **サーバーが通す名前を画面が拒む** —— には保険が無く、
 * 利用者は正当な操作をできなくなる。このファイルの検査はその向きを固定する。
 *
 * ズレは実 WS で測ってある（#291 の作業記録）。**選択画面（ハブ）に居るだけの人**は
 * snapshot の `participants` にも `seats` にも載らないのに、サーバーは同名の
 * `participant.addProxy` を `DuplicateName` で拒んだ。逆向きのズレ ——
 * 画面のプールに載るのにサーバーが受理する名前 —— は 1 つも出なかった。
 *
 * @requirements Issue #291（EARS 1: 受け付けなかったことと理由 / EARS 2: どうすれば追加できるか）
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import type { Participant, Seat } from "@tasuki/timer-core";

const mk = (id: string, name: string, over: Partial<Participant> = {}): Participant => ({
  participantId: id,
  displayName: name,
  presence: "online",
  hasAiKey: false,
  joinedAt: 1_000_000,
  ...over,
});

const seat = (id: string, displayName: string, over: Partial<Seat> = {}): Seat => ({
  id,
  displayName,
  isProxy: false,
  skipReason: null,
  ...over,
});

/** 代理追加の入力欄。 */
function proxyInput(): HTMLInputElement {
  return screen.getByLabelText("代理参加者の名前") as HTMLInputElement;
}

/** 代理追加フォームを開き、名前を入れて「追加」を押す。 */
function addProxy(name: string): void {
  fireEvent.click(screen.getByRole("button", { name: "代理参加者を追加" }));
  fireEvent.change(proxyInput(), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "追加" }));
}

const noop = vi.fn();
const baseProps = {
  currentDriverId: "p1",
  myParticipantId: "p1",
  onRename: noop,
  onSkip: noop,
  onResume: noop,
};

describe("RosterPanel 代理追加の同名拒否（#291）", () => {
  const participants = [mk("p1", "Alice"), mk("p2", "Bob")];

  it("同名の代理は送らず、フォームの中に「受け付けなかったこと」「理由」「次の手」を出す", () => {
    // Given（Bob がもう居る）
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);

    // When（同じ Bob を代理で足そうとする）
    addProxy("Bob");

    // Then（サーバーへは送らない）
    expect(onAddProxy).not.toHaveBeenCalled();
    // Then（押した場所＝フォームの中に出る。バナーではない）
    const alert = screen.getByRole("alert");
    // EARS 1: 受け付けなかったことと、その理由
    expect(alert.textContent).toContain("Bob");
    expect(alert.textContent).toContain("追加できませんでした");
    expect(alert.textContent).toContain("同じ名前の人がすでに居ます");
    // EARS 2: どうすれば追加できるか
    expect(alert.textContent).toContain("呼び分け");
  });

  it("入力を捨てずフォームも閉じない（その場で直せる）", () => {
    // Given
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={vi.fn()} />);
    // When
    addProxy("Bob");
    // Then（打った名前がそのまま残っている）
    expect(proxyInput().value).toBe("Bob");
  });

  it("入力欄が不正であることを支援技術へ伝える（aria-invalid と説明の結び付け）", () => {
    // Given
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={vi.fn()} />);
    // When
    addProxy("Bob");
    // Then
    const input = proxyInput();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    // 説明は「いま出ている理由」そのものを指す（別の要素を指して空振りしないこと）
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBe(screen.getByRole("alert"));
  });

  it("大文字小文字だけが違う名前も止める（サーバーと同じ述語）", () => {
    // Given（サーバーの `conflictsWithExisting` は trim + toLowerCase で比べる）
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);
    // When
    addProxy("bob");
    // Then
    expect(onAddProxy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("同じ名前の人がすでに居ます");
  });

  // サーバーが実際にどう扱うかは実 WS で測ってある（#291 の作業記録）。
  // 「Ｂｏｂ」「  Bob  」「BOB」「B<ZWSP>ob」はすべて `DuplicateName`、
  // 「Bob 2」は受理、不可視文字だけは `INVALID_COMMAND` だった。
  // ここで止める集合は、その `DuplicateName` の側と一致していなければならない。
  it.each([
    ["全角", "Ｂｏｂ"],
    ["ゼロ幅を挟んだもの", "B​ob"],
  ])("正規化すると同じになる名前も止める（%s）", (_label, typed) => {
    // Given（サーバーは `normalizeCommandNames` → `conflictsWithExisting` の順で見る）
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);
    // When
    addProxy(typed);
    // Then
    expect(onAddProxy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("同じ名前の人がすでに居ます");
  });

  it("輪に席はあるが timer の一覧に居ない人との同名も止める", () => {
    // Given（`participants` は timer の在席者に絞られる・#95 S5a R5/R6。
    //        離席した Carol は `seats` にだけ残る。サーバーの `occupants` は名簿から
    //        引くので Carol を数えており、送れば `DuplicateName` で返ってくる）
    const onAddProxy = vi.fn();
    render(
      <RosterPanel
        {...baseProps}
        participants={[mk("p1", "Alice")]}
        seats={[seat("p1", "Alice"), seat("p3", "Carol", { skipReason: "away" })]}
        rotation={["p1", "p3"]}
        onAddProxy={onAddProxy}
      />,
    );
    // When
    addProxy("Carol");
    // Then
    expect(onAddProxy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Carol");
  });

  it("名前が空の席を同名の相手に数えない（サーバーより厳しくしない）", () => {
    // Given（`Seat.displayName` は名簿から引けなければ `""` へ落ちる
    //        ——`timer-snapshot-dto.ts` の `names.get(e.participantId) ?? ""`。
    //        サーバーの `occupants` にそんな人は居ないので、サーバーは通す）
    const onAddProxy = vi.fn();
    render(
      <RosterPanel
        {...baseProps}
        participants={[mk("p1", "Alice")]}
        seats={[seat("p1", "Alice"), seat("ghost", "")]}
        rotation={["p1", "ghost"]}
        onAddProxy={onAddProxy}
      />,
    );
    // When（正規化すると空になる名前。同名ではなく「表示名の規約」の話なので、
    //        手元で「同じ名前の人がすでに居ます」と言うのは嘘になる）
    addProxy("​");
    // Then（手元では止めず、理由はサーバーの規約に答えさせる）
    expect(onAddProxy).toHaveBeenCalledWith("​");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("衝突しない名前は今までどおり送られ、フォームが閉じて入力も消える", () => {
    // Given
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);
    // When
    addProxy("Dave");
    // Then
    expect(onAddProxy).toHaveBeenCalledWith("Dave");
    expect(screen.queryByLabelText("代理参加者の名前")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("名前を打ち直すと理由は消える（直したのに赤いままにしない）", () => {
    // Given（一度拒まれた状態）
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={vi.fn()} />);
    addProxy("Bob");
    expect(screen.getByRole("alert")).toBeTruthy();
    // When
    fireEvent.change(proxyInput(), { target: { value: "Bob 2" } });
    // Then
    expect(screen.queryByRole("alert")).toBeNull();
    expect(proxyInput().getAttribute("aria-invalid")).toBeNull();
  });

  it("フォームを閉じて開き直すと理由は残っていない", () => {
    // Given
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={vi.fn()} />);
    addProxy("Bob");
    // When（「代理追加」をもう一度押して閉じ、また開く）
    fireEvent.click(screen.getByRole("button", { name: "代理参加者を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "代理参加者を追加" }));
    // Then（開き直した先に、前に拒まれた理由が残っていない）
    expect(screen.queryByRole("alert")).toBeNull();
    expect(proxyInput().getAttribute("aria-invalid")).toBeNull();
  });
});
