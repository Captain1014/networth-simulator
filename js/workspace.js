/* Browser integration. Loaded after app.js and before DOMContentLoaded. */
const W = {
  state: NWCore.emptyState(), store: null, ready: false, pending: false, legacy: null,
  fingerprint: '', undo: null, fxBusy: false, fxMessage: '', loadedFx: false,
};
const FX_KEY = 'networth-simulator-fx';
const LAST_BACKUP_KEY = 'networth-simulator-last-backup';
function L(en, ko) { return LOCALE === 'ko' ? ko : en; }
function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function saveCurrentEntries() {
  try {
    const state = captureState();
    if (!window.confirm(L(
      'Save the USD/KRW amounts currently shown on this screen? They will not be converted or replaced by the previous copy. The stored original will be kept separately for recovery.',
      '지금 화면에 입력한 USD/KRW 금액을 저장할까요? 통화를 변환하거나 이전 저장본으로 교체하지 않습니다. 기존 저장 원본은 복구용으로 별도 보존합니다.'))) return false;
    if (W.store.storage.getItem(NWCore.KEY) !== W.store.raw) throw new Error('conflict');
    W.store.preserve();
    const wasBlocked = W.store.blocked;
    W.store.blocked = false;
    state.updatedAt = new Date().toISOString();
    try { W.store.save(state); }
    catch (error) { W.store.blocked = wasBlocked; throw error; }
    W.state = state;
    W.legacy = null;
    W.pending = false;
    clearTimeout(saveTimeout);
    document.getElementById('saveCurrentEntries').hidden = true;
    document.getElementById('migrateLegacy').hidden = true;
    renderAll();
    flushStateSave();
    return true;
  } catch (error) {
    setNotice(error.message === 'conflict'
      ? L('Another tab changed the stored copy. Your current entries are still on screen; export them before reloading.', '다른 탭에서 저장본을 변경했습니다. 현재 입력은 화면에 남아 있으니 새로고침 전에 백업하세요.')
      : L('Could not save. Your entries are still on screen and the stored original was not replaced. Check the inputs or download an encrypted backup.', '저장하지 못했습니다. 입력값은 화면에 남아 있고 기존 저장본은 교체되지 않았습니다. 입력을 확인하거나 암호화 백업을 다운로드하세요.'));
    return false;
  }
}
function safeRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, typeof v === 'string' ? escapeHTML(v) : v]));
}
function nativeMoney(n, currency) {
  return new Intl.NumberFormat(LOCALE === 'ko' ? 'ko-KR' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(n);
}
function displayAmount(n) { return NWCore.fromUSD(n, W.state.displayCurrency, W.state.fx); }
function fmtDisplayed(n) {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(LOCALE === 'ko' ? 'ko-KR' : 'en-US', {
    style: 'currency', currency: W.state.displayCurrency, notation: 'compact', maximumFractionDigits: 2,
  }).format(n);
}
function objectMoney(record, field) { return NWCore.toUSD(record[field] ?? '', record.currency, W.state.fx); }
function currencySelect(value, onChange) {
  return `<label class="currency-picker">${L('Input currency', '입력 통화')}
    <select aria-label="${L('Input currency', '입력 통화')}" onchange="${onChange}">
      <option value="USD"${value === 'USD' ? ' selected' : ''}>USD</option>
      <option value="KRW"${value === 'KRW' ? ' selected' : ''}>KRW</option>
    </select></label>`;
}
function setStatus(message, error = false) {
  const el = document.getElementById('saveStatus');
  if (el) { el.textContent = message; el.classList.toggle('status-error', error); }
}
function setNotice(message) {
  const el = document.getElementById('workspaceNotice');
  el.textContent = message;
  el.hidden = !message;
}
function captureState() {
  const s = { ...W.state, inputs: {}, money: {}, accounts, events, housingScenarios, currentSc,
    showRetireOnly: document.getElementById('showRetireOnly').checked };
  for (const id of Object.keys(NWCore.DEFAULT_INPUTS)) s.inputs[id] = document.getElementById(id).value;
  for (const id of NWCore.MONEY_IDS) s.money[id] = {
    USD: document.getElementById(id).value, KRW: document.getElementById(id + '_KRW').value,
  };
  return NWCore.validate(s);
}
function queueStateSave() {
  if (!W.ready || W.store.blocked) return;
  W.pending = true;
  setStatus(L('Saving…', '저장 중…'));
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(flushStateSave, 400);
}
function flushStateSave() {
  clearTimeout(saveTimeout);
  if (!W.pending || !W.ready || W.store.blocked) return;
  try {
    const state = captureState();
    state.updatedAt = new Date().toISOString();
    W.store.save(state);
    W.state = state;
    W.pending = false;
    setStatus(L('Saved in this browser · ', '이 브라우저에 저장됨 · ') + new Date(state.updatedAt).toLocaleTimeString());
    return true;
  } catch (error) {
    setStatus(error.message === 'conflict'
      ? L('Another tab changed the data. Export your edits, then reload.', '다른 탭에서 데이터가 변경되었습니다. 수정 내용을 백업한 뒤 새로고침하세요.')
      : L('Not saved. Check the inputs or download an encrypted backup.', '저장되지 않았습니다. 입력을 확인하거나 암호화 백업을 받으세요.'), true);
    return false;
  }
}
function applyWorkspaceState(state) {
  const next = NWCore.validate(state);
  W.state = next;
  accounts = next.accounts;
  events = next.events;
  housingScenarios = next.housingScenarios;
  acid = Math.max(0, ...accounts.map(a => a.id));
  eid = Math.max(0, ...events.map(e => e.id));
  hsid = Math.max(0, ...housingScenarios.map(h => h.id));
  currentSc = next.currentSc;
  for (const [id, value] of Object.entries(next.inputs)) document.getElementById(id).value = value;
  for (const [id, values] of Object.entries(next.money)) {
    document.getElementById(id).value = values.USD;
    document.getElementById(id + '_KRW').value = values.KRW;
  }
  document.getElementById('showRetireOnly').checked = next.showRetireOnly;
  document.getElementById('displayCurrency').value = next.displayCurrency;
  document.getElementById('projectionStartDate').value = next.projectionStartDate;
  ['base', 'opt', 'pes'].forEach(sc => document.getElementById('tab-' + sc)?.classList.toggle('active', sc === currentSc));
  mcResult = null;
  housingResult = null;
  W.fingerprint = '';
  updateMcSuccessLabel();
  document.getElementById('mcStale').hidden = chartMode !== 'montecarlo';
  renderAccountList();
  renderEventList();
  renderHousingScenarioList();
  enhanceAccessibility();
  updateFxStatus();
}
function confirmLegacyCurrency(raw) {
  const lines = [];
  for (const id of NWCore.MONEY_IDS) {
    const value = raw?.inputs?.[id];
    if (value != null && String(value).trim() !== '' && String(value) !== '0') {
      lines.push(`${t('label.' + id)}: ${String(value).slice(0, 80)}`);
    }
  }
  for (const account of (Array.isArray(raw?.accounts) ? raw.accounts : []).slice(0, 20)) {
    lines.push(`${String(account.name || L('Account', '계좌')).slice(0, 80)}: ${String(account.balance ?? '').slice(0, 80)}`);
  }
  if (!window.confirm(L(
    'Review this previous copy before choosing its currency. It is NOT the current USD/KRW entries on your screen.\n\n',
    '통화를 선택하기 전에 이 저장본의 내용을 확인하세요. 지금 화면의 USD/KRW 입력과는 별개인 데이터입니다.\n\n') +
    (lines.join('\n') || L('No monetary values listed.', '표시할 금액이 없습니다.')) + '\n\n' +
    L('Continue only if you want to load this copy instead of your current entries. Cancel changes nothing.',
      '현재 입력 대신 이 저장본을 불러오려는 경우에만 계속하세요. 취소하면 아무것도 변경되지 않습니다.'))) return null;
  const answer = window.prompt(L(
    'For the copy you just reviewed: were its amounts entered in USD or KRW? Cancel if currencies were mixed or you are unsure.',
    '방금 확인한 저장본의 금액을 USD와 KRW 중 어떤 통화로 입력했나요? 혼합 입력했거나 모르시면 취소하세요.'));
  if (answer == null) return null;
  const c = answer.trim().toUpperCase();
  if (!['USD', 'KRW'].includes(c)) throw new Error('currency');
  return c;
}
function normalizedImport(raw) {
  if ([2, NWCore.VERSION].includes(raw?.schemaVersion)) return NWCore.validate(raw);
  if (!raw || raw.schemaVersion != null || typeof raw.inputs !== 'object' || raw.inputs === null) throw new Error('schema');
  const c = confirmLegacyCurrency(raw);
  return c ? NWCore.migrate(raw, c) : null;
}
function importWorkspace(raw) {
  const state = normalizedImport(raw);
  if (!state) return false;
  const summary = `${state.accounts.length} ${L('accounts', '계좌')}, ${state.events.length} ${L('events', '이벤트')}, ${state.housingScenarios.length} ${L('housing scenarios', '주거 시나리오')}`;
  if (!window.confirm(L('Replace current data with ', '다음 데이터로 현재 내용을 교체할까요? ') + summary + '?\n' +
      L('A recovery copy of the stored data will be kept.', '현재 저장본은 복구용으로 보존됩니다.'))) return false;
  // Do not overwrite a save changed elsewhere while a modal was open.
  if (W.store.storage.getItem(NWCore.KEY) !== W.store.raw) throw new Error('conflict');
  W.store.preserve();
  W.store.blocked = false;
  applyWorkspaceState(state);
  W.legacy = null;
  document.getElementById('migrateLegacy').hidden = true;
  document.getElementById('saveCurrentEntries').hidden = true;
  setNotice('');
  renderAll();
  W.pending = true;
  const saved = flushStateSave();
  if (!saved) setNotice(L('Data loaded, but browser saving failed. Download an encrypted backup before closing.', '데이터를 불러왔지만 브라우저 저장에 실패했습니다. 닫기 전에 암호화 백업을 다운로드하세요.'));
  return true;
}
function migrateLegacySave() {
  try { if (W.legacy) importWorkspace(W.legacy); }
  catch (_) { setNotice(L('Could not migrate. Original data was not replaced. Check the currency and data.', '이전하지 못했습니다. 원본은 교체되지 않았습니다. 통화와 데이터를 확인하세요.')); }
}
function downloadFile(content, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadRecovery() {
  try {
    const raw = W.store.storage.getItem(NWCore.KEY);
    if (raw == null) return;
    if (!confirm(L('This recovery file is NOT encrypted. Keep it private. Continue?', '이 복구 파일은 암호화되지 않습니다. 안전한 곳에 보관하세요. 계속할까요?'))) return;
    downloadFile(raw, 'networth-recovery.json', 'application/json');
  } catch (_) { setNotice(L('Browser storage is unavailable.', '브라우저 저장소를 읽을 수 없습니다.')); }
}
function restorePrevious() {
  try {
    const raw = W.store.storage.getItem(NWCore.KEY + ':previous');
    if (!raw) { setNotice(L('No previous snapshot is available.', '이전 정상 저장본이 없습니다.')); return; }
    importWorkspace(JSON.parse(raw));
  } catch (_) { setNotice(L('Could not restore the previous snapshot. Stored data was preserved.', '이전 저장본을 복원하지 못했습니다. 저장된 원본은 보존됩니다.')); }
}
function rememberUndo() { W.undo = getStateForExport(); document.getElementById('undoDelete').hidden = false; }
function undoDelete() {
  if (!W.undo) return;
  const state = W.undo;
  W.undo = null;
  applyWorkspaceState(state);
  document.getElementById('undoDelete').hidden = true;
  renderAll();
}
function setDisplayCurrency(value) {
  W.state.displayCurrency = value;
  renderAll();
}
function updateFxStatus() {
  const fx = W.state.fx;
  const el = document.getElementById('fxStatus');
  if (!el) return;
  const stale = NWCore.validFx(fx) && Date.now() - Date.parse(fx.date) > 4 * 86400000;
  el.textContent = NWCore.validFx(fx)
    ? `1 USD = ${fx.rate.toLocaleString()} KRW · ${L('Rate date', '기준일')} ${fx.date} · ${fx.source}` +
      (fx.fetchedAt ? ` · ${L('Fetched', '조회')} ${new Date(fx.fetchedAt).toLocaleString()}` : '') +
      (W.loadedFx ? L(' · cached', ' · 캐시') : '') + (W.fxMessage ? ' · ' + W.fxMessage : '') +
      (stale ? L(' · Rate is over four days old.', ' · 4일 이상 지난 환율입니다.') : '')
    : (W.fxMessage || L('Fetching a reference exchange rate…', '기준환율을 조회하고 있습니다…'));
  el.classList.toggle('status-error', !fx || !!W.fxMessage || stale);
  document.getElementById('refreshFx').disabled = W.fxBusy;
}
async function refreshFx(force = true) {
  if (W.fxBusy) return;
  if (!force && NWCore.validFx(W.state.fx) && W.state.fx.source !== 'manual' &&
      Date.now() - Date.parse(W.state.fx.fetchedAt) < 3600000) return;
  W.fxBusy = true;
  updateFxStatus();
  try {
    W.state.fx = await NWCore.fetchRate();
    W.loadedFx = false;
    W.fxMessage = '';
    try { localStorage.setItem(FX_KEY, JSON.stringify(W.state.fx)); } catch (_) {}
    renderAll();
  } catch (_) {
    W.fxMessage = W.state.fx ? L('Refresh failed; using the last saved rate.', '갱신 실패: 마지막 저장 환율 사용 중입니다.')
      : L('Rate unavailable. Retry or enter a manual rate. Cross-currency results are paused.', '환율을 가져오지 못했습니다. 재시도 또는 수동 입력하세요. 통화 환산 결과는 일시 중지됩니다.');
  } finally { W.fxBusy = false; updateFxStatus(); }
}
function useManualFx() {
  try {
    const rate = NWCore.number(document.getElementById('manualFx').value, 0.000001);
    W.state.fx = NWCore.cleanFx({ base: 'USD', quote: 'KRW', rate, date: new Date().toISOString().slice(0, 10), source: 'manual', fetchedAt: new Date().toISOString() });
    W.loadedFx = false;
    W.fxMessage = L('Manual rate; automatic refresh can replace it.', '수동 환율: 자동 갱신 시 변경될 수 있습니다.');
    try { localStorage.setItem(FX_KEY, JSON.stringify(W.state.fx)); } catch (_) {}
    updateFxStatus();
    renderAll();
  } catch (_) { setNotice(L('Enter a positive, finite KRW amount per USD.', '1 USD당 유효한 양수 KRW 금액을 입력하세요.')); }
}
function pauseResults(message) {
  setNotice(message);
  document.getElementById('resultsRegion').hidden = true;
  document.getElementById('fireBox').hidden = true;
}
function prepareRender() {
  if (!W.ready) return false;
  try {
    const state = captureState();
    const fingerprint = financeModelFingerprint({ ...state, currentSc });
    if (W.fingerprint && W.fingerprint !== fingerprint && mcResult) {
      mcResult = null;
      document.getElementById('mcStale').hidden = false;
      updateMcSuccessLabel();
    }
    W.fingerprint = fingerprint;
    // Validate conversion availability before any result is displayed.
    for (const values of Object.values(state.money)) NWCore.toUSD(values.KRW, 'KRW', state.fx);
    for (const a of state.accounts) for (const k of ['balance', 'contribSelf', 'contribEmployer']) objectMoney(a, k);
    for (const e of state.events) objectMoney(e, 'value');
    for (const h of state.housingScenarios) for (const k of NWCore.HOUSING_MONEY) objectMoney(h, k);
    if (state.displayCurrency === 'KRW' && !NWCore.validFx(state.fx)) throw new Error('fx-required');
    document.getElementById('resultsRegion').hidden = false;
    document.getElementById('fireBox').hidden = false;
    setNotice(W.store.blocked ? L(
      'The chart and table use your current entries. Automatic saving is paused to protect a separate stored copy. Use “Save current entries” to keep these USD/KRW values, or export them before closing.',
      '그래프와 테이블은 지금 입력한 값으로 계산합니다. 별도의 기존 저장본을 보호하기 위해 자동 저장만 멈춰 있습니다. 「현재 입력 저장」으로 지금의 USD/KRW 값을 저장하거나, 닫기 전에 백업하세요.') : '');
    return true;
  } catch (error) {
    pauseResults(error.message === 'fx-required'
      ? L('A valid exchange rate is required. Refresh or enter a manual rate above.', '통화 환산에 유효한 환율이 필요합니다. 위에서 갱신하거나 수동으로 입력하세요.')
      : L('Check numeric inputs, dates and age ranges. Results are paused; the last valid save is preserved.', '숫자, 날짜 및 나이 범위를 확인하세요. 결과는 일시 중지되며 마지막 정상 저장본은 유지됩니다.'));
    return false;
  }
}
function addMoneyEditors() {
  for (const id of NWCore.MONEY_IDS) {
    const usd = document.getElementById(id);
    const wrapper = usd.closest('.iw');
    const field = wrapper.closest('.field');
    const label = field.querySelector('label');
    const labelText = label?.querySelector('.label-text')?.textContent || label?.textContent.trim() || id;
    const group = document.createElement('div');
    group.className = 'dual-money';
    wrapper.before(group);
    group.appendChild(wrapper);
    wrapper.querySelector('.sfx').textContent = 'USD';
    wrapper.querySelector('.sfx').removeAttribute('data-i18n-sfx');
    usd.value = '';
    usd.inputMode = 'decimal';
    usd.setAttribute('aria-label', labelText + ' USD');
    const wonWrapper = wrapper.cloneNode(true);
    const krw = wonWrapper.querySelector('input');
    krw.id = id + '_KRW';
    krw.setAttribute('aria-label', labelText + ' KRW');
    wonWrapper.querySelector('.sfx').textContent = 'KRW';
    group.appendChild(wonWrapper);
  }
}
function enhanceAccessibility(root = document) {
  root.querySelectorAll('.field, .enc-field').forEach(field => {
    const label = field.querySelector('label');
    const input = field.querySelector('input, select, textarea');
    if (label && input) {
      if (!input.id) input.id = 'field-' + crypto.randomUUID();
      label.htmlFor = input.id;
    }
  });
  root.querySelectorAll('.tooltip-wrap').forEach(el => {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', L('More information', '도움말'));
  });
  root.querySelectorAll('.acc-head, .ev-head').forEach(el => {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-expanded', el.parentElement.classList.contains('open'));
  });
}
function setupDialog(overlay, close) {
  const dialog = overlay.querySelector('.import-modal, .housing-modal');
  if (!dialog) return;
  const previous = document.activeElement;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const title = dialog.querySelector('.import-modal-title, .housing-modal-title');
  if (title) { title.id = overlay.id + '-title'; dialog.setAttribute('aria-labelledby', title.id); }
  const background = [document.querySelector('.header'), document.getElementById('workspaceBar'), document.querySelector('.app'), document.querySelector('.mobile-nav')];
  background.forEach(el => { if (el) el.inert = true; });
  overlay.onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const nodes = [...dialog.querySelectorAll('button, input, textarea, select, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  overlay._restoreFocus = () => {
    background.forEach(el => { if (el) el.inert = false; });
    if (previous?.isConnected) previous.focus();
  };
  enhanceAccessibility(dialog);
}
function releaseDialog(id) { document.getElementById(id)?._restoreFocus?.(); }
function validateEditor(el) {
  const key = (el.getAttribute('oninput') || el.getAttribute('onchange') || '').match(/,\s*'([^']+)'/)?.[1] || el.id;
  const optionalAge = ['contribStartAge', 'contribEndAge', 'endAge'].includes(key);
  const isAge = key.toLowerCase().includes('age') && key !== 'wageGrowthRate';
  let min = 0, max = 1e15;
  if (['returnRate', 'rate', 'inflation', 'wageGrowthRate', 'appreciationRate', 'depositRenewalRate', 'rentIncreaseRate'].includes(key)) {
    min = -99.99; max = 1000;
  } else if (isAge || ['loanTerm', 'renewalCycle'].includes(key)) {
    min = optionalAge && !el.value ? 0 : 1; max = 100;
  } else if (key === 'withdrawRate') { min = 0.01; max = 100; }
  else if (key === 'withdrawTaxRate') max = 99.99;
  else if (['contribSelfRate', 'contribEmployerRate', 'matchCapPercent', 'ltvRatio'].includes(key)) max = 100;
  let valid = true;
  try {
    if (el.type === 'date') {
      const eventId = Number(el.closest('.ev-card')?.id.replace('ev-', ''));
      const event = events.find(e => e.id === eventId);
      const optional = key === 'endDate' || (key === 'date' && event?.age != null);
      if (el.value || !optional) NWCore.date(el.value);
      if (el.value && ((el.min && el.value < el.min) || (el.max && el.value > el.max))) throw new Error('date');
      if (key === 'endDate' && el.value && event?.date && el.value <= event.date) throw new Error('date');
    } else {
      const n = NWCore.number(el.value, min, max);
      if ((isAge || ['loanTerm', 'renewalCycle'].includes(key)) && !Number.isInteger(n)) throw new Error('integer');
    }
  } catch (_) { valid = false; }
  el.setAttribute('aria-invalid', String(!valid));
  let error = el.closest('.field')?.querySelector('.field-error');
  if (!valid && !error) {
    error = document.createElement('span');
    error.className = 'field-error';
    el.closest('.field')?.appendChild(error);
  }
  if (error) error.textContent = valid ? '' : el.type === 'date'
    ? L('Choose a valid date. End dates must be after the event date.', '유효한 날짜를 선택하세요. 종료 날짜는 시작 날짜보다 뒤여야 합니다.')
    : L('Check this number and its allowed range.', '숫자와 허용 범위를 확인하세요.');
}
function setupWorkspace() {
  const bar = document.createElement('section');
  bar.id = 'workspaceBar';
  bar.className = 'workspace-bar';
  bar.innerHTML = `
    <div class="workspace-top"><span id="saveStatus" role="status"></span>
      <label>${L('Display currency', '결과 표시 통화')} <select id="displayCurrency"><option>USD</option><option>KRW</option></select></label>
      <button type="button" id="undoDelete" hidden>${L('Undo deletion', '삭제 취소')}</button></div>
    <p>${L('Inputs stay in USD/KRW. Saved only in this browser; devices do not sync. Local saves are not encrypted.', '입력 원금은 USD/KRW로 유지됩니다. 이 브라우저에만 저장되며 기기 간 동기화되지 않습니다. 브라우저 저장본은 암호화되지 않습니다.')}</p>
    <div class="fx-row"><span id="fxStatus" role="status"></span><button type="button" id="refreshFx">${L('Refresh rate', '환율 갱신')}</button></div>
    <p>${L('Reference rates, not live trading or bank exchange quotes. Projections hold this exchange rate constant in future years.', '실시간 거래·은행 환전가가 아닌 기준환율입니다. 장기 예측에서는 이 환율이 미래에도 일정하다고 가정합니다.')}</p>
    <details><summary>${L('Manual exchange rate / recovery', '수동 환율 / 데이터 복구')}</summary>
      <label for="manualFx">1 USD = </label><input id="manualFx" type="text" inputmode="decimal" placeholder="KRW"><button type="button" id="useManualFx">${L('Use manual rate', '수동 환율 적용')}</button>
      <button type="button" id="downloadRecovery">${L('Download stored original (unencrypted)', '저장 원본 다운로드 (비암호화)')}</button>
      <button type="button" id="restorePrevious">${L('Restore previous snapshot', '이전 정상 저장본 복원')}</button>
    </details>
    <button type="button" id="saveCurrentEntries" hidden>${L('Save current entries', '현재 입력 저장')}</button>
    <button type="button" id="migrateLegacy" hidden>${L('Review previous saved copy (optional)', '이전 저장본 확인 (선택)')}</button>
    <p id="lastBackupStatus"></p>
    <p id="workspaceNotice" role="alert" hidden></p>`;
  document.querySelector('.header').after(bar);
  document.querySelector('.right-panel').id = 'resultsRegion';
  const stale = document.createElement('p');
  stale.id = 'mcStale';
  stale.hidden = true;
  stale.setAttribute('role', 'status');
  stale.textContent = L('Inputs changed. Run Monte Carlo again; the chart below is the single-path preview.', '입력이 변경되었습니다. 몬테카를로를 다시 실행하세요. 아래 차트는 단일 경로 미리보기입니다.');
  document.getElementById('mc-controls').after(stale);
  applyLocale();
  setupFinanceBaseFields();
  addMoneyEditors();
  setupEventDates();
  let storage;
  try { storage = localStorage; }
  catch (_) { storage = { getItem() { throw new Error('storage'); }, setItem() { throw new Error('storage'); } }; }
  W.store = new NWCore.Store(storage);
  const loaded = W.store.load();
  if (loaded.status === 'ok') applyWorkspaceState(loaded.state);
  else {
    applyWorkspaceState(W.state);
    if (loaded.status === 'legacy') {
      W.legacy = loaded.data;
      document.getElementById('migrateLegacy').hidden = false;
      document.getElementById('saveCurrentEntries').hidden = false;
    } else if (loaded.status === 'error') {
      document.getElementById('saveCurrentEntries').hidden = false;
      setNotice(L('Could not read saved data. Automatic saving is paused; restore a backup or download the stored original.', '저장 데이터를 읽지 못했습니다. 자동 저장은 중지되었습니다. 백업을 복원하거나 저장 원본을 다운로드하세요.'));
    }
  }
  try {
    const cached = JSON.parse(storage.getItem(FX_KEY));
    if (NWCore.validFx(cached) && (!W.state.fx || Date.parse(cached.fetchedAt) > Date.parse(W.state.fx.fetchedAt))) W.state.fx = NWCore.cleanFx(cached);
    W.loadedFx = !!W.state.fx;
    const last = storage.getItem(LAST_BACKUP_KEY);
    document.getElementById('lastBackupStatus').textContent = last
      ? L('Last encrypted file downloaded: ', '마지막 암호화 파일 다운로드: ') + new Date(last).toLocaleString()
      : L('No encrypted file backup downloaded on this browser yet.', '이 브라우저에서 아직 암호화 백업 파일을 다운로드하지 않았습니다.');
  } catch (_) {}
  W.ready = true;
  setupFinanceControls();
  document.getElementById('displayCurrency').addEventListener('change', e => setDisplayCurrency(e.target.value));
  for (const [id, fn] of Object.entries({ refreshFx: () => refreshFx(), useManualFx, migrateLegacy: migrateLegacySave, saveCurrentEntries, downloadRecovery, restorePrevious, undoDelete })) {
    document.getElementById(id).addEventListener('click', fn);
  }
  document.querySelector('.app').addEventListener('input', e => {
    if (e.target.id === 'projectionStartDate') return;
    if (e.target.id === 'currentAge') renderEventList();
    if (e.target.matches('input[id]') && !e.target.closest('#accountList, #eventList')) renderAll();
  });
  document.getElementById('btnAddAccount').addEventListener('click', () => addAccount());
  document.addEventListener('focusout', e => {
    if (!e.target.matches('.app input, .housing-modal input') || e.target.matches('.acc-inp')) return;
    validateEditor(e.target);
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('.tooltip-wrap, .acc-head, .ev-head') && ['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (e.target.matches('.tooltip-wrap')) e.target.classList.toggle('help-open');
      else { e.target.click(); e.target.setAttribute('aria-expanded', e.target.parentElement.classList.contains('open')); }
    }
  });
  document.addEventListener('click', e => {
    const help = e.target.closest('.tooltip-wrap');
    if (help) help.classList.toggle('help-open');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStateSave();
    else refreshFx(false);
  });
  window.addEventListener('pagehide', flushStateSave);
  window.addEventListener('storage', e => {
    if (e.key === NWCore.KEY && e.newValue !== W.store.raw) {
      W.store.blocked = true;
      document.getElementById('saveCurrentEntries').hidden = true;
      setStatus(L('Another tab changed this profile. Export your edits before reloading.', '다른 탭에서 프로필을 변경했습니다. 새로고침 전 수정 내용을 백업하세요.'), true);
    }
  });
  setInterval(() => { if (document.visibilityState === 'visible') refreshFx(false); }, 3600000);
  enhanceAccessibility();
  if (window.innerWidth <= 768) mTab('basic');
  // Loading does not itself rewrite the saved state.
  renderAll();
  clearTimeout(saveTimeout);
  W.pending = false;
  setStatus(W.store.blocked ? L('Calculations available · saving needs your confirmation.', '계산 가능 · 저장하려면 확인이 필요합니다.')
    : L('Saved only in this browser.', '이 브라우저에만 저장됩니다.'), W.store.blocked);
  updateFxStatus();
  refreshFx(false);
}
async function downloadEncryptedFile() {
  const password = document.getElementById('encPw')?.value;
  if (!password) { showEncToast('encToast', t('encPwEmpty'), true); return; }
  const button = document.getElementById('downloadEncrypted');
  button.disabled = true;
  try {
    const json = JSON.stringify(getStateForExport());
    const token = uint8ToBase64(await encryptData(password, await gzipCompressUtf8(json)));
    downloadFile(token, 'networth-' + new Date().toISOString().slice(0, 10) + '.nwbackup', 'text/plain');
    const now = new Date().toISOString();
    try { localStorage.setItem(LAST_BACKUP_KEY, now); } catch (_) {}
    document.getElementById('lastBackupStatus').textContent = L('Last encrypted file downloaded: ', '마지막 암호화 파일 다운로드: ') + new Date(now).toLocaleString();
    showEncToast('encToast', L('Encrypted file downloaded. Keep the password separately.', '암호화 파일을 다운로드했습니다. 비밀번호는 별도로 보관하세요.'), false);
  } catch (_) { showEncToast('encToast', L('Backup failed. Check the inputs.', '백업에 실패했습니다. 입력값을 확인하세요.'), true); }
  finally { if (button.isConnected) button.disabled = false; }
}
async function readBackupFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2000000) { showEncToast('encToast', L('File too large (2 MB maximum).', '파일이 너무 큽니다 (최대 2 MB).'), true); return; }
  try { document.getElementById('encTokenPaste').value = (await file.text()).trim(); }
  catch (_) { showEncToast('encToast', L('Could not read the file.', '파일을 읽지 못했습니다.'), true); }
}
