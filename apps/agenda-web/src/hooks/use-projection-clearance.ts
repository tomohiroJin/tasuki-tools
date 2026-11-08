import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * 映す表示の操作帯（fixed・不透明）に、中身の下端が隠れる量だけ、中身の下に余白（`--projection-clearance`・body の margin）を取る（#554）。
 *
 * 帯を出している間だけ、帯の高さの分を無条件に足すと、中身の下端がもともと帯より上にあっても盤の中央寄せがやり直されて、帯が出るたびに盤が跳ねる
 * （390×844 で 80px）。実際に隠れる量（帯の高さ − 中身の下の空き）だけを取れば、隠れないときは 0 で動かない。
 * 隠れるときも盤は動かさない: body の高さを帯の出る前の高さに固定し（`--projection-body-pin`）、余白は body の外の margin で足す（padding だと中央寄せがやり直される）。
 * 帯が出ている（`shown`）か、フォーカスが帯の中にある（CSS の `:focus-within` で帯が見える）間だけ。フォーカスの移動・中身の大きさの変化でも測り直す。
 * 幅の条件は置かない（重なりが 0 なら何も足さないので、帯が中身に重ならない広い画面では動かない。文字を 200% にして重なる広い画面では足す）。ResizeObserver が無い環境（jsdom）では何もしない。
 */
export function useProjectionClearance(
  rootRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
  stripRef: RefObject<HTMLElement | null>,
  shown: boolean,
): void {
  // `shown` は ref で読む（出し入れのたびに observer・focus・matchMedia を作り直さない）。変わったら apply だけを呼び直す
  const shownRef = useRef(shown);
  const applyRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    shownRef.current = shown;
    applyRef.current?.();
  }, [shown]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const strip = stripRef.current;
    if (root === null || body === null || strip === null) return;
    if (typeof ResizeObserver === 'undefined') return;

    const reset = (): void => {
      root.style.setProperty('--projection-clearance', '0px');
      root.style.removeProperty('--projection-body-pin');
    };

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
      reset();
      if (!shownRef.current && !strip.matches(':focus-within')) return;
      const stripHeight = Math.ceil(strip.getBoundingClientRect().height);
      // 余白なしの body の高さ（中央寄せの基準）を固定してから、余白を足す
      const pinned = body.getBoundingClientRect().height;
      let clearance = 0;
      for (let i = 0; i < 4; i += 1) {
        const need = stripHeight - spaceBelowContent();
        if (need <= 0.5) break;
        clearance += Math.ceil(need);
        root.style.setProperty('--projection-body-pin', `${pinned}px`);
        root.style.setProperty('--projection-clearance', `${clearance}px`);
      }
    };

    // 見るもの: 外枠・帯・中身（body とその子の盤）。中身の高さが帯の出ている間に変わっても（長い名前・項目が消える・上端の告知）測り直す。
    let observing: ResizeObserver | null = null;
    let mutations: MutationObserver | null = null;
    let frame: number | null = null;
    const cancelFrame = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const onFocusChange = (): void => {
      cancelFrame();
      frame = requestAnimationFrame(() => {
        frame = null;
        apply();
      });
    };
    const start = (): void => {
      // 最初の通知も飛ばさない（apply から最初の通知までの間の変化を取りこぼさない。apply は冪等）
      const observer = new ResizeObserver(() => apply());
      const watchContent = (): void => {
        observer.observe(body);
        for (const child of Array.from(body.children)) observer.observe(child);
      };
      observer.observe(root);
      observer.observe(strip);
      watchContent();
      const mo = new MutationObserver(() => {
        watchContent();
        apply();
      });
      mo.observe(body, { childList: true });
      // 帯が出ているかの判定は CSS の :focus-within にも依る（Tab で帯へ入ると shown の状態は変わらないのに帯が見える）。フォーカスが動くたびに測り直す
      strip.addEventListener('focusin', onFocusChange);
      strip.addEventListener('focusout', onFocusChange);
      observing = observer;
      mutations = mo;
      applyRef.current = apply;
      apply();
    };
    const stop = (): void => {
      cancelFrame();
      applyRef.current = null;
      observing?.disconnect();
      mutations?.disconnect();
      observing = null;
      mutations = null;
      strip.removeEventListener('focusin', onFocusChange);
      strip.removeEventListener('focusout', onFocusChange);
      root.style.removeProperty('--projection-clearance');
      root.style.removeProperty('--projection-body-pin');
    };

    start();
    return () => {
      stop();
    };
  }, [rootRef, bodyRef, stripRef]);
}
