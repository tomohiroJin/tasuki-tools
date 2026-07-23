# デプロイ手順（Tasuki Planning Poker）

サブパス `https://tasuki.niku9.click/poker` で公開する（憲法 追加制約）。
既存サービス（tdd-mob-pro-timer）には手を入れず、別ポート・別 systemd ユニットで同居する。

## 初回セットアップ（サーバー側・1回だけ）

1. Bun をインストール（`/usr/local/bin/bun`）
2. `poker-sync.service` を `/etc/systemd/system/` に配置し、`User=` を運用ユーザーに合わせて修正

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable poker-sync
   ```

3. `Caddyfile.poker` を `/etc/caddy/` に配置し、`tasuki.niku9.click` のサイトブロックに
   `import /etc/caddy/Caddyfile.poker` を追加して `sudo systemctl reload caddy`

## デプロイ（毎回）

```bash
DEPLOY_HOST=user@tasuki.niku9.click ./deploy/deploy.sh
```

やっていること:

1. `pnpm turbo build` — web は `/poker/` ベースの静的ビルド、sync は `bun build --target=bun`
   の単一ファイル（サーバーに node_modules 不要）
2. `apps/web/dist/` → `/opt/tasuki/planning-poker/web/`、`apps/sync/dist/server.js` →
   `/opt/tasuki/planning-poker/sync/server.js` を rsync
3. `poker-sync` サービスを再起動

## デプロイ後の確認（quickstart「5. デプロイ検証」）

- `https://tasuki.niku9.click/poker` で S1（ルーム作成・参加）と S2（秘匿投票・公開）を実施
- 既存サービス（tdd-mob-pro-timer）が引き続き動作していることを確認
- 注意: sync は揮発インメモリのため、サービス再起動で進行中のルームは消える（FR-014 で許容）
