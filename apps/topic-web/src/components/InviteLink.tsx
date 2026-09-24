import { useCopyText } from '@tasuki/invite-ui';
import { INVITE_COPIED, INVITE_COPY_BUTTON, INVITE_COPY_FAILED } from '../copy';

export function InviteLink({ url }: { url: string }) {
  const { state, copy } = useCopyText(url);
  return (
    <div className="topic-invite">
      <span className="topic-invite-url">{url}</span>
      <button type="button" className="secondary" onClick={copy}>
        {state === 'done' && INVITE_COPIED}
        {state === 'failed' && INVITE_COPY_FAILED}
        {state === 'idle' && INVITE_COPY_BUTTON}
      </button>
    </div>
  );
}
