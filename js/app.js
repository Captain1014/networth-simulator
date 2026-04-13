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

const LOCALE = (typeof window !== 'undefined' && window.APP_LOCALE) || 'ko';
const CURRENCY = (typeof window !== 'undefined' && window.APP_CURRENCY) || 'KRW';

const T = {
  ko: {
    ageSfx: '세', currencySfx: '원', currencySfxMonthly: '원/월', currencySfxYr: '원/년',
    nav: { basic: '기본', accounts: '계좌', events: '이벤트', chart: '차트', table: '테이블' },
    title: '자산 시뮬레이터', subtitle: '다중 계좌 · 세율 반영 · 인생 이벤트 · 장기 자산 흐름',
    section: { basic: '기본 정보', invest: '투자 / 저축 자산', real: '실물 자산', debt: '부채', income: '연간 수입 & 지출', fire: '4% 법칙 — 은퇴 목표' },
    label: {
      currentAge: '현재 나이', retireAge: '은퇴 목표 나이', investAsset: '투자 · 저축 (비연금)', returnRate: '투자 수익률', returnVolatility: '변동성 (표준편차 %)', inflation: '인플레이션',
      realEstate: '부동산 (시장가)', vehicle: '차량', otherAsset: '기타 실물',
      mortgage: '모기지 잔액', mortgageRate: '모기지 이자율', studentLoan: '학자금 대출', studentLoanRate: '학자금 이자율', carLoan: '자동차 할부', otherDebt: '기타 부채',
      annualIncome: '연 수입 (세후)', wageGrowth: '연봉 상승률', annualExpense: '연 지출',
      targetMonthly: '목표 월 생활비', withdrawRate: '인출률', externalPension: '국민연금 / Social Security 월 수령액',
    },
    tooltip: { wageGrowth: '매년 연 수입이 늘어나는 비율.<br>인플레이션과 별개로 설정.', withdrawRate: '은퇴 자산에서 매년 꺼내 쓰는 비율.<br>4% = 원금 유지 (30년 기준)<br>3.5% = 보수적 (40년+ 장기)<br>5% = 낙관적', externalPension: '국가에서 매달 자동으로 지급하는 연금.<br>Roth IRA·401k 인출은 여기 해당 없음.<br>해당 없으면 0.' },
    fire: { need: '필요 은퇴 자산', needNet: '국민연금 반영 시 필요액', progress: '달성률 (계좌 합계 자동 반영)', now: '현재', atRetire: '은퇴 시' },
    accounts: { title: '연금 · 투자 계좌', add: '+ 계좌 추가', noAccs: '계좌가 없습니다.<br>Roth IRA, 연금저축펀드 등을 추가하세요.' },
    events: { title: '인생 이벤트', add: '+ 이벤트 추가', noEvs: '이벤트가 없습니다.' },
    summary: { nw: '순자산 (Net Worth)', subNW: '자산 {assets} − 부채 {debt}', subNWPlaceholder: '자산 − 부채', debt: '총 부채', noDebt: '부채 없음 ✓', debtLabel: '부채', mortgage: '모기지', studentLoan: '학자금', car: '차량', other: '기타', retire: '은퇴 시 예상 (세후)', subRetire: '투자 {invest} · 계좌 {acc}', deplete: '자산 소진 예상', depleteSub: '전체 자산 소진 예상', noDeplete: '100세+', noDepleteSub: '기간 내 소진 없음 ✓', save: '연간 순저축', subSave: '수입 − 지출 − 부채상환', ageSuffix: '세' },
    chart: { view: '보기', total: '총 자산 (세후)', invest: '투자자산', acc: '연금계좌 합계 (세후)', scenario: '시나리오', base: '기본', opt: '낙관 (+2%)', pes: '비관 (−2%)', modeSingle: '단일 궤적', modeMC: '몬테카를로', modeHousing: '주거 비교', volatility: '변동성 (표준편차 %)', mcRun: '몬테카를로 실행', mcRunning: '실행 중…', mcSuccess: '성공률 (100세까지 소진 없음)', mcP10: '10% 하위', mcP50: '중앙값 (50%)', mcP90: '90% 상위',
    mcHelp: '차트 해석: 중앙값(50%)=보통 궤적, 10%~90%=나쁜/좋은 경우 범위. 성공률=100세까지 자산 유지 비율(1000번 중).' },
    table: { title: '연도별 자산 변화', retireOnly: '은퇴 후만', age: '나이', event: '이벤트', income: '연 수입', expense: '연 지출', savings: '순저축', investCol: '투자/저축자산', investColTitle: '비연금만 해당. 소진 = 이 항목 0 이하. 총자산에는 연금 포함.', total: '총자산(세후)', retireTag: '은퇴', depleted: '소진' },
    acc: { type: '계좌 종류', nickname: '계좌 별명', balance: '현재 잔액', rate: '예상 수익률', contribNote: '납입 (둘 중 하나만 입력)', contribSelf: '본인 납입 (연 고정액)', contribSelfPct: '본인 납입 (수입의 %)', empMode: '회사 납입 방식', empFixed: '연 고정액', empPct: '연봉의 %', empMatch: '매칭 (X% match up to Y%)', empAmount: '회사 납입 (연 고정액)', empPctLabel: '회사 납입 (연봉의 %)', matchRate: '매칭률 (회사가 내 납입의 몇 %)', matchCap: '한도 (연봉의 몇 %까지만 매칭)', contribStart: '납입 시작 나이', contribStartPlaceholder: '비우면 현재 나이', contribEnd: '납입 종료 나이', drawAge: '인출 시작 나이', withdrawTax: '인출 시 세율', contribEndPlaceholder: '비우면 은퇴 나이', delete: '🗑 삭제', placeholderName: '예: 미국 Roth IRA, 한국 연금저축' },
    ev: { kind: '이벤트 종류', name: '이름', age: '발생 나이', amount: '금액', endAge: '종료 나이', endAgePlaceholder: '비우면 영구', income: '💹 연 수입 변경', expense: '💸 연 지출 변경', expenseAdd: '💸 추가 지출 (누적)', lumpOut: '🏠 목돈 지출', lumpIn: '🎁 목돈 유입', placeholderName: '예: 캐나다 이민, 집 구매...', placeholderAmount: '예: 150000 또는 150k', noName: '이름 없음', delete: '🗑 삭제' },
    accType: { roth_label: 'Roth IRA', roth_desc: '세후 납입 → 인출 비과세', traditional_label: 'Traditional IRA / 401k', traditional_desc: '세전 납입 → 인출 시 과세', pension_kr_label: '한국 연금저축펀드', pension_kr_desc: '세전 납입 → 연금소득세 과세', taxable_label: '일반 과세 계좌', taxable_desc: '수익에 대해 매년 과세', account: '계좌' },
    evBadge: { income: '💹 수입변경', expense: '💸 지출변경', 'expense-add': '💸 추가지출', 'lumpsum-out': '🏠 목돈지출', 'lumpsum-in': '🎁 목돈유입', default: '이벤트' },
    exportCopy: '데이터 복사 (채팅에 붙여넣기)', exportToast: '클립보드에 복사됨. 채팅에 붙여넣어 전달하세요.', exportFailed: '복사 실패. 수동으로 복사해 주세요.',
    importBtn: '데이터 불러오기', importTitle: '데이터 불러오기', importDesc: 'JSON 데이터를 붙여넣고 적용을 누르세요.', importApply: '적용', importCancel: '취소', importSuccess: '데이터가 적용되었습니다.', importFailed: 'JSON 형식이 올바르지 않습니다.',
    encSave: '🔒 백업 생성', encRestore: '🔒 백업 복원',
    encSaveTitle: '백업 생성', encSaveDesc: '비밀번호를 설정하면 현재 데이터를 암호화한 문자열이 생성됩니다. js/backup.example.js를 복사해 js/backup.js로 두고 문자열을 붙여 넣으세요(js/backup.js는 git에 올리지 마세요).', encSaveBtn: '암호화 생성', encSaveCopy: '복사됨!',
    encRestoreTitle: '백업 복원', encRestoreDesc: '비밀번호를 입력하면 코드에 저장된 백업 데이터가 복원됩니다.', encRestoreBtn: '복원', encRestoreSuccess: '백업이 복원되었습니다!', encRestoreFailed: '복원 실패 — 비밀번호가 틀리거나 백업이 없습니다.',
    encPwLabel: '비밀번호', encPwEmpty: '비밀번호를 입력하세요.', encNoBackup: '저장된 백업이 없습니다. 먼저 백업을 생성하세요.',
    housing: {
      modalTitle: '🏠 주거 시나리오 비교', modalDesc: '최대 3개 시나리오를 설정하고 장기 순자산을 비교하세요.',
      add: '+ 시나리오 추가', run: '비교 실행', editScenarios: '시나리오 설정', scenario: '시나리오', modeHousing: '주거 비교',
      typeBuy: '🏠 매수', typeJeonse: '🔑 전세', typeRent: '💸 월세',
      startAge: '시작 나이', purchasePrice: '매수가', appreciationRate: '부동산 상승률', annualMaintenance: '연 유지비 (재산세+관리비)',
      ltvRatio: 'LTV 대출 비율', loanRate: '대출 이자율', loanTerm: '대출 기간', loanType: '상환 방식',
      loanAmortizing: '원리금균등', loanInterestOnly: '이자만', loanSection: '대출',
      deposit: '전세 보증금', depositRenewalRate: '전세가 상승률', renewalCycle: '갱신주기',
      monthlyRent: '월세', rentDeposit: '보증금', rentIncreaseRate: '월세 상승률',
      breakeven: '손익분기점', breakevenBuyVsRent: '매수 vs 월세', breakevenBuyVsJeonse: '매수 vs 전세',
      noBreakeven: '기간 내 역전 없음', noScenarios: '시나리오를 추가하세요.',
      tableInitial: '초기 투입', tableLoan: '대출', tableNetWorth: '순자산', tableCumulCost: '누적 주거비용',
      delete: '🗑 삭제', name: '이름', namePlaceholder: '예: 강남 아파트 매수',
      yearSfx: '년', pctSfx: '%',
    },
  },
  en: {
    ageSfx: ' yrs', currencySfx: 'USD', currencySfxMonthly: 'USD/mo', currencySfxYr: 'USD/yr',
    nav: { basic: 'Basic', accounts: 'Accounts', events: 'Events', chart: 'Chart', table: 'Table' },
    title: 'Net Worth Simulator', subtitle: 'Multi-account · Tax-aware · Life events · Long-term flow',
    section: { basic: 'Basic', invest: 'Investment / Savings', real: 'Real Assets', debt: 'Debt', income: 'Income & Expense', fire: '4% Rule — Retirement' },
    label: {
      currentAge: 'Current age', retireAge: 'Retirement age', investAsset: 'Investment · Savings (non-pension)', returnRate: 'Return rate', returnVolatility: 'Volatility (std dev %)', inflation: 'Inflation',
      realEstate: 'Real estate', vehicle: 'Vehicle', otherAsset: 'Other real',
      mortgage: 'Mortgage balance', mortgageRate: 'Mortgage rate', studentLoan: 'Student loan', studentLoanRate: 'Student loan rate', carLoan: 'Car loan', otherDebt: 'Other debt',
      annualIncome: 'Annual income (after tax)', wageGrowth: 'Wage growth rate', annualExpense: 'Annual expense',
      targetMonthly: 'Target monthly expense', withdrawRate: 'Withdrawal rate', externalPension: 'Social Security / pension (monthly)',
    },
    tooltip: { wageGrowth: 'Annual wage growth rate.<br>Independent of inflation.', withdrawRate: 'Annual withdrawal rate from retirement assets.<br>4% = 30-year rule<br>3.5% = conservative (40+ yrs)<br>5% = aggressive', externalPension: 'Monthly pension from government.<br>Exclude Roth/401k withdrawals.<br>0 if not applicable.' },
    fire: { need: 'Required retirement assets', needNet: 'Required (net of pension)', progress: 'Progress (accounts)', now: 'Now', atRetire: 'At retirement' },
    accounts: { title: 'Pension · Investment accounts', add: '+ Add account', noAccs: 'No accounts.<br>Add Roth IRA, 401k, etc.' },
    events: { title: 'Life events', add: '+ Add event', noEvs: 'No events.' },
    summary: { nw: 'Net Worth', subNW: 'Assets {assets} − Debt {debt}', subNWPlaceholder: 'Assets − Debt', debt: 'Total debt', noDebt: 'No debt ✓', debtLabel: 'Debt', mortgage: 'Mortgage', studentLoan: 'Student', car: 'Car', other: 'Other', retire: 'At retirement (after tax)', subRetire: 'Invest {invest} · Accounts {acc}', deplete: 'Asset depletion', depleteSub: 'Estimated depletion', noDeplete: '100+', noDepleteSub: 'No depletion ✓', save: 'Annual net savings', subSave: 'Income − Expense − Debt repay', ageSuffix: ' yrs' },
    chart: { view: 'View', total: 'Total assets (after tax)', invest: 'Investment', acc: 'Accounts (after tax)', scenario: 'Scenario', base: 'Base', opt: 'Optimistic (+2%)', pes: 'Pessimistic (−2%)', modeSingle: 'Single path', modeMC: 'Monte Carlo', modeHousing: 'Housing', volatility: 'Volatility (std dev %)', mcRun: 'Run Monte Carlo', mcRunning: 'Running…', mcSuccess: 'Success rate (no depletion by 100)', mcP10: '10th %ile', mcP50: 'Median (50%)', mcP90: '90th %ile',
    mcHelp: 'Chart: Median = typical path; 10th–90th = bad/good range. Success rate = % of 1000 runs with assets left at 100.' },
    table: { title: 'Yearly asset change', retireOnly: 'Retirement only', age: 'Age', event: 'Event', income: 'Income', expense: 'Expense', savings: 'Savings', investCol: 'Investment', investColTitle: 'Non-pension only. Depleted = this bucket ≤ 0. Total includes retirement accounts.', total: 'Total (after tax)', retireTag: 'Retire', depleted: 'Depleted' },
    acc: { type: 'Account type', nickname: 'Nickname', balance: 'Current balance', rate: 'Expected return', contribNote: 'Contributions (choose one)', contribSelf: 'Personal (annual)', contribSelfPct: 'Personal (% of income)', empMode: 'Employer contribution', empFixed: 'Annual fixed', empPct: '% of salary', empMatch: 'Match (X% up to Y%)', empAmount: 'Employer (annual)', empPctLabel: 'Employer (% of salary)', matchRate: 'Match rate (%)', matchCap: 'Cap (% of salary)', contribStart: 'Contrib. start age', contribStartPlaceholder: 'Empty = current age', contribEnd: 'Contrib. end age', drawAge: 'Withdraw start age', withdrawTax: 'Withdraw tax rate', contribEndPlaceholder: 'Empty = retirement age', delete: '🗑 Delete', placeholderName: 'e.g. US Roth IRA' },
    ev: { kind: 'Event type', name: 'Name', age: 'Age', amount: 'Amount', endAge: 'End age', endAgePlaceholder: 'Empty = permanent', income: '💹 Income change', expense: '💸 Expense change', expenseAdd: '💸 Extra recurring cost', lumpOut: '🏠 Lump sum out', lumpIn: '🎁 Lump sum in', placeholderName: 'e.g. House purchase...', placeholderAmount: 'e.g. 150000 or 150k', noName: 'Unnamed', delete: '🗑 Delete' },
    accType: { roth_label: 'Roth IRA', roth_desc: 'After-tax → tax-free withdrawal', traditional_label: 'Traditional IRA / 401k', traditional_desc: 'Pre-tax → taxed on withdrawal', pension_kr_label: 'Korea pension fund', pension_kr_desc: 'Pre-tax → pension tax on withdrawal', taxable_label: 'Taxable account', taxable_desc: 'Taxed annually on gains', account: 'Account' },
    evBadge: { income: '💹 Income', expense: '💸 Expense', 'expense-add': '💸 Extra cost', 'lumpsum-out': '🏠 Lump out', 'lumpsum-in': '🎁 Lump in', default: 'Event' },
    exportCopy: 'Copy data (paste in chat)', exportToast: 'Copied to clipboard. Paste in chat to share.', exportFailed: 'Copy failed. Copy manually.',
    importBtn: 'Import data', importTitle: 'Import Data', importDesc: 'Paste JSON data and click Apply.', importApply: 'Apply', importCancel: 'Cancel', importSuccess: 'Data applied successfully.', importFailed: 'Invalid JSON format.',
    encSave: '🔒 Create Backup', encRestore: '🔒 Restore Backup',
    encSaveTitle: 'Create Backup', encSaveDesc: 'Set a password to generate an encrypted backup string. Copy js/backup.example.js to js/backup.js and paste the string there (keep js/backup.js out of git).', encSaveBtn: 'Generate', encSaveCopy: 'Copied!',
    encRestoreTitle: 'Restore Backup', encRestoreDesc: 'Enter your password to restore data saved in the codebase.', encRestoreBtn: 'Restore', encRestoreSuccess: 'Backup restored!', encRestoreFailed: 'Restore failed — wrong password or no backup found.',
    encPwLabel: 'Password', encPwEmpty: 'Please enter a password.', encNoBackup: 'No backup found. Create a backup first.',
    housing: {
      modalTitle: '🏠 Housing Scenario Comparison', modalDesc: 'Set up to 3 scenarios and compare long-term net worth.',
      add: '+ Add scenario', run: 'Run comparison', editScenarios: 'Edit scenarios', scenario: 'Scenario', modeHousing: 'Housing',
      typeBuy: '🏠 Buy', typeJeonse: '🔑 Jeonse', typeRent: '💸 Rent',
      startAge: 'Start age', purchasePrice: 'Purchase price', appreciationRate: 'Appreciation rate', annualMaintenance: 'Annual maintenance',
      ltvRatio: 'LTV ratio', loanRate: 'Loan rate', loanTerm: 'Loan term', loanType: 'Repayment type',
      loanAmortizing: 'Amortizing', loanInterestOnly: 'Interest only', loanSection: 'Loan',
      deposit: 'Jeonse deposit', depositRenewalRate: 'Deposit renewal rate', renewalCycle: 'Renewal cycle',
      monthlyRent: 'Monthly rent', rentDeposit: 'Deposit', rentIncreaseRate: 'Rent increase rate',
      breakeven: 'Breakeven', breakevenBuyVsRent: 'Buy vs Rent', breakevenBuyVsJeonse: 'Buy vs Jeonse',
      noBreakeven: 'No crossover in range', noScenarios: 'Add a scenario to compare.',
      tableInitial: 'Initial outlay', tableLoan: 'Loan', tableNetWorth: 'Net worth', tableCumulCost: 'Cumulative cost',
      delete: '🗑 Delete', name: 'Name', namePlaceholder: 'e.g. Buy apartment in Gangnam',
      yearSfx: ' yrs', pctSfx: '%',
    },
  },
};
function t(key) {
  const parts = key.split('.');
  let o = T[LOCALE];
  for (const p of parts) {
    o = o && o[p];
  }
  if (typeof o === 'string') return o;
  let fallback = T.ko;
  for (const p of parts) fallback = fallback && fallback[p];
  return (typeof fallback === 'string' ? fallback : key);
}
function applyLocale() {
  const title = t('title');
  if (title && document.title !== title) document.title = title;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (!val) return;
    if (el.getAttribute('data-i18n-html') !== null) {
      if (el.innerHTML !== val) el.innerHTML = val;
    } else if (el.textContent !== val) {
      el.textContent = val;
    }
  });
  document.querySelectorAll('[data-i18n-sfx]').forEach(el => {
    const key = el.getAttribute('data-i18n-sfx');
    const val = t(key);
    if (val) el.textContent = val;
  });
}
function getAccTypeLabel(type) {
  const v = t('accType.' + type + '_label');
  return (v && v !== 'accType.' + type + '_label') ? v : (ACC_TYPES[type]?.label || t('accType.account'));
}
function getAccTypeDesc(type) {
  const v = t('accType.' + type + '_desc');
  return (v && v !== 'accType.' + type + '_desc') ? v : (ACC_TYPES[type]?.desc || '');
}

const STORAGE_KEY = 'networth-simulator-state';
const INPUT_IDS = [
  'currentAge', 'retireAge', 'investAsset', 'returnRate', 'returnVolatility', 'inflation', 'wageGrowthRate',
  'realEstate', 'vehicle', 'otherAsset',
  'mortgage', 'mortgageRate', 'studentLoan', 'studentLoanRate', 'carLoan', 'otherDebt',
  'annualIncome', 'annualExpense',
  'targetMonthly', 'withdrawRate', 'externalPension',
];
let chartMode = 'single'; // 'single' | 'montecarlo' | 'housing'
let mcResult = null;     // { successRate, p10, p50, p90, labels } or null
let housingScenarios = [];
let hsid = 0;
let housingResult = null;
const MC_RUNS = 1000;
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
        housingScenarios: housingScenarios.map(h => ({ ...h })),
        currentSc,
        showRetireOnly: showRetireOnlyEl ? showRetireOnlyEl.checked : false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* quota or disabled */ }
  }, 400);
}

function getStateForExport() {
  const inputs = {};
  for (const id of INPUT_IDS) {
    const el = document.getElementById(id);
    if (el) inputs[id] = el.value;
  }
  const showRetireOnlyEl = document.getElementById('showRetireOnly');
  return {
    inputs,
    accounts: accounts.map(a => ({ ...a })),
    events: events.map(e => ({ ...e })),
    housingScenarios: housingScenarios.map(h => ({ ...h })),
    currentSc,
    showRetireOnly: showRetireOnlyEl ? showRetireOnlyEl.checked : false,
  };
}

function buildYearlyTableText(rows, showRetireOnly) {
  const list = showRetireOnly ? rows.filter(r => r.isRetired) : rows;
  if (list.length === 0) return '';
  const retAge = pN('retireAge');
  const ageSfx = t('summary.ageSuffix');
  const accCols = accounts.map(a => a.name || getAccTypeLabel(a.type));
  const headers = [t('table.age'), t('table.event'), t('table.income'), t('table.expense'), t('table.savings'), t('table.investCol')]
    .concat(accCols)
    .concat([t('table.total')]);
  const line = (cells) => cells.join(' | ');
  const sep = line(headers.map(() => '---'));
  const scenarioLabel = t('chart.' + currentSc) || currentSc;
  const lines = ['## ' + t('table.title') + ' - ' + scenarioLabel + '\n', '| ' + line(headers) + ' |', '| ' + sep + ' |'];
  for (const r of list) {
    const evStr = r.events.length ? r.events.map(e => e.label).join(', ') : '—';
    const inc = r.income != null ? fmt(r.income) : '—';
    const exp = fmt(r.expense);
    const sav = fmt(r.savings);
    const inv = r.invest < 0 ? t('table.depleted') : fmt(r.invest);
    const accCells = accounts.map(a => {
      const snap = r.accSnapshot.find(s => s.id === a.id);
      if (!snap) return '—';
      const accType = ACC_TYPES[a.type] || ACC_TYPES.roth;
      const txRate = (parseFloat(a.withdrawTaxRate) || 0) / 100;
      const afterTax = accType.taxOnWithdraw ? snap.balance * (1 - txRate) : snap.balance;
      return fmt(afterTax);
    });
    const ageCell = r.age + ageSfx + (r.age === retAge ? ' (' + t('table.retireTag') + ')' : '');
    const rowCells = [ageCell, evStr, inc, exp, sav, inv].concat(accCells).concat([fmt(r.totalLiquid)]);
    lines.push('| ' + line(rowCells) + ' |');
  }
  return lines.join('\n');
}

function buildHousingTableText() {
  if (!housingScenarios.length) return '';
  const data = simulateHousing();
  if (!data.scenarios.length) return '';

  const names = data.scenarios.map(s => s.name);
  const hdr = ['', ...names];
  const sep = hdr.map(() => '---');
  const lines = [];
  lines.push('## Housing Scenario Comparison');
  lines.push('');
  lines.push('| ' + hdr.join(' | ') + ' |');
  lines.push('| ' + sep.join(' | ') + ' |');

  // Initial outlay
  const initials = data.scenarios.map(sc => {
    const hs = housingScenarios.find(h => h.id === sc.id);
    if (!hs) return '—';
    if (hs.type === 'buy') return fmt(parseMoney(hs.purchasePrice) * (1 - (parseFloat(hs.ltvRatio) || 0) / 100));
    if (hs.type === 'jeonse') return fmt(parseMoney(hs.deposit));
    return fmt(parseMoney(hs.rentDeposit) || 0);
  });
  lines.push('| Initial outlay | ' + initials.join(' | ') + ' |');

  // Loan
  if (data.scenarios.some(s => s.type === 'buy')) {
    const loans = data.scenarios.map(sc => {
      const hs = housingScenarios.find(h => h.id === sc.id);
      if (hs && hs.type === 'buy') return fmt(parseMoney(hs.purchasePrice) * (parseFloat(hs.ltvRatio) || 0) / 100);
      return '—';
    });
    lines.push('| Loan | ' + loans.join(' | ') + ' |');
  }

  // Net worth at checkpoints
  const hsStartAge = Math.max(...housingScenarios.map(h => h.startAge || 50));
  const checkpoints = [hsStartAge, hsStartAge + 10, hsStartAge + 20, hsStartAge + 30].filter(a => a <= 100);
  const ageSfx = t('summary.ageSuffix');
  for (const cp of checkpoints) {
    const vals = data.scenarios.map(sc => {
      const row = sc.rows.find(r => r.age === cp);
      return row ? fmt(row.netWorth) : '—';
    });
    lines.push('| ' + cp + ageSfx + ' Net worth | ' + vals.join(' | ') + ' |');
  }

  // Cumulative cost
  const costs = data.scenarios.map(sc => {
    const last = sc.rows[sc.rows.length - 1];
    return last ? fmt(last.cumulativeCost) : '—';
  });
  lines.push('| Cumulative cost | ' + costs.join(' | ') + ' |');

  // Breakeven
  if (data.breakeven.buyVsRent) lines.push('| Breakeven (buy vs rent) | ' + data.breakeven.buyVsRent + ageSfx + ' | | |');
  if (data.breakeven.buyVsJeonse) lines.push('| Breakeven (buy vs jeonse) | ' + data.breakeven.buyVsJeonse + ageSfx + ' | | |');

  return lines.join('\n');
}

function copyStateToClipboard() {
  const state = getStateForExport();
  const json = JSON.stringify(state, null, 2);
  const rows = simulate(currentSc);
  const tableText = buildYearlyTableText(rows, state.showRetireOnly);
  const housingText = buildHousingTableText();
  const wrap = '```json\n' + json + '\n```' + (tableText ? '\n\n' + tableText : '') + (housingText ? '\n\n' + housingText : '');
  navigator.clipboard.writeText(wrap).then(() => {
    const el = document.getElementById('exportToast');
    if (el) {
      el.textContent = t('exportToast');
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 2500);
    }
  }).catch(() => {
    const el = document.getElementById('exportToast');
    if (el) {
      el.textContent = t('exportFailed');
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 3000);
    }
  });
}

function openImportModal() {
  if (document.getElementById('importModal')) return;
  const modal = document.createElement('div');
  modal.id = 'importModal';
  modal.className = 'import-modal-overlay';
  modal.innerHTML = `
    <div class="import-modal">
      <div class="import-modal-title">${t('importTitle')}</div>
      <p class="import-modal-desc">${t('importDesc')}</p>
      <textarea id="importTextarea" class="import-textarea" rows="10" placeholder='{"inputs":{...},"accounts":[...],"events":[...]}'></textarea>
      <div class="import-modal-actions">
        <button type="button" class="btn-import-cancel" onclick="closeImportModal()">${t('importCancel')}</button>
        <button type="button" class="btn-import-apply" onclick="applyImportData()">${t('importApply')}</button>
      </div>
      <div id="importToast" class="import-toast" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeImportModal(); });
  document.getElementById('importTextarea').focus();
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (modal) modal.remove();
}

function applyImportData() {
  const raw = (document.getElementById('importTextarea')?.value || '').trim();
  if (!raw) return;
  // Strip markdown ```json ... ``` wrapper if present
  let jsonStr = raw;
  const mdMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (mdMatch) jsonStr = mdMatch[1].trim();
  // Strip trailing markdown table if present
  const tableIdx = jsonStr.lastIndexOf('}');
  if (tableIdx !== -1) jsonStr = jsonStr.substring(0, tableIdx + 1);

  try {
    const state = JSON.parse(jsonStr);
    if (state.inputs) {
      for (const [id, value] of Object.entries(state.inputs)) {
        const el = document.getElementById(id);
        if (el && value != null) el.value = String(value);
      }
    }
    if (Array.isArray(state.accounts)) {
      accounts = state.accounts;
      acid = accounts.length ? Math.max(0, ...accounts.map(a => a.id)) : 0;
    }
    if (Array.isArray(state.events)) {
      events = state.events;
      eid = events.length ? Math.max(0, ...events.map(e => e.id)) : 0;
    }
    if (Array.isArray(state.housingScenarios)) {
      housingScenarios = state.housingScenarios;
      hsid = housingScenarios.length ? Math.max(0, ...housingScenarios.map(h => h.id)) : 0;
    }
    if (state.currentSc && SC[state.currentSc]) {
      currentSc = state.currentSc;
      document.querySelectorAll('.sc-btn').forEach(b => b.classList.remove('active'));
      const activeTab = document.getElementById('tab-' + currentSc);
      if (activeTab) activeTab.classList.add('active');
    }
    const showRetireOnlyEl = document.getElementById('showRetireOnly');
    if (showRetireOnlyEl && state.showRetireOnly != null) showRetireOnlyEl.checked = state.showRetireOnly;

    renderAll();
    saveState();
    closeImportModal();

    const toast = document.getElementById('exportToast');
    if (toast) {
      toast.textContent = t('importSuccess');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }
  } catch (e) {
    const toast = document.getElementById('importToast');
    if (toast) {
      toast.textContent = t('importFailed');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }
}

// ═══════════════════════════════════════════════════
// ENCRYPTED SAVE / LOAD (AES-GCM + PBKDF2)
// ═══════════════════════════════════════════════════
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptData(password, plaintext) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const buf = new Uint8Array(salt.length + iv.length + ct.byteLength);
  buf.set(salt, 0);
  buf.set(iv, salt.length);
  buf.set(new Uint8Array(ct), salt.length + iv.length);
  return buf;
}

async function decryptData(password, buf) {
  const salt = buf.slice(0, 16);
  const iv = buf.slice(16, 28);
  const ct = buf.slice(28);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}

function showEncToast(id, msg, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// ── Backup Save: encrypt current state → show base64 string to copy into js/backup.js ──
function openBackupSaveModal() {
  if (document.getElementById('encModal')) return;
  const modal = document.createElement('div');
  modal.id = 'encModal';
  modal.className = 'import-modal-overlay';
  modal.innerHTML = `
    <div class="import-modal">
      <div class="import-modal-title">${t('encSaveTitle')}</div>
      <p class="import-modal-desc">${t('encSaveDesc')}</p>
      <div class="enc-field"><label>${t('encPwLabel')}</label><input type="password" id="encPw" class="enc-input" autocomplete="new-password"></div>
      <div class="import-modal-actions">
        <button type="button" class="btn-import-cancel" onclick="closeEncModal()">${t('importCancel')}</button>
        <button type="button" class="btn-import-apply" onclick="doBackupSave()">${t('encSaveBtn')}</button>
      </div>
      <textarea id="encResult" class="import-textarea" style="display:none" readonly></textarea>
      <div id="encToast" class="import-toast" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEncModal(); });
  document.getElementById('encPw').focus();
}

// ── Backup Restore: decrypt embedded ENCRYPTED_BACKUP with password ──
function openBackupRestoreModal() {
  if (typeof ENCRYPTED_BACKUP === 'undefined' || !ENCRYPTED_BACKUP) {
    const toast = document.getElementById('exportToast');
    if (toast) { toast.textContent = t('encNoBackup'); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
    return;
  }
  if (document.getElementById('encModal')) return;
  const modal = document.createElement('div');
  modal.id = 'encModal';
  modal.className = 'import-modal-overlay';
  modal.innerHTML = `
    <div class="import-modal">
      <div class="import-modal-title">${t('encRestoreTitle')}</div>
      <p class="import-modal-desc">${t('encRestoreDesc')}</p>
      <div class="enc-field"><label>${t('encPwLabel')}</label><input type="password" id="encPw" class="enc-input" autocomplete="current-password"></div>
      <div class="import-modal-actions">
        <button type="button" class="btn-import-cancel" onclick="closeEncModal()">${t('importCancel')}</button>
        <button type="button" class="btn-import-apply" onclick="doBackupRestore()">${t('encRestoreBtn')}</button>
      </div>
      <div id="encToast" class="import-toast" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEncModal(); });
  document.getElementById('encPw').focus();
}

function closeEncModal() {
  const m = document.getElementById('encModal');
  if (m) m.remove();
}

async function doBackupSave() {
  const pw = document.getElementById('encPw').value;
  if (!pw) { showEncToast('encToast', t('encPwEmpty'), true); return; }
  try {
    const state = getStateForExport();
    const json = JSON.stringify(state);
    const encrypted = await encryptData(pw, json);
    const b64 = btoa(String.fromCharCode(...encrypted));
    const result = document.getElementById('encResult');
    result.value = b64;
    result.style.display = 'block';
    result.select();
    navigator.clipboard.writeText(b64).then(() => {
      showEncToast('encToast', t('encSaveCopy'), false);
    });
  } catch (e) {
    showEncToast('encToast', t('encRestoreFailed'), true);
  }
}

async function doBackupRestore() {
  const pw = document.getElementById('encPw').value;
  if (!pw) { showEncToast('encToast', t('encPwEmpty'), true); return; }
  try {
    const bin = atob(ENCRYPTED_BACKUP);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const json = await decryptData(pw, buf);
    const state = JSON.parse(json);
    if (state.inputs) {
      for (const [id, value] of Object.entries(state.inputs)) {
        const el = document.getElementById(id);
        if (el && value != null) el.value = String(value);
      }
    }
    if (Array.isArray(state.accounts)) {
      accounts = state.accounts;
      acid = accounts.length ? Math.max(0, ...accounts.map(a => a.id)) : 0;
    }
    if (Array.isArray(state.events)) {
      events = state.events;
      eid = events.length ? Math.max(0, ...events.map(e => e.id)) : 0;
    }
    if (Array.isArray(state.housingScenarios)) {
      housingScenarios = state.housingScenarios;
      hsid = housingScenarios.length ? Math.max(0, ...housingScenarios.map(h => h.id)) : 0;
    }
    if (state.currentSc && SC[state.currentSc]) {
      currentSc = state.currentSc;
      document.querySelectorAll('.sc-btn').forEach(b => b.classList.remove('active'));
      const activeTab = document.getElementById('tab-' + currentSc);
      if (activeTab) activeTab.classList.add('active');
    }
    const showRetireOnlyEl = document.getElementById('showRetireOnly');
    if (showRetireOnlyEl && state.showRetireOnly != null) showRetireOnlyEl.checked = state.showRetireOnly;
    renderAll();
    saveState();
    showEncToast('encToast', t('encRestoreSuccess'), false);
    setTimeout(closeEncModal, 1500);
  } catch (e) {
    showEncToast('encToast', t('encRestoreFailed'), true);
  }
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
    if (Array.isArray(state.housingScenarios)) {
      housingScenarios = state.housingScenarios;
      hsid = housingScenarios.length ? Math.max(0, ...housingScenarios.map(h => h.id)) : 0;
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
  const a = Math.abs(Math.round(n));
  if (CURRENCY === 'KRW') {
    const sign = n < 0 ? '-' : '';
    if (a >= 1e8) return sign + '₩' + (a / 1e8).toFixed(1) + '억';
    if (a >= 1e4) return sign + '₩' + (a / 1e4).toFixed(0) + '만';
    return (n < 0 ? '-' : '') + '₩' + a.toLocaleString('ko-KR');
  }
  const s = n < 0 ? '-$' : '$';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
  return s + a.toLocaleString('en-US');
}

// ═══════════════════════════════════════════════════
// SIMULATE
// ═══════════════════════════════════════════════════
/**
 * Run one simulation path.
 * @param {string} sk - Scenario key ('base'|'opt'|'pes')
 * @param {number[]} [returnSequence] - Optional per-year return rates for investment (length = 101 - startAge). If omitted, constant rr is used.
 */
function simulate(sk = 'base', returnSequence = null) {
  const mod = SC[sk];
  const startAge = pN('currentAge');
  const retireAge = pN('retireAge');
  let invest = pN('investAsset');
  let income = pN('annualIncome');
  let expense = pN('annualExpense');
  const rrBase = pR('returnRate') + mod.r / 100;
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
    contribStartAge: parseInt(a.contribStartAge) || startAge,
    contribEndAge: parseInt(a.contribEndAge) || retireAge,
    withdrawTaxRate: (parseFloat(a.withdrawTaxRate) || 0) / 100,
    retireDrawAge: parseInt(a.retireDrawAge) || 60,
  }));

  // expense-add: each entry tracks its own current value and inflates independently
  const extraExpenses = []; // { id, current, endAge }

  const rows = [];
  for (let age = startAge; age <= 100; age++) {
    const isRetired = age >= retireAge;

    // Remove expired extra expenses
    for (let i = extraExpenses.length - 1; i >= 0; i--) {
      if (extraExpenses[i].endAge && age >= extraExpenses[i].endAge) {
        extraExpenses.splice(i, 1);
      }
    }

    let lumpIn = 0, lumpOut = 0;
    const evDescs = [];
    for (const ev of events) {
      if (parseInt(ev.age, 10) !== age) continue;
      const val = Number(parseMoney(ev.value));
      if (ev.type === 'income') { income = val; evDescs.push({ type: ev.type, label: ev.name || t('ev.income') }); }
      else if (ev.type === 'expense') { expense = val; evDescs.push({ type: ev.type, label: ev.name || t('ev.expense') }); }
      else if (ev.type === 'expense-add') {
        extraExpenses.push({ id: ev.id, current: val, endAge: parseInt(ev.endAge) || 0 });
        evDescs.push({ type: ev.type, label: ev.name || t('ev.expenseAdd') });
      }
      else if (ev.type === 'lumpsum-out') { lumpOut += val; evDescs.push({ type: ev.type, label: ev.name || t('ev.lumpOut') }); }
      else if (ev.type === 'lumpsum-in') { lumpIn += val; evDescs.push({ type: ev.type, label: ev.name || t('ev.lumpIn') }); }
    }

    // Total expense = base expense + all active extra expenses
    const totalExpense = expense + extraExpenses.reduce((s, x) => s + x.current, 0);

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
      const stillContrib = age >= ac.contribStartAge && age < ac.contribEndAge;
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

    // 목돈 유입이 특정 계좌 해지·이전을 의미할 때: 해당 계좌 잔액을 0으로 (예: ISA 전액 해지 후 invest로 편입)
    for (const ev of events) {
      if (parseInt(ev.age, 10) !== age) continue;
      if (ev.type !== 'lumpsum-in' || ev.drainAccountId == null || String(ev.drainAccountId).trim() === '') continue;
      const did = parseInt(ev.drainAccountId, 10);
      if (isNaN(did)) continue;
      const tac = accState.find(a => a.id === did);
      if (tac) tac.balance = 0;
    }

    const savings = isRetired ? 0 : (income - totalExpense - totalDebt - totalAccContrib);
    const rr = returnSequence ? returnSequence[age - startAge] : rrBase;
    invest = invest * (1 + rr) + savings + lumpIn - lumpOut;
    if (isRetired && totalExpense > 0) {
      let totalAT = 0;
      const drawable = accState.filter(ac => age >= (ac.retireDrawAge || 60));
      for (const ac of drawable) {
        const t = ACC_TYPES[ac.type] || ACC_TYPES.roth;
        totalAT += t.taxOnWithdraw ? ac.balance * (1 - ac.withdrawTaxRate) : ac.balance;
      }
      const investVal = Math.max(0, invest);
      const totalLiquidPre = investVal + totalAT;
      if (totalLiquidPre > 0) {
        const drawFromInvest = (investVal / totalLiquidPre) * totalExpense;
        invest = Math.max(0, invest - drawFromInvest);
        const remaining = totalExpense - drawFromInvest;
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
        invest = Math.max(0, invest - totalExpense);
      }
    }

    let totalAccAfterTax = 0;
    for (const ac of accState) {
      const t = ACC_TYPES[ac.type] || ACC_TYPES.roth;
      totalAccAfterTax += t.taxOnWithdraw ? ac.balance * (1 - ac.withdrawTaxRate) : ac.balance;
    }

    const totalLiquid = Math.max(0, invest) + totalAccAfterTax;
    const dispIncome = isRetired ? null : income;
    const dispExpense = totalExpense + (isRetired ? 0 : totalDebt);
    const dispSavings = isRetired ? -totalExpense : savings;

    // Inflate base expense and each extra expense independently
    expense = expense * (1 + inf);
    for (const x of extraExpenses) x.current = x.current * (1 + inf);
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
// MONTE CARLO
// ═══════════════════════════════════════════════════
/** Mulberry32 PRNG: returns [0, 1). Seeded once per run so we never rely on Math.random (fixes 100% on some deploys). */
function createMcRng() {
  let s;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    s = buf[0];
  } else {
    s = ((typeof performance !== 'undefined' && performance.now) ? (Date.now() * 1e3 + performance.now()) : Date.now()) >>> 0;
  }
  if (!s) s = 1;
  return function () {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    return (s >>> 0) / 4294967296;
  };
}

function randomNormal(rng) {
  var u1 = rng(), u2 = rng();
  while (u1 <= 1e-10) u1 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function lognormalReturn(expectedReturn, sigma, rng) {
  var mu = Math.log(1 + expectedReturn) - (sigma * sigma) / 2;
  var log1r = mu + sigma * randomNormal(rng);
  return Math.exp(log1r) - 1;
}

function runMonteCarlo() {
  var startAge = pN('currentAge');
  var nYears = 100 - startAge + 1;
  var expectedReturn = pR('returnRate');
  var vol = (parseFloat(document.getElementById('returnVolatility')?.value || '15') || 15) / 100;

  var rng = createMcRng();
  var paths = [];
  for (var i = 0; i < MC_RUNS; i++) {
    var seq = [];
    for (var y = 0; y < nYears; y++) seq.push(lognormalReturn(expectedReturn, vol, rng));
    paths.push(simulate('base', seq));
  }

  const n = paths[0].length;
  const p10 = [], p50 = [], p90 = [];
  let successCount = 0;
  for (let j = 0; j < n; j++) {
    const vals = paths.map(rows => rows[j].totalLiquid).sort((a, b) => a - b);
    p10.push(Math.round(vals[Math.floor(MC_RUNS * 0.1)]));
    p50.push(Math.round(vals[Math.floor(MC_RUNS * 0.5)]));
    p90.push(Math.round(vals[Math.floor(MC_RUNS * 0.9)]));
  }
  // Use a small threshold so floating-point "dust" (e.g. 1e-10) counts as depleted
  var depletionThreshold = 1;
  for (var pi = 0; pi < paths.length; pi++) {
    var pathRows = paths[pi];
    var minLiq = pathRows[0].totalLiquid;
    for (var ri = 1; ri < pathRows.length; ri++) {
      var tl = pathRows[ri].totalLiquid;
      if (tl < minLiq) minLiq = tl;
    }
    if (minLiq >= depletionThreshold) successCount++;
  }
  var depletedCount = MC_RUNS - successCount;
  var ageSfx = t('summary.ageSuffix');
  var mid = Math.floor(paths[0].length / 2);
  var sampleVal = paths[0][mid].totalLiquid;
  var pathsIdentical = true;
  for (var qi = 1; qi < paths.length; qi++) {
    if (paths[qi][mid].totalLiquid !== sampleVal) { pathsIdentical = false; break; }
  }
  mcResult = {
    successRate: successCount / MC_RUNS,
    successCount: successCount,
    depletedCount: depletedCount,
    pathsIdentical: pathsIdentical,
    p10, p50, p90,
    labels: paths[0].map(function (r) { return r.age + ageSfx; }),
  };
  return mcResult;
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
  document.getElementById('subNW').textContent = t('summary.subNW').replace('{assets}', fmt(totalAssets)).replace('{debt}', fmt(totalDebt));

  document.getElementById('sumDebt').textContent = fmt(totalDebt);
  document.getElementById('sumDebt').className = 'val ' + (totalDebt > 0 ? 'cr' : 'cg');
  const debtParts = [];
  if (pN('mortgage') > 0) debtParts.push(t('summary.mortgage') + ' ' + fmt(pN('mortgage')));
  if (pN('studentLoan') > 0) debtParts.push(t('summary.studentLoan') + ' ' + fmt(pN('studentLoan')));
  if (pN('carLoan') > 0) debtParts.push(t('summary.car') + ' ' + fmt(pN('carLoan')));
  if (pN('otherDebt') > 0) debtParts.push(t('summary.other') + ' ' + fmt(pN('otherDebt')));
  document.getElementById('subDebt').textContent = totalDebt > 0
    ? (debtParts.length ? debtParts.join(' · ') : t('summary.debtLabel'))
    : t('summary.noDebt');

  const retAge = pN('retireAge');
  const rr = rows.find(r => r.age === retAge);
  if (rr) {
    document.getElementById('sumRetire').textContent = fmt(rr.totalLiquid);
    document.getElementById('sumRetire').className = 'val ' + (rr.totalLiquid > 0 ? 'cg' : 'cr');
    document.getElementById('subRetire').textContent = t('summary.subRetire').replace('{invest}', fmt(Math.max(0, rr.invest))).replace('{acc}', fmt(rr.totalAccAfterTax));
  }

  const dep = rows.find(r => r.totalLiquid <= 0);
  if (dep) {
    document.getElementById('sumDeplete').textContent = dep.age + t('summary.ageSuffix');
    document.getElementById('sumDeplete').className = 'val cr';
    document.getElementById('subDeplete').textContent = t('summary.depleteSub');
  } else {
    document.getElementById('sumDeplete').textContent = t('summary.noDeplete');
    document.getElementById('sumDeplete').className = 'val cg';
    document.getElementById('subDeplete').textContent = t('summary.noDepleteSub');
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
  if (chartMode === 'montecarlo' && mcResult) {
    renderChartMC(mcResult);
    return;
  }
  if (chartMode === 'housing' && housingResult) {
    renderChartHousing(housingResult);
    return;
  }
  const ageSfx = t('summary.ageSuffix');
  const labels = rows.map(r => r.age + ageSfx);
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
        { label: t('chart.total'), data: totalD, borderColor: '#d4a853', backgroundColor: 'rgba(212,168,83,0.07)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.3 },
        { label: t('chart.invest'), data: investD, borderColor: '#5b9bd5', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, borderDash: [4, 3], tension: 0.3 },
        { label: t('chart.acc'), data: accD, borderColor: '#5bbfb5', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, borderDash: [2, 4], tension: 0.3 },
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

function renderChartMC(data) {
  if (chartInst) chartInst.destroy();
  const ctx = document.getElementById('mainChart').getContext('2d');
  chartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        { label: t('chart.mcP90'), data: data.p90, borderColor: 'rgba(212,168,83,0.5)', backgroundColor: 'transparent', borderWidth: 1, pointRadius: 0, pointHoverRadius: 3, borderDash: [2, 4], tension: 0.3 },
        { label: t('chart.mcP50'), data: data.p50, borderColor: '#d4a853', backgroundColor: 'rgba(212,168,83,0.12)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.3 },
        { label: t('chart.mcP10'), data: data.p10, borderColor: 'rgba(212,168,83,0.5)', backgroundColor: 'transparent', borderWidth: 1, pointRadius: 0, pointHoverRadius: 3, borderDash: [2, 4], tension: 0.3 },
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

  const accCols = accounts.map(a => a.name || getAccTypeLabel(a.type));
  const ageSfx = t('summary.ageSuffix');
  const investColTitle = t('table.investColTitle') || '';

  // Housing scenario columns when in housing mode
  const hsMode = chartMode === 'housing' && housingResult && housingResult.scenarios.length > 0;
  const hsCols = hsMode ? housingResult.scenarios : [];

  head.innerHTML = `<tr>
    <th>${t('table.age')}</th><th>${t('table.event')}</th>
    <th>${t('table.income')}</th><th>${t('table.expense')}</th><th>${t('table.savings')}</th>
    <th title="${investColTitle.replace(/"/g, '&quot;')}">${t('table.investCol')}</th>
    ${accCols.map(n => `<th>${n}</th>`).join('')}
    <th>${t('table.total')}</th>
    ${hsCols.map((sc, i) => `<th style="color:${HS_COLORS[i]}">${sc.name}</th>`).join('')}
  </tr>`;

  body.innerHTML = '';
  const list = showOnly ? rows.filter(r => r.isRetired) : rows;
  for (const r of list) {
    const tr = document.createElement('tr');
    if (r.age === retAge) tr.classList.add('hl');

    let ageCell = r.age + ageSfx;
    if (r.age === retAge) ageCell += '<span class="retire-tag">' + t('table.retireTag') + '</span>';

    const evContent = r.events.length ? r.events.map(e => `<span class="edot edot-${e.type}">${e.label}</span>`).join('') : '<span style="color:var(--text3)">—</span>';
    const evCell = `<div class="ev-cell-inner">${evContent}</div>`;
    const inc = r.income != null ? fmt(r.income) : '<span style="color:var(--text3)">—</span>';
    const exp = fmt(r.expense);
    const sav = fmt(r.savings);
    const savC = r.savings >= 0 ? 'pos' : 'neg';
    const inv = r.invest < 0 ? '<span class="neg">' + t('table.depleted') + '</span>' : fmt(r.invest);
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

    // Housing scenario net worth cells
    let hsCells = '';
    if (hsMode) {
      hsCells = hsCols.map((sc, i) => {
        const hsRow = sc.rows.find(hr => hr.age === r.age);
        if (!hsRow) return `<td style="color:var(--text3)">—</td>`;
        const nw = hsRow.netWorth;
        return `<td style="color:${HS_COLORS[i]};font-weight:600">${fmt(nw)}</td>`;
      }).join('');
    }

    tr.innerHTML = `
      <td>${ageCell}</td>
      <td>${evCell}</td>
      <td>${inc}</td>
      <td>${exp}</td>
      <td class="${savC}">${sav}</td>
      <td class="${invC}">${inv}</td>
      ${accCells}
      <td class="${totC}" style="font-weight:600">${tot}</td>
      ${hsCells}
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
  const fireNeedEl = document.querySelector('#fireBox .fire-row:first-child .fire-label');
  if (fireNeedEl) fireNeedEl.textContent = t('fire.need');
  const fireNeedNetEl = document.querySelector('#fireBox .fire-row:nth-child(2) .fire-label');
  if (fireNeedNetEl) fireNeedNetEl.textContent = t('fire.needNet');
  const fireProgressEl = document.querySelector('.fire-progress-label span:first-child');
  if (fireProgressEl) fireProgressEl.textContent = t('fire.progress');

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
  document.getElementById('fireNow').textContent = t('fire.now') + ' ' + fmt(nowTotal) + ' (' + pct.toFixed(0) + '%)';
  document.getElementById('fireRetireEst').textContent = t('fire.atRetire') + ' ' + fmt(retireTotal) + ' (' + retirePct.toFixed(0) + '%)';
}

// ═══════════════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════════════
function renderAll() {
  const rows = simulate(currentSc);
  if (chartMode === 'housing' && housingScenarios.length > 0) {
    housingResult = simulateHousing();
    updateHousingBreakevenLabel(housingResult);
    renderHousingTable(housingResult);
  }
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
  ['base', 'opt', 'pes'].forEach(sc => document.getElementById('tab-' + sc)?.classList.toggle('active', sc === k));
  renderAll();
}

function setChartMode(mode) {
  chartMode = mode;
  document.getElementById('chartModeSingle')?.classList.toggle('active', mode === 'single');
  document.getElementById('chartModeMC')?.classList.toggle('active', mode === 'montecarlo');
  document.getElementById('chartModeHousing')?.classList.toggle('active', mode === 'housing');
  const mcEl = document.getElementById('mc-controls');
  const scBar = document.getElementById('scenarioBar');
  const hsEl = document.getElementById('housing-controls');
  const hsTable = document.getElementById('housingTableWrap');
  if (mcEl) mcEl.style.display = mode === 'montecarlo' ? 'flex' : 'none';
  if (scBar) scBar.style.display = mode === 'single' ? 'flex' : 'none';
  if (hsEl) hsEl.style.display = mode === 'housing' ? 'flex' : 'none';
  if (hsTable && mode !== 'housing') hsTable.style.display = 'none';
  updateMcSuccessLabel();
  if (mode === 'housing' && housingScenarios.length > 0) {
    housingResult = simulateHousing();
    renderChartHousing(housingResult);
    renderHousingTable(housingResult);
    updateHousingBreakevenLabel(housingResult);
  } else {
    renderAll();
  }
}

function updateMcSuccessLabel() {
  var el = document.getElementById('mcSuccessRate');
  if (!el) return;
  if (chartMode === 'montecarlo' && mcResult != null) {
    var pct = (mcResult.successRate * 100).toFixed(1);
    var extra = (mcResult.depletedCount != null && mcResult.depletedCount > 0)
      ? ' (' + mcResult.depletedCount + ' depleted)'
      : '';
    if (mcResult.pathsIdentical) extra = ' (paths identical – refresh or clear cache)';
    el.textContent = t('chart.mcSuccess') + ': ' + pct + '%' + extra;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
  }
}

function runMonteCarloUI() {
  const btn = document.getElementById('btnRunMC');
  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('chart.mcRunning');
  }
  requestAnimationFrame(() => {
    try {
      runMonteCarlo();
      updateMcSuccessLabel();
      renderChart(mcResult);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('chart.mcRun');
      }
    }
  });
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
    contribStartAge: opts.contribStartAge ?? '',
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
    if (nameEl) nameEl.textContent = value || getAccTypeLabel(a.type);
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
  if (!list) return;
  const openIds = new Set();
  list.querySelectorAll('.acc-card.open').forEach(el => openIds.add(el.id));
  list.querySelectorAll('.acc-card').forEach(el => el.remove());
  const nm = document.getElementById('noAccsMsg');
  if (accounts.length === 0) { if (nm) nm.style.display = ''; return; }
  if (nm) nm.style.display = 'none';

  for (const a of accounts) {
    const accType = ACC_TYPES[a.type] || ACC_TYPES.roth;
    const empMode = a.employerMatchMode || (a.contribEmployerRate ? 'percent' : 'fixed');
    const card = document.createElement('div');
    card.className = 'acc-card';
    card.id = 'ac-' + a.id;
    const typeLabel = getAccTypeLabel(a.type);
    const typeDesc = getAccTypeDesc(a.type);
    const balFmt = a.balance ? fmt(parseFloat(a.balance)) : (CURRENCY === 'KRW' ? '₩0' : '$0');
    card.innerHTML = `
      <div class="acc-head" onclick="toggleAcc(${a.id})">
        <span class="acc-badge ${accType.badge}">${typeLabel}</span>
        <span class="acc-name">${a.name || typeLabel}</span>
        <span class="acc-bal">${balFmt}</span>
        <span class="acc-toggle">▼</span>
      </div>
      <div class="acc-body">
        <div class="field"><label>${t('acc.type')}</label>
          <select class="acc-sel" onchange="updateAccount(${a.id},'type',this.value)">
            ${Object.keys(ACC_TYPES).map(k => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${getAccTypeLabel(k)}</option>`).join('')}
          </select>
        </div>
        <div style="font-size:10px;color:var(--text3);padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:5px;margin-bottom:8px;">${typeDesc}</div>
        <div class="field"><label>${t('acc.nickname')}</label>
          <input class="acc-inp" type="text" placeholder="${t('acc.placeholderName')}" value="${a.name}" oninput="updateAccount(${a.id},'name',this.value)">
        </div>
        <div class="row2">
          <div class="field"><label>${t('acc.balance')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.balance}" placeholder="0" oninput="updateAccount(${a.id},'balance',this.value)"><span class="sfx">${t('currencySfx')}</span></div>
          </div>
          <div class="field"><label>${t('acc.rate')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.rate}" placeholder="7" oninput="updateAccount(${a.id},'rate',this.value)"><span class="sfx">%</span></div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin:6px 0 4px;font-weight:600;">${t('acc.contribNote')}</div>
        <div class="row2">
          <div class="field"><label>${t('acc.contribSelf')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribSelf}" placeholder="0" oninput="updateAccount(${a.id},'contribSelf',this.value)"><span class="sfx">${t('currencySfx')}</span></div>
          </div>
          <div class="field"><label>${t('acc.contribSelfPct')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribSelfRate}" placeholder="0" oninput="updateAccount(${a.id},'contribSelfRate',this.value)"><span class="sfx">%</span></div>
          </div>
        </div>
        <div class="field"><label>${t('acc.empMode')}</label>
          <select class="acc-sel" onchange="updateAccount(${a.id},'employerMatchMode',this.value)">
            <option value="fixed" ${empMode === 'fixed' ? 'selected' : ''}>${t('acc.empFixed')}</option>
            <option value="percent" ${empMode === 'percent' ? 'selected' : ''}>${t('acc.empPct')}</option>
            <option value="match" ${empMode === 'match' ? 'selected' : ''}>${t('acc.empMatch')}</option>
          </select>
        </div>
        <div class="row2 employer-opt employer-fixed" style="display:${empMode === 'fixed' ? 'grid' : 'none'}">
          <div class="field"><label>${t('acc.empAmount')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribEmployer}" placeholder="0" oninput="updateAccount(${a.id},'contribEmployer',this.value)"><span class="sfx">${t('currencySfx')}</span></div>
          </div>
          <div class="field"></div>
        </div>
        <div class="row2 employer-opt employer-percent" style="display:${empMode === 'percent' ? 'grid' : 'none'}">
          <div class="field"><label>${t('acc.empPctLabel')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribEmployerRate}" placeholder="0" oninput="updateAccount(${a.id},'contribEmployerRate',this.value)"><span class="sfx">%</span></div>
          </div>
          <div class="field"></div>
        </div>
        <div class="row2 employer-opt employer-match" style="display:${empMode === 'match' ? 'grid' : 'none'}">
          <div class="field"><label>${t('acc.matchRate')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.matchRate ?? '50'}" placeholder="50" oninput="updateAccount(${a.id},'matchRate',this.value)"><span class="sfx">%</span></div>
          </div>
          <div class="field"><label>${t('acc.matchCap')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.matchCapPercent ?? '8'}" placeholder="8" oninput="updateAccount(${a.id},'matchCapPercent',this.value)"><span class="sfx">%</span></div>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>${t('acc.contribStart')}</label>
            <div class="iw"><input class="acc-num" type="number" value="${a.contribStartAge ?? ''}" placeholder="${t('acc.contribStartPlaceholder')}" min="1" max="99" oninput="updateAccount(${a.id},'contribStartAge',this.value)"><span class="sfx">${t('ageSfx')}</span></div>
          </div>
          <div class="field"><label>${t('acc.contribEnd')}</label>
            <div class="iw"><input class="acc-num" type="number" value="${a.contribEndAge ?? ''}" placeholder="${t('acc.contribEndPlaceholder')}" min="1" max="99" oninput="updateAccount(${a.id},'contribEndAge',this.value)"><span class="sfx">${t('ageSfx')}</span></div>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>${t('acc.drawAge')}</label>
            <div class="iw"><input class="acc-num" type="number" value="${a.retireDrawAge}" placeholder="60" oninput="updateAccount(${a.id},'retireDrawAge',this.value)"><span class="sfx">${t('ageSfx')}</span></div>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>${t('acc.withdrawTax')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.withdrawTaxRate}" placeholder="0" oninput="updateAccount(${a.id},'withdrawTaxRate',this.value)"><span class="sfx">%</span></div>
          </div>
          <div class="field"></div>
        </div>
        <div class="acc-foot"><button class="btn-del" onclick="removeAccount(${a.id})">${t('acc.delete')}</button></div>
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
  const ev = {
    id,
    type: opts.type || 'income',
    name: opts.name || '',
    age: opts.age || (pN('currentAge') + 5),
    value: opts.value || '',
  };
  if (opts.endAge) ev.endAge = opts.endAge;
  events.unshift(ev);
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
    if (lbl) lbl.textContent = value || t('ev.noName');
  } else if (field === 'age') {
    const tag = document.querySelector('#ev-' + id + ' .ev-age-tag');
    if (tag) tag.textContent = value + t('ageSfx');
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
    income: ['ebadge-income', 'evBadge.income'],
    expense: ['ebadge-expense', 'evBadge.expense'],
    'expense-add': ['ebadge-expense-add', 'evBadge.expense-add'],
    'lumpsum-out': ['ebadge-lumpsum-out', 'evBadge.lumpsum-out'],
    'lumpsum-in': ['ebadge-lumpsum-in', 'evBadge.lumpsum-in'],
  };
  const sorted = [...events].sort((a, b) => parseInt(a.age) - parseInt(b.age));
  for (const ev of sorted) {
    const [bc, blKey] = BADGES[ev.type] || ['ebadge-income', 'evBadge.default'];
    const bl = t(blKey);
    const isLump = ev.type.startsWith('lumpsum');
    const sfx = isLump ? t('currencySfx') : t('currencySfxYr');
    const card = document.createElement('div');
    card.className = 'ev-card';
    card.id = 'ev-' + ev.id;
    card.innerHTML = `
      <div class="ev-head" onclick="toggleEv(${ev.id})">
        <span class="ev-badge ${bc}">${bl}</span>
        <span class="ev-lbl">${ev.name || t('ev.noName')}</span>
        <span class="ev-age-tag">${ev.age}${t('ageSfx')}</span>
        <span class="ev-tog">▼</span>
      </div>
      <div class="ev-body">
        <div class="field"><label>${t('ev.kind')}</label>
          <select class="acc-sel" onchange="updateEvent(${ev.id},'type',this.value)">
            <option value="income" ${ev.type === 'income' ? 'selected' : ''}>${t('ev.income')}</option>
            <option value="expense" ${ev.type === 'expense' ? 'selected' : ''}>${t('ev.expense')}</option>
            <option value="expense-add" ${ev.type === 'expense-add' ? 'selected' : ''}>${t('ev.expenseAdd')}</option>
            <option value="lumpsum-out" ${ev.type === 'lumpsum-out' ? 'selected' : ''}>${t('ev.lumpOut')}</option>
            <option value="lumpsum-in" ${ev.type === 'lumpsum-in' ? 'selected' : ''}>${t('ev.lumpIn')}</option>
          </select>
        </div>
        <div class="field"><label>${t('ev.name')}</label>
          <input class="acc-inp" type="text" placeholder="${t('ev.placeholderName')}" value="${ev.name}" oninput="updateEvent(${ev.id},'name',this.value)">
        </div>
        <div class="row2">
          <div class="field"><label>${t('ev.age')}</label>
            <div class="iw"><input class="acc-num" type="number" value="${ev.age}" min="1" max="99" onchange="updateEvent(${ev.id},'age',parseInt(this.value))"><span class="sfx">${t('ageSfx')}</span></div>
          </div>
          <div class="field"><label>${t('ev.amount')}</label>
            <div class="iw"><input id="ev-value-${ev.id}" class="acc-num" type="text" value="${ev.value}" placeholder="${t('ev.placeholderAmount')}" oninput="updateEvent(${ev.id},'value',this.value)"><span class="sfx">${sfx}</span></div>
          </div>
        </div>
        ${ev.type === 'expense-add' ? `<div class="row2">
          <div class="field"><label>${t('ev.endAge')}</label>
            <div class="iw"><input class="acc-num" type="number" value="${ev.endAge || ''}" min="1" max="100" placeholder="${t('ev.endAgePlaceholder')}" onchange="updateEvent(${ev.id},'endAge',this.value)"><span class="sfx">${t('ageSfx')}</span></div>
          </div>
          <div class="field"></div>
        </div>` : ''}
        <div class="acc-foot"><button class="btn-del" onclick="removeEvent(${ev.id})">${t('ev.delete')}</button></div>
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
// HOUSING SCENARIO COMPARISON
// ═══════════════════════════════════════════════════
const HS_COLORS = ['#d4a853', '#5bbfb5', '#9b7fe8'];

function addHousingScenario(type) {
  if (housingScenarios.length >= 3) return;
  const id = ++hsid;
  housingScenarios.push({
    id, type: type || 'buy', name: '', enabled: true,
    startAge: pN('retireAge') || 50,
    purchasePrice: 500000, appreciationRate: 3, annualMaintenance: 5000,
    ltvRatio: 60, loanRate: 4.5, loanTerm: 30, loanType: 'amortizing',
    deposit: 300000, depositRenewalRate: 3, renewalCycle: 2,
    monthlyRent: 1500, rentDeposit: 50000, rentIncreaseRate: 3,
  });
  renderHousingScenarioList();
  saveState();
}

function removeHousingScenario(id) {
  housingScenarios = housingScenarios.filter(h => h.id !== id);
  renderHousingScenarioList();
  saveState();
}

function updateHousingScenario(id, field, value) {
  const h = housingScenarios.find(x => x.id === id);
  if (!h) return;
  if (['startAge', 'purchasePrice', 'appreciationRate', 'annualMaintenance',
       'ltvRatio', 'loanRate', 'loanTerm', 'deposit', 'depositRenewalRate',
       'renewalCycle', 'monthlyRent', 'rentDeposit', 'rentIncreaseRate'].includes(field)) {
    h[field] = parseFloat(value) || 0;
  } else {
    h[field] = value;
  }
  if (field === 'type') renderHousingScenarioList();
  saveState();
}

function openHousingModal() {
  const overlay = document.getElementById('housingModalOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderHousingScenarioList();
}

function closeHousingModal() {
  const overlay = document.getElementById('housingModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

function renderHousingScenarioList() {
  const modal = document.getElementById('housingModal');
  if (!modal) return;
  const labels = { buy: t('housing.typeBuy'), jeonse: t('housing.typeJeonse'), rent: t('housing.typeRent') };

  let html = `<div class="housing-modal-title">${t('housing.modalTitle')}</div>
    <div class="housing-modal-desc">${t('housing.modalDesc')}</div>
    <div class="housing-scenario-list">`;

  if (housingScenarios.length === 0) {
    html += `<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">${t('housing.noScenarios')}</div>`;
  }

  for (let idx = 0; idx < housingScenarios.length; idx++) {
    const h = housingScenarios[idx];
    const letter = String.fromCharCode(65 + idx);
    const color = HS_COLORS[idx];

    html += `<div class="hs-card" style="border-left:3px solid ${color}">
      <div class="hs-card-head">
        <span style="font-weight:600;color:${color}">${letter}</span>
        <select class="acc-sel" onchange="updateHousingScenario(${h.id},'type',this.value)">
          <option value="buy" ${h.type === 'buy' ? 'selected' : ''}>${labels.buy}</option>
          <option value="jeonse" ${h.type === 'jeonse' ? 'selected' : ''}>${labels.jeonse}</option>
          <option value="rent" ${h.type === 'rent' ? 'selected' : ''}>${labels.rent}</option>
        </select>
        <input class="acc-inp" type="text" placeholder="${t('housing.namePlaceholder')}"
          value="${h.name}" oninput="updateHousingScenario(${h.id},'name',this.value)">
        <button class="btn-del" onclick="removeHousingScenario(${h.id})">${t('housing.delete')}</button>
      </div>
      <div class="hs-card-fields">
        <div class="row2">
          <div class="field"><label>${t('housing.startAge')}</label>
            <div class="iw"><input class="acc-num" type="number" value="${h.startAge}" min="1" max="99"
              onchange="updateHousingScenario(${h.id},'startAge',this.value)"><span class="sfx">${t('ageSfx')}</span></div></div>
          <div class="field"></div>
        </div>`;

    if (h.type === 'buy') {
      html += `
        <div class="row2">
          <div class="field"><label>${t('housing.purchasePrice')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.purchasePrice}"
              oninput="updateHousingScenario(${h.id},'purchasePrice',this.value)"><span class="sfx">${t('currencySfx')}</span></div></div>
          <div class="field"><label>${t('housing.appreciationRate')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.appreciationRate}"
              oninput="updateHousingScenario(${h.id},'appreciationRate',this.value)"><span class="sfx">%</span></div></div>
        </div>
        <div class="field"><label>${t('housing.annualMaintenance')}</label>
          <div class="iw"><input class="acc-num" type="text" value="${h.annualMaintenance}"
            oninput="updateHousingScenario(${h.id},'annualMaintenance',this.value)"><span class="sfx">${t('currencySfxYr')}</span></div></div>
        <div class="hs-loan-section">
          <div class="hs-loan-title">${t('housing.loanSection')}</div>
          <div class="row2">
            <div class="field"><label>${t('housing.ltvRatio')}</label>
              <div class="iw"><input class="acc-num" type="text" value="${h.ltvRatio}"
                oninput="updateHousingScenario(${h.id},'ltvRatio',this.value)"><span class="sfx">%</span></div></div>
            <div class="field"><label>${t('housing.loanRate')}</label>
              <div class="iw"><input class="acc-num" type="text" value="${h.loanRate}"
                oninput="updateHousingScenario(${h.id},'loanRate',this.value)"><span class="sfx">%</span></div></div>
          </div>
          <div class="row2">
            <div class="field"><label>${t('housing.loanTerm')}</label>
              <div class="iw"><input class="acc-num" type="number" value="${h.loanTerm}" min="1" max="40"
                onchange="updateHousingScenario(${h.id},'loanTerm',this.value)"><span class="sfx">${t('housing.yearSfx')}</span></div></div>
            <div class="field"><label>${t('housing.loanType')}</label>
              <select class="acc-sel" onchange="updateHousingScenario(${h.id},'loanType',this.value)">
                <option value="amortizing" ${h.loanType === 'amortizing' ? 'selected' : ''}>${t('housing.loanAmortizing')}</option>
                <option value="interestOnly" ${h.loanType === 'interestOnly' ? 'selected' : ''}>${t('housing.loanInterestOnly')}</option>
              </select></div>
          </div>
        </div>`;
    } else if (h.type === 'jeonse') {
      html += `
        <div class="row2">
          <div class="field"><label>${t('housing.deposit')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.deposit}"
              oninput="updateHousingScenario(${h.id},'deposit',this.value)"><span class="sfx">${t('currencySfx')}</span></div></div>
          <div class="field"><label>${t('housing.depositRenewalRate')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.depositRenewalRate}"
              oninput="updateHousingScenario(${h.id},'depositRenewalRate',this.value)"><span class="sfx">%</span></div></div>
        </div>
        <div class="row2">
          <div class="field"><label>${t('housing.renewalCycle')}</label>
            <div class="iw"><input class="acc-num" type="number" value="${h.renewalCycle}" min="1" max="10"
              onchange="updateHousingScenario(${h.id},'renewalCycle',this.value)"><span class="sfx">${t('housing.yearSfx')}</span></div></div>
          <div class="field"></div>
        </div>`;
    } else if (h.type === 'rent') {
      html += `
        <div class="row2">
          <div class="field"><label>${t('housing.monthlyRent')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.monthlyRent}"
              oninput="updateHousingScenario(${h.id},'monthlyRent',this.value)"><span class="sfx">${t('currencySfxMonthly')}</span></div></div>
          <div class="field"><label>${t('housing.rentDeposit')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.rentDeposit}"
              oninput="updateHousingScenario(${h.id},'rentDeposit',this.value)"><span class="sfx">${t('currencySfx')}</span></div></div>
        </div>
        <div class="row2">
          <div class="field"><label>${t('housing.rentIncreaseRate')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.rentIncreaseRate}"
              oninput="updateHousingScenario(${h.id},'rentIncreaseRate',this.value)"><span class="sfx">%</span></div></div>
          <div class="field"></div>
        </div>`;
    }
    html += `</div></div>`;
  }

  html += `</div>`;
  if (housingScenarios.length < 3) {
    html += `<button type="button" class="btn-add-hs" onclick="addHousingScenario()">${t('housing.add')}</button>`;
  }
  html += `<div class="housing-modal-actions">
    <button type="button" class="btn-import-cancel" onclick="closeHousingModal()">${t('importCancel')}</button>
    <button type="button" class="btn-import-apply" onclick="runHousingComparison()">${t('housing.run')}</button>
  </div>`;

  modal.innerHTML = html;
}

// ── Housing Simulation ──
function simulateHousing() {
  const baseRows = simulate(currentSc);
  const rr = pR('returnRate') + SC[currentSc].r / 100;
  const results = [];

  for (const hs of housingScenarios) {
    if (!hs.enabled) continue;
    const rows = [];
    let investDelta = 0;
    let propertyValue = 0;
    let loanBalance = 0;
    let depositHeld = 0;
    let cumulativeCost = 0;
    let annualRent = 0;
    let currentDeposit = 0;
    let started = false;
    let pmt = 0;

    for (let i = 0; i < baseRows.length; i++) {
      const age = baseRows[i].age;
      const baseNW = baseRows[i].totalLiquid;

      if (age === hs.startAge) {
        started = true;
        if (hs.type === 'buy') {
          const price = parseMoney(hs.purchasePrice);
          const ltv = (parseFloat(hs.ltvRatio) || 0) / 100;
          const downPayment = price * (1 - ltv);
          loanBalance = price * ltv;
          investDelta -= downPayment;
          propertyValue = price;
          // Pre-compute PMT for amortizing
          if (loanBalance > 0 && hs.loanType === 'amortizing') {
            const r = (parseFloat(hs.loanRate) || 0) / 100;
            const n = parseInt(hs.loanTerm) || 30;
            pmt = r > 0 ? loanBalance * r / (1 - Math.pow(1 + r, -n)) : loanBalance / n;
          }
        } else if (hs.type === 'jeonse') {
          currentDeposit = parseMoney(hs.deposit);
          investDelta -= currentDeposit;
          depositHeld = currentDeposit;
        } else if (hs.type === 'rent') {
          const dep = parseMoney(hs.rentDeposit) || 0;
          investDelta -= dep;
          depositHeld = dep;
          annualRent = (parseMoney(hs.monthlyRent) || 0) * 12;
        }
      }

      if (started && age > hs.startAge) {
        // Apply return on delta from previous year
        investDelta *= (1 + rr);

        if (hs.type === 'buy') {
          propertyValue *= (1 + (parseFloat(hs.appreciationRate) || 0) / 100);
          const maint = parseMoney(hs.annualMaintenance) || 0;
          investDelta -= maint;
          cumulativeCost += maint;
          if (loanBalance > 0) {
            const r = (parseFloat(hs.loanRate) || 0) / 100;
            if (hs.loanType === 'amortizing') {
              const interest = loanBalance * r;
              const principal = Math.min(pmt - interest, loanBalance);
              loanBalance = Math.max(0, loanBalance - principal);
              investDelta -= pmt;
              cumulativeCost += pmt;
            } else {
              const interest = loanBalance * r;
              investDelta -= interest;
              cumulativeCost += interest;
            }
          }
        } else if (hs.type === 'jeonse') {
          const cycle = parseInt(hs.renewalCycle) || 2;
          const yearsIn = age - hs.startAge;
          if (cycle > 0 && yearsIn % cycle === 0) {
            const rate = (parseFloat(hs.depositRenewalRate) || 0) / 100;
            const newDeposit = currentDeposit * (1 + rate);
            const diff = newDeposit - currentDeposit;
            investDelta -= diff;
            depositHeld += diff;
            cumulativeCost += diff;
            currentDeposit = newDeposit;
          }
        } else if (hs.type === 'rent') {
          investDelta -= annualRent;
          cumulativeCost += annualRent;
          annualRent *= (1 + (parseFloat(hs.rentIncreaseRate) || 0) / 100);
        }
      }

      const netWorth = baseNW + investDelta + propertyValue - loanBalance;
      rows.push({ age, netWorth, propertyValue, loanBalance, depositHeld, cumulativeCost });
    }

    results.push({ id: hs.id, name: hs.name || t('housing.scenario') + ' ' + String.fromCharCode(65 + results.length), type: hs.type, rows });
  }

  return { scenarios: results, breakeven: calcBreakeven(results) };
}

function calcBreakeven(results) {
  const breakeven = {};
  const buy = results.find(r => r.type === 'buy');
  const rent = results.find(r => r.type === 'rent');
  const jeonse = results.find(r => r.type === 'jeonse');

  if (buy && rent) {
    // Find first age where buy NW >= rent NW (after initially being lower)
    let buyWasLower = false;
    for (let i = 0; i < buy.rows.length; i++) {
      if (buy.rows[i].netWorth < rent.rows[i].netWorth) buyWasLower = true;
      if (buyWasLower && buy.rows[i].netWorth >= rent.rows[i].netWorth) {
        breakeven.buyVsRent = buy.rows[i].age;
        break;
      }
    }
  }
  if (buy && jeonse) {
    let buyWasLower = false;
    for (let i = 0; i < buy.rows.length; i++) {
      if (buy.rows[i].netWorth < jeonse.rows[i].netWorth) buyWasLower = true;
      if (buyWasLower && buy.rows[i].netWorth >= jeonse.rows[i].netWorth) {
        breakeven.buyVsJeonse = buy.rows[i].age;
        break;
      }
    }
  }
  return breakeven;
}

// ── Housing Chart ──
function renderChartHousing(data) {
  if (chartInst) chartInst.destroy();
  if (!data || !data.scenarios.length) {
    chartInst = null;
    return;
  }
  const ctx = document.getElementById('mainChart').getContext('2d');
  const ageSfx = t('summary.ageSuffix');
  const labels = data.scenarios[0].rows.map(r => r.age + ageSfx);

  const datasets = data.scenarios.map((sc, i) => ({
    label: sc.name,
    data: sc.rows.map(r => Math.round(r.netWorth)),
    borderColor: HS_COLORS[i % 3],
    backgroundColor: i === 0 ? 'rgba(212,168,83,0.07)' : 'transparent',
    borderWidth: i === 0 ? 2.5 : 2,
    pointRadius: 0, pointHoverRadius: 4,
    borderDash: i === 0 ? [] : [4, 3],
    fill: i === 0, tension: 0.3,
  }));

  chartInst = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a0a0b8', font: { size: 10 }, boxWidth: 10, padding: 14 } },
        tooltip: {
          backgroundColor: '#1e1e27', borderColor: '#2c2c3a', borderWidth: 1,
          titleColor: '#e8e6f0', bodyColor: '#a0a0b8', padding: 10,
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

// ── Housing Table ──
function renderHousingTable(data) {
  const wrap = document.getElementById('housingTableWrap');
  if (!wrap) return;
  if (!data || !data.scenarios.length) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const startAge = Math.min(...data.scenarios.map(s => s.rows.length ? s.rows[0].age : 100));
  const hsStartAge = Math.max(...housingScenarios.map(h => h.startAge || startAge));
  const checkpoints = [hsStartAge, hsStartAge + 10, hsStartAge + 20, hsStartAge + 30].filter(a => a <= 100);

  let html = '<table><thead><tr><th>' + t('housing.tableNetWorth') + '</th>';
  data.scenarios.forEach((sc, i) => {
    html += `<th style="color:${HS_COLORS[i]}">${sc.name}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Initial outlay row
  html += `<tr><td>${t('housing.tableInitial')}</td>`;
  for (const sc of data.scenarios) {
    const hs = housingScenarios.find(h => h.id === sc.id);
    let initial = 0;
    if (hs) {
      if (hs.type === 'buy') initial = parseMoney(hs.purchasePrice) * (1 - (parseFloat(hs.ltvRatio) || 0) / 100);
      else if (hs.type === 'jeonse') initial = parseMoney(hs.deposit);
      else if (hs.type === 'rent') initial = parseMoney(hs.rentDeposit) || 0;
    }
    html += `<td>${fmt(initial)}</td>`;
  }
  html += '</tr>';

  // Loan row (buy only)
  if (data.scenarios.some(s => s.type === 'buy')) {
    html += `<tr><td>${t('housing.tableLoan')}</td>`;
    for (const sc of data.scenarios) {
      const hs = housingScenarios.find(h => h.id === sc.id);
      if (hs && hs.type === 'buy') {
        html += `<td>${fmt(parseMoney(hs.purchasePrice) * (parseFloat(hs.ltvRatio) || 0) / 100)}</td>`;
      } else {
        html += '<td style="color:var(--text3)">—</td>';
      }
    }
    html += '</tr>';
  }

  // Net worth at checkpoints
  for (const cp of checkpoints) {
    html += `<tr><td>${cp}${t('ageSfx')} ${t('housing.tableNetWorth')}</td>`;
    for (const sc of data.scenarios) {
      const row = sc.rows.find(r => r.age === cp);
      html += `<td>${row ? fmt(row.netWorth) : '—'}</td>`;
    }
    html += '</tr>';
  }

  // Cumulative cost
  html += `<tr><td>${t('housing.tableCumulCost')}</td>`;
  for (const sc of data.scenarios) {
    const last = sc.rows[sc.rows.length - 1];
    html += `<td>${last ? fmt(last.cumulativeCost) : '—'}</td>`;
  }
  html += '</tr>';

  // Breakeven
  if (data.breakeven.buyVsRent || data.breakeven.buyVsJeonse) {
    html += `<tr><td>${t('housing.breakeven')}</td>`;
    for (const sc of data.scenarios) {
      if (sc.type === 'buy') {
        html += '<td style="color:var(--text3)">— (base)</td>';
      } else if (sc.type === 'rent' && data.breakeven.buyVsRent) {
        html += `<td style="color:var(--teal)">${data.breakeven.buyVsRent}${t('ageSfx')}</td>`;
      } else if (sc.type === 'jeonse' && data.breakeven.buyVsJeonse) {
        html += `<td style="color:var(--teal)">${data.breakeven.buyVsJeonse}${t('ageSfx')}</td>`;
      } else {
        html += `<td style="color:var(--text3)">${t('housing.noBreakeven')}</td>`;
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function updateHousingBreakevenLabel(data) {
  const el = document.getElementById('housingBreakevenLabel');
  if (!el || !data) { if (el) el.textContent = ''; return; }
  const parts = [];
  if (data.breakeven.buyVsRent) {
    parts.push(t('housing.breakevenBuyVsRent') + ': ' + data.breakeven.buyVsRent + t('ageSfx'));
  }
  if (data.breakeven.buyVsJeonse) {
    parts.push(t('housing.breakevenBuyVsJeonse') + ': ' + data.breakeven.buyVsJeonse + t('ageSfx'));
  }
  el.textContent = parts.length ? t('housing.breakeven') + ' — ' + parts.join(' · ') : '';
}

function runHousingComparison() {
  closeHousingModal();
  if (housingScenarios.length === 0) return;
  chartMode = 'housing';
  document.getElementById('chartModeSingle')?.classList.remove('active');
  document.getElementById('chartModeMC')?.classList.remove('active');
  document.getElementById('chartModeHousing')?.classList.add('active');
  document.getElementById('mc-controls').style.display = 'none';
  document.getElementById('scenarioBar').style.display = 'none';
  document.getElementById('housing-controls').style.display = 'flex';
  housingResult = simulateHousing();
  renderChartHousing(housingResult);
  renderHousingTable(housingResult);
  updateHousingBreakevenLabel(housingResult);
  saveState();
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
function init() {
  applyLocale();
  document.body.addEventListener('click', function (e) {
    const btn = e.target.id === 'btnAddAccount' ? e.target : (e.target.closest && e.target.closest('#panel-accounts .btn-add'));
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      addAccount();
    }
  }, true);
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
    const isEn = LOCALE === 'en';
    addAccount({ type: 'roth', name: isEn ? 'Roth IRA (US)' : 'Roth IRA (미국)', balance: '15000', rate: '7', contribSelf: '7000', contribEmployer: '0', withdrawTaxRate: '0', retireDrawAge: '59' });
    addAccount({ type: 'pension_kr', name: isEn ? 'Pension fund (Korea)' : '연금저축펀드 (한국)', balance: '5000', rate: '5', contribSelf: '3000', contribEmployer: '0', withdrawTaxRate: '3.3', retireDrawAge: '55' });
    addEvent({ type: 'income', name: isEn ? 'Promotion / raise' : '승진 / 연봉 인상', age: 35, value: 110000 });
    addEvent({ type: 'lumpsum-out', name: isEn ? 'Home purchase (down payment)' : '집 구매 (다운페이)', age: 38, value: 80000 });
    addEvent({ type: 'lumpsum-in', name: isEn ? 'Real estate sale' : '부동산 매각', age: 50, value: 300000 });
    addEvent({ type: 'expense', name: isEn ? 'Post-retirement expense adjustment' : '은퇴 후 생활비 조정', age: 55, value: 40000 });
    renderAll();
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
