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
  onAddProxy: noop,
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

  it("衝突しない名前は送られるが、返事が来るまでフォームは閉じず入力も残す", () => {
    // Given（**画面が予測できない拒否が残っている。** 輪が満席（MemberLimitExceeded）、
    //        選択画面に居るだけの人との同名（DuplicateName）、表示名の規約違反
    //        （INVALID_COMMAND）。送った瞬間に閉じて入力を捨てると、そのときだけ
    //        #291 と同じ「押しても何も起きない」が戻る）
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);
    // When
    addProxy("Dave");
    // Then
    expect(onAddProxy).toHaveBeenCalledWith("Dave");
    expect(proxyInput().value).toBe("Dave");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("名簿にその代理が現れたらフォームを閉じて入力も消す", () => {
    // Given（送ったところ）
    const onAddProxy = vi.fn();
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />,
    );
    addProxy("Dave");
    expect(proxyInput().value).toBe("Dave");
    // When（サーバーが受理して、新しい名簿が届く）
    rerender(
      <RosterPanel
        {...baseProps}
        participants={[...participants, mk("proxy-1", "Dave", { isPlaceholder: true })]}
        onAddProxy={onAddProxy}
      />,
    );
    // Then
    expect(screen.queryByLabelText("代理参加者の名前")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("名簿が変わっても自分の代理が現れないうちは閉じない（拒まれた場合）", () => {
    // Given（選択画面に居るだけの人と同名だった等、画面が予測できない理由で拒まれた）
    const onAddProxy = vi.fn();
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />,
    );
    addProxy("Dave");
    // When（別の出来事で名簿だけが変わる）
    rerender(
      <RosterPanel
        {...baseProps}
        participants={[...participants, mk("p3", "Carol")]}
        onAddProxy={onAddProxy}
      />,
    );
    // Then（打った名前は残り、その場で直せる）
    expect(proxyInput().value).toBe("Dave");
  });

  it("返事を待つ間に打ち直していたら、その入力を捨てない（この対策自身の欠陥）", () => {
    // Given（Dave を送ったあと、返事が来る前に気が変わって別の名前を打ち始めた）
    const onAddProxy = vi.fn();
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />,
    );
    addProxy("Dave");
    fireEvent.change(proxyInput(), { target: { value: "Erin" } });
    // When（遅れて Dave の名簿が届く）
    rerender(
      <RosterPanel
        {...baseProps}
        participants={[...participants, mk("proxy-1", "Dave", { isPlaceholder: true })]}
        onAddProxy={onAddProxy}
      />,
    );
    // Then（打ちかけの Erin は消えない。#291 が直している「黙って入力が消える」と同じ形）
    expect(proxyInput().value).toBe("Erin");
  });

  it("同時に同じ名前が別の人から入ったときも閉じる（受容した取り違え）", () => {
    // Given（wire は要求の識別子を持たないので、閉じる判断は名前でしかできない）
    const onAddProxy = vi.fn();
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />,
    );
    addProxy("Dave");
    // When（**別の人**が足した Dave が届く。自分の要求は DuplicateName で拒まれている）
    rerender(
      <RosterPanel
        {...baseProps}
        participants={[...participants, mk("someone-elses-proxy", "Dave", { isPlaceholder: true })]}
        onAddProxy={onAddProxy}
      />,
    );
    // Then（閉じる。サーバーは同名を 1 人しか通さないので、画面には利用者が
    //       足したかった名前の人がちょうど 1 人居る＝目的は達している側へ倒れる）
    expect(screen.queryByLabelText("代理参加者の名前")).toBeNull();
  });

  it("Enter でも送れる", () => {
    // Given（閉じずにその場で直させる形にした以上、直した直後の自然な操作は Enter）
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);
    fireEvent.click(screen.getByRole("button", { name: "代理参加者を追加" }));
    fireEvent.change(proxyInput(), { target: { value: "Dave" } });
    // When
    fireEvent.keyDown(proxyInput(), { key: "Enter" });
    // Then
    expect(onAddProxy).toHaveBeenCalledWith("Dave");
  });

  it("Enter で送っても同名なら止まる（押下と同じ関門を通る）", () => {
    // Given
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);
    fireEvent.click(screen.getByRole("button", { name: "代理参加者を追加" }));
    fireEvent.change(proxyInput(), { target: { value: "Bob" } });
    // When
    fireEvent.keyDown(proxyInput(), { key: "Enter" });
    // Then
    expect(onAddProxy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("同じ名前の人がすでに居ます");
  });

  it("2 度目の失敗でも理由のノードを張り替える（同じ文言でも読み上げさせる）", () => {
    // Given（`role="alert"` は同じノード・同じ文言のままだと再告知されない。
    //        2 度目の「追加」が無反応に見えるのは #291 と同じ症状）
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={vi.fn()} />);
    addProxy("Bob");
    const first = screen.getByRole("alert");
    // When（同じ名前のままもう一度押す）
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    // Then（文言は同じだが、ノードは別物になっている）
    const second = screen.getByRole("alert");
    expect(second.textContent).toBe(first.textContent);
    expect(second).not.toBe(first);
  });

  it("理由は名簿の変化に追随する（相手が退出したら「まだ駄目」と言わない）", () => {
    // Given（Bob と同名で拒まれている）
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onAddProxy={vi.fn()} />,
    );
    addProxy("Bob");
    expect(screen.getByRole("alert")).toBeTruthy();
    // When（Bob が退出した名簿が届く）
    rerender(
      <RosterPanel {...baseProps} participants={[mk("p1", "Alice")]} onAddProxy={vi.fn()} />,
    );
    // Then（理由も aria-invalid も消え、打った名前はそのまま残る）
    expect(screen.queryByRole("alert")).toBeNull();
    expect(proxyInput().getAttribute("aria-invalid")).toBeNull();
    expect(proxyInput().value).toBe("Bob");
  });

  it("前後の空白は落として送る", () => {
    // Given（変異検査で分かった穴。`proxyName.trim()` を素の `proxyName` へ戻しても
    //        既存のどのテストも赤くならなかった。判定側は `normalizeDisplayName` が
    //        空白を畳むので気づけず、**送る値だけ**が静かに変わる）
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onAddProxy={onAddProxy} />);
    // When
    addProxy("  Dave  ");
    // Then
    expect(onAddProxy).toHaveBeenCalledWith("Dave");
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

/**
 * 改名も同じ形に揃える（#291 レビュー指摘2）。
 *
 * サーバーは改名も同じ `conflictsWithExisting` で拒む（`DuplicateName`）。
 * ここが送りっぱなしで編集欄を閉じていた間、**同名への改名は #291 とまったく
 * 同じ無言の失敗**だった —— 名前は変わらず、理由も出ず、打った文字も消える。
 */
describe("RosterPanel 改名の同名拒否（#291）", () => {
  const participants = [mk("p1", "Alice"), mk("p2", "Bob")];

  /** Alice の行の改名を開き、名前を入れて「保存」を押す。 */
  function renameAlice(to: string): void {
    fireEvent.click(screen.getByRole("button", { name: "Alice を改名" }));
    fireEvent.change(screen.getByLabelText("Alice の新しい名前"), { target: { value: to } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
  }

  const editInput = () => screen.getByLabelText("Alice の新しい名前") as HTMLInputElement;

  it("同名への改名は送らず、行の中に理由と次の手を出す", () => {
    // Given
    const onRename = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onRename={onRename} />);
    // When（Alice を、もう居る Bob へ改名しようとする）
    renameAlice("Bob");
    // Then
    expect(onRename).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Bob");
    expect(alert.textContent).toContain("変えられませんでした");
    expect(alert.textContent).toContain("同じ名前の人がすでに居ます");
    expect(alert.textContent).toContain("呼び分け");
  });

  it("編集欄は閉じず、打った名前も残る", () => {
    // Given
    render(<RosterPanel {...baseProps} participants={participants} onRename={vi.fn()} />);
    // When
    renameAlice("Bob");
    // Then
    expect(editInput().value).toBe("Bob");
    expect(editInput().getAttribute("aria-invalid")).toBe("true");
    const describedBy = editInput().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toBe(screen.getByRole("alert"));
  });

  it("大文字小文字・正規化の違いも止める（サーバーと同じ述語）", () => {
    // Given
    const onRename = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onRename={onRename} />);
    // When
    renameAlice("Ｂｏｂ");
    // Then
    expect(onRename).not.toHaveBeenCalled();
  });

  it("自分自身とは比べない（現在名のまま保存しても拒まない）", () => {
    // Given（サーバーも `excludeId` に対象を渡して自分を外している）
    const onRename = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onRename={onRename} />);
    // When
    renameAlice("Alice");
    // Then
    expect(onRename).toHaveBeenCalledWith("p1", "Alice");
  });

  it("送ったあとは名前が変わるまで編集欄を閉じない", () => {
    // Given（拒否には画面が予測できないものが残る。閉じると入力ごと消える）
    const onRename = vi.fn();
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onRename={onRename} />,
    );
    // When
    renameAlice("Alicia");
    // Then（送ってはいるが、まだ開いている）
    expect(onRename).toHaveBeenCalledWith("p1", "Alicia");
    expect(editInput().value).toBe("Alicia");
    // When（名前が変わった名簿が届く）
    rerender(
      <RosterPanel
        {...baseProps}
        participants={[mk("p1", "Alicia"), mk("p2", "Bob")]}
        onRename={onRename}
      />,
    );
    // Then（ここで初めて閉じる）
    expect(screen.queryByLabelText("Alicia の新しい名前")).toBeNull();
    expect(screen.getByRole("button", { name: "Alicia を改名" })).toBeTruthy();
  });

  it("返事を待つ間に打ち直していたら、その入力を捨てない（この対策自身の欠陥）", () => {
    // Given（Alicia を送ったあと、返事が来る前に別の名前を打ち始めた）
    const onRename = vi.fn();
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onRename={onRename} />,
    );
    renameAlice("Alicia");
    fireEvent.change(editInput(), { target: { value: "Alicja" } });
    // When（遅れて改名後の名簿が届く）
    rerender(
      <RosterPanel
        {...baseProps}
        participants={[mk("p1", "Alicia"), mk("p2", "Bob")]}
        onRename={onRename}
      />,
    );
    // Then（打ちかけの文字は消えない）
    expect(screen.getByLabelText("Alicia の新しい名前")).toHaveProperty("value", "Alicja");
  });

  it("着いたかどうかは識別子で見る（同名の別人が現れても閉じない）", () => {
    // Given（代理追加と違い、改名は相手を識別子で絞れるので取り違えようがない）
    const onRename = vi.fn();
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onRename={onRename} />,
    );
    renameAlice("Alicia");
    // When（**別人**が Alicia という名前で現れる。Alice は Alice のまま）
    rerender(
      <RosterPanel
        {...baseProps}
        participants={[...participants, mk("p9", "Alicia")]}
        onRename={onRename}
      />,
    );
    // Then（閉じない）
    expect(editInput().value).toBe("Alicia");
  });

  it("Enter でも保存できる", () => {
    // Given
    const onRename = vi.fn();
    render(<RosterPanel {...baseProps} participants={participants} onRename={onRename} />);
    fireEvent.click(screen.getByRole("button", { name: "Alice を改名" }));
    fireEvent.change(editInput(), { target: { value: "Alicia" } });
    // When
    fireEvent.keyDown(editInput(), { key: "Enter" });
    // Then
    expect(onRename).toHaveBeenCalledWith("p1", "Alicia");
  });

  it("2 度目の失敗でも理由のノードを張り替える", () => {
    // Given
    render(<RosterPanel {...baseProps} participants={participants} onRename={vi.fn()} />);
    renameAlice("Bob");
    const first = screen.getByRole("alert");
    // When（2 度目は Enter で送る。「保存」は MiniButton の「送信中」で
    //       押下から 450ms は無効になっており、続けて押しても届かない）
    fireEvent.keyDown(editInput(), { key: "Enter" });
    // Then
    const second = screen.getByRole("alert");
    expect(second.textContent).toBe(first.textContent);
    expect(second).not.toBe(first);
  });

  it("理由は名簿の変化に追随する（相手が退出したら消える）", () => {
    // Given
    const { rerender } = render(
      <RosterPanel {...baseProps} participants={participants} onRename={vi.fn()} />,
    );
    renameAlice("Bob");
    expect(screen.getByRole("alert")).toBeTruthy();
    // When（Bob が退出する）
    rerender(
      <RosterPanel {...baseProps} participants={[mk("p1", "Alice")]} onRename={vi.fn()} />,
    );
    // Then
    expect(screen.queryByRole("alert")).toBeNull();
    expect(editInput().getAttribute("aria-invalid")).toBeNull();
    expect(editInput().value).toBe("Bob");
  });

  it("打ち直すと理由は消える", () => {
    // Given
    render(<RosterPanel {...baseProps} participants={participants} onRename={vi.fn()} />);
    renameAlice("Bob");
    // When
    fireEvent.change(editInput(), { target: { value: "Bob 2" } });
    // Then
    expect(screen.queryByRole("alert")).toBeNull();
    expect(editInput().getAttribute("aria-invalid")).toBeNull();
  });

  it("取消すと理由も待ちも消える（開き直しても残らない）", () => {
    // Given
    render(<RosterPanel {...baseProps} participants={participants} onRename={vi.fn()} />);
    renameAlice("Bob");
    // When
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "Alice を改名" }));
    // Then
    expect(screen.queryByRole("alert")).toBeNull();
    expect(editInput().value).toBe("Alice");
  });
});
