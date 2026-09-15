import { useEffect, useState } from 'react';
import { useHubSync } from './hub/use-hub-sync.js';
import { readDepartureNotice } from './hub/departure.js';
import { screenFor } from './hub/hub-state.js';
import { CreateRoom } from './screens/CreateRoom.js';
import { JoinRoom } from './screens/JoinRoom.js';
import { RoomChoice } from './screens/RoomChoice.js';
import { Resuming } from './screens/Resuming.js';

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
  // 印を落とすのは effect に置く。理由は「壊れるから」ではなく「**初期化子に副作用を
  // 混ぜない**」である —— `replaceState` を初期化子の中で済ませても、いまの React は
  // 壊れない。`StrictMode` は初期化子を 2 度走らせるが、**採られるのは 1 度目の戻り値で
  // 2 度目は捨てられる**ので、2 度目が印の落ちた URL を読んでも表示には影響しない
  // （実測済み。`tests/App.test.tsx` の `StrictMode` のテストは、この理由で
  // 「壊れても赤くならない」と明記してある）。
  //
  // それでも分けるのは、純粋な読みに副作用が混ざっていると、**同じ関数をもう一度
  // 呼ぶことが安全でなくなる**ためである。その性質は
  // `tests/hub/departure.test.ts` の「読みは副作用を持たない」が見張る。
  // `replaceState` は何度呼んでも同じ結果なので、effect が 2 度走っても害は無い。
  const [departure] = useState(() => readDepartureNotice(window.location.href));

  useEffect(() => {
    if (departure.notice === null) return;
    // 印を残すと、再読込のたびに同じ告知が出て「いま外された」と誤って伝わる。
    window.history.replaceState(null, '', departure.cleanedHref);
  }, [departure]);

  switch (screenFor({ code: hub.code, joined: hub.joined, resuming: hub.resuming })) {
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
    case 'resuming':
      // 復帰の返事待ち。**名乗らせない**（#95 S5c 追補）。
      // 告知（`departure`）はここでは出さない —— 待ちは必ず選択画面か参加画面へ
      // 落ちるので、落ちた先で出せば一度だけ読ませられる。
      return <Resuming code={hub.code ?? ''} connection={hub.connection} />;
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
