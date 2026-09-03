#!/usr/bin/env node
/**
 * pnpm の供給網設定が静かに効かなくなる経路を見る検査（#154・#135 経路⑤⑥⑦）。
 *
 * ## 何を見るか
 *
 * | 経路 | 見るもの |
 * |---|---|
 * | ⑤ | `trustPolicyExclude` / `minimumReleaseAgeExclude` の各エントリが**版を持つ**こと |
 * | ⑥ | 除外が指す版が**依存木に実在する**こと（死んだ除外行を残さない） |
 * | ⑦ | 設定の**キーが宣言と一致**し、**既知キーの値が規範どおり**であること |
 *
 * ## 権威は pnpm 自身（`docs/adr/0014` D2）
 *
 * **`pnpm-workspace.yaml` を手で解析してはならない**（MUST NOT）。したがって:
 *
 * - **設定のキーと値**は `pnpm config list --json` を 2 か所（リポジトリ直下 ／
 *   同じ `packageManager` を書いた素のディレクトリ）で走らせた差分から取る。
 *   pnpm は未知のキーも未知の値もそのまま出力するので、綴り誤りがそのまま見える。
 * - **除外が指す版の実在**は `pnpm why <名前> -r --json` から取る。`pnpm-lock.yaml` の
 *   `packages:` 節を読めば同じ判定はできるが、生成物の字句解析を自作することになる。
 *
 * **副産物**: 2 か所差分は `pnpm-workspace.yaml` 以外の場所（`.npmrc` 等）から供給網設定が
 * 入る経路も「未知のキー」として捉える。`docs/adr/0008` の「設定の置き場は
 * `pnpm-workspace.yaml` の 1 箇所のみ」という MUST に、初めて機械検査が付く。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **版の妥当性そのものを見ない。** `"semver@6.3"` のような不完全な版は pnpm 自身が
 *   `ERR_PNPM_INVALID_TRUST_POLICY_EXCLUDE` で落とす（実測）。ここで二重に判定すると
 *   semver の解釈を自作再実装することになり、偽陽性の面が増える。
 *   **黙って通るのは「版をまったく持たない形」だけ**なので、そこだけを塞ぐ。
 * - **名前パターン全般を禁じてはいない。** `*` を含む名前は落とすが、pnpm の
 *   `createMatcher` が受ける表記を網羅的に判定してはいない。
 * - **設定が効いているかは見ない。** 「検証が実際に走ったか」（経路⑫）は別の検査
 *   （`scripts/install-with-supply-chain-check.mjs`）が CI の実インストールで見る。
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く
 * （`scripts/audit-domain-side-effects.mjs` と同じ）。追加依存は禁止。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findEmptyScanDimensions } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";

/** `docs/adr/0008` の「公開から 7 日未満の版を取り込まない」を分で表した値。 */
const MINIMUM_RELEASE_AGE_FLOOR = 10080;

/** `docs/adr/0010` が定める信頼証跡の降格拒否。pnpm は完全一致でしか有効にしない。 */
const TRUST_POLICY = "no-downgrade";

/**
 * `pnpm-workspace.yaml` が持ち込んでよい設定の宣言。
 *
 * **単純な全単射にはできない。** 除外リストは空・不在が正しい状態でありうるためで、
 * 必須にすると「最後の 1 件が不要になって行ごと消す」が赤くなる。#126 は
 * `minimumReleaseAgeExclude` で、#199 は `overrides` で実際にその道を通った。
 * そこで presence を 3 段に分ける。
 *
 * - `required`  消えると防御が消える。欠けたら落とす
 * - `optional`  不在でよい。**あれば値と書式を見る**
 * - `forbidden` 置いてはならない。未知とは別の理由として名指しする
 *
 * ここに無いキーはすべて未知として落とす（経路⑦）。
 */
export const SETTINGS = {
  packages: {
    presence: "required",
    validate: (v) =>
      Array.isArray(v) && v.length > 0 && v.every((e) => typeof e === "string")
        ? null
        : "workspace の対象が空です（非空の文字列配列である必要があります）",
  },
  allowBuilds: {
    presence: "required",
    // docs/adr/0008 が現状維持を MUST としている。真偽値の写像であることだけを見る
    // （どのパッケージを許すかは規範の判断で、この検査の射程ではない）。
    validate: (v) =>
      v && typeof v === "object" && !Array.isArray(v) &&
      Object.values(v).every((x) => typeof x === "boolean")
        ? null
        : "真偽値の写像である必要があります",
  },
  minimumReleaseAge: {
    presence: "required",
    // 引き上げ（14 日・30 日）は docs/adr/0008「影響」が余地として認めているので上限は見ない。
    validate: (v) =>
      Number.isInteger(v) && v >= MINIMUM_RELEASE_AGE_FLOOR
        ? null
        : `${MINIMUM_RELEASE_AGE_FLOOR} 以上の整数である必要があります（docs/adr/0008: 公開から 7 日）`,
  },
  trustPolicy: {
    presence: "required",
    // pnpm 11.5.0 は `trustPolicy === "no-downgrade"` の完全一致でしか検査を有効にせず、
    // 未知の値を検証しない。綴り誤りは「ポリシー無効」と同じ扱いになり無警告で消える。
    validate: (v) => (v === TRUST_POLICY ? null : `"${TRUST_POLICY}" である必要があります`),
  },
  trustPolicyExclude: {
    presence: "optional",
    validate: (v) => (Array.isArray(v) ? null : "配列である必要があります"),
  },
  minimumReleaseAgeExclude: {
    presence: "optional",
    validate: (v) => (Array.isArray(v) ? null : "配列である必要があります"),
  },
  overrides: {
    presence: "optional",
    validate: (v) =>
      v && typeof v === "object" && !Array.isArray(v) ? null : "写像である必要があります",
  },
  trustPolicyIgnoreAfter: {
    presence: "forbidden",
    reason:
      "公開からの経過時間で降格検査を無効化する鍵です。docs/adr/0010 の決定を時間で空文化します",
  },
};

/** 除外リストにあたるキー。書式（⑤）と実在（⑥）を見る対象。 */
const EXCLUSION_KEYS = ["trustPolicyExclude", "minimumReleaseAgeExclude"];

/**
 * リポジトリ直下の解決済み設定のうち、**リポジトリが持ち込んでいるもの**を取り出す。
 *
 * 素の環境にも同じキーがあり値も構造ごと同じなら、それは pnpm の既定・利用者の
 * `~/.npmrc` 由来なので対象外にする。**値が違えば返す** —— `registry` のような
 * 既定のあるキーをリポジトリ側で上書きする経路を見逃さないため。
 */
export function deriveOwnKeys(repoConfig, ambientConfig) {
  return Object.keys(repoConfig)
    .filter((key) => {
      if (!(key in ambientConfig)) return true;
      return JSON.stringify(repoConfig[key]) !== JSON.stringify(ambientConfig[key]);
    })
    .sort();
}

/**
 * キーの帰属を見る（経路⑦の前半）。
 *
 * **両方向を見る。** 未知のキーだけを見ると必須キーの消失が素通りし、欠落だけを見ると
 * 綴り誤りで増えた鍵が素通りする（`diffTargets` が両方向を要求するのと同じ理由）。
 * 既知キーの綴りを間違えると、**「未知が 1 つ増え、必須が 1 つ欠ける」**として両方に出る。
 */
export function checkKeyMembership(keys, settings = SETTINGS) {
  const problems = [];
  for (const key of keys) {
    const spec = settings[key];
    if (!spec) {
      problems.push({
        key,
        message: `未知の設定キーです。pnpm は未知のキーを無警告で受け取るため、綴り誤りは検査が消えたことに気づけません`,
      });
      continue;
    }
    if (spec.presence === "forbidden") {
      problems.push({ key, message: `置いてはならない設定キーです（禁止）。${spec.reason}` });
    }
  }
  for (const [key, spec] of Object.entries(settings)) {
    if (spec.presence === "required" && !keys.includes(key)) {
      problems.push({ key, message: "必須の設定キーがありません" });
    }
  }
  return problems;
}

/**
 * 既知キーの値を見る（経路⑦の後半）。
 *
 * 宣言に無いキーは見ない。未知であることは {@link checkKeyMembership} が既に落としており、
 * 同じ 1 件を 2 つの理由で二重に出さない。
 */
export function checkValues(config, keys, settings = SETTINGS) {
  const problems = [];
  for (const key of keys) {
    const spec = settings[key];
    if (!spec || !spec.validate) continue;
    const message = spec.validate(config[key]);
    if (message) problems.push({ key, message: `値が規範に合いません: ${message}` });
  }
  return problems;
}

/**
 * pnpm の `parseVersionPolicyRule` と同じ切り方で `名前@版` を割る。
 *
 * 先頭の `@`（スコープ）は区切りにしない。`@` が無ければ版は `null` で、これは pnpm 側の
 * `exactVersions: []`（＝そのパッケージの**全版**を免除）に対応する。
 */
export function parseVersionedEntry(entry) {
  const scoped = entry.startsWith("@");
  const at = scoped ? entry.indexOf("@", 1) : entry.indexOf("@");
  if (at === -1) return { name: entry, version: null };
  return { name: entry.slice(0, at), version: entry.slice(at + 1) };
}

/**
 * 除外エントリの書式を見る（経路⑤）。
 *
 * **版の妥当性は見ない。** 不完全な版（`"semver@6.3"`）は pnpm 自身が
 * `ERR_PNPM_INVALID_TRUST_POLICY_EXCLUDE` で落とす（実測）。黙って通るのは
 * 「版をまったく持たない形」と「名前パターン」だけなので、その 2 つを塞ぐ。
 *
 * **1 エントリにつき問題は 1 つだけ出す。** `"*"` は名前パターンでも版なしでもあるが、
 * 直し方は 1 つなので二重に出さない。
 */
export function checkExclusionFormat(key, entries) {
  const problems = [];
  for (const entry of entries ?? []) {
    if (typeof entry !== "string") {
      problems.push({ key, message: `文字列でないエントリがあります: ${JSON.stringify(entry)}` });
      continue;
    }
    const { name, version } = parseVersionedEntry(entry);
    if (name.includes("*")) {
      problems.push({
        key,
        message: `名前パターンを使っています: ${entry}    ← 意図より広い免除になります。名前@版 で書いてください`,
      });
      continue;
    }
    if (version === null) {
      problems.push({
        key,
        message: `版を持たないエントリです: ${entry}    ← 以後このパッケージの全版が無検査になります。名前@版 で書いてください`,
      });
    }
  }
  return problems;
}

/**
 * `overrides` の書式を見る（`docs/adr/0008` の MUST）。
 *
 * キーは「名前@メジャー」、値は `^` で下限を示す。#149 の実測では、キーを名前だけに
 * すると直接依存の宣言まで lockfile 上で書き換わり、値を上限のない範囲にすると
 * 狙っていないメジャーへ解決が漏れた。**どちらも `pnpm audit` は緑のまま**である。
 */
export function checkOverrideFormat(overrides) {
  const problems = [];
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const { version } = parseVersionedEntry(key);
    if (version === null || !/^\d+$/.test(version)) {
      problems.push({
        key: "overrides",
        message: `キーが「名前@メジャー」ではありません: ${key}    ← 名前だけにすると直接依存の宣言まで書き換わります`,
      });
    }
    if (typeof value !== "string" || !value.startsWith("^")) {
      problems.push({
        key: "overrides",
        message: `値が ^ で始まっていません: ${key}: ${JSON.stringify(value)}    ← 上限のない範囲は狙っていないメジャーへ漏れます`,
      });
    }
  }
  return problems;
}

/**
 * 依存木から消えた除外を見る（経路⑥）。
 *
 * pnpm は lockfile に存在しない除外エントリを無効として扱わない（警告も失敗もしない）。
 * 行が残ったままその版が別の依存元経由で再び現れると、**黙って免除を与える**。
 *
 * **版を持たないエントリはここでは扱わない。** それは {@link checkExclusionFormat} が
 * 既に落としており、同じ 1 件を 2 つの理由で二重に出さない。
 */
export function findDeadExclusions(key, entries, resolvedVersions) {
  const problems = [];
  for (const entry of entries ?? []) {
    if (typeof entry !== "string") continue;
    const { name, version } = parseVersionedEntry(entry);
    if (version === null) continue;
    if (!(resolvedVersions.get(name) ?? []).includes(version)) {
      problems.push({
        key,
        message: `依存木に無い版を除外しています: ${entry}    ← 行を消してください（残すと将来この版を黙って免除します）`,
      });
    }
  }
  return problems;
}

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** pnpm の解決済み設定。`pnpm install` 済みであることは要求しない。 */
function readPnpmConfig(cwd) {
  const stdout = execFileSync("pnpm", ["config", "list", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/**
 * 素の環境（リポジトリ外）の解決済み設定を読む。
 *
 * **`packageManager` を写す。** 写さないと corepack が別の版を選び、`userAgent` に
 * 載った版番号が差分へ紛れ込む（実測）。
 */
function readAmbientConfig(repoRoot) {
  const { packageManager } = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnpm-config-probe-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "pnpm-config-probe", version: "0.0.0", private: true, packageManager }),
    );
    return readPnpmConfig(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 依存木にあるその名前の版を列挙する。**`pnpm install` 済みを要求する。**
 *
 * 依存木に無い名前では `[]` が返る（実測）。終了コードが非ゼロでも同じ扱いにする。
 */
function resolveVersions(repoRoot, name) {
  let stdout;
  try {
    stdout = execFileSync("pnpm", ["why", name, "-r", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    stdout = error.stdout ?? "";
  }
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed)
    .filter((entry) => entry?.name === name && typeof entry.version === "string")
    .map((entry) => entry.version);
}

function main() {
  const config = readPnpmConfig(REPO_ROOT);
  const keys = deriveOwnKeys(config, readAmbientConfig(REPO_ROOT));

  const exclusions = new Map(
    EXCLUSION_KEYS.map((key) => [key, Array.isArray(config[key]) ? config[key] : []]),
  );
  const exclusionCount = [...exclusions.values()].reduce((n, list) => n + list.length, 0);
  const overrideCount = Object.keys(config.overrides ?? {}).length;
  const summary = `設定キー ${keys.length} 件 / 除外 ${exclusionCount} 件 / overrides ${overrideCount} 件`;

  // 走査量は成否によらず必ず出す（ADR-0014 決定 6）。何を見たかが赤の根拠になる。
  console.log(`[audit-supply-chain-config] 走査対象: ${summary}`);

  // 0 件ガードの対象は設定キーだけにする（ADR-0014 決定 8）。
  // **除外と overrides に 0 件ガードを掛けてはならない。** どちらも 0 件が正しい状態で
  // ありうる（#126 / #199 が実際に空にした）。ここへ下限を置くと、規範が認めた
  // 「不要になったら消す」が赤くなる。
  const emptyDimensions = findEmptyScanDimensions([{ label: "設定キー", count: keys.length }]);
  if (emptyDimensions.length > 0) {
    console.error(
      `[audit-supply-chain-config] 走査対象が 0 件です（${emptyDimensions.join(" / ")}）。検査が空振りしています`,
    );
    process.exit(1);
  }

  const problems = [
    ...checkKeyMembership(keys),
    ...checkValues(config, keys),
    ...checkOverrideFormat(config.overrides),
  ];
  for (const [key, entries] of exclusions) {
    problems.push(...checkExclusionFormat(key, entries));
  }

  // 実在確認は書式が正しいものだけに絞る。書式が壊れた行を「依存木に無い」と
  // 二重に責めても、直し方は 1 つしかない。
  const names = new Set();
  for (const entries of exclusions.values()) {
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      const { name, version } = parseVersionedEntry(entry);
      if (version !== null && !name.includes("*")) names.add(name);
    }
  }
  const resolvedVersions = new Map([...names].map((name) => [name, resolveVersions(REPO_ROOT, name)]));
  for (const [key, entries] of exclusions) {
    problems.push(...findDeadExclusions(key, entries, resolvedVersions));
  }

  if (problems.length > 0) {
    console.error(
      `[audit-supply-chain-config] pnpm の供給網設定に問題があります（${problems.length} 件）`,
    );
    for (const p of problems) console.error(`  ${p.key}: ${p.message}`);
    console.error("  設定の置き場は pnpm-workspace.yaml の 1 箇所のみです（docs/adr/0008）");
    console.error("  根拠: docs/adr/0008 / docs/adr/0010 / docs/adr/0014 決定 1");
    process.exit(1);
  }

  console.log(`[audit-supply-chain-config] OK（${summary}）`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
