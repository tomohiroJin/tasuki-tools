/**
 * 除去検査の結果の置き場と読み出し（#321・設計正本 D2）。PR 2・3 が「写さないクラス」を決めるときは、
 * **この {@link loadRemovalProbe} だけを通して読む**（状態ごとの JSON を直に読まない）。
 *
 * 結果は状態ごとに `out/removal/<状態>.json` へ書く（`removal.parity.ts`）。1 つのファイルへ束ねて書くと、テストが落ちて
 * worker が作り直されたときや `-g` で一部だけ流したときに、判定していない状態が黙って欠けた一覧になる。欠けた状態の
 * クラスを「dead にしか出ない」と読み違えると、生きているクラスを写さずに消してしまう。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { STATES } from './states';

/**
 * 判定の 1 件。`token` は外したクラス（組の確かめでは ` + ` で繋いだ組）。
 * `widths` は、alive なら変わった幅（`reduce`）・dead なら判定した幅（その要素が在った幅）・undecided なら揺れた幅。
 * `motionWidths` は `no-preference` の動きのプロパティで変わった幅。`reason` は undecided の理由。
 */
export interface ProbeHit {
  readonly state: string;
  readonly path: string;
  readonly className: string;
  readonly token: string;
  readonly widths?: number[];
  readonly motionWidths?: number[];
  readonly reason?: string;
}

/** 1 状態の判定。 */
export interface StateRemoval {
  readonly state: string;
  readonly dead: ProbeHit[];
  readonly alive: ProbeHit[];
  readonly undecided: ProbeHit[];
}

/** {@link loadRemovalProbe} の結果。 */
export interface RemovalProbe {
  readonly states: StateRemoval[];
  readonly dead: DeadClass[];
}

/** 写さないクラス（className とクラスの組）と、それが dead と判定された状態。 */
export interface DeadClass {
  readonly className: string;
  readonly token: string;
  readonly states: string[];
}

export const REMOVAL_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'out', 'removal');

/** 状態の結果の置き場。 */
export function removalFile(state: string, dir = REMOVAL_DIR): string {
  return path.join(dir, `${state}.json`);
}

/**
 * 目録の全状態（`states.ts` の `STATES`）の結果を読み、**写さないクラス**を返す。
 *
 * 読み方: **(className, token) の組が、どの状態のどの要素でも alive にも undecided にも一度も出ず、dead にだけ出るとき**
 * に限って写さない（`dead`）。1 か所でも alive なら、その className を持つどこかで効いているので写す。undecided は
 * 判定できなかった（入れられない状態・覆い・揺れ・組で外すと変わる）ので、写す側へ倒す。
 * 同じ組が状態や要素によって dead と alive の両方に出るもの（`space-y-*`・`text-sm` など）は、この読み方で写す側になる。
 *
 * **目録の状態が 1 つでも欠けていれば throw する**（欠けた状態で alive だったものを dead と読み違えないため）。
 * 目録に無い状態のファイルがあっても throw する（古い目録の残り。消してから流し直す）。
 * `expected` は期待する状態の名前（既定は目録 `STATES` の全状態。自己テストが fixture の名前を渡す）。
 */
export function loadRemovalProbe(
  dir = REMOVAL_DIR,
  expected: readonly string[] = STATES.map((s) => s.name),
): RemovalProbe {
  const missing = expected.filter((name) => !existsSync(removalFile(name, dir)));
  if (missing.length > 0) {
    throw new Error(`除去検査の結果が欠けている状態: ${missing.join(', ')}（-c parity/parity.removal.config.ts で全状態を流し直す）`);
  }
  const known = new Set(expected.map((name) => `${name}.json`));
  const extra = readdirSync(dir).filter((f) => f.endsWith('.json') && !known.has(f));
  if (extra.length > 0) throw new Error(`目録に無い状態の結果がある: ${extra.join(', ')}（古い残り。消してから流し直す）`);

  const states = expected.map((name) => {
    const parsed = JSON.parse(readFileSync(removalFile(name, dir), 'utf8')) as StateRemoval;
    if (parsed.state !== name) throw new Error(`${removalFile(name, dir)} の state が ${parsed.state}`);
    return parsed;
  });
  const key = (h: ProbeHit): string => `${h.className}\u0000${h.token}`;
  const notDead = new Set(states.flatMap((s) => [...s.alive, ...s.undecided].map(key)));
  const dead = new Map<string, DeadClass>();
  for (const s of states) {
    for (const h of s.dead) {
      if (notDead.has(key(h))) continue;
      const entry = dead.get(key(h)) ?? { className: h.className, token: h.token, states: [] };
      if (!entry.states.includes(s.state)) entry.states.push(s.state);
      dead.set(key(h), entry);
    }
  }
  return { states, dead: [...dead.values()] };
}

/** 既知の答え（設計正本 §2 の 4・5）。`className` の語に `owner` を持つ要素の `token` が、`expect` の判定になるはず。 */
export interface KnownAnswer {
  readonly expect: 'dead' | 'alive';
  readonly owner: string;
  readonly token: string;
  readonly why: string;
}

export const KNOWN_ANSWERS: readonly KnownAnswer[] = [
  { expect: 'dead', owner: 'instrument-label', token: 'text-[var(--signal)]', why: '.instrument-label の色に負ける' },
  { expect: 'dead', owner: 'px-6', token: 'px-3', why: 'PrimaryButton の px-6 に負ける' },
  { expect: 'dead', owner: 'px-6', token: 'py-1.5', why: 'PrimaryButton の py-3 に負ける' },
  { expect: 'alive', owner: 'p-6', token: 'sm:p-4', why: 'Card の sm:p-4 は 640〜767px で効く' },
  { expect: 'alive', owner: 'instrument-label', token: 'instrument-label', why: '計器ラベル自身' },
];

export interface KnownAnswerResult {
  readonly answer: KnownAnswer;
  readonly ok: boolean;
  /** 該当した判定の件数（dead・alive・undecided）と、束ねた「写さない」に入ったか。 */
  readonly detail: string;
}

/**
 * 束ねた除去検査の結果に既知の答えを当てる（README の「除去検査」）。該当する要素が 1 つも無ければ ng（空振りを ok にしない）。
 *
 * - dead のはず: どの状態でも alive にも undecided にも出ず、dead に 1 件以上あり、束ねた `dead` に入っている
 * - alive のはず: alive に 1 件以上あり、束ねた `dead` に入っていない
 *
 * `owner` は className を空白で分けた語と完全一致で見る（`md:p-6` を `p-6` と取り違えない）。
 */
export function checkKnownAnswers(probe: RemovalProbe): KnownAnswerResult[] {
  return KNOWN_ANSWERS.map((answer) => {
    const matches = (h: { className: string; token: string }): boolean =>
      h.token === answer.token && h.className.split(/\s+/).includes(answer.owner);
    const count = (pick: (s: StateRemoval) => ProbeHit[]): number =>
      probe.states.reduce((n, s) => n + pick(s).filter(matches).length, 0);
    const dead = count((s) => s.dead);
    const alive = count((s) => s.alive);
    const undecided = count((s) => s.undecided);
    const bundled = probe.dead.some(matches);
    const ok = answer.expect === 'dead' ? dead > 0 && alive === 0 && undecided === 0 && bundled : alive > 0 && !bundled;
    return { answer, ok, detail: `dead ${dead}・alive ${alive}・undecided ${undecided}・写さない ${bundled ? 'に入る' : 'に入らない'}` };
  });
}
