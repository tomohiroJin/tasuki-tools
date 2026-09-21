/**
 * ルームの画面が決まるまでの受け皿（#95 S5c 追補 → #292 で行き止まりを足した）。
 *
 * **旧入口を撤去した副作用を埋める。** `AppMode` から `setup` / `join` が消えたので、
 * 復帰の `room.join` に対する snapshot が届くまで `mode` は `null` のままになり、
 * `App.tsx` は何も描かなかった（`StatusStrip` も `mode === null` では出ない）。
 * 撤去前はここに `Setup` が居た —— 選択画面から timer を開いた人には、
 * その間ずっと白い画面しか見えない（dev で実測して約 300ms、実ブラウザの
 * 初回読み込みではさらに延びる）。
 *
 * ## #292 で足したもの
 *
 * 受け皿を置いただけでは、**繋がっているのにサーバーが答えない場合**が覆えていなかった。
 * WS が切れればバナーが出るが、無応答は「読み込んでいます…」のまま永久に続く。
 * そこで 2 つを足した。
 *
 * - **接続状態を常に出す。** `StatusStrip` は `mode !== null` のときしか描かれないので、
 *   ここが出ている間は接続状態を読む場所がどこにも無かった（#292 EARS 2）。
 *   文言は `StatusStrip` と揃える（`Loading.test.tsx` が両方を描いて突き合わせる）
 * - **行き止まりを出す。** 期限（`sync/use-timer-sync.ts` が測る）が切れたら、
 *   読み込めていないことと**次にできること**を示す（#292 EARS 1 / EARS 3）。
 *   ⚠ **「読み込んでいます…」を残したまま足さない** —— 待ち続けていると誤解させる
 *
 * 待っている間の意匠は既にある「お題を準備中です…」の待ち表示（`Lobby.tsx`）に合わせてある。
 * 凝ったものは要らない —— **いま何も出ていないのではなく待っている**と分かればよい。
 *
 * ⚠ **文言は自己ホスト書体の base 層に収まる字だけで書く**（`packages/ui/README.md`）。
 * 「応答」「玄関」「受」「届」はどれも base 層外で、1 字足すと ext 層（約 210 KB）を
 * 追加取得する（2026-09-22 に `fonts.css` の unicode-range を実測して確かめた）。
 */
import React from "react";
import { CloudOff, RotateCcw, ArrowLeft } from "lucide-react";
import { Card, PrimaryButton, GhostButton } from "./primitives.js";
import type { ConnectionStatus } from "./components/StatusStrip.js";

/**
 * 接続状態の日本語。**`StatusStrip` の `CONNECTION_CONFIG` と同じ言葉を使う。**
 *
 * 同じ状態を別の言葉で呼ぶと、ルームの画面が決まった瞬間（この受け皿から
 * `StatusStrip` へ切り替わる瞬間）に、**利用者には状態が変わったように見える**。
 * 写しを禁じるのではなく、**両方を実際に描いて突き合わせる検査**で縛ってある
 * （`test/ui/Loading.test.tsx`）。英語の添え字を持たないのは、ここは帯ではなく
 * 待ち表示の添え書きだからである。
 *
 * `lost` はこの部品からは出ない（`App.tsx` が先に `SessionLost` へ分岐する）。
 * それでも表に載せるのは、`Record<ConnectionStatus, string>` が**状態の増減を
 * 型検査に拾わせる**からで、抜けを作ると「新しい状態だけ名前が無い」が素通りする。
 */
const CONNECTION_TEXT: Record<ConnectionStatus, string> = {
  online: "接続中",
  reconnecting: "再接続中…",
  lost: "セッション喪失",
  stale: "同期できていません",
};

const CONNECTION_TONE: Record<ConnectionStatus, string> = {
  online: "text-[var(--ok)]",
  reconnecting: "text-[var(--caution)]",
  lost: "text-[var(--urgent)]",
  stale: "text-[var(--caution)]",
};

interface LoadingProps {
  /** いまの接続状態（#292 EARS 2）。ルームの画面が決まる前はここだけが出す。 */
  connectionStatus: ConnectionStatus;
  /**
   * `room.join` の答えを待つ期限が切れたか（#292 EARS 1）。
   *
   * 測るのは同期フックである。**ここで測らない** —— 期限を畳むべき局面
   * （入室できた・退出が成立した・混雑で入り直している）はどれも WS の
   * 出来事で、画面からは見えない。
   */
  timedOut: boolean;
  /** いまの URL を開き直す（#292 EARS 3）。 */
  onReload: () => void;
  /** 玄関へ戻る（#292 EARS 3）。 */
  onLeave: () => void;
}

/** 接続状態の一行。色だけに頼らずテキストを併記する（FR-032）。 */
function ConnectionLine({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${CONNECTION_TONE[status]}`}
      aria-label="接続状態"
    >
      <span aria-hidden="true">●</span>
      <span>{CONNECTION_TEXT[status]}</span>
    </span>
  );
}

export function Loading({ connectionStatus, timedOut, onReload, onLeave }: LoadingProps) {
  if (timedOut) {
    // 待ち表示とは**別の要素**として描く。同じ要素の role を差し替えるだけだと、
    // 読み上げが「新しく現れたもの」として扱わず、気づけないことがある。
    return (
      <div
        className="mx-auto flex max-w-lg flex-col gap-6 py-10"
        role="alert"
        aria-live="assertive"
      >
        <header className="text-center">
          <p className="instrument-label mb-2 text-[var(--caution)]">Timed Out</p>
          <h1 className="brand-title font-black text-[var(--bone)]">
            ルームの情報を読み込めませんでした
          </h1>
        </header>

        <Card>
          <p className="flex items-start gap-3 text-sm text-[var(--bone-muted)]">
            <CloudOff
              className="mt-0.5 w-5 h-5 shrink-0 text-[var(--caution)]"
              aria-hidden="true"
            />
            <span>
              しばらく待ちましたが、ルームの状態を読み込めていません。
              いまの接続の状態は次のとおりです。
            </span>
          </p>

          <p className="mt-3 text-center">
            <ConnectionLine status={connectionStatus} />
          </p>

          <p className="mt-5 text-xs text-[var(--bone-subtle)]">次にできること</p>
          <PrimaryButton onClick={onReload} className="w-full mt-2">
            <span className="flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              この画面を再読み込みする
            </span>
          </PrimaryButton>
          <GhostButton onClick={onLeave} className="w-full mt-3">
            <span className="flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              最初の画面へ戻る
            </span>
          </GhostButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-16 text-center text-[var(--bone-subtle)]" role="status" aria-live="polite">
      {/* 点滅する点は装飾。読み上げは下の文言だけで足りる */}
      <span
        className="inline-block h-4 w-4 animate-pulse rounded-full bg-[var(--signal)] mb-2"
        aria-hidden="true"
      />
      <p>読み込んでいます…</p>
      <p className="mt-2">
        <ConnectionLine status={connectionStatus} />
      </p>
    </div>
  );
}
