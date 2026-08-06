/**
 * 本番のサイトブロック（deploy/caddy/tasuki.conf）からローカル用を作る。
 *
 * **差し替えるのはアドレス行 1 行だけ。** ドメインと TLS(ACME) はローカルで
 * 再現できないためで、それ以外に理由は無い。header ブロックと
 * `import /etc/caddy/tasuki/apps/*.conf` はそのまま活かす。
 *
 * 断片（deploy/*​/caddy/*.conf）はこの関数を通さない。あちらは内容を
 * 1 バイトも変えずに設置する。
 */

/** 本番のアドレス行。デプロイ時に sed で実ドメインへ置換される前の形。 */
export const PRODUCTION_ADDRESS_LINE = '<公開ドメイン> {';

/**
 * ローカル用のサイトブロックを生成する。
 *
 * @param productionConf `deploy/caddy/tasuki.conf` の内容
 * @param address 待ち受けアドレス（例: `http://127.0.0.1:18080`）
 * @throws アドレス行がちょうど 1 本でないとき
 */
export function toLocalSiteConfig(productionConf: string, address: string): string {
  const lines = productionConf.split('\n');
  const targets = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trimEnd() === PRODUCTION_ADDRESS_LINE);

  if (targets.length !== 1) {
    throw new Error(
      `アドレス行（${PRODUCTION_ADDRESS_LINE}）はちょうど 1 本である必要があります。` +
        `見つかった数: ${targets.length}。deploy/caddy/tasuki.conf の形が変わっていないか確認してください。`,
    );
  }

  const [target] = targets;
  const replaced = [...lines];
  replaced[target!.index] = `${address} {`;
  return replaced.join('\n');
}
