import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  INSTALL_ARGS,
  findVerificationEvidence,
  decideOutcome,
  formatMissingVerification,
} from "./install-with-supply-chain-check.mjs";

/** pnpm 11.5.0 が実際に出す行（main の run 33697032958 のログから逐語）。 */
const VERIFIED_LINE = "✓ Lockfile passes supply-chain policies (445 entries in 8.3s)";

/** 検証を**始めた**ときの行。これだけでは「通った」ことにならない。 */
const VERIFYING_LINE = "? Verifying lockfile against supply-chain policies (445 entries)...";

/** 1 段目の短絡（optimisticRepeatInstall）が成立したときの出力（手元で実測）。 */
const SHORT_CIRCUITED = ["Scope: all 12 workspace projects", "Already up to date", ""].join("\n");

describe("INSTALL_ARGS: 実経路を判定していることを守る", () => {
  test("frozen-lockfile で走らせる", () => {
    // Given / When / Then: CI が実際に使う形と同じであることを見る
    assert.ok(INSTALL_ARGS.includes("install"));
    assert.ok(INSTALL_ARGS.includes("--frozen-lockfile"));
  });

  test("短絡を自分で無効化しない（合成した経路を判定しない）", () => {
    // Given / When / Then: ここに --config.optimistic-repeat-install=false を入れると、
    //                      「CI の実インストールで検証が走ったか」ではなく
    //                      「無効化すれば走るか」を見ることになる。node_modules を
    //                      CI キャッシュへ載せた瞬間に、合成側だけが緑になる。
    assert.equal(
      INSTALL_ARGS.some((arg) => arg.includes("optimistic-repeat-install")),
      false,
    );
    // 信頼済み扱いで検証段ごと飛ばす形も同じ理由で入れない（docs/adr/0008 の MUST NOT）。
    assert.equal(INSTALL_ARGS.includes("--trust-lockfile"), false);
  });
});

describe("findVerificationEvidence: 検証が通った証跡を読む", () => {
  test("通った行から件数を読む", () => {
    // Given / When
    const evidence = findVerificationEvidence(`Scope: all 12\n${VERIFIED_LINE}\nDone in 16s`);
    // Then
    assert.equal(evidence.verified, true);
    assert.equal(evidence.entries, 445);
  });

  test("色付き（ANSI）の出力でも読む", () => {
    // Given: 端末では ✓ に色が付く
    const colored = `[32m✓[39m Lockfile passes supply-chain policies (445 entries in 8.3s)`;
    // When / Then
    assert.equal(findVerificationEvidence(colored).verified, true);
  });

  test("短絡した出力では証跡なしになる", () => {
    // Given / When / Then: これが経路⑫そのもの
    assert.equal(findVerificationEvidence(SHORT_CIRCUITED).verified, false);
    assert.equal(findVerificationEvidence(SHORT_CIRCUITED).entries, null);
  });

  test("「検証を始めた」行だけでは通ったことにしない", () => {
    // Given / When / Then: 始めて落ちた・途中で切れた出力を緑にしない
    assert.equal(findVerificationEvidence(`Scope: all 12\n${VERIFYING_LINE}`).verified, false);
  });

  test("空の出力では証跡なしになる", () => {
    assert.equal(findVerificationEvidence("").verified, false);
  });
});

describe("decideOutcome: 何を落とすか", () => {
  const VERIFIED = { verified: true, entries: 445 };
  const MISSING = { verified: false, entries: null };

  test("検証が通っていれば 0 で終わる", () => {
    assert.equal(decideOutcome({ status: 0, evidence: VERIFIED }).code, 0);
  });

  test("install 自体が失敗したら、その終了コードをそのまま返す", () => {
    // Given / When / Then: install の失敗を検証の失敗にすり替えない
    assert.equal(decideOutcome({ status: 1, evidence: MISSING }).code, 1);
    assert.equal(decideOutcome({ status: 137, evidence: MISSING }).code, 137);
  });

  test("install は成功したのに検証が走っていなければ落とす", () => {
    // Given / When
    const outcome = decideOutcome({ status: 0, evidence: MISSING });
    // Then
    assert.equal(outcome.code, 1);
    assert.notEqual(outcome.message, null);
  });

  test("件数が 0 なら落とす（何も検証していない）", () => {
    assert.equal(decideOutcome({ status: 0, evidence: { verified: true, entries: 0 } }).code, 1);
  });

  test("終了コードが null（シグナルで死んだ）なら落とす", () => {
    // Given / When / Then: null を「成功」に丸めない
    assert.notEqual(decideOutcome({ status: null, evidence: VERIFIED }).code, 0);
  });
});

describe("formatMissingVerification: 直し方を伝える", () => {
  const text = formatMissingVerification();

  test("2 段ある短絡の 1 段目を名指しする", () => {
    // Given / When / Then: 「キャッシュを消せば再検証される」は誤りで、実測では
    //                      キャッシュを消しても走らなかった（設計正本 §3.2）。
    //                      手元で強制するのに要るのはこのフラグである。
    assert.match(text, /optimistic-repeat-install/);
  });

  test("2 段目（検証キャッシュ）も名指しする", () => {
    assert.match(text, /lockfile-verified\.jsonl/);
  });
});
