import { useState } from "react";
import {
  Button, IconButton, Input, Textarea, Select, Chip, Badge,
  Card, Panel, Spinner, Toggle, Divider,
} from "../components/primitives";
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

/** 전 컴포넌트를 한 화면에서 검수하는 갤러리. */
export function Gallery() {
  const aspect = useAspect();
  const [on, setOn] = useState(true);
  const [chip, setChip] = useState(true);

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

      <Section title="Input / Select">
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
          <div className={s.label}>SYSTEM 프롬프트 (mono)</div>
          <Textarea mono rows={4} defaultValue={"너는 〈던전앤파이터(아라드)〉 세계관 전담 서사 작가이자 설정 감수자다.\n원칙: 세계관 정합성 최우선…"} />
        </div>
      </Section>

      <Section title="Chip / Badge">
        <div className={s.row}>
          <Chip on={chip} onClick={() => setChip((v) => !v)}>진범 후보</Chip>
          <Chip>단서</Chip>
          <Chip>흑막</Chip>
          <Chip>동기</Chip>
          <Chip>위장 단서</Chip>
          <Divider vertical />
          <Badge tone="ember">CANON 1.5</Badge>
          <Badge tone="arcane">TEMPORAL ✓</Badge>
          <Badge tone="jade">CONFIDENCE 0.82</Badge>
          <Badge tone="blood">위반</Badge>
        </div>
      </Section>

      <Section title="Card / Panel">
        <div className={s.grid}>
          <Card>
            <h3 style={{ fontSize: "var(--fs-lg)", marginBottom: 6 }}>카르닉스</h3>
            <div className={s.sub}>하급 용족 전사 · 영원수 수호 진영의 마지막 추격자</div>
          </Card>
          <Panel title="tbg 검증" actions={<IconButton aria-label="새로고침">↻</IconButton>}>
            <div className={s.stack}>
              <Badge tone="jade">순환 없음</Badge>
              <Badge tone="jade">모순 없음</Badge>
              <Badge tone="arcane">era 정합</Badge>
            </div>
          </Panel>
        </div>
      </Section>

      <Section title="Spinner / Toggle / Divider">
        <div className={s.row}>
          <Spinner />
          <span className={s.sub}>생성 중…</span>
          <Divider vertical />
          <span className={s.sub}>플롯 전체 적용</span>
          <Toggle on={on} onChange={setOn} />
          <span className={s.sub}>{on ? "ON" : "OFF"}</span>
        </div>
        <Divider />
        <span className={s.sub}>위는 가로 구분선.</span>
      </Section>
    </div>
  );
}
