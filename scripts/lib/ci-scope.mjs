/**
 * 変更ファイル一覧から走らせる範囲を決める。
 *
 * `code` は「走らせなくてよい条件」の許可リスト（*.md のみ）の否定で決める。
 * 分類の付かないファイルは必ず `code: true` になる。
 *
 * `e2e` に独立したフラグは持たせない（条件は `code` と同じ）。turbo.json・
 * ルート設定・.github/workflows/** はいずれも E2E の挙動を変えうるため、
 * 「利用者の通る経路」を狭く列挙すると必ず取りこぼす。
 *
 * かつては依存の変更を見る `deps` も持っていたが、それを読む `audit` ジョブを
 * CI から外したので消した（#334・`docs/adr/0024`）。
 */
export function decideScope(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { code: true };
  }
  return { code: changedFiles.some((f) => !f.endsWith(".md")) };
}

