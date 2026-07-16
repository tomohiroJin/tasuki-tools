import { useEffect, useState } from 'react';
import { parseRoute } from './router';

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

  switch (route.name) {
    case 'top':
      return <p>Tasuki Planning Poker（トップ画面は US1 で実装）</p>;
    case 'room':
      return <p>ルーム: {route.roomId}（ルーム画面は US1 で実装）</p>;
    case 'not-found':
      return (
        <main>
          <p>ページが見つかりません。リンクの形式が正しくない可能性があります。</p>
          <a href="/poker/">トップへ戻る</a>
        </main>
      );
  }
}
