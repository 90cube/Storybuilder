import { renderMarkdown } from "../../lib/md";
import s from "./domain.module.css";

/** 생성된 서사 한 편 렌더 (원본/삽입). */
export function StoryPane({ markdown }: { markdown?: string }) {
  if (!markdown) {
    return <div className={s.story}><div className={s.storyPlaceholder}>생성 전</div></div>;
  }
  return <div className={s.story} dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />;
}
