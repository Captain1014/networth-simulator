/**
 * Net Worth Simulator (자산 시뮬레이터)
 * Multi-account, tax-aware, life events, long-term asset flow
 */

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let accounts = [];
let events = [];
let acid = 0;
let eid = 0;
let currentSc = 'base';
let chartInst = null;

const SC = { base: { r: 0, p: 0 }, opt: { r: 2, p: 1 }, pes: { r: -2, p: -1 } };

const ACC_TYPES = {
  roth:        { label: 'Roth IRA',                   badge: 'badge-roth',        color: '#6abf7b', taxOnContrib: true,  taxOnWithdraw: false, desc: '세후 납입 → 인출 비과세' },
  traditional: { label: 'Traditional IRA / 401k',      badge: 'badge-traditional', color: '#9b7fe8', taxOnContrib: false, taxOnWithdraw: true,  desc: '세전 납입 → 인출 시 과세' },
  pension_kr:  { label: '한국 연금저축펀드',          badge: 'badge-pension',     color: '#5b9bd5', taxOnContrib: false, taxOnWithdraw: true,  desc: '세전 납입 → 연금소득세 과세' },
  taxable:     { label: '일반 과세 계좌',              badge: 'badge-taxable',     color: '#d4a853', taxOnContrib: false, taxOnWithdraw: false, desc: '수익에 대해 매년 과세' },
};

const STORAGE_KEY = 'networth-simulator-state';
const INPUT_IDS = [
  'currentAge', 'retireAge', 'investAsset', 'returnRate', 'inflation', 'wageGrowthRate',
  'realEstate', 'vehicle', 'otherAsset',
  'mortgage', 'mortgageRate', 'studentLoan', 'studentLoanRate', 'carLoan', 'otherDebt',
  'annualIncome', 'annualExpense',
  'targetMonthly', 'withdrawRate', 'externalPension',
];
let saveTimeout = null;

// ═══════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════
function saveState() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const inputs = {};
      for (const id of INPUT_IDS) {
        const el = document.getElementById(id);
        if (el) inputs[id] = el.value;
      }
      const showRetireOnlyEl = document.getElementById('showRetireOnly');
      const state = {
        inputs,
        accounts: accounts.map(a => ({ ...a })),
        events: events.map(e => ({ ...e })),
        currentSc,
        showRetireOnly: showRetireOnlyEl ? showRetireOnlyEl.checked : false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* quota or disabled */ }
  }, 400);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (state.inputs) {
      for (const [id, value] of Object.entries(state.inputs)) {
        const el = document.getElementById(id);
        if (el && value != null) el.value = String(value);
      }
    }
    if (Array.isArray(state.accounts) && state.accounts.length > 0) {
      accounts = state.accounts;
      acid = Math.max(0, ...accounts.map(a => a.id));
    }
    if (Array.isArray(state.events) && state.events.length > 0) {
      events = state.events;
      eid = Math.max(0, ...events.map(e => e.id));
    }
    if (state.currentSc && SC[state.currentSc]) currentSc = state.currentSc;
    const showRetireOnlyEl = document.getElementById('showRetireOnly');
    if (showRetireOnlyEl && state.showRetireOnly != null) showRetireOnlyEl.checked = state.showRetireOnly;
    return true;
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function pN(id) {
  const v = (document.getElementById(id)?.value || '').replace(/,/g, '').replace('%', '').trim();
  return parseFloat(v) || 0;
}
function pR(id) { return pN(id) / 100; }

/** Parse amount string: supports "150k", "1.5M", "150,000", etc. */
function parseMoney(str) {
  if (str == null || str === '') return 0;
  const s = String(str).replace(/,/g, '').trim();
  const m = s.match(/^([-\d.]+)\s*([kKmMbB])?$/);
  if (!m) return parseFloat(s) || 0;
  let n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'k') n *= 1e3;
  else if (suffix === 'm') n *= 1e6;
  else if (suffix === 'b') n *= 1e9;
  return n;
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  const s = n < 0 ? '-$' : '$';
  const a = Math.abs(Math.round(n));
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
  return s + a.toLocaleString('en-US');
}

// ═══════════════════════════════════════════════════
// SIMULATE
// ═══════════════════════════════════════════════════
function simulate(sk = 'base') {
  const mod = SC[sk];
  const startAge = pN('currentAge');
  const retireAge = pN('retireAge');
  let invest = pN('investAsset');
  let income = pN('annualIncome');
  let expense = pN('annualExpense');
  const rr = pR('returnRate') + mod.r / 100;
  const inf = pR('inflation');
  const wageGrowth = pR('wageGrowthRate');

  let mortgage = pN('mortgage');
  let studentLoan = pN('studentLoan');
  let carLoan = pN('carLoan');
  const mRate = pR('mortgageRate');
  const slRate = pR('studentLoanRate');

  const accState = accounts.map(a => ({
    id: a.id,
    balance: parseFloat(a.balance) || 0,
    type: a.type,
    rate: (parseFloat(a.rate) || 0) / 100 + mod.p / 100,
    contribSelf: parseFloat(a.contribSelf) || 0,
    contribSelfRate: (parseFloat(a.contribSelfRate) || 0) / 100,
    contribEmployer: parseFloat(a.contribEmployer) || 0,
    contribEmployerRate: (parseFloat(a.contribEmployerRate) || 0) / 100,
    employerMatchMode: a.employerMatchMode || (a.contribEmployerRate ? 'percent' : 'fixed'),
    matchRate: (parseFloat(a.matchRate) || 50) / 100,
    matchCapPercent: (parseFloat(a.matchCapPercent) || 8) / 100,
    contribEndAge: parseInt(a.contribEndAge) || retireAge,
    withdrawTaxRate: (parseFloat(a.withdrawTaxRate) || 0) / 100,
    retireDrawAge: parseInt(a.retireDrawAge) || 60,
  }));

  const rows = [];
  for (let age = startAge; age <= 100; age++) {
    const isRetired = age >= retireAge;

    let lumpIn = 0, lumpOut = 0;
    const evDescs = [];
    for (const ev of events) {
      if (parseInt(ev.age, 10) !== age) continue;
      const val = Number(parseMoney(ev.value));
      if (ev.type === 'income') { income = val; evDescs.push({ type: ev.type, label: ev.name || '수입 변경' }); }
      else if (ev.type === 'expense') { expense = val; evDescs.push({ type: ev.type, label: ev.name || '지출 변경' }); }
      else if (ev.type === 'lumpsum-out') { lumpOut += val; evDescs.push({ type: ev.type, label: ev.name || '목돈 지출' }); }
      else if (ev.type === 'lumpsum-in') { lumpIn += val; evDescs.push({ type: ev.type, label: ev.name || '목돈 유입' }); }
    }

    const mPayment = mortgage > 0 ? mortgage * mRate / (1 - Math.pow(1 + mRate, -Math.max(1, 30 - (age - startAge)))) : 0;
    const slPayment = studentLoan > 0 ? studentLoan * slRate / (1 - Math.pow(1 + slRate, -Math.max(1, 10 - (age - startAge)))) : 0;
    const carPayment = carLoan > 0 ? carLoan / Math.max(1, 5 - (age - startAge)) : 0;
    const totalDebt = Math.min(mPayment + slPayment + carPayment, mortgage + studentLoan + carLoan);
    mortgage = Math.max(0, mortgage - (mPayment - mortgage * mRate));
    studentLoan = Math.max(0, studentLoan - (slPayment - studentLoan * slRate));
    carLoan = Math.max(0, carLoan - carPayment);

    let totalAccContrib = 0;
    let totalAccBalancePre = 0;
    for (const ac of accState) {
      const stillContrib = age < ac.contribEndAge;
      const selfAmt = stillContrib ? (ac.contribSelfRate > 0 ? income * ac.contribSelfRate : ac.contribSelf) : 0;
      let employerAmt = 0;
      if (stillContrib) {
        if (ac.employerMatchMode === 'match') {
          const matchable = Math.min(selfAmt, ac.matchCapPercent * income);
          employerAmt = ac.matchRate * matchable;
        } else if (ac.contribEmployerRate > 0) {
          employerAmt = income * ac.contribEmployerRate;
        } else {
          employerAmt = ac.contribEmployer;
        }
      }
      ac.balance = ac.balance * (1 + ac.rate) + selfAmt + employerAmt;
      totalAccContrib += selfAmt;
      totalAccBalancePre += ac.balance;
    }

    const savings = isRetired ? 0 : (income - expense - totalDebt - totalAccContrib);
    invest = invest * (1 + rr) + savings + lumpIn - lumpOut;
    if (isRetired && expense > 0) {
      let totalAT = 0;
      const drawable = accState.filter(ac => age >= (ac.retireDrawAge || 60));
      for (const ac of drawable) {
        const t = ACC_TYPES[ac.type] || ACC_TYPES.roth;
        totalAT += t.taxOnWithdraw ? ac.balance * (1 - ac.withdrawTaxRate) : ac.balance;
      }
      const investVal = Math.max(0, invest);
      const totalLiquidPre = investVal + totalAT;
      if (totalLiquidPre > 0) {
        const drawFromInvest = (investVal / totalLiquidPre) * expense;
        invest = Math.max(0, invest - drawFromInvest);
        const remaining = expense - drawFromInvest;
        if (remaining > 0 && totalAT > 0) {
          for (const ac of drawable) {
            const t = ACC_TYPES[ac.type] || ACC_TYPES.roth;
            const afterTax = t.taxOnWithdraw ? ac.balance * (1 - ac.withdrawTaxRate) : ac.balance;
            const share = (afterTax / totalAT) * remaining;
            if (share <= 0) continue;
            if (t.taxOnWithdraw) {
              const grossWithdraw = share / (1 - ac.withdrawTaxRate);
              ac.balance = Math.max(0, ac.balance - grossWithdraw);
            } else {
              ac.balance = Math.max(0, ac.balance - share);
            }
          }
        }
      } else {
        invest = Math.max(0, invest - expense);
      }
    }

    let totalAccAfterTax = 0;
    for (const ac of accState) {
      const t = ACC_TYPES[ac.type] || ACC_TYPES.roth;
      totalAccAfterTax += t.taxOnWithdraw ? ac.balance * (1 - ac.withdrawTaxRate) : ac.balance;
    }

    const totalLiquid = Math.max(0, invest) + totalAccAfterTax;
    const dispIncome = isRetired ? null : income;
    const dispExpense = expense + (isRetired ? 0 : totalDebt);
    const dispSavings = isRetired ? -expense : savings;

    expense = expense * (1 + inf);
    if (!isRetired) income = income * (1 + wageGrowth);

    rows.push({
      age,
      isRetired,
      income: dispIncome,
      expense: dispExpense,
      savings: dispSavings,
      invest,
      totalAccAfterTax,
      totalAccBalancePre,
      totalLiquid,
      investRaw: invest,
      accSnapshot: accState.map(a => ({ id: a.id, balance: a.balance })),
      events: evDescs,
      debtRemain: mortgage + studentLoan + carLoan,
    });
  }
  return rows;
}

// ═══════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════
function renderSummary(rows) {
  const iNow = pN('investAsset');
  const real = pN('realEstate') + pN('vehicle') + pN('otherAsset');
  const totalDebt = pN('mortgage') + pN('studentLoan') + pN('carLoan') + pN('otherDebt');
  const accTotal = accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const totalAssets = iNow + accTotal + real;
  const netWorth = totalAssets - totalDebt;

  document.getElementById('sumNW').textContent = fmt(netWorth);
  document.getElementById('sumNW').className = 'val ' + (netWorth >= 0 ? 'co' : 'cr');
  document.getElementById('subNW').textContent = `자산 ${fmt(totalAssets)} − 부채 ${fmt(totalDebt)}`;

  document.getElementById('sumDebt').textContent = fmt(totalDebt);
  document.getElementById('sumDebt').className = 'val ' + (totalDebt > 0 ? 'cr' : 'cg');
  const debtParts = [];
  if (pN('mortgage') > 0) debtParts.push('모기지 ' + fmt(pN('mortgage')));
  if (pN('studentLoan') > 0) debtParts.push('학자금 ' + fmt(pN('studentLoan')));
  if (pN('carLoan') > 0) debtParts.push('차량 ' + fmt(pN('carLoan')));
  if (pN('otherDebt') > 0) debtParts.push('기타 ' + fmt(pN('otherDebt')));
  document.getElementById('subDebt').textContent = totalDebt > 0
    ? (debtParts.length ? debtParts.join(' · ') : '부채')
    : '부채 없음 ✓';

  const retAge = pN('retireAge');
  const rr = rows.find(r => r.age === retAge);
  if (rr) {
    document.getElementById('sumRetire').textContent = fmt(rr.totalLiquid);
    document.getElementById('sumRetire').className = 'val ' + (rr.totalLiquid > 0 ? 'cg' : 'cr');
    document.getElementById('subRetire').textContent = `투자 ${fmt(Math.max(0, rr.invest))} · 계좌 ${fmt(rr.totalAccAfterTax)}`;
  }

  const dep = rows.find(r => r.totalLiquid <= 0);
  if (dep) {
    document.getElementById('sumDeplete').textContent = dep.age + '세';
    document.getElementById('sumDeplete').className = 'val cr';
    document.getElementById('subDeplete').textContent = '전체 자산 소진 예상';
  } else {
    document.getElementById('sumDeplete').textContent = '100세+';
    document.getElementById('sumDeplete').className = 'val cg';
    document.getElementById('subDeplete').textContent = '기간 내 소진 없음 ✓';
  }

  // Annual net savings = income - expense - debt repayment (matches subtitle)
  const income = pN('annualIncome');
  const expense = pN('annualExpense');
  const mort = pN('mortgage');
  const sl = pN('studentLoan');
  const car = pN('carLoan');
  const mRate = pR('mortgageRate');
  const slRate = pR('studentLoanRate');
  const mPay = mort > 0 ? mort * mRate / (1 - Math.pow(1 + mRate, -Math.max(1, 30))) : 0;
  const slPay = sl > 0 ? sl * slRate / (1 - Math.pow(1 + slRate, -Math.max(1, 10))) : 0;
  const carPay = car > 0 ? car / Math.max(1, 5) : 0;
  const annualDebtPay = Math.min(mPay + slPay + carPay, mort + sl + car);
  const net = income - expense - annualDebtPay;
  document.getElementById('sumSave').textContent = fmt(net);
  document.getElementById('sumSave').className = 'val ' + (net >= 0 ? 'cb' : 'cr');
}

// ═══════════════════════════════════════════════════
// CHART
// ═══════════════════════════════════════════════════
function renderChart(rows) {
  const labels = rows.map(r => r.age + '세');
  const totalD = rows.map(r => Math.round(r.totalLiquid));
  const investD = rows.map(r => r.invest >= 0 ? Math.round(r.invest) : null);
  const accD = rows.map(r => Math.round(r.totalAccAfterTax));

  if (chartInst) chartInst.destroy();
  const ctx = document.getElementById('mainChart').getContext('2d');
  chartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '총 자산 (세후)', data: totalD, borderColor: '#d4a853', backgroundColor: 'rgba(212,168,83,0.07)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.3 },
        { label: '투자자산', data: investD, borderColor: '#5b9bd5', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, borderDash: [4, 3], tension: 0.3 },
        { label: '연금계좌 합계 (세후)', data: accD, borderColor: '#5bbfb5', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, borderDash: [2, 4], tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a0a0b8', font: { size: 10 }, boxWidth: 10, padding: 14 } },
        tooltip: {
          backgroundColor: '#1e1e27',
          borderColor: '#2c2c3a',
          borderWidth: 1,
          titleColor: '#e8e6f0',
          bodyColor: '#a0a0b8',
          padding: 10,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: '#606078', font: { size: 9 }, maxTicksLimit: 14 }, grid: { color: 'rgba(44,44,58,0.4)' } },
        y: { ticks: { color: '#606078', font: { size: 9, family: 'DM Mono' }, callback: v => fmt(v) }, grid: { color: 'rgba(44,44,58,0.4)' } },
      },
    },
  });
}

// ═══════════════════════════════════════════════════
// TABLE
// ═══════════════════════════════════════════════════
function renderTable(rows) {
  const retAge = pN('retireAge');
  const showOnly = document.getElementById('showRetireOnly').checked;
  const head = document.getElementById('tblHead');
  const body = document.getElementById('tblBody');

  const accCols = accounts.map(a => a.name || (ACC_TYPES[a.type]?.label || '계좌'));
  head.innerHTML = `<tr>
    <th>나이</th><th>이벤트</th>
    <th>연 수입</th><th>연 지출</th><th>순저축</th>
    <th>투자/저축자산</th>
    ${accCols.map(n => `<th>${n}</th>`).join('')}
    <th>총자산(세후)</th>
  </tr>`;

  body.innerHTML = '';
  const list = showOnly ? rows.filter(r => r.isRetired) : rows;
  for (const r of list) {
    const tr = document.createElement('tr');
    if (r.age === retAge) tr.classList.add('hl');

    let ageCell = r.age + '세';
    if (r.age === retAge) ageCell += '<span class="retire-tag">은퇴</span>';

    const evCell = r.events.map(e => `<span class="edot edot-${e.type}">${e.label}</span>`).join('') || '<span style="color:var(--text3)">—</span>';
    const inc = r.income != null ? fmt(r.income) : '<span style="color:var(--text3)">—</span>';
    const exp = fmt(r.expense);
    const sav = fmt(r.savings);
    const savC = r.savings >= 0 ? 'pos' : 'neg';
    const inv = r.invest < 0 ? '<span class="neg">소진</span>' : fmt(r.invest);
    const invC = r.invest < 0 ? 'neg' : 'pos';

    const accCells = accounts.map(a => {
      const snap = r.accSnapshot.find(s => s.id === a.id);
      if (!snap) return '<td style="color:var(--text3)">—</td>';
      const t = ACC_TYPES[a.type] || ACC_TYPES.roth;
      const txRate = (parseFloat(a.withdrawTaxRate) || 0) / 100;
      const afterTax = t.taxOnWithdraw ? snap.balance * (1 - txRate) : snap.balance;
      return `<td class="pos" style="color:${ACC_TYPES[a.type]?.color || 'var(--text2)'}">${fmt(afterTax)}</td>`;
    }).join('');

    const tot = fmt(r.totalLiquid);
    const totC = r.totalLiquid > 0 ? 'pos' : 'neg';

    tr.innerHTML = `
      <td>${ageCell}</td>
      <td>${evCell}</td>
      <td>${inc}</td>
      <td>${exp}</td>
      <td class="${savC}">${sav}</td>
      <td class="${invC}">${inv}</td>
      ${accCells}
      <td class="${totC}" style="font-weight:600">${tot}</td>
    `;
    body.appendChild(tr);
  }
}

// ═══════════════════════════════════════════════════
// 4% FIRE
// ═══════════════════════════════════════════════════
function render4pct(rows) {
  const monthly = pN('targetMonthly');
  const wRate = (pN('withdrawRate') || 4) / 100;
  const extPenMo = pN('externalPension');
  const annualNeed = monthly * 12;
  const extPenAnnual = extPenMo * 12;
  const fireTarget = annualNeed / wRate;
  const fireNet = Math.max(0, annualNeed - extPenAnnual) / wRate;

  document.getElementById('fireTarget').textContent = fmt(fireTarget);
  document.getElementById('fireNet').textContent = extPenMo > 0 ? fmt(fireNet) : '—';

  const iNow = pN('investAsset');
  const accNow = accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0);
  const nowTotal = iNow + accNow;

  let retireTotal = 0;
  if (rows) {
    const retAge = pN('retireAge');
    const rr = rows.find(r => r.age === retAge);
    if (rr) retireTotal = rr.totalLiquid;
  }

  const pct = fireTarget > 0 ? Math.min((nowTotal / fireTarget) * 100, 150) : 0;
  const retirePct = fireTarget > 0 ? Math.min((retireTotal / fireTarget) * 100, 150) : 0;

  document.getElementById('firePct').textContent = pct.toFixed(1) + '%';
  document.getElementById('fireFill').style.width = Math.min(pct, 100).toFixed(1) + '%';
  document.getElementById('fireFill').style.background = pct >= 100 ? 'linear-gradient(90deg,var(--teal),var(--green))' : pct >= 60 ? 'linear-gradient(90deg,var(--teal),var(--gold))' : 'linear-gradient(90deg,var(--red),var(--gold))';
  document.getElementById('fireNow').textContent = `현재 ${fmt(nowTotal)} (${pct.toFixed(0)}%)`;
  document.getElementById('fireRetireEst').textContent = `은퇴 시 ${fmt(retireTotal)} (${retirePct.toFixed(0)}%)`;
}

// ═══════════════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════════════
function renderAll() {
  const rows = simulate(currentSc);
  renderSummary(rows);
  renderChart(rows);
  renderTable(rows);
  render4pct(rows);
  saveState();
}

// ═══════════════════════════════════════════════════
// SCENARIO
// ═══════════════════════════════════════════════════
function switchSc(k) {
  currentSc = k;
  ['base', 'opt', 'pes'].forEach(t => document.getElementById('tab-' + t)?.classList.toggle('active', t === k));
  renderAll();
}

// ═══════════════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════════════
function addAccount(opts = {}) {
  const id = ++acid;
  accounts.push({
    id,
    type: opts.type || 'roth',
    name: opts.name || '',
    balance: opts.balance || '',
    rate: opts.rate || '7',
    contribSelf: opts.contribSelf || '',
    contribSelfRate: opts.contribSelfRate || '',
    contribEmployer: opts.contribEmployer || '',
    contribEmployerRate: opts.contribEmployerRate || '',
    employerMatchMode: opts.employerMatchMode || 'percent',
    matchRate: opts.matchRate ?? '50',
    matchCapPercent: opts.matchCapPercent ?? '8',
    contribEndAge: opts.contribEndAge ?? '',
    withdrawTaxRate: opts.withdrawTaxRate || '0',
    retireDrawAge: opts.retireDrawAge || '60',
  });
  renderAccountList();
  renderAll();
}

function removeAccount(id) {
  accounts = accounts.filter(a => a.id !== id);
  renderAccountList();
  renderAll();
}

function updateAccount(id, field, value) {
  const a = accounts.find(x => x.id === id);
  if (!a) return;
  a[field] = value;
  if (field === 'name') {
    const nameEl = document.querySelector('#ac-' + id + ' .acc-name');
    if (nameEl) nameEl.textContent = value || (ACC_TYPES[a.type]?.label || '');
  } else if (['type', 'employerMatchMode'].includes(field)) {
    renderAccountList();
  }
  renderAll();
}

function toggleAcc(id) {
  document.getElementById('ac-' + id)?.classList.toggle('open');
}

function renderAccountList() {
  const list = document.getElementById('accountList');
  const openIds = new Set();
  list.querySelectorAll('.acc-card.open').forEach(el => openIds.add(el.id));
  list.querySelectorAll('.acc-card').forEach(el => el.remove());
  const nm = document.getElementById('noAccsMsg');
  if (accounts.length === 0) { if (nm) nm.style.display = ''; return; }
  if (nm) nm.style.display = 'none';

  for (const a of accounts) {
    const t = ACC_TYPES[a.type] || ACC_TYPES.roth;
    const empMode = a.employerMatchMode || (a.contribEmployerRate ? 'percent' : 'fixed');
    const card = document.createElement('div');
    card.className = 'acc-card';
    card.id = 'ac-' + a.id;
    const balFmt = a.balance ? fmt(parseFloat(a.balance)) : '$0';
    card.innerHTML = `
      <div class="acc-head" onclick="toggleAcc(${a.id})">
        <span class="acc-badge ${t.badge}">${t.label}</span>
        <span class="acc-name">${a.name || t.label}</span>
        <span class="acc-bal">${balFmt}</span>
        <span class="acc-toggle">▼</span>
      </div>
      <div class="acc-body">
        <div class="field"><label>계좌 종류</label>
          <select class="acc-sel" onchange="updateAccount(${a.id},'type',this.value)">
            ${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div style="font-size:10px;color:var(--text3);padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:5px;margin-bottom:8px;">${t.desc}</div>
        <div class="field"><label>계좌 별명</label>
          <input class="acc-inp" type="text" placeholder="예: 미국 Roth IRA, 한국 연금저축" value="${a.name}" oninput="updateAccount(${a.id},'name',this.value)">
        </div>
        <div class="row2">
          <div class="field"><label>현재 잔액</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.balance}" placeholder="0" oninput="updateAccount(${a.id},'balance',this.value)"><span class="sfx">USD</span></div>
          </div>
          <div class="field"><label>예상 수익률</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.rate}" placeholder="7" oninput="updateAccount(${a.id},'rate',this.value)"><span class="sfx">%</span></div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin:6px 0 4px;font-weight:600;">납입 (둘 중 하나만 입력)</div>
        <div class="row2">
          <div class="field"><label>본인 납입 (연 고정액)</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribSelf}" placeholder="0" oninput="updateAccount(${a.id},'contribSelf',this.value)"><span class="sfx">USD</span></div>
          </div>
          <div class="field"><label>본인 납입 (수입의 %)</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribSelfRate}" placeholder="0" oninput="updateAccount(${a.id},'contribSelfRate',this.value)"><span class="sfx">%</span></div>
          </div>
        </div>
        <div class="field"><label>회사 납입 방식</label>
          <select class="acc-sel" onchange="updateAccount(${a.id},'employerMatchMode',this.value)">
            <option value="fixed" ${empMode === 'fixed' ? 'selected' : ''}>연 고정액</option>
            <option value="percent" ${empMode === 'percent' ? 'selected' : ''}>연봉의 %</option>
            <option value="match" ${empMode === 'match' ? 'selected' : ''}>매칭 (X% match up to Y%)</option>
          </select>
        </div>
        <div class="row2 employer-opt employer-fixed" style="display:${empMode === 'fixed' ? 'grid' : 'none'}">
          <div class="field"><label>회사 납입 (연 고정액)</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribEmployer}" placeholder="0" oninput="updateAccount(${a.id},'contribEmployer',this.value)"><span class="sfx">USD</span></div>
          </div>
          <div class="field"></div>
        </div>
        <div class="row2 employer-opt employer-percent" style="display:${empMode === 'percent' ? 'grid' : 'none'}">
          <div class="field"><label>회사 납입 (연봉의 %)</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribEmployerRate}" placeholder="0" oninput="updateAccount(${a.id},'contribEmployerRate',this.value)"><span class="sfx">%</span></div>
          </div>
          <div class="field"></div>
        </div>
        <div class="row2 employer-opt employer-match" style="display:${empMode === 'match' ? 'grid' : 'none'}">
          <div class="field"><label>매칭률 (회사가 내 납입의 몇 %)</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.matchRate ?? '50'}" placeholder="50" oninput="updateAccount(${a.id},'matchRate',this.value)"><span class="sfx">%</span></div>
          </div>
          <div class="field"><label>한도 (연봉의 몇 %까지만 매칭)</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.matchCapPercent ?? '8'}" placeholder="8" oninput="updateAccount(${a.id},'matchCapPercent',this.value)"><span class="sfx">%</span></div>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>납입 종료 나이</label>
            <div class="iw"><input class="acc-num" type="number" value="${a.contribEndAge ?? ''}" placeholder="비우면 은퇴 나이" min="1" max="99" oninput="updateAccount(${a.id},'contribEndAge',this.value)"><span class="sfx">세</span></div>
          </div>
          <div class="field"><label>인출 시작 나이</label>
            <div class="iw"><input class="acc-num" type="number" value="${a.retireDrawAge}" placeholder="60" oninput="updateAccount(${a.id},'retireDrawAge',this.value)"><span class="sfx">세</span></div>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>인출 시 세율</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.withdrawTaxRate}" placeholder="0" oninput="updateAccount(${a.id},'withdrawTaxRate',this.value)"><span class="sfx">%</span></div>
          </div>
          <div class="field"></div>
        </div>
        <div class="acc-foot"><button class="btn-del" onclick="removeAccount(${a.id})">🗑 삭제</button></div>
      </div>`;
    if (openIds.has(card.id)) card.classList.add('open');
    list.appendChild(card);
  }
}

// ═══════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════
function addEvent(opts = {}) {
  const id = ++eid;
  events.push({
    id,
    type: opts.type || 'income',
    name: opts.name || '',
    age: opts.age || (pN('currentAge') + 5),
    value: opts.value || '',
  });
  renderEventList();
  renderAll();
}

function removeEvent(id) {
  events = events.filter(e => e.id !== id);
  renderEventList();
  renderAll();
}

function updateEvent(id, field, value) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  if (field === 'value') {
    const num = parseMoney(value);
    value = String(Math.round(num));
    ev.value = value;
    const inp = document.getElementById('ev-value-' + id);
    if (inp && inp.value !== value) inp.value = value;
  } else {
    ev[field] = value;
  }
  if (field === 'name') {
    const lbl = document.querySelector('#ev-' + id + ' .ev-lbl');
    if (lbl) lbl.textContent = value || '이름 없음';
  } else if (field === 'age') {
    const tag = document.querySelector('#ev-' + id + ' .ev-age-tag');
    if (tag) tag.textContent = value + '세';
  } else if (field === 'type') {
    renderEventList();
  }
  renderAll();
}

function toggleEv(id) {
  document.getElementById('ev-' + id)?.classList.toggle('open');
}

function renderEventList() {
  const list = document.getElementById('eventList');
  const openIds = new Set();
  list.querySelectorAll('.ev-card.open').forEach(el => openIds.add(el.id));
  list.querySelectorAll('.ev-card').forEach(el => el.remove());
  const nm = document.getElementById('noEventsMsg');
  if (events.length === 0) { if (nm) nm.style.display = ''; return; }
  if (nm) nm.style.display = 'none';

  const BADGES = {
    income: ['ebadge-income', '💹 수입변경'],
    expense: ['ebadge-expense', '💸 지출변경'],
    'lumpsum-out': ['ebadge-lumpsum-out', '🏠 목돈지출'],
    'lumpsum-in': ['ebadge-lumpsum-in', '🎁 목돈유입'],
  };
  const sorted = [...events].sort((a, b) => parseInt(a.age) - parseInt(b.age));
  for (const ev of sorted) {
    const [bc, bl] = BADGES[ev.type] || ['ebadge-income', '이벤트'];
    const isLump = ev.type.startsWith('lumpsum');
    const sfx = isLump ? 'USD' : 'USD/yr';
    const card = document.createElement('div');
    card.className = 'ev-card';
    card.id = 'ev-' + ev.id;
    card.innerHTML = `
      <div class="ev-head" onclick="toggleEv(${ev.id})">
        <span class="ev-badge ${bc}">${bl}</span>
        <span class="ev-lbl">${ev.name || '이름 없음'}</span>
        <span class="ev-age-tag">${ev.age}세</span>
        <span class="ev-tog">▼</span>
      </div>
      <div class="ev-body">
        <div class="field"><label>이벤트 종류</label>
          <select class="acc-sel" onchange="updateEvent(${ev.id},'type',this.value)">
            <option value="income" ${ev.type === 'income' ? 'selected' : ''}>💹 연 수입 변경</option>
            <option value="expense" ${ev.type === 'expense' ? 'selected' : ''}>💸 연 지출 변경</option>
            <option value="lumpsum-out" ${ev.type === 'lumpsum-out' ? 'selected' : ''}>🏠 목돈 지출</option>
            <option value="lumpsum-in" ${ev.type === 'lumpsum-in' ? 'selected' : ''}>🎁 목돈 유입</option>
          </select>
        </div>
        <div class="field"><label>이름</label>
          <input class="acc-inp" type="text" placeholder="예: 캐나다 이민, 집 구매..." value="${ev.name}" oninput="updateEvent(${ev.id},'name',this.value)">
        </div>
        <div class="row2">
          <div class="field"><label>발생 나이</label>
            <div class="iw"><input class="acc-num" type="number" value="${ev.age}" min="1" max="99" onchange="updateEvent(${ev.id},'age',parseInt(this.value))"><span class="sfx">세</span></div>
          </div>
          <div class="field"><label>금액</label>
            <div class="iw"><input id="ev-value-${ev.id}" class="acc-num" type="text" value="${ev.value}" placeholder="예: 150000 또는 150k" oninput="updateEvent(${ev.id},'value',this.value)"><span class="sfx">${sfx}</span></div>
          </div>
        </div>
        <div class="acc-foot"><button class="btn-del" onclick="removeEvent(${ev.id})">🗑 삭제</button></div>
      </div>`;
    if (openIds.has(card.id)) card.classList.add('open');
    list.appendChild(card);
  }
}

// ═══════════════════════════════════════════════════
// MOBILE TABS
// ═══════════════════════════════════════════════════
function mTab(t) {
  if (window.innerWidth > 768) return;
  ['basic', 'accounts', 'events', 'chart', 'table'].forEach(k => {
    document.getElementById('mn-' + k)?.classList.toggle('active', k === t);
    document.getElementById('panel-' + k)?.classList.toggle('active', k === t);
  });
  if (t === 'chart' && chartInst) setTimeout(() => chartInst.resize(), 50);
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.querySelectorAll('input[id]').forEach(inp => {
  inp.addEventListener('input', renderAll);
  inp.addEventListener('change', renderAll);
});

const hasSaved = loadState();
if (hasSaved) {
  renderAccountList();
  renderEventList();
  ['base', 'opt', 'pes'].forEach(t => document.getElementById('tab-' + t)?.classList.toggle('active', t === currentSc));
  renderAll();
} else {
  addAccount({ type: 'roth', name: 'Roth IRA (미국)', balance: '15000', rate: '7', contribSelf: '7000', contribEmployer: '0', withdrawTaxRate: '0', retireDrawAge: '59' });
  addAccount({ type: 'pension_kr', name: '연금저축펀드 (한국)', balance: '5000', rate: '5', contribSelf: '3000', contribEmployer: '0', withdrawTaxRate: '3.3', retireDrawAge: '55' });
  addEvent({ type: 'income', name: '승진 / 연봉 인상', age: 35, value: 110000 });
  addEvent({ type: 'lumpsum-out', name: '집 구매 (다운페이)', age: 38, value: 80000 });
  addEvent({ type: 'lumpsum-in', name: '부동산 매각', age: 50, value: 300000 });
  addEvent({ type: 'expense', name: '은퇴 후 생활비 조정', age: 55, value: 40000 });
  renderAll();
}
