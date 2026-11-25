/* Thin DOM adapter: every result is produced by the same pure engine. */
Object.assign(T.en.label, { investAsset: 'Cash / bank deposits (not brokerage)', returnRate: 'Previous generic return (reference only)' });
Object.assign(T.ko.label, { investAsset: '현금·은행예금 (일반 투자계좌 제외)', returnRate: '이전 공통 수익률 (참고용)' });
Object.assign(T.en.summary, { retire: 'At retirement (net worth)', deplete: 'First unfunded spending', save: 'First-period cash surplus' });
Object.assign(T.ko.summary, { retire: '은퇴 시 순자산', deplete: '첫 지출 미충족 시점', save: '첫 기간 현금 잉여' });
Object.assign(T.en.chart, { total: 'Net worth (gross assets less debt)', invest: 'Available after estimated tax', acc: 'Locked retirement (gross)',
  mcSuccess: 'Funded every dated cash need', mcHelp: 'Bands show net-worth percentiles. Success requires every dated cash need to be funded, not only positive ending wealth. Tax assumptions may make results provisional.' });
Object.assign(T.ko.chart, { total: '순자산 (세전 자산−부채)', invest: '예상 세후 가용자금', acc: '잠긴 은퇴자산 (세전)',
  mcSuccess: '날짜별 필요자금 충당률', mcHelp: '밴드는 순자산 분위수입니다. 성공은 마지막 잔액이 아니라 매번 필요한 자금을 충당했는지로 판단합니다. 세금 가정 미확인 시 잠정 결과입니다.' });
T.en.tooltip.withdrawRate = 'A planning withdrawal assumption, not a guarantee of principal preservation or future success.';
T.ko.tooltip.withdrawRate = '계획에 사용하는 인출 가정입니다. 원금 유지나 미래 성공을 보장하지 않습니다.';
T.en.acc.drawAge = 'Planned access age (model assumption)';
T.ko.acc.drawAge = '예정 인출 가능 나이 (모델 가정)';
T.en.accType.roth_desc = 'Effective withdrawal tax follows your qualification and country assumptions.';
T.ko.accType.roth_desc = '적격 인출·거주국 가정을 검토한 유효 인출세율을 사용합니다.';
T.en.accType.taxable_desc = 'Separate dividend tax and realized gains, with pooled proportional cost basis.';
T.ko.accType.taxable_desc = '배당 과세와 비례 취득원가에 따른 실현차익 과세를 분리합니다.';
T.en.fire.needNet = 'Retirement-date target after eligible pension';
T.ko.fire.needNet = '은퇴 시 수령 가능한 연금 반영 목표';
T.en.accounts.title = 'Investment · bank · retirement accounts';
T.ko.accounts.title = '투자·예금·은퇴 계좌';
function financeCalculate(sk = 'base', options = {}) {
  const result = NWFinanceEngine.simulate(captureState(), { scenario: sk, ...options });
  result.rows.financeMeta = result.meta;
  return result.rows;
}
function financeMonteCarlo() {
  const state = captureState();
  const result = NWFinanceEngine.monteCarlo(state);
  return formatFinanceMonteCarlo(state, result);
}
function formatFinanceMonteCarlo(state, result) {
  result.labels = result.labels.map((_, i) => {
    const p = NWCore.calendarPeriod(state.projectionStartDate, i);
    return yearAgeLabel({ year: p.year, age: Number(state.inputs.currentAge) + i,
      yearFraction: p.fraction, periodDays: p.days, yearDays: p.yearDays });
  });
  return result;
}
function financeModelFingerprint(state) {
  return JSON.stringify({ ...state, updatedAt: undefined, displayCurrency: undefined, showRetireOnly: undefined });
}
function financeMonteCarloAsync(state) {
  if (typeof Worker === 'undefined') return Promise.resolve(NWFinanceEngine.monteCarlo(state));
  return new Promise((resolve, reject) => {
    const script = document.querySelector('script[src*="finance-adapter.js"]');
    const url = new URL('finance-worker.js?v=20261125-3', script.src);
    const worker = new Worker(url);
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('simulation-timeout')); }, 180000);
    worker.onmessage = event => {
      clearTimeout(timeout); worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => { clearTimeout(timeout); worker.terminate(); reject(new Error('simulation-worker')); };
    worker.postMessage({ state });
  });
}
function financeText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function renderFinanceSummary(rows) {
  const meta = rows.financeMeta;
  const initial = meta.initial;
  financeText('sumNW', fmt(initial.netWorth));
  document.getElementById('sumNW').className = initial.netWorth >= 0 ? 'val co' : 'val cr';
  financeText('subNW', `${L('Cash', '현금')} ${fmt(initial.cash)} · ${L('Accounts', '계좌')} ${fmt(initial.accountTotal)} · ${L('Deposit', '보증금')} ${fmt(initial.deposit)}`);
  financeText('sumDebt', fmt(initial.debt));
  financeText('subDebt', L('All modeled liabilities', '모델의 전체 부채'));
  const retirement = rows.find(r => r.age === pN('retireAge'));
  financeText('sumRetire', retirement ? fmt(retirement.netWorth) : '—');
  financeText('subRetire', retirement ? `${L('Available', '사용 가능')} ${fmt(retirement.totalLiquid)} · ${L('Locked', '잠김')} ${fmt(retirement.lockedRetirement)}` : '');
  const gap = rows.find(r => r.shortfall > 1e-7);
  financeText('sumDeplete', gap ? `${gap.year} · ${gap.age}${t('ageSfx')}` : L('Funded to 100', '100세까지 충당'));
  financeText('subDeplete', gap ? `${L('Unfunded', '미충족')} ${fmt(gap.shortfall)}` :
    meta.provisional ? L('Provisional assumptions', '잠정 가정 포함') : L('No modeled funding gap', '모델상 자금 부족 없음'));
  document.getElementById('sumDeplete').className = gap ? 'val cr' : 'val cg';
  financeText('sumSave', fmt(rows[0].savings));
  financeText('subSave', `${rows[0].periodStart} – ${rows[0].periodEnd}`);
}
function renderFinanceTable(rows) {
  const header = document.getElementById('tblHead'), body = document.getElementById('tblBody');
  header.replaceChildren(); body.replaceChildren();
  const accountIds = rows[0]?.accSnapshot.map(a => a.id) || [];
  const labels = [
    L('Year / age', '연도 / 나이'), L('Events', '이벤트'),
    L('Net cash income', '순현금 수입'), L('Living / one-off needs', '생활비·목돈 수요'),
    L('Cash surplus', '현금 잉여'), L('Bank cash', '예금·현금'),
    ...accountIds.map(id => `${accounts.find(a => a.id === id)?.name || id} (${L('gross', '세전 잔액')})`),
    L('Rental deposit', '임대보증금'), L('ESPP clearing', 'ESPP 대기자금'),
    L('DB cash settled (included)', 'DB 현금 수령 (기반영)'), L('DB retirement settled (included)', 'DB 연금계좌 정산 (기반영)'),
    L('Locked retirement', '잠긴 은퇴자산'), L('Available after estimated tax', '예상 세후 가용자금'),
    L('Gross TC target', '세전 TC 목표'), L('Known gross (net inputs excluded)', '확인된 세전액 (세후 입력 제외)'),
    L('Additional modeled taxes', '추가 모델 세금'), L('Employee deposits', '본인 계좌 납입'),
    L('Employer deposits', '회사 납입'), L('Loan payments', '부채 상환'),
    L('Unfunded needs', '미충족 자금'), L('Net worth (gross assets less debt)', '순자산 (자산−부채)'),
  ];
  const tr = document.createElement('tr');
  for (const label of labels) { const th = document.createElement('th'); th.textContent = label; tr.appendChild(th); }
  header.appendChild(tr);
  const showOnly = document.getElementById('showRetireOnly').checked;
  for (const r of rows.filter(x => !showOnly || x.isRetired)) {
    const line = document.createElement('tr');
    if (r.age === pN('retireAge')) line.classList.add('hl');
    const age = document.createElement('td'); age.textContent = yearAgeLabel(r);
    age.title = `${r.periodStart} – ${r.periodEnd}`; line.appendChild(age);
    const eventCell = document.createElement('td'), wrap = document.createElement('div'); wrap.className = 'ev-cell-inner';
    for (const e of r.events) {
      const tag = document.createElement('span'); tag.className = 'edot';
      tag.textContent = (e.date ? formatEventDate(e.date) + ' · ' : '') + (e.label || e.type);
      wrap.appendChild(tag);
    }
    if (!r.events.length) wrap.textContent = '—';
    eventCell.appendChild(wrap); line.appendChild(eventCell);
    const values = [r.income, r.expense, r.savings, r.invest,
      ...accountIds.map(id => r.accSnapshot.find(a => a.id === id)?.balance ?? 0),
      r.rentalDepositAsset, r.esppClearing, r.dbBenefitCash, r.dbBenefitTransfers, r.lockedRetirement, r.totalLiquid,
      r.grossTcTarget, r.grossIncome, r.taxes, r.employeeContributions, r.employerContributions,
      r.debtPayments, r.shortfall, r.netWorth];
    values.forEach((v, i) => {
      const cell = document.createElement('td'); cell.textContent = fmt(v);
      if (v < 0 || (i === values.length - 2 && v > 1e-7)) cell.className = 'neg';
      line.appendChild(cell);
    });
    body.appendChild(line);
  }
}
function renderFinanceTarget(rows) {
  const { fi, bridge } = rows.financeMeta;
  financeText('fireTarget', fi.currentTarget > 0 ? fmt(fi.currentTarget) : '—');
  financeText('fireNet', fi.pensionEligibleAtRetirement ? fmt(fi.requiredAtRetirement) : '—');
  const progress = fi.currentTarget > 0 ? fi.currentAvailable / fi.currentTarget * 100 : 0;
  financeText('firePct', `${progress.toFixed(1)}%`);
  document.getElementById('fireFill').style.width = Math.min(100, Math.max(0, progress)) + '%';
  financeText('fireNow', `${L('Available now', '현재 가용자금')} ${fmt(fi.currentAvailable)}`);
  financeText('fireRetireEst', `${L('Future target', '은퇴 시 목표')} ${fi.requiredAtRetirement > 0 ? fmt(fi.requiredAtRetirement) : '—'}`);
  let panel = document.getElementById('financeReport');
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'financeReport'; panel.className = 'finance-report';
    document.getElementById('housingTableWrap').after(panel);
  }
  panel.replaceChildren();
  const heading = document.createElement('h3'); heading.textContent = L('Liquidity, assumptions and bridge', '유동성·가정·브리지'); panel.appendChild(heading);
  const desc = document.createElement('p'); desc.textContent = L(
    'Net worth includes refundable deposits and locked assets; available funds do not. Tax estimates use your effective-rate assumptions. Unfunded dated needs fail the projection even when net worth is positive.',
    '순자산에는 보증금과 잠긴 자산이 포함되지만 가용자금에는 포함되지 않습니다. 세금은 입력한 유효세율 추정입니다. 순자산이 양수여도 날짜별 필요 지출을 충당하지 못하면 실패입니다.');
  panel.appendChild(desc);
  const b = document.createElement('p');
  b.textContent = bridge.end > bridge.start
    ? `${L('Bridge', '브리지')} ${bridge.start} → ${bridge.end} · ${L('Opening available', '시작 가용자금')} ${fmt(bridge.openingAvailable)} · ${L('Net needs', '순필요액')} ${fmt(bridge.requiredNet)} · ${L('Unfunded', '미충족')} ${fmt(bridge.shortfall)}`
    : L('No delayed-access retirement bridge interval is configured.', '인출 시점이 늦은 은퇴계좌의 브리지 구간이 설정되지 않았습니다.');
  panel.appendChild(b);
  if (rows.financeMeta.provisional) {
    const box = document.createElement('details'); box.className = 'finance-warnings';
    const title = document.createElement('summary'); title.textContent = L('Provisional results — review assumptions', '잠정 결과 — 가정을 확인하세요') + ` (${rows.financeMeta.warnings.length})`;
    const list = document.createElement('ul');
    for (const warning of rows.financeMeta.warnings) { const li = document.createElement('li'); li.textContent = warning; list.appendChild(li); }
    box.append(title, list); panel.appendChild(box);
  }
  if (fi.partial.length) {
    const details = document.createElement('details'); const title = document.createElement('summary'); title.textContent = L('Partial FI goal', '부분적 경제적 자유 목표');
    details.appendChild(title);
    for (const p of fi.partial) {
      const item = document.createElement('p');
      item.textContent = `${p.year} · ${p.age}${t('ageSfx')} · ${L('coverage', '충당률')} ${p.coveragePct.toFixed(1)}% · ${L('additional annual work income needed', '추가 연 근로소득 필요')} ${fmt(p.workIncomeNeeded)}` +
        (p.maintainedWorkIncome == null ? L(' · maintained income not entered', ' · 유지 소득 미입력') : '');
      details.appendChild(item);
    }
    panel.appendChild(details);
  }
  const audit = document.createElement('details'), auditTitle = document.createElement('summary');
  auditTitle.textContent = L('Dated ledger (first 150 entries)', '날짜별 원장 (처음 150개)');
  audit.appendChild(auditTitle);
  const list = document.createElement('ol');
  for (const entry of rows.financeMeta.journal.slice(0, 150)) {
    const item = document.createElement('li');
    item.textContent = `${entry.date} · ${entry.kind} · ${entry.label} · ${fmt(entry.amount)}`;
    list.appendChild(item);
  }
  audit.appendChild(list); panel.appendChild(audit);
}
function financeExportTable(rows, onlyRetired) {
  const list = rows.filter(r => !onlyRetired || r.isRetired);
  const headers = ['Year / age', 'Events', 'Net cash income', 'Spending needs', 'Cash surplus', 'Cash',
    'Rental deposit', 'ESPP clearing', 'DB cash settled (included)', 'DB retirement settled (included)', 'Locked assets', 'Available after estimated tax',
    'Gross TC target', 'Gross income', 'Taxes', 'Employee contributions', 'Employer contributions',
    'Loan payments', 'Unfunded', 'Net worth'];
  const safe = value => String(value).replaceAll('|', '/').replaceAll('\n', ' ');
  const lines = ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |'];
  for (const r of list) {
    const cells = [yearAgeLabel(r), r.events.map(e => `${e.date || ''} · ${e.label}`).join(', '),
      ...[r.income, r.expense, r.savings, r.invest, r.rentalDepositAsset, r.esppClearing, r.dbBenefitCash, r.dbBenefitTransfers, r.lockedRetirement,
        r.totalLiquid, r.grossTcTarget, r.grossIncome, r.taxes, r.employeeContributions, r.employerContributions,
        r.debtPayments, r.shortfall, r.netWorth].map(fmt)];
    lines.push('| ' + cells.map(safe).join(' | ') + ' |');
  }
  return lines.join('\n');
}
function financeCompareHousing() {
  const original = captureState();
  const base = NWFinanceEngine.simulate(original, { scenario: currentSc });
  const scenarios = [];
  for (const hs of housingScenarios.filter(x => x.enabled)) {
    let copy = NWFinanceState.convertLegacy(original);
    const year = Number(copy.projectionStartDate.slice(0, 4)) + Number(hs.startAge) - Number(copy.inputs.currentAge);
    const date = Number(hs.startAge) === Number(copy.inputs.currentAge) ? copy.projectionStartDate : `${year}-01-01`;
    let id = Math.max(0, ...copy.events.map(e => e.id)) + 1;
    const event = (type, amount) => copy.events.push({ id: id++, type, currency: hs.currency,
      value: String(amount), date, name: hs.name || hs.type, depositId: `comparison-${hs.id}` });
    if (hs.type === 'buy') {
      const home = NWFinanceState.newRecord('homes');
      Object.assign(home, { name: hs.name || hs.type, currency: hs.currency, date,
        price: NWCore.number(hs.purchasePrice), downPaymentPct: 100 - Number(hs.ltvRatio),
        loanRatePct: Number(hs.loanRate), loanYears: Number(hs.loanTerm), closingCost: 0,
        annualPropertyTax: 0, annualInsurance: 0, annualMaintenance: NWCore.number(hs.annualMaintenance),
        appreciationPct: Number(hs.appreciationRate), status: 'estimated' });
      copy.finance.homes.push(home);
    } else if (hs.type === 'rent') {
      event('deposit-pay', NWCore.number(hs.rentDeposit));
      const rent = NWFinanceState.newRecord('flows');
      Object.assign(rent, { name: hs.name || 'Rent', kind: 'expense', category: 'housing',
        currency: hs.currency, amount: NWCore.number(hs.monthlyRent), frequency: 'monthly',
        start: date, growthPct: Number(hs.rentIncreaseRate), retirementRole: 'additional', status: 'estimated' });
      copy.finance.flows.push(rent);
    } else {
      let deposit = NWCore.number(hs.deposit);
      event('deposit-pay', deposit);
      const cycle = Number(hs.renewalCycle);
      const lastYear = Number(copy.projectionStartDate.slice(0, 4)) + 100 - Number(copy.inputs.currentAge);
      for (let y = year + cycle; y <= lastYear; y += cycle) {
        const next = deposit * (1 + Number(hs.depositRenewalRate) / 100);
        copy.events.push({ id: id++, type: next >= deposit ? 'deposit-pay' : 'deposit-return', currency: hs.currency,
          value: String(Math.abs(next - deposit)), date: `${y}-01-01`, name: hs.name || 'Deposit renewal', depositId: `comparison-${hs.id}` });
        deposit = next;
      }
    }
    const result = NWFinanceEngine.simulate(copy, { scenario: currentSc });
    let cumulativeCost = 0;
    scenarios.push({ id: hs.id, name: hs.name || t('housing.scenario'), type: hs.type,
      rows: result.rows.map((r, i) => {
        cumulativeCost += Math.max(0, r.expense + r.debtInterest - base.rows[i].expense - base.rows[i].debtInterest);
        return { ...r, netWorth: r.netWorth, propertyValue: r.realAssets - base.rows[i].realAssets,
          loanBalance: Math.max(0, r.debtRemain - base.rows[i].debtRemain), depositHeld: r.rentalDepositAsset - base.rows[i].rentalDepositAsset, cumulativeCost };
      }) });
  }
  return { scenarios, breakeven: calcBreakeven(scenarios) };
}
function financeTimelineItems() {
  const f = financeEnsure();
  const result = events.filter(e => !(f.useDetailedFlows && ['income', 'expense', 'income-add', 'expense-add'].includes(e.type))).map(e => ({ ...e }));
  if (f.useDetailedFlows) for (const flow of f.flows) {
    if (!flow.start) continue;
    result.push({ id: flow.id, date: flow.start, type: flow.kind === 'expense' ? 'expense' : 'income',
      value: flow.amount ?? '', currency: flow.currency, name: `${flow.name} · ${flow.frequency}`,
      financeRef: flow.id, status: flow.status, enabled: flow.enabled });
  }
  for (const grant of f.rsu) for (const vest of grant.schedule) result.push({
    id: `${grant.id}-${vest.date}`, date: vest.date, type: 'income', value: vest.amount ?? (vest.shares ?? 0) * (vest.price ?? 0),
    currency: grant.currency, name: `${grant.name} · RSU`, financeRef: grant.id, status: grant.status, enabled: grant.enabled,
  });
  for (const home of f.homes) if (home.date) result.push({ id: home.id, date: home.date, type: 'lumpsum-out',
    value: home.price ?? '', currency: home.currency, name: `${home.name} · ${home.country}`, financeRef: home.id, status: home.status, enabled: home.enabled });
  for (const benefit of f.dbBenefits) if (benefit.paymentDate) result.push({
    id: benefit.id, date: benefit.paymentDate, type: 'lumpsum-in', value: benefit.expectedAmount ?? '',
    currency: benefit.currency, name: `${benefit.name} · DB`, financeRef: benefit.id,
    status: benefit.status, enabled: benefit.enabled,
  });
  return result;
}
