// Storybuilder Lore Graph Editor - SPA Application Logic

let schema = { base: [], types: [] };
let relationTypes = [];
let currentEntityId = null;
let currentEntityVersion = 1;
let currentSelectedTargetIdInModal = null;
let isRegisterMode = false;
let cyInstance = null;
let isGraphDockOpen = false;

// Toast System
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Check logged in user status on load
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const user = await res.json();
      onLoginSuccess(user);
    } else {
      showLoginScreen(true);
    }
  } catch (err) {
    showLoginScreen(true);
  }
}

function showLoginScreen(show) {
  const overlay = document.getElementById('login-overlay');
  overlay.style.display = show ? 'flex' : 'none';
  if (show) {
    document.getElementById('app').style.display = 'none';
    isRegisterMode = false;
    updateLoginUI();
  }
}

function updateLoginUI() {
  const desc = document.getElementById('login-title-desc');
  const pinContainer = document.getElementById('pin-field-container');
  const submitBtn = document.getElementById('login-submit-btn');
  const toggleText = document.getElementById('login-toggle-text');
  const toggleLink = document.getElementById('login-toggle-link');

  if (isRegisterMode) {
    desc.textContent = '신규스토리 작가 ID 등록';
    pinContainer.style.display = 'none';
    submitBtn.textContent = '계정 생성하기';
    toggleText.textContent = '이미 계정이 있으신가요?';
    toggleLink.textContent = '로그인하러 가기';
  } else {
    desc.textContent = '사내 스토리 데이터베이스용 PIN 인증';
    pinContainer.style.display = 'block';
    submitBtn.textContent = '로그인';
    toggleText.textContent = '계정이 없으신가요?';
    toggleLink.textContent = '계정 등록하기';
  }
}

// Toggle register/login mode
document.getElementById('login-toggle-link').onclick = () => {
  isRegisterMode = !isRegisterMode;
  updateLoginUI();
};

// Login/Register Submit
document.getElementById('login-submit-btn').onclick = async () => {
  const idInput = document.getElementById('login-id').value.trim();
  const pinInput = document.getElementById('login-pin').value.trim();

  if (!idInput) {
    showToast('ID를 입력해 주세요.', 'error');
    return;
  }

  if (isRegisterMode) {
    // Register flow
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idInput })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('계정이 등록되었습니다. 초기 PIN은 000000 입니다. 로그인해 주세요.');
        isRegisterMode = false;
        updateLoginUI();
      } else {
        showToast(data.error || '등록 실패', 'error');
      }
    } catch (err) {
      showToast('서버 연결 실패', 'error');
    }
  } else {
    // Login flow
    if (!pinInput) {
      showToast('PIN 번호를 입력해 주세요.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idInput, pin: pinInput })
      });
      const data = await res.json();
      if (res.ok) {
        onLoginSuccess(data);
      } else {
        showToast(data.error || '로그인 실패', 'error');
      }
    } catch (err) {
      showToast('서버 연결 실패', 'error');
    }
  }
};

function onLoginSuccess(user) {
  showLoginScreen(false);
  document.getElementById('app').style.display = 'flex';
  document.getElementById('logged-user-name').textContent = user.id;
  
  if (user.must_change_pin) {
    document.getElementById('pin-change-overlay').style.display = 'flex';
  }

  // Load app data
  initApp();
}

// PIN Change Submit
document.getElementById('pin-change-btn').onclick = async () => {
  const oldPin = document.getElementById('pin-old').value.trim();
  const newPin = document.getElementById('pin-new').value.trim();
  const confirmPin = document.getElementById('pin-confirm').value.trim();

  if (!oldPin || !newPin || !confirmPin) {
    showToast('모든 PIN 항목을 채워주세요.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_pin: oldPin, new_pin: newPin, confirm_pin: confirmPin })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('PIN 비밀번호가 정상적으로 변경되었습니다.');
      document.getElementById('pin-change-overlay').style.display = 'none';
    } else {
      showToast(data.error || 'PIN 변경 실패', 'error');
    }
  } catch (err) {
    showToast('서버 연결 실패', 'error');
  }
};

// Logout Submit
document.getElementById('logout-btn').onclick = async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
    showToast('로그아웃 되었습니다.');
    showLoginScreen(true);
  } catch (err) {
    showLoginScreen(true);
  }
};

// Initialize Application Data
async function initApp() {
  await loadSchema();
  await loadRelationsMeta();
  refreshList();
}

async function loadSchema() {
  try {
    schema = await (await fetch('/api/schema')).json();
    
    // Fill filter type and form type select boxes
    const filterType = document.getElementById('filterType');
    const formType = document.getElementById('form-type-select');
    
    // Clear dynamic options
    filterType.innerHTML = '<option value="">전체 유형</option>';
    formType.innerHTML = '<option value="">유형 선택...</option>';
    
    for (const t of schema.types) {
      filterType.add(new Option(t.label || t.type, t.type));
      formType.add(new Option(t.label || t.type, t.type));
    }
  } catch (err) {
    showToast('스키마 정보를 읽지 못했습니다.', 'error');
  }
}

async function loadRelationsMeta() {
  try {
    relationTypes = await (await fetch('/api/relations')).json();
    const select = document.getElementById('rel-type-select');
    select.innerHTML = '<option value="">관계 유형 선택...</option>';
    for (const r of relationTypes) {
      select.add(new Option(`${r.rel} ⇆ ${r.inverse}`, r.rel));
    }
  } catch (err) {
    showToast('관계 정의 테이블을 읽지 못했습니다.', 'error');
  }
}

let allEntitiesCache = null;

// Fetch and render entity list
async function refreshList(selectId = null) {
  const q = document.getElementById('search').value.toLowerCase();
  const type = document.getElementById('filterType').value;
  const review = document.getElementById('filterReview').checked;

  try {
    const container = document.getElementById('list');
    
    // Show skeleton if fetching for the first time
    if (allEntitiesCache === null) {
      container.innerHTML = Array.from({length: 12}).map(() => `
        <div class="skeleton-row">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      `).join('');
      allEntitiesCache = await (await fetch(`/api/entities?q=&type=&review=0`)).json();
    }
    
    // JS Memory Filter
    let list = allEntitiesCache;
    if (q) list = list.filter(e => e.name.toLowerCase().includes(q));
    if (type) list = list.filter(e => e.type === type);
    if (review) list = list.filter(e => e.review_needed);

    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; font-size:12px; color:var(--text-muted);">검색 결과가 없습니다.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const row = document.createElement('div');
      row.className = `entity-row stagger-enter ${currentEntityId === e.id ? 'active' : ''}`;
      
      // Delay up to ~1초까지만 (너무 길면 유저가 답답함)
      const delay = Math.min(i * 0.03, 1.0); 
      row.style.animationDelay = `${delay}s`;
      
      row.innerHTML = `
        <div class="entity-info">
          <span class="entity-name">${escapeHTML(e.name)}</span>
          <span class="entity-type">${escapeHTML(e.type)}</span>
        </div>
        ${e.review_needed ? '<span class="badge-review">검토</span>' : ''}
      `;
      
      row.onclick = () => showEntity(e.id);
      fragment.appendChild(row);
    }
    container.appendChild(fragment);

    // Restore selection if applicable
    if (selectId) {
      const rows = container.querySelectorAll('.entity-row');
      rows.forEach(r => {
        // Simple scan
      });
    }
  } catch (err) {
    showToast('엔티티 목록 리프레시 실패', 'error');
  }
}

document.getElementById('search').oninput = () => refreshList();
document.getElementById('filterType').onchange = () => refreshList();
document.getElementById('filterReview').onchange = () => refreshList();

// Show entity details card
async function showEntity(id) {
  currentEntityId = id;
  
  // Highlight active row in sidebar
  const rows = document.querySelectorAll('.entity-row');
  rows.forEach(r => r.classList.remove('active'));
  refreshListState();

  try {
    const data = await (await fetch(`/api/entity/${encodeURIComponent(id)}`)).json();
    if (!data.entity) {
      showToast('엔티티 정보를 읽지 못했습니다.', 'error');
      return;
    }

    const ent = data.entity;
    currentEntityVersion = ent.Version;

    // Show Detail Card Panel, Hide others
    showMain('detailView');

    // Render detailed card headers
    document.getElementById('detail-name').innerHTML = `${escapeHTML(ent.Name)} ${ent.ReviewNeeded ? '<span class="badge-review">검토 필요</span>' : ''}`;
    document.getElementById('detail-id').textContent = ent.ID;
    document.getElementById('detail-type').textContent = ent.Type;

    // Render attributes grid dynamically
    const attrsContainer = document.getElementById('detail-attrs');
    attrsContainer.innerHTML = '';

    // Load active schema fields for this type
    const td = schema.types.find(x => x.type === ent.Type) || { fields: [] };
    const fields = [...schema.base, ...td.fields];

    fields.forEach(f => {
      if (f.system) return; // Skip systems
      
      let val = '';
      if (f.key === 'name') val = ent.Name;
      else if (ent.Data && ent.Data[f.key] !== undefined) {
        if (f.datatype === 'list') {
          val = Array.isArray(ent.Data[f.key]) ? ent.Data[f.key].join(', ') : ent.Data[f.key];
        } else {
          val = ent.Data[f.key];
        }
      }

      const isEmpty = !val || val.length === 0;
      const attrItem = document.createElement('div');
      attrItem.className = 'attr-item' + (isEmpty ? ' attr-empty' : '');
      
      const btnText = isEmpty ? '입력하기' : '수정';

      // 이미지 필드는 썸네일로 (클릭 시 미리보기)
      let valHTML = escapeHTML(val || '-');
      if (f.key === 'images' && ent.Data && Array.isArray(ent.Data.images) && ent.Data.images.length) {
        valHTML = '<div class="img-thumbs">' + ent.Data.images.map(p =>
          `<img class="img-thumb" loading="lazy" src="/${encodeURI(p)}" data-src="/${encodeURI(p)}" title="${escapeHTML(p)}">`
        ).join('') + '</div>';
      }

      attrItem.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div class="attr-label" style="margin-bottom:0;">${escapeHTML(f.label || f.key)}</div>
          <button class="inline-edit-btn" data-key="${f.key}">${btnText}</button>
        </div>
        <div class="attr-value" id="attr-val-${f.key}">${valHTML}</div>
        <div class="inline-edit-form" id="inline-form-${f.key}" style="display:none; margin-top:8px;">
          ${f.datatype === 'text' 
            ? `<textarea class="input-glow" id="inline-input-${f.key}" style="width:100%; font-size:12px; padding:6px; min-height:60px;">${escapeHTML(val)}</textarea>` 
            : `<input type="text" class="input-glow" id="inline-input-${f.key}" value="${escapeHTML(val)}" style="width:100%; font-size:12px; padding:6px;">`}
          <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:6px;">
            <button class="btn-secondary inline-cancel-btn" data-key="${f.key}" style="padding:4px 8px; font-size:11px;">취소</button>
            <button class="btn-primary inline-save-btn" data-key="${f.key}" style="padding:4px 8px; font-size:11px;">저장</button>
          </div>
        </div>
      `;
      attrsContainer.appendChild(attrItem);
    });

    // 이미지 썸네일 클릭 → 미리보기(라이트박스)
    attrsContainer.querySelectorAll('.img-thumb').forEach(img => {
      img.onclick = () => openLightbox(img.dataset.src);
    });

    // Bind inline edit events
    attrsContainer.querySelectorAll('.inline-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        document.getElementById(`attr-val-${key}`).style.display = 'none';
        btn.style.display = 'none';
        document.getElementById(`inline-form-${key}`).style.display = 'block';
      };
    });

    attrsContainer.querySelectorAll('.inline-cancel-btn').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        document.getElementById(`attr-val-${key}`).style.display = 'block';
        attrsContainer.querySelector(`.inline-edit-btn[data-key="${key}"]`).style.display = 'block';
        document.getElementById(`inline-form-${key}`).style.display = 'none';
      };
    });

    attrsContainer.querySelectorAll('.inline-save-btn').forEach(btn => {
      btn.onclick = async () => {
        const key = btn.dataset.key;
        const newVal = document.getElementById(`inline-input-${key}`).value;
        await saveInlineData(currentEntityId, key, newVal);
      };
    });

    // Render tags
    const tagsSection = document.getElementById('detail-tags-section');
    const tagsContainer = document.getElementById('detail-tags');
    tagsContainer.innerHTML = '';
    if (ent.Tags && ent.Tags.length > 0) {
      tagsSection.style.display = 'block';
      ent.Tags.forEach(t => {
        const badge = document.createElement('span');
        badge.className = 'badge-tag';
        badge.textContent = t;
        tagsContainer.appendChild(badge);
      });
    } else {
      tagsSection.style.display = 'none';
    }

    // Render relations chips
    const relsContainer = document.getElementById('detail-relations');
    relsContainer.innerHTML = '';
    if (data.relations && data.relations.length > 0) {
      data.relations.forEach(r => {
        const chip = document.createElement('div');
        chip.className = 'relation-chip';
        chip.innerHTML = `
          <span style="font-weight: 500;">${escapeHTML(r.Rel)}</span>
          <span>→</span>
          <span style="border-bottom: 1px dashed rgba(255,255,255,0.4);">${escapeHTML(r.ToName || r.ToID)}</span>
          <button class="relation-delete-btn" title="관계 삭제">&times;</button>
        `;
        
        // Navigation on relationship click
        chip.querySelector('span:nth-child(3)').onclick = (evt) => {
          evt.stopPropagation();
          showEntity(r.ToID);
        };

        // Delete relation on click
        chip.querySelector('.relation-delete-btn').onclick = async (evt) => {
          evt.stopPropagation();
          if (confirm(`관계 [${r.Rel}: ${r.ToID}]를 삭제하시겠습니까?`)) {
            try {
              const res = await fetch(`/api/relation/${r.PairID}`, { method: 'DELETE' });
              if (res.ok) {
                showToast('관계가 정상적으로 해제되었습니다.');
                showEntity(id); // Reload
              } else {
                const err = await res.json();
                showToast(err.error || '관계 삭제 실패', 'error');
              }
            } catch (e) {
              showToast('서버 삭제 요청 오류', 'error');
            }
          }
        };
        relsContainer.appendChild(chip);
      });
    } else {
      relsContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:4px;">설정된 관계망 연결이 없습니다.</div>';
    }

    if (isGraphDockOpen) {
      renderGraph(currentEntityId, ent.Name, data.relations || []);
    }

    // Render timeline entries
    const timelineSection = document.getElementById('detail-timeline-section');
    const timelineContainer = document.getElementById('detail-timeline');
    timelineContainer.innerHTML = '';
    if (data.timeline && data.timeline.length > 0) {
      timelineSection.style.display = 'block';
      data.timeline.forEach(t => {
        const node = document.createElement('div');
        node.className = 'timeline-node';
        
        let traitBadges = '';
        if (t.Traits && t.Traits.length > 0) {
          traitBadges = `<div class="timeline-traits">` + 
            t.Traits.map(tr => `<span class="badge-trait">${escapeHTML(tr)}</span>`).join('') + 
            `</div>`;
        }

        node.innerHTML = `
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-meta">
              <span class="timeline-era">${escapeHTML(t.Era || 'Default Era')}</span>
              <span>사건 참조: ${escapeHTML(t.EventRef || '-')}</span>
              <span>소스: ${escapeHTML(t.Source || '-')}</span>
            </div>
            <div class="timeline-event-name">${escapeHTML(t.Phase || '-')}</div>
            <div class="timeline-state">${escapeHTML(t.State || '-')}</div>
            ${traitBadges}
          </div>
        `;
        timelineContainer.appendChild(node);
      });
    } else {
      timelineSection.style.display = 'none';
    }

    // Render secrets
    const secretsSection = document.getElementById('detail-secrets-section');
    const secretsContainer = document.getElementById('detail-secrets');
    secretsContainer.innerHTML = '';
    if (data.secrets && data.secrets.length > 0) {
      secretsSection.style.display = 'block';
      data.secrets.forEach(s => {
        const item = document.createElement('div');
        item.className = 'secret-item';
        
        item.innerHTML = `
          <div class="secret-header">
            <div class="secret-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              비밀코드: ${escapeHTML(s.FactID)}
            </div>
            <svg class="secret-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div class="secret-body">
            <div style="font-weight:600; color:var(--text-main); margin-bottom:8px;">${escapeHTML(s.Summary)}</div>
            <div style="margin-top:10px; display:flex; flex-direction:column; gap:4px; font-size:11px;">
              <div>독자 노출 시점: <span style="color:var(--color-secondary);">${escapeHTML(s.RevealAt || '미노출')}</span></div>
              <div>인지 중인 대상: <span style="color:var(--color-primary-hover);">${escapeHTML(s.KnownBy ? s.KnownBy.map(k => `${k.entity_id} (${k.awareness})`).join(', ') : '-')}</span></div>
              <div>비밀을 숨긴 대상: <span style="color:var(--color-danger);">${escapeHTML(s.HiddenFrom ? s.HiddenFrom.join(', ') : '-')}</span></div>
              <div>연관 사건 사슬: <span>${escapeHTML(s.RelatedEvents ? s.RelatedEvents.join(', ') : '-')}</span></div>
            </div>
          </div>
        `;
        
        // Setup toggle collapse
        item.querySelector('.secret-header').onclick = () => {
          item.classList.toggle('open');
        };
        
        secretsContainer.appendChild(item);
      });
    } else {
      secretsSection.style.display = 'none';
    }

  } catch (err) {
    console.error('showEntity error:', err);
    showToast('엔티티 조회 중 심각한 에러 발생: ' + err.message, 'error');
  }
}

function refreshListState() {
  const rows = document.querySelectorAll('.entity-row');
  rows.forEach(r => {
    // Simple lookups
  });
}

// Add/Edit Form Actions
const entityForm = document.getElementById('entity-form');
const formTypeSelect = document.getElementById('form-type-select');

// Click New Entity
document.getElementById('newEntityBtn').onclick = () => {
  currentEntityId = null;
  
  // Show Form Panel, Hide others
  showMain('formView');

  document.getElementById('form-title').textContent = '신규 엔티티 등록';
  document.getElementById('form-id-group').style.display = 'block';
  document.getElementById('f_id').value = '';
  document.getElementById('f_id').required = true;
  formTypeSelect.disabled = false;
  formTypeSelect.value = '';

  document.getElementById('form-fields-container').innerHTML = '';
  document.getElementById('f_review_needed').checked = false;
};

// Render form inputs dynamically on type change
formTypeSelect.onchange = () => {
  const container = document.getElementById('form-fields-container');
  container.innerHTML = '';
  const selectedType = formTypeSelect.value;
  if (!selectedType) return;

  const td = schema.types.find(x => x.type === selectedType) || { fields: [] };
  const fields = [...schema.base, ...td.fields];

  fields.forEach(f => {
    if (f.system) return; // Skip systems (id, type, provenance)
    if (f.key === 'id' || f.key === 'type') return;

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = f.label || f.key;
    if (f.required) label.className = 'req';

    let input;
    if (f.datatype === 'text') {
      input = document.createElement('textarea');
      input.className = 'input-glow';
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'input-glow';
    }

    input.id = 'form-field-' + f.key;
    input.dataset.key = f.key;
    input.dataset.required = f.required ? '1' : '0';
    input.dataset.base = schema.base.includes(f) ? '1' : '0';

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  });
};

// Edit Entity click
document.getElementById('edit-entity-btn').onclick = async () => {
  if (!currentEntityId) return;

  try {
    const data = await (await fetch(`/api/entity/${encodeURIComponent(currentEntityId)}`)).json();
    const ent = data.entity;

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('detailView').style.display = 'none';
    document.getElementById('formView').style.display = 'block';

    document.getElementById('form-title').textContent = '엔티티 수정';
    
    // ID field is immutable during edit
    document.getElementById('form-id-group').style.display = 'none';
    document.getElementById('f_id').value = ent.ID;
    document.getElementById('f_id').required = false;

    formTypeSelect.value = ent.Type;
    formTypeSelect.disabled = true;

    // Trigger dynamic fields render
    formTypeSelect.onchange();

    // Populate values
    const td = schema.types.find(x => x.type === ent.Type) || { fields: [] };
    const fields = [...schema.base, ...td.fields];

    fields.forEach(f => {
      if (f.system) return;
      
      const el = document.getElementById('form-field-' + f.key);
      if (!el) return;

      if (f.key === 'name') {
        el.value = ent.Name || '';
      } else if (ent.Data && ent.Data[f.key] !== undefined) {
        if (f.datatype === 'list') {
          el.value = Array.isArray(ent.Data[f.key]) ? ent.Data[f.key].join(', ') : ent.Data[f.key];
        } else {
          el.value = ent.Data[f.key] || '';
        }
      }
    });

    document.getElementById('f_review_needed').checked = ent.ReviewNeeded;

  } catch (err) {
    showToast('수정 준비 에러', 'error');
  }
};

// Cancel Form
document.getElementById('form-cancel-btn').onclick = () => {
  if (currentEntityId) {
    showEntity(currentEntityId);
  } else {
    document.getElementById('formView').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
  }
};

// Submit form (Save / Update)
entityForm.onsubmit = async (evt) => {
  evt.preventDefault();

  const isEdit = !!currentEntityId;
  const id = isEdit ? currentEntityId : document.getElementById('f_id').value.trim();
  const type = formTypeSelect.value;

  if (!id || !type) {
    showToast('필수 정보를 입력해 주세요.', 'error');
    return;
  }

  const td = schema.types.find(x => x.type === type) || { fields: [] };
  const fields = [...schema.base, ...td.fields];

  const body = {
    id: id,
    type: type,
    name: '',
    tags: [],
    data: {}
  };

  // Collect variables
  let valid = true;
  fields.forEach(f => {
    if (f.system) return;
    const el = document.getElementById('form-field-' + f.key);
    if (!el) return;

    const val = el.value.trim();
    if (f.required && !val) {
      showToast(`[${f.label || f.key}] 필드는 필수 입력 항목입니다.`, 'error');
      valid = false;
    }

    if (f.key === 'name') {
      body.name = val;
    } else {
      if (f.datatype === 'list') {
        body.data[f.key] = val ? val.split(',').map(x => x.trim()) : [];
      } else {
        body.data[f.key] = val;
      }
    }
  });

  if (!valid) return;

  body.review_needed = document.getElementById('f_review_needed').checked;

  try {
    let url = '/api/entity';
    let method = 'POST';
    if (isEdit) {
      url = `/api/entity/${encodeURIComponent(id)}?version=${currentEntityVersion}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (res.ok) {
      showToast(isEdit ? '엔티티 정보가 성공적으로 수정되었습니다.' : '새로운 엔티티가 등록되었습니다.');
      refreshList();
      showEntity(id);
    } else {
      if (data.error === 'version_conflict') {
        showToast('충돌 발생: 다른 사용자가 이미 수정한 엔티티입니다. 화면을 새로고침해 주세요.', 'error');
      } else if (data.missing) {
        showToast(`저장 실패. 필수 입력값 유실: ${data.missing.join(', ')}`, 'error');
      } else {
        showToast(data.error || '저장 실패', 'error');
      }
    }
  } catch (err) {
    showToast('서버 저장 처리 오류', 'error');
  }
};

// Delete Entity
document.getElementById('delete-entity-btn').onclick = async () => {
  if (!currentEntityId) return;

  if (confirm(`진짜로 엔티티 [${currentEntityId}]를 완전히 삭제하시겠습니까? 관련 모든 데이터가 유실됩니다.`)) {
    try {
      const res = await fetch(`/api/entity/${encodeURIComponent(currentEntityId)}?version=${currentEntityVersion}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        showToast('엔티티가 삭제되었습니다.');
        currentEntityId = null;
        refreshList();
        document.getElementById('detailView').style.display = 'none';
        document.getElementById('emptyState').style.display = 'flex';
      } else {
        showToast(data.error || '삭제 실패', 'error');
      }
    } catch (err) {
      showToast('서버 삭제 처리 실패', 'error');
    }
  }
};

// Relations modal operations
const relationModal = document.getElementById('relation-modal');
const relTargetSearch = document.getElementById('rel-target-search');
const relSearchResults = document.getElementById('rel-search-results');
const selectedTargetPreview = document.getElementById('selected-target-preview');
const selectedTargetName = document.getElementById('selected-target-name');
const selectedTargetId = document.getElementById('selected-target-id');
const relationSaveBtn = document.getElementById('relation-save-btn');
const relTypeSelect = document.getElementById('rel-type-select');

// ===== Unified main-view switcher: only ONE panel visible at a time =====
const MAIN_VIEWS = { emptyState: 'flex', detailView: 'flex', formView: 'block', helpView: 'block', storyView: 'flex', atomView: 'flex' };
function showMain(name) {
  Object.keys(MAIN_VIEWS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === name) ? MAIN_VIEWS[name] : 'none';
  });
  // 도킹 패널은 상세(detailView) 동반 패널 → 다른 뷰로 가면 닫음
  if (name !== 'detailView') setGraphPanel(false);
}

// ===== Graph Docking Panel (floating, draggable) =====
function setGraphPanel(open) {
  isGraphDockOpen = open;
  document.getElementById('graph-panel').style.display = open ? 'flex' : 'none';
}
document.getElementById('view-graph-btn').onclick = () => {
  setGraphPanel(!isGraphDockOpen);
  if (isGraphDockOpen && currentEntityId) showEntity(currentEntityId);
};
document.getElementById('close-graph-btn').onclick = () => setGraphPanel(false);

// 도킹 패널 헤더 드래그로 이동
(function enableGraphDrag() {
  const panel = document.getElementById('graph-panel');
  const header = panel && panel.querySelector('.graph-panel-header');
  if (!header) return;
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
    panel.style.right = 'auto'; panel.style.bottom = 'auto'; panel.style.height = r.height + 'px';
    dragging = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = Math.max(8, ox + e.clientX - sx) + 'px';
    panel.style.top = Math.max(8, oy + e.clientY - sy) + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
})();

// Schema Help View
document.getElementById('help-open-btn').onclick = () => showMain('helpView');
document.getElementById('help-close-btn').onclick = () => showMain('emptyState');

// Image Lightbox (미리보기)
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-overlay').style.display = 'flex';
}
document.getElementById('lightbox-close').onclick = () => {
  document.getElementById('lightbox-overlay').style.display = 'none';
};
document.getElementById('lightbox-overlay').onclick = (e) => {
  if (e.target.id === 'lightbox-overlay') {
    document.getElementById('lightbox-overlay').style.display = 'none';
  }
};

// ===== Story Tree (모험가 이야기 트리) =====
let storyCy = null;
document.getElementById('story-open-btn').onclick = () => { showMain('storyView'); renderStoryTree(); };
document.getElementById('story-close-btn').onclick = () => showMain('emptyState');

// ===== 3D Atom View (원자껍질 구조) =====
document.getElementById('atom-open-btn').onclick = () => { showMain('atomView'); render3DAtom(); };
document.getElementById('atom-close-btn').onclick = () => showMain('emptyState');

function storyLayout() {
  return { name: 'breadthfirst', roots: ['adventurers'], directed: true, spacingFactor: 1.15, padding: 24 };
}

async function renderStoryTree() {
  if (!window.cytoscape) return;
  const data = await (await fetch('/api/story')).json();
  const events = (data.events || []).slice().sort((a, b) => a.sequence - b.sequence);
  const elements = [];
  const nodes = new Set();
  const addNode = (id, d) => { if (!nodes.has(id)) { elements.push({ data: Object.assign({ id }, d) }); nodes.add(id); } };

  addNode('adventurers', { name: '모험가', kind: 'hero', realId: 'adventurers' });

  events.forEach(e => {
    const ev = 'ev_' + e.id;
    addNode(ev, { name: e.title, kind: 'event' });
    elements.push({ data: { id: 'j_' + e.id, source: 'adventurers', target: ev, kind: 'journey' } });
    (e.characters || []).forEach(c => {
      const cid = c.id || ('nm_' + c.name);
      addNode(cid, { name: c.name, kind: c.id === 'adventurers' ? 'hero' : 'char', realId: c.id || '' });
      elements.push({ data: { id: ev + '__' + cid, source: ev, target: cid, kind: 'appear' } });
    });
  });
  events.forEach(e => (e.causal_out || []).forEach(to => {
    if (nodes.has('ev_' + to)) elements.push({ data: { id: 'cz_' + e.id + '_' + to, source: 'ev_' + e.id, target: 'ev_' + to, kind: 'causal' } });
  }));

  if (storyCy) storyCy.destroy();
  storyCy = window.cytoscape({
    container: document.getElementById('story-cy'),
    elements,
    style: [
      { selector: 'node', style: { 'label': 'data(name)', 'color': '#e5e7eb', 'font-size': '9px', 'text-valign': 'bottom', 'text-margin-y': 3, 'background-color': '#22d3ee', 'width': 20, 'height': 20, 'text-wrap': 'wrap', 'text-max-width': '88px' } },
      { selector: 'node[kind="event"]', style: { 'background-color': '#8b5cf6', 'shape': 'round-rectangle', 'width': 44, 'height': 28, 'font-size': '10px', 'font-weight': 'bold', 'color': '#fff' } },
      { selector: 'node[kind="hero"]', style: { 'background-color': '#fbbf24', 'width': 52, 'height': 52, 'font-size': '13px', 'font-weight': 'bold', 'color': '#1f2937' } },
      { selector: 'edge', style: { 'width': 1.5, 'curve-style': 'bezier', 'line-color': '#374151' } },
      { selector: 'edge[kind="causal"]', style: { 'width': 2.5, 'line-color': '#f87171', 'target-arrow-color': '#f87171', 'target-arrow-shape': 'triangle' } },
      { selector: 'edge[kind="appear"]', style: { 'line-color': '#4b5563', 'line-style': 'dashed' } },
      { selector: 'edge[kind="journey"]', style: { 'line-color': 'rgba(251,191,36,0.22)' } },
      { selector: 'edge[kind="rel"]', style: { 'line-color': '#0ea5e9', 'label': 'data(label)', 'font-size': '8px', 'color': '#9ca3af', 'text-rotation': 'autorotate' } }
    ],
    layout: storyLayout()
  });

  // 노드 클릭 → 그 인물의 관계 확장(하이브리드)
  storyCy.on('tap', 'node', async (evt) => {
    const realId = evt.target.data('realId');
    if (realId) await expandStoryNode(realId, evt.target.id());
  });
}

async function expandStoryNode(realId, nodeId) {
  try {
    const j = await (await fetch('/api/entity/' + encodeURIComponent(realId))).json();
    (j.relations || []).slice(0, 12).forEach(r => {
      let target = r.ToID;
      if (storyCy.getElementById(target).length === 0) {
        target = 'x_' + r.ToID;
        if (storyCy.getElementById(target).length === 0) {
          storyCy.add({ data: { id: target, name: r.ToName || r.ToID, kind: 'char', realId: r.ToID } });
        }
      }
      const eid = 'rx_' + nodeId + '_' + target;
      if (storyCy.getElementById(eid).length === 0) {
        storyCy.add({ data: { id: eid, source: nodeId, target, kind: 'rel', label: r.Rel } });
      }
    });
    storyCy.layout(storyLayout()).run();
  } catch (e) { /* ignore */ }
}

// ===== 3D Atom 렌더 =====
let atomGraph = null;
let ForceGraph3D = null, SpriteText = null;

// 3D 라이브러리(UMD 전역) 준비 확인.
function ensureAtomLibs() {
  if (ForceGraph3D) return true;
  if (typeof window.ForceGraph3D === 'function') {
    ForceGraph3D = window.ForceGraph3D;
    SpriteText = (typeof window.SpriteText === 'function') ? window.SpriteText : null;
    return true;
  }
  return false;
}

// 사건·모험가 라벨 오버레이 (항상 표시, 좌표 투영으로 추적)
let atomLabelEls = [];
let atomControlsBound = false;
function buildAtomLabels(nodes) {
  const overlay = document.getElementById('atom-labels');
  overlay.innerHTML = '';
  atomLabelEls = [];
  nodes.filter(n => n.kind === 'event' || n.kind === 'hero' || n.kind === 'group').forEach(n => {
    const d = document.createElement('div');
    d.className = 'atom-label ' + n.kind;
    d.textContent = n.name;
    overlay.appendChild(d);
    atomLabelEls.push({ el: d, x: n.fx, y: n.fy, z: n.fz });
  });
}
function updateAtomLabels() {
  if (!atomGraph || !atomGraph.graph2ScreenCoords) return;
  atomLabelEls.forEach(o => {
    const p = atomGraph.graph2ScreenCoords(o.x, o.y, o.z);
    o.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -120%)`;
  });
}

// 구면 위 균등 분포 좌표 (피보나치 스피어)
function fibSphere(i, n, r) {
  const inc = Math.PI * (3 - Math.sqrt(5));
  const off = 2 / Math.max(n, 1);
  const y = i * off - 1 + off / 2;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * inc;
  return { x: Math.cos(phi) * rad * r, y: y * r, z: Math.sin(phi) * rad * r };
}

async function render3DAtom() {
  if (!ensureAtomLibs()) {
    document.getElementById('atom-3d').innerHTML =
      '<div style="padding:24px;color:var(--text-muted)">3D 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인).</div>';
    return;
  }
  const data = await (await fetch('/api/atom')).json();
  const nodes = [], links = [];
  const classes = data.classes || [];

  // --- 직업군(귀검사·마법사 …) 단위로 묶기 + 직업군별 색상 통일 ---
  const groups = (data.groups || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const Ng = Math.max(groups.length, 1);
  const gIndex = {}, gAngle = {}, gColor = {};
  groups.forEach((g, i) => {
    gIndex[g.id] = i;
    gAngle[g.id] = i / Ng * Math.PI * 2;
    gColor[g.id] = `hsl(${(i * 137.508) % 360}, 60%, 60%)`;
  });
  const colorOf = c => gColor[c.group] || 'hsl(210,10%,60%)';

  // --- 핵(상단): 모험가 → 직업군 원 → 전직 → 眞 → 2차 (radial 4단 트리) ---
  const ADV_Y = 170;                                    // 모험가: 제일 위
  const RING = { group: 150, base: 300, jin: 430, second: 560 }; // 충분한 거리
  const tierVal = { base: 5, jin: 3.6, second: 2.8 };
  const SECTOR = (2 * Math.PI / Ng) * 0.82;             // 직업군별 부채꼴 폭

  // 직업군 노드(원형 배치) + 모험가→직업군 스포크
  groups.forEach(g => {
    const a = gAngle[g.id];
    nodes.push({ id: 'G_' + g.id, kind: 'group', name: g.name, realId: g.id, color: gColor[g.id], val: 7, fx: Math.cos(a) * RING.group, fy: 25, fz: Math.sin(a) * RING.group });
    links.push({ source: '__hero', target: 'G_' + g.id, kind: 'spoke' });
  });
  nodes.push({ id: '__hero', kind: 'hero', name: (data.hero && data.hero.name) || '모험가', color: '#f8fafc', val: 14, fx: 0, fy: ADV_Y, fz: 0 });

  // 직업군 부채꼴 안에 tier별 호(弧)로 전직/眞/2차 배치
  const byGroup = {};
  classes.forEach(c => { (byGroup[c.group] = byGroup[c.group] || []).push(c); });
  Object.entries(byGroup).forEach(([gid, arr]) => {
    const ga = gAngle[gid] != null ? gAngle[gid] : 0;
    ['base', 'jin', 'second'].forEach(t => {
      const ts = arr.filter(c => c.tier === t);
      ts.forEach((c, j) => {
        const off = ts.length > 1 ? (j / (ts.length - 1) - 0.5) * SECTOR : 0;
        const a = ga + off, rad = RING[t] || 560;
        nodes.push({ id: c.id, kind: 'class', tier: t, name: c.name, group: gid, color: colorOf(c), val: tierVal[t] || 3, fx: Math.cos(a) * rad, fy: 0, fz: Math.sin(a) * rad });
      });
      // 직업군 → 전직(base) 연결
      if (t === 'base') ts.forEach(c => links.push({ source: 'G_' + gid, target: c.id, kind: 'lineage', color: gColor[gid] }));
    });
  });
  // 각성 단계 연결(전직→眞→2차), 색은 직업군색
  (data.links || []).forEach(l => links.push({ source: l.from, target: l.to, kind: 'awaken', color: gColor[(classes.find(c => c.id === l.to) || {}).group] || '#777' }));

  // --- 아래로(−y) 시계열 사건: 최근=위(원판 바로 아래), 과거=아래 ---
  const evsDesc = (data.events || []).slice().sort((a, b) => b.sequence - a.sequence);
  const EV_TOP = -240, EV_STEP = 100, EV_RAD = 150, epos = {};
  evsDesc.forEach((e, i) => {
    const ang = i * 2.39996;               // 황금각 나선 → 세로로 분리되며 안 겹침
    const isArc = (e.characters || []).some(c => c.id === 'adventurers'); // 모험가 개입 사건
    const p = { x: Math.cos(ang) * EV_RAD, y: EV_TOP - i * EV_STEP, z: Math.sin(ang) * EV_RAD };
    nodes.push({ id: 'EV_' + e.id, kind: 'event', name: e.title, era: e.era, color: isArc ? '#fbbf24' : '#fb923c', val: isArc ? 7.5 : 6.5, fx: p.x, fy: p.y, fz: p.z });
    epos[e.id] = p;
  });
  for (let i = 0; i < evsDesc.length - 1; i++) links.push({ source: 'EV_' + evsDesc[i].id, target: 'EV_' + evsDesc[i + 1].id, kind: 'time' }); // 세로 시간 줄기
  if (evsDesc[0]) links.push({ source: '__hero', target: 'EV_' + evsDesc[0].id, kind: 'journey' });
  (data.events || []).forEach(e => (e.causal_out || []).forEach(to => { if (epos[to]) links.push({ source: 'EV_' + e.id, target: 'EV_' + to, kind: 'causal' }); }));

  // --- 인물: 같은 인물 한 노드(가장 이른 사건 옆) ---
  const evsAsc = (data.events || []).slice().sort((a, b) => a.sequence - b.sequence);
  const chId = {};
  evsAsc.forEach(e => {
    const ep = epos[e.id]; if (!ep) return;
    (e.characters || []).forEach((c, ci) => {
      // 모험가는 중복 노드 대신 맨 위 모험가 본체에 직접 연결(개입 표시)
      if (c.id === 'adventurers') { links.push({ source: 'EV_' + e.id, target: '__hero', kind: 'act' }); return; }
      const key = c.id || ('nm:' + c.name);
      if (!chId[key]) {
        const a = ci * 1.25, rr = 30 + (ci % 3) * 9, id = 'CH_' + key;
        nodes.push({ id, kind: 'char', name: c.name, realId: c.id || '', color: c.id ? '#22c55e' : '#9ca3af', val: 2.6, fx: ep.x + Math.cos(a) * rr, fy: ep.y + (ci % 2 ? 7 : -7), fz: ep.z + Math.sin(a) * rr });
        chId[key] = id;
      }
      links.push({ source: 'EV_' + e.id, target: chId[key], kind: 'appear' });
    });
  });

  const linkColorMap = { spoke: 'rgba(248,250,252,0.14)', lineage: '#888', awaken: '#777', causal: '#f87171', appear: '#3f4657', journey: 'rgba(248,250,252,0.4)', time: 'rgba(148,163,184,0.55)', act: '#fbbf24' };
  const el = document.getElementById('atom-3d');

  if (atomGraph) {
    atomGraph.graphData({ nodes, links });
  } else {
    atomGraph = ForceGraph3D()(el)
      .backgroundColor('#0b1020')
      .showNavInfo(false)
      .nodeColor(n => n.color)
      .nodeVal(n => n.val)
      .nodeOpacity(0.92)
      .nodeResolution(14)
      .nodeLabel(n => `<b>${n.name}</b>${n.era ? '<br><span style="color:#fb923c">' + n.era + '</span>' : ''}`)
      .nodeThreeObjectExtend(true)
      .nodeThreeObject(n => {
        if ((n.kind === 'hero' || n.kind === 'event') && SpriteText) {
          const s = new SpriteText(n.name);
          s.color = n.kind === 'hero' ? '#fde68a' : '#ffedd5';
          s.textHeight = n.kind === 'hero' ? 9 : 5;
          s.position.set(0, (n.val || 5) + 5, 0);
          return s;
        }
        return null;
      })
      .linkColor(l => l.color || linkColorMap[l.kind] || '#334155')
      .linkWidth(l => l.kind === 'causal' ? 1.8 : (l.kind === 'act' ? 1.4 : (l.kind === 'time' ? 1.3 : 0.4)))
      .linkOpacity(0.5)
      .linkDirectionalParticles(l => l.kind === 'causal' ? 2 : 0)
      .linkDirectionalParticleWidth(1.6)
      .linkDirectionalParticleColor(() => '#fca5a5')
      .cooldownTicks(0)
      .onNodeClick(n => {
        if (n.kind === 'class' || ((n.kind === 'char' || n.kind === 'group') && n.realId)) {
          const id = n.kind === 'class' ? n.id : n.realId;
          document.getElementById('atomView').style.display = 'none';
          showEntity(id);
          return;
        }
        const r = Math.hypot(n.x, n.y, n.z) || 1, ratio = 1 + 90 / r;
        atomGraph.cameraPosition({ x: n.x * ratio, y: n.y * ratio, z: n.z * ratio }, n, 800);
      })
      .graphData({ nodes, links });
    // 망원 렌즈(저 FOV) → 위아래 간격이 원근으로 뭉치지 않고 균일하게
    const cam = atomGraph.camera();
    cam.fov = 30; cam.updateProjectionMatrix();
  }
  buildAtomLabels(nodes);
  atomGraph.width(el.clientWidth).height(el.clientHeight);
  // 위(원판)→아래(시계열) 전체가 비스듬히 보이도록 카메라 배치 (저 FOV 보정 거리)
  const minY = EV_TOP - Math.max(evsDesc.length - 1, 0) * EV_STEP;
  const H = ADV_Y - minY, cy = (ADV_Y + minY) / 2;
  // 고도각 ~40° → 직업군 원판이 타원으로 보이고 시계열은 아래로 이어짐
  setTimeout(() => atomGraph.cameraPosition({ x: H * 0.05, y: ADV_Y + H * 0.62, z: H * 1.45 }, { x: 0, y: cy, z: 0 }, 1000), 200);
  // 카메라 회전/확대 시 라벨 위치 동기화
  if (!atomControlsBound && atomGraph.controls) {
    atomGraph.controls().addEventListener('change', updateAtomLabels);
    atomControlsBound = true;
  }
  let ticks = 0;
  const iv = setInterval(() => { updateAtomLabels(); if (++ticks > 90) clearInterval(iv); }, 33);
}

document.getElementById('add-relation-btn').onclick = () => {
  if (!currentEntityId) return;
  relationModal.style.display = 'flex';
  
  // Clear modal states
  relTargetSearch.value = '';
  relSearchResults.innerHTML = '';
  relSearchResults.style.display = 'none';
  selectedTargetPreview.style.display = 'none';
  currentSelectedTargetIdInModal = null;
  relTypeSelect.value = '';
  relationSaveBtn.disabled = true;
};

// Close relation modal
document.getElementById('relation-modal-close').onclick = () => {
  relationModal.style.display = 'none';
};

// Search characters to link
relTargetSearch.oninput = async () => {
  const query = relTargetSearch.value.trim();
  if (!query) {
    relSearchResults.style.display = 'none';
    return;
  }

  try {
    const list = await (await fetch(`/api/entities?q=${encodeURIComponent(query)}`)).json();
    relSearchResults.innerHTML = '';
    
    // Skip self
    const filtered = list.filter(e => e.id !== currentEntityId);
    
    if (filtered.length === 0) {
      relSearchResults.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-muted);">매칭 대상 없음</div>';
      relSearchResults.style.display = 'block';
      return;
    }

    filtered.forEach(e => {
      const row = document.createElement('div');
      row.className = 'search-result-row';
      row.innerHTML = `${escapeHTML(e.name)} <span style="font-size:11px; opacity:0.6;">(${escapeHTML(e.id)})</span>`;
      
      row.onclick = () => {
        currentSelectedTargetIdInModal = e.id;
        selectedTargetName.textContent = e.name;
        selectedTargetId.textContent = e.id;
        selectedTargetPreview.style.display = 'block';
        relSearchResults.style.display = 'none';
        relTargetSearch.value = e.name;
        checkRelationModalValid();
      };
      
      relSearchResults.appendChild(row);
    });
    
    relSearchResults.style.display = 'block';
  } catch (err) {
    // Fail silently
  }
};

relTypeSelect.onchange = () => {
  checkRelationModalValid();
};

function checkRelationModalValid() {
  const isValid = currentSelectedTargetIdInModal && relTypeSelect.value;
  relationSaveBtn.disabled = !isValid;
}

// Save Relationship Click
relationSaveBtn.onclick = async () => {
  if (!currentEntityId || !currentSelectedTargetIdInModal || !relTypeSelect.value) return;

  try {
    const res = await fetch('/api/relation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_id: currentEntityId,
        rel: relTypeSelect.value,
        to_id: currentSelectedTargetIdInModal
      })
    });
    
    const data = await res.json();
    if (res.ok) {
      showToast('관계 연결이 성공적으로 수립되었습니다. (양방향 연결 완료)');
      relationModal.style.display = 'none';
      showEntity(currentEntityId); // Reload details
    } else {
      showToast(data.error || '관계 생성 실패', 'error');
    }
  } catch (err) {
    showToast('관계 연결 서버 처리 실패', 'error');
  }
};

// Click outside modal to close it
window.onclick = (event) => {
  if (event.target === relationModal) {
    relationModal.style.display = 'none';
  }
};

// Utilities
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Inline Editing
async function saveInlineData(id, key, newVal) {
  try {
    const resGet = await fetch(`/api/entity/${encodeURIComponent(id)}`);
    const dataGet = await resGet.json();
    if (!dataGet.entity) {
      showToast('엔티티 최신 정보를 가져올 수 없습니다.', 'error');
      return;
    }
    const ent = dataGet.entity;
    
    const body = {
      id: ent.ID,
      type: ent.Type,
      name: ent.Name,
      tags: ent.Tags || [],
      data: ent.Data || {},
      review_needed: ent.ReviewNeeded
    };

    if (key === 'name') {
      body.name = newVal.trim();
    } else {
      const td = schema.types.find(x => x.type === ent.Type) || { fields: [] };
      const f = [...schema.base, ...td.fields].find(x => x.key === key);
      if (f && f.datatype === 'list') {
        body.data[key] = newVal ? newVal.split(',').map(x => x.trim()) : [];
      } else {
        body.data[key] = newVal.trim();
      }
    }

    const resPut = await fetch(`/api/entity/${encodeURIComponent(id)}?version=${ent.Version}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const resData = await resPut.json();
    if (resPut.ok) {
      showToast('속성이 수정되었습니다.');
      allEntitiesCache = null;
      refreshList();
      showEntity(id);
    } else {
      if (resData.error === 'version_conflict') {
        showToast('충돌 발생: 다른 사용자가 변경했습니다. 새로고침 후 시도하세요.', 'error');
      } else {
        showToast(resData.error || '수정 실패', 'error');
      }
    }
  } catch (err) {
    showToast('인라인 수정 처리 중 오류', 'error');
  }
}

// Graph Rendering
// 관계어 → 카테고리 색 (529종을 의미별로 묶어 색칠)
function relColor(rel) {
  rel = (rel || '').replace('← ', '');
  if (/소속|포함|구성|충성|섬김|속함/.test(rel)) return '#3b82f6';      // 소속 (파랑)
  if (/적대|침공|지배|봉인|제압|대항|공격|처치|배신|살해/.test(rel)) return '#ef4444'; // 적대 (빨강)
  if (/창조|제작|제조|명명|발견|개발|생성|소환/.test(rel)) return '#22c55e';   // 창조 (초록)
  if (/위치|거주|서식|출신|방문|점유|군림|존재/.test(rel)) return '#f59e0b';   // 장소 (주황)
  if (/각성/.test(rel)) return '#06b6d4';                              // 각성 (청록)
  if (/사도|스승|제자|가족|혈연|부모|자식|관리|동료|연인/.test(rel)) return '#a855f7'; // 인연 (보라)
  return '#6b7280';                                                    // 기타 (회색)
}

// 엔티티 타입 → 노드 색
function typeColor(t) {
  return ({
    character: '#22d3ee', location: '#f59e0b', item: '#eab308',
    organization: '#60a5fa', concept: '#c084fc', event: '#fb7185', group: '#34d399'
  })[t] || '#22d3ee';
}

function renderGraph(centerId, centerName, relations) {
  if (!window.cytoscape) return;

  const elements = [];
  const nodesMap = new Set();
  
  elements.push({ data: { id: centerId, name: centerName.replace('검토 필요','').trim(), center: true } });
  nodesMap.add(centerId);

  relations.forEach(r => {
    if (!nodesMap.has(r.ToID)) {
      elements.push({ data: { id: r.ToID, name: r.ToName || r.ToID, color: typeColor(r.ToType) } });
      nodesMap.add(r.ToID);
    }
    elements.push({
      data: {
        id: r.PairID || ('edge_' + Math.random().toString(36).substr(2, 9)),
        source: centerId,
        target: r.ToID,
        label: r.Rel,
        color: relColor(r.Rel)
      }
    });
  });

  const cyContainer = document.getElementById('cy');
  if (cyInstance) {
    cyInstance.destroy();
  }

  cyInstance = window.cytoscape({
    container: cyContainer,
    elements: elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'label': 'data(name)',
          'color': '#fff',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 4,
          'font-size': '10px',
          'width': 30,
          'height': 30
        }
      },
      {
        selector: 'node[?center]',
        style: {
          'background-color': '#8b5cf6',
          'width': 45,
          'height': 45,
          'font-weight': 'bold',
          'font-size': '12px'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2.5,
          'line-color': 'data(color)',
          'target-arrow-color': 'data(color)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-size': '8px',
          'color': '#9ca3af',
          'text-rotation': 'autorotate',
          'text-margin-y': -8
        }
      }
    ],
    layout: {
      name: 'concentric',
      minNodeSpacing: 60
    }
  });

  cyInstance.on('tap', 'node', function(evt){
    var node = evt.target;
    if(node.id() !== centerId) {
      showEntity(node.id());
    }
  });
}

// Kickstart auth check
checkAuth();
