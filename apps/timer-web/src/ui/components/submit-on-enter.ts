import type React from "react";

/** Enter で送る（レビュー指摘4）。閉じずにその場で直させる形にした以上、直後の自然な操作はこれ。 */
export const submitOnEnter = (submit: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  submit();
};
