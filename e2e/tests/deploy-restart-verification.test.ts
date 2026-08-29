/**
 * `deploy/deploy.sh` の再起動段が、**起動の失敗を検知して非 0 で終わる**ことを固定する（#146）。
 *
 * 以前の実装は次の 1 行だった。
 *
 *     ssh "$SSH_HOST" "sudo systemctl restart ${SERVICE}; systemctl --no-pager status ${SERVICE} | head -5"
 *
 * `;` 区切りなので `restart` が失敗しても後続が走り、さらに `| head -5` により
 * リモートシェルの終了コードは `head` のもの（ほぼ常に 0）になる。結果として
 * **再起動に失敗しても「完了」と出して正常終了**していた。#103 が「起動しないことで守る」
 * 経路を 3 つ増やしたため、起動失敗を検知できることが前提になっている。
 *
 * ここでは `ssh` / `sudo` / `systemctl` を差し替えた偽の実行環境で
 * `restart_and_verify` を走らせ、終了コードを見る。**systemd の意味論そのものは
 * 再現できない**（このコンテナに systemd は無い）。見ているのは
 * 「リモートの失敗がローカルの終了コードまで伝わるか」という配線である。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot(process.cwd());
const SERVICE = 'tasuki-sync';

/** 偽の実行環境の振る舞い。既定はすべて正常。 */
type Stub = {
  /** `systemctl restart` の終了コード */
  restartExit?: number;
  /** `systemctl is-active --quiet` の終了コード（呼ばれた回数ぶん、順に使う） */
  activeExits?: number[];
  /** `systemctl show -p NRestarts` が返す値（呼ばれた回数ぶん、順に使う） */
  nrestarts?: string[];
};

/**
 * `ssh` / `sudo` / `systemctl` を差し替えた PATH を作り、渡したコマンドを bash で走らせる。
 * 偽の `ssh` は「第 1 引数を接続先として捨て、残りをローカルの bash に流す」だけ。
 */
function withStubs<T>(stub: Stub, fn: (binDir: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'deploy-restart-'));
  const counter = path.join(dir, 'counter');
  const write = (name: string, body: string) =>
    writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });

  write('ssh', 'shift\nexec bash -c "$*"');
  write('sudo', 'exec "$@"');
  write(
    'systemctl',
    [
      // 何回目の呼び出しかを数える。呼び出しごとに違う値を返すために使う。
      `bump() { local k="$1"; local n; n=$(cat "${counter}.$k" 2>/dev/null || echo 0); echo $((n + 1)) > "${counter}.$k"; echo "$n"; }`,
      'args="$*"',
      'case "$args" in',
      `  "restart ${SERVICE}") exit ${stub.restartExit ?? 0} ;;`,
      `  "is-active --quiet ${SERVICE}")`,
      `    i=$(bump active)`,
      `    exits=(${(stub.activeExits ?? [0, 0]).join(' ')})`,
      `    exit "\${exits[$i]:-0}" ;;`,
      `  "show ${SERVICE} --property=NRestarts --value")`,
      `    i=$(bump nrestarts)`,
      `    values=(${(stub.nrestarts ?? ['0', '0']).join(' ')})`,
      `    echo "\${values[$i]:-0}" ;;`,
      `  "--no-pager status ${SERVICE}") echo "● ${SERVICE} (偽の status)" ;;`,
      '  *) echo "想定していない systemctl の呼び出し: $args" >&2; exit 99 ;;',
      'esac',
    ].join('\n'),
  );

  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 偽の実行環境で `restart_and_verify` を走らせる。 */
function runRestartAndVerify(stub: Stub) {
  return withStubs(stub, (binDir) =>
    spawnSync(
      'bash',
      [
        '-c',
        `source "${REPO_ROOT}/deploy/lib/common.sh"
         SSH_HOST=stub-host SERVICE=${SERVICE} SETTLE_SECS=0 restart_and_verify`,
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` } },
    ),
  );
}

describe('deploy.sh の再起動段', () => {
  it('Given 起動し続けるサービス / When 再起動する / Then 終了コードは 0 になる', () => {
    // Given: すべて正常に応じる偽の実行環境（既定）
    // When
    const r = runRestartAndVerify({});
    // Then: 正常なデプロイは従来どおり通る
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0);
  });

  // 失敗の**理由まで**固定する。終了コードだけを見ると、関数が存在しないなどの
  // 別の理由で非 0 になった場合にも通ってしまう（実際、実装前の RED で 3 件が
  // `command not found` によって偶然緑になった）。
  it('Given restart 自体が失敗する / When 再起動する / Then 再起動コマンドの失敗として落ちる', () => {
    // Given: systemctl restart が非 0 を返す
    // When
    const r = runRestartAndVerify({ restartExit: 1 });
    // Then
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('再起動コマンドが失敗');
  });

  it('Given 起動直後に active でない / When 再起動する / Then 起動していないこととして落ちる', () => {
    // Given: 1 回目の is-active が非 0（#103 の fail-closed で即終了した形）
    // When
    const r = runRestartAndVerify({ activeExits: [3, 0] });
    // Then
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('起動していません');
  });

  it('Given しばらくしてから落ちる / When 再起動する / Then 起動後に落ちたこととして落ちる', () => {
    // Given: 1 回目は active、2 回目が非 0
    // When
    const r = runRestartAndVerify({ activeExits: [0, 3] });
    // Then: 1 回だけの確認では通ってしまう形をここで捕まえる
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('起動後に落ちました');
  });

  it('Given active のまま再起動を繰り返す / When 再起動する / Then 再起動の反復として落ちる', () => {
    // Given: 2 回とも active だが NRestarts が増えている（クラッシュループ）
    // When
    const r = runRestartAndVerify({ nrestarts: ['4', '6'] });
    // Then
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('NRestarts 4 → 6');
  });

  it('Given 旧実装の 1 行 / When 同じ偽の環境で走らせる / Then 失敗しても 0 で終わる', () => {
    // Given: `;` 区切りと `| head -5` を持つ以前の形。**この検査が捕まえているのが
    //        確かにこの形である**ことを固定する（対照。緑になれることの確認も兼ねる）
    // When: 起動に失敗する偽の環境で、旧実装と同じ 1 行を走らせる
    const r = withStubs({ activeExits: [3, 3] }, (binDir) =>
      spawnSync(
        'bash',
        [
          '-c',
          `ssh stub-host "sudo systemctl restart ${SERVICE}; systemctl --no-pager status ${SERVICE} | head -5"`,
        ],
        { encoding: 'utf8', env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` } },
      ),
    );
    // Then: 失敗しているのに 0 で終わる（これが #146 の現象）
    expect(r.status).toBe(0);
  });
});
