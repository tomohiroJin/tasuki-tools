import { useEffect, useState } from 'react';
import { useHubSync } from './hub/use-hub-sync.js';
import { readDepartureNotice } from './hub/departure.js';
import { screenFor } from './hub/hub-state.js';
import { CreateRoom } from './screens/CreateRoom.js';
import { JoinRoom } from './screens/JoinRoom.js';
import { RoomChoice } from './screens/RoomChoice.js';

/**
 * Tasuki の玄関（#95 S5a でハブになった）。
 *
 * **分岐だけを持つ。** 同期は `useHubSync`（LP の同期フックはこの 1 本だけ）、
 * どの画面かの判定は `screenFor`（純粋関数）に置いてある（`docs/adr/0015`・`docs/adr/0019`）。
 *
 * ツール選択そのものを**手札**にしている意匠は変えていない。並ぶのは @tasuki/ui と同じ
 * 象牙の札で、名前の由来である襷掛けを思わせる逆向きの傾きで卓に配ってある。
 */
export function App() {
  const hub = useHubSync();

  // 退出したことの告知（#95 S5c・I-1）。ツールから送り返されるときだけ URL に印が載る。
  //
  // **読み取りと印の始末を分ける。** 読み取りは初期化子（副作用を持たない純粋な読み）、
  // 印を落とすのは effect に置く。初期化子の中で `replaceState` まで済ませると、
  // **`StrictMode` を入れた瞬間に 2 回目の初期化子が印の落ちた URL を読み、告知が消える**
  // （いまの `main.tsx` に `StrictMode` は無いが、入れた日に静かに壊れる形にしない）。
  // `replaceState` は何度呼んでも同じ結果なので、effect が 2 度走っても害は無い。
  const [departure] = useState(() => readDepartureNotice(window.location.href));

  useEffect(() => {
    if (departure.notice === null) return;
    // 印を残すと、再読込のたびに同じ告知が出て「いま外された」と誤って伝わる。
    window.history.replaceState(null, '', departure.cleanedHref);
  }, [departure]);

  switch (screenFor({ code: hub.code, joined: hub.joined })) {
    case 'create':
      return (
        <CreateRoom
          departure={departure.notice}
          defaultDisplayName={hub.defaultDisplayName}
          error={hub.error}
          connection={hub.connection}
          onCreate={hub.createRoom}
        />
      );
    case 'join':
      return (
        <JoinRoom
          departure={departure.notice}
          code={hub.code ?? ''}
          defaultDisplayName={hub.defaultDisplayName}
          error={hub.error}
          needsPassphrase={hub.needsPassphrase}
          connection={hub.connection}
          onJoin={hub.joinRoom}
        />
      );
    case 'choice':
      return (
        <RoomChoice
          code={hub.code ?? ''}
          inviteUrl={hub.inviteUrl ?? ''}
          roster={hub.roster}
          connection={hub.connection}
        />
      );
  }
}
