import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS,
  deriveOwnKeys,
  checkKeyMembership,
  checkValues,
  parseVersionedEntry,
  checkExclusionFormat,
  checkOverrideFormat,
  findDeadExclusions,
} from "./audit-supply-chain-config.mjs";

/**
 * **規範の写しであって、腐る列挙ではない。**
 *
 * `SETTINGS` をループするだけのテストでは、**宣言からキーを落としてもループが一緒に
 * 縮むので緑のまま**になる（`audit-domain-side-effects.test.mjs` の `REQUIRED_FORBIDDEN` と
 * 同じ理由）。射程を狭める向きの変更を機械で止めるには、テスト側がリテラルで持つしかない。
 *
 * ここに並ぶのは「現時点の実装の写し」ではなく、**この検査が守ると決めた射程そのもの**である。
 *
 * - 必須 4 件は「消えると防御が消える」もの（`docs/adr/0008` の待機期間・置き場・
 *   `allowBuilds` 現状維持、`docs/adr/0010` の降格拒否）。
 * - 禁止 1 件は「経過時間で降格検査を無効化する」鍵。未知として落とすだけでは
 *   なぜ駄目かが伝わらないので、presence として別に持つ。
 *
 * **presence を緩めるときは、規範とこの表の両方を直すこと。** 実装側だけを緩めれば赤くなる。
 */
const REQUIRED_PRESENCE = [
  ["packages", "required"],
  ["allowBuilds", "required"],
  ["minimumReleaseAge", "required"],
  ["trustPolicy", "required"],
  ["trustPolicyIgnoreAfter", "forbidden"],
];

/**
 * 待機期間の下限（分）。**`docs/adr/0008` の「公開から 7 日未満を取り込まない」の逐語値**。
 * 実装側だけを下げても、ここが赤くなる。
 */
const MINIMUM_RELEASE_AGE_FLOOR = 10080;

describe("SETTINGS: 射程を緩める変更を止める", () => {
  test("規範が決めた presence がそのまま宣言に入っている", () => {
    // Given / When / Then（実装側の表ではなく、上のリテラルを回す）
    for (const [key, presence] of REQUIRED_PRESENCE) {
      assert.ok(SETTINGS[key], `${key} が SETTINGS から落ちている`);
      assert.equal(SETTINGS[key].presence, presence, `${key} の presence が変わっている`);
    }
  });

  test("除外リストと overrides は任意（空・不在が正しい状態でありうる）", () => {
    // #126 は minimumReleaseAgeExclude を、#199 は overrides をキーごと消した。
    // 必須にすると「最後の 1 件が不要になって消す」が赤になる。
    for (const key of ["trustPolicyExclude", "minimumReleaseAgeExclude", "overrides"]) {
      assert.equal(SETTINGS[key]?.presence, "optional", `${key} が任意でない`);
    }
  });
});

describe("deriveOwnKeys: リポジトリ側にしか無い設定を取り出す", () => {
  test("素の環境に無いキーだけを返す", () => {
    // Given: 素の環境（リポジトリ外）と、リポジトリ直下の解決済み設定
    const ambient = { registry: "https://registry.npmjs.org/", userAgent: "pnpm/11.5.0" };
    const repo = { ...ambient, trustPolicy: "no-downgrade", minimumReleaseAge: 10080 };
    // When / Then
    assert.deepEqual(deriveOwnKeys(repo, ambient), ["minimumReleaseAge", "trustPolicy"]);
  });

  test("素の環境にもあるが値が違うキーは返す（ambient の上書きを見逃さない）", () => {
    // Given: registry を pnpm-workspace.yaml で書き換えた形（.npmrc 経由でも同じ）
    const ambient = { registry: "https://registry.npmjs.org/" };
    const repo = { registry: "https://evil.example.com/" };
    // When / Then
    assert.deepEqual(deriveOwnKeys(repo, ambient), ["registry"]);
  });

  test("値が構造ごと同じなら返さない", () => {
    // Given: オブジェクト・配列は参照ではなく中身で比べる
    const ambient = { allowBuilds: { esbuild: true }, packages: ["a"] };
    const repo = { allowBuilds: { esbuild: true }, packages: ["a"] };
    // When / Then
    assert.deepEqual(deriveOwnKeys(repo, ambient), []);
  });
});

describe("checkKeyMembership: 未知・禁止・必須欠落（経路⑦）", () => {
  const KEYS = ["packages", "allowBuilds", "minimumReleaseAge", "trustPolicy"];

  test("必須がそろっていて余計なキーが無ければ問題なし", () => {
    // Given / When / Then
    assert.deepEqual(checkKeyMembership(KEYS), []);
  });

  test("未知のキーを名指しして落とす", () => {
    // Given: 綴りを間違えた新しいキー（pnpm は無警告で受け取る）
    const problems = checkKeyMembership([...KEYS, "thisKeyDoesNotExist"]);
    // When / Then
    assert.equal(problems.length, 1);
    assert.equal(problems[0].key, "thisKeyDoesNotExist");
    assert.match(problems[0].message, /未知/);
  });

  test("既知キーの綴り誤りは「未知」と「必須の欠落」の両方で落ちる", () => {
    // Given: trustPolicy → trustPolicyy（#116 が実測した経路そのもの）
    const problems = checkKeyMembership([
      "packages",
      "allowBuilds",
      "minimumReleaseAge",
      "trustPolicyy",
    ]);
    // When / Then: 落ちた鍵と、増えた鍵の両方を名指しする
    assert.deepEqual(problems.map((p) => p.key).sort(), ["trustPolicy", "trustPolicyy"]);
  });

  test("必須キーの欠落をそれぞれ名指しする", () => {
    // Given / When / Then（1 つずつ抜いて、その鍵だけが出ることを見る）
    for (const missing of KEYS) {
      const problems = checkKeyMembership(KEYS.filter((k) => k !== missing));
      assert.deepEqual(
        problems.map((p) => p.key),
        [missing],
        `${missing} の欠落を捉えていない`,
      );
    }
  });

  test("禁止キーは未知とは別の理由で落とす", () => {
    // Given: 降格検査を経過時間で無効化する鍵
    const problems = checkKeyMembership([...KEYS, "trustPolicyIgnoreAfter"]);
    // When / Then
    assert.equal(problems.length, 1);
    assert.equal(problems[0].key, "trustPolicyIgnoreAfter");
    assert.match(problems[0].message, /禁止/);
    assert.doesNotMatch(problems[0].message, /未知/);
  });
});

describe("checkValues: 既知キーの不正な値（経路⑦）", () => {
  const CONFIG = {
    packages: ["packages/*"],
    allowBuilds: { esbuild: true },
    minimumReleaseAge: MINIMUM_RELEASE_AGE_FLOOR,
    trustPolicy: "no-downgrade",
  };
  const KEYS = Object.keys(CONFIG);

  test("規範どおりの値なら問題なし", () => {
    assert.deepEqual(checkValues(CONFIG, KEYS), []);
  });

  test("trustPolicy の綴り誤りを落とす（#116 が実測した無警告の経路）", () => {
    // Given: 末尾の e が落ちた形。pnpm は完全一致判定なので検査ごと消える
    const problems = checkValues({ ...CONFIG, trustPolicy: "no-downgrad" }, KEYS);
    // When / Then
    assert.equal(problems.length, 1);
    assert.equal(problems[0].key, "trustPolicy");
    assert.match(problems[0].message, /no-downgrade/);
  });

  test("待機期間を規範の下限より短くすると落ちる", () => {
    // Given: 7 日 → 1 日
    const problems = checkValues({ ...CONFIG, minimumReleaseAge: 1440 }, KEYS);
    // When / Then
    assert.equal(problems.length, 1);
    assert.equal(problems[0].key, "minimumReleaseAge");
  });

  test("待機期間は下限ちょうどなら通り、それ以上でも通る", () => {
    // Given / When / Then: 引き上げ（14 日・30 日）は規範が認めている
    assert.deepEqual(checkValues({ ...CONFIG, minimumReleaseAge: 20160 }, KEYS), []);
    assert.deepEqual(
      checkValues({ ...CONFIG, minimumReleaseAge: MINIMUM_RELEASE_AGE_FLOOR }, KEYS),
      [],
    );
  });

  test("待機期間が整数でなければ落ちる", () => {
    // Given / When / Then（文字列・小数はどちらも設定ミス）
    assert.equal(checkValues({ ...CONFIG, minimumReleaseAge: "10080" }, KEYS).length, 1);
    assert.equal(checkValues({ ...CONFIG, minimumReleaseAge: 10080.5 }, KEYS).length, 1);
  });

  test("allowBuilds の値が真偽値でなければ落ちる", () => {
    const problems = checkValues({ ...CONFIG, allowBuilds: { esbuild: "true" } }, KEYS);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].key, "allowBuilds");
  });

  test("packages が空なら落ちる（workspace が空になる）", () => {
    const problems = checkValues({ ...CONFIG, packages: [] }, KEYS);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].key, "packages");
  });

  test("宣言に無いキーは値を見ない（未知の判定は checkKeyMembership の仕事）", () => {
    // Given / When / Then: 二重に落として原因を二重に出さない
    assert.deepEqual(checkValues({ ...CONFIG, whatever: 1 }, [...KEYS, "whatever"]), []);
  });
});

describe("parseVersionedEntry: pnpm と同じ切り方をする", () => {
  test("名前だけなら版は null（pnpm の exactVersions: [] に対応する）", () => {
    assert.deepEqual(parseVersionedEntry("semver"), { name: "semver", version: null });
  });

  test("名前@版を切る", () => {
    assert.deepEqual(parseVersionedEntry("semver@6.3.1"), { name: "semver", version: "6.3.1" });
  });

  test("スコープ付きの先頭 @ は区切りにしない", () => {
    // Given / When / Then: pnpm の parseVersionPolicyRule と同じ判定
    assert.deepEqual(parseVersionedEntry("@babel/core@7.29.7"), {
      name: "@babel/core",
      version: "7.29.7",
    });
    assert.deepEqual(parseVersionedEntry("@babel/core"), { name: "@babel/core", version: null });
  });
});

describe("checkExclusionFormat: 版指定の退化（経路⑤）", () => {
  test("名前@版なら問題なし", () => {
    assert.deepEqual(checkExclusionFormat("trustPolicyExclude", ["semver@6.3.1"]), []);
  });

  test("名前だけへ退化した除外を落とす", () => {
    // Given: #116 が挙げた退化そのもの。pnpm から見れば「より広い除外」として正常に動く
    const problems = checkExclusionFormat("trustPolicyExclude", ["semver"]);
    // When / Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /semver/);
    assert.match(problems[0].message, /版/);
  });

  test("スコープ付きの名前だけも落とす", () => {
    assert.equal(checkExclusionFormat("trustPolicyExclude", ["@babel/core"]).length, 1);
  });

  test("名前に * を含む除外を落とす（意図より広い免除になる）", () => {
    assert.equal(checkExclusionFormat("trustPolicyExclude", ["*"]).length, 1);
    assert.equal(checkExclusionFormat("trustPolicyExclude", ["semver-*@6.3.1"]).length, 1);
  });

  test("文字列でないエントリを落とす", () => {
    assert.equal(checkExclusionFormat("trustPolicyExclude", [{ semver: "6.3.1" }]).length, 1);
  });

  test("空の除外リストは問題なし（不要になったら空にしてよい）", () => {
    assert.deepEqual(checkExclusionFormat("trustPolicyExclude", []), []);
  });

  test("版の妥当性そのものは見ない（pnpm 自身が ERR で落とすため）", () => {
    // Given / When / Then: "semver@6.3" は pnpm が INVALID_TRUST_POLICY_EXCLUDE で落とす。
    //                      ここで二重に判定すると semver の解釈を自作再実装することになる。
    assert.deepEqual(checkExclusionFormat("trustPolicyExclude", ["semver@6.3"]), []);
  });
});

describe("checkOverrideFormat: overrides の書式（docs/adr/0008 の MUST）", () => {
  test("名前@メジャー と ^ の組なら問題なし", () => {
    assert.deepEqual(checkOverrideFormat({ "nanoid@3": "^3.3.18" }), []);
    assert.deepEqual(checkOverrideFormat({ "@babel/core@7": "^7.29.7" }), []);
  });

  test("キーが名前だけなら落とす（直接依存の宣言まで書き換わる）", () => {
    const problems = checkOverrideFormat({ nanoid: "^3.3.18" });
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /nanoid/);
  });

  test("キーのメジャーがメジャーでなければ落とす", () => {
    // Given / When / Then: 名前@3.3 は「メジャー」ではない
    assert.equal(checkOverrideFormat({ "nanoid@3.3": "^3.3.18" }).length, 1);
  });

  test("値が上限のない範囲なら落とす（狙っていないメジャーへ漏れる）", () => {
    // Given: #149 の実測では postcss の依存が nanoid@6 に解決され 3.x が消えた
    assert.equal(checkOverrideFormat({ "nanoid@3": ">=3.3.18" }).length, 1);
    assert.equal(checkOverrideFormat({ "nanoid@3": "3.3.18" }).length, 1);
  });

  test("overrides が無ければ問題なし（現在の状態）", () => {
    assert.deepEqual(checkOverrideFormat(undefined), []);
    assert.deepEqual(checkOverrideFormat({}), []);
  });
});

describe("findDeadExclusions: 死んだ除外行（経路⑥）", () => {
  test("依存木にある版なら問題なし", () => {
    // Given: pnpm why が返した実体
    const resolved = new Map([["semver", ["6.3.1", "7.8.5"]]]);
    // When / Then
    assert.deepEqual(findDeadExclusions("trustPolicyExclude", ["semver@6.3.1"], resolved), []);
  });

  test("版が依存木から消えた除外を名指しして落とす", () => {
    // Given: 6.3.1 が消え 7.8.5 だけが残った形
    const resolved = new Map([["semver", ["7.8.5"]]]);
    // When
    const problems = findDeadExclusions("trustPolicyExclude", ["semver@6.3.1"], resolved);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /semver@6\.3\.1/);
  });

  test("名前ごと依存木から消えた除外も落とす", () => {
    const problems = findDeadExclusions("trustPolicyExclude", ["semver@6.3.1"], new Map());
    assert.equal(problems.length, 1);
  });

  test("版を持たないエントリはここでは扱わない（checkExclusionFormat の仕事）", () => {
    // Given / When / Then: 同じ 1 件を 2 つの理由で二重に出さない
    assert.deepEqual(findDeadExclusions("trustPolicyExclude", ["semver"], new Map()), []);
  });
});
