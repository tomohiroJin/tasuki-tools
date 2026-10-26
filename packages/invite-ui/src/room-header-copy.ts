/**
 * ルーム画面の共通の見出しの文言（#447 段 1・設計 §3）。
 *
 * 正本はこの 1 か所。アプリに写しを書かない。どの文言も、既に玄関や招待の画面に出ていた言い回しを使う
 * （新しい字を増やさない。書体の base 層に収まるかは `tests/room-header-copy-fits-font-base.test.ts` が測る）。
 */
export const ROOM_HEADER_TEXT = {
  back: '選択画面へ戻る',
  inviteToggle: '仲間を招く',
  roomLabel: 'ルーム',
  copy: '招待リンクをコピー',
  copied: 'コピーしました',
  copyFailed: 'コピーできません（URL を選択してください）',
  qrShow: 'QR コードを表示',
  qrHide: 'QR コードを閉じる',
  qrAlt: '参加用 URL の QR コード',
  qrPreparing: 'QR コードを準備しています…',
  qrFailed: 'QR コードを表示できません。URL を選んでコピーしてください。',
} as const;
