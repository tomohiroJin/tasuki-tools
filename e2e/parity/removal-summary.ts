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
 */
export function loadRemovalProbe(dir = REMOVAL_DIR): { readonly states: StateRemoval[]; readonly dead: DeadClass[] } {
  const expected = STATES.map((s) => s.name);
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
