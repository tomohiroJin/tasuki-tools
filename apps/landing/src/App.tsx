import { useHubSync } from './hub/use-hub-sync.js';
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

  switch (screenFor({ code: hub.code, joined: hub.joined })) {
    case 'create':
      return (
        <CreateRoom
          defaultDisplayName={hub.defaultDisplayName}
          error={hub.error}
          onCreate={hub.createRoom}
        />
      );
    case 'join':
      return (
        <JoinRoom
          code={hub.code ?? ''}
          defaultDisplayName={hub.defaultDisplayName}
          error={hub.error}
          needsPassphrase={hub.needsPassphrase}
          onJoin={hub.joinRoom}
        />
      );
    case 'choice':
      return <RoomChoice code={hub.code ?? ''} roster={hub.roster} connection={hub.connection} />;
  }
}
