/**
 * 契約に合わない同期フレームを捨てた印と、ルームに入る前のバナー（#209。#595 で
 * `use-timer-sync.ts` から分けた）。
 *
 * **立てるのは「画面が古くなる棄却」だけ。** 判定は `indicatesStaleRoom` が
 * スキーマの診断（落ちた項目の経路）から行う。サーバーに定期 `snapshot` 配信は
 * 無いため、一度立てると次に誰かが操作するまで下りない。一過性の棄却で立てると
 * 静止したロビーでは警告が延々と残る。
 *
 * **StatusStrip はルームに入るまで描画されない**ので、`room` がまだ無い間だけバナーで補う
 * （この経路が無いと、壊れた値の残ったルームへ入ろうとした人には何も表示されない）。
 * 再読込を促さないのは、継続する棄却の原因がサーバー側のルームに残った値で、
 * 再読込しても直らないため（`docs/timer/adr/0006` の追記）。
 *
 * **`room.join` の答えを待つ期限はここでは畳まない**（#292）。捨てた以上その
 * `snapshot` は届かなかったのと同じで、ルームに入る前ならこの人は先へ進めない。
 * バナーは起きていることを述べるだけなので、次にできることを示すのは期限の側の仕事である。
 */
import { useRef, useState } from "react";
import type { BannerController } from "../ui/use-banner.js";
import { indicatesStaleRoom } from "./stale-frame.js";

/** ルームに入る前に同期フレームを捨てたときの案内（#209）。 */
export const SYNC_STALE_BEFORE_ROOM_TEXT =
  "同期できていません。ルームの状態が読み込めないため、先へ進めません。";

export interface StaleFrameNotice {
  /** 契約に合わないフレームを捨てて以降、新しい状態を受け取れていない。 */
  readonly syncStale: boolean;
  /**
   * フレームを捨てたことを受け取る。`hasRoom` は呼び出した時点のルームの有無
   * （ハンドラを作ったレンダーの値をそのまま渡す）。
   */
  readonly onInvalidFrame: (paths: string[], hasRoom: boolean) => void;
  /**
   * **画面が実際に新しい状態を得た。** ここだけが「古い」の解除点である（#209）。
   * 入る前に自分が出したバナーだけを消す（無条件の clearBanner は他の通知まで消す）。
   */
  readonly onFreshSnapshot: () => void;
  /** ルームを離れた。ルーム由来の警告なので、次の別ルームへ持ち越さない。 */
  readonly reset: () => void;
}

export function useStaleFrameNotice(banner: BannerController): StaleFrameNotice {
  const { show: showBanner, clear: clearBanner } = banner;
  // 契約に合わない同期フレームを捨てて以降、新しい状態を受け取れていない（#209）。
  const [syncStale, setSyncStale] = useState(false);
  // ルームに入る前に出したバナーを、自分が出したときだけ消すための印（#209）。
  const bannerShownRef = useRef(false);

  const onInvalidFrame = (paths: string[], hasRoom: boolean) => {
    if (!indicatesStaleRoom(paths)) return;
    setSyncStale(true);
    if (!hasRoom) {
      bannerShownRef.current = true;
      showBanner(SYNC_STALE_BEFORE_ROOM_TEXT, "warn", { autoDismiss: false });
    }
  };

  const onFreshSnapshot = () => {
    setSyncStale(false);
    if (bannerShownRef.current) {
      bannerShownRef.current = false;
      clearBanner();
    }
  };

  const reset = () => {
    setSyncStale(false);
    bannerShownRef.current = false;
  };

  return { syncStale, onInvalidFrame, onFreshSnapshot, reset };
}
