// Real layout smoke test: node tests/sticky-browser.cjs <chrome.exe>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediatracker-sticky-'));
const fixture = {
  mediaEntries: Array.from({ length: 45 }, (_, i) => ({ id: `e${i}`, title: `作品 ${i}` })),
  bookmarks: [0, 12, 24, 36].map((i, n) => ({ id: `b${n}`, name: `分組 ${n}`, beforeEntryId: `e${i}` }))
};
const setup = `<script>
const fixture = ${JSON.stringify(fixture)};
// Keep main-page scroll highlighting from changing the test's sidebar position.
window.IntersectionObserver = class { observe() {} disconnect() {} };
window.chrome = { storage: { local: {
  get(keys, callback) { callback(fixture); }, async set(data) { Object.assign(fixture, data); }
} } };
</script>`;
const check = `<script>
window.addEventListener('load', () => setTimeout(async () => {
  const results = [];
  const verify = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve, 80));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
  try {
    const list = document.getElementById('toc-list');
    const top = document.getElementById('bookmark-top');
    const bottom = document.getElementById('bookmark-bottom');
    const rows = [...list.querySelectorAll('.toc-bookmark')];
    await settle();
    verify(document.getElementById('bookmark-bottom-slot').getBoundingClientRect().bottom <= window.innerHeight, 'bottom hint stays inside browser viewport below page header');
    verify(!bottom.hidden, 'bottom bookmark is available before scrolling the page');
    document.getElementById('sidebar').style.maxHeight = '500px';
    verify(rows.length === 4, 'dashboard renders fixture bookmarks');
    list.scrollTop = 0;
    await settle();
    verify(top.hidden && !bottom.hidden, 'initial next bookmark appears at bottom');
    const height = list.clientHeight;
    verify(document.getElementById('bookmark-top-slot').hidden, 'top slot collapses at start');
    verify(list.getBoundingClientRect().top - document.getElementById('addBookmarkBtn').getBoundingClientRect().bottom < 2, 'no empty row below add bookmark button');
    verify(document.getElementById('bookmark-top-slot').getBoundingClientRect().bottom <= list.getBoundingClientRect().top, 'top slot reserves space');
    verify(document.getElementById('bookmark-bottom-slot').getBoundingClientRect().top >= list.getBoundingClientRect().bottom, 'bottom slot reserves space');
    list.scrollTop = rows[1].offsetTop - list.clientHeight + 5;
    await settle();
    list.scrollTop = rows[1].offsetTop - list.clientHeight + 5;
    await settle();
    verify(!top.hidden && top.dataset.bookmarkId === 'b0', 'previous bookmark pins at top: ' + JSON.stringify({ scroll: list.scrollTop, height: list.clientHeight, id: top.dataset.bookmarkId }));
    verify(bottom.dataset.bookmarkId === 'b2', 'partly visible bookmark returns to natural row');
    verify(!document.getElementById('bookmark-top-slot').hidden && list.clientHeight < height, 'top hint reserves space only while needed');
    const stickyHeight = list.clientHeight;
    await settle();
    verify(list.clientHeight === stickyHeight, 'sticky layout settles without oscillation');
    list.scrollTop = rows[1].offsetTop + rows[1].offsetHeight + 1;
    await settle();
    verify(top.dataset.bookmarkId === 'b1', 'newly passed bookmark replaces top');
    window.matchMedia = () => ({ matches: true });
    top.click();
    await settle();
    let bounds = rows[1].getBoundingClientRect();
    let viewport = list.getBoundingClientRect();
    verify(bounds.top >= viewport.top && bounds.bottom <= viewport.bottom, 'top click reveals original bookmark');
    const targetId = bottom.dataset.bookmarkId;
    verify(Boolean(targetId), 'bottom jump target exists');
    bottom.click();
    await settle();
    bounds = rows.find(row => row.dataset.bookmarkId === targetId).getBoundingClientRect();
    viewport = list.getBoundingClientRect();
    verify(bounds.top >= viewport.top && bounds.bottom <= viewport.bottom, 'bottom click reveals original bookmark');
    list.scrollTop = list.scrollHeight;
    await settle();
    verify(bottom.hidden, 'bottom hint disappears after final bookmark');
    list.scrollTop = 0;
    await settle();
    verify(top.hidden && document.getElementById('bookmark-top-slot').hidden, 'returning to start removes top blank space');
    verify(list.clientHeight === height, 'returning to start restores list space');
    list.scrollTop = list.scrollHeight;
    await settle();
    document.body.className = 'font-size-xl';
    await settle();
    verify(!top.hidden, 'font resize recalculates edges');
    document.getElementById('sidebar').style.maxHeight = '450px';
    await settle();
    verify(list.clientHeight < height, 'viewport resize retains reserved slots');
    const output = document.createElement('pre'); output.id = 'browser-result';
    output.textContent = JSON.stringify({ passed: true, results }); document.body.append(output);
  } catch (error) {
    const output = document.createElement('pre'); output.id = 'browser-result';
    output.textContent = JSON.stringify({ passed: false, error: error.message, results }); document.body.append(output);
  }
}, 250));
</script>`;
let html = fs.readFileSync(path.join(root, 'dashboard/dashboard.html'), 'utf8');
html = html.replace('href="dashboard.css"', `href="${pathToFileURL(path.join(root, 'dashboard/dashboard.css'))}"`)
  .replace('<script src="../js/storage.js"></script>', setup + `<script src="${pathToFileURL(path.join(root, 'js/storage.js'))}"></script>`)
  .replace('src="dashboard.js"', `src="${pathToFileURL(path.join(root, 'dashboard/dashboard.js'))}"`)
  .replace('</body>', check + '</body>');
const file = path.join(dir, 'fixture.html');
fs.writeFileSync(file, html);
async function main() {
  const profile = path.join(dir, 'profile');
  const browser = spawn(process.argv[2], ['--headless', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--allow-file-access-from-files', '--window-size=1100,800',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  let socket;
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const deadline = Date.now() + 20000;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    while (!fs.existsSync(portFile) && Date.now() < deadline) await pause();
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const response = JSON.parse(event.data);
      if (pending.has(response.id)) {
        pending.get(response.id)(response);
        pending.delete(response.id);
      }
    };
    const send = (method, params) => new Promise(resolve => {
      const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params }));
    });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let result;
    while (Date.now() < deadline) {
      const response = await send('Runtime.evaluate', { expression: "document.getElementById('browser-result')?.textContent", returnByValue: true });
      if (response.result?.result?.value) { result = JSON.parse(response.result.result.value); break; }
      await pause();
    }
    assert.ok(result, 'browser test produced a result');
    console.log(JSON.stringify(result, null, 2));
    assert.equal(result.passed, true);
  } finally {
    socket?.close();
    browser.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
