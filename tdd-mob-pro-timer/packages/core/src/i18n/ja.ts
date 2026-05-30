/**
 * 日本語メッセージキー（主言語）
 * FR-036
 */

export const ja = {
  // ─── UI 文字列 ────────────────────────────────────────────────────────────
  ui: {
    setup: {
      title: "セッション設定",
      startButton: "セッション開始",
      soloButton: "ソロ練習",
      createRoomButton: "ルームを作成",
      intervalLabel: "交代間隔",
      membersLabel: "メンバー",
      addMemberPlaceholder: "名前を入力",
      addMemberButton: "追加",
      languageLabel: "言語",
      difficultyLabel: "難易度",
    },
    lobby: {
      title: "ロビー",
      roomCodeLabel: "ルームコード",
      copyButton: "コピー",
      copied: "コピーしました",
      qrButton: "QRコードを表示",
      waitingMessage: "メンバーの参加を待っています...",
      startButton: "セッションを開始",
    },
    session: {
      driverLabel: "ドライバー",
      navigatorLabel: "ナビゲーター",
      nextLabel: "次",
      switchButton: "スキップ",
      pauseButton: "一時停止",
      resumeButton: "再開",
      completeButton: "完成！",
      resetButton: "リセット",
      breakButton: "休憩",
      elapsedLabel: "経過時間",
      rotationsLabel: "交代回数",
    },
    celebration: {
      title: "セッション完了！",
      saveButton: "記録を保存",
      exportButton: "書き出し",
      newSessionButton: "新しいセッション",
    },
  },

  // ─── エラー文言 ────────────────────────────────────────────────────────────
  errors: {
    emptyName: "名前を入力してください",
    duplicateName: "この名前はすでに使われています: {{name}}",
    memberLimitExceeded: "メンバーは最大{{limit}}人まです",
    belowMinMembers: "メンバーは最低{{min}}人必要です",
    unauthorized: "この操作には{{requiredRole}}以上の権限が必要です",
    phaseConflict: "この操作は{{requiredPhase}}フェーズでのみ実行できます",
    invalidInterval: "交代間隔は{{allowed}}分のいずれかを選択してください",
    invalidRoomCode: "ルームコードが無効です",
    roomNotFound: "ルームが見つかりません",
    sessionExpired: "セッションが終了しました",
    connectionFailed: "接続に失敗しました",
    aiGenerationFailed: "AI生成に失敗しました（定型お題を使用）",
  },

  // ─── 難易度 ────────────────────────────────────────────────────────────────
  difficulty: {
    easy: "初級",
    medium: "中級",
    hard: "上級",
  },

  // ─── プレゼンス ────────────────────────────────────────────────────────────
  presence: {
    online: "オンライン",
    idle: "離席中",
    offline: "オフライン",
  },

  // ─── お題出所バッジ ────────────────────────────────────────────────────────
  problemSource: {
    ai: "AI生成",
    fallback: "定型",
  },
} as const;

export type JaMessages = typeof ja;
