import { useState } from "react";
import {
  Button, IconButton, Input, Textarea, Select, Chip, Badge,
  Card, Panel, Spinner, Toggle, Divider,
} from "../components/primitives";
import {
  CharacterCard, CausalCanvas, StoryPane, ValidationBar, ChatPanel,
  type ChatMsg, type CanvasEvent, type CanvasEdge,
} from "../components/domain";
import { useAspect } from "../lib/aspect";
import s from "./gallery.module.css";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={s.section}>
      <h2 className={s.secTitle}>{title}</h2>
      {children}
    </section>
  );
}

const DEMO_EVENTS: CanvasEvent[] = [
  { id: "EVT_001", title: "용의 전쟁", era: "상고시기 (마계)", anchor: true },
  { id: "EVT_002", title: "바칼의 천계 지배", era: "상고시기 (천계)", anchor: true },
  { id: "EVT_003", title: "검은 성전", era: "아라드력 247~347년" },
];
const DEMO_EDGES: CanvasEdge[] = [
  { from: "EVT_001", to: "EVT_002" }, { from: "EVT_002", to: "EVT_003" },
];
const DEMO_STORY = "## 삽입 서사 — 카르닉스\n하급 용족 전사 카르닉스는 바칼의 도주를 비겁한 회피로 규정했다. 그는 마력의 잔흔을 쫓아 천계로 진입했다.\n그의 기습은 바칼에게 통제욕을 각인시켰고, 이는 마법 금지령으로 이어졌다.\n## 신규 사건 카드\n- 제목: 마지막 추격자\n- era: 상고시기 (마계→천계)\n- 역할: 후행 앵커의 인과적 근거를 제공";

export function Gallery() {
  const aspect = useAspect();
  const [on, setOn] = useState(true);
  const [chip, setChip] = useState(true);
  const [dropped, setDropped] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: "user", text: "카르닉스를 용의 전쟁과 천계 지배 사이에 끼워줘." },
    { role: "assistant", text: "앵커 고정하고 기승전결로 중간 서사를 생성했습니다. 검토해 주세요." },
  ]);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <div className={s.kicker}>DNF StoryBuilder · Design System</div>
          <h1 className={s.title}>Arcane <em>Codex</em> 컴포넌트</h1>
          <div className={s.sub}>모듈 단위 라이브러리 — 조립 전 검수</div>
        </div>
        <span className={s.aspectTag}><Badge tone="arcane">비율: {aspect}</Badge></span>
      </header>

      <Section title="Button">
        <div className={s.row}>
          <Button variant="primary">이야기 2개 생성</Button>
          <Button>앵커 지정</Button>
          <Button variant="ghost">취소</Button>
          <Button variant="danger">드래프트 반려</Button>
          <Button disabled>비활성</Button>
          <IconButton aria-label="검색">⌕</IconButton>
          <IconButton active aria-label="라인">≣</IconButton>
        </div>
      </Section>

      <Section title="Input / Select / Textarea">
        <div className={s.grid}>
          <Input placeholder="이름 (예: 카르닉스)" />
          <Select defaultValue="kishōtenketsu">
            <option value="tri">긍정·중립·부정</option>
            <option value="kishōtenketsu">기승전결</option>
            <option value="hero12">영웅의 12서사</option>
            <option value="five">발단·전개·위기·절정·결말</option>
          </Select>
          <Input mono placeholder="dfu_id" />
        </div>
        <div style={{ marginTop: 12 }}>
          <div className={s.label}>SYSTEM 프롬프트 (mono, 편집 가능)</div>
          <Textarea mono rows={3} defaultValue={"너는 〈던전앤파이터(아라드)〉 세계관 전담 서사 작가이자 설정 감수자다.\n원칙: 세계관 정합성 최우선…"} />
        </div>
      </Section>

      <Section title="Chip / Badge (추리 역할 · 점수)">
        <div className={s.row}>
          <Chip on={chip} onClick={() => setChip((v) => !v)}>진범 후보</Chip>
          <Chip>단서</Chip><Chip>흑막</Chip><Chip>동기</Chip><Chip>위장 단서</Chip>
          <Divider vertical />
          <Badge tone="ember">CANON 1.5</Badge>
          <Badge tone="arcane">TEMPORAL ✓</Badge>
          <Badge tone="jade">CONFIDENCE 0.82</Badge>
          <Badge tone="blood">위반</Badge>
        </div>
      </Section>

      <Section title="인물 카드 + 인과 캔버스 (드래그앤드롭 · React Flow)">
        <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "stretch", minHeight: 300 }}>
          <Panel title="인물 (드래그)">
            <div className={s.stack}>
              <CharacterCard character={{ id: "c1", name: "카르닉스", role: "하급 용족 전사" }} />
              <CharacterCard character={{ id: "c2", name: "힐더", role: "제1사도" }} />
              <CharacterCard character={{ id: "c3", name: "바칼", role: "폭룡왕" }} />
              {dropped && <Badge tone="jade">드롭됨: {dropped}</Badge>}
            </div>
          </Panel>
          <div style={{ flex: 1, border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
            <CausalCanvas events={DEMO_EVENTS} edges={DEMO_EDGES}
              onDropCharacter={(cid) => setDropped(cid)} />
          </div>
        </div>
      </Section>

      <Section title="스토리 페인 + tbg 검증">
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: 240 }}>
            <div style={{ borderRight: "1px solid var(--line)" }}><StoryPane markdown={"## 원본 서사\n마계 상고시기, 제9사도 바칼은 영원수 독점을 노려 전쟁을 일으켰으나 패배해 천계로 도주했다.\n그는 천계를 점령하고 마법 금지령과 하늘성 봉인으로 고립 제국을 세웠다."} /></div>
            <StoryPane markdown={DEMO_STORY} />
          </div>
          <ValidationBar v={{ is_valid: true, errors: [], warnings: [] }} />
        </div>
      </Section>

      <Section title="채팅 (HITL)">
        <div style={{ height: 260, border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
          <ChatPanel messages={chat}
            onSend={(t) => setChat((c) => [...c, { role: "user", text: t },
              { role: "assistant", text: "반영해 재생성했습니다." }])} />
        </div>
      </Section>

      <Section title="Card / Spinner / Toggle">
        <div className={s.row}>
          <Card><b>카르닉스</b><div className={s.sub}>하급 용족 전사</div></Card>
          <Spinner /><span className={s.sub}>생성 중…</span>
          <Divider vertical />
          <span className={s.sub}>플롯 전체 적용</span>
          <Toggle on={on} onChange={setOn} /><span className={s.sub}>{on ? "ON" : "OFF"}</span>
        </div>
      </Section>
    </div>
  );
}
