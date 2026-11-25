/* Runs only through the local test server; never loaded by the deployed app. */
document.addEventListener('DOMContentLoaded', async () => {
  const passed = [], failed = [];
  function assert(condition, name) {
    if (!condition) throw new Error(name);
    passed.push(name);
  }
  function equal(a, b, name) { assert(JSON.stringify(a) === JSON.stringify(b), name); }
  function near(a, b, name) { assert(Math.abs(a - b) < 0.00001, name + ` (${a} vs ${b})`); }
  function throws(fn, name) {
    let threw = false;
    try { fn(); } catch (_) { threw = true; }
    assert(threw, name);
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  class MemoryStorage {
    constructor() { this.data = new Map(); this.fail = false; }
    getItem(k) { return this.data.get(k) ?? null; }
    setItem(k, v) { if (this.fail) throw new Error('quota'); this.data.set(k, v); }
  }
  try {
    await delay(100);
    assert(window.testErrors.length === 0, 'No startup errors: ' + testErrors.join('; '));
    assert(W.ready, 'Workspace initialized');
    assert(document.querySelectorAll('.dual-money').length === 12, 'All monetary inputs have both currencies');
    assert(document.querySelectorAll('[id="investAsset"]').length === 1, 'No duplicate base input IDs');
    assert(document.querySelector('[data-i18n="tooltip.wageGrowth"]'), 'Translation preserves nested help');
    assert(!document.querySelector('meta[name="viewport"]').content.includes('user-scalable=no'), 'Zoom is allowed');
    assert(document.getElementById('chartModeHousing') && document.getElementById('housingModal'), 'Housing controls exist on each locale');
    if (TEST_CASE === 'corrupt') {
      assert(W.store.blocked, 'Corrupt saved state blocks autosave');
      document.getElementById('investAsset').value = '123';
      renderAll(); flushStateSave();
      equal(localStorage.getItem(NWCore.KEY), '{broken', 'Corrupt original survives edits and rate fetch');
      assert(accounts.length === 0 && events.length === 0, 'Corrupt load does not create demo data');
    } else if (TEST_CASE === 'legacy') {
      assert(W.store.blocked && W.legacy, 'Legacy state requires currency confirmation');
      const original = localStorage.getItem(NWCore.KEY);
      window.prompt = () => null;
      migrateLegacySave();
      equal(localStorage.getItem(NWCore.KEY), original, 'Cancelled migration preserves original');
      window.prompt = () => 'KRW';
      window.confirm = () => true;
      migrateLegacySave();
      equal(getStateForExport().money.investAsset, { USD: '', KRW: '15000000' }, 'Legacy values preserved in confirmed currency');
      assert(!W.store.blocked, 'Confirmed migration resumes saving');
      assert([...Array(localStorage.length)].some((_, i) => localStorage.key(i).includes(':recovery:')), 'Migration keeps recovery original');
    } else if (TEST_CASE === 'saved' || TEST_CASE === 'offline-cache') {
      near(pN('investAsset'), 1100, 'Saved mixed-currency profile loads without reinterpretation');
      assert(!document.getElementById('resultsRegion').hidden, 'Valid saved or cached rate displays results');
      if (TEST_CASE === 'offline-cache') {
        assert(W.fxMessage.includes('failed') || W.fxMessage.includes('실패'), 'Offline refresh failure is visible');
        assert(document.getElementById('fxStatus').classList.contains('status-error'), 'Stale cached rate is visibly warned');
        near(W.state.fx.rate, 1250, 'Failed refresh preserves cached rate');
      }
    } else if (TEST_CASE.startsWith('offline')) {
      assert(W.state.fx === null, 'No invented fallback exchange rate');
      document.getElementById('investAsset_KRW').value = '1250000';
      renderAll();
      assert(document.getElementById('resultsRegion').hidden, 'No-cache cross-currency results are paused');
      assert(getStateForExport().money.investAsset.KRW === '1250000', 'Raw backup remains available without FX');
      document.getElementById('manualFx').value = '1250';
      useManualFx();
      near(pN('investAsset'), 1000, 'Manual rate recovers offline calculation');
      assert(!document.getElementById('resultsRegion').hidden, 'Manual rate restores results');
    } else {
      const fx = { base: 'USD', quote: 'KRW', rate: 1250, date: new Date().toISOString().slice(0, 10), source: 'Frankfurter', fetchedAt: new Date().toISOString() };
      W.state.fx = fx;
      near(NWCore.toUSD('1,250,000', 'KRW', fx), 1000, 'KRW converts to USD');
      near(NWCore.fromUSD(1000, 'KRW', fx), 1250000, 'USD converts to KRW');
      throws(() => NWCore.toUSD(100, 'KRW', null), 'Missing rate rejected');
      throws(() => NWCore.number('12garbage'), 'Trailing garbage rejected');
      throws(() => NWCore.number(Infinity), 'Infinity rejected');
      throws(() => NWCore.number('', 1), 'Required positive numbers cannot be blank');
      near(NWCore.number('1.5M'), 1500000, 'Abbreviated money supported');
      assert(!NWCore.validFx({ ...fx, rate: 0 }), 'Zero FX rejected');
      assert(!NWCore.validFx({ ...fx, date: '2026-02-30' }), 'Impossible FX date rejected');
      const state = NWCore.emptyState();
      equal(NWCore.validate(state).money, state.money, 'Empty state validates');
      throws(() => NWCore.validate({ ...state, inputs: { ...state.inputs, currentAge: '' } }), 'Blank current age rejected');
      throws(() => NWCore.validate({ ...state, inputs: { ...state.inputs, withdrawRate: '' } }), 'Blank withdrawal rate rejected');
      throws(() => NWCore.validate({ ...state, inputs: { ...state.inputs, returnRate: '1k' } }), 'Percentage abbreviations rejected consistently');
      throws(() => NWCore.validate({ ...state, schemaVersion: 99 }), 'Future schema rejected');
      throws(() => NWCore.migrate({ inputs: {} }), 'Legacy currency cannot be guessed');
      const ms = new MemoryStorage(), store = new NWCore.Store(ms);
      equal(store.load().status, 'empty', 'Store distinguishes empty');
      store.save(state);
      state.money.investAsset.USD = '100';
      store.save(state);
      assert(ms.getItem(NWCore.KEY + ':previous').includes('schemaVersion'), 'Previous valid snapshot retained');
      ms.fail = true;
      throws(() => store.save(state), 'Quota failure surfaced');
      ms.fail = false;
      const other = new NWCore.Store(ms);
      other.load();
      ms.setItem(NWCore.KEY, 'changed in another tab');
      throws(() => other.save(state), 'Concurrent tab overwrite rejected');
      const broken = new MemoryStorage();
      broken.setItem(NWCore.KEY, '{bad');
      const brokenStore = new NWCore.Store(broken);
      equal(brokenStore.load().status, 'error', 'Store distinguishes corrupt');
      throws(() => brokenStore.save(state), 'Corrupt original cannot be autosaved over');
      equal(broken.getItem(NWCore.KEY), '{bad', 'Corrupt bytes preserved');

      const taxableState = NWCore.emptyState();
      taxableState.fx = fx;
      Object.assign(taxableState.inputs, {
        currentAge: '35', retireAge: '35', returnRate: '0', inflation: '0', wageGrowthRate: '0',
      });
      taxableState.money.annualExpense.USD = '100';
      taxableState.accounts = [{
        id: 1, currency: 'USD', type: 'taxable', name: 'Brokerage',
        balance: '1000', rate: '0', retireDrawAge: '',
      }];
      applyWorkspaceState(taxableState);
      renderAll();
      assert(!document.querySelector('#ac-1 input[oninput*="retireDrawAge"]'), 'Taxable accounts do not show withdrawal age');
      assert(document.querySelector('#ac-1 .taxable-withdrawal-note'), 'Taxable accounts explain unrestricted access');
      assert(document.querySelector('#ac-1 input[oninput*="balance"]') && document.querySelector('#ac-1 input[oninput*="contribSelf"]'), 'Taxable balance and contribution fields remain editable');
      near(simulate()[0].accSnapshot[0].balance, 900, 'Taxable funds cover retirement spending before age 60');
      flushStateSave();
      equal(JSON.parse(localStorage.getItem(NWCore.KEY)).accounts[0].retireDrawAge, '', 'Blank taxable age can be saved');
      const taxableStore = new NWCore.Store(localStorage);
      const taxableReload = taxableStore.load();
      assert(taxableReload.status === 'ok', 'Blank taxable age can be reloaded');
      applyWorkspaceState(taxableReload.state);
      near(simulate()[0].accSnapshot[0].balance, 900, 'Reloaded taxable account remains accessible');
      accounts[0].retireDrawAge = '90';
      renderAll();
      near(simulate()[0].accSnapshot[0].balance, 900, 'Legacy withdrawal age is ignored for taxable accounts');
      accounts[0].retireDrawAge = '';
      updateAccount(1, 'type', 'roth');
      equal(accounts[0].retireDrawAge, '60', 'Switching to retirement account restores an editable default age');
      assert(document.querySelector('#ac-1 input[oninput*="retireDrawAge"]'), 'Retirement accounts keep withdrawal-age input');
      near(simulate()[0].accSnapshot[0].balance, 1000, 'Retirement account remains restricted before its chosen age');
      const invalidRetirementAge = getStateForExport();
      invalidRetirementAge.accounts[0].retireDrawAge = '';
      throws(() => NWCore.validate(invalidRetirementAge), 'Retirement accounts still validate the withdrawal age');
      updateAccount(1, 'type', 'taxable');
      near(simulate()[0].accSnapshot[0].balance, 900, 'Switching back to taxable removes age restriction');
      addAccount({ type: 'taxable' });
      equal(accounts[1].retireDrawAge, '', 'New taxable accounts default to no withdrawal age');

      await runEventDateTests({ assert, equal, near, throws });

      const s = NWCore.emptyState();
      s.fx = fx;
      s.inputs.returnRate = '0'; s.inputs.inflation = '0'; s.inputs.wageGrowthRate = '0';
      s.money.investAsset = { USD: '1000', KRW: '1250000' };
      s.money.annualIncome = { USD: '100', KRW: '125000' };
      applyWorkspaceState(s); renderAll();
      near(pN('investAsset'), 2000, 'Mixed balances summed once');
      near(simulate()[0].invest, 2200, 'Mixed annual income enters simulation');
      near(chartInst.data.datasets[0].data[0], 2200, 'USD chart data matches simulation');
      const before = JSON.stringify(getStateForExport().money);
      setDisplayCurrency('KRW');
      near(chartInst.data.datasets[0].data[0], 2750000, 'KRW toggle converts actual dataset');
      equal(document.querySelector('#tblBody tr td:nth-child(3)').textContent, fmt(200), 'Yearly table uses same KRW conversion');
      assert(document.getElementById('sumNW').textContent === fmt(2000), 'Summary uses selected display currency');
      setDisplayCurrency('USD');
      equal(JSON.stringify(getStateForExport().money), before, 'Toggle never mutates original money');
      document.getElementById('mortgage').value = '3000';
      document.getElementById('mortgageRate').value = '0';
      near(simulate()[0].debtRemain, 2900, 'Zero-interest mortgage amortizes without NaN');
      document.getElementById('mortgage').value = '';
      document.getElementById('mortgageRate').value = '6.5';
      addAccount({ currency: 'KRW', balance: '1250000', rate: '0', contribSelf: '125000' });
      near(simulate()[0].totalAccAfterTax, 1100, 'Account balance and fixed contribution normalized');
      accounts[0].employerMatchMode = 'fixed';
      accounts[0].contribEmployerRate = '90';
      accounts[0].contribEmployer = '12500';
      near(simulate()[0].totalAccAfterTax, 1110, 'Fixed employer mode ignores stale percentage');
      accounts[0].contribEmployer = '';
      accounts[0].employerMatchMode = 'match';
      accounts[0].matchRate = '0';
      near(simulate()[0].totalAccAfterTax, 1100, 'Zero employer match stays zero');
      accounts[0].employerMatchMode = 'percent';
      accounts[0].contribEmployerRate = '';
      addEvent({ currency: 'KRW', type: 'lumpsum-in', age: 30, value: '125000' });
      near(simulate()[0].invest, 2200, 'Event and contribution use same base currency');
      updateEvent(events[0].id, 'value', '1.5');
      equal(events[0].value, '1.5', 'Event editing preserves decimal draft');
      updateEvent(events[0].id, 'value', '125000');
      addHousingScenario('buy');
      const h = housingScenarios[0];
      Object.assign(h, { currency: 'KRW', startAge: '30', purchasePrice: '1250000', ltvRatio: '0', annualMaintenance: '0', appreciationRate: '0' });
      near(simulateHousing().scenarios[0].rows[0].propertyValue, 1000, 'Housing normalized and string age starts correctly');
      const importState = getStateForExport();
      importState.accounts[0].name = 'Savings \" & <b>literal</b>';
      window.confirm = () => true;
      assert(importWorkspace(importState), 'Valid import accepted');
      equal(document.querySelector('.acc-name').textContent, importState.accounts[0].name, 'Import refreshes editor names as literal text');
      assert(!document.querySelector('.acc-name b'), 'Account names cannot inject markup');
      updateAccount(accounts[0].id, 'balance', '2500000');
      assert(document.querySelector('.acc-bal').textContent === nativeMoney(2500000, 'KRW'), 'Account header balance updates while editing');
      updateAccount(accounts[0].id, 'balance', '1250000');
      const saved = JSON.stringify(getStateForExport());
      const bad = structuredClone(importState);
      bad.accounts[0].balance = '-1';
      throws(() => importWorkspace(bad), 'Invalid import rejected before apply');
      equal(JSON.stringify(getStateForExport()), saved, 'Invalid import leaves all fields unchanged');
      bad.accounts.push({ ...importState.accounts[0] });
      throws(() => NWCore.validate(bad), 'Duplicate account IDs rejected');
      removeAccount(accounts[0].id);
      assert(accounts.length === 0, 'Account removed');
      undoDelete();
      assert(accounts.length === 1, 'Deletion can be undone');

      const simulation = simulate();
      mcResult = { p10: simulation.map(r => r.totalLiquid), p50: simulation.map(r => r.totalLiquid), p90: simulation.map(r => r.totalLiquid), labels: simulation.map(r => String(r.age)), successRate: 1 };
      chartMode = 'montecarlo';
      renderAll();
      assert(mcResult != null, 'Unchanged inputs keep Monte Carlo results');
      document.getElementById('annualExpense').value = '1';
      renderAll();
      assert(mcResult === null && !document.getElementById('mcStale').hidden, 'Input edit invalidates Monte Carlo results');
      W.state.fx = null;
      renderAll();
      assert(document.getElementById('resultsRegion').hidden, 'Missing rate pauses mixed-currency results');
      W.state.fx = fx; renderAll();
      assert(!document.getElementById('resultsRegion').hidden, 'Valid rate resumes results');
      document.getElementById('currentAge').value = '';
      renderAll(); flushStateSave();
      assert(document.getElementById('resultsRegion').hidden, 'Invalid age pauses results rather than producing an empty chart');
      document.getElementById('currentAge').value = '30';
      renderAll();
      const invalidInput = document.getElementById('annualExpense');
      invalidInput.value = '-1';
      validateEditor(invalidInput);
      assert(invalidInput.getAttribute('aria-invalid') === 'true', 'Invalid monetary field has inline validation');
      invalidInput.value = '1';
      validateEditor(invalidInput);
      renderAll();
      const fetched = await NWCore.fetchRate(async () => new Response(JSON.stringify(fx)));
      near(fetched.rate, 1250, 'Valid API response accepted');
      let rejected = false;
      try { await NWCore.fetchRate(async () => new Response('{}')); } catch (_) { rejected = true; }
      assert(rejected, 'Invalid API payload rejected');
      rejected = false;
      try { await NWCore.fetchRate(async () => { throw new Error('offline'); }); } catch (_) { rejected = true; }
      assert(rejected, 'Network failure surfaced');
      rejected = false;
      try {
        await NWCore.fetchRate((_, opts) => new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(new Error('timeout')))), 10);
      } catch (_) { rejected = true; }
      assert(rejected, 'FX request timeout aborts');

      document.getElementById('returnVolatility').value = '0';
      renderAll();
      const actualMC = runMonteCarlo();
      near(actualMC.p50[0], simulate()[0].totalLiquid, 'Actual 1000-path zero-volatility median matches single path');
      setDisplayCurrency('KRW');
      near(chartInst.data.datasets[1].data[0], actualMC.p50[0] * fx.rate, 'Monte Carlo data converts to KRW');
      assert(mcResult === actualMC, 'Display toggle does not rerun or invalidate Monte Carlo');
      setDisplayCurrency('USD');
      document.getElementById('annualExpense').value = '2';
      renderAll();
      assert(mcResult === null, 'Actual Monte Carlo result invalidates after editing');
      document.getElementById('annualExpense').value = '1';
      renderAll();
      openImportModal();
      assert(document.activeElement.id === 'importTextarea', 'Import dialog receives focus');
      assert(document.querySelector('#importModal [role="dialog"][aria-modal="true"]'), 'Dialog has accessible semantics');
      const importButtons = document.querySelectorAll('#importModal button');
      importButtons[importButtons.length - 1].focus();
      importButtons[importButtons.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      assert(document.activeElement.id === 'importTextarea', 'Dialog traps keyboard focus');
      document.getElementById('importTextarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(!document.getElementById('importModal'), 'Escape closes dialog');
      openBackupSaveModal();
      assert(document.getElementById('downloadEncrypted'), 'Encrypted file download action exists');
      let downloaded = null;
      const actualDownload = downloadFile;
      downloadFile = (body, name) => { downloaded = { body, name }; };
      document.getElementById('encPw').value = 'test-only-not-a-real-password';
      await downloadEncryptedFile();
      assert(downloaded?.name.endsWith('.nwbackup'), 'Encrypted file action generates a backup payload');
      downloadFile = actualDownload;
      closeEncModal();
      openBackupRestoreModal();
      assert(document.getElementById('backupFile'), 'Encrypted file upload exists');
      const files = new DataTransfer();
      files.items.add(new File([downloaded.body], downloaded.name));
      document.getElementById('backupFile').files = files.files;
      await readBackupFile(document.getElementById('backupFile'));
      equal(document.getElementById('encTokenPaste').value, downloaded.body, 'File reader restores exact encrypted token');
      document.getElementById('encPw').value = 'test-only-not-a-real-password';
      const backupMoney = getStateForExport().money.investAsset;
      document.getElementById('investAsset').value = '999';
      await doBackupRestore();
      equal(getStateForExport().money.investAsset, backupMoney, 'File restore recovers original amounts');
      assert(!document.getElementById('mcSuccessRate').textContent, 'Restore clears obsolete Monte Carlo success label');
      closeEncModal();
      const plaintext = JSON.stringify(getStateForExport());
      const encrypted = await encryptData('test-only-not-a-real-password', await gzipCompressUtf8(plaintext));
      equal(await backupCipherToState('test-only-not-a-real-password', encrypted), JSON.parse(plaintext), 'Compressed encrypted backup round trip');
      const legacyEncrypted = await encryptData('test-only-not-a-real-password', plaintext);
      equal(await backupCipherToState('test-only-not-a-real-password', legacyEncrypted), JSON.parse(plaintext), 'Uncompressed backup compatibility');
      rejected = false;
      try { await backupCipherToState('wrong-test-password', encrypted); } catch (_) { rejected = true; }
      assert(rejected, 'Wrong backup password rejected');
      for (const el of document.querySelectorAll('[onclick], [onchange], [oninput]')) {
        for (const key of ['onclick', 'onchange', 'oninput']) if (el.hasAttribute(key)) new Function('event', el.getAttribute(key));
      }
      assert(true, 'Generated inline handlers all parse');
      flushStateSave();
      assert(!W.pending, 'Pending saves flush immediately');
      assert(testErrors.length === 0, 'No runtime errors: ' + testErrors.join('; '));
    }
  } catch (error) {
    failed.push(error.stack || String(error));
  } finally {
    await originalFetch('/__results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passed, failed }) });
  }
});
