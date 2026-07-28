/**
 * 権限判定（Issue #22: 開始後は全員同格 — セッション進行から主催者を外す）。
 *
 * 従来 `apps/sync/src/application/handlers.ts` に5層に分散していた可否判定を、
 * この純粋関数に集約する（FR-071・plan.md D1）。`apps/sync` と `apps/web` の両方が
 * 同じ関数を呼ぶことで、UI の表示と実際の可否が構造的に一致する（SC-022）。
 *
 * このモジュールは権限のみを判定する。不変条件（編集者以上が1名以上残るか）は
 * 別モジュール（participants.ts）の責務であり、ここでは扱わない。
 */

/** 参加者の役割。主催者は開始後の判定には使われないが、記録上の役割として残る。 */
export type Role = "host" | "editor" | "viewer";

/**
 * 権限判定の入力。room/participant をそのまま渡さず、判定に必要な事実だけを取る
 * （テスト容易性のため。呼び出し側が事実の算出を担う）。
 */
export interface PermissionInput {
  /** 実行しようとしているコマンド名 */
  command: string;
  /** 実行者の役割 */
  role: Role;
  /** そのルームが一度でもセッションを開始したか（Room.startedAt !== null） */
  started: boolean;
  /** 操作対象が実行者自身か。対象を持たないコマンドは false */
  isSelfTarget: boolean;
}

export type PermissionVerdict =
  | { allowed: true }
  | { allowed: false; code: "UNAUTHORIZED"; message: string };

const ALLOWED: PermissionVerdict = { allowed: true };

function denied(message: string): PermissionVerdict {
  return { allowed: false, code: "UNAUTHORIZED", message };
}

// ─── 規則表（モジュール定数） ────────────────────────────────────────────────

/**
 * 対象が自分自身なら、役割・段階を問わず常に許可するコマンド（FR-068）。
 * 既存の関係ガード（層②：本人 or host）の対象を統合したもの。
 * 見学者であっても自分の改名・自分の見送り/復帰・自分の退出はできる（既存挙動の維持）。
 *
 * 注意: `member.add` / `member.remove` はここに含めない。現行実装ではこの2コマンドは
 * 層③（他人対象は host のみ・未開始時）と層①（`EDITOR_PLUS_COMMANDS` による viewer 拒否）の
 * 両方を通る。ここに入れて自己対象を無条件許可にすると、viewer が自分対象でも
 * 早期 return で通ってしまい層①の viewer 拒否を迂回する（FR-067 違反）。
 * 代わりに `ROTATION_OWNERSHIP_COMMANDS` として別に扱い、判定順序のステップ5b で
 * 「編集者以上」を要求したうえで他人対象を host 限定にする。
 */
const SELF_SCOPED_COMMANDS: ReadonlySet<string> = new Set([
  "participant.rename",
  "driver.skip",
  "driver.resume",
  "participant.remove",
]);

/**
 * 層②（`RELATIONAL_SELF_OR_HOST`・`handlers.ts:443-459`）の他人対象側。
 * `participant.rename` / `driver.skip` / `driver.resume` は「本人 or host」権限であり、
 * 自己対象は SELF_SCOPED_COMMANDS のステップ1で既に許可される。ここは**他人対象のときだけ**効く。
 *
 * 元実装（`authorize()`）の末尾は `if (role === "host") allow else deny` という拒否寄りの
 * fallback であり、これが層②を暗黙に守っていた。ステップ5c を「それ以外は許可」に変える際は、
 * この3コマンドを必ず5bに明示的に含めること。含めないと、未開始時に editor が他人を
 * rename / skip / resume できてしまう（層②の喪失＝過去に実際に起きた回帰）。
 */
const RELATIONAL_OTHER_HOST_ONLY: ReadonlySet<string> = new Set([
  "participant.rename",
  "driver.skip",
  "driver.resume",
]);

/**
 * ローテーションの所有権に関わるコマンド（`member.add` / `member.remove`）。
 * SELF_SCOPED_COMMANDS に入れられない理由は同定数のコメントを参照。
 * 未開始時は「他人対象は host のみ」（層③の維持・FR-066）、開始後は編集者以上なら誰でも
 * 他人対象も操作できる。自分対象は編集者以上なら段階を問わず許可し、viewer は自分対象でも拒否する
 * （ステップ3の viewer 拒否がステップ1の自己対象許可より先に効くため。既存挙動の維持）。
 */
const ROTATION_OWNERSHIP_COMMANDS: ReadonlySet<string> = new Set(["member.add", "member.remove"]);

/**
 * 対象が自分自身かつ「開始後」に限り許可するコマンド（D3b・FR-073b）。
 * 開始前の自己降格は従来どおり host のみ（`handleRoleSet` の CANNOT_CHANGE_HOST 制約と整合）。
 * 開始後に限るのは、応答しているのが見学者だけという詰みを本人の操作で解消するための例外であり、
 * 開始前まで緩めると準備段階の主催者主導（FR-066）と衝突するため。
 */
const SELF_SCOPED_AFTER_START: ReadonlySet<string> = new Set(["role.set"]);

/**
 * 開始前は host のみ実行できるコマンド（既存の HOST_ONLY_COMMANDS・層①）。
 * 開始後は編集者以上であれば実行できる（FR-063/064/065）。13件。
 */
const HOST_ONLY_BEFORE_START: ReadonlySet<string> = new Set([
  "session.complete",
  "session.abort",
  "session.reset",
  "phase.set",
  "role.set",
  "room.passphrase.set",
  "ai.unlock",
  "host.transfer",
  "participant.addProxy",
  "participant.remove",
  "member.move",
  "member.shuffle",
  "driver.assign",
]);

/**
 * 段階を問わず編集者以上であれば実行できるコマンド（既存の EDITOR_PLUS_COMMANDS・層①）。
 * viewer 拒否の判定（ステップ3）のためだけに段階を問わず参照する。9件。
 */
const EDITOR_PLUS_COMMANDS: ReadonlySet<string> = new Set([
  "config.set",
  "member.add",
  "member.remove",
  "session.act",
  "problem.request",
  "problem.submit",
  "problem.edit",
  "problem.mode.set",
  "handoff.note.set",
]);

/**
 * 規則表に登録されている全コマンド（default-deny の判定に使う）。
 * ルームスコープかつ到達可能な25コマンドと一致する（`.claude/rules/security.md` の
 * ホワイトリスト方式に合わせ、表に無いコマンドは拒否する）。
 */
const REGISTERED_COMMANDS: ReadonlySet<string> = new Set([
  ...SELF_SCOPED_COMMANDS,
  ...ROTATION_OWNERSHIP_COMMANDS,
  ...SELF_SCOPED_AFTER_START,
  ...HOST_ONLY_BEFORE_START,
  ...EDITOR_PLUS_COMMANDS,
]);

// ─── 判定 ────────────────────────────────────────────────────────────────

/**
 * 段階と役割から可否を判定する。サーバーの強制と UI の活性表示が同一の実装を共有する。
 *
 * 判定順序（この順序を変えてはならない。plan.md「判定の順序」参照）:
 *   0. 規則表に無いコマンドか？                                                  → 拒否（default-deny）
 *   1. 自己対象かつ SELF_SCOPED か？                                             → 許可（役割・段階を問わない）
 *   2. 自己対象かつ role.set かつ開始済み？                                       → 許可
 *   3. 役割が viewer か？                                                       → 拒否
 *   4. 開始済みか（started）？                                                   → 許可
 *   5. 未開始 → 従来の規則:
 *      5a. HOST_ONLY_BEFORE_START かつ非 host                                     → 拒否
 *      5b. (RELATIONAL_OTHER_HOST_ONLY ∪ ROTATION_OWNERSHIP) かつ他人対象かつ非 host → 拒否（層②③の維持）
 *      5c. それ以外                                                               → 許可
 *
 * ステップ1・2 がステップ3 より先である理由: FR-067（viewer の制限）と FR-068
 * （自己対象の許可）は「viewer が自分を対象にした場合」に衝突する。既存挙動
 * （見学者が自分の改名・見送り/復帰はできる）を維持するため、自己対象の許可を
 * viewer 拒否より先に判定する。
 *
 * 5c を「それ以外は許可」にしてよいのは、5b が層②③由来の5コマンド
 * （participant.rename / driver.skip / driver.resume / member.add / member.remove）を
 * 漏れなく含む場合に限る。元実装の末尾は `if (role === "host") allow else deny` という
 * 拒否寄りの fallback であり、それが層②を暗黙に守っていた。許可寄りに変えたなら、
 * 層②を5bで明示的に引き受けなければならない（過去に実際にここを見落とした回帰があった。
 * `permissions-differential.test.ts` がこの回帰を機械的に検出する）。
 */
export function checkPermission(input: PermissionInput): PermissionVerdict {
  const { command, role, started, isSelfTarget } = input;

  // ステップ0: 規則表に無いコマンドは拒否する（fail-open にしない）。
  if (!REGISTERED_COMMANDS.has(command)) {
    return denied(`${command} は実行できません`);
  }

  // ステップ1: 自己対象の SELF_SCOPED コマンドは、役割・段階を問わず常に許可する。
  if (isSelfTarget && SELF_SCOPED_COMMANDS.has(command)) {
    return ALLOWED;
  }

  // ステップ2: 自己対象の role.set は、開始後に限り許可する（D3b）。
  if (isSelfTarget && started && SELF_SCOPED_AFTER_START.has(command)) {
    return ALLOWED;
  }

  // ステップ3: 見学者は状態変更操作を実行できない（自己対象はステップ1で既に処理済み）。
  if (role === "viewer") {
    return denied(`${command} は見学者では実行できません（進行に加わると実行できます）`);
  }

  // ステップ4: 開始後は主催者であることを条件にしない。編集者以上なら誰でも実行できる。
  //
  // **この許可は登録済みコマンド全体に及ぶ。** 進行系だけでなく、入室制御に当たる
  // `room.passphrase.set` や `ai.unlock`、`host.transfer` も含まれる。これは意図的で、
  // FR-063 が「開始後は可否判定に主催者であることを条件として用いてはならない」と
  // 無条件に定めているため。ここで入室制御だけ host 限定に戻すと FR-063 に違反する。
  //
  // 主催者が居なくなった部屋を残った人だけで畳めるようにするのが本 Issue の目的であり、
  // 「進行だけ緩和し管理系は据え置く」と主催者不在時に管理系が誰にも実行できなくなる。
  // 意図は `permissions-after-start.test.ts` が固定している（表を削るときはそこを見ること）。
  if (started) {
    return ALLOWED;
  }

  // ステップ5: 開始前は従来の規則に従う。ここに到達した時点で role は host か editor。

  // ステップ5a: HOST_ONLY_BEFORE_START は host のみ。
  if (HOST_ONLY_BEFORE_START.has(command) && role !== "host") {
    return denied(`${command} は開始前はホストのみ実行できます`);
  }

  // ステップ5b: RELATIONAL_OTHER_HOST_ONLY（層②）は、他人対象かつ非 host なら拒否する。
  // EDITOR_PLUS_COMMANDS による無条件許可（5c）より必ず先に判定する。
  // ここを見落とすと、未開始時に editor が他人を rename / skip / resume できてしまう（層②の喪失）。
  if (RELATIONAL_OTHER_HOST_ONLY.has(command) && !isSelfTarget && role !== "host") {
    return denied(`${command} は他の参加者への操作のためホストのみ実行できます`);
  }

  // ステップ5b（続き）: ROTATION_OWNERSHIP（層③）は、他人対象かつ非 host なら拒否する。
  // 順序を逆にすると、未開始時に editor が他人のローテーションを操作できてしまう（FR-066 違反）。
  if (ROTATION_OWNERSHIP_COMMANDS.has(command) && !isSelfTarget && role !== "host") {
    return denied(`${command} は他の参加者のローテーション操作のためホストのみ実行できます`);
  }

  // ステップ5c: 上記いずれにも該当しない場合は許可する（EDITOR_PLUS_COMMANDS を含む）。
  return ALLOWED;
}

/** UI 向けの真偽値ヘルパー（checkPermission の薄いラッパ）。 */
export function isAllowed(input: PermissionInput): boolean {
  return checkPermission(input).allowed;
}
