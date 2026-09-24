/**
 * いまのお題（#91・spec §5.5）。**timer は読むだけ**で、変えるのはお題ツールである（spec T4）。
 *
 * 見出しの段: h2「お題」→ h3 タイトル → 本文の見出しは h4 から（`headingBase={4}`）。
 */
import React from "react";
import { Code } from "lucide-react";
import type { Topic } from "@tasuki/topic-core";
import { Card, SectionHeader } from "../primitives.js";
import { Markdown } from "./Markdown.js";

/** 札の見出し。書体の常用の層に収まることを `topic-copy-fits-font-base.test.ts` が見る。 */
export const TOPIC_CARD_HEADING = "お題";

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <Card>
      <section aria-label={TOPIC_CARD_HEADING}>
        <SectionHeader icon={Code} color="text-[var(--signal)]" title={TOPIC_CARD_HEADING} />
        {/* 区切りの無い長いタイトルが横へはみ出さないように折り返す（PR 2 の実画面で topic-web が踏んだ） */}
        <h3 className="text-lg font-bold text-[var(--bone)] [overflow-wrap:anywhere]">{topic.title}</h3>
        {topic.body !== "" && <Markdown source={topic.body} headingBase={4} className="mt-3" />}
      </section>
    </Card>
  );
}
