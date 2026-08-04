# tasks: App.tsx の state/ref 二重管理を解消する（Issue #41）

- [x] T1: characterization test を追加する（`apps/web/test/ui/App.state-ref.test.tsx`）。
      現状の `App.tsx`（4本の ref のまま）に対して緑になることを確認する。
- [x] T2: `roomRef` / `endTypeRef` / `participantIdRef` / `generatingRef` を
      1本の `latestRef`（`useLatestRef({ room, endType, participantId,
      generatingProblem })`）に置き換え、全参照箇所を書き換える。
      T1 のテストが引き続き緑であることを確認する。
- [x] T3: `refactor-safely` の観点（DRY/SOLID/DbC/YAGNI/SoT）で見直した
      （機械的置換に留め、コメントを実態に合わせて更新。詳細は spec.md/plan.md）。
- [x] T4: 親エージェントによるコードレビュー（手順12・差し戻し）に対応した。
      指摘1（二重管理が「解消」されたと言えるか）→ (B) を採用: スコープを
      「同期処理の一元化」に確定し、根本解消（コールバック登録の useEffect 化）は
      別 Issue #46 として起票。spec.md の非対象節・baseline.md に明記。
      指摘2（baseline.md の値の出所が不明瞭）→ 「Issue記載値（誤り・参考）」と
      「実測値」を並記する表に修正済み。
- [x] T5: `pnpm --filter @tasuki/timer-web test`（全件）は親エージェントが実行し
      82ファイル/571件 pass（main基準81/567・characterization test 分の
      +1ファイル/+4件で退行なし）。`typecheck`（4/4 successful）・
      `lint`（3/3 successful）も親エージェントが確認済み。
- [x] T6: `docs/plans/codebase-refactoring/baseline.md` に App.tsx の
      state/ref 実測値（リファクタ前後・Issue記載値との対比）を追記した。
- [x] T7: コミット＆プッシュ、PR 作成（`Closes #41` は使わず、部分対応である旨と
      残作業 Issue #46 を明記）。
- [x] T8: `code-review:code-review` で PR を敵対的検証した。指摘なし
      （PR #47 コメント参照）。https://github.com/tomohiroJin/tasuki-tools/pull/47#issuecomment-5148011373
