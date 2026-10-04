/**
 * 永続ステータスストリップ
 * T040: FR-035,036,042,032 (US8)
 *
 * 全フェーズに共通して固定表示。フェーズ・自分の名前・接続状態・出題モードを
 * 色＋テキスト併記（FR-032）で常時提示する。
 * かつては名前の隣に役割（ホスト/編集者/観覧）も出していた（#95 S3 で廃止）。
 */

import React from "react";
import { NotifySettings } from "./NotifySettings.js";
import type { AppMode } from "../../sync/use-timer-sync.js";

export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "lost" | "stale";

interface StatusStripProps {
  /**
   * いま出ている画面（#95 S5c・M-6）。
   *
   * **`RoomPhase` ではない。** 撤去前は `RoomPhase | "lobby"` を受けており、
   * `PHASE_LABEL` に `setup` / `ready` の行があったが、**渡る値は `AppMode` だけ**で
   * その 2 行は誰にも引かれていなかった（`screenForPhase` が `setup`/`ready` を
   * `lobby` へ畳んでから渡る）。型を実際に渡る値へ絞って、嘘を 1 つ減らす。
   */
  phase: AppMode;
  displayName: string;
  connectionStatus: ConnectionStatus;
  roomCode?: string | undefined;
}

/** 画面の日本語名。**キーは `AppMode` と 1 対 1**（漏れは型検査が拾う）。 */
const PHASE_LABEL: Record<AppMode, string> = {
  lobby: "ロビー",
  session: "セッション中",
  celebration: "完了",
};

// 接続状態の色（ダークステージ上で視認できる明るめの値・色＋テキスト併記）。
//
// `stale` は「接続は生きているのに、契約に合わない同期フレームを捨てていて
// 画面が古いままになっている」状態（#209）。**再読込を促す文言は置かない** ——
// 継続する棄却の原因はサーバー側のルームに残った値なので、再読込しても直らず
// 嘘の導線になる。ここは「起きていること」だけを述べる。
//
// **文言は自己ホスト書体の base 層に収まる字だけで書く。** base 層はアプリの表示文字から
// 抽出したもので、外れる字を 1 つ足すと ext 層（約 210 KB）を追加取得する
// （`packages/ui/README.md`）。「同期不整合」の「整」がまさに base 層外だったため
// 「同期できていません」にした（2026-08-31・`fonts.css` の unicode-range を実測）。
const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  // `connecting` は「まだ一度も確立していない」（#292）。**この帯には実際には出ない** ——
  // 帯が描かれるのは `mode !== null`、つまり snapshot を受け取った後だからである。
  // それでも行を持つのは `Record<ConnectionStatus, …>` が**状態の増減を型検査に
  // 拾わせる**ためで、抜けを作ると「名前の無い状態」が黙って通る。
  // 文言は `ui/Loading.tsx` と揃える（`test/ui/Loading.test.tsx` が突き合わせる）。
  connecting: "つないでいます… (Connecting)",
  online: "接続中 (Connected)",
  reconnecting: "再接続中… (Reconnecting)",
  lost: "セッション喪失 (Session Lost)",
  stale: "同期できていません (Out of Sync)",
};

/**
 * 接続状態の表示のクラス（`styles/status-strip.css`。並びと色）。ラベルの表とは分ける。
 * キーは `ConnectionStatus` と 1 対 1（漏れは型検査が拾う）。
 */
const CONNECTION_CLASS = {
  connecting: "status-strip-connection status-strip-connection-caution",
  online: "status-strip-connection status-strip-connection-ok",
  reconnecting: "status-strip-connection status-strip-connection-caution",
  lost: "status-strip-connection status-strip-connection-urgent",
  stale: "status-strip-connection status-strip-connection-caution",
} as const satisfies Record<ConnectionStatus, string>;

export function StatusStrip({
  phase,
  displayName,
  connectionStatus,
  roomCode,
}: StatusStripProps) {
  const connectionLabel = CONNECTION_LABEL[connectionStatus];

  return (
    <div
      role="status"
      aria-label="ステータス情報"
      className="status-strip"
    >
      {/* フェーズ + ルームコード */}
      <span className="status-strip-group">
        <span aria-label="フェーズ">{PHASE_LABEL[phase]}</span>
        {roomCode && (
          <span className="tabular status-strip-room-code">({roomCode})</span>
        )}
      </span>

      {/* 選択画面へ戻る導線。旧入口（Setup/Join）が撤去され、他に戻る手段が無い
          （利用者の申し送り・2026-09-14）。行き先は**同じルームの選択画面**
          （玄関まで戻すとルームから出たことになる）。別アプリ（玄関）への遷移
          なので SPA 内遷移ではなく素直な <a href> にする。 */}
      {roomCode !== undefined && (
        <a
          className="status-strip-back-link"
          href={`/?room=${encodeURIComponent(roomCode)}`}
        >
          選択画面へ戻る
        </a>
      )}

      {/* 自分の名前 */}
      <span className="status-strip-group">
        <span className="status-strip-name">{displayName}</span>
      </span>

      {/* 接続状態（色＋テキスト併記） */}
      <span className={CONNECTION_CLASS[connectionStatus]} aria-label="接続状態">
        <span aria-hidden="true">●</span>
        <span>{connectionLabel}</span>
      </span>

      {/* 個人通知設定（音/OS通知）。ルーム設定 assertiveSwitch とは独立。 */}
      <NotifySettings />
    </div>
  );
}
