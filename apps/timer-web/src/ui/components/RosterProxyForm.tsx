/**
 * 代理追加のフォーム（#595 で `RosterPanel.tsx` から出した。中身は変えない）。
 * 受け付けられなかった理由は**この中**に出す（#291）。状態は持たず、呼び出し側（RosterPanel）が持つ。
 */

import { MAX_DISPLAY_NAME } from "@tasuki/room-core";
import type { Rejection } from "../name-request.js";
import { submitOnEnter } from "../submit-on-enter.js";

interface RosterProxyFormProps {
  name: string;
  /** 打ち直した瞬間に理由を降ろすのは呼び出し側（onChange の中）が担う */
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** いまの名簿に照らして有効な拒否の理由（無ければ null） */
  rejection: Rejection | null;
  /** 理由の `aria-describedby` の結び付け先（呼び出し側が useId で作る） */
  errorId: string;
}

export function RosterProxyForm({ name, onChange, onSubmit, rejection, errorId }: RosterProxyFormProps) {
  return (
    <div className="roster-panel-proxy-form">
      <div className="roster-panel-proxy-row">
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={submitOnEnter(onSubmit)}
          placeholder="Web 非接続のメンバー名"
          aria-label="代理参加者の名前"
          maxLength={MAX_DISPLAY_NAME}
          aria-invalid={rejection !== null ? true : undefined}
          aria-describedby={rejection !== null ? errorId : undefined}
          className="ui-input roster-panel-proxy-input"
        />
        <button type="button" onClick={onSubmit} className="ui-button ui-button--secondary ui-button--sm">追加</button>
      </div>
      {rejection !== null && (
        // `role="alert"` にして、目で追っていない人にも即時に読み上げさせる。
        // 色だけで伝えないよう、理由と次の手は文言そのものが持つ（FR-032）。
        // `key` は失敗のたびに進める（同じ文言・同じノードだと再告知されない）。
        <p
          key={rejection.attempt}
          id={errorId}
          role="alert"
          className="roster-panel-error"
        >
          {`「${rejection.typed}」は追加できませんでした。同じ名前の人がすでに居ます。` +
            `所属やイニシャルなどを添えて、呼び分けの付く名前にすると追加できます。`}
        </p>
      )}
    </div>
  );
}
