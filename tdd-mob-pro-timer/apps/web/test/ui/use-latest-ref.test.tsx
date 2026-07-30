/**
 * useLatestRef（FR-120・Issue #28 T069/T070）。
 *
 * App.tsx は `makeClient` に渡すコールバック（onRoom/onIdentity 等）が生成時の値で
 * 固定されるため、同じ値を state と ref の両方で持つ「並行保持」を複数箇所で行っている
 * （room/roomRef, participantId/participantIdRef, endType/endTypeRef,
 * generatingProblem/generatingRef の4組・実測。spec は5組を見込んでいたが、実際に
 * state と対になっている ref はこの4組のみだった。isCreatorRef 等は state を
 * 持たない純粋なガード用 ref であり対象外）。
 *
 * 並行保持そのものは避けられない（closure が生成時点の値を固定するため）が、
 * 「render のたびに ref.current を最新値へ同期する」処理が state ごとに手書きで
 * 散っているのが問題である。useLatestRef はこの同期処理だけを1箇所に集約する。
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLatestRef } from "../../src/ui/use-latest-ref.js";

describe("useLatestRef", () => {
  it("初回レンダリングで渡した値を ref.current に持つ", () => {
    // Given（初期値 "alice" を渡す）
    // When（フックを初回レンダリングする）
    const { result } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: "alice" },
    });
    expect(result.current.current).toBe("alice");
  });

  it("再レンダリングのたびに ref.current が最新値に同期する", () => {
    // Given（初期値 "alice" でフックをレンダリングしておく）
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: "alice" },
    });
    // When（値を "bob" に変えて再レンダリングする）
    rerender({ value: "bob" });
    expect(result.current.current).toBe("bob");
  });

  it("同じ ref オブジェクトを再レンダリングをまたいで返す（毎回新しい ref を作らない）", () => {
    // Given（初期値 1 でフックをレンダリングし、最初の ref を記録する）
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 1 },
    });
    const first = result.current;
    // When（値を 2 に変えて再レンダリングする）
    rerender({ value: 2 });
    expect(result.current).toBe(first);
    expect(result.current.current).toBe(2);
  });

  it("closure が生成時点の ref を捕捉していても、後の読み出しでは最新値を返す", () => {
    // App.tsx の onRoom 等のコールバックは生成時に ref を capture するが、
    // 呼び出し（read）は常に後の時点で起きるため、read 時点の最新値が見える必要がある。
    // Given（初期値 "v0" でフックをレンダリングし、生成時点の ref を capture する）
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: "v0" },
    });
    const capturedRef = result.current;
    const readLater = () => capturedRef.current;
    // When（値を "v1"→"v2" と2回変えて再レンダリングした後に読み出す）
    rerender({ value: "v1" });
    rerender({ value: "v2" });
    expect(readLater()).toBe("v2");
  });

  it("オブジェクト/null も値としてそのまま保持できる", () => {
    type Room = { code: string } | null;
    // Given（初期値 null でフックをレンダリングする）
    const { result, rerender } = renderHook(({ value }: { value: Room }) => useLatestRef(value), {
      initialProps: { value: null as Room },
    });
    expect(result.current.current).toBeNull();
    // When（オブジェクト値に再レンダリングする）
    const room = { code: "ABCD" };
    rerender({ value: room });
    expect(result.current.current).toBe(room);
  });
});
