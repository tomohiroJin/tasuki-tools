import { useEffect, useRef, useState } from 'react';
import { navigate, parseRoute, roomPath, topPath } from './router';
import { usePokerSync } from './hooks/useSync';
import { TopPage } from './pages/TopPage';
import { RoomPage } from './pages/RoomPage';

function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.pathname));
  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(location.pathname));
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const sync = usePokerSync();

  // ルーム作成完了（joined）でトップからルーム画面へ 1 回だけ遷移する。
  // 同じルームへの再遷移はしない（戻るボタンでトップに戻れなくなるのを防ぐ）
  const navigatedRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (route.name === 'top' && sync.self && navigatedRoomRef.current !== sync.self.roomId) {
      navigatedRoomRef.current = sync.self.roomId;
      navigate(roomPath(sync.self.roomId));
    }
  }, [route, sync.self]);

  // 切断中は再接続バナーを出しつつ画面は維持する（自動再接続 + トークン復帰。US4）
  const banner = sync.status !== 'open' && (
    <div className="connection-banner">接続中です…（切断された場合は自動で再接続します）</div>
  );

  const page = (() => {
    switch (route.name) {
      case 'top':
        return <TopPage onCreate={sync.createRoom} disabled={sync.status !== 'open'} />;
      case 'room':
        return <RoomPage roomId={route.roomId} sync={sync} />;
      case 'not-found':
        return (
          <main className="page">
            <h1>ページが見つかりません</h1>
            <p>リンクの形式が正しくない可能性があります。</p>
            <a href={topPath()}>トップへ戻る</a>
          </main>
        );
    }
  })();

  return (
    <>
      {banner}
      {page}
    </>
  );
}
