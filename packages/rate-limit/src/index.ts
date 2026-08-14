// normalizeClientAddress はここから公開しない（生の IP アドレスはこのモジュールの
// 外へ出さない。`docs/adr/0012` D3・`client-key.ts` の docstring を参照）。
// テストは ../src/client-key.js から直接 import する。
export { createClientKeyDeriver } from "./client-key.js";
