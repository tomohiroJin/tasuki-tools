import { TOOLS } from "./tools.js";
import { ToolMark } from "./ToolMark.js";

/**
 * Tasuki の玄関。
 *
 * ツール選択そのものを**手札**にしている。並ぶのは @tasuki/ui と同じ象牙の札で、
 * 名前の由来である襷掛けを思わせる逆向きの傾きで卓に配ってある。
 * 手をかざすと札が起き上がって前に出る（選ぼうとしている札が読める）。
 */
export function App() {
  return (
    <main className="page landing">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <p className="tagline">
          チームで開発を回すための道具。
          <br />
          カードを選んでください。
        </p>
      </header>

      <ul className="hand" aria-label="ツール">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <a className="card tool-card" href={tool.href} data-label={tool.pip}>
              <ToolMark kind={tool.mark} />
              <span className="tool-name">{tool.name}</span>
              <span className="tool-summary">{tool.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
