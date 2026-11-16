/**
 * 在席一覧パネル
 * 要件（`docs/plans/tdd-mob-pro-timer-v2-experience/spec.md`）: FR-046,047,048,050,051,052,061 (US9)
 * Task 6: ドライバー/見学セクション分割・現ドライバー最上部・情報階層化
 *
 * 全参加者の在席状況と現ドライバーを常時一覧表示。
 * 代理追加・改名・スキップ/復帰操作を提供する。**行の操作は全員に出す**
 * （#95 S3 で役割とホストを廃止し、管理権限という区別そのものが無くなった）。
 * 色＋テキスト併記（FR-032）。
 * ドライバー（rotation 内）と見学（rotation 外）を別 <ul> で表示し、
 * 現ドライバーをドライバーセクション先頭に固定する。
 */

import { useState, useEffect, useId, useReducer } from "react";
import { Users } from "lucide-react";
import type { Participant, Seat } from "@tasuki/timer-core";
import { participantLabel } from "@tasuki/room-core";
import { SectionHeader } from "../primitives.js";
import { RemovalConfirmDialog } from "./RemovalConfirmDialog.js";
import { labelPool } from "../participant-label.js";
import {
  INITIAL_NAME_REQUEST,
  activeRejection,
  holdsName,
  inputStillMatches,
  nameRequestReducer,
  planNameSubmit,
  someoneHolds,
  type ProxyPending,
  type RenamePending,
} from "../name-request.js";
import { splitRoster } from "../roster-order.js";
import { planRosterRow } from "../roster-row-plan.js";
import { RosterRow, type RosterRowEditing } from "./RosterRow.js";
import { RosterProxyForm } from "./RosterProxyForm.js";
import { ShuffleButton } from "./ShuffleButton.js";

interface RosterPanelProps {
  participants: Participant[];
  /** 現ドライバーの参加者ID（session.rotation[currentIndex]）。
   *  participants 配列のインデックスと rotation のインデックスは一致しないため、
   *  配列位置ではなく識別子で現ドライバーを判定する（D6b。同名でも取り違えない）。 */
  currentDriverId: string;
  myParticipantId: string;
  onRename: (participantId: string, displayName: string) => void;
  onSkip: (participantId: string) => void;
  onResume: (participantId: string) => void;
  onAddProxy: (displayName: string) => void;
  /** 参加者を退出させる（⑪）。誰でも実行できる（Issue #22・FR-065・#95 S3）。
   *  自分自身の退出はここには出さない（SelfDriverToggle が担う・FR-078）。 */
  onRemove?: ((participantId: string) => void) | undefined;
  /** 共有ルームか。確認ダイアログに他参加者への影響を出すかの判断に使う（FR-076）。 */
  isShared?: boolean | undefined;
  /** ドライバーのローテーション順（session.rotation＝参加者IDの配列・D6b）。
   *  並べ替えの index 算出に使う（v2.3 #1）。participants の配列位置と rotation の位置は
   *  一致しないため、rotation 内の位置を別途渡す。 */
  rotation?: string[] | undefined;
  /** ドライバー順の入れ替え（v2.3 #1）。fromIndex→toIndex（rotation 内の位置）。
   *  ドライバー行（rotation に含まれる）にのみ上/下ボタンを出す。 */
  onMove?: ((fromIndex: number, toIndex: number) => void) | undefined;
  /** 自分のローテーション操作（一時離脱/復帰）を外部の自己トグルが担うか。
   *  true（Session）なら自分の行には一時離脱/復帰を出さず重複を避ける。
   *  false/未指定（Solo 等・自己トグル無し）なら自分の行にも出す。 */
  selfHasExternalToggle?: boolean | undefined;
  /** 任意メンバーを現ドライバーに指名する（Issue #13）。
   *  未指定なら指名ボタンを描画しない（ソロ等の非対応コンシューマ向け）。 */
  onAssignDriver?: ((participantId: string) => void) | undefined;
  /** 輪の席（`session.seats`・#276 D2）。呼び名の同名判定プールに使う（敵対的レビュー #276 指摘1）。
   *  未指定なら `participants` のみで判定する（ソロ等 seats を持たないコンシューマ向け）。 */
  seats?: readonly Seat[] | undefined;
  /** ドライバー順をランダムに並べ替える（v2.3 #1）。2 人以上のときだけ出す（`rotation` の長さで `ShuffleButton` が決める）。
   *  見出しの行の「代理追加」の隣に出す（どの一覧に効く操作かが見出しで読める・#553 一覧 #6）。 */
  onShuffle?: (() => void) | undefined;
}

export function RosterPanel({
  participants,
  currentDriverId,
  myParticipantId,
  selfHasExternalToggle = false,
  onRename,
  onSkip,
  onResume,
  onAddProxy,
  onRemove,
  isShared = false,
  rotation,
  onMove,
  onAssignDriver,
  seats,
  onShuffle,
}: RosterPanelProps) {
  // 呼び名の同名判定プール（`participant-label.ts` に1つだけ置く規則の呼び出し口）。
  // `participants` だけだと、輪に席は残るが timer 画面には居ない離席者を取りこぼし、
  // 交代順ストリップ（`rotation-names.ts`）とここで判定結果がずれる（敵対的レビュー #276 指摘1）。
  const pool = labelPool(seats ?? [], participants);

  const [proxyName, setProxyName] = useState("");
  const [showProxyInput, setShowProxyInput] = useState(false);
  // 送った代理の正規形。**名簿に現れるまで持つ**（#291 レビュー指摘1）。
  // サーバーの拒否理由には画面が予測できないものがある（輪が満席・選択画面に
  // 居るだけの人との同名・表示名の規約違反）。送った瞬間に閉じて入力を捨てると、
  // そのときだけ #291 と同じ「押しても何も起きない」が戻る。
  //
  // 送った名前と拒んだ理由は `name-request.ts` の reducer が持つ（代理の追加と改名で同じ形・#370）。
  const [proxy, dispatchProxy] = useReducer(nameRequestReducer<ProxyPending>, INITIAL_NAME_REQUEST);
  // 代理追加を受け付けられなかったことはフォームの中に出すので（#291）、
  // 1 画面に RosterPanel が 2 つ描かれても（Session のセッションタブ／ルームタブ）
  // 結び付け（aria-describedby）が混線しないよう識別子は useId で作る。
  const proxyErrorId = useId();
  // 改名中の参加者 ID と編集中の名前（同時に1人だけ編集できる）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // 改名も代理追加と同じ形にする（#291 レビュー指摘2）。同じファイル・同じ述語・同じ症状。
  const [rename, dispatchRename] = useReducer(nameRequestReducer<RenamePending>, INITIAL_NAME_REQUEST);
  const renameErrorId = useId();

  // **理由は名簿の変化に追随させる**（#291 レビュー指摘3）。持っているのは正規形で、
  // 出すかどうかは毎回いまの `pool` に尋ねる。相手が退出したら「まだ駄目」と言わない。
  const activeProxyRejection = activeRejection(proxy.rejection, pool);
  const activeRenameRejection = editingId !== null ? activeRejection(rename.rejection, pool, editingId) : null;

  // 送った代理が名簿に現れたか。
  //
  // ⚠ **見ているのは名前であって、自分の要求ではない。** wire は要求の識別子を
  // 持たないので、**同じ名前の代理が同時に別の人から入った**ときは、自分の要求が
  // `DuplicateName` で拒まれていてもここは「現れた」と読む。サーバーは同名を
  // 1 人しか通さないので、**画面には利用者が足したかった名前の人がちょうど 1 人居る**
  // 状態になる。取り違えても利用者の目的は達している側へ倒れるので受容する。
  // 着いた送り（着いていなければ null）。
  const arrivedProxy =
    proxy.pending !== null && someoneHolds(pool, proxy.pending.normalized) ? proxy.pending.normalized : null;
  useEffect(() => {
    if (arrivedProxy === null) return;
    dispatchProxy({ type: "arrived" });
    // ⚠ **この対策自身が入力を捨てうる。** 送ったあと返事を待つ間に利用者が別の名前を
    // 打ち始めていると、あとから届いた名簿で閉じた拍子にその入力が消える ——
    // #291 が直そうとしているもの（打った文字が黙って消える）と同じ形である。
    // **いま入力欄に載っているのが送った名前のときだけ**畳む（`inputStillMatches`）。
    if (!inputStillMatches(proxyName, arrivedProxy)) return;
    setProxyName("");
    setShowProxyInput(false);
  }, [arrivedProxy, proxyName]);

  // 送った改名が着いたか。こちらは**相手を識別子で絞れる**ので取り違えようがない。
  const arrivedRename =
    rename.pending !== null && holdsName(pool, rename.pending.participantId, rename.pending.normalized)
      ? rename.pending.normalized
      : null;
  useEffect(() => {
    if (arrivedRename === null) return;
    dispatchRename({ type: "arrived" });
    // 代理追加と同じ理由で、打ち直していたらその入力は捨てない。
    if (!inputStillMatches(editName, arrivedRename)) return;
    setEditingId(null);
    setEditName("");
  }, [arrivedRename, editName]);
  // 退出の確認対象。取り返しがつかない操作なので直接は実行しない（FR-075）。
  //
  // 参加者オブジェクトではなく**識別子だけ**を持ち、表示は毎回最新の participants から引く。
  // オブジェクトを captureしたままだと、確認中に対象が改名しても旧名を出し続け、
  // 対象が退出しても居ないままのダイアログが残る（実機検証で判明）。
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  // 対象が既に居なければ確認するものが無いので出さない（自動的に閉じる）。
  const pendingRemoval = pendingRemovalId
    ? participants.find((p) => p.participantId === pendingRemovalId) ?? null
    : null;

  /**
   * 代理を追加する。**送る前に手元の名簿で同名を見る**（#291）。
   *
   * サーバーは同名の代理追加を `DuplicateName` で拒む（改名も同じ規則）。拒否自体は
   * 画面まで届いていたが、出ていたのは**ページ上端のバナー**で、名簿を下までスクロール
   * した操作地点からは見えなかった（実ブラウザで測ると 1075px 上・4 秒で自動消去）。
   * その上で押した瞬間にフォームが閉じて入力も消えるので、利用者からは
   * 「押しても何も起きない」に見える。**理由は押した場所に出す。**
   *
   * ⚠ **サーバーより厳しくしない。** サーバーの判定プール（`occupants` ＝名簿の
   * 参加者**全員**＋輪の上の代理）は、画面が持つ {@link pool}（`seats` ∪
   * `participants`）より広い。狭い側で通してサーバーに拒まれるのは
   * `DuplicateName` のバナーが拾えるが、**サーバーが通す名前をここで拒むと
   * 利用者は正当な操作をできなくなる**（そちらには保険が無い）。
   *
   * 述語は写さずサーバーと同じ `conflictsWithExisting` を呼ぶ（`name-request.ts` の `someoneHolds`）。
   * 比べる値も揃えて、サーバーが境界で掛ける `normalizeDisplayName` を通してから渡す。
   *
   * **送ったあともフォームは閉じない**（レビュー指摘1）。画面が予測できない拒否
   * （輪が満席・選択画面に居るだけの人との同名・表示名の規約違反）が残っており、
   * そこで閉じると入力ごと消えて #291 の症状がそのまま戻る。閉じるのは
   * **名簿にその代理が現れたとき**（上の `arrivedProxy`）だけにする。
   */
  const handleAddProxy = () => {
    const plan = planNameSubmit(proxyName, pool);
    if (plan.kind === "empty") return;
    if (plan.kind === "reject") {
      dispatchProxy({ type: "rejected", typed: plan.typed, normalized: plan.normalized });
      return;
    }
    // 正規形が空の名前は待たない（reducer が決める。サーバーが規約で弾く）。
    dispatchProxy({ type: "sent", pending: { normalized: plan.normalized } });
    onAddProxy(plan.typed);
  };

  const startRename = (participantId: string, current: string) => {
    setEditingId(participantId);
    setEditName(current);
    dispatchRename({ type: "reset" });
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName("");
    dispatchRename({ type: "reset" });
  };

  /**
   * 改名を送る。**代理追加と同じ形にしてある**（#291 レビュー指摘2）。
   *
   * サーバーは改名も同じ `conflictsWithExisting` で拒む（`DuplicateName`）。
   * ここが送りっぱなしで編集欄を閉じていた間、同名への改名は
   * **#291 とまったく同じ無言の失敗**だった —— 名前は変わらず、理由も出ない。
   */
  const submitRename = (participantId: string) => {
    // 自分自身は比べない（現在名と同じ名前への改名は許す。`planNameSubmit` の `excludeId`）。
    const plan = planNameSubmit(editName, pool, participantId);
    // 空は「やめた」と同じ扱い（#291 より前からの振る舞いを変えない）。
    if (plan.kind === "empty") {
      cancelRename();
      return;
    }
    if (plan.kind === "reject") {
      dispatchRename({ type: "rejected", typed: plan.typed, normalized: plan.normalized });
      return;
    }
    dispatchRename({ type: "sent", pending: { participantId, normalized: plan.normalized } });
    onRename(participantId, plan.typed);
  };

  // ドライバー（輪の中・現ドライバー起点の巡回順）と見学（輪の外・元の順）に分ける（`roster-order.ts`）。
  const { drivers, watchers } = splitRoster(participants, rotation, currentDriverId);

  /** 参加者行の共通レンダリング関数。判断は `planRosterRow`、描画は `RosterRow`。 */
  const renderRow = (p: Participant) => {
    const plan = planRosterRow({
      participant: p,
      currentDriverId,
      myParticipantId,
      rotation,
      selfHasExternalToggle,
      hasMove: !!onMove,
      hasRemove: !!onRemove,
      hasAssignDriver: !!onAssignDriver,
    });
    // 同名が並ぶときだけ識別子を添える（FR-084・規則は `@tasuki/room-core` の participant-label に1つだけ）。
    // 退出だけでなく全ての操作に使う。同名の行は順番バッジ以外の見た目が同じで、
    // 「どちらに効く操作なのか」を名前だけでは選べない。判定対象は pool
    // （seats と participants の和集合）で、この画面に表示中の participants だけではない。
    const label = participantLabel(p.displayName, p.participantId, pool);
    const editing: RosterRowEditing | null =
      editingId === p.participantId
        ? {
            name: editName,
            onChange: (value) => {
              setEditName(value);
              // 打ち直した瞬間に理由を降ろす（直したのに赤いままにしない）。
              dispatchRename({ type: "retyped" });
            },
            onSubmit: () => submitRename(p.participantId),
            onCancel: cancelRename,
            rejection: activeRenameRejection,
            errorId: renameErrorId,
          }
        : null;
    return (
      <RosterRow
        // 現ドライバーになった瞬間だけ key を変えて再マウントし、入場アニメ(animate-pop-in)を
        // 再生させる＝交代で先頭に入れ替わった「感」を出す（reduced-motion では index.css で抑制）。
        key={plan.isCurrentDriver ? `${p.participantId}-current` : p.participantId}
        participant={p}
        label={label}
        plan={plan}
        editing={editing}
        onStartRename={() => startRename(p.participantId, p.displayName)}
        onMove={onMove}
        onRequestRemoval={() => setPendingRemovalId(p.participantId)}
        onSkip={() => onSkip(p.participantId)}
        onResume={() => onResume(p.participantId)}
        onAssignDriver={onAssignDriver ? () => onAssignDriver(p.participantId) : undefined}
      />
    );
  };

  return (
    <div className="ui-stack panel-stack">
      {/* 退出の確認。対象者の名前と、招待から再参加できることを明示する（FR-075）。
          共有ルームでは他の参加者の画面にも反映されることを添える（FR-076）。 */}
      {pendingRemoval && onRemove && (
        <RemovalConfirmDialog
          pendingRemoval={pendingRemoval}
          participants={pool}
          isShared={isShared}
          onConfirm={(id) => {
            onRemove(id);
            setPendingRemovalId(null);
          }}
          onCancel={() => setPendingRemovalId(null)}
        />
      )}
      <SectionHeader
        icon={Users}
        title="参加者"
        beside
        right={
          <div className="roster-panel-head-actions">
            <ShuffleButton onClick={onShuffle} rotationLength={rotation?.length ?? 0} />
            <button
              type="button"
              onClick={() => {
                // 開閉で理由は持ち越さない。閉じて開き直した先に前回の赤が残っていると、
                // いま打っている名前について言っているように読める（#291）。
                // 自分で閉じたなら、届くのを待っていた代理も待たない
                // （待ったままだと、あとで同名が現れた拍子に勝手に開閉する）。
                dispatchProxy({ type: "reset" });
                setShowProxyInput((v) => !v);
              }}
              aria-label="代理参加者を追加"
              className="ui-button ui-button--secondary ui-button--sm"
            >
              代理追加
            </button>
          </div>
        }
      />

      {/* 見出しの下の本体。見出しの行との間は根の gap、本体の中の間（代理追加・ドライバー・見学）は gap（ADR 0035 決定 1・#556） */}
      <div className="ui-stack panel-stack roster-panel-body">
      {/* 代理追加フォーム。受け付けられなかった理由は**この中**に出す（#291）。 */}
      {showProxyInput && (
        <RosterProxyForm
          name={proxyName}
          onChange={(value) => {
            setProxyName(value);
            // 打ち直した瞬間に理由を降ろす。直した名前の横に古い理由が残ると、
            // 利用者は「まだ駄目なのか」と読む。
            dispatchProxy({ type: "retyped" });
          }}
          onSubmit={handleAddProxy}
          rejection={activeProxyRejection}
          errorId={proxyErrorId}
        />
      )}

      {/* ドライバーセクション（rotation 内）: 現ドライバー → rotation 順 */}
      {drivers.length > 0 && (
        <div className="roster-panel-section">
          <p className="roster-panel-heading">ドライバー</p>
          <ul
            aria-label="ドライバー一覧"
            className="roster-panel-list"
          >
            {drivers.map(renderRow)}
          </ul>
        </div>
      )}

      {/* 見学セクション（rotation 外）: 元の相対順 */}
      {watchers.length > 0 && (
        <div className="roster-panel-section">
          <p className="roster-panel-heading">見学</p>
          <ul
            aria-label="見学一覧"
            className="roster-panel-list"
          >
            {watchers.map(renderRow)}
          </ul>
        </div>
      )}
      </div>
    </div>
  );
}
