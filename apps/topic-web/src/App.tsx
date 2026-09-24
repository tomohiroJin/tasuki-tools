import { useEffect, useState } from 'react';
import { LoadingView } from './components/LoadingView';
import { parseRoute, hubPathFor, redirectTo } from './router';
import { useTopicSync } from './hooks/use-topic-sync';
import { connectionNotice } from './topic-view';
import { GONE_HEADING } from './copy';

export function App() {
  // ルートはページ読み込みで決まる（札からの遷移は全ページ読み込み）。
  const [route] = useState(() => parseRoute(location.pathname, location.search));

  // 行き先の無い URL は玄関へ送る。**判定は `parseRoute`、適用はここ 1 箇所**（`docs/adr/0015`）。
  useEffect(() => {
    if (route.name === 'redirect') redirectTo(route.to);
  }, [route]);

  if (route.name === 'room') return <TopicRoomDraft roomCode={route.roomCode} />;
  return <LoadingView />;
}

// Task 5 で src/screens/TopicRoom.tsx に置き換える仮置き。
function TopicRoomDraft({ roomCode }: { roomCode: string }) {
  const sync = useTopicSync(roomCode);
  useEffect(() => {
    if (sync.departed !== null) redirectTo(hubPathFor(roomCode, sync.departed));
    else if (sync.needsHub) redirectTo(hubPathFor(roomCode));
  }, [sync.departed, sync.needsHub, roomCode]);
  const notice = connectionNotice(sync);
  if (sync.gone) return <h1>{GONE_HEADING}</h1>;
  return (
    <main className="page">
      {notice.kind !== 'none' && <p role="status">{notice.text}</p>}
      {sync.retryNotice && <p role="status">{sync.retryNotice}</p>}
      {sync.topicState?.topic && <h2>{sync.topicState.topic.title}</h2>}
    </main>
  );
}
