import { useEffect, useState } from 'react';
import { parseRoute, redirectTo } from './router';
import { usePokerSync } from './hooks/useSync';
import { connectionNotice } from './connection-notice';
import { RoomPage } from './pages/RoomPage';

function useRoute() {
  // **`?room=` も見る**（#95 S5b）。選択画面の札は `/poker/?room=CODE` を出す。
  const [route, setRoute] = useState(() => parseRoute(location.pathname, location.search));
  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(location.pathname, location.search));
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const sync = usePokerSync();

  // 行き先の無い URL は玄関へ送る（#95 S5c・R9）。**判定は `parseRoute`、適用はここ 1 箇所**
  // （`docs/adr/0015` MUST 1・MUST 3）。旧入口を撤去したので、ルームコードを伴わない URL に
  // 出せる画面はもう無い ——「ページが見つかりません」も玄関へ吸収された。
  useEffect(() => {
    if (route.name === 'redirect') redirectTo(route.to);
  }, [route]);

  // 切断中は再接続バナーを出しつつ画面は維持する（自動再接続 + トークン復帰。US4）。
  // 繋がらないときは、待っても直らないことと操作できない理由まで伝える（#76 F-2）。
  // 接続が生きていても、契約に合わないフレームを捨てて画面が古いままなら伝える（#212）。
  const notice = connectionNotice({
    status: sync.status,
    everConnected: sync.everConnected,
    failedAttempts: sync.failedAttempts,
    syncStale: sync.syncStale,
  });
  const banner = notice.kind !== 'none' && (
    <div
      className={`connection-banner${notice.kind === 'unreachable' ? ' unreachable' : ''}`}
      role={notice.kind === 'unreachable' ? 'alert' : 'status'}
    >
      {notice.text}
    </div>
  );

  // 送り返している間に出す画面は無い（遷移の完了を待つだけ）。
  const page = route.name === 'room' ? <RoomPage roomId={route.roomId} sync={sync} /> : null;

  return (
    <>
      {banner}
      {page}
    </>
  );
}
