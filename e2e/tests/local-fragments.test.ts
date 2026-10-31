import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FRAGMENT_SOURCES, WEB_ROOTS } from '../harness/paths';
import { toLocalFragment } from '../harness/site-config';

it('本番断片の接続先と配信元だけを実行用に差し替え、元の内容を保持する', () => {
  const originals = FRAGMENT_SOURCES.map(p => readFileSync(p, 'utf8'));
  const replacements = WEB_ROOTS.map(({ link, dist }) => ({ link, dist }));
  for (const original of originals) {
    const local = toLocalFragment(original, 23456, replacements);
    expect(local).not.toContain('127.0.0.1:8787');
    expect(local).not.toContain('/var/www/');
    let restored = local.replaceAll('127.0.0.1:23456', '127.0.0.1:8787');
    for (const {link, dist} of [...replacements].sort((a,b)=>b.dist.length-a.dist.length)) restored = restored.replaceAll(`"${dist}"`, link);
    expect(restored).toBe(original);
  }
});
