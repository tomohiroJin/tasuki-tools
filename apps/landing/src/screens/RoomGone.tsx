/**
 * ルームが見つからないことを知らせる画面（#274・#76 J-1 の性質の戻し先）。
 *
 * **名乗らせない。** これが無いと、終了したルームのリンクでも参加フォームが出て、
 * 名前を入れて送信して初めて「見つかりません」に変わる。
 *
 * **理由を断定しない。** 玄関は入れない理由を知らない —— 終了したのか、最初から
 * 無いコードなのか（打ち間違い・壊れた転送）、同期サーバーが再起動したのか
 * （本番は揮発インメモリ）を言い分けられない。文言は既存の 3 つ
 * （`ROOM_NOT_FOUND_MESSAGE` / poker / timer）と揃えて「見つかりません」にしてある。
 *
 * **画面は表示に徹する**（`docs/adr/0015` MUST 3・`docs/adr/0019`）。
 * どちらへ落ちるかを決めるのは `hub/hub-state.ts` の `screenFor` である。
 */
import { HistoryLink } from './HistoryLink.js';

export interface RoomGoneProps {
  /** 見つからなかったルームコード。**落とさない** —— どのリンクが死んでいるかを示す。 */
  readonly code: string;
}

export function RoomGone({ code }: RoomGoneProps) {
  return (
    <main className="page landing">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <p className="tagline">
          <span className="hub-room-code">{code}</span>
        </p>
      </header>

      {/* ⚠ **見出しに `role` を付けない。** ARIA の `role` は暗黙の役割を**上書きする**ので、
          `<h2 role="status">` にすると**その要素は見出しでなくなる**（`getByRole('heading')`
          が見つけられず、支援技術の見出し一覧からも消える）。
          知らせは下の段落が持つ（`Resuming.tsx` と同じ形）。 */}
      <h2 className="hub-section-title">ルームが見つかりません</h2>

      {/* `role="alert"` にしない —— 画面そのものが替わっており、これは
          「いま起きたこと」の割り込みではなく、この画面の主題である。 */}
      <p className="hub-notice" role="status">
        終了したか、URL が正しくない可能性があります。
      </p>

      {/* **戻る道。** これが無いと行き止まりになる。
          `hub-submit` は `<button>` 専用（下線が消えず、影も要素セレクタ `button` にしか
          掛からない）。**ハブでリンクを飾るのは `hub-secondary` である**（`HistoryLink` と同じ）。
          poker の同じ画面も、戻る道は素のリンクにしてある。 */}
      <a className="hub-secondary" href="/">
        新しいルームを作る
      </a>

      {/* ルームに入っていなくても端末の記録は見られる（旧入口の性質を保つ）。 */}
      <HistoryLink roomCode={null} />
    </main>
  );
}
