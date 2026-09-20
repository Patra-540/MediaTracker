const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, '../dashboard/dashboard.js'), 'utf8');
function section(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

class Element {
  constructor(value = '') { this.value = value; this.listeners = {}; this.children = []; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); }
  appendChild(child) { this.children.push(child); }
  set innerHTML(html) {
    this.html = html;
    this.inputs = [...html.matchAll(/<input\b([^>]*)>/g)].map(([, attrs]) => {
      const input = new Element(attrs.match(/value="([^"]*)"/)?.[1] || '');
      input.className = attrs.match(/class="([^"]*)"/)?.[1] || '';
      return input;
    });
    if (html.includes('p-val-container')) {
      this.container = new Element();
      this.container.innerHTML = html.match(/<div class="p-val-container"[^>]*>(.*?)<\/div>/)[1];
    }
  }
  querySelector(selector) {
    if (selector === '.p-val-container') return this.container;
    if (selector === '.remove-url-btn') return {};
    return this.inputs?.find(input => input.className === selector.slice(1)) || null;
  }
}

test('empty date can select today, clear it, and select today again', () => {
  for (const id of ['start', 'end']) {
    const text = new Element();
    const picker = new Element();
    const context = vm.createContext({ document: { getElementById: key => key === id ? text : picker }, Event });
    vm.runInContext(section('  function formatDateToYYYYMD', "  setupDatePicker('f-watch-start'") + `setupDatePicker('${id}', 'picker');`, context);
    assert.equal(picker.value, '');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      picker.value = today;
      picker.oninput();
      assert.equal(text.value, `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`);
      picker.value = '';
      picker.onchange();
      assert.equal(text.value, '');
      assert.equal(picker.value, '');
    }
    text.value = '24/2/29';
    text.dispatchEvent(new Event('input'));
    assert.equal(picker.value, '2024-02-29');
  }
});

test('episode display and existing chapter/season display', () => {
  const context = vm.createContext({ document: { addEventListener() {}, createElement: () => new Element() } });
  vm.runInContext(source, context);
  for (const [desc, val, expected] of [['第 N 集', '170', '第 170 集'], ['第 N 話', '12', '第 12 話'], ['第 N 季', '2,8', '第 2 季 第 8 集']]) {
    context.sortedP = [{ desc, val }];
    context.ul = new Element();
    vm.runInContext(section('          sortedP.forEach(p => {', '          progTd.appendChild(ul);'), context);
    assert.equal(context.ul.children[0].html, `${expected}<br>`);
  }
});

test('unsaved state tracks every text field and preserves field boundaries', () => {
  const fields = ['f-title', 'f-watch-start', 'f-watch-end', 'f-orig-medium', 'f-related', 'f-notes', 'f-thoughts'].map(id => ({ id, className: '', value: '', classList: { contains: () => false } }));
  const context = vm.createContext({ entryForm: { querySelectorAll: () => fields } });
  vm.runInContext(section('  function getFormState()', '  function openModal()'), context);
  const snapshot = () => vm.runInContext('getFormState()', context);
  const initial = snapshot();
  for (const field of fields) {
    field.value = 'changed';
    assert.notEqual(snapshot(), initial, field.id);
    field.value = '';
  }
  fields[4].value = 'ab'; fields[5].value = 'c';
  const before = snapshot();
  fields[4].value = 'a'; fields[5].value = 'bc';
  assert.notEqual(snapshot(), before);
});

test('progress edits preserve values and season-only data stays in season field', () => {
  const context = vm.createContext({ document: { createElement: () => new Element() } });
  vm.runInContext(section('  function addProgressInputRow(', '  function addUrlComplexInputRow('), context);
  context.parent = new Element();
  vm.runInContext("addProgressInputRow(parent, 'anime', '第 N 季', '2');", context);
  const season = context.parent.children[0].container;
  assert.equal(season.querySelector('.p-season').value, '2');
  assert.equal(season.querySelector('.p-episode').value, '');
  vm.runInContext("addProgressInputRow(parent, 'anime', '第 N 集', '170');", context);
  const row = context.parent.children[1];
  const desc = row.querySelector('.p-desc');
  desc.value = '自訂說明'; desc.oninput();
  assert.equal(row.container.querySelector('.p-val').value, '170');
  desc.value = '第 N 季'; desc.oninput();
  assert.equal(row.container.querySelector('.p-episode').value, '170');
  desc.value = '第 N 集'; desc.oninput();
  assert.equal(row.container.querySelector('.p-val').value, '170');
});
