import { useLayoutEffect, type RefObject } from 'react';

/**
 * 映す表示の操作帯（fixed・不透明）に、中身の下端が隠れる量だけ、中身の下に余白（`--projection-clearance`・body の margin）を取る（#554）。
 *
 * 帯を出している間だけ、帯の高さの分を無条件に足すと、中身の下端がもともと帯より上にあっても盤の中央寄せがやり直されて、帯が出るたびに盤が跳ねる
 * （390×844 で 80px）。実際に隠れる量（帯の高さ − 中身の下の空き）だけを取れば、隠れないときは 0 で動かない。
 * 隠れるときも盤は動かさない: body の高さを帯の出る前の高さに固定し（`--projection-body-pin`）、余白は body の外の margin で足す（padding だと中央寄せがやり直される）。
 * 帯が出ていない間は 0。
 * ResizeObserver が無い環境（jsdom）では何もしない（0 のまま）。
 */
export function useProjectionClearance(
  rootRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
  stripRef: RefObject<HTMLElement | null>,
  shown: boolean,
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const strip = stripRef.current;
    if (root === null || body === null || strip === null || typeof ResizeObserver === 'undefined') return;

    const spaceBelowContent = (): number => {
      let bottom = -Infinity;
      for (const child of Array.from(body.children)) {
        const r = child.getBoundingClientRect();
        if (r.height > 0) bottom = Math.max(bottom, r.bottom);
      }
      const bottomInScroll = bottom + root.scrollTop - root.getBoundingClientRect().top;
      return root.scrollHeight - bottomInScroll;
    };

    const apply = (): void => {
      let clearance = 0;
      root.style.setProperty('--projection-clearance', '0px');
      root.style.removeProperty('--projection-body-pin');
      if (shown || strip.matches(':focus-within')) {
        const stripHeight = strip.getBoundingClientRect().height;
        // 余白なしの body の高さ（中央寄せの基準）を固定してから、余白を足す
        const pinned = body.getBoundingClientRect().height;
        for (let i = 0; i < 4; i += 1) {
          const need = stripHeight - spaceBelowContent();
          if (need <= 0.5) break;
          clearance += need;
          root.style.setProperty('--projection-body-pin', `${pinned}px`);
          root.style.setProperty('--projection-clearance', `${clearance}px`);
        }
      }
    };

    apply();
    const observer = new ResizeObserver(() => apply());
    observer.observe(root);
    observer.observe(strip);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--projection-clearance');
      root.style.removeProperty('--projection-body-pin');
    };
  }, [rootRef, bodyRef, stripRef, shown]);
}
