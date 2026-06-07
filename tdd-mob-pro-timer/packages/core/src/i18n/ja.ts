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
      completeButton: "完成",
      abortButton: "途中で終える",
      resetButton: "リセット",
      breakButton: "休憩",
      elapsedLabel: "経過時間",
      rotationsLabel: "交代回数",
    },
    // セッション終了系（v2: 3種を明確に区別）
    endSession: {
      zoneLabel: "セッションを終える",
      completeLabel: "完成",
      completeDescription: "お題をやり切りました。達成として記録します。",
      abortLabel: "途中で終える（記録なし）",
      abortDescription: "途中でやめます。記録は残りません。",
      resetLabel: "リセット",
      resetDescription: "タイマーと交代回数を初期状態に戻します。",
      confirmAbort: "途中で終えますか？ 記録は残りません。",
      confirmReset: "リセットしますか？ タイマーと交代回数が初期状態に戻ります。",
    },
    celebration: {
      title: "セッション完了！",
      abortTitle: "セッションを終了しました",
      saveButton: "記録を保存",
      exportButton: "書き出し",
      newSessionButton: "新しいセッション",
      nextActions: "次の操作",
    },
    // AI 設定・出題モード（v2）
    aiSettings: {
      modalTitle: "AI 設定",
      apiKeyLabel: "Anthropic API キー",
      apiKeyPlaceholder: "sk-ant-...",
      apiKeySaveLocal: "この端末に保存（XSS等で漏えいするリスクがあります）",
      modeLabel: "出題モード",
      modeAi: "AI 生成",
      modeFallback: "定型（AI を使わない）",
      statusAiReady: "AI 利用可能",
      statusAiOff: "定型モード（AI 無効）",
      statusAiNotConfigured: "API キー未設定",
      generatingLabel: "お題を生成中…",
      settingsLink: "AI 設定を開く",
    },
    // お題エディタ（v2）
    problemEditor: {
      editButton: "お題を編集",
      pasteButton: "お題を持ち込む",
      regenerateButton: "やり直す",
      copyButton: "コピー",
      languageLabel: "言語を変えて出し直す",
      difficultyLabel: "難易度を変えて出し直す",
      titleLabel: "タイトル",
      descriptionLabel: "説明",
      requirementsLabel: "要件",
      exampleTestLabel: "例示テスト",
      hintsLabel: "ヒント",
      sourceAi: "AI 生成",
      sourceFallback: "定型",
      sourceCustom: "持ち込み",
      edited: "編集済み",
    },
    // 在席・ロスター（v2）
    roster: {
      title: "参加者",
      addProxyButton: "代理で追加",
      addProxyPlaceholder: "Web 非接続のメンバー名",
      renameButton: "名前を変更",
      skipTurnButton: "ターンを飛ばす",
      resumeTurnButton: "ターンに戻る",
      viewerBadge: "観覧",
      placeholderBadge: "代理",
      eligibleBadge: "対象",
      ineligibleBadge: "離脱中",
    },
    // 接続状態（v2）
    connection: {
      online: "接続中",
      reconnecting: "再接続中…",
      lost: "セッション喪失",
      lostMessage: "サーバーとの接続が失われました。ローカルの記録は保持されています。",
    },
    // 設定保存（v2）
    preferences: {
      savedLabel: "前回の設定を使用",
      clearButton: "設定をクリア",
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
    custom: "持ち込み",
  },
} as const;

export type JaMessages = typeof ja;
