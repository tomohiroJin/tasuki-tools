/**
 * 操作の面の足に置く記録（#93・spec §5）。64rem 未満だけ見える（64rem 以上は脇が記録を持つ）。
 * 直近の数束だけを出し、残りは下からのシート（`.ui-drawer`・`useReaderDrawer`）に全部出す。
 */
import type { EstimateLogProps } from './EstimateLog';
import { EstimateLog } from './EstimateLog';
import { useReaderDrawer } from '@tasuki/web-kit/reader';
import { ESTIMATE_LOG_HEADING, ESTIMATE_LOG_SHOW_ALL } from '../estimate-copy';
import { CLOSE } from './CurrentTopic';

/** 足に出す束の数。これより多いときだけ「すべて見る」を出す */
export const FOOT_LOG_LIMIT = 3;

const DRAWER_TITLE_ID = 'poker-estimate-drawer-title';

export function EstimateLogFoot({ groups, onSetPoints, disabled }: Pick<EstimateLogProps, 'groups' | 'onSetPoints' | 'disabled'>) {
  const drawer = useReaderDrawer();
  const hasMore = groups.length > FOOT_LOG_LIMIT;
  return (
    <div className="room-log--foot">
      <EstimateLog groups={groups} onSetPoints={onSetPoints} disabled={disabled} limit={FOOT_LOG_LIMIT} />
      {hasMore && (
        <>
          <button
            ref={drawer.triggerRef}
            type="button"
            className="ui-button ui-button--secondary ui-button--sm room-log-more"
            onClick={drawer.open}
          >
            {ESTIMATE_LOG_SHOW_ALL}
          </button>
          <dialog
            ref={drawer.dialogRef}
            className="ui-drawer"
            aria-labelledby={DRAWER_TITLE_ID}
            onClose={drawer.onClose}
          >
            <div className="ui-drawer-head">
              <h3 id={DRAWER_TITLE_ID}>{ESTIMATE_LOG_HEADING}</h3>
              <button type="button" className="ui-button ui-button--secondary ui-button--sm" onClick={drawer.close}>
                {CLOSE}
              </button>
            </div>
            <div className="ui-drawer-body">
              <EstimateLog groups={groups} onSetPoints={onSetPoints} disabled={disabled} showHeading={false} />
            </div>
          </dialog>
        </>
      )}
    </div>
  );
}
