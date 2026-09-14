import { useState } from 'react';
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
  // **読むのは mount 時の一度きりで、印はその場で落とす** —— 残すと再読込のたびに
  // 同じ告知が出て「いま外された」と誤って伝わる。
  const [departure] = useState(() => {
    const read = readDepartureNotice(window.location.href);
    if (read.notice !== null) window.history.replaceState(null, '', read.cleanedHref);
    return read.notice;
  });

  switch (screenFor({ code: hub.code, joined: hub.joined })) {
    case 'create':
      return (
        <CreateRoom
          departure={departure}
          defaultDisplayName={hub.defaultDisplayName}
          error={hub.error}
          connection={hub.connection}
          onCreate={hub.createRoom}
        />
      );
    case 'join':
      return (
        <JoinRoom
          departure={departure}
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
