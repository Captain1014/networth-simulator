/* Shared schemas drive validation and the finance editor. No personal defaults. */
(() => {
  'use strict';
  const N = (label, value = null, max = 1e15) => ({ label, type: 'number', value, max });
  const P = (label, value = null, min = 0, max = 99.99) => ({ label, type: 'number', value, min, max });
  const S = (label, value = '') => ({ label, type: 'text', value });
  const D = label => ({ label, type: 'date', value: '' });
  const B = (label, value = false) => ({ label, type: 'boolean', value });
  const E = (label, choices, value) => ({ label, type: 'select', choices, value: value ?? choices[0] });
  const common = {
    name: S('Name / 이름'), enabled: B('Enabled / 사용', true),
    status: E('Confidence / 확정 상태', ['confirmed', 'estimated', 'unknown'], 'estimated'),
    scenarioId: S('Scenario ID (blank = baseline) / 시나리오 ID'),
  };
  const schemas = {
    scenarios: {
      ...common, start: D('Start date / 시작일'), end: D('End date (exclusive) / 종료일'),
      description: S('Assumptions / 가정'),
    },
    flows: {
      ...common, kind: E('Flow type / 흐름 종류', ['salary', 'business', 'expense', 'other', 'gross_tc']),
      currency: E('Currency / 통화', ['USD', 'KRW']), amount: N('Amount (blank = unknown) / 금액'),
      frequency: E('Frequency / 단위', ['monthly', 'annual_rate', 'once']),
      start: D('Start date / 시작일'), end: D('End date (exclusive) / 종료일'),
      endOnScenario: S('End when scenario starts / 종료 연결 시나리오 ID'),
      category: E('Category / 분류', ['other', 'housing', 'salary', 'business', 'parents', 'pet', 'travel', 'children', 'partner']),
      taxTreatment: E('Amount basis / 세전·세후', ['net', 'gross']),
      taxPct: P('Effective income tax % (blank = unknown) / 유효세율'),
      businessCost: N('Business cost per same period / 같은 단위 사업비용'),
      growthPct: P('Annual growth % (blank = wage/inflation default) / 증가율', null, -99.99, 1000),
      payDay: N('Monthly payment day (blank = accrual) / 지급일', null, 31),
      payMonth: N('Annual payment month (optional) / 연간 지급 월', null, 12),
      includedInFlowId: S('Already included in other expense ID / 포함된 상위 지출 ID'),
      cashSharePct: P('Gross TC cash portion % (blank = unallocated) / TC 현금 비율', null, 0, 100),
      continueAfterRetirement: B('Continue earned income after retirement / 은퇴 후에도 유지'),
      retirementRole: E('Retirement expense role / 은퇴 지출 처리', ['base', 'additional', 'override_target'], 'base'),
      tcParentId: S('Included in gross TC flow ID / 포함된 TC ID'),
    },
    dbBenefits: {
      ...common, enabled: B('Include this benefit / 이 급여 사용'),
      benefitType: E('Benefit type / 급여 종류', ['db', 'severance_lump_sum']),
      currency: E('Currency / 통화', ['KRW', 'USD']),
      paymentDate: D('Expected payment date / 지급 예정일'),
      expectedAmount: N('Expected total (blank = unknown) / 총 예상 지급액'),
      amountBasis: E('Amount basis / 금액 기준', ['gross', 'net']),
      effectiveTaxPct: P('Effective payment tax % / 지급 유효세율'),
      settlement: E('Settlement destination / 지급 형태', ['cash', 'retirement_account']),
      treatment: E('Accounting treatment / 회계 처리', ['new_benefit', 'existing_account_transfer']),
      separateEntitlementConfirmed: B('Confirmed not already in DC/assets/other income / DC·기존 자산·다른 소득과 중복 아님 확인'),
      sourceAccountId: N('Existing retirement source account / 기존 퇴직자산 출처 계좌'),
      destinationAccountId: N('Receiving retirement account / 수령 연금계좌'),
      replacesFlowId: S('Replaces one-time income record / 교체할 일회성 소득'),
      replacesEventId: N('Replaces existing lump-sum event / 교체할 목돈 유입 이벤트'),
    },
    rsu: {
      ...common, currency: E('Currency / 통화', ['USD', 'KRW']),
      tcParentId: S('Included in gross TC flow ID / 포함된 TC ID'),
      grantTotal: N('Fixed-value grant cap / 고정 금액 grant 한도', 0),
      totalShares: N('Award share count (if known) / 총 부여 주식 수'),
      accountId: N('Destination account ID / 주식 수령 계좌 ID'),
      taxPct: P('Effective vesting tax % / 베스팅 유효세율'),
      saleMode: E('Settlement / 정산', ['hold', 'sell']),
    },
    espp: {
      ...common, currency: E('Payroll currency / 급여 통화', ['USD', 'KRW']),
      stockCurrency: E('Share quote currency / 주가 통화', ['USD', 'KRW']),
      start: D('Payroll deduction start / 공제 시작일'), end: D('Deduction end / 공제 종료일'),
      contribPct: P('Deduction % / 급여 공제율', 0, 0, 100),
      eligibleAnnualPay: N('Eligible annual pay (not TC or net pay) / 공제 기준 연 급여'),
      payrollSourceId: S('Salary flow ID / 급여 흐름 ID'),
      netPayAlreadyDeducted: B('Net salary already excludes ESPP / 입력 실수령액에 공제 반영됨'),
      discountPct: P('Discount % / 할인율', 0),
      lookback: B('Lookback (explicit min-start/purchase assumption) / 룩백'),
      taxPct: P('Effective ordinary benefit tax % / 할인 이익 유효세율'),
      taxTiming: E('Benefit recognition assumption / 과세 시점 가정', ['purchase', 'sale']),
      saleMode: E('Settlement / 정산', ['hold', 'sell']),
      accountId: N('Destination stock account ID / 주식 수령 계좌 ID'),
      annualLimit: N('Annual contribution limit / 연간 납입 한도'),
      ruleConfirmed: B('Plan-price/tax assumptions reviewed / 플랜 가정 확인'),
    },
    homes: {
      ...common, currency: E('Currency / 통화', ['USD', 'KRW']),
      country: E('Country / 국가', ['US', 'KR', 'other']),
      date: D('Purchase date / 매수일'), price: N('Purchase price / 매수가'),
      downPaymentPct: P('Down payment % / 자기자금 비율', 20, 0, 100),
      loanRatePct: P('Loan rate % / 대출 이율', null, 0, 1000),
      loanYears: N('Loan term years / 대출 기간', 30, 100),
      closingCost: N('Closing costs / 취득 부대비용'),
      annualPropertyTax: N('Annual property tax / 연 재산세'),
      annualInsurance: N('Annual insurance / 연 보험료'),
      annualMaintenance: N('Annual maintenance / 연 유지비'),
      appreciationPct: P('Annual appreciation % / 연 가격 상승률', 0, -99.99, 1000),
      replaceRentFlowId: S('Rent expense ID to replace / 종료할 월세 흐름 ID'),
    },
  };
  const accountSchema = {
    model: E('Tax model / 과세 모델', ['cash', 'brokerage', 'deferred', 'roth'], 'brokerage'),
    owner: E('Owner / 소유자', ['self', 'partner']),
    taxConfirmed: B('Effective tax assumptions reviewed / 세금 가정 확인'),
    qualification: E('Roth assumption / Roth 인출 가정', ['custom', 'qualified_assumed'], 'custom'),
    costBasis: N('Cost basis in account currency (blank = unknown) / 취득원가'),
    dividendYieldPct: P('Dividend yield included in total return % / 총수익률 중 배당', 0, 0, 100),
    dividendTaxPct: P('Dividend effective tax % / 배당 유효세율'),
    capitalGainsTaxPct: P('Realized gain effective tax % / 실현차익 유효세율'),
    interestTaxPct: P('Interest effective tax % / 이자 유효세율'),
    effectiveTaxPct: P('Combined effective withdrawal tax % / 합산 인출 유효세율'),
    volatilityPct: P('Market volatility % (cash excluded) / 변동성', null, 0, 300),
    marketGroup: S('Shared market-shock group / 공통 시장 그룹', 'market'),
    contributionBase: E('Contribution percentage basis / 비율 납입 기준', ['net_income', 'gross_salary']),
    grossBaseAnnual: N('Gross eligible annual salary / 연 납입 기준 세전급여'),
    employerFixedAnnual: N('Employer annual contribution override / 회사 연 고정 납입'),
    employerPayMonth: N('Employer deposit month (blank = monthly) / 회사 납입 월', null, 12),
    employerPayDay: N('Employer deposit day / 회사 납입 일', 28, 31),
    employerScheduleConfirmed: B('Employer posting schedule reviewed / 회사 입금 일정 확인'),
    employmentStart: D('Employment start / 재직 시작일'),
    employmentEnd: D('Employment end / 재직 종료일'),
    endOnScenario: S('Employment ends on scenario ID / 재직 종료 시나리오 ID'),
    balanceConfirmed: B('Current balance confirmed / 현재 잔액 확인', true),
  };
  function defaults() {
    return {
      version: 2, useDetailedFlows: false, migrationReviewed: false, legacyEventsArchived: false,
      cash: { USD: { ratePct: 0, interestTaxPct: null, confirmed: false },
        KRW: { ratePct: 0, interestTaxPct: null, confirmed: false } },
      accounts: {}, flows: [], scenarios: [], rsu: [], espp: [], homes: [], dbBenefits: [],
      retirement: { spendingMode: 'target', targetBasis: 'today', pensionStartAge: null,
        pensionConfirmed: false, partialFiFrom: null, partialFiTo: null, coveragePct: null },
      household: { includePartner: false, partnerStatus: 'not_entered', childrenStatus: 'not_entered',
        parentsStatus: 'not_entered', petStatus: 'not_entered', travelStatus: 'not_entered' },
      benefits: { nationalPensionStatus: 'not_entered', severanceStatus: 'not_entered' },
      model: { includeTentative: true, seed: '1', runs: 1000 },
    };
  }
  function object(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
  function string(v, max = 500) {
    if (typeof v !== 'string' || v.length > max) throw new Error('finance-text');
    return v;
  }
  function field(value, spec) {
    const v = value === undefined ? spec.value : value;
    if (spec.type === 'number') {
      if (v === '' || v == null) return null;
      const n = NWCore.number(v, spec.min ?? 0, spec.max ?? 1e15);
      return n;
    }
    if (spec.type === 'boolean') {
      if (typeof v !== 'boolean') throw new Error('finance-boolean');
      return v;
    }
    if (spec.type === 'date') return v === '' || v == null ? '' : NWCore.date(v);
    if (spec.type === 'select') {
      if (!spec.choices.includes(v)) throw new Error('finance-choice');
      return v;
    }
    return string(v ?? '');
  }
  function record(raw, schema) {
    if (!object(raw)) throw new Error('finance-record');
    return Object.fromEntries(Object.entries(schema).map(([k, spec]) => [k, field(raw[k], spec)]));
  }
  function records(raw, schema, name) {
    if (!Array.isArray(raw) || raw.length > 300) throw new Error(name);
    const ids = new Set();
    return raw.map(item => {
      if (!object(item)) throw new Error(name);
      const id = string(item.id, 100);
      if (!id || !/^[\w-]+$/.test(id) || ids.has(id)) throw new Error('finance-id');
      ids.add(id);
      const result = { id, ...record(item, schema) };
      if (result.start && result.end && result.end <= result.start) throw new Error('finance-dates');
      return result;
    });
  }
  function schedule(raw, name) {
    if (!Array.isArray(raw) || raw.length > 400) throw new Error(name);
    return raw.map(item => {
      if (!object(item)) throw new Error(name);
      return {
        date: NWCore.date(item.date),
        amount: field(item.amount, N('amount')), shares: field(item.shares, N('shares')),
        price: field(item.price, N('price')),
        offeringPrice: field(item.offeringPrice, N('offering price')),
        marketPrice: field(item.marketPrice, N('purchase price')),
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }
  function normalize(raw, state) {
    const d = defaults();
    if (raw == null) raw = {};
    if (!object(raw) || (raw.version != null && ![1, 2].includes(raw.version))) throw new Error('finance-schema');
    const out = { ...d };
    out.useDetailedFlows = field(raw.useDetailedFlows, B('', false));
    out.migrationReviewed = field(raw.migrationReviewed, B('', false));
    out.legacyEventsArchived = field(raw.legacyEventsArchived, B('', false));
    for (const c of ['USD', 'KRW']) {
      out.cash[c] = record(raw.cash?.[c] ?? {}, {
        ratePct: P('rate', 0, -99.99, 1000), interestTaxPct: P('tax'), confirmed: B('confirmed'),
      });
    }
    if (raw.accounts != null && !object(raw.accounts)) throw new Error('account-settings');
    for (const a of state.accounts) {
      const model = a.type === 'taxable' ? 'brokerage' : a.type === 'cash' ? 'cash'
        : a.type === 'roth' ? 'roth' : 'deferred';
      out.accounts[a.id] = record({ ...raw.accounts?.[a.id], model }, accountSchema);
      const cfg = out.accounts[a.id];
      if (cfg.model !== model) throw new Error('account-tax-model');
      if (cfg.costBasis != null && cfg.model === 'brokerage' && cfg.costBasis > 1e15) throw new Error('basis');
      if (cfg.dividendYieldPct > Math.max(0, Number(a.rate) + 100)) throw new Error('dividend-yield');
      if (cfg.employmentStart && cfg.employmentEnd && cfg.employmentEnd <= cfg.employmentStart) throw new Error('employment-dates');
      for (const k of ['employerPayMonth', 'employerPayDay']) {
        if (cfg[k] != null && (!Number.isInteger(cfg[k]) || cfg[k] < 1)) throw new Error('deposit-date');
      }
    }
    for (const k of Object.keys(schemas)) out[k] = records(raw[k] ?? [], schemas[k], k);
    for (let i = 0; i < out.rsu.length; i++) {
      const grant = out.rsu[i];
      grant.schedule = schedule(raw.rsu[i].schedule ?? [], 'vesting');
      if (grant.totalShares != null) {
        const total = grant.schedule.reduce((sum, x) => sum + (x.shares ?? 0), 0);
        if (total > grant.totalShares + 1e-8) throw new Error('vesting-shares-cap');
      } else if (grant.grantTotal > 0 &&
          grant.schedule.reduce((sum, x) => sum + (x.amount ?? 0), 0) > grant.grantTotal + 1e-8) throw new Error('vesting-grant-cap');
    }
    for (let i = 0; i < out.espp.length; i++) {
      out.espp[i].purchases = schedule(raw.espp[i].purchases ?? [], 'espp-purchases');
      if (out.espp[i].netPayAlreadyDeducted && !out.espp[i].payrollSourceId) throw new Error('espp-salary-source');
    }
    const scenarioIds = new Set(out.scenarios.map(x => x.id));
    const flowIds = new Set(out.flows.map(x => x.id));
    const allIds = Object.keys(schemas).flatMap(key => out[key].map(x => x.id));
    if (new Set(allIds).size !== allIds.length) throw new Error('finance-global-id');
    const accountIds = new Set(state.accounts.map(x => x.id));
    for (const group of ['flows', 'rsu', 'espp', 'homes', 'dbBenefits']) {
      for (const item of out[group]) {
        if (item.scenarioId && !scenarioIds.has(item.scenarioId)) throw new Error('scenario-reference');
        if (item.endOnScenario && !scenarioIds.has(item.endOnScenario)) throw new Error('scenario-reference');
        if (item.accountId != null && !accountIds.has(item.accountId)) throw new Error('account-reference');
        if (item.payrollSourceId && !flowIds.has(item.payrollSourceId)) throw new Error('salary-reference');
        if (item.tcParentId && !out.flows.some(x => x.id === item.tcParentId && x.kind === 'gross_tc')) throw new Error('tc-reference');
        if (item.includedInFlowId && (item.includedInFlowId === item.id || !flowIds.has(item.includedInFlowId))) throw new Error('expense-reference');
        if (item.replaceRentFlowId && !flowIds.has(item.replaceRentFlowId)) throw new Error('rent-reference');
        for (const k of ['payDay', 'payMonth', 'loanYears']) {
          if (item[k] != null && (!Number.isInteger(item[k]) || item[k] < 1)) throw new Error('finance-period');
        }
      }
    }
    for (const cfg of Object.values(out.accounts)) {
      if (cfg.endOnScenario && !scenarioIds.has(cfg.endOnScenario)) throw new Error('scenario-reference');
    }
    for (const flow of out.flows) {
      if (flow.includedInFlowId && (flow.kind !== 'expense' || out.flows.find(x => x.id === flow.includedInFlowId)?.kind !== 'expense')) throw new Error('expense-parent');
      for (const key of ['includedInFlowId', 'tcParentId']) {
        const seen = new Set([flow.id]);
        let parent = flow[key];
        while (parent) {
          if (seen.has(parent)) throw new Error('finance-reference-cycle');
          seen.add(parent);
          parent = out.flows.find(x => x.id === parent)?.[key];
        }
      }
    }
    const replacementKeys = new Set();
    for (const benefit of out.dbBenefits) {
      for (const key of ['sourceAccountId', 'destinationAccountId']) {
        if (benefit[key] != null && (!Number.isSafeInteger(benefit[key]) || !accountIds.has(benefit[key]))) throw new Error('db-account-reference');
      }
      const deferredTypes = ['traditional', 'pension_kr', 'dc_kr', 'irp_kr'];
      if (benefit.sourceAccountId != null && !deferredTypes.includes(state.accounts.find(a => a.id === benefit.sourceAccountId)?.type)) throw new Error('db-source-type');
      if (benefit.destinationAccountId != null && !deferredTypes.includes(state.accounts.find(a => a.id === benefit.destinationAccountId)?.type)) throw new Error('db-destination-type');
      if (benefit.settlement === 'retirement_account' && benefit.sourceAccountId != null &&
          benefit.sourceAccountId === benefit.destinationAccountId) throw new Error('db-same-account');
      if (benefit.replacesFlowId && !out.flows.some(x => x.id === benefit.replacesFlowId && x.frequency === 'once' && !['expense', 'gross_tc'].includes(x.kind))) throw new Error('db-income-reference');
      if (benefit.replacesEventId != null && (!Number.isSafeInteger(benefit.replacesEventId) ||
          !state.events.some(x => x.id === benefit.replacesEventId && x.type === 'lumpsum-in'))) throw new Error('db-event-reference');
      if (benefit.enabled && benefit.status !== 'unknown') {
        for (const key of ['replacesFlowId', 'replacesEventId']) if (benefit[key] != null && benefit[key] !== '') {
          const value = `${key}:${benefit[key]}`;
          if (replacementKeys.has(value)) throw new Error('db-duplicate-replacement');
          replacementKeys.add(value);
        }
      }
    }
    out.retirement = record(raw.retirement ?? {}, {
      spendingMode: E('', ['target', 'path'], 'target'), targetBasis: E('', ['today', 'retirement'], 'today'),
      pensionStartAge: N('', null, 100), pensionConfirmed: B(''),
      partialFiFrom: N('', null, 100), partialFiTo: N('', null, 100), coveragePct: P('', null, 0, 100),
      maintainedIncomeUSD: N(''),
    });
    const rt = out.retirement;
    for (const k of ['pensionStartAge', 'partialFiFrom', 'partialFiTo']) {
      if (rt[k] != null && (!Number.isInteger(rt[k]) || rt[k] < 1)) throw new Error('retirement-age');
    }
    if (rt.partialFiFrom != null && rt.partialFiTo != null && rt.partialFiTo < rt.partialFiFrom) throw new Error('fi-range');
    out.household = record(raw.household ?? {}, {
      includePartner: B(''), partnerStatus: E('', ['not_entered', 'entered']),
      childrenStatus: E('', ['not_entered', 'excluded', 'scenario']),
      parentsStatus: E('', ['not_entered', 'entered', 'included_in_other']),
      petStatus: E('', ['not_entered', 'entered', 'included_in_other']),
      travelStatus: E('', ['not_entered', 'entered', 'included_in_other']),
    });
    out.benefits = record(raw.benefits ?? {}, {
      nationalPensionStatus: E('', ['not_entered', 'enrolled', 'not_enrolled']),
      severanceStatus: E('', ['not_entered', 'dc', 'db', 'other']),
    });
    out.model = record(raw.model ?? {}, {
      includeTentative: B('', true), seed: S('', '1'), runs: N('', 1000, 2000),
    });
    if (!Number.isInteger(out.model.runs) || out.model.runs < 1) throw new Error('simulation-runs');
    return out;
  }
  function newRecord(group) {
    return { id: crypto.randomUUID(), ...Object.fromEntries(Object.entries(schemas[group]).map(([k, spec]) => [k, spec.value])),
      ...(['rsu', 'espp'].includes(group) ? { [group === 'rsu' ? 'schedule' : 'purchases']: [] } : {}) };
  }
  function convertLegacy(input) {
    const state = NWCore.validate(input);
    if (state.finance.useDetailedFlows || state.finance.flows.length) return state;
    const start = state.projectionStartDate;
    if (state.events.some(e => e.scenarioId && ['income', 'expense', 'income-add', 'expense-add'].includes(e.type))) throw new Error('conditional-legacy-flows-require-review');
    const currentAge = Number(state.inputs.currentAge);
    const dateFor = event => event.date || (Number(event.age) === currentAge ? start :
      `${Number(start.slice(0, 4)) + Number(event.age) - currentAge}-01-01`);
    const result = [];
    for (const currency of ['USD', 'KRW']) for (const kind of ['income', 'expense']) {
      let begin = start, value = state.money[kind === 'income' ? 'annualIncome' : 'annualExpense'][currency];
      let name = `Imported ${kind} ${currency}`, index = 0;
      const changes = state.events.filter(e => e.type === kind && e.currency === currency && dateFor(e) >= start)
        .sort((a, b) => dateFor(a).localeCompare(dateFor(b)) || a.id - b.id);
      function append(end) {
        if (end && end <= begin) return;
        result.push({ ...newRecord('flows'), id: `import-${kind}-${currency}-${index++}`,
          name, kind: kind === 'income' ? 'salary' : 'expense', currency, amount: NWCore.number(value),
          frequency: 'annual_rate', start: begin, end, status: 'confirmed', taxTreatment: 'net',
          businessCost: 0, taxPct: 0 });
      }
      for (const e of changes) {
        append(dateFor(e)); begin = dateFor(e); value = e.value; name = e.name || name;
      }
      append('');
    }
    for (const e of state.events.filter(x => ['income-add', 'expense-add'].includes(x.type) && dateFor(x) >= start)) {
      result.push({ ...newRecord('flows'), id: `import-add-${e.id}`, name: e.name,
        kind: e.type === 'income-add' ? 'other' : 'expense', currency: e.currency,
        amount: NWCore.number(e.value), frequency: 'annual_rate', start: dateFor(e),
        end: e.endDate || (e.endAge ? `${Number(start.slice(0, 4)) + Number(e.endAge) - currentAge}-01-01` : ''),
        taxTreatment: 'net', taxPct: 0, businessCost: 0, status: 'confirmed',
        retirementRole: 'additional', continueAfterRetirement: true });
    }
    state.finance.flows = result;
    state.finance.useDetailedFlows = true;
    state.finance.legacyEventsArchived = true;
    return NWCore.validate(state);
  }
  function accountDefaults(a) {
    return record({ model: a.type === 'taxable' ? 'brokerage' : a.type === 'cash' ? 'cash'
      : a.type === 'roth' ? 'roth' : 'deferred' }, accountSchema);
  }
  window.NWFinanceState = { defaults, normalize, schemas, accountSchema, newRecord, convertLegacy, accountDefaults };
})();
