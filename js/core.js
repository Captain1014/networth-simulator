/* Pure data and persistence helpers. Amounts remain in their original currencies. */
(() => {
  'use strict';
  const VERSION = 2;
  const KEY = 'networth-simulator-state';
  const MONEY_IDS = [
    'investAsset', 'realEstate', 'vehicle', 'otherAsset', 'mortgage', 'studentLoan',
    'carLoan', 'otherDebt', 'annualIncome', 'annualExpense', 'targetMonthly', 'externalPension',
  ];
  const DEFAULT_INPUTS = {
    currentAge: '30', retireAge: '55', returnRate: '7', returnVolatility: '15',
    inflation: '2.5', wageGrowthRate: '2', mortgageRate: '6.5', studentLoanRate: '5', withdrawRate: '4',
  };
  const ACCOUNT_DEFAULTS = {
    type: 'roth', name: '', balance: '', rate: '7', contribSelf: '', contribSelfRate: '',
    contribEmployer: '', contribEmployerRate: '', employerMatchMode: 'percent', matchRate: '50',
    matchCapPercent: '8', contribStartAge: '', contribEndAge: '', withdrawTaxRate: '0', retireDrawAge: '60',
  };
  const HOUSING_DEFAULTS = {
    type: 'buy', name: '', enabled: true, startAge: 55, purchasePrice: 0, appreciationRate: 3,
    annualMaintenance: 0, ltvRatio: 60, loanRate: 4.5, loanTerm: 30, loanType: 'amortizing',
    deposit: 0, depositRenewalRate: 3, renewalCycle: 2, monthlyRent: 0, rentDeposit: 0, rentIncreaseRate: 3,
  };
  const HOUSING_MONEY = ['purchasePrice', 'annualMaintenance', 'deposit', 'monthlyRent', 'rentDeposit'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = o => !!o && typeof o === 'object' && !Array.isArray(o);
  function currency(c) {
    if (c !== 'USD' && c !== 'KRW') throw new Error('currency');
    return c;
  }
  function number(value, min = 0, max = 1e15) {
    if (value === '' || value == null) value = 0;
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error('number');
    const s = String(value).replace(/,/g, '').trim();
    const m = s.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*([kmb])?$/i);
    if (!m) throw new Error('number');
    const n = Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error('range');
    return n;
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) throw new Error('date');
    const time = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('date');
    return value;
  }
  function shiftYears(value, years) {
    date(value);
    const [year, month, day] = value.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
    return date(`${year + years}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`);
  }
  function yearAtAge(value, state) {
    return Number(date(state.projectionStartDate).slice(0, 4)) + Number(value) - Number(state.inputs.currentAge);
  }
  function eventAge(event, state) {
    if (!event.date) return Number(event.age);
    const value = date(event.date);
    const currentAge = Number(state.inputs.currentAge);
    const derived = currentAge + Number(value.slice(0, 4)) - Number(date(state.projectionStartDate).slice(0, 4));
    return value < state.projectionStartDate ? Math.min(currentAge - 1, derived) : derived;
  }
  function eventEndAge(event, state) {
    if (!event.endDate) return Number(event.endAge) || 0;
    const value = date(event.endDate);
    return Number(state.inputs.currentAge) + Number(value.slice(0, 4)) -
      Number(date(state.projectionStartDate).slice(0, 4)) + (value.slice(5) === '01-01' ? 0 : 1);
  }
  function eventSortKey(event, state) {
    return event.date || `${yearAtAge(event.age, state)}-01-01`;
  }
  function text(v) {
    if (typeof v !== 'string' || v.length > 500) throw new Error('text');
    return v;
  }
  function age(v, optional = false) {
    if (optional && (v === '' || v == null)) return '';
    if (!/^\d+$/.test(String(v))) throw new Error('age');
    const n = number(v, 1, 100);
    if (!Number.isInteger(n)) throw new Error('age');
    return n;
  }
  function choice(v, choices) {
    if (!choices.includes(v)) throw new Error('choice');
    return v;
  }
  function rate(v, min = 0, max = 100) {
    if (v !== '' && v != null && !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v))) throw new Error('rate');
    number(v, min, max);
    return String(v ?? '');
  }
  function id(v) {
    if (!Number.isSafeInteger(v) || v < 1) throw new Error('id');
    return v;
  }
  function list(v, max, normalize) {
    if (!Array.isArray(v) || v.length > max) throw new Error('list');
    const result = v.map(normalize);
    if (new Set(result.map(x => x.id)).size !== result.length) throw new Error('duplicate-id');
    return result;
  }
  function validFx(fx) {
    if (!object(fx) || fx.base !== 'USD' || fx.quote !== 'KRW' ||
        typeof fx.rate !== 'number' || !Number.isFinite(fx.rate) || fx.rate <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fx.date || '')) return false;
    const d = Date.parse(fx.date);
    return Number.isFinite(d) && new Date(d).toISOString().slice(0, 10) === fx.date &&
      d <= Date.now() + 86400000;
  }
  function cleanFx(fx) {
    if (!validFx(fx)) throw new Error('fx');
    return {
      base: 'USD', quote: 'KRW', rate: fx.rate, date: fx.date,
      fetchedAt: typeof fx.fetchedAt === 'string' ? fx.fetchedAt : '',
      source: fx.source === 'manual' ? 'manual' : 'Frankfurter',
    };
  }
  function emptyState() {
    return {
      schemaVersion: VERSION, profileId: crypto.randomUUID(), updatedAt: '',
      projectionStartDate: today(),
      inputs: { ...DEFAULT_INPUTS },
      money: Object.fromEntries(MONEY_IDS.map(k => [k, { USD: '', KRW: '' }])),
      accounts: [], events: [], housingScenarios: [], currentSc: 'base',
      showRetireOnly: false, displayCurrency: 'USD', fx: null,
    };
  }
  function validate(raw) {
    if (!object(raw) || raw.schemaVersion !== VERSION || !object(raw.inputs) || !object(raw.money)) throw new Error('schema');
    const s = emptyState();
    s.profileId = text(raw.profileId);
    if (!s.profileId) throw new Error('profile');
    s.updatedAt = text(raw.updatedAt ?? '');
    s.projectionStartDate = date(raw.projectionStartDate ?? today());
    for (const [k, fallback] of Object.entries(DEFAULT_INPUTS)) {
      const v = own(raw.inputs, k) ? raw.inputs[k] : fallback;
      if (k.endsWith('Age')) age(v);
      else if (k === 'withdrawRate') rate(v, 0.01, 100);
      else if (['returnRate', 'inflation', 'wageGrowthRate'].includes(k)) rate(v, -99.99, 1000);
      else rate(v, 0, 1000);
      s.inputs[k] = String(v);
    }
    if (Number(s.inputs.retireAge) < Number(s.inputs.currentAge)) throw new Error('retirement-age');
    for (const k of MONEY_IDS) {
      if (!object(raw.money[k])) throw new Error('money');
      for (const c of ['USD', 'KRW']) {
        number(raw.money[k][c]);
        s.money[k][c] = String(raw.money[k][c] ?? '');
      }
    }
    s.accounts = list(raw.accounts, 100, a => {
      if (!object(a)) throw new Error('account');
      const x = { ...ACCOUNT_DEFAULTS, ...a, employerMatchMode: a.employerMatchMode || (a.contribEmployerRate ? 'percent' : 'fixed') };
      const out = { id: id(x.id), currency: currency(x.currency), type: choice(x.type, ['roth', 'traditional', 'pension_kr', 'taxable']), name: text(x.name) };
      for (const k of ['balance', 'contribSelf', 'contribEmployer']) { number(x[k]); out[k] = String(x[k]); }
      for (const k of ['contribSelfRate', 'contribEmployerRate', 'matchCapPercent']) out[k] = rate(x[k]);
      out.matchRate = rate(x.matchRate, 0, 1000);
      out.rate = rate(x.rate, -99.99, 1000);
      out.withdrawTaxRate = rate(x.withdrawTaxRate, 0, 99.99);
      out.employerMatchMode = choice(x.employerMatchMode, ['fixed', 'percent', 'match']);
      for (const k of ['contribStartAge', 'contribEndAge']) out[k] = String(age(x[k], true));
      out.retireDrawAge = String(age(x.retireDrawAge, x.type === 'taxable'));
      if (x.contribStartAge !== '' && x.contribEndAge !== '' && Number(x.contribEndAge) < Number(x.contribStartAge)) throw new Error('contribution-age');
      return out;
    });
    s.events = list(raw.events, 500, e => {
      if (!object(e)) throw new Error('event');
      const x = {
        id: id(e.id), currency: currency(e.currency), name: text(e.name ?? ''),
        type: choice(e.type, ['income', 'income-add', 'expense', 'expense-add', 'lumpsum-out', 'lumpsum-in']),
        value: String(e.value ?? ''),
      };
      if (e.date != null && e.date !== '') x.date = date(e.date);
      else x.age = age(e.age);
      number(x.value);
      if (e.endAge != null && e.endAge !== '') {
        x.endAge = age(e.endAge);
      }
      if (e.endDate != null && e.endDate !== '') {
        x.endDate = date(e.endDate);
        const start = x.date || eventSortKey(x, s);
        if (x.endDate <= start) throw new Error('event-end');
      }
      const end = eventEndAge(x, s);
      if (end && end <= eventAge(x, s)) throw new Error('event-end');
      if (e.drainAccountId != null && e.drainAccountId !== '') {
        x.drainAccountId = id(Number(e.drainAccountId));
        if (!s.accounts.some(a => a.id === x.drainAccountId)) throw new Error('account-reference');
      }
      return x;
    });
    s.housingScenarios = list(raw.housingScenarios ?? [], 3, h => {
      if (!object(h)) throw new Error('housing');
      const x = { ...HOUSING_DEFAULTS, ...h };
      const out = {
        id: id(x.id), currency: currency(x.currency), name: text(x.name),
        type: choice(x.type, ['buy', 'jeonse', 'rent']), loanType: choice(x.loanType, ['amortizing', 'interestOnly']),
        enabled: x.enabled !== false, startAge: age(x.startAge),
      };
      for (const k of HOUSING_MONEY) { number(x[k]); out[k] = String(x[k]); }
      for (const k of ['appreciationRate', 'depositRenewalRate', 'rentIncreaseRate']) out[k] = number(x[k], -99.99, 1000);
      out.ltvRatio = number(x.ltvRatio, 0, 100);
      out.loanRate = number(x.loanRate, 0, 1000);
      out.loanTerm = number(x.loanTerm, 1, 100);
      out.renewalCycle = number(x.renewalCycle, 1, 100);
      if (!Number.isInteger(out.loanTerm) || !Number.isInteger(out.renewalCycle)) throw new Error('term');
      return out;
    });
    s.currentSc = choice(raw.currentSc ?? 'base', ['base', 'opt', 'pes']);
    if (typeof raw.showRetireOnly !== 'boolean') throw new Error('boolean');
    s.showRetireOnly = raw.showRetireOnly;
    s.displayCurrency = currency(raw.displayCurrency);
    s.fx = raw.fx == null ? null : cleanFx(raw.fx);
    return s;
  }
  function migrate(raw, legacyCurrency) {
    if (!object(raw)) throw new Error('schema');
    if (raw.schemaVersion === VERSION) return validate(raw);
    if (raw.schemaVersion != null || !object(raw.inputs)) throw new Error('schema');
    currency(legacyCurrency);
    const s = emptyState();
    for (const k of Object.keys(DEFAULT_INPUTS)) if (own(raw.inputs, k)) s.inputs[k] = raw.inputs[k];
    for (const k of MONEY_IDS) s.money[k][legacyCurrency] = String(raw.inputs[k] ?? '');
    for (const k of ['accounts', 'events', 'housingScenarios']) {
      const values = raw[k] ?? [];
      if (!Array.isArray(values)) throw new Error('list');
      s[k] = values.map(x => ({ ...x, currency: legacyCurrency }));
    }
    s.currentSc = raw.currentSc ?? 'base';
    s.showRetireOnly = raw.showRetireOnly ?? false;
    s.displayCurrency = legacyCurrency;
    return validate(s);
  }
  function toUSD(amount, c, fx) {
    const n = number(amount);
    currency(c);
    if (!n || c === 'USD') return n;
    if (!validFx(fx)) throw new Error('fx-required');
    return n / fx.rate;
  }
  function fromUSD(amount, c, fx) {
    if (!Number.isFinite(amount)) throw new Error('number');
    currency(c);
    if (!amount || c === 'USD') return amount;
    if (!validFx(fx)) throw new Error('fx-required');
    return amount * fx.rate;
  }
  class Store {
    constructor(storage) { this.storage = storage; this.raw = null; this.blocked = false; }
    load() {
      try {
        this.raw = this.storage.getItem(KEY);
        if (this.raw == null) return { status: 'empty' };
        const data = JSON.parse(this.raw);
        if (object(data) && data.schemaVersion == null && object(data.inputs)) {
          this.blocked = true;
          return { status: 'legacy', data };
        }
        const state = validate(data);
        return { status: 'ok', state };
      } catch (error) {
        this.blocked = true;
        return { status: 'error', error };
      }
    }
    save(state) {
      if (this.blocked) throw new Error('blocked');
      const next = JSON.stringify(validate(state));
      if (this.storage.getItem(KEY) !== this.raw) { this.blocked = true; throw new Error('conflict'); }
      if (this.raw && this.raw !== next) {
        let valid = false;
        try { validate(JSON.parse(this.raw)); valid = true; } catch (_) {}
        if (valid) this.storage.setItem(KEY + ':previous', this.raw);
      }
      this.storage.setItem(KEY, next);
      this.raw = next;
    }
    preserve() {
      if (this.raw != null) this.storage.setItem(KEY + ':recovery:' + Date.now(), this.raw);
    }
  }
  async function fetchRate(fetcher = fetch, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher('https://api.frankfurter.dev/v2/rate/USD/KRW', {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('fx-network');
      return cleanFx({ ...await response.json(), source: 'Frankfurter', fetchedAt: new Date().toISOString() });
    } finally { clearTimeout(timeout); }
  }
  window.NWCore = { VERSION, KEY, MONEY_IDS, DEFAULT_INPUTS, HOUSING_MONEY, emptyState, validate, migrate, number, validFx, cleanFx, toUSD, fromUSD, Store, fetchRate, today, date, shiftYears, yearAtAge, eventAge, eventEndAge, eventSortKey };
})();
