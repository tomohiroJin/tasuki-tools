/**
 * RosterPanel コンポーネントのテスト
 * T056/T057: FR-046,047,048,050,051,052,061 (US9)
 * Task 6: セクション分割（ドライバー/見学）・現ドライバー最上部・情報階層化
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { RosterPanel } from "../../src/ui/components/RosterPanel.js";
import type { Participant } from "@tdd-mob/core";

function makeParticipant(overrides?: Partial<Participant>): Participant {
  return {
    participantId: "p1",
    connId: "conn1",
    displayName: "Alice",
    role: "host",
    presence: "online",
    hasAiKey: false,
    joinedAt: 1000000,
    ...overrides,
  };
}

// モブ順表示テスト用ヘルパ（既存 makeParticipant とシグネチャが異なるため別定義）
const mk = (id: string, name: string, over: Partial<Participant> = {}): Participant => ({
  participantId: id,
  connId: id,
  displayName: name,
  role: "editor",
  presence: "online",
  driverEligible: true,
  isPlaceholder: false,
  hasAiKey: false,
  joinedAt: 1000000,
  ...over,
});

describe("RosterPanel モブ順表示", () => {
  const noop = vi.fn();
  const baseProps = {
    myParticipantId: "x",
    canHostAction: false,
    onRename: noop, onSkip: noop, onResume: noop, onAddProxy: noop,
  };

  it("rotation 順に並べ替える（participants 配列順とは独立）", () => {
    const participants = [mk("b", "Bob"), mk("a", "Alice"), mk("c", "Carol")];
    render(
      <RosterPanel
        {...baseProps}
        participants={participants}
        currentDriverName="Alice"
        rotation={["Alice", "Bob", "Carol"]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Alice")).toBeTruthy();
    expect(within(items[1]!).getByText("Bob")).toBeTruthy();
    expect(within(items[2]!).getByText("Carol")).toBeTruthy();
  });

  it("rotation 内の行に 1 始まりの順番番号を出す", () => {
    render(
      <RosterPanel
        {...baseProps}
        participants={[mk("a", "Alice"), mk("b", "Bob")]}
        currentDriverName="Alice"
        rotation={["Alice", "Bob"]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("1")).toBeTruthy();
    expect(within(items[1]!).getByText("2")).toBeTruthy();
  });

  it("rotation 外（観覧者）は末尾にまとめる", () => {
    const participants = [
      mk("v", "Viewer", { role: "viewer", driverEligible: false }),
      mk("a", "Alice"),
    ];
    render(
      <RosterPanel
        {...baseProps}
        participants={participants}
        currentDriverName="Alice"
        rotation={["Alice"]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Alice")).toBeTruthy();
    expect(within(items[1]!).getByText("Viewer")).toBeTruthy();
  });

  it("現ドライバーは ▶ 今 で示す", () => {
    render(
      <RosterPanel
        {...baseProps}
        participants={[mk("a", "Alice")]}
        currentDriverName="Alice"
        rotation={["Alice"]}
      />,
    );
    expect(screen.getByText("▶ 今")).toBeTruthy();
  });
});

describe("RosterPanel（T056/T057）", () => {
  const noop = vi.fn();
  const baseProps = {
    participants: [
      makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "p2", displayName: "Bob", role: "editor", connId: "conn2" }),
    ],
    currentDriverName: "Alice",
    myParticipantId: "p1",
    canHostAction: true,
    onRename: noop,
    onSkip: noop,
    onResume: noop,
    onAddProxy: noop,
  };

  it("全参加者の名前が表示される（FR-052）", () => {
    render(<RosterPanel {...baseProps} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("rotation 上の現ドライバーが participants 配列と不一致でも正しい人がハイライトされる（バグ修正）", () => {
    // participants[1] が viewer のとき、rotation=["Alice","Carol"] となり
    // currentDriverName="Carol" が指すのは participants[2]。配列インデックス比較だと誤る。
    const participants = [
      makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "p2", displayName: "Bob", role: "viewer", connId: "c2" }),
      makeParticipant({ participantId: "p3", displayName: "Carol", role: "editor", connId: "c3" }),
    ];
    render(<RosterPanel {...baseProps} participants={participants} currentDriverName="Carol" />);
    // Carol の li に「現在」マーカーが付く（Bob には付かない）
    const carolItem = screen.getByText("Carol").closest("li");
    const bobItem = screen.getByText("Bob").closest("li");
    expect(carolItem?.textContent).toMatch(/今/);
    expect(bobItem?.textContent).not.toMatch(/今/);
  });

  it("在席状態がテキストで表示される（色＋テキスト併記: FR-050/032）", () => {
    render(<RosterPanel {...baseProps} />);
    expect(screen.getAllByText(/オンライン|online|Online/i).length).toBeGreaterThan(0);
  });

  it("プレースホルダー参加者に代理バッジが表示される（FR-047）", () => {
    const withProxy = [
      ...baseProps.participants,
      makeParticipant({
        participantId: "proxy-1",
        displayName: "Dave",
        connId: null,
        isPlaceholder: true,
      }),
    ];
    render(<RosterPanel {...baseProps} participants={withProxy} />);
    // 「代理 (Proxy)」バッジが少なくとも1つあること
    expect(screen.getAllByText(/代理/i).length).toBeGreaterThan(0);
  });

  it("観覧者に観覧バッジが表示される（FR-061）", () => {
    const withViewer = [
      ...baseProps.participants,
      makeParticipant({
        participantId: "viewer-1",
        displayName: "Carol",
        role: "viewer",
      }),
    ];
    render(<RosterPanel {...baseProps} participants={withViewer} />);
    expect(screen.getByText(/観覧|Viewer|viewer/i)).toBeTruthy();
  });

  it("代理追加ボタンが表示され、フォームに名前を入力して追加すると onAddProxy が呼ばれる（FR-047）", () => {
    const onAddProxy = vi.fn();
    render(<RosterPanel {...baseProps} onAddProxy={onAddProxy} />);
    // 「代理追加」ボタンを押してフォームを開く（aria-label で検索）
    const addBtn = screen.getByRole("button", { name: /代理参加者を追加|代理追加/i });
    fireEvent.click(addBtn);
    // 名前を入力して追加
    const input = screen.getByPlaceholderText(/Web 非接続|offline/i);
    fireEvent.change(input, { target: { value: "Dave" } });
    const submitBtn = screen.getByRole("button", { name: /^追加$/ });
    fireEvent.click(submitBtn);
    expect(onAddProxy).toHaveBeenCalledWith("Dave");
  });

  it("改名ボタンを押して名前を編集し保存すると onRename が呼ばれる（FR-046/048）", () => {
    const onRename = vi.fn();
    render(<RosterPanel {...baseProps} onRename={onRename} />);
    // 自分（Alice, p1）の行の改名ボタンを押すと、現在名がプリフィルされた入力が現れる
    const aliceItem = screen.getByText("Alice").closest("li") as HTMLElement;
    fireEvent.click(within(aliceItem).getByRole("button", { name: /改名/ }));
    const input = screen.getByDisplayValue("Alice");
    fireEvent.change(input, { target: { value: "Alicia" } });
    const saveBtn = screen.getByRole("button", { name: /^保存$/ });
    fireEvent.click(saveBtn);
    expect(onRename).toHaveBeenCalledWith("p1", "Alicia");
  });

  it("ホストでない観覧者でも自分自身は改名できる（FR-046）", () => {
    const onRename = vi.fn();
    const participants = [
      makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "v9", displayName: "Vic", role: "viewer", connId: "cv" }),
    ];
    // viewer 視点: canHostAction=false, myParticipantId=v9
    render(
      <RosterPanel
        {...baseProps}
        participants={participants}
        canHostAction={false}
        myParticipantId="v9"
        onRename={onRename}
      />,
    );
    const renameBtn = screen.getByRole("button", { name: /改名/ });
    fireEvent.click(renameBtn);
    const input = screen.getByDisplayValue("Vic");
    fireEvent.change(input, { target: { value: "Victor" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(onRename).toHaveBeenCalledWith("v9", "Victor");
  });

  it("一時離脱中の参加者に離脱バッジが表示される（FR-051）", () => {
    const withSkipped = [
      ...baseProps.participants,
      makeParticipant({
        participantId: "p3",
        displayName: "Eve",
        driverEligible: false,
      }),
    ];
    render(<RosterPanel {...baseProps} participants={withSkipped} />);
    // 「離脱中 (skip)」バッジが少なくとも1つあること
    expect(screen.getAllByText(/離脱中/i).length).toBeGreaterThan(0);
  });

  describe("ドライバー並べ替えボタン（v2.3 #1）", () => {
    // rotation=["Alice","Bob"] のとき、ホストは各ドライバー行に上/下ボタンを見られる。
    const moveProps = {
      ...baseProps,
      rotation: ["Alice", "Bob"],
    };

    it("ホストはドライバー行で『前の順番へ』を押すと onMove(from, from-1) が呼ばれる", () => {
      const onMove = vi.fn();
      render(<RosterPanel {...moveProps} onMove={onMove} />);
      // Bob（rotation index 1）を前の順番へ → move(1, 0)
      fireEvent.click(screen.getByRole("button", { name: /Bob を前の順番へ/ }));
      expect(onMove).toHaveBeenCalledWith(1, 0);
    });

    it("ホストはドライバー行で『後の順番へ』を押すと onMove(from, from+1) が呼ばれる", () => {
      const onMove = vi.fn();
      render(<RosterPanel {...moveProps} onMove={onMove} />);
      // Alice（rotation index 0）を後の順番へ → move(0, 1)
      fireEvent.click(screen.getByRole("button", { name: /Alice を後の順番へ/ }));
      expect(onMove).toHaveBeenCalledWith(0, 1);
    });

    it("先頭ドライバーの『前の順番へ』は無効化される", () => {
      const onMove = vi.fn();
      render(<RosterPanel {...moveProps} onMove={onMove} />);
      const upBtn = screen.getByRole("button", { name: /Alice を前の順番へ/ }) as HTMLButtonElement;
      expect(upBtn.disabled).toBe(true);
      fireEvent.click(upBtn);
      expect(onMove).not.toHaveBeenCalled();
    });

    it("末尾ドライバーの『後の順番へ』は無効化される", () => {
      const onMove = vi.fn();
      render(<RosterPanel {...moveProps} onMove={onMove} />);
      const downBtn = screen.getByRole("button", { name: /Bob を後の順番へ/ }) as HTMLButtonElement;
      expect(downBtn.disabled).toBe(true);
      fireEvent.click(downBtn);
      expect(onMove).not.toHaveBeenCalled();
    });

    it("見学者（rotation 外）の行には並べ替えボタンを出さない", () => {
      // Carol は rotation に含まれない見学者。
      const participants = [
        makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
        makeParticipant({ participantId: "p2", displayName: "Bob", role: "editor", connId: "c2" }),
        makeParticipant({ participantId: "p3", displayName: "Carol", role: "viewer", connId: "c3" }),
      ];
      render(
        <RosterPanel {...baseProps} participants={participants} rotation={["Alice", "Bob"]} onMove={vi.fn()} />,
      );
      expect(screen.queryByRole("button", { name: /Carol を前の順番へ/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Carol を後の順番へ/ })).toBeNull();
    });

    it("canHostAction=false のときは並べ替えボタンを出さない", () => {
      render(
        <RosterPanel
          {...moveProps}
          canHostAction={false}
          myParticipantId="p2"
          onMove={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: /前の順番へ/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /後の順番へ/ })).toBeNull();
    });

    it("ドライバーが1人だけのときは並べ替えボタンを出さない", () => {
      render(<RosterPanel {...baseProps} rotation={["Alice"]} onMove={vi.fn()} />);
      expect(screen.queryByRole("button", { name: /前の順番へ/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /後の順番へ/ })).toBeNull();
    });
  });

  describe("RosterPanel scrollable", () => {
    it("scrollable=true でリストに高さ上限とスクロールを付ける", () => {
      render(
        <RosterPanel
          {...baseProps}
          participants={[mk("a", "Alice")]}
          currentDriverName="Alice"
          rotation={["Alice"]}
          scrollable
        />,
      );
      const list = screen.getByRole("list");
      expect(list.className).toContain("overflow-y-auto");
      expect(list.className).toContain("max-h-[20rem]");
    });

    it("scrollable 未指定ならスクロールを付けない", () => {
      render(
        <RosterPanel
          {...baseProps}
          participants={[mk("a", "Alice")]}
          currentDriverName="Alice"
          rotation={["Alice"]}
        />,
      );
      expect(screen.getByRole("list").className).not.toContain("overflow-y-auto");
    });
  });

  describe("ホスト移譲ボタン（v2.2 R2-3）", () => {
    it("ホストはオンラインの他参加者に『ホストを譲る』を見られ、押すと onTransferHost が呼ばれる", () => {
      const onTransferHost = vi.fn();
      // baseProps: Alice=host(p1, online), Bob=editor(p2, online), 自分=p1(host)
      render(<RosterPanel {...baseProps} onTransferHost={onTransferHost} />);
      const transferBtn = screen.getByRole("button", { name: /ホストを譲る/ });
      fireEvent.click(transferBtn);
      expect(onTransferHost).toHaveBeenCalledWith("p2");
    });

    it("オフラインの参加者には『ホストを譲る』を出さない", () => {
      const participants = [
        makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
        makeParticipant({
          participantId: "p2",
          displayName: "Bob",
          role: "editor",
          connId: "conn2",
          presence: "offline",
        }),
      ];
      render(
        <RosterPanel {...baseProps} participants={participants} onTransferHost={vi.fn()} />,
      );
      expect(screen.queryByRole("button", { name: /ホストを譲る/ })).toBeNull();
    });

    it("canHostAction=false のときは『ホストを譲る』を出さない", () => {
      render(
        <RosterPanel
          {...baseProps}
          canHostAction={false}
          myParticipantId="p2"
          onTransferHost={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: /ホストを譲る/ })).toBeNull();
    });

    it("自分自身の行には『ホストを譲る』を出さない", () => {
      // ホストの自分（p1）のみがオンライン参加者で他にオンライン参加者がいない場合
      const participants = [
        makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
      ];
      render(
        <RosterPanel
          {...baseProps}
          participants={participants}
          currentDriverName="Alice"
          onTransferHost={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: /ホストを譲る/ })).toBeNull();
    });

    it("現ホストの行には『ホストを譲る』を出さない（他にもう一人ホストがいる異常系の保険）", () => {
      // 通常ホストは1人だが、現ホスト行に出ない条件 p.role !== "host" を担保する
      const participants = [
        makeParticipant({ participantId: "p1", displayName: "Alice", role: "host" }),
        makeParticipant({
          participantId: "p2",
          displayName: "Bob",
          role: "host",
          connId: "conn2",
        }),
      ];
      render(
        <RosterPanel {...baseProps} participants={participants} onTransferHost={vi.fn()} />,
      );
      expect(screen.queryByRole("button", { name: /ホストを譲る/ })).toBeNull();
    });
  });
});

// ─── Task 6: セクション分割テスト ────────────────────────────────────────────

/** Task 6 用ヘルパ: role を受け取る mk */
const mkRolled = (id: string, name: string, role: "host" | "editor" | "viewer"): Participant =>
  ({ participantId: id, displayName: name, role, presence: "online" } as Participant);

const sectionBase = {
  participants: [
    mkRolled("h", "Alice", "host"),
    mkRolled("b", "Bob", "editor"),
    mkRolled("v", "Zoe", "viewer"),
  ],
  rotation: ["Alice", "Bob"],
  currentDriverName: "Bob",
  myParticipantId: "h",
  canHostAction: true,
  onRename: vi.fn(), onSkip: vi.fn(), onResume: vi.fn(), onAddProxy: vi.fn(),
};

describe("RosterPanel セクション分割", () => {
  it("ドライバーと見学のセクション見出しを出す", () => {
    render(<RosterPanel {...sectionBase} />);
    expect(screen.getByText("ドライバー")).toBeTruthy();
    expect(screen.getByText("見学")).toBeTruthy();
  });

  it("現ドライバー(Bob)がドライバーセクションの先頭に来る", () => {
    render(<RosterPanel {...sectionBase} />);
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const items = within(driverList).getAllByRole("listitem");
    expect(within(items[0]!).getByText("Bob")).toBeTruthy();
  });

  it("見学者(Zoe)は見学セクションに入る", () => {
    render(<RosterPanel {...sectionBase} />);
    const watchList = screen.getByRole("list", { name: "見学一覧" });
    expect(within(watchList).getByText("Zoe")).toBeTruthy();
  });

  it("ドライバーは現ドライバー起点の巡回順で並ぶ（現→次→…環状）", () => {
    // 巡回順テスト: rotation=[A,B,C,D,E], currentDriver=D → 表示順は D,E,A,B,C
    const names = ["A", "B", "C", "D", "E"];
    const participants = names.map((n, i) => ({
      participantId: `p${i}`,
      connId: `conn${i}`,
      displayName: n,
      role: "editor" as const,
      presence: "online" as const,
      driverEligible: true,
      isPlaceholder: false,
      hasAiKey: false,
      joinedAt: 1000000,
    }));
    render(
      <RosterPanel
        participants={participants}
        currentDriverName="D"
        myParticipantId="p0"
        canHostAction={false}
        rotation={names}
        onRename={vi.fn()}
        onSkip={vi.fn()}
        onResume={vi.fn()}
        onAddProxy={vi.fn()}
      />,
    );
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const order = within(driverList)
      .getAllByRole("listitem")
      .map((li) => (li.textContent!.match(/[A-E]/) ?? [""])[0]);
    expect(order).toEqual(["D", "E", "A", "B", "C"]);
  });
});
