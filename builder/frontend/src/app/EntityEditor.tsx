/** 스키마주도 엔티티 편집기 — editor(Go)의 타입 폼·검증·관계·타임라인·비밀을 Creator로 흡수. */
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Badge, Button, Input } from "../components/primitives";
import type { useCreator, SchemaInfo, SchemaField, EntityRow, EntityFull } from "../lib/useCreator";
import w from "./writer.module.css";

type Api = ReturnType<typeof useCreator>;
type FormVal = Record<string, unknown>;

const asList = (v: unknown): string[] => Array.isArray(v) ? v as string[] : String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function Field({ f, value, onChange }: { f: SchemaField; value: unknown; onChange: (v: unknown) => void }) {
  const common = { className: w.efInput, value: (value ?? "") as string, onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value) };
  if (f.datatype === "text") return <textarea {...common} rows={2} />;
  if (f.datatype === "int") return <input {...common} type="number" />;
  if (f.datatype === "enum") return <select {...common}>{(f.values ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  if (f.datatype === "list")
    return <input className={w.efInput} value={asList(value).join(", ")} placeholder="쉼표로 구분"
      onChange={(e) => onChange(asList(e.target.value))} />;
  return <input {...common} />;
}

export function EntityEditor({ api, projectId, onChanged }: { api: Api; projectId: number | null; onChanged?: () => void }) {
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [type, setType] = useState("character");
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [sel, setSel] = useState<EntityFull | null>(null);
  const [form, setForm] = useState<FormVal>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  // 관계/타임라인/비밀 입력
  const [rel, setRel] = useState({ rel: "제자", to: "" });
  const [tl, setTl] = useState({ era: "", state: "" });
  const [sec, setSec] = useState({ fact: "", reveal_at: "" });

  const typeDef = useMemo(() => schema?.types.find((t) => t.type === type), [schema, type]);

  useEffect(() => { api.getSchema().then(setSchema).catch(() => {}); }, [api.getSchema]);
  const reload = useCallback(() => {
    if (projectId == null) { setRows([]); return Promise.resolve(); }
    return api.listEntitiesByType(type, projectId).then(setRows).catch(() => {});
  }, [api.listEntitiesByType, type, projectId]);
  useEffect(() => { reload(); setSel(null); setForm({}); }, [reload]);

  const startNew = () => { setSel(null); setForm({}); setErr(""); setMsg(""); };
  const open = async (id: string) => {
    const e = await api.getEntityDetail(id);
    setSel(e); setForm({ name: e.name, ...e.data }); setErr(""); setMsg("");
  };
  const setF = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setErr(""); setMsg("");
    if (projectId == null) { setErr("좌측에서 작품을 먼저 선택하세요."); return; }
    try {
      const r = await api.saveEntity(type, form, projectId, sel?.version);
      setMsg(`저장됨 (v${r.version})`); await reload(); await open(r.id); onChanged?.();
    } catch (e) { setErr((e as Error).message); }
  };
  const remove = async () => {
    if (!sel || !window.confirm(`'${sel.name}' 삭제할까요?`)) return;
    await api.deleteEntity(sel.id); startNew(); reload(); onChanged?.();
  };
  const addRel = async () => {
    if (!sel || !rel.to.trim() || projectId == null) return;
    await api.addRelationTyped(sel.name, rel.rel, rel.to.trim(), projectId); setRel({ ...rel, to: "" }); open(sel.id); onChanged?.();
  };
  const addTl = async () => {
    if (!sel || !tl.state.trim()) return;
    await api.addTimeline(sel.id, { era: tl.era, state: tl.state, seq: sel.timeline.length + 1 });
    setTl({ era: "", state: "" }); open(sel.id);
  };
  const addSec = async () => {
    if (!sel || !sec.fact.trim()) return;
    await api.addSecret(sel.id, { fact: sec.fact, reveal_at: sec.reveal_at }); setSec({ fact: "", reveal_at: "" }); open(sel.id);
  };

  return (
    <div className={w.entWrap}>
      {/* 타입 탭 */}
      <div className={w.entTabs}>
        <span className={w.entScope}>
          {projectId == null ? "작품 미선택" : `◆ ${api.projects.find((p) => p.id === projectId)?.title ?? "작품 #" + projectId}`}
        </span>
        {schema?.types.map((t) => (
          <button key={t.type} className={w.entTab} data-on={t.type === type} onClick={() => setType(t.type)}>{t.label}</button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {projectId != null && <>
            <a className={w.entLink} href={`/api/export?project=${projectId}`} target="_blank" rel="noreferrer">JSON 내보내기</a>
            <a className={w.entLink} href={`/api/export/csv?project=${projectId}&table=entities`} target="_blank" rel="noreferrer">CSV</a>
          </>}
        </span>
      </div>
      <div className={w.entBody}>
        {/* 좌: 해당 타입 목록 */}
        <div className={w.entList}>
          <Button onClick={startNew}>＋ 새 {typeDef?.label}</Button>
          {rows.map((r) => (
            <div key={r.id} className={w.entRow} data-on={sel?.id === r.id} onClick={() => open(r.id)}>
              <span className={w.name}>{r.name}</span>
              <span className={w.badge}>v{r.version}</span>
            </div>
          ))}
          {!rows.length && <div className={w.empty}>없음 — ＋로 추가</div>}
        </div>
        {/* 우: 폼 */}
        <div className={w.entForm}>
          {!typeDef ? <div className={w.empty}>스키마 로딩…</div> : (
            <>
              <div className={w.entFormHead}>
                <b>{sel ? sel.name : `새 ${typeDef.label}`}</b>
                {sel && <Badge tone="arcane">v{sel.version}</Badge>}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <Button variant="primary" onClick={save}>{sel ? "수정 저장" : "생성"}</Button>
                  {sel && <Button variant="ghost" onClick={remove}>삭제</Button>}
                </span>
              </div>
              {err && <div className={w.entErr}>⚠ {err}</div>}
              {msg && <div className={w.entMsg}>{msg}</div>}
              <label className={w.efRow}>
                <span className={w.efLbl}>이름 *</span>
                <Input value={(form.name ?? "") as string} onChange={(e) => setF("name", e.target.value)} />
              </label>
              {typeDef.fields.filter((f) => f.key !== "name").map((f) => (
                <label key={f.key} className={w.efRow}>
                  <span className={w.efLbl}>{f.label}{f.required ? " *" : ""}</span>
                  <Field f={f} value={form[f.key]} onChange={(v) => setF(f.key, v)} />
                </label>
              ))}
              {/* 믹스인: 관계·타임라인·비밀 (기존 엔티티에만) */}
              {sel && typeDef.mixins.includes("relations") && (
                <div className={w.entSub}>
                  <div className={w.entSubH}>관계 (양방향 자동)</div>
                  {sel.relations.map((r) => <div key={r.id} className={w.entSubRow}>{r.from_id} —{r.rel}→ {r.to_id}</div>)}
                  <div className={w.entSubAdd}>
                    <select className={w.efInput} value={rel.rel} onChange={(e) => setRel({ ...rel, rel: e.target.value })}>
                      {schema?.relations.map((d) => <option key={d.rel} value={d.rel}>{d.rel}</option>)}
                    </select>
                    <Input value={rel.to} placeholder="상대 이름" onChange={(e) => setRel({ ...rel, to: e.target.value })} />
                    <Button onClick={addRel}>추가</Button>
                  </div>
                </div>
              )}
              {sel && typeDef.mixins.includes("timeline") && (
                <div className={w.entSub}>
                  <div className={w.entSubH}>타임라인</div>
                  {sel.timeline.map((t) => <div key={t.id} className={w.entSubRow}>{t.era} — {t.state}</div>)}
                  <div className={w.entSubAdd}>
                    <Input value={tl.era} placeholder="시대/시점" onChange={(e) => setTl({ ...tl, era: e.target.value })} />
                    <Input value={tl.state} placeholder="상태 변화" onChange={(e) => setTl({ ...tl, state: e.target.value })} />
                    <Button onClick={addTl}>추가</Button>
                  </div>
                </div>
              )}
              {sel && typeDef.mixins.includes("secrets") && (
                <div className={w.entSub}>
                  <div className={w.entSubH}>비밀 / 인지상태</div>
                  {sel.secrets.map((s) => <div key={s.id} className={w.entSubRow}>🔒 {s.fact} {s.reveal_at && <span className={w.muted}>(공개: {s.reveal_at})</span>}</div>)}
                  <div className={w.entSubAdd}>
                    <Input value={sec.fact} placeholder="비밀 사실" onChange={(e) => setSec({ ...sec, fact: e.target.value })} />
                    <Input value={sec.reveal_at} placeholder="공개 시점" onChange={(e) => setSec({ ...sec, reveal_at: e.target.value })} />
                    <Button onClick={addSec}>추가</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
