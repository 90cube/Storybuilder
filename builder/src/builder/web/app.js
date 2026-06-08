"use strict";
// 기능1 프론트엔드: 사건 로드 → 앵커 선택 → 신캐/플롯/프롬프트 → 생성 → 분할 뷰.

const $ = (id) => document.getElementById(id);
const state = { before: null, after: null, activeSlot: "before", events: {} };

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
  return r.json();
}

// 아주 작은 마크다운 렌더 (## 헤딩 / 빈 줄 문단 / - 리스트)
function md(text) {
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push("<p>" + para.join(" ") + "</p>"); para = []; } };
  for (const line of (text || "").split("\n")) {
    const t = line.trim();
    if (t.startsWith("## ")) { flush(); out.push(`<h3>${t.slice(3)}</h3>`); }
    else if (t.startsWith("- ")) { flush(); out.push(`<div class="card">${t.slice(2)}</div>`); }
    else if (!t) flush();
    else para.push(t);
  }
  flush();
  return out.join("");
}

function renderEvents() {
  const ul = $("event-list");
  ul.innerHTML = "";
  Object.values(state.events).sort((a, b) => a.sequence - b.sequence).forEach((e) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="ev-title">${e.title}</div><div class="ev-era">${e.id} · ${e.era}</div>`;
    if (state.before === e.id) li.classList.add("before");
    if (state.after === e.id) li.classList.add("after");
    li.onclick = () => { state[state.activeSlot] = e.id; syncAnchors(); };
    ul.appendChild(li);
  });
}

function syncAnchors() {
  $("slot-before").textContent = state.before ? state.events[state.before].title : "미선택";
  $("slot-after").textContent = state.after ? state.events[state.after].title : "미선택";
  document.querySelectorAll(".slot").forEach((s) =>
    s.classList.toggle("active", s.dataset.slot === state.activeSlot));
  renderEvents();
}

function showValidation(v) {
  const cls = v.is_valid ? "ok" : "err";
  const errs = v.errors.length ? ` · 오류: ${v.errors.join("; ")}` : "";
  const warns = v.warnings.length ? ` · 경고: ${v.warnings.join("; ")}` : "";
  $("validation").innerHTML =
    `tbg 검증: <span class="${cls}">${v.is_valid ? "통과 ✓" : "위반 ✗"}</span>${errs}${warns}`;
}

async function generate() {
  if (!state.before || !state.after) { alert("처음/끝 앵커를 모두 선택하세요."); return; }
  $("gen").disabled = true; $("busy").hidden = false;
  $("pane-original").innerHTML = '<div class="placeholder">생성 중…</div>';
  $("pane-inserted").innerHTML = '<div class="placeholder">생성 중…</div>';
  try {
    const d = await api("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        before_id: state.before, after_id: state.after,
        new_character: { name: $("c-name").value, concept: $("c-concept").value, motive: $("c-motive").value },
        plot_key: $("plot").value, system: $("system").value,
      }),
    });
    $("pane-original").innerHTML = md(d.original_story);
    $("pane-inserted").innerHTML = md(d.inserted_story);
    showValidation(d.validation);
  } catch (e) {
    $("pane-inserted").innerHTML = `<div class="placeholder">실패: ${e.message}</div>`;
  } finally {
    $("gen").disabled = false; $("busy").hidden = true;
  }
}

async function init() {
  document.querySelectorAll(".slot").forEach((s) =>
    s.onclick = () => { state.activeSlot = s.dataset.slot; syncAnchors(); });
  $("gen").onclick = generate;

  try {
    const [events, plots, prompt] = await Promise.all([
      api("/api/events"), api("/api/plots"), api("/api/prompt"),
    ]);
    events.forEach((e) => { state.events[e.id] = e; });
    $("plot").innerHTML = plots.map((p) => `<option value="${p.key}">${p.name}</option>`).join("");
    $("system").value = prompt.system;
    $("llm-status").classList.add("on");
    // 데모 기본값: EVT_001 → EVT_002
    if (state.events.EVT_001) state.before = "EVT_001";
    if (state.events.EVT_002) state.after = "EVT_002";
    syncAnchors();
  } catch (e) {
    $("validation").innerHTML = `<span class="err">초기화 실패: ${e.message}</span>`;
  }
}
init();
