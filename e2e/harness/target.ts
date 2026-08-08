/**
 * E2E の実行対象（ターゲット）を解決する。
 *
 * ローカルの入口は固定ポートにしている。動的に確保すると、その値を
 * playwright.config.ts へ渡す経路が別途必要になるうえ、ポートの占有検査が
 * そのまま二重起動の排他として使えなくなる。
 */

/** ローカルのハーネスが待ち受ける入口。Caddy がこのポートで listen する。 */
export const LOCAL_BASE_URL = 'http://127.0.0.1:18080';

export interface Target {
  readonly kind: 'local' | 'production';
  readonly baseURL: string;
}

/** ローカル宛と判断するホスト名・IP。本番ターゲットでこれらを見たら事故。 */
const LOCAL_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^\[?::1\]?$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * 環境変数からターゲットを決める。
 *
 * **既定値を持たせない。** 「何も指定しなければローカル」にすると、
 * 本番向けの環境変数が残ったシェルで事故が起きる。
 */
export function resolveTarget(env: Record<string, string | undefined>): Target {
  const kind = env['TASUKI_E2E_TARGET'];
  const rawBaseUrl = env['TASUKI_E2E_BASE_URL']?.trim() ?? '';

  if (kind !== 'local' && kind !== 'production') {
    throw new Error(
      `TASUKI_E2E_TARGET は 'local' か 'production' を指定してください（受け取った値: ${JSON.stringify(kind)}）。` +
        ' ルートから `pnpm e2e` または `pnpm e2e:prod` を実行すると自動で設定されます。',
    );
  }

  if (kind === 'local') {
    if (rawBaseUrl !== '') {
      throw new Error(
        `ローカル実行なのに TASUKI_E2E_BASE_URL が設定されています（${rawBaseUrl}）。` +
          ' 本番向けの変数が残っている可能性があります。`unset TASUKI_E2E_BASE_URL` してください。',
      );
    }
    return { kind: 'local', baseURL: LOCAL_BASE_URL };
  }

  if (rawBaseUrl === '') {
    throw new Error('本番実行には TASUKI_E2E_BASE_URL が必要です（例: https://tasuki.example.com）。');
  }

  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error(`TASUKI_E2E_BASE_URL が URL として解釈できません: ${rawBaseUrl}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`本番は https のみ許可します（受け取った値: ${rawBaseUrl}）。`);
  }
  if (isLocalHost(url.hostname)) {
    throw new Error(
      `本番ターゲットにローカル宛の URL が指定されています: ${rawBaseUrl}。` +
        ' 本番を確認したつもりでローカルを見る事故を防ぐため拒否します。',
    );
  }

  return { kind: 'production', baseURL: rawBaseUrl.replace(/\/+$/, '') };
}
