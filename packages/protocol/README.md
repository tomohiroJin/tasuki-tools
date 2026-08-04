# @tasuki/protocol

外から来たテキストを、検証済みの値に変える**信頼境界のパース**。

`timer-sync` の WS アダプタと、`poker-core` の `parseClientMessage` / `parseServerMessage`
（poker の sync と web の両方が使う）がこれを共有している。

## 使い方

```ts
import { parseBoundaryMessage } from "@tasuki/protocol";

const parsed = parseBoundaryMessage(CommandSchema, rawText);
if (parsed.isErr()) {
  // parsed.error.stage は "json" | "schema"
  return;
}
parsed.value; // スキーマから推論された型
```

## 失敗の理由は `stage` で返す

**エラーコードや文言をここで決め打ちしない。** 落ちた段だけを返し、利用側が自分の
語彙に割り当てる。

| 段 | 意味 | timer の応答 | poker の応答 |
|---|---|---|---|
| `json` | JSON として解釈できなかった | `INVALID_JSON` | `invalid-message`（文言は「JSON として解釈できません」） |
| `schema` | JSON ではあったが形が違う | `INVALID_COMMAND` | `invalid-message`（文言は「メッセージ形式が不正です」） |

timer はこの 2 つを区別し、poker は 1 つに畳む。共通化のために**どちらかの語彙へ
寄せることはしない**（利用者に見える文言はアプリの決めごとなので）。

## ここに**入れていない**もの

- **WebSocket の土台（ルーム管理・接続・配信）**。timer と poker で
  実装が根本的に違うため。詳細は
  [#20 のコメント](https://github.com/tomohiroJin/tasuki-tools/issues/20) を参照
- **メッセージの定義**。ドメインが別なので、各 core が持つ
