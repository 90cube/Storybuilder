/** 아주 작은 마크다운 → HTML (## 헤딩 / - 카드 / 빈 줄 문단). 신뢰된 생성물용. */
export function renderMarkdown(text: string): string {
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push("<p>" + para.join(" ") + "</p>"); para = []; } };
  for (const line of (text || "").split("\n")) {
    const t = line.trim();
    if (t.startsWith("## ")) { flush(); out.push(`<h3>${t.slice(3)}</h3>`); }
    else if (t.startsWith("- ")) { flush(); out.push(`<div data-card>${t.slice(2)}</div>`); }
    else if (!t) flush();
    else para.push(t);
  }
  flush();
  return out.join("");
}
