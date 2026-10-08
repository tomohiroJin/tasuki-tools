import { Markdown } from './Markdown';

interface Props {
  readonly title: string;
  readonly body: string;
}

/**
 * お題の札（#313 正本 D6）。**いまのお題とプレビューの両方がこれを使う。**
 * 片方だけ直すと、このお題にする前と後で見え方がずれる（#313 の不満そのもの）。
 * 空白だけのタイトルの見出しは描かない（プレビューでは書きかけのことがある）。
 */
export function TopicSheet({ title, body }: Props) {
  return (
    <article className="topic-sheet">
      {title.trim() !== '' && <h3 className="topic-title">{title}</h3>}
      {body !== '' && <Markdown source={body} className="topic-body" />}
    </article>
  );
}
