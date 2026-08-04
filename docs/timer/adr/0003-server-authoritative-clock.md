# ADR-0003: サーバー権威 ServerClock と時刻導出

- **ステータス**: Accepted
- **関連要件**: FR-003, FR-006, FR-007, SC-001, SC-002, SC-004

## 背景

「全参加者が同一の残り時間を見る」ことが本ツールの核です（端末間差は ±1 秒以内）。各端末が
自分のローカル時計でカウントダウンすると、時計ずれ・タブのスロットリング・再描画タイミングの違いで
端末間の表示がずれます。また一時停止を挟んだ所要時間を正確に測る必要があります（停止時間を除外）。

## 決定

時刻系を集約内の **`ServerClock`** に一本化し、残り時間・経過時間は状態から**導出**します。
クライアントは導出のみで、ローカル時計でカウントを進めません。

- `ServerClock` は `running`・`intervalSeconds`・`anchorServerTime`・`secondsLeftAtAnchor`・
  `accumulatedElapsedMs`・`runningSince` を保持。
- 残り時間 = `secondsLeftAtAnchor − (now + offset − anchorServerTime)/1000`（稼働中）。
- 経過時間 = `accumulatedElapsedMs + (稼働中なら now + offset − runningSince)`。停止中の時間を含まない。
- `offset`（clockOffset）は接続時の `time.ping`/`time.pong` 往復の中央値から推定。
- サーバーは **1 本の `setTimeout`** で「次の交代」だけを待つ（1Hz の TICK は持たない）。

## 影響

- **利点**: 全端末が同一スナップショットの clock から導出するため、決定論的に残り時間が一致する
  （テストでは差 0）。一時停止の所要時間除外が `accumulatedElapsedMs` の確定加算で自然に表現できる。
  1Hz TICK を廃したことでネットワーク/CPU 負荷が小さい。
- **代償**: クライアントは表示更新のために自前の再描画ループ（本実装では 250ms ごとの再レンダリング）が
  必要。これは「権威ある残り時間」ではなく「導出値の再表示」であり、状態は変えない。
- 実装上の教訓: フロントの `Session` は `now` を render 時に一度だけ評価していたため、再描画が
  起きないとカウントが進まない不具合があった。`setInterval` による定期再評価で解消済み。
