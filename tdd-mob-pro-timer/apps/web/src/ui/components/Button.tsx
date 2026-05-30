/**
 * ボタン（intent ベース・トークン適用・タッチターゲット 44px 確保）
 * intent は背景と文字色がペアで AA を満たすトークンを使う。
 */

import React from "react";

export type ButtonIntent =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "accent"
  | "neutral";
export type ButtonSize = "md" | "sm";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: ButtonIntent;
  size?: ButtonSize;
}

const INTENT_CLASS: Record<ButtonIntent, string> = {
  primary: "bg-primary text-on-primary",
  success: "bg-success text-on-success",
  warning: "bg-warning text-on-warning",
  danger: "bg-danger text-on-danger",
  accent: "bg-accent text-on-accent",
  neutral: "bg-surface-2 text-fg border border-line",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  // 44px / 36px の最小高さでタッチターゲットを確保
  md: "min-h-11 px-4 text-base",
  sm: "min-h-9 px-3 text-sm",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { intent = "primary", size = "md", className = "", type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex items-center justify-center gap-2 rounded-md font-medium
          transition duration-150 hover:brightness-95 active:brightness-90
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg
          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100
          ${INTENT_CLASS[intent]} ${SIZE_CLASS[size]} ${className}`}
        {...rest}
      />
    );
  },
);
