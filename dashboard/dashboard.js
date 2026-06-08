// === 1. 常數定義 ===
const PREDEFINED_ORDER = {
  novel: ['文庫', 'Web 翻譯', 'Web 原作'],
  comic: ['第 N 話', '單行本', '番外篇'],
  anime: ['第 N 季', '第 N 集', '番外篇', '電影']
};

const fontSizes = ['sm', 'md', 'lg', 'xl'];

// === 2. 全域變數 ===
let allEntries = [];
let commonUrls = { novel: [], comic: [], anime: [] };
let masterTags = [];
let masterMediums = [];
let activeFilters = { mediums: [], types: [], tags: [] };
let collapsedIds = new Set();
let currentManageType = '';
let currentFontSize = 'md';
let currentFirstVisibleId = null;
const intersectingIds = new Set();
let initialFormState = ''; // 紀錄表單開啟時的狀態

// === 3. 工具函式 ===
function getDomain(urlStr) {
  try {
    let h = urlStr.includes('://') ? new URL(urlStr).hostname : urlStr.split('/')[0];
    return h.replace(/^www\./, '');
  } catch (e) {
    return urlStr;
  }
}

function getUrlDisplayName(url) {
  const d = getDomain(url);
  for (const type in commonUrls) {
    const found = (commonUrls[type] || []).find(i => getDomain(i.url) === d);
    if (found) return found.name;
  }
  return d;
}

function sortMediaItems(items, category) {
  const order = PREDEFINED_ORDER[category] || [];
  return [...items].sort((a, b) => {
    const idxA = order.indexOf(a.desc);
    const idxB = order.indexOf(b.desc);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });
}

function formatInline(text) {
  if (!text) return '';
  let s = String(text);
  
  const links = [];
  s = s.replace(/\[(.+?)\]\((https?:\/\/[^\s\)]+)\)/g, (match, p1, p2) => {
    const placeholder = `__LINK_PLACEHOLDER_${links.length}__`;
    links.push(`<a href="${p2}" target="_blank">${p1}</a>`);
    return placeholder;
  });

  s = s.replace(/:/g, '：');
  s = s.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2');
  s = s.replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
  s = s.replace(/\s+([\u3000-\u303F\uFF00-\uFFEF])/g, '$1');
  s = s.replace(/([\u3000-\u303F\uFF00-\uFFEF])\s+/g, '$1');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/~(.+?)~/g, '<sub>$1</sub>');

  links.forEach((linkHtml, idx) => {
    s = s.replace(`__LINK_PLACEHOLDER_${idx}__`, linkHtml);
  });

  return s;
}

function formatDisplay(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let stack = [];

  lines.forEach(line => {
    const match = line.match(/^(\s*)([*-])\s+(.*)$/);
    if (match) {
      const indent = match[1].length;
      const content = formatInline(match[3]);
      if (stack.length === 0 || indent > stack[stack.length - 1]) {
        html += '<ul>'; stack.push(indent);
      } else {
        while (stack.length > 0 && indent < stack[stack.length - 1]) {
          html += '</ul>'; stack.pop();
        }
      }
      html += `<li>${content}</li>`;
    } else {
      while (stack.length > 0) { html += '</ul>'; stack.pop(); }
      html += formatInline(line) + (line.trim() ? '<br>' : '');
    }
  });
  while (stack.length > 0) { html += '</ul>'; stack.pop(); }
  return html;
}

function setFormattedHTML(el, text) { el.innerHTML = formatDisplay(text); }

function migrateEntryData(data) {
  if (!data) return { progress: [], urls: [] };
  let migrated = { progress: [], urls: [] };
  if (Array.isArray(data.progress)) migrated.progress = data.progress;
  else if (typeof data.progress === 'string' && data.progress) migrated.progress.push({ desc: '進度', val: data.progress });

  if (Array.isArray(data.urls)) migrated.urls = data.urls;
  else if (typeof data.urls === 'string' && data.urls) migrated.urls.push({ desc: '', val: data.urls });
  return migrated;
}

function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function applyFontSize(size) {
  document.body.classList.remove(...fontSizes.map(s => `font-size-${s}`));
  document.body.classList.add(`font-size-${size}`);
}

function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  toast.offsetHeight; // force reflow
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 1500);
}

// === 4. DOM 載入後初始化 ===
document.addEventListener('DOMContentLoaded', async () => {
  const entryList = document.getElementById('entryList');
  const addEntryBtn = document.getElementById('addEntryBtn');
  const modal = document.getElementById('modal');
  const closeBtn = document.querySelector('.close');
  const cancelBtn = document.getElementById('cancelBtn');
  const entryForm = document.getElementById('entryForm');
  const fontSizeUp = document.getElementById('fontSizeUp');
  const fontSizeDown = document.getElementById('fontSizeDown');
  const toggleCommonUrls = document.getElementById('toggleCommonUrls');
  const commonUrlsArea = document.getElementById('commonUrlsArea');
  const editCommonUrlsBtn = document.getElementById('editCommonUrlsBtn');
  const commonUrlsModal = document.getElementById('commonUrlsModal');
  const closeCommon = document.querySelector('.close-common');
  const saveCommonBtn = document.getElementById('saveCommonBtn');
  const exportAllBtn = document.getElementById('exportAllBtn');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearFilterBtn = document.getElementById('clearFilterBtn');
  const expandAllBtn = document.getElementById('expandAllBtn');
  const collapseAllBtn = document.getElementById('collapseAllBtn');
  const tocList = document.getElementById('toc-list');
  const entryCountEl = document.getElementById('entry-count');
  const tagManageBtn = document.getElementById('tagManageBtn');
  const mediumManageBtn = document.getElementById('mediumManageBtn');
  const manageModal = document.getElementById('manageModal');
  const closeManage = document.querySelector('.close-manage');
  const saveManageBtn = document.getElementById('saveManageBtn');
  const addManageItemBtn = document.getElementById('addManageItemBtn');

  // Intersection Observer for highlighting TOC
  const entryObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = entry.target.getAttribute('data-id');
      if (entry.isIntersecting) intersectingIds.add(id);
      else intersectingIds.delete(id);
    });

    if (intersectingIds.size > 0) {
      const firstId = allEntries.find(e => intersectingIds.has(e.id))?.id;
      if (firstId && firstId !== currentFirstVisibleId) {
        currentFirstVisibleId = firstId;
        const items = document.querySelectorAll('.toc-item');
        items.forEach(el => {
          const isActive = el.getAttribute('data-entry-id') === firstId;
          el.classList.toggle('active', isActive);
          if (isActive) {
            const container = document.getElementById('toc-list');
            const targetScroll = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2);
            container.scrollTo({ top: targetScroll, behavior: 'smooth' });
          }
        });
      }
    }
  }, { threshold: 0, rootMargin: "-40% 0px -40% 0px" });

  // === 5. 核心渲染函式 ===
  async function loadEntries() {
    allEntries = await Storage.getAll();
    let filtered = allEntries;
    if (activeFilters.mediums.length > 0) filtered = filtered.filter(e => activeFilters.mediums.includes(e.originalMedium || 'Unknown'));
    if (activeFilters.types.length > 0) filtered = filtered.filter(e => activeFilters.types.some(type => { const d = migrateEntryData(e[type.toLowerCase()]); return d.progress.length > 0 || d.urls.length > 0; }));
    if (activeFilters.tags.length > 0) filtered = filtered.filter(e => activeFilters.tags.every(t => (e.tags || []).includes(t)));

    entryCountEl.textContent = filtered.length;
    entryList.innerHTML = '';
    
    filtered.forEach(entry => {
      const safeEntry = { watchingTime: { start: '', end: '' }, otherNames: [], tags: [], novel: { progress: [], urls: [] }, comic: { progress: [], urls: [] }, anime: { progress: [], urls: [] }, ...entry };
      const clone = document.getElementById('entryTemplate').content.cloneNode(true);
      const entryEl = clone.querySelector('.entry');
      entryEl.setAttribute('data-id', safeEntry.id); entryEl.id = `entry-${safeEntry.id}`;
      if (collapsedIds.has(safeEntry.id)) entryEl.classList.add('collapsed');

      entryObserver.observe(entryEl);

      setFormattedHTML(clone.querySelector('.entry-title'), safeEntry.title);
      setFormattedHTML(clone.querySelector('.original-medium'), safeEntry.originalMedium || 'Unknown');
      clone.querySelector('.watch-period').textContent = (safeEntry.watchingTime.start || '??') + ' ~ ' + (safeEntry.watchingTime.end || '??');

      const tagContainer = clone.querySelector('.entry-tags');
      (Array.isArray(safeEntry.tags) ? safeEntry.tags : []).forEach(t => {
        const span = document.createElement('span'); span.className = 'tag'; setFormattedHTML(span, t); tagContainer.appendChild(span);
      });

      const otherNamesContainer = clone.querySelector('.other-names-list');
      (Array.isArray(safeEntry.otherNames) ? safeEntry.otherNames : [safeEntry.otherNames]).filter(n => n).forEach((name, idx) => {
        const span = document.createElement('span'); span.className = 'other-name-item'; span.innerHTML = `${idx + 1}. ${formatDisplay(name)}`; otherNamesContainer.appendChild(span);
      });

      ['novel', 'comic', 'anime'].forEach(m => {
        const d = migrateEntryData(safeEntry[m]);
        const sortedP = sortMediaItems(d.progress, m); const sortedU = sortMediaItems(d.urls, m);
        const progTd = clone.querySelector(`.${m}-progress`); const urlTd = clone.querySelector(`.${m}-urls`);
        if (sortedP.length > 0) {
          const ul = document.createElement('ul'); ul.className = 'novel-detail';
          sortedP.forEach(p => {
            const li = document.createElement('li');
            if (p.desc === '第 N 話') li.innerHTML = formatDisplay(`第 ${p.val} 話`);
            else if (p.desc === '第 N 季') { const parts = p.val.split(','); li.innerHTML = formatDisplay(`第 ${parts[0] || '?'} 季${parts[1] ? ' 第 ' + parts[1] + ' 集' : ''}`); }
            else li.innerHTML = formatDisplay(p.desc + (p.val ? '：' + p.val : ''));
            ul.appendChild(li);
          });
          progTd.appendChild(ul);
        }
        if (sortedU.length > 0) {
          const div = document.createElement('div'); div.className = 'novel-url-group';
          sortedU.forEach(u => {
             const display = getUrlDisplayName(u.val); const label = u.desc ? formatInline(u.desc) + ' - ' : '';
             const line = document.createElement('div'); line.className = 'url-line';
             line.innerHTML = `${label}<a href="${u.val}" target="_blank">${display}</a>`; div.appendChild(line);
          });
          urlTd.appendChild(div);
        }
      });

      setFormattedHTML(clone.querySelector('.related-works'), safeEntry.relatedWorks || '');
      setFormattedHTML(clone.querySelector('.notes'), safeEntry.notes || '');
      setFormattedHTML(clone.querySelector('.thoughts'), safeEntry.thoughts || '');
      
      clone.querySelector('.toggle-entry-btn').onclick = () => {
          if (collapsedIds.has(safeEntry.id)) collapsedIds.delete(safeEntry.id); else collapsedIds.add(safeEntry.id);
          loadEntries();
      };
      clone.querySelector('.move-up-btn').onclick = async () => {
        const currentFilteredIdx = filtered.findIndex(e => e.id === safeEntry.id);
        if (currentFilteredIdx > 0) {
          const prevEntry = filtered[currentFilteredIdx - 1];
          const targetIdx = allEntries.findIndex(e => e.id === safeEntry.id);
          if (targetIdx !== -1) {
            const [movedEntry] = allEntries.splice(targetIdx, 1);
            const prevIdx = allEntries.findIndex(e => e.id === prevEntry.id);
            allEntries.splice(prevIdx, 0, movedEntry);
            await Storage.save(allEntries);
            await loadEntries();
          }
        }
      };
      clone.querySelector('.move-down-btn').onclick = async () => {
        const currentFilteredIdx = filtered.findIndex(e => e.id === safeEntry.id);
        if (currentFilteredIdx !== -1 && currentFilteredIdx < filtered.length - 1) {
          const nextEntry = filtered[currentFilteredIdx + 1];
          const targetIdx = allEntries.findIndex(e => e.id === safeEntry.id);
          if (targetIdx !== -1) {
            const [movedEntry] = allEntries.splice(targetIdx, 1);
            const nextIdx = allEntries.findIndex(e => e.id === nextEntry.id);
            allEntries.splice(nextIdx + 1, 0, movedEntry);
            await Storage.save(allEntries);
            await loadEntries();
          }
        }
      };
      clone.querySelector('.entry-title').onclick = () => {
        navigator.clipboard.writeText(safeEntry.title).then(() => {
          showToast('已複製作品名稱！');
        }).catch(err => {
          console.error('Failed to copy text: ', err);
        });
      };
      clone.querySelector('.edit-btn').onclick = () => editEntry(safeEntry);
      clone.querySelector('.delete-btn').onclick = async () => { if (confirm('確定要刪除嗎？')) { await Storage.delete(safeEntry.id); await loadEntries(); renderFilters(); } };
      entryList.appendChild(clone);
    });
    renderTOC(filtered);
  }

  function renderTOC(entries = []) {
      tocList.innerHTML = '';
      entries.forEach(e => {
          const a = document.createElement('a'); a.className = 'toc-item'; a.textContent = e.title;
          a.setAttribute('data-entry-id', e.id);
          if (e.id === currentFirstVisibleId) a.classList.add('active');
          a.onclick = (event) => { event.preventDefault(); const el = document.getElementById(`entry-${e.id}`); if (el) el.scrollIntoView({ behavior: 'smooth' }); };
          tocList.appendChild(a);
      });
  }

  function renderFilters() {
    const allTags = new Set(masterTags); const allMediums = new Set(masterMediums);
    allEntries.forEach(e => { (Array.isArray(e.tags) ? e.tags : []).forEach(t => allTags.add(t)); if (e.originalMedium) allMediums.add(e.originalMedium); });
    allMediums.add('Unknown');
    const mOrder = ['Novel', 'Comic', 'Anime', 'Game', 'Unknown'];
    const sortedMediums = Array.from(allMediums).sort((a, b) => {
        const idxA = mOrder.indexOf(a); const idxB = mOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1; if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
    const mediumFilterContainer = document.getElementById('filter-mediums-list'); mediumFilterContainer.innerHTML = '';
    sortedMediums.forEach(m => {
        const label = document.createElement('label'); const checked = activeFilters.mediums.includes(m);
        label.innerHTML = `<input type="checkbox" class="filter-medium" value="${m}" ${checked ? 'checked' : ''}> ${m}`;
        label.querySelector('input').onchange = () => {
            activeFilters.mediums = Array.from(document.querySelectorAll('.filter-medium:checked')).map(cb => cb.value);
        };
        mediumFilterContainer.appendChild(label);
    });
    const filterContainer = document.getElementById('filter-tags-list'); filterContainer.innerHTML = '';
    Array.from(allTags).sort().forEach(t => {
      const span = document.createElement('span'); span.className = `tag ${activeFilters.tags.includes(t) ? 'active' : ''}`;
      span.innerHTML = formatDisplay(t);
      span.onclick = () => {
        if (activeFilters.tags.includes(t)) activeFilters.tags = activeFilters.tags.filter(tag => tag !== t); else activeFilters.tags.push(t);
        renderFilters();
      };
      filterContainer.appendChild(span);
    });
  }

  function renderEditFormDynamicFields() {
      const allTags = new Set(masterTags); const allMediums = new Set(masterMediums);
      allEntries.forEach(e => { (Array.isArray(e.tags) ? e.tags : []).forEach(t => allTags.add(t)); if (e.originalMedium) allMediums.add(e.originalMedium); });
      const suggestMediums = document.getElementById('available-mediums'); suggestMediums.innerHTML = '';
      Array.from(allMediums).sort().forEach(m => {
          const span = document.createElement('span'); span.className = 'tag'; span.textContent = m;
          span.onclick = () => document.getElementById('f-orig-medium').value = m;
          suggestMediums.appendChild(span);
      });
      const suggestTags = document.getElementById('available-tags'); suggestTags.innerHTML = '';
      Array.from(allTags).sort().forEach(t => {
          const span = document.createElement('span'); span.className = 'tag'; span.textContent = t;
          span.onclick = () => addTagInput(t);
          suggestTags.appendChild(span);
      });
  }

  function renderCommonUrls() {
    ['novel', 'comic', 'anime'].forEach(m => {
      const container = document.getElementById(`common-${m}-list`); container.innerHTML = '';
      if (m !== 'novel') container.classList.add('common-url-list-vertical'); else container.classList.remove('common-url-list-vertical');
      const list = (commonUrls[m] || []).filter(u => u.visible !== false);
      list.forEach((u, idx) => {
        const span = document.createElement('span'); span.className = 'common-url-item';
        span.innerHTML = `${idx + 1}. <a href="${u.url}" target="_blank">${u.name || getDomain(u.url)}</a>`;
        container.appendChild(span);
      });
    });
  }

  function showManageModal(type) {
      currentManageType = type;
      document.getElementById('manageModalTitle').textContent = type === 'tag' ? '管理所有 Tag' : '管理所有原作載體';
      const listContainer = document.getElementById('manage-list-container');
      listContainer.innerHTML = '';
      const items = new Set(type === 'tag' ? masterTags : masterMediums);
      allEntries.forEach(e => { if (type === 'tag') (e.tags || []).forEach(t => items.add(t)); else if (e.originalMedium) items.add(e.originalMedium); });
      Array.from(items).sort().forEach(item => addManageItemRow(item, item));
      manageModal.style.display = 'block';
      const content = manageModal.querySelector('.modal-content');
      if (content) content.scrollTop = 0;
  }

  function addManageItemRow(val, oldVal) {
      const listContainer = document.getElementById('manage-list-container');
      const row = document.createElement('div'); row.className = 'manage-item-row';
      row.innerHTML = `<input type="text" class="manage-name-input" value="${val}" data-old="${oldVal}"><button class="delete-manage-btn">刪除</button>`;
      row.querySelector('.delete-manage-btn').onclick = () => { if (confirm(`確定要移除 "${val || '此項目'}" 嗎？`)) row.remove(); };
      listContainer.appendChild(row);
  }

  async function saveGlobalChanges() {
      const rows = Array.from(document.querySelectorAll('.manage-item-row'));
      const updates = rows.map(r => ({ oldVal: r.querySelector('.manage-name-input').getAttribute('data-old'), newVal: r.querySelector('.manage-name-input').value.trim() })).filter(u => u.newVal);
      const type = currentManageType;
      const newMasterList = updates.map(u => u.newVal);
      allEntries.forEach(e => {
          if (type === 'tag') {
              let tags = e.tags || [];
              tags = tags.filter(t => updates.find(up => up.oldVal === t));
              tags = tags.map(t => { const u = updates.find(up => up.oldVal === t); return u ? u.newVal : t; });
              e.tags = Array.from(new Set(tags)).filter(v => v);
          } else {
              const u = updates.find(up => up.oldVal === e.originalMedium);
              if (u) e.originalMedium = u.newVal;
              else if (e.originalMedium && !updates.some(up => up.oldVal === e.originalMedium)) e.originalMedium = '';
          }
      });
      if (type === 'tag') { masterTags = newMasterList; await Storage.saveTags(masterTags); }
      else { masterMediums = newMasterList; await Storage.saveMediums(masterMediums); }
      await Storage.save(allEntries); manageModal.style.display = 'none'; renderFilters(); await loadEntries();
  }

  function getFormState() {
      const formData = new FormData(entryForm);
      let state = "";
      for (let [key, value] of formData.entries()) { state += `${key}:${value}|`; }
      // 動態欄位手動加入
      document.querySelectorAll('.progress-row input, .u-desc, .u-url, #other-names-inputs input, #f-tags-inputs input').forEach(i => state += i.value + ";");
      state += document.getElementById('f-related').value + document.getElementById('f-notes').value + document.getElementById('f-thoughts').value;
      return state;
  }

  function openModal() {
      modal.style.display = 'block';
      const content = modal.querySelector('.modal-content');
      if (content) content.scrollTop = 0;
      document.body.classList.add('modal-open');
      initialFormState = getFormState();
  }

  function closeModal() {
      if (getFormState() !== initialFormState) {
          if (!confirm('您有未儲存的變更，確定要離開嗎？')) return;
      }
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
  }

  function editEntry(entry) {
    entryForm.reset(); document.getElementById('editId').value = entry.id;
    document.getElementById('f-title').value = entry.title;
    document.getElementById('f-watch-start').value = (entry.watchingTime && entry.watchingTime.start) || '';
    document.getElementById('f-watch-end').value = (entry.watchingTime && entry.watchingTime.end) || '';
    document.getElementById('f-orig-medium').value = entry.originalMedium || '';
    document.querySelectorAll('.progress-items, .url-items, #other-names-inputs, #f-tags-inputs').forEach(c => c.innerHTML = '');
    (Array.isArray(entry.otherNames) ? entry.otherNames : (entry.otherNames ? [entry.otherNames] : [])).forEach(n => addOtherNameInput(n));
    (Array.isArray(entry.tags) ? entry.tags : []).forEach(t => addTagInput(t));
    ['novel', 'comic', 'anime'].forEach(m => {
        const d = migrateEntryData(entry[m]);
        const sortedP = sortMediaItems(d.progress, m); const sortedU = sortMediaItems(d.urls, m);
        sortedP.forEach(p => addProgressInputRow(document.querySelector(`.media-category-group[data-media="${m}"] .progress-items`), m, p.desc, p.val));
        sortedU.forEach(u => addUrlComplexInputRow(document.querySelector(`.media-category-group[data-media="${m}"] .url-items`), m, u.desc, u.val));
    });
    document.getElementById('f-related').value = entry.relatedWorks || '';
    document.getElementById('f-notes').value = entry.notes || '';
    document.getElementById('f-thoughts').value = entry.thoughts || '';
    renderEditFormDynamicFields();
    openModal();
  }

  function setupEventListeners() {
    fontSizeUp.onclick = () => changeFontSize(1);
    fontSizeDown.onclick = () => changeFontSize(-1);
    toggleCommonUrls.onclick = () => {
      commonUrlsArea.classList.toggle('show');
      toggleCommonUrls.querySelector('.collapse-icon').textContent = commonUrlsArea.classList.contains('show') ? '▲' : '▼';
    };
    searchBtn.onclick = () => {
      activeFilters.mediums = Array.from(document.querySelectorAll('.filter-medium:checked')).map(cb => cb.value);
      activeFilters.types = Array.from(document.querySelectorAll('.filter-type:checked')).map(cb => cb.value);
      loadEntries();
    };
    document.querySelectorAll('.filter-type').forEach(cb => {
      cb.onchange = () => {
        activeFilters.types = Array.from(document.querySelectorAll('.filter-type:checked')).map(cb => cb.value);
      };
    });
    clearFilterBtn.onclick = () => {
      document.querySelectorAll('.filter-section input[type="checkbox"]').forEach(cb => cb.checked = false);
      activeFilters = { mediums: [], types: [], tags: [] };
      renderFilters(); loadEntries();
    };
    expandAllBtn.onclick = () => { collapsedIds.clear(); loadEntries(); };
    collapseAllBtn.onclick = () => { allEntries.forEach(e => collapsedIds.add(e.id)); loadEntries(); };
    editCommonUrlsBtn.onclick = () => {
      ['novel', 'comic', 'anime'].forEach(m => {
        const container = document.getElementById(`common-${m}-editor`); container.innerHTML = '';
        (commonUrls[m] || []).forEach(u => addCommonUrlRow(container, u.url, u.name, u.visible !== false));
      });
      commonUrlsModal.style.display = 'block';
      const content = commonUrlsModal.querySelector('.modal-content');
      if (content) content.scrollTop = 0;
    };
    saveCommonBtn.onclick = async () => {
      ['novel', 'comic', 'anime'].forEach(m => {
        const rows = Array.from(document.querySelectorAll(`#common-${m}-editor .common-url-row`));
        commonUrls[m] = rows.map(r => ({
          url: r.querySelector('.c-url').value.trim(),
          name: r.querySelector('.c-name').value.trim(),
          visible: r.querySelector('.c-visible').checked
        })).filter(u => u.url);
      });
      await Storage.saveCommonUrls(commonUrls); commonUrlsModal.style.display = 'none'; renderCommonUrls(); await loadEntries();
    };
    tagManageBtn.onclick = () => showManageModal('tag');
    mediumManageBtn.onclick = () => showManageModal('medium');
    closeManage.onclick = () => manageModal.style.display = 'none';
    saveManageBtn.onclick = () => saveGlobalChanges();
    addManageItemBtn.onclick = () => addManageItemRow('', '');
    document.querySelectorAll('.add-progress-btn').forEach(btn => { 
      btn.onclick = () => addProgressInputRow(btn.closest('.progress-section').querySelector('.progress-items'), btn.closest('.media-category-group').getAttribute('data-media'), '', ''); 
    });
    document.querySelectorAll('.add-url-complex-btn').forEach(btn => { 
      btn.onclick = () => addUrlComplexInputRow(btn.closest('.url-section').querySelector('.url-items'), btn.closest('.media-category-group').getAttribute('data-media'), '', ''); 
    });
    document.getElementById('addOtherNameBtn').onclick = () => addOtherNameInput('');
    document.getElementById('addTagBtn').onclick = () => addTagInput('');
    document.querySelectorAll('.add-common-btn').forEach(btn => { 
      btn.onclick = () => addCommonUrlRow(document.getElementById(`common-${btn.getAttribute('data-type')}-editor`), '', '', true); 
    });
    exportAllBtn.onclick = async () => {
      const data = await Storage.getData(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `mediatracker_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    importBtn.onclick = () => importInput.click();
    importInput.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => { try { const data = JSON.parse(event.target.result); if (data.mediaEntries) { await chrome.storage.local.set(data); location.reload(); } } catch (err) { alert('檔案格式錯誤'); } };
      reader.readAsText(file);
    };
    addEntryBtn.onclick = () => {
      entryForm.reset(); document.getElementById('editId').value = '';
      document.querySelectorAll('.progress-items, .url-items, #other-names-inputs, #f-tags-inputs').forEach(c => c.innerHTML = '');
      renderEditFormDynamicFields();
      openModal();
    };
    closeBtn.onclick = cancelBtn.onclick = () => closeModal();
    closeCommon.onclick = () => commonUrlsModal.style.display = 'none';
    
    // 防止選取文字誤觸背景關閉
    let mouseDownTarget = null;
    window.addEventListener('mousedown', (e) => mouseDownTarget = e.target);
    window.addEventListener('mouseup', (e) => {
      if (e.target === modal && mouseDownTarget === modal) closeModal();
      if (e.target === commonUrlsModal && mouseDownTarget === commonUrlsModal) commonUrlsModal.style.display = 'none';
      if (e.target === manageModal && mouseDownTarget === manageModal) manageModal.style.display = 'none';
    });

    let draggedItem = null;
    entryList.addEventListener('dragstart', (e) => {
      const header = e.target.closest('.entry-header');
      if (header) {
        draggedItem = header.closest('.entry');
        if (draggedItem) {
          draggedItem.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        }
      } else {
        e.preventDefault();
      }
    });
    entryList.addEventListener('dragend', async (e) => {
      if (draggedItem) {
        draggedItem.classList.remove('dragging');
        const movedId = draggedItem.getAttribute('data-id');
        const afterElement = draggedItem.nextElementSibling;
        const afterId = afterElement ? afterElement.getAttribute('data-id') : null;
        draggedItem = null;
        const movedEntryIdx = allEntries.findIndex(ent => ent.id === movedId);
        if (movedEntryIdx !== -1) {
          const [movedEntry] = allEntries.splice(movedEntryIdx, 1);
          if (afterId) {
            const afterIdx = allEntries.findIndex(ent => ent.id === afterId);
            allEntries.splice(afterIdx, 0, movedEntry);
          } else {
            allEntries.push(movedEntry);
          }
          await Storage.save(allEntries);
          let filtered = allEntries;
          if (activeFilters.mediums.length > 0) filtered = filtered.filter(e => activeFilters.mediums.includes(e.originalMedium || 'Unknown'));
          if (activeFilters.types.length > 0) filtered = filtered.filter(e => activeFilters.types.some(type => { const d = migrateEntryData(e[type.toLowerCase()]); return d.progress.length > 0 || d.urls.length > 0; }));
          if (activeFilters.tags.length > 0) filtered = filtered.filter(e => activeFilters.tags.every(t => (e.tags || []).includes(t)));
          renderTOC(filtered);
        }
      }
    });
    entryList.addEventListener('dragover', (e) => { e.preventDefault(); const afterElement = getDragAfterElement(entryList, e.clientY, '.entry'); if (afterElement == null) entryList.appendChild(draggedItem); else entryList.insertBefore(draggedItem, afterElement); });

    let draggedCommonItem = null;
    ['novel', 'comic', 'anime'].forEach(m => {
      const container = document.getElementById(`common-${m}-editor`);
      container.addEventListener('dragstart', (e) => {
        draggedCommonItem = e.target.closest('.common-url-row');
        if (draggedCommonItem) {
          draggedCommonItem.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        }
      });
      container.addEventListener('dragend', (e) => {
        if (draggedCommonItem) {
          draggedCommonItem.classList.remove('dragging');
          draggedCommonItem = null;
        }
      });
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedCommonItem) return;
        if (draggedCommonItem.parentNode !== container) return;
        const afterElement = getDragAfterElement(container, e.clientY, '.common-url-row');
        if (afterElement == null) {
          container.appendChild(draggedCommonItem);
        } else {
          container.insertBefore(draggedCommonItem, afterElement);
        }
      });
    });
  }

  function addProgressInputRow(container, category, desc, val) {
    const div = document.createElement('div'); div.className = 'row input-item-row progress-row';
    const isSeason = desc === '第 N 季';
    let sVal = '', eVal = val;
    if (isSeason && val.includes(',')) { const parts = val.split(','); sVal = parts[0]; eVal = parts[1] || ''; }
    div.innerHTML = `<input type="text" class="p-desc" list="${category}-prog-desc" placeholder="說明" value="${desc}"><div class="p-val-container" style="flex:1; display:flex; gap:5px; align-items:center;">${isSeason ? `<input type="text" class="p-season" placeholder="季" value="${sVal}" style="width:50px;"> 季 <input type="text" class="p-episode" placeholder="集" value="${eVal}" style="width:50px;"> 集` : `<input type="text" class="p-val" placeholder="進度" value="${val}" style="flex:1;">`}</div><button type="button" class="remove-url-btn">×</button>`;
    const descInput = div.querySelector('.p-desc'); const valContainer = div.querySelector('.p-val-container');
    descInput.onmousedown = () => { if(descInput.value) { const v = descInput.value; descInput.value = ''; setTimeout(() => descInput.value = v, 1); } };
    descInput.oninput = () => { if (descInput.value.trim() === '第 N 季') valContainer.innerHTML = `<input type="text" class="p-season" placeholder="季" style="width:50px;"> 季 <input type="text" class="p-episode" placeholder="集" style="width:50px;"> 集`; else valContainer.innerHTML = `<input type="text" class="p-val" placeholder="進度" style="flex:1;">`; };
    div.querySelector('.remove-url-btn').onclick = () => div.remove(); container.appendChild(div);
  }

  function addUrlComplexInputRow(container, category, desc, url) {
    const div = document.createElement('div'); div.className = 'row input-item-row';
    div.innerHTML = `<input type="text" class="u-desc" list="${category}-url-desc" placeholder="描述" value="${desc}"><input type="text" class="u-url" placeholder="URL" value="${url}"><button type="button" class="remove-url-btn">×</button>`;
    const descInput = div.querySelector('.u-desc'); descInput.onmousedown = () => { if(descInput.value) { const v = descInput.value; descInput.value = ''; setTimeout(() => descInput.value = v, 1); } };
    div.querySelector('.remove-url-btn').onclick = () => div.remove(); container.appendChild(div);
  }

  function addOtherNameInput(value) {
    const div = document.createElement('div'); div.className = 'row input-item-row';
    div.innerHTML = `<input type="text" value="${value}" placeholder="其他名稱"><button type="button" class="remove-url-btn">×</button>`;
    div.querySelector('.remove-url-btn').onclick = () => div.remove(); document.getElementById('other-names-inputs').appendChild(div);
  }

  function addTagInput(value) {
    const div = document.createElement('div'); div.className = 'row input-item-row';
    div.innerHTML = `<input type="text" value="${value}" placeholder="Tag名稱"><button type="button" class="remove-url-btn">×</button>`;
    div.querySelector('.remove-url-btn').onclick = () => div.remove(); document.getElementById('f-tags-inputs').appendChild(div);
  }

  function addCommonUrlRow(container, url, name, visible) {
    const div = document.createElement('div'); div.className = 'row common-url-row'; div.draggable = true;
    div.innerHTML = `<span class="drag-handle">⠿</span><input type="checkbox" class="c-visible" ${visible ? 'checked' : ''}><input type="text" class="c-url" placeholder="網址" value="${url}"><input type="text" class="c-name" placeholder="顯示名稱" value="${name}"><button type="button" class="remove-url-btn">×</button>`;
    div.querySelector('.remove-url-btn').onclick = () => div.remove(); container.appendChild(div);
  }

  function changeFontSize(delta) {
    let idx = fontSizes.indexOf(currentFontSize); idx = Math.max(0, Math.min(fontSizes.length - 1, idx + delta));
    currentFontSize = fontSizes[idx]; applyFontSize(currentFontSize); Storage.saveSettings({ fontSizeClass: currentFontSize });
  }

  entryForm.onsubmit = async (e) => {
    e.preventDefault();
    const getProg = (m) => Array.from(document.querySelectorAll(`.media-category-group[data-media="${m}"] .progress-row`)).map(row => {
      const desc = row.querySelector('.p-desc').value.trim();
      const val = desc === '第 N 季' ? (row.querySelector('.p-season').value.trim() + ',' + row.querySelector('.p-episode').value.trim()) : row.querySelector('.p-val').value.trim();
      return { desc, val };
    }).filter(i => i.desc || i.val);
    const getUrl = (m) => Array.from(document.querySelectorAll(`.media-category-group[data-media="${m}"] .url-items .input-item-row`)).map(row => ({
      desc: row.querySelector('.u-desc').value.trim(), val: row.querySelector('.u-url').value.trim()
    })).filter(i => i.val);

    const isNew = !document.getElementById('editId').value;
    const entry = {
      id: document.getElementById('editId').value || (Date.now().toString() + Math.random().toString(36).substr(2, 5)),
      title: document.getElementById('f-title').value,
      watchingTime: { start: document.getElementById('f-watch-start').value, end: document.getElementById('f-watch-end').value },
      otherNames: Array.from(document.getElementById('other-names-inputs').querySelectorAll('input')).map(i => i.value.trim()).filter(v => v),
      tags: Array.from(document.getElementById('f-tags-inputs').querySelectorAll('input')).map(i => i.value.trim()).filter(v => v),
      originalMedium: document.getElementById('f-orig-medium').value.trim(),
      novel: { progress: getProg('novel'), urls: getUrl('novel') }, comic: { progress: getProg('comic'), urls: getUrl('comic') }, anime: { progress: getProg('anime'), urls: getUrl('anime') },
      relatedWorks: document.getElementById('f-related').value, notes: document.getElementById('f-notes').value, thoughts: document.getElementById('f-thoughts').value, updatedAt: Date.now()
    };
    
    if (!isNew) {
      await Storage.update(entry.id, entry);
    } else {
      await Storage.add(entry, currentFirstVisibleId);
    }
    
    let masterChanged = false;
    entry.tags.forEach(t => { if (!masterTags.includes(t)) { masterTags.push(t); masterChanged = true; } });
    if (entry.originalMedium && !masterMediums.includes(entry.originalMedium)) { masterMediums.push(entry.originalMedium); masterChanged = true; }
    if (masterChanged) { await Storage.saveTags(masterTags); await Storage.saveMediums(masterMediums); }
    
    // 成功儲存後不需要提醒，直接強制關閉
    initialFormState = getFormState(); 
    closeModal();
    await loadEntries(); renderFilters();
  };

  async function init() {
    try {
      const data = await Storage.getData();
      allEntries = data.mediaEntries || [];
      commonUrls = data.commonUrls || { novel: [], comic: [], anime: [] };
      masterTags = data.tags || [];
      masterMediums = data.mediums || [];
      currentFontSize = (data.settings && data.settings.fontSizeClass) || 'md';
      applyFontSize(currentFontSize);
      renderCommonUrls();
      renderFilters();
      await loadEntries();
    } catch (e) { console.error("Initialization error:", e); }
    setupEventListeners();
  }

  function formatDateToYYYYMD(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const yyyy = parts[0];
      const m = parseInt(parts[1], 10).toString();
      const d = parseInt(parts[2], 10).toString();
      return `${yyyy}/${m}/${d}`;
    }
    return dateStr;
  }

  const setupDatePicker = (textInputId, pickerId) => {
    const textInput = document.getElementById(textInputId);
    const picker = document.getElementById(pickerId);
    if (textInput && picker) {
      const setDefaultDate = () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        picker.value = `${yyyy}-${mm}-${dd}`;
      };

      const syncValue = () => {
        try {
          const val = textInput.value.trim();
          if (!val) {
            setDefaultDate();
            return;
          }
          // Match YYYY/M/D, YY/M/D, YYYY-M-D, YY-M-D
          const match = val.match(/^(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
          if (match) {
            let y = match[1];
            if (y.length === 2) {
              y = '20' + y;
            }
            const m = match[2].padStart(2, '0');
            const d = match[3].padStart(2, '0');
            picker.value = `${y}-${m}-${d}`;
          } else {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              picker.value = `${y}-${m}-${d}`;
            } else {
              setDefaultDate();
            }
          }
        } catch (e) {
          setDefaultDate();
        }
      };

      picker.addEventListener('mousedown', syncValue);
      picker.addEventListener('focus', syncValue);

      // Force calendar popup to show even if left side of picker is clicked
      picker.addEventListener('click', (e) => {
        try {
          picker.showPicker();
        } catch (err) {}
      });

      const updateText = () => {
        textInput.value = formatDateToYYYYMD(picker.value);
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      };
      picker.onchange = updateText;
      picker.oninput = updateText;
    }
  };

  setupDatePicker('f-watch-start', 'f-watch-start-picker');
  setupDatePicker('f-watch-end', 'f-watch-end-picker');

  await init();
});
