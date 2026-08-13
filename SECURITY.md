# セキュリティ

Tasuki は個人開発のツール集です。専任の窓口はありませんが、報告は歓迎します。

## 報告のしかた

**公開の Issue には書かないでください。** GitHub の Security Advisories から
非公開で報告してください。

## 対象と対象外

| 対象 | 対象外 |
|---|---|
| 同期サーバー（`apps/timer-sync` / `apps/poker-sync`） | 依存ライブラリの既知の脆弱性（`pnpm audit` が CI で見ています） |
| 配信設定（`deploy/`） | 自己ホストした環境の設定ミス |
| 資格情報・秘密の露出 | ルームコードを知る人が入室できること（設計上の仕様です） |

## 設計上の前提

このサービスは**共有状態を永続化しません**。サーバーの再起動でルームは消えます。
何を秘密として扱い、どう守るかは
[`docs/adr/0011`](./docs/adr/0011-threat-model-and-data-classification.md) と
[`docs/adr/0012`](./docs/adr/0012-logging-secrets-and-disclosure.md) に記録しています。

## 応答について

個人の余暇で運用しているため、応答までに時間がかかることがあります。
