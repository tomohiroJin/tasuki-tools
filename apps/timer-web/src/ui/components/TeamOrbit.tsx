/**
 * チームの円周配置（参考デザイン準拠）
 * メンバーをアバター（頭文字）として円周に並べ、現ドライバーをシグナル朱＋Crown で強調、
 * 次ドライバーを朱の枠線で示す。中心に children（タイマー）を置く。計器の周回目盛りの趣。
 */

import React from "react";
import { Crown } from "lucide-react";
import type { RotationMember } from "../rotation-names.js";
import { SKIP_TEXT } from "../skip-reason-text.js";

interface TeamOrbitProps {
  /** 表示順のメンバー（rotation・識別子＋表示名）。
   *  表示名は同名で衝突しうるため、React の key には識別子を使う。 */
  members: RotationMember[];
  /** 現ドライバーの index */
  currentIndex: number;
  /** 次に実際にドライバーになる席の添字。サーバー権威（#276 D1 / D6）。輪が無い/全席不適格なら null。 */
  nextIndex: number | null;
  size?: number;
  children?: React.ReactNode;
}

export function TeamOrbit({ members, currentIndex, nextIndex, size = 340, children }: TeamOrbitProps) {
  const center = size / 2;
  const avatarSize = 44;
  const orbitRadius = size / 2 - avatarSize / 2 - 6;
  const len = members.length;

  return (
    <div className="team-orbit" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="team-orbit-ring" aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={orbitRadius}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth="1"
          strokeDasharray="2 7"
        />
      </svg>
      <div className="team-orbit-center">{children}</div>
      {/* 1 人だけのときは周回アバターを出さない（文字盤 12 時上に孤立した点が乗るのを避ける）。
          現ドライバーは中央の Crown＋名前で十分に伝わる。複数人で初めて周回を可視化する。 */}
      {len > 1 && members.map(({ participantId, displayName, label, skipReason }, i) => {
        const angle = (i / len) * 2 * Math.PI - Math.PI / 2;
        const x = center + Math.cos(angle) * orbitRadius;
        const y = center + Math.sin(angle) * orbitRadius;
        const isCurrent = i === currentIndex;
        const isNext = nextIndex !== null && i === nextIndex;
        return (
          <div
            key={participantId}
            className={
              skipReason !== null
                ? isCurrent
                  ? "team-orbit-avatar team-orbit-avatar-skipped team-orbit-avatar-current tabular animate-pop-in"
                  : isNext
                    ? "team-orbit-avatar team-orbit-avatar-skipped team-orbit-avatar-next tabular animate-pop-in"
                    : "team-orbit-avatar team-orbit-avatar-skipped team-orbit-avatar-other tabular animate-pop-in"
                : isCurrent
                  ? "team-orbit-avatar team-orbit-avatar-current tabular animate-pop-in"
                  : isNext
                    ? "team-orbit-avatar team-orbit-avatar-next tabular animate-pop-in"
                    : "team-orbit-avatar team-orbit-avatar-other tabular animate-pop-in"
            }
            style={{
              width: avatarSize,
              height: avatarSize,
              left: x - avatarSize / 2,
              top: y - avatarSize / 2,
            }}
            // 番が回らない席は薄く置く。色だけに頼らないよう、文字での説明を title に添える。
            // 語は SKIP_TEXT（`RotationLineup` と共有）から引き、同じ席が周回図と帯で
            // 違う呼ばれ方をしないようにする（`participant-label.ts` と同じ理由）。
            // 現ドライバーの席なら「運転中である」言い方（current）にする（#276 D11）。
            title={
              skipReason !== null
                ? `${label}（${isCurrent ? SKIP_TEXT[skipReason].current : SKIP_TEXT[skipReason].reason}）`
                : label
            }
          >
            {isCurrent && (
              <Crown className="team-orbit-crown" />
            )}
            <span className="team-orbit-initial">{displayName.charAt(0).toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}
