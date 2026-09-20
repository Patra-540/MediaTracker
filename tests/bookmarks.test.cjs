const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dashboard/dashboard.js'), 'utf8'), context);
const plain = value => JSON.parse(JSON.stringify(value));
const entries = ['a', 'b', 'c'].map(id => ({ id }));
const markers = [
  { id: 'one', name: '第一組', beforeEntryId: 'a' },
  { id: 'two', name: '第二組', beforeEntryId: 'b' },
  { id: 'three', name: '第三組', beforeEntryId: 'b' }
];
const order = (bookmarks, visible = entries, all = entries) =>
  plain(context.buildTOCRows(all, visible, bookmarks)).map(row => row.item.id);

test('sticky edges select the nearest fully offscreen bookmarks in both directions', () => {
  const bounds = [
    { id: 'one', top: 0, bottom: 30 },
    { id: 'two', top: 200, bottom: 230 },
    { id: 'three', top: 400, bottom: 430 },
    { id: 'four', top: 600, bottom: 630 }
  ];
  const edges = (top, bottom) => plain(context.getBookmarkEdges(bounds, top, bottom));
  assert.deepEqual(edges(0, 200), { top: null, bottom: 'two' });
  assert.deepEqual(edges(30, 201), { top: 'one', bottom: 'three' });
  assert.deepEqual(edges(210, 400), { top: 'one', bottom: 'three' });
  assert.deepEqual(edges(230, 401), { top: 'two', bottom: 'four' });
  assert.deepEqual(edges(430, 650), { top: 'three', bottom: null });
  assert.deepEqual(edges(0, 650), { top: null, bottom: null });
  assert.deepEqual(plain(context.getBookmarkEdges([], 0, 100)), { top: null, bottom: null });
});

test('markers render between entries and remain ordered when entries are filtered', () => {
  assert.deepEqual(order(markers), ['one', 'a', 'two', 'three', 'b', 'c']);
  assert.deepEqual(order(markers, [entries[2]]), ['one', 'two', 'three', 'c']);
  assert.deepEqual(order(markers, []), ['one', 'two', 'three']);
});

test('drag moves to start, between markers, before an entry, and to end without changing entries', () => {
  let moved = context.moveBookmark(markers, 'three', { kind: 'bookmark', item: markers[0] });
  assert.deepEqual(order(moved), ['three', 'one', 'a', 'two', 'b', 'c']);
  moved = context.moveBookmark(markers, 'one', { kind: 'bookmark', item: markers[2] });
  assert.deepEqual(order(moved), ['a', 'two', 'one', 'three', 'b', 'c']);
  moved = context.moveBookmark(markers, 'one', { kind: 'entry', item: entries[2] });
  assert.deepEqual(order(moved), ['a', 'two', 'three', 'b', 'one', 'c']);
  moved = context.moveBookmark(markers, 'one', null);
  assert.deepEqual(order(moved), ['a', 'two', 'three', 'b', 'c', 'one']);
  assert.deepEqual(entries.map(entry => entry.id), ['a', 'b', 'c']);
  assert.equal(markers[0].beforeEntryId, 'a');
});

test('markers follow reordered entries, retain missing anchors at end, and support empty lists', () => {
  assert.deepEqual(order(markers, entries, [entries[1], entries[0], entries[2]]), ['two', 'three', 'b', 'one', 'a', 'c']);
  assert.deepEqual(order(markers, [entries[0], entries[2]], [entries[0], entries[2]]), ['one', 'a', 'c', 'two', 'three']);
  assert.deepEqual(order(markers, [], []), ['one', 'two', 'three']);
  assert.deepEqual(plain(context.moveBookmark(markers, 'unknown', null)), markers);
});

test('bookmark rename, order, and deletion persist and are included in backup data', async () => {
  let saved = { mediaEntries: entries };
  const storageContext = vm.createContext({ chrome: { storage: { local: {
    get(keys, callback) { callback(Object.fromEntries(keys.filter(key => key in saved).map(key => [key, saved[key]]))); },
    async set(data) { saved = { ...saved, ...structuredClone(data) }; }
  } } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/storage.js'), 'utf8') + '\nthis.storage = Storage;', storageContext);
  const storage = storageContext.storage;
  assert.deepEqual(plain((await storage.getData()).bookmarks), []);
  const renamed = markers.map(marker => marker.id === 'one' ? { ...marker, name: '新名稱 < & "' } : marker);
  const moved = context.moveBookmark(renamed, 'one', null);
  await storage.saveBookmarks(moved);
  assert.deepEqual(plain((await storage.getData()).bookmarks), plain(moved));
  assert.equal((await storage.getData()).bookmarks.at(-1).name, '新名稱 < & "');
  await storage.saveBookmarks(moved.filter(marker => marker.id !== 'two'));
  assert.deepEqual(plain((await storage.getData()).bookmarks).map(marker => marker.id), ['three', 'one']);
  assert.deepEqual(plain((await storage.getData()).mediaEntries), entries);
});
