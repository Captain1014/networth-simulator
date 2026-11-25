/* Compile immutable, dated model inputs once, including for all Monte Carlo paths. */
(() => {
  'use strict';
  const DAY = 86400000;
  const ms = s => Date.parse(s + 'T00:00:00Z');
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const year = s => Number(s.slice(0, 4));
  function yearFraction(from, to) {
    let a = ms(from), b = ms(to), total = 0;
    while (a < b) {
      const y = new Date(a).getUTCFullYear();
      const next = Date.UTC(y + 1, 0, 1);
      const end = Math.min(b, next);
      total += (end - a) / (next - Date.UTC(y, 0, 1));
      a = end;
    }
    return total;
  }
  function compile(input, options = {}) {
    const state = NWCore.validate(input);
    const f = state.finance;
    const start = state.projectionStartDate;
    const startAge = Number(state.inputs.currentAge);
    const horizonAge = options.horizonAge ?? 100;
    const lastYear = year(start) + Math.max(0, horizonAge - startAge);
    const end = `${lastYear + 1}-01-01`;
    const retireDate = Number(state.inputs.retireAge) === startAge ? start
      : `${year(start) + Number(state.inputs.retireAge) - startAge}-01-01`;
    const warnings = new Set();
    const warn = message => warnings.add(message);
    const usd = (v, c) => NWCore.toUSD(v ?? 0, c, state.fx);
    const money = key => usd(state.money[key]?.USD, 'USD') + usd(state.money[key]?.KRW, 'KRW');
    const active = x => x.enabled !== false && x.status !== 'unknown' &&
      (x.status !== 'estimated' || f.model.includeTentative);
    const scenarios = new Map(f.scenarios.filter(active).map(x => [x.id, x]));
    const enabled = x => active(x) && (!x.scenarioId || scenarios.has(x.scenarioId));
    const cuts = new Set([start, end]);
    const operations = new Map();
    function cut(date) { if (date && date >= start && date <= end) cuts.add(date); }
    function operation(date, type, data, priority) {
      if (!date || date < start || date >= end) return;
      cut(date);
      if (!operations.has(date)) operations.set(date, []);
      operations.get(date).push({ type, data, priority });
    }
    cut(retireDate);
    for (const scenario of scenarios.values()) {
      cut(scenario.start); cut(scenario.end);
      if (scenario.status !== 'confirmed') warn(`Scenario provisional / 잠정 시나리오: ${scenario.name || scenario.id}`);
    }
    const ageDate = value => `${year(start) + Number(value) - startAge}-01-01`;
    const allocations = f.allocations.filter(enabled);
    for (const rule of allocations) {
      cut(rule.start); cut(rule.end);
      const missing = NWFinanceState.allocationIssues(state, rule);
      if (missing.length) warn(`Automatic investment paused; inputs missing / 자동 투자 입력 필요: ${rule.name} (${missing.join(', ')})`);
    }
    const eventDate = e => e.date || (Number(e.age) === startAge ? start : ageDate(e.age));
    const dbBenefits = [];
    for (const benefit of f.dbBenefits.filter(enabled)) {
      const sc = benefit.scenarioId ? scenarios.get(benefit.scenarioId) : null;
      if (!benefit.paymentDate || benefit.expectedAmount == null) {
        warn(`DB benefit date/amount missing; excluded / DB 지급일·금액 미입력: ${benefit.name}`);
        continue;
      }
      if ((sc?.start && benefit.paymentDate < sc.start) || (sc?.end && benefit.paymentDate >= sc.end)) continue;
      if (benefit.treatment === 'new_benefit' && !benefit.separateEntitlementConfirmed) {
        warn(`DB separate entitlement unconfirmed; excluded to avoid DC duplication / 별도 DB 권리 확인 필요: ${benefit.name}`);
        continue;
      }
      if (benefit.treatment === 'existing_account_transfer' && benefit.sourceAccountId == null) {
        warn(`DB transfer source missing; excluded / DB 이체 출처 계좌 미입력: ${benefit.name}`);
        continue;
      }
      if (benefit.settlement === 'retirement_account' && benefit.destinationAccountId == null) {
        warn(`DB retirement destination missing; excluded / DB 수령 계좌 미입력: ${benefit.name}`);
        continue;
      }
      const neededAccounts = [
        ...(benefit.treatment === 'existing_account_transfer' ? [benefit.sourceAccountId] : []),
        ...(benefit.settlement === 'retirement_account' ? [benefit.destinationAccountId] : []),
      ];
      if (!f.household.includePartner && neededAccounts.some(id => f.accounts[id]?.owner === 'partner')) {
        warn(`DB linked partner account excluded / DB 연결 파트너 계좌 제외: ${benefit.name}`);
        continue;
      }
      if (benefit.status !== 'confirmed') warn(`DB payout provisional / DB 지급액 잠정: ${benefit.name}`);
      if (benefit.treatment === 'new_benefit' && benefit.amountBasis === 'gross' && benefit.effectiveTaxPct == null) {
        warn(`DB effective tax missing; provisional 0% / DB 유효세율 미입력: ${benefit.name}`);
      }
      if (benefit.paymentDate >= start && benefit.paymentDate < end) {
        dbBenefits.push(benefit);
        operation(benefit.paymentDate, 'db-benefit', benefit, 3);
      }
    }
    const dbReplacedFlows = new Set(dbBenefits.map(x => x.replacesFlowId).filter(Boolean));
    const dbReplacedEvents = new Set(dbBenefits.map(x => x.replacesEventId).filter(x => x != null));
    const flows = [];
    function addFlow(raw) {
      if (dbReplacedFlows.has(raw.id)) return;
      if (raw.enabled !== false && raw.status === 'unknown') {
        warn(`Unconfirmed flow excluded / 미확인 흐름 제외: ${raw.name || raw.id}`);
      }
      if (!enabled(raw)) return;
      if (raw.amount == null) { warn(`Amount missing / 금액 미입력: ${raw.name || raw.id}`); return; }
      if (raw.category === 'partner' && !f.household.includePartner) return;
      const scenario = raw.scenarioId ? scenarios.get(raw.scenarioId) : null;
      let begin = [raw.start || start, scenario?.start || start].sort().at(-1);
      let finish = [raw.end || end, scenario?.end || end].sort()[0];
      if (raw.endOnScenario && scenarios.has(raw.endOnScenario)) finish = [finish, scenarios.get(raw.endOnScenario).start || end].sort()[0];
      if (['salary', 'business', 'gross_tc'].includes(raw.kind) && !raw.continueAfterRetirement) finish = [finish, retireDate].sort()[0];
      if (finish <= begin || finish <= start) return;
      const item = {
        ...raw, start: begin, end: finish, annualAnchor: begin,
        amountUSD: usd(raw.amount, raw.currency), costUSD: usd(raw.businessCost ?? 0, raw.currency),
      };
      if (raw.status !== 'confirmed') warn(`Flow provisional / 잠정 흐름: ${raw.name || raw.id}`);
      if (raw.taxTreatment === 'gross' && raw.taxPct == null) warn(`Income tax missing; provisional 0% / 소득세 미설정: ${raw.name || raw.id}`);
      if (raw.kind === 'business' && raw.businessCost == null) warn(`Business costs missing / 사업비용 미입력: ${raw.name || raw.id}`);
      if (raw.kind === 'gross_tc' && raw.cashSharePct == null) warn(`TC is unallocated; not spendable cash / TC 현금 구성 미입력: ${raw.name || raw.id}`);
      flows.push(item);
      cut(begin); cut(finish);
    }
    const legacy = (id, kind, c, amount, extra = {}) => ({
      id, kind, currency: c, amount, frequency: 'annual_rate', start, end: '',
      taxTreatment: 'net', taxPct: 0, businessCost: 0, growthPct: null,
      enabled: true, status: 'confirmed', scenarioId: '', endOnScenario: '',
      category: kind === 'expense' ? 'other' : 'salary', payDay: null, payMonth: null,
      includedInFlowId: '', cashSharePct: 100, continueAfterRetirement: false,
      retirementRole: 'base', name: id, ...extra,
    });
    if (f.useDetailedFlows) f.flows.forEach(addFlow);
    else for (const c of ['USD', 'KRW']) {
      addFlow(legacy(`legacy-income-${c}`, 'salary', c, state.money.annualIncome[c]));
      addFlow(legacy(`legacy-expense-${c}`, 'expense', c, state.money.annualExpense[c]));
    }
    for (const e of state.events) {
      if (dbReplacedEvents.has(e.id)) continue;
      if (e.scenarioId && !scenarios.has(e.scenarioId)) continue;
      const date = eventDate(e);
      if (date < start || date >= end) continue;
      const endDate = e.endDate || (e.endAge ? ageDate(e.endAge) : '');
      if (['income', 'expense', 'income-add', 'expense-add'].includes(e.type)) {
        if (f.useDetailedFlows) {
          if (!f.legacyEventsArchived) warn(`Legacy cash-flow event excluded in detailed mode / 상세 모드에서 흐름으로 이전 필요: ${e.name || e.id}`);
          continue;
        }
        if (e.type.endsWith('-add')) {
          addFlow(legacy(`event-flow-${e.id}`, e.type === 'income-add' ? 'other' : 'expense',
            e.currency, e.value, { start: date, end: endDate, annualAnchor: date,
              retirementRole: 'additional', category: 'other', name: e.name, continueAfterRetirement: true }));
          operation(date, 'annotation', e, 1);
        } else operation(date, 'replacement', { ...e, amountUSD: usd(e.value, e.currency) }, 1);
      } else {
        const priority = e.type === 'deposit-return' ? 0 : e.type === 'lumpsum-in' ? 2 : 7;
        operation(date, 'event', { ...e, amountUSD: usd(e.value, e.currency) }, priority);
      }
    }
    const targets = { USD: usd(state.money.targetMonthly.USD, 'USD'), KRW: usd(state.money.targetMonthly.KRW, 'KRW') };
    const useTarget = f.retirement.spendingMode === 'target' && targets.USD + targets.KRW > 0;
    if (useTarget) for (const c of ['USD', 'KRW']) {
      const annual = targets[c] * 12 * (f.retirement.targetBasis === 'today'
        ? NWCore.growthFactor(Number(state.inputs.inflation) / 100, yearFraction(start, retireDate)) : 1);
      flows.push({ ...legacy(`retirement-target-${c}`, 'expense', c, 0), start: retireDate, end,
        annualAnchor: retireDate, amountUSD: annual, retirementTarget: true });
    }
    const pension = money('externalPension');
    if (pension > 0) {
      if (f.retirement.pensionStartAge == null) warn('Pension start age missing; pension excluded / 연금 개시 나이 미입력으로 제외');
      else {
        const begin = ageDate(f.retirement.pensionStartAge);
        flows.push({ ...legacy('external-pension', 'other', 'USD', 0), start: begin, end,
          amountUSD: pension, frequency: 'monthly', annualAnchor: start, category: 'other',
          growthPct: 0, continueAfterRetirement: true });
        cut(begin);
        if (!f.retirement.pensionConfirmed) warn('Government pension assumptions unconfirmed / 공적 연금 가정 미확인');
      }
    }
    const grants = f.rsu.filter(enabled);
    for (const grant of grants) {
      if (!grant.schedule.length) warn(`Vesting schedule missing; grant not an asset / 베스팅 미확인: ${grant.name}`);
      if (grant.taxPct == null) warn(`RSU vesting tax missing / RSU 세율 미입력: ${grant.name}`);
      const sc = grant.scenarioId ? scenarios.get(grant.scenarioId) : null;
      for (const vest of grant.schedule) if ((!sc?.start || vest.date >= sc.start) && (!sc?.end || vest.date < sc.end)) operation(vest.date, 'rsu', { grant, vest }, 3);
    }
    const espp = f.espp.filter(enabled);
    for (const plan of espp) {
      cut(plan.start); cut(plan.end);
      if (plan.eligibleAnnualPay == null || !plan.start) warn(`ESPP payroll base/date missing; no deduction / ESPP 공제 기준 미입력: ${plan.name}`);
      if (!plan.ruleConfirmed || plan.taxPct == null) warn(`ESPP assumptions provisional / ESPP 가정 미확인: ${plan.name}`);
      for (const purchase of plan.purchases) operation(purchase.date, 'espp', { plan, purchase }, 4);
    }
    for (const home of f.homes.filter(enabled)) {
      const sc = home.scenarioId ? scenarios.get(home.scenarioId) : null;
      if (home.date && ((sc?.start && home.date < sc.start) || (sc?.end && home.date >= sc.end))) continue;
      if (!home.date || home.price == null || (home.downPaymentPct < 100 && home.loanRatePct == null)) {
        warn(`Home purchase inputs missing; no invented asset / 주택 입력 미확인: ${home.name}`);
        continue;
      }
      if ([home.closingCost, home.annualPropertyTax, home.annualInsurance, home.annualMaintenance].some(x => x == null)) {
        warn(`Home running costs provisional / 주택 유지비 미확인: ${home.name}`);
      }
      operation(home.date, 'home', home, 6);
    }
    // Explicitly dated payroll/bills are not accrued again at month end.
    for (let y = year(start); y <= lastYear; y++) for (let m = 1; m <= 12; m++) {
      const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
      cut(monthStart);
      const monthLast = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (const flow of flows) {
        if (flow.frequency === 'once') continue;
        if (flow.payDay != null && (flow.payMonth == null || flow.payMonth === m)) {
          const date = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(monthLast, flow.payDay)).padStart(2, '0')}`;
          if (date >= flow.start && date < flow.end) operation(date, 'flow', flow.id, flow.kind === 'expense' ? 8 : 2);
        }
      }
      for (const a of state.accounts) {
        const cfg = f.accounts[a.id];
        if (cfg.employerPayMonth === m) {
          operation(`${y}-${String(m).padStart(2, '0')}-${String(Math.min(monthLast, cfg.employerPayDay || 28)).padStart(2, '0')}`,
            'employer', a.id, 5);
        }
      }
    }
    for (const flow of flows) if (flow.frequency === 'once' && flow.start >= start && flow.start < flow.end) {
      operation(flow.start, 'flow', flow.id, flow.kind === 'expense' ? 8 : 2);
    }
    for (const a of state.accounts) {
      const cfg = f.accounts[a.id];
      for (const value of [a.contribStartAge, a.contribEndAge, a.retireDrawAge]) if (value !== '') cut(ageDate(value));
      cut(cfg.employmentStart); cut(cfg.employmentEnd);
    }
    const ordered = [...cuts].sort();
    const segments = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = ordered[i], to = ordered[i + 1];
      const y = year(from), month = Number(from.slice(5, 7));
      const days = (ms(to) - ms(from)) / DAY;
      const monthDays = new Date(Date.UTC(y, month, 0)).getUTCDate();
      segments.push({
        from, to, year: y, age: startAge + y - year(start),
        fraction: days / ((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY),
        monthFraction: days / monthDays, days,
        monthEnd: to.slice(8) === '01',
        lastDate: iso(ms(to) - DAY),
      });
    }
    for (const list of operations.values()) list.sort((a, b) => a.priority - b.priority || (Number(a.data?.id) || 0) - (Number(b.data?.id) || 0));
    return { state, f, start, end, retireDate, startAge, lastYear, flows, operations, segments,
      scenarios, grants, espp, dbBenefits, allocations, useTarget, targets, warnings: [...warnings], usd, money, ageDate };
  }
  window.NWFinanceTimeline = { compile, yearFraction, ms, iso };
})();
