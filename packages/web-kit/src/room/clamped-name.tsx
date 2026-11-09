/**
 * 行数で省略される名前（席の名前。#555・一覧 #4）。省略されているときだけ、押して（Enter・Space）全文に開ける。
 *
 * - 全文は省略されていても DOM にあるので、読み上げは一度で全文を読む（`title` は付けない。名前と説明で二度読まれる）。
 * - 省略の有無は描いた寸法（`scrollHeight > clientHeight`）で見る。省略されていない名前はただの文字で、タブ停止にしない。
 * - 寸法の見張りは**画面全体で 1 つ**（席ごとに作らない）。書体が届いて行数が変わる（`font-display: swap`）ときは
 *   `document.fonts` の完了で測り直す（ResizeObserver は箱の大きさが変わらない行数の変化では鳴らない）。
 * - 開いたまま幅を変えて閉じても、フォーカスのある要素はボタンのまま残す（フォーカスが body に落ちない）。
 * - 名前（`label`）が変わったら開閉の状態を戻す（`key` で作り直す）。
 *
 * 省略の行数と、開いたときの見え方（`[data-expanded]`）は、呼び出し側の CSS が持つ。
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

type Measure = () => void;

const subscribers = new Map<Element, Measure>();
let observer: ResizeObserver | null = null;

const measureAll = (): void => {
  for (const measure of subscribers.values()) measure();
};

function subscribe(el: Element, measure: Measure): () => void {
  if (subscribers.size === 0) {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) subscribers.get(entry.target)?.();
      });
    }
    // 書体が届いたあと（行数が変わっても箱の大きさは変わらないことがある）に測り直す
    if (typeof document !== 'undefined' && document.fonts !== undefined) {
      document.fonts.addEventListener('loadingdone', measureAll);
    }
  }
  subscribers.set(el, measure);
  observer?.observe(el);
  if (typeof document !== 'undefined' && document.fonts !== undefined) {
    void document.fonts.ready.then(() => {
      if (subscribers.get(el) === measure) measure();
    });
  }
  measure();
  return () => {
    subscribers.delete(el);
    observer?.unobserve(el);
    if (subscribers.size === 0) {
      observer?.disconnect();
      observer = null;
      if (typeof document !== 'undefined' && document.fonts !== undefined) {
        document.fonts.removeEventListener('loadingdone', measureAll);
      }
    }
  };
}

interface Props {
  label: string;
  /** 省略の規則（`line-clamp`）と `[data-expanded]` の見え方を持つクラス */
  className: string;
}

function ClampedNameInner({ label, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  expandedRef.current = expanded;

  const measure = (): void => {
    const el = ref.current;
    // 開いている間は測らない（開くと scrollHeight = clientHeight になり、閉じる手段が消える）
    if (el === null || expandedRef.current) return;
    const next = el.scrollHeight > el.clientHeight + 1;
    // フォーカスのある要素は、省略が無くなってもボタンのまま残す（外れるとフォーカスが body へ落ちる）。ぼかしたあとに測り直す
    if (!next && document.activeElement === el) return;
    setClipped(next);
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    return subscribe(el, () => measureRef.current());
  }, []);
  // 閉じたあと（幅が変わっていることがある）に測り直す
  useEffect(() => {
    if (!expanded) measureRef.current();
  }, [expanded]);

  const toggle = (): void => setExpanded((v) => !v);
  const interactive = clipped || expanded;
  return (
    <span
      ref={ref}
      className={className}
      data-expanded={expanded ? '' : undefined}
      onBlur={() => measureRef.current()}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-expanded': expanded,
            onClick: toggle,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
              }
            },
          }
        : {})}
    >
      {label}
    </span>
  );
}

export function ClampedName({ label, className }: Props) {
  // 名前が変わったら状態を作り直す（開いたまま別の名前になるのを防ぐ）
  return <ClampedNameInner key={label} label={label} className={className} />;
}
