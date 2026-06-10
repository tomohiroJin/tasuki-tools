/**
 * 運用者向け管理エンドポイント（/status・/admin/rooms）の純粋ロジック（R3-2/R3-3/R4-1）。
 * ルーティング・トークン認証・レポート生成を http から切り離してテスト可能にする。
 * sync は 127.0.0.1 限定バインドのため管理面は元々非公開。ADMIN_TOKEN は多層防御。
 */
import type { Room } from "@tdd-mob/core";

export interface AdminRoomSummary {
  code: string;
  participants: number;
  online: number;
  hasDriver: boolean;
  createdAt: number;
}
export interface AdminReport {
  activeRooms: number;
  totalReclaimed: number;
  rooms: AdminRoomSummary[];
}

/** 現在のルーム一覧と累計回収数から運用レポートを組み立てる（純粋）。 */
export function buildAdminReport(rooms: Room[], reclaimedCount: number): AdminReport {
  return {
    activeRooms: rooms.length,
    totalReclaimed: reclaimedCount,
    rooms: rooms.map((r) => ({
      code: r.code,
      participants: r.participants.length,
      online: r.participants.filter((p) => p.presence === "online").length,
      hasDriver: r.session.rotation.length > 0,
      createdAt: r.createdAt,
    })),
  };
}

export interface AdminHttpDeps {
  adminToken: string | undefined;
  getReport: () => AdminReport;
}
export interface AdminHttpResult {
  status: number;
  contentType: string;
  body: string;
}

/**
 * 管理 HTTP リクエストを処理する（純粋）。管理ルートでなければ null（呼び出し側が 426 等に落とす）。
 * - ADMIN_TOKEN 未設定: 管理ルートでも null（存在を隠す）。
 * - GET 以外: null。
 * - トークン無し/不一致: 401。
 * - /status: 要約のみ。/admin/rooms: rooms 配列を含む。
 */
export function handleAdminHttp(
  method: string | undefined,
  url: string | undefined,
  headers: Record<string, string | string[] | undefined>,
  deps: AdminHttpDeps,
): AdminHttpResult | null {
  const path = (url ?? "").split("?")[0];
  if (path !== "/status" && path !== "/admin/rooms") return null;
  if (!deps.adminToken) return null;
  if (method !== "GET") return null;

  const raw = headers["x-admin-token"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  if (provided !== deps.adminToken) {
    return { status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) };
  }

  const report = deps.getReport();
  const body =
    path === "/status"
      ? { activeRooms: report.activeRooms, totalReclaimed: report.totalReclaimed }
      : report;
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}
