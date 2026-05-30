/**
 * 英語メッセージキー
 * FR-036
 */

export const en = {
  ui: {
    setup: {
      title: "Session Setup",
      startButton: "Start Session",
      soloButton: "Solo Practice",
      createRoomButton: "Create Room",
      intervalLabel: "Switch Interval",
      membersLabel: "Members",
      addMemberPlaceholder: "Enter name",
      addMemberButton: "Add",
      languageLabel: "Language",
      difficultyLabel: "Difficulty",
    },
    lobby: {
      title: "Lobby",
      roomCodeLabel: "Room Code",
      copyButton: "Copy",
      copied: "Copied!",
      qrButton: "Show QR Code",
      waitingMessage: "Waiting for members to join...",
      startButton: "Start Session",
    },
    session: {
      driverLabel: "Driver",
      navigatorLabel: "Navigator",
      nextLabel: "Next",
      switchButton: "Skip",
      pauseButton: "Pause",
      resumeButton: "Resume",
      completeButton: "Complete!",
      resetButton: "Reset",
      breakButton: "Break",
      elapsedLabel: "Elapsed",
      rotationsLabel: "Switches",
    },
    celebration: {
      title: "Session Complete!",
      saveButton: "Save Record",
      exportButton: "Export",
      newSessionButton: "New Session",
    },
  },

  errors: {
    emptyName: "Please enter a name",
    duplicateName: "This name is already taken: {{name}}",
    memberLimitExceeded: "Maximum {{limit}} members allowed",
    belowMinMembers: "At least {{min}} members required",
    unauthorized: "This action requires {{requiredRole}} role or higher",
    phaseConflict: "This action is only available in the {{requiredPhase}} phase",
    invalidInterval: "Interval must be one of {{allowed}} minutes",
    invalidRoomCode: "Invalid room code",
    roomNotFound: "Room not found",
    sessionExpired: "Session has ended",
    connectionFailed: "Connection failed",
    aiGenerationFailed: "AI generation failed (using fallback problem)",
  },

  difficulty: {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  },

  presence: {
    online: "Online",
    idle: "Away",
    offline: "Offline",
  },

  problemSource: {
    ai: "AI Generated",
    fallback: "Template",
  },
} as const;

export type EnMessages = typeof en;
