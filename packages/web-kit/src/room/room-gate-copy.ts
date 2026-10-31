/**
 * 入室の門（読み込み中・ルームが無い・参加中）の文言（#472・#463-C3）。
 *
 * 正本はこの 1 か所。アプリに写しを書かない（agenda・checkin・roulette・topic が同じ文を出す）。
 * 書体の base 層に収まるかは `tests/room-gate-copy-fits-font-base.test.ts` が測る。
 */
export const ROOM_GATE_TEXT = {
  loading: '読み込んでいます…',
  joining: 'ルームに参加しています',
  goneHeading: 'ルームが見つかりません',
  goneText: 'ルームは終了したか、リンクが正しくない可能性があります。',
  goneLink: 'トップへ戻る',
} as const;
