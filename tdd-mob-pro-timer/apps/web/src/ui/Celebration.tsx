/**
 * @deprecated 未使用。v2 で Summary.tsx（完成/中断 出し分け）に置き換え、App からは参照していない。
 * 記録の閲覧/書き出し（loadRecords/exportRecords 等）を本画面が抱えていたが、v2 では完成記録は
 * App が自動保存（records/persist）するのみで、閲覧 UI は将来枠（スコープ外）。テスト維持のため残置。
 *
 * 完成画面
 * T058: FR-001, FR-028 ＋ デザインシステム適用
 */

import React from "react";
import type { Room, CompletionRecord } from "@tdd-mob/core";
import { exportRecords } from "../records/io.js";
import { Button } from "./components/Button.js";

interface CelebrationProps {
  room: Room;
  record: CompletionRecord;
  onNewSession: () => void;
}

export function Celebration({ room, record, onNewSession }: CelebrationProps) {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${String(s).padStart(2, "0")}秒`;
  };

  const handleExport = () => {
    const json = exportRecords([record]);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tdd-mob-record-${new Date(record.completedAt).toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-md border border-line bg-surface p-3">
      <p className="text-sm text-fg-subtle">{label}</p>
      <p className="text-xl font-bold text-fg">{value}</p>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6 text-center">
      <div className="text-6xl" aria-hidden="true">🎉</div>
      <h2 className="text-xl font-bold text-fg">セッション完了！</h2>

      {room.problem && (
        <div className="w-full rounded-md border border-line bg-surface-2 p-4">
          <p className="font-semibold text-fg">{room.problem.title}</p>
        </div>
      )}

      {/* Bento グリッドで実績を整理 */}
      <div className="grid w-full grid-cols-2 gap-3">
        <Stat label="所要時間" value={formatTime(record.elapsedSeconds)} />
        <Stat label="交代回数" value={`${record.totalSwitches}回`} />
        <Stat label="言語" value={record.language} />
        <Stat label="難易度" value={record.difficulty} />
      </div>

      <div className="w-full">
        <p className="mb-1 text-sm text-fg-subtle">参加者</p>
        <p className="text-fg">{record.members.join(", ")}</p>
      </div>

      <div className="flex w-full gap-3">
        <Button intent="neutral" className="flex-1" onClick={handleExport}>
          記録を書き出し
        </Button>
        <Button intent="primary" className="flex-1" onClick={onNewSession}>
          新しいセッション
        </Button>
      </div>
    </div>
  );
}
