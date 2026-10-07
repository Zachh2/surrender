(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = window.SurrenderPolicy;
  const KEY = 'surrender-desk-student-v4', DEVICE = 'surrender-desk-device-v4', TOKEN = 'surrender-desk-teacher-v4', SNAPSHOT = 'surrender-desk-teacher-snapshot-v4';
  const sections = ['All', 'Cirrus', 'Alto', 'Stratus', 'Nimbus', 'Other'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const nowKey = P.dateKey(new Date());
  let records = [], teacherRecords = [], deviceKey, token = '', teacherMode = false, serverUp = false, working = false, syncAgain = false, storageOK = true;
  let view = 'active', section = 'All', month = +nowKey.slice(5, 7) - 1, year = +nowKey.slice(0, 4), day = '', pageUrl = '', toastTimer, dashboardSignature = '';
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, '0')).join('');
  const format = date => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4500); }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(records)); return true; }
    catch (_) { storageOK = false; $('formError').textContent = 'This browser cannot save records. Enable site storage before submitting.'; $('submitBtn').disabled = true; return false; }
  }
  try {
    deviceKey = localStorage.getItem(DEVICE) || randomKey();
    localStorage.setItem(DEVICE, deviceKey);
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    records = P.maintain(Array.isArray(data) ? data : []);
    // Migrate only this device's own active legacy record; never copy the old teacher register.
    if (!localStorage.getItem(KEY)) {
      const oldId = localStorage.getItem('phone-surrender-active-id-v1');
      const old = JSON.parse(localStorage.getItem('phone-surrender-records-v1') || '[]');
      const own = Array.isArray(old) && old.find(r => r.id === oldId && !r.demo);
      if (own) records = P.maintain([{ ...own, id: 'ps-' + randomKey().slice(0, 24), syncPending: true }]);
    }
    localStorage.removeItem('phone-surrender-records-v1'); localStorage.removeItem('phone-surrender-teacher-session-v1'); localStorage.removeItem('phone-surrender-active-id-v1');
    token = sessionStorage.getItem(TOKEN) || '';
    teacherRecords = P.maintain(JSON.parse(sessionStorage.getItem(SNAPSHOT) || '[]'));
    teacherMode = Boolean(token);
    save();
  } catch (_) { storageOK = false; $('formError').textContent = 'Enable site storage, then reload this page.'; $('submitBtn').disabled = true; }
  function maintain() {
    const old = new Map(records.map(r => [r.id, r]));
    records = P.maintain(records).map(r => old.get(r.id)?.active && !r.active ? { ...r, syncPending: true } : r);
    save();
  }
  async function api(route, data, asTeacher = false) {
    if (location.protocol === 'file:') throw new Error('Open the school website link to sync.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const headers = { 'Content-Type': 'application/json', 'X-Device-Key': deviceKey || '' };
      if (asTeacher) headers.Authorization = 'Bearer ' + token;
      const res = await fetch('/api' + route, { method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data), cache: 'no-store', signal: controller.signal });
      if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('School register unavailable');
      const result = await res.json();
      if (!res.ok) { const error = new Error(result.error || 'Could not sync'); error.status = res.status; throw error; }
      return result;
    } finally { clearTimeout(timer); }
  }
  function network() {
    const pending = records.filter(r => r.syncPending).length;
    $('networkText').textContent = serverUp ? pending ? 'Connected · syncing' : 'Register connected' : pending ? 'Saved here · sync pending' : 'Connecting to register';
    $('networkDot').classList.toggle('offline', !serverUp || Boolean(pending));
    $('teacherSync').textContent = serverUp ? 'Live register · updates automatically' : 'Last saved view · reconnect to update';
  }
  function renderStudent() {
    const active = records.find(r => r.active);
    $('surrenderCard').hidden = Boolean(active); $('successCard').hidden = !active;
    if (active) {
      $('receiptTitle').textContent = active.syncPending ? 'Surrender saved on this phone.' : 'Your phone is already surrendered.';
      $('receiptSync').textContent = active.syncPending ? (active.syncError || 'Waiting to reach the teacher register. Keep this page open to retry.') : 'Your teacher can see this record.';
      $('receiptSync').className = 'receipt-sync ' + (active.syncPending ? 'pending' : 'confirmed');
      $('receipt').innerHTML = [['Student', active.name], ['Section', active.section], ['Surrendered', format(active.surrenderedAt)], ['Auto-unsurrender', format(P.closeAt(active.surrenderedAt))]].map(([label, value]) => '<div class="receipt-row"><span>' + label + '</span><strong>' + escape(value) + '</strong></div>').join('');
    }
    const pending = records.filter(r => r.syncPending).length;
    $('queueNote').hidden = pending === 0;
    $('queueNote').textContent = pending + ' record' + (pending === 1 ? '' : 's') + ' waiting to sync. Reconnect to the same school link; this page retries automatically.';
  }
  function renderMode() {
    $('studentView').hidden = teacherMode; $('teacherView').hidden = !teacherMode;
    $('teacherBtn').hidden = teacherMode;
    if (teacherMode) renderDashboard(); else renderStudent();
  }
  function clearTeacher() {
    token = ''; teacherMode = false; teacherRecords = [];
    sessionStorage.removeItem(TOKEN); sessionStorage.removeItem(SNAPSHOT);
    renderMode();
  }
  async function synchronize() {
    if (working) { syncAgain = true; return; }
    if (!storageOK) return;
    working = true; maintain();
    try {
      // Submit the queue before pulling remote state, so an offline return is never overwritten.
      const queue = records.filter(r => r.syncPending).sort((a, b) => Number(a.active) - Number(b.active) || new Date(a.surrenderedAt) - new Date(b.surrenderedAt));
      for (const pending of queue) {
        const sent = { ...pending };
        try {
          const remote = await api('/records', sent);
          const current = records.find(r => r.id === sent.id);
          if (!current) continue;
          const changedWhileSending = current.active !== sent.active || current.returnedAt !== sent.returnedAt;
          records = records.filter(r => r.id !== sent.id && r.id !== remote.id);
          records.unshift(changedWhileSending ? { ...remote, active: current.active, returnedAt: current.returnedAt, syncPending: true } : { ...remote, syncPending: false });
          if (changedWhileSending) syncAgain = true;
          save();
        } catch (error) {
          if (error.status === 410) { records = records.filter(r => r.id !== sent.id); save(); }
          else if (error.status === 400 || error.status === 403) { pending.syncError = error.message; save(); }
          else throw error;
        }
      }
      const remote = await api('/my-records');
      if (!Array.isArray(remote)) throw new Error('Invalid register response');
      const pending = records.filter(r => r.syncPending);
      records = P.maintain([...pending, ...remote.filter(r => !pending.some(p => p.id === r.id)).map(r => ({ ...r, syncPending: false }))]);
      save(); serverUp = true; $('connectionNote').hidden = true;
      if (teacherMode) {
        try {
          teacherRecords = await api('/records', undefined, true);
          sessionStorage.setItem(SNAPSHOT, JSON.stringify(teacherRecords));
        } catch (error) { if (error.status === 401) { clearTeacher(); openLogin('Please sign in again.'); } else throw error; }
      }
    } catch (error) {
      serverUp = false;
      $('connectionNote').hidden = false;
      $('connectionNote').textContent = error.status === 503 ? error.message : 'Register unreachable. Saved check-ins will sync when this page reconnects.';
    }
    finally {
      working = false; network(); renderMode();
      if (syncAgain) { syncAgain = false; synchronize(); }
    }
  }
  $('surrenderForm').addEventListener('submit', event => {
    event.preventDefault(); maintain();
    if (!storageOK || records.some(r => r.active)) return renderStudent();
    const name = $('studentName').value.trim();
    if (!name) { $('formError').textContent = 'Enter your full name.'; return; }
    const record = { id: 'ps-' + randomKey().slice(0, 32), name, section: $('studentSection').value, phone: $('phoneLabel').value.trim() || 'Not specified', surrenderedAt: new Date().toISOString(), active: true, syncPending: true };
    records.unshift(record);
    if (!save()) { records.shift(); return; }
    $('formError').textContent = ''; renderStudent(); network(); synchronize();
  });
  $('studentUnsurrenderBtn').addEventListener('click', () => {
    const record = records.find(r => r.active); if (!record) return;
    const before = { ...record };
    Object.assign(record, { active: false, returnedAt: new Date().toISOString(), autoClosed: false, syncPending: true });
    if (!save()) { Object.assign(record, before); return; }
    $('surrenderForm').reset(); renderStudent(); toast('Unsurrender saved. Syncing to your teacher…'); synchronize();
  });
  function tabs(id, values, selected, onClick, label) {
    $(id).innerHTML = values.map((v, i) => '<button type="button" class="tab ' + (String(v) === String(selected) ? 'active' : '') + '" aria-pressed="' + (String(v) === String(selected)) + '" data-index="' + i + '">' + escape(label ? label(v) : v) + '</button>').join('');
    $(id).querySelectorAll('button').forEach(button => button.addEventListener('click', () => onClick(values[+button.dataset.index])));
  }
  function filteredMonth() { return teacherRecords.filter(r => !r.active && +P.dateKey(r.returnedAt || r.surrenderedAt).slice(0, 4) === year && +P.dateKey(r.returnedAt || r.surrenderedAt).slice(5, 7) - 1 === month && (section === 'All' || r.section === section)); }
  function visibleRecords() {
    const query = $('searchInput').value.trim().toLowerCase();
    return (view === 'active' ? teacherRecords.filter(r => r.active) : filteredMonth()).filter(r => (section === 'All' || r.section === section) && (!day || view === 'active' || P.dateKey(r.returnedAt || r.surrenderedAt) === day) && (!query || (r.name + ' ' + r.section + ' ' + r.phone).toLowerCase().includes(query))).sort((a, b) => new Date(b.returnedAt || b.surrenderedAt) - new Date(a.returnedAt || a.surrenderedAt));
  }
  function renderDashboard() {
    teacherRecords = P.maintain(teacherRecords);
    const signature = JSON.stringify([teacherRecords, view, section, month, year, day, serverUp, $('searchInput').value]);
    if (signature === dashboardSignature) return;
    dashboardSignature = signature;
    const active = teacherRecords.filter(r => r.active);
    $('activeStat').textContent = active.length;
    $('sectionStat').textContent = new Set(active.map(r => r.section)).size;
    $('lastStat').textContent = teacherRecords.length ? format(teacherRecords.reduce((a, b) => new Date(a.surrenderedAt) > new Date(b.surrenderedAt) ? a : b).surrenderedAt) : '—';
    tabs('viewTabs', ['active', 'history'], view, value => { view = value; day = ''; renderDashboard(); }, v => v === 'active' ? 'Active now' : 'History');
    tabs('sectionTabs', sections, section, value => { section = value; day = ''; renderDashboard(); });
    $('historyFilters').hidden = view !== 'history';
    tabs('monthTabs', months.map((_, i) => i), month, value => { month = value; day = ''; renderDashboard(); }, v => months[v]);
    const years = [...new Set([+nowKey.slice(0, 4), ...teacherRecords.map(r => +P.dateKey(r.returnedAt || r.surrenderedAt).slice(0, 4))])].sort((a, b) => b - a);
    $('historyYear').innerHTML = years.map(y => '<option' + (year === y ? ' selected' : '') + '>' + y + '</option>').join('');
    const days = [...new Set(filteredMonth().map(r => P.dateKey(r.returnedAt || r.surrenderedAt)))].sort().reverse();
    tabs('dateTabs', ['', ...days], day, value => { day = value; renderDashboard(); }, v => v ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(v + 'T12:00:00+08:00')) : 'All dates');
    const list = visibleRecords();
    $('recordCount').textContent = list.length + ' record' + (list.length === 1 ? '' : 's');
    $('recordsHead').innerHTML = '<tr><th>Student</th><th>Section</th><th>Phone</th><th>Surrendered</th><th>' + (view === 'active' ? 'Status' : 'Unsurrendered') + '</th><th>' + (view === 'active' ? 'Action' : 'Method') + '</th></tr>';
    $('recordsBody').innerHTML = list.map(r => '<tr><td data-label="Student"><strong>' + escape(r.name) + '</strong></td><td data-label="Section"><span class="section-badge">' + escape(r.section) + '</span></td><td data-label="Phone">' + escape(r.phone) + '</td><td data-label="Surrendered">' + escape(format(r.surrenderedAt)) + '</td><td data-label="' + (r.active ? 'Status' : 'Unsurrendered') + '">' + (r.active ? '<span class="status-badge">Surrendered</span>' : escape(format(r.returnedAt || r.surrenderedAt))) + '</td><td data-label="' + (r.active ? 'Action' : 'Method') + '">' + (r.active ? '<button class="btn btn-danger return-btn" data-id="' + escape(r.id) + '"' + (!serverUp ? ' disabled' : '') + '>Un-surrender</button>' : '<span class="status-badge ' + (r.autoClosed ? 'auto' : '') + '">' + (r.autoClosed ? 'Auto · 6 PM' : 'Manual') + '</span>') + '</td></tr>').join('');
    $('emptyState').hidden = list.length > 0;
    $('recordsBody').querySelectorAll('.return-btn').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await api('/records/' + button.dataset.id + '/return', {}, true); toast('Phone marked unsurrendered.'); await synchronize(); }
      catch (error) { toast(error.message); button.disabled = false; }
    }));
  }
  $('historyYear').addEventListener('change', () => { year = +$('historyYear').value; day = ''; renderDashboard(); });
  $('searchInput').addEventListener('input', renderDashboard);
  function openLogin(message = '') { $('loginModal').hidden = false; $('teacherPin').value = ''; $('loginError').textContent = message; $('teacherPin').focus(); }
  function closeLogin() { $('loginModal').hidden = true; $('teacherBtn').focus(); }
  $('teacherBtn').addEventListener('click', () => openLogin());
  $('cancelLoginBtn').addEventListener('click', closeLogin);
  $('loginModal').addEventListener('keydown', event => {
    if (event.key === 'Escape') closeLogin();
    if (event.key === 'Tab') {
      const nodes = [...$('loginModal').querySelectorAll('button,input')], first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); $('loginBtn').disabled = true; $('loginError').textContent = '';
    try {
      const result = await api('/login', { password: $('teacherPin').value });
      token = result.token; sessionStorage.setItem(TOKEN, token); teacherMode = true; serverUp = true;
      $('loginModal').hidden = true; $('teacherPin').value = ''; renderMode(); await synchronize();
    } catch (error) { $('loginError').textContent = error.status ? error.message : 'Teacher register unreachable. Check your connection and try again.'; }
    finally { $('loginBtn').disabled = false; }
  });
  $('exitTeacherBtn').addEventListener('click', async () => { try { await api('/logout', {}, true); } catch (_) {} clearTeacher(); });
  function download(content, type, filename) {
    const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('exportBtn').addEventListener('click', () => {
    const safeCell = v => { let s = String(v ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = [['Name', 'Section', 'Phone', 'Surrendered at', 'Unsurrendered at', 'Status'], ...visibleRecords().map(r => [r.name, r.section, r.phone, r.surrenderedAt, r.returnedAt || '', r.active ? 'Surrendered' : r.autoClosed ? 'Auto-unsurrendered' : 'Unsurrendered'])];
    download('\uFEFF' + rows.map(row => row.map(safeCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8', 'phone-register-' + nowKey + '.csv');
  });
  $('exportJsonBtn').addEventListener('click', () => download(JSON.stringify(teacherRecords, null, 2), 'application/json', 'phone-register-' + nowKey + '.json'));
  function setQR(url) {
    pageUrl = url; $('qrLink').textContent = url;
    try { localStorage.setItem('surrender-desk-last-qr-v4', url); } catch (_) {}
    try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qrImage').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true })); $('qrImage').hidden = false; $('qrFallback').hidden = true; }
    catch (_) { $('qrImage').hidden = true; $('qrFallback').hidden = false; }
  }
  async function initQR() {
    if (location.protocol === 'file:') { $('qrImage').hidden = true; $('qrFallback').hidden = false; $('qrFallback').textContent = 'Open the school server link to generate its QR.'; $('qrLink').textContent = 'Local file preview'; $('copyLinkBtn').disabled = true; return; }
    const url = new URL('./', location.href); url.search = '?scan=1';
    setQR(url.href);
  }
  $('lanUrls').addEventListener('change', () => setQR($('lanUrls').value));
  $('copyLinkBtn').addEventListener('click', async () => {
    if (!pageUrl) return toast('No reachable school link yet.');
    try { await navigator.clipboard.writeText(pageUrl); toast('Student link copied.'); } catch (_) { window.prompt('Copy the student link:', pageUrl); }
  });
  $('printQrBtn').addEventListener('click', () => window.print());
  window.addEventListener('online', synchronize);
  window.addEventListener('offline', () => { serverUp = false; network(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { maintain(); renderMode(); synchronize(); } });
  window.addEventListener('storage', event => {
    if (event.key === KEY) { try { records = P.maintain(JSON.parse(event.newValue || '[]')); renderStudent(); } catch (_) {} }
  });
  maintain(); renderMode(); network(); initQR(); synchronize();
  function poll() {
    maintain(); renderMode();
    if (!document.hidden) synchronize();
    setTimeout(poll, teacherMode ? 8000 : records.some(r => r.syncPending) ? 15000 : 60000);
  }
  setTimeout(poll,8000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js?v=6').then(() => navigator.serviceWorker.ready).then(() => { $('cacheNote').textContent = 'This browser has saved the app for offline use.'; }).catch(() => {});
})();
