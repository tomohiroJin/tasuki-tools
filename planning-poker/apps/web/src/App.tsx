import { useEffect, useState } from 'react';
import { navigate, parseRoute, roomPath } from './router';
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

  // ルーム作成完了（joined）でトップからルーム画面へ遷移する
  useEffect(() => {
    if (route.name === 'top' && sync.self) {
      navigate(roomPath(sync.self.roomId));
    }
  }, [route, sync.self]);

  if (sync.status === 'closed') {
    return (
      <main className="page">
        <p>サーバーとの接続が切れました。ページを再読み込みしてください。</p>
      </main>
    );
  }

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
          <a href="/poker/">トップへ戻る</a>
        </main>
      );
  }
}
