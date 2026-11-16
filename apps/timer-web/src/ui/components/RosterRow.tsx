/**
 * 名簿の 1 行（#595 で `RosterPanel.tsx` から出した。DOM・クラス名・aria・文言は変えない）。
 *
 * どの操作を出すかは `roster-row-plan.ts`（純粋関数）が決め、ここは描くだけ。
 * 改名の状態（編集中の ID・入力・理由）は 1 人だけが編集できる性質のため、呼び出し側が持つ。
 * 全アクション（改名/離脱/復帰/譲る/外す/並べ替え）を維持する。
 */

import { ChevronUp, ChevronDown, X } from "lucide-react";
import type { Participant } from "@tasuki/timer-core";
import { MAX_DISPLAY_NAME } from "@tasuki/room-core";
import { presenceLabel } from "../presence.js";
import { PresenceDot } from "./PresenceDot.js";
import { MiniButton } from "./MiniButton.js";
import type { Rejection } from "../name-request.js";
import type { RosterRowPlan } from "../roster-row-plan.js";
import { submitOnEnter } from "./submit-on-enter.js";

/** 改名中の行が受け取るもの（改名中でない行には渡さない） */
export interface RosterRowEditing {
  name: string;
  /** 打ち直した瞬間に理由を降ろすのは呼び出し側が担う */
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** いまの名簿に照らして有効な拒否の理由（無ければ null） */
  rejection: Rejection | null;
  errorId: string;
}

interface RosterRowProps {
  participant: Participant;
  /** 同名が並ぶときだけ識別子を添えた呼び名（FR-084）。全ての操作の aria-label に使う */
  label: string;
  plan: RosterRowPlan;
  /** 改名中ならその状態。そうでなければ null */
  editing: RosterRowEditing | null;
  onStartRename: () => void;
  onMove?: ((fromIndex: number, toIndex: number) => void) | undefined;
  /** 退出の確認を開く（実行は確認ダイアログのあと）。 */
  onRequestRemoval: () => void;
  onSkip: () => void;
  onResume: () => void;
  onAssignDriver?: (() => void) | undefined;
}

export function RosterRow({
  participant: p,
  label,
  plan,
  editing,
  onStartRename,
  onMove,
  onRequestRemoval,
  onSkip,
  onResume,
  onAssignDriver,
}: RosterRowProps) {
  const { isCurrentDriver, isSkipping, rotationIndex, inRotation, rotationLen } = plan;
  return (
    <li
      className={
        isCurrentDriver
          ? "roster-panel-row roster-panel-row-current animate-pop-in"
          : "roster-panel-row"
      }
    >
      {editing ? (
        /* 改名中は入力＋保存/キャンセルで行を専有する。
           受け付けられなかった理由も**この行の中**に出す（#291 レビュー指摘2）。 */
        <div className="roster-panel-edit">
          <div className="roster-panel-edit-row">
            <input
              type="text"
              value={editing.name}
              onChange={(e) => editing.onChange(e.target.value)}
              onKeyDown={submitOnEnter(editing.onSubmit)}
              aria-label={`${label} の新しい名前`}
              maxLength={MAX_DISPLAY_NAME}
              aria-invalid={editing.rejection !== null ? true : undefined}
              aria-describedby={editing.rejection !== null ? editing.errorId : undefined}
              className="ui-input roster-panel-edit-input"
            />
            <MiniButton onClick={editing.onSubmit}>保存</MiniButton>
            <MiniButton onClick={editing.onCancel}>取消</MiniButton>
          </div>
          {editing.rejection !== null && (
            <p
              // `key` を失敗のたびに進めてノードごと張り替える。同じ文言のままだと
              // 2 度目以降が読み上げられない（#291 レビュー指摘5）。
              key={editing.rejection.attempt}
              id={editing.errorId}
              role="alert"
              className="roster-panel-error"
            >
              {`「${editing.rejection.typed}」へは変えられませんでした。同じ名前の人がすでに居ます。` +
                `所属やイニシャルなどを添えて、呼び分けの付く名前にすると変えられます。`}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* 1段目: 順番＋在席ドット＋名前＋「▶ 今」。
              名前は text-base font-medium で目立たせる。
              メタ情報（順番番号）は控えめな色で表示。
              在席「オンライン」テキストチップは廃止しドット＋ui-visually-hidden のみに（FR-032 色併記は
              ドットで維持し、スクリーンリーダーには ui-visually-hidden テキストで伝える）。
              かつてはここに「主催者」「観覧」の役割バッジも並べていた（#95 S3 で廃止）。 */}
          <div className="roster-panel-meta">
            {inRotation && (
              <span
                className="roster-panel-order tabular"
                aria-label={`順番 ${rotationIndex + 1}`}
              >
                {rotationIndex + 1}
              </span>
            )}
            <PresenceDot presence={p.presence} />
            {/* 在席状態をスクリーンリーダーへ（可視チップは廃止） */}
            <span className="ui-visually-hidden">{presenceLabel(p.presence)}</span>
            {/* 名前: text-base font-medium で情報階層の最上位に。
                同名が並ぶときは識別子を添える（目で見ても行を区別できるように）。 */}
            <span className="roster-panel-name" title={label}>
              {label}
            </span>
            {p.isPlaceholder && (
              <span className="roster-panel-chip roster-panel-chip-proxy">代理</span>
            )}
            {isSkipping && (
              <span className="roster-panel-chip roster-panel-chip-skipping">離脱中</span>
            )}
            {isCurrentDriver && (
              // 「▶ 今」だけでは読み上げても意味が伝わらないので名前を与える。
              // role="img" にして中身を名前で置き換えるのは、投票済みの席札
              // （poker の ParticipantList）と同じ扱い方に揃えたもの。
              <span
                role="img"
                aria-label="現在のドライバー"
                className="roster-panel-chip roster-panel-chip-current"
              >
                ▶ 今
              </span>
            )}
            {/* アイコンだけの操作（並べ替え・退出）は名前の行の右端へ置く。文字の操作と同じ段に
                並べると 22rem の脇の列で 3 段に折れ、1 行が縦に長くなる（#316 PR 3・B2）。 */}
            {plan.showIconActions && (
              <span className="roster-panel-icon-actions">
                {/* ドライバー順を入れ替えられる（v2.3 #1）。
                    ドライバー行（rotation に含まれる）にのみ上/下を出す。先頭/末尾は無効化。 */}
                {plan.canMove && (
                  <>
                    <MiniButton
                      onClick={() => onMove!(rotationIndex, rotationIndex - 1)}
                      disabled={plan.moveUpDisabled}
                      aria-label={`${label} を前の順番へ`}
                      title="前の順番へ"
                    >
                      <ChevronUp className="roster-panel-icon" aria-hidden="true" />
                    </MiniButton>
                    <MiniButton
                      onClick={() => onMove!(rotationIndex, rotationIndex + 1)}
                      disabled={plan.moveDownDisabled}
                      aria-label={`${label} を後の順番へ`}
                      title="後の順番へ"
                    >
                      <ChevronDown className="roster-panel-icon" aria-hidden="true" />
                    </MiniButton>
                  </>
                )}
                {/* 他の参加者を退出させる（⑪）。誰でも実行できる（#95 S3）。
                    自分の行には出さない（自己退出は SelfDriverToggle 側・FR-078）。
                    取り返しがつかない操作なので確認を挟む（FR-075）。
                    同名が並ぶときはラベルに識別子を添える。二重参加の幽霊は本人と同名なので、
                    名前だけだと「どちらを消すのか」を選ぶ時点で区別できない（FR-084）。 */}
                {plan.canRemove && (
                  <MiniButton
                    onClick={onRequestRemoval}
                    aria-label={`${label} を退出させる`}
                    title="退出させる"
                  >
                    <X className="roster-panel-icon" aria-hidden="true" />
                  </MiniButton>
                )}
              </span>
            )}
          </div>

          {/* 2段目: 操作。バッジと分離し行幅いっぱいで右寄せ＋折返し（flex-wrap）にして、
              操作が増えても枠からはみ出さないようにする。「外す」はアイコン化して幅を圧縮
              （Lobby と同じ X）。**操作は全員の行に出す**（#95 S3）。
              一時離脱/復帰は driver.skip で、自分の分は外部の自己トグルがあるなら出さず重複を避ける（#1）。 */}
          <div className="roster-panel-actions">
            <MiniButton onClick={onStartRename} aria-label={`${label} を改名`}>
              改名
            </MiniButton>
            {/* 一時離脱/復帰の表示可否: 輪に席がある行だけ（#95 S4a）。自分は外部トグルが
                無いときのみ（他人は常に出す）。
                **見学（rotation 外）の行には出さない。** 一時離脱は「輪の上の席の属性」
                （`RotationEntry.eligible`）になったので、席の無い人には効かない。
                「ドライバーにする」「並べ替え」と同じ扱いに揃えてある。 */}
            {plan.skipToggle === "resume" && (
              <MiniButton onClick={onResume} aria-label={`${label} を復帰させる`}>
                復帰
              </MiniButton>
            )}
            {plan.skipToggle === "skip" && (
              <MiniButton onClick={onSkip} aria-label={`${label} を一時離脱させる`}>
                一時離脱
              </MiniButton>
            )}
            {/* 現ドライバー以外の rotation メンバーを即ドライバーに指名できる（Issue #13）。
                実在（非代理）オフラインの相手は無人ドライバーになるため指名不可。
                代理(placeholder)は Web 非接続が常態で対面在席するため offline でも指名可能。 */}
            {plan.canAssign && (
              <MiniButton
                onClick={onAssignDriver}
                aria-label={`${label} をドライバーにする`}
                title="ドライバーにする"
              >
                ドライバーにする
              </MiniButton>
            )}
          </div>
        </>
      )}
    </li>
  );
}
