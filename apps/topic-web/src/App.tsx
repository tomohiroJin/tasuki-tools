import { useEffect, useState } from 'react';
import { LoadingView } from './components/LoadingView';
import { TopicRoom } from './screens/TopicRoom';
import { parseRoute, redirectTo } from './router';

export function App() {
  // ルートはページ読み込みで決まる（札からの遷移は全ページ読み込み）。
  const [route] = useState(() => parseRoute(location.pathname, location.search));

  // 行き先の無い URL は玄関へ送る。**判定は `parseRoute`、適用はここ 1 箇所**（`docs/adr/0015`）。
  useEffect(() => {
    if (route.name === 'redirect') redirectTo(route.to);
  }, [route]);

  if (route.name === 'room') return <TopicRoom roomCode={route.roomCode} />;
  return <LoadingView />;
}
