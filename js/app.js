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
    ev: { kind: '이벤트 종류', name: '이름', age: '발생 나이', amount: '금액', endAge: '종료 나이', endAgePlaceholder: '비우면 영구', income: '💹 연 수입 변경', incomeAdd: '💰 추가 수입 (누적)', expense: '💸 연 지출 변경', expenseAdd: '💸 추가 지출 (누적)', lumpOut: '🏠 목돈 지출', lumpIn: '🎁 목돈 유입', placeholderName: '예: 캐나다 이민, 집 구매...', placeholderAmount: '예: 150000 또는 150k', noName: '이름 없음', delete: '🗑 삭제' },
    accType: { roth_label: 'Roth IRA', roth_desc: '세후 납입 → 인출 비과세', traditional_label: 'Traditional IRA / 401k', traditional_desc: '세전 납입 → 인출 시 과세', pension_kr_label: '한국 연금저축펀드', pension_kr_desc: '세전 납입 → 연금소득세 과세', taxable_label: '일반 과세 계좌', taxable_desc: '수익에 대해 매년 과세', account: '계좌' },
    evBadge: { income: '💹 수입변경', 'income-add': '💰 추가수입', expense: '💸 지출변경', 'expense-add': '💸 추가지출', 'lumpsum-out': '🏠 목돈지출', 'lumpsum-in': '🎁 목돈유입', default: '이벤트' },
    exportCopy: '데이터 복사 (채팅에 붙여넣기)', exportToast: '클립보드에 복사됨. 채팅에 붙여넣어 전달하세요.', exportFailed: '복사 실패. 수동으로 복사해 주세요.',
    importBtn: '데이터 불러오기', importTitle: '데이터 불러오기', importDesc: 'JSON 데이터를 붙여넣고 적용을 누르세요.', importApply: '적용', importCancel: '취소', importSuccess: '데이터가 적용되었습니다.', importFailed: 'JSON 형식이 올바르지 않습니다.',
    encSave: '🔒 백업 생성', encRestore: '🔒 백업 복원',
    encSaveTitle: '백업 생성', encSaveDesc: '비밀번호는 그대로 두고, 「짧은 코드」는 릴레이 URL이 있을 때만 선택할 수 있습니다(릴레이에는 암호문만 저장). 「긴 토큰」은 서버 없이 한 줄로 복사해 옮길 수 있습니다. gzip으로 긴 토큰도 이전보다 짧아집니다.', encSaveBtn: '암호화 생성', encSaveCopy: '긴 토큰이 클립보드에 복사되었습니다.',
    encRelayUrlLabel: '백업 릴레이 URL', encRelayUrlHint: '짧은 코드를 쓰려면 backup-relay 폴더의 Worker를 배포한 뒤 여기에 https://…workers.dev 주소를 입력하세요. 노트북·휴대폰에 같은 URL을 넣어야 합니다.',
    encSaveModeLabel: '형식', encSaveModeShort: '짧은 코드 (48시간, 릴레이)', encSaveModeLong: '긴 오프라인 토큰',
    encSaveTokenLabel: '긴 백업 토큰', encCopyTokenBtn: '긴 토큰 다시 복사', encShareTokenBtn: '공유…',
    encShortCodeLabel: '짧은 코드', encCopyShortCodeBtn: '코드 다시 복사', encShortCodeCopy: '짧은 코드가 클립보드에 복사되었습니다.',
    encRelayRequired: '짧은 코드를 쓰려면 릴레이 URL을 입력하세요.', encRelayStoreFailed: '릴레이에 저장하지 못했습니다. URL·CORS·네트워크를 확인하세요.', encRelayFetchFailed: '릴레이에서 코드를 가져오지 못했습니다.',
    encRestoreTitle: '백업 복원', encRestoreDesc: '짧은 코드이면 위에 같은 릴레이 URL을 입력한 뒤 코드와 비밀번호를 넣으세요. 긴 토큰이면 토큰만 붙여 넣으면 됩니다. 둘 다 비우면 js/backup.js에 넣어 둔 백업만 사용합니다.', encRestoreBtn: '복원', encRestoreSuccess: '백업이 복원되었습니다!', encRestoreFailed: '복원 실패 — 비밀번호가 틀리거나 데이터가 잘못되었습니다.',
    encTokenLabel: '코드 또는 긴 토큰', encTokenPlaceholder: '예: ab12-cd34-ef56 또는 긴 토큰 전체…',
    encPwLabel: '비밀번호', encPwEmpty: '비밀번호를 입력하세요.', encNoBackupOrToken: '백업 토큰을 붙여 넣거나, 이 기기용으로 js/backup.js에 백업을 넣어 두세요.',
    encClipboardPaste: '클립보드에서 붙여넣기', encClipboardPasted: '붙여넣었습니다.', encClipboardUnavailable: '클립보드를 읽을 수 없습니다. 직접 붙여 넣어 주세요.',
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
    ev: { kind: 'Event type', name: 'Name', age: 'Age', amount: 'Amount', endAge: 'End age', endAgePlaceholder: 'Empty = permanent', income: '💹 Income change', incomeAdd: '💰 Additional income', expense: '💸 Expense change', expenseAdd: '💸 Extra recurring cost', lumpOut: '🏠 Lump sum out', lumpIn: '🎁 Lump sum in', placeholderName: 'e.g. House purchase...', placeholderAmount: 'e.g. 150000 or 150k', noName: 'Unnamed', delete: '🗑 Delete' },
    accType: { roth_label: 'Roth IRA', roth_desc: 'After-tax → tax-free withdrawal', traditional_label: 'Traditional IRA / 401k', traditional_desc: 'Pre-tax → taxed on withdrawal', pension_kr_label: 'Korea pension fund', pension_kr_desc: 'Pre-tax → pension tax on withdrawal', taxable_label: 'Taxable account', taxable_desc: 'Taxed annually on gains', account: 'Account' },
    evBadge: { income: '💹 Income', 'income-add': '💰 Extra income', expense: '💸 Expense', 'expense-add': '💸 Extra cost', 'lumpsum-out': '🏠 Lump out', 'lumpsum-in': '🎁 Lump in', default: 'Event' },
    exportCopy: 'Copy data (paste in chat)', exportToast: 'Copied to clipboard. Paste in chat to share.', exportFailed: 'Copy failed. Copy manually.',
    importBtn: 'Import data', importTitle: 'Import Data', importDesc: 'Paste JSON data and click Apply.', importApply: 'Apply', importCancel: 'Cancel', importSuccess: 'Data applied successfully.', importFailed: 'Invalid JSON format.',
    encSave: '🔒 Create Backup', encRestore: '🔒 Restore Backup',
    encSaveTitle: 'Create Backup', encSaveDesc: 'Pick a password, then choose Short code (needs relay URL below — only ciphertext is stored) or Long offline token (no server). Payloads are gzip-compressed before encryption, so the long token is smaller than before.', encSaveBtn: 'Generate', encSaveCopy: 'Long token copied to clipboard.',
    encRelayUrlLabel: 'Backup relay URL', encRelayUrlHint: 'For short codes, deploy the Worker in the backup-relay folder and paste its https://….workers.dev URL here. Use the same URL on laptop and phone.',
    encSaveModeLabel: 'Format', encSaveModeShort: 'Short code (48h, relay)', encSaveModeLong: 'Long offline token',
    encSaveTokenLabel: 'Long backup token', encCopyTokenBtn: 'Copy long token again', encShareTokenBtn: 'Share…',
    encShortCodeLabel: 'Short code', encCopyShortCodeBtn: 'Copy code again', encShortCodeCopy: 'Short code copied to clipboard.',
    encRelayRequired: 'Enter the relay URL to use short codes.', encRelayStoreFailed: 'Could not store on relay. Check URL, CORS, and network.', encRelayFetchFailed: 'Could not fetch backup from relay.',
    encRestoreTitle: 'Restore Backup', encRestoreDesc: 'For a short code, enter the same relay URL, paste the code, then your password. For a long token, paste the token only. Leave both empty to use an embedded backup in js/backup.js.', encRestoreBtn: 'Restore', encRestoreSuccess: 'Backup restored!', encRestoreFailed: 'Restore failed — wrong password or bad data.',
    encTokenLabel: 'Code or long token', encTokenPlaceholder: 'e.g. ab12-cd34-ef56 or the full long token…',
    encPwLabel: 'Password', encPwEmpty: 'Please enter a password.', encNoBackupOrToken: 'Paste your backup token, or add one to js/backup.js for this device.',
    encClipboardPaste: 'Paste from clipboard', encClipboardPasted: 'Pasted.', encClipboardUnavailable: 'Could not read clipboard. Paste manually.',
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
    } else if (el.querySelector('.tooltip-wrap')) {
      let span = el.querySelector('.label-text');
      if (!span) {
        span = document.createElement('span');
        [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).forEach(n => n.remove());
        el.prepend(span);
      }
      span.textContent = val;
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
function saveState() { queueStateSave(); }

function getStateForExport() { return captureState(); }

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
    if (hs.type === 'buy') return fmt(objectMoney(hs, 'purchasePrice') * (1 - (parseFloat(hs.ltvRatio) || 0) / 100));
    if (hs.type === 'jeonse') return fmt(objectMoney(hs, 'deposit'));
    return fmt(objectMoney(hs, 'rentDeposit') || 0);
  });
  lines.push('| Initial outlay | ' + initials.join(' | ') + ' |');

  // Loan
  if (data.scenarios.some(s => s.type === 'buy')) {
    const loans = data.scenarios.map(sc => {
      const hs = housingScenarios.find(h => h.id === sc.id);
      if (hs && hs.type === 'buy') return fmt(objectMoney(hs, 'purchasePrice') * (parseFloat(hs.ltvRatio) || 0) / 100);
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

async function copyStateToClipboard() {
  if (!confirm(L('This copies unencrypted financial data. Share it only with people you trust. Continue?',
    '암호화되지 않은 재무 데이터를 복사합니다. 신뢰하는 대상에게만 공유하세요. 계속할까요?'))) return;
  const toast = document.getElementById('exportToast');
  try {
    const state = getStateForExport();
    let tables = '';
    try {
      tables = '\n\n' + buildYearlyTableText(simulate(currentSc), state.showRetireOnly) + '\n\n' + buildHousingTableText();
    } catch (_) { /* Raw data can still be transferred without an available FX rate. */ }
    await navigator.clipboard.writeText('```json\n' + JSON.stringify(state, null, 2) + '\n```' + tables);
    toast.textContent = t('exportToast');
  } catch (_) { toast.textContent = L('Copy failed. Check your inputs or use encrypted file backup.', '복사하지 못했습니다. 입력을 확인하거나 암호화 파일 백업을 사용하세요.'); }
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
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
  setupDialog(modal, closeImportModal);
  document.getElementById('importTextarea').focus();
}

function closeImportModal() {
  releaseDialog('importModal');
  const modal = document.getElementById('importModal');
  if (modal) modal.remove();
}

function applyImportData() {
  const raw = (document.getElementById('importTextarea')?.value || '').trim();
  if (!raw) return;
  try {
    const wrapped = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (raw.length > 2000000) throw new Error('size');
    if (importWorkspace(JSON.parse(wrapped ? wrapped[1] : raw))) closeImportModal();
  } catch (_) {
    const toast = document.getElementById('importToast');
    toast.textContent = L('Invalid or incompatible data. Nothing was replaced.', '잘못되었거나 호환되지 않는 데이터입니다. 기존 내용은 교체되지 않았습니다.');
    toast.classList.add('show');
  }
}

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
  const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
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
  return new Uint8Array(plain);
}

/** Base64 from Uint8Array without stack limits from spread on large buffers. */
function uint8ToBase64(u8) {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunk, u8.length)));
  }
  return btoa(binary);
}

async function gzipCompressUtf8(jsonString) {
  if (typeof CompressionStream === 'undefined') {
    return new TextEncoder().encode(jsonString);
  }
  const enc = new TextEncoder();
  const body = enc.encode(jsonString);
  const stream = new Response(body).body.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecompressToUtf8(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('gzip unsupported');
  }
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

async function backupCipherToState(password, cipherBuf) {
  const plain = await decryptData(password, cipherBuf);
  let json;
  if (plain.length >= 2 && plain[0] === 0x1f && plain[1] === 0x8b) {
    json = await gzipDecompressToUtf8(plain);
  } else {
    json = new TextDecoder().decode(plain);
  }
  return JSON.parse(json);
}

const BACKUP_RELAY_LS = 'backupRelayUrl';

function getBackupRelayBase() {
  try {
    const u = localStorage.getItem(BACKUP_RELAY_LS);
    if (u && u.trim()) return u.trim().replace(/\/+$/, '');
  } catch (_) {}
  if (typeof window !== 'undefined' && window.BACKUP_RELAY_BASE) {
    return String(window.BACKUP_RELAY_BASE).trim().replace(/\/+$/, '');
  }
  return '';
}

function persistBackupRelayFromField(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  try {
    localStorage.setItem(BACKUP_RELAY_LS, el.value.trim());
  } catch (_) {}
}

function relayUrlFromSaveModal() {
  const el = document.getElementById('encRelayUrl');
  return el ? el.value.trim().replace(/\/+$/, '') : '';
}

function relayHasConfiguredUrl() {
  return !!relayUrlFromSaveModal() || !!getBackupRelayBase();
}

async function relayStoreBlob(base, blobB64) {
  const url = `${base.replace(/\/+$/, '')}/v1/store`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blob: blobB64 }),
  });
  if (!r.ok) throw new Error('relay_store');
  const j = await r.json();
  if (!j || typeof j.id !== 'string') throw new Error('relay_store');
  return j.id;
}

async function relayFetchBlob(base, id) {
  const clean = String(id).trim().replace(/\s/g, '');
  const url = `${base.replace(/\/+$/, '')}/v1/${encodeURIComponent(clean)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('relay_fetch');
  const j = await r.json();
  if (!j || typeof j.blob !== 'string') throw new Error('relay_fetch');
  return j.blob;
}

function isShortBackupCode(s) {
  return /^[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}$/i.test(String(s).trim());
}

function updateEncSaveModeRadios() {
  const shortRadio = document.querySelector('input[name="encSaveMode"][value="short"]');
  const longRadio = document.querySelector('input[name="encSaveMode"][value="long"]');
  if (!shortRadio || !longRadio) return;
  const has = relayHasConfiguredUrl();
  shortRadio.disabled = !has;
  if (!has && shortRadio.checked) longRadio.checked = true;
}

function showEncToast(id, msg, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// ── Backup Save: short relay code or long offline token (gzip + AES-GCM) ──
function openBackupSaveModal() {
  if (document.getElementById('encModal')) return;
  const modal = document.createElement('div');
  modal.id = 'encModal';
  modal.className = 'import-modal-overlay';
  modal.innerHTML = `
    <div class="import-modal">
      <div class="import-modal-title">${t('encSaveTitle')}</div>
      <p class="import-modal-desc">${t('encSaveDesc')}</p>
      <details><summary>${L('Advanced: temporary transfer code (expires after 48 hours)', '고급: 임시 전송 코드 (48시간 후 만료)')}</summary>
      <div class="enc-field"><label for="encRelayUrl">${t('encRelayUrlLabel')}</label>
        <input type="url" id="encRelayUrl" class="enc-input" placeholder="https://your-worker.workers.dev" autocomplete="off"></div>
      <p class="import-modal-desc" style="font-size:0.88em;margin-top:4px">${t('encRelayUrlHint')}</p>
      </details>
      <div class="enc-field enc-save-mode"><span class="enc-mode-label">${t('encSaveModeLabel')}</span>
        <label class="enc-mode-opt"><input type="radio" name="encSaveMode" value="short"> ${t('encSaveModeShort')}</label>
        <label class="enc-mode-opt"><input type="radio" name="encSaveMode" value="long" checked> ${t('encSaveModeLong')}</label>
      </div>
      <div class="enc-field"><label>${t('encPwLabel')}</label><input type="password" id="encPw" class="enc-input" autocomplete="new-password"></div>
      <div class="import-modal-actions">
        <button type="button" class="btn-import-cancel" onclick="closeEncModal()">${t('importCancel')}</button>
        <button type="button" class="btn-import-apply" id="downloadEncrypted" onclick="downloadEncryptedFile()">${L('Download encrypted file', '암호화 파일 다운로드')}</button>
        <button type="button" class="btn-import-cancel" onclick="doBackupSave()">${t('encSaveBtn')}</button>
      </div>
      <div id="encSaveResultShort" style="display:none;margin-top:12px">
        <div class="enc-field"><label>${t('encShortCodeLabel')}</label>
          <input type="text" id="encShortCode" class="enc-input enc-short-code-input" readonly></div>
        <div class="import-modal-actions">
          <button type="button" class="btn-import-cancel" onclick="copyBackupTokenAgain()">${t('encCopyShortCodeBtn')}</button>
          <button type="button" class="btn-import-apply" id="encShareBtnShort" style="display:none" onclick="shareBackupToken()">${t('encShareTokenBtn')}</button>
        </div>
      </div>
      <div id="encSaveResultLong" style="display:none;margin-top:12px">
        <div class="enc-field"><label>${t('encSaveTokenLabel')}</label><textarea id="encResult" class="import-textarea" readonly rows="8"></textarea></div>
        <div class="import-modal-actions">
          <button type="button" class="btn-import-cancel" onclick="copyBackupTokenAgain()">${t('encCopyTokenBtn')}</button>
          <button type="button" class="btn-import-apply" id="encShareBtn" style="display:none" onclick="shareBackupToken()">${t('encShareTokenBtn')}</button>
        </div>
      </div>
      <div id="encToast" class="import-toast" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEncModal(); });
  const relayEl = document.getElementById('encRelayUrl');
  if (relayEl) {
    relayEl.value = getBackupRelayBase();
    relayEl.addEventListener('blur', () => {
      persistBackupRelayFromField('encRelayUrl');
      updateEncSaveModeRadios();
    });
    relayEl.addEventListener('input', updateEncSaveModeRadios);
  }
  updateEncSaveModeRadios();
  const shortMode = document.querySelector('input[name="encSaveMode"][value="short"]');
  const longMode = document.querySelector('input[name="encSaveMode"][value="long"]');
  if (shortMode && longMode && relayHasConfiguredUrl()) {
    shortMode.checked = true;
    shortMode.disabled = false;
  } else if (shortMode && longMode) {
    longMode.checked = true;
    shortMode.disabled = true;
  }
  setupDialog(modal, closeEncModal);
  document.getElementById('encPw').focus();
}

function copyBackupTokenAgain() {
  const short = document.getElementById('encShortCode');
  if (short && short.value) {
    short.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(short.value).then(() => showEncToast('encToast', t('encShortCodeCopy'), false)).catch(() => showEncToast('encToast', t('exportFailed'), true));
    }
    return;
  }
  const result = document.getElementById('encResult');
  if (!result || !result.value) return;
  result.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(result.value).then(() => showEncToast('encToast', t('encSaveCopy'), false)).catch(() => showEncToast('encToast', t('exportFailed'), true));
  }
}

function shareBackupToken() {
  const short = document.getElementById('encShortCode');
  const long = document.getElementById('encResult');
  const text = (short && short.value) ? short.value : (long && long.value ? long.value : '');
  if (!text || typeof navigator.share !== 'function') return;
  navigator.share({ text, title: document.title || 'Backup' }).catch(() => {});
}

// ── Backup Restore: short code + relay, long token, or embedded ENCRYPTED_BACKUP ──
function openBackupRestoreModal() {
  if (document.getElementById('encModal')) return;
  const modal = document.createElement('div');
  modal.id = 'encModal';
  modal.className = 'import-modal-overlay';
  modal.innerHTML = `
    <div class="import-modal">
      <div class="import-modal-title">${t('encRestoreTitle')}</div>
      <p class="import-modal-desc">${t('encRestoreDesc')}</p>
      <label class="backup-file-label" for="backupFile">${L('Choose encrypted backup file', '암호화 백업 파일 선택')}</label>
      <input id="backupFile" type="file" accept=".nwbackup,.txt" onchange="readBackupFile(this)">
      <details><summary>${L('Advanced: relay URL for a temporary code', '고급: 임시 코드용 릴레이 URL')}</summary>
      <div class="enc-field"><label for="encRelayUrlRestore">${t('encRelayUrlLabel')}</label>
        <input type="url" id="encRelayUrlRestore" class="enc-input" placeholder="https://your-worker.workers.dev" autocomplete="off"></div>
      </details>
      <div class="enc-field"><label>${t('encTokenLabel')}</label><textarea id="encTokenPaste" class="import-textarea" rows="6" placeholder="${t('encTokenPlaceholder')}"></textarea></div>
      <div class="import-modal-actions" style="margin-top:4px">
        <button type="button" class="btn-import-cancel" onclick="fillBackupTokenFromClipboard()">${t('encClipboardPaste')}</button>
      </div>
      <div class="enc-field" style="margin-top:12px"><label>${t('encPwLabel')}</label><input type="password" id="encPw" class="enc-input" autocomplete="current-password"></div>
      <div class="import-modal-actions">
        <button type="button" class="btn-import-cancel" onclick="closeEncModal()">${t('importCancel')}</button>
        <button type="button" class="btn-import-apply" onclick="doBackupRestore()">${t('encRestoreBtn')}</button>
      </div>
      <div id="encToast" class="import-toast" aria-live="polite"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEncModal(); });
  const rr = document.getElementById('encRelayUrlRestore');
  if (rr) {
    rr.value = getBackupRelayBase();
    rr.addEventListener('blur', () => persistBackupRelayFromField('encRelayUrlRestore'));
  }
  setupDialog(modal, closeEncModal);
  document.getElementById('encTokenPaste').focus();
}

function fillBackupTokenFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    showEncToast('encToast', t('encClipboardUnavailable'), true);
    return;
  }
  navigator.clipboard.readText().then((text) => {
    const ta = document.getElementById('encTokenPaste');
    if (ta) ta.value = text.trim();
    showEncToast('encToast', t('encClipboardPasted'), false);
  }).catch(() => showEncToast('encToast', t('encClipboardUnavailable'), true));
}

function closeEncModal() {
  releaseDialog('encModal');
  const m = document.getElementById('encModal');
  if (m) m.remove();
}

async function doBackupSave() {
  const pw = document.getElementById('encPw').value;
  if (!pw) { showEncToast('encToast', t('encPwEmpty'), true); return; }
  persistBackupRelayFromField('encRelayUrl');
  const relay = relayUrlFromSaveModal() || getBackupRelayBase();
  const modeEl = document.querySelector('input[name="encSaveMode"]:checked');
  const mode = modeEl ? modeEl.value : 'long';

  try {
    const state = getStateForExport();
    const json = JSON.stringify(state);
    const plainBytes = await gzipCompressUtf8(json);
    const encrypted = await encryptData(pw, plainBytes);
    const b64 = uint8ToBase64(encrypted);

    const wrapShort = document.getElementById('encSaveResultShort');
    const wrapLong = document.getElementById('encSaveResultLong');

    if (mode === 'short') {
      if (!relay) {
        showEncToast('encToast', t('encRelayRequired'), true);
        return;
      }
      const id = await relayStoreBlob(relay, b64);
      if (wrapShort) wrapShort.style.display = 'block';
      if (wrapLong) wrapLong.style.display = 'none';
      const sc = document.getElementById('encShortCode');
      if (sc) {
        sc.value = id;
        sc.focus();
        sc.select();
      }
      const shareShort = document.getElementById('encShareBtnShort');
      if (shareShort) shareShort.style.display = typeof navigator.share === 'function' ? 'inline-block' : 'none';
      const shareLong = document.getElementById('encShareBtn');
      if (shareLong) shareLong.style.display = 'none';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(id);
        showEncToast('encToast', t('encShortCodeCopy'), false);
      } else {
        showEncToast('encToast', t('exportFailed'), true);
      }
    } else {
      if (wrapShort) wrapShort.style.display = 'none';
      if (wrapLong) wrapLong.style.display = 'block';
      const result = document.getElementById('encResult');
      if (result) result.value = b64;
      const shareBtn = document.getElementById('encShareBtn');
      if (shareBtn) shareBtn.style.display = typeof navigator.share === 'function' ? 'inline-block' : 'none';
      const shareShort = document.getElementById('encShareBtnShort');
      if (shareShort) shareShort.style.display = 'none';
      if (result) {
        result.focus();
        result.select();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(b64);
        showEncToast('encToast', t('encSaveCopy'), false);
      } else {
        showEncToast('encToast', t('exportFailed'), true);
      }
    }
  } catch (e) {
    const relayErr = e && (e.message === 'relay_store' || e.message === 'relay_fetch');
    showEncToast('encToast', relayErr ? t('encRelayStoreFailed') : t('encRestoreFailed'), true);
  }
}

function applyDecryptedBackupState(state) { return importWorkspace(state); }

async function doBackupRestore() {
  const pw = document.getElementById('encPw').value;
  if (!pw) { showEncToast('encToast', t('encPwEmpty'), true); return; }
  persistBackupRelayFromField('encRelayUrlRestore');
  const pasteEl = document.getElementById('encTokenPaste');
  const rawPaste = pasteEl ? pasteEl.value.trim() : '';
  const pasted = rawPaste.replace(/\s/g, '');
  const embedded = (typeof ENCRYPTED_BACKUP !== 'undefined' && ENCRYPTED_BACKUP)
    ? String(ENCRYPTED_BACKUP).replace(/\s/g, '') : '';

  let b64 = '';
  try {
    if (rawPaste && isShortBackupCode(rawPaste)) {
      const relayEl = document.getElementById('encRelayUrlRestore');
      const relay = (relayEl && relayEl.value.trim().replace(/\/+$/, '')) || getBackupRelayBase();
      if (!relay) {
        showEncToast('encToast', t('encRelayRequired'), true);
        return;
      }
      b64 = await relayFetchBlob(relay, rawPaste);
    } else {
      b64 = pasted || embedded;
    }
    if (!b64) { showEncToast('encToast', t('encNoBackupOrToken'), true); return; }
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const state = await backupCipherToState(pw, buf);
    if (!applyDecryptedBackupState(state)) return;
    showEncToast('encToast', t('encRestoreSuccess'), false);
    setTimeout(closeEncModal, 1500);
  } catch (e) {
    const relayFail = e && (e.message === 'relay_fetch' || e.message === 'relay_store');
    showEncToast('encToast', relayFail ? t('encRelayFetchFailed') : t('encRestoreFailed'), true);
  }
}

function pN(id) {
  if (NWCore.MONEY_IDS.includes(id)) {
    return NWCore.toUSD(document.getElementById(id).value, 'USD', W.state.fx) +
      NWCore.toUSD(document.getElementById(id + '_KRW').value, 'KRW', W.state.fx);
  }
  return NWCore.number(document.getElementById(id)?.value || '', -99.99, 1000);
}
function pR(id) { return pN(id) / 100; }

function fmt(n) {
  return Number.isFinite(n) ? fmtDisplayed(displayAmount(n)) : '—';
}

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
    balance: objectMoney(a, 'balance'),
    type: a.type,
    rate: (parseFloat(a.rate) || 0) / 100 + mod.p / 100,
    contribSelf: objectMoney(a, 'contribSelf'),
    contribSelfRate: (parseFloat(a.contribSelfRate) || 0) / 100,
    contribEmployer: objectMoney(a, 'contribEmployer'),
    contribEmployerRate: (parseFloat(a.contribEmployerRate) || 0) / 100,
    employerMatchMode: a.employerMatchMode || (a.contribEmployerRate ? 'percent' : 'fixed'),
    matchRate: NWCore.number(a.matchRate ?? '50') / 100,
    matchCapPercent: NWCore.number(a.matchCapPercent ?? '8') / 100,
    contribStartAge: parseInt(a.contribStartAge) || startAge,
    contribEndAge: parseInt(a.contribEndAge) || retireAge,
    withdrawTaxRate: (parseFloat(a.withdrawTaxRate) || 0) / 100,
    retireDrawAge: parseInt(a.retireDrawAge) || 60,
  }));

  // expense-add / income-add: each entry tracks its own current value
  const extraExpenses = []; // { id, current, endAge }
  const extraIncomes = []; // { id, current, endAge }

  const rows = [];
  for (let age = startAge; age <= 100; age++) {
    const isRetired = age >= retireAge;

    // Remove expired extra expenses / incomes
    for (let i = extraExpenses.length - 1; i >= 0; i--) {
      if (extraExpenses[i].endAge && age >= extraExpenses[i].endAge) {
        extraExpenses.splice(i, 1);
      }
    }
    for (let i = extraIncomes.length - 1; i >= 0; i--) {
      if (extraIncomes[i].endAge && age >= extraIncomes[i].endAge) {
        extraIncomes.splice(i, 1);
      }
    }

    let lumpIn = 0, lumpOut = 0;
    const evDescs = [];
    for (const ev of events) {
      if (parseInt(ev.age, 10) !== age) continue;
      const val = objectMoney(ev, 'value');
      if (ev.type === 'income') { income = val; evDescs.push({ type: ev.type, label: ev.name || t('ev.income') }); }
      else if (ev.type === 'income-add') {
        extraIncomes.push({ id: ev.id, current: val, endAge: parseInt(ev.endAge) || 0 });
        evDescs.push({ type: ev.type, label: ev.name || t('ev.incomeAdd') });
      }
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
    const totalIncome = income + extraIncomes.reduce((s, x) => s + x.current, 0);

    const mPayment = mortgage > 0 ? (mRate === 0 ? mortgage / Math.max(1, 30 - (age - startAge)) : mortgage * mRate / (1 - Math.pow(1 + mRate, -Math.max(1, 30 - (age - startAge))))) : 0;
    const slPayment = studentLoan > 0 ? (slRate === 0 ? studentLoan / Math.max(1, 10 - (age - startAge)) : studentLoan * slRate / (1 - Math.pow(1 + slRate, -Math.max(1, 10 - (age - startAge))))) : 0;
    const carPayment = carLoan > 0 ? carLoan / Math.max(1, 5 - (age - startAge)) : 0;
    const totalDebt = Math.min(mPayment + slPayment + carPayment, mortgage + studentLoan + carLoan);
    mortgage = Math.max(0, mortgage - (mPayment - mortgage * mRate));
    studentLoan = Math.max(0, studentLoan - (slPayment - studentLoan * slRate));
    carLoan = Math.max(0, carLoan - carPayment);

    let totalAccContrib = 0;
    let totalAccBalancePre = 0;
    for (const ac of accState) {
      const stillContrib = age >= ac.contribStartAge && age < ac.contribEndAge;
      const selfAmt = stillContrib ? (ac.contribSelfRate > 0 ? totalIncome * ac.contribSelfRate : ac.contribSelf) : 0;
      let employerAmt = 0;
      if (stillContrib) {
        if (ac.employerMatchMode === 'match') {
          const matchable = Math.min(selfAmt, ac.matchCapPercent * totalIncome);
          employerAmt = ac.matchRate * matchable;
        } else if (ac.employerMatchMode === 'percent') {
          employerAmt = totalIncome * ac.contribEmployerRate;
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

    const savings = isRetired ? 0 : (totalIncome - totalExpense - totalDebt - totalAccContrib);
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
    const dispIncome = isRetired ? null : totalIncome;
    const dispExpense = totalExpense + (isRetired ? 0 : totalDebt);
    const dispSavings = isRetired ? -totalExpense : savings;

    // Inflate base expense and each extra expense independently
    expense = expense * (1 + inf);
    for (const x of extraExpenses) x.current = x.current * (1 + inf);
    if (!isRetired) {
      income = income * (1 + wageGrowth);
      for (const x of extraIncomes) x.current = x.current * (1 + wageGrowth);
    }

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
  var vol = pR('returnVolatility');

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
    p10.push(vals[Math.floor(MC_RUNS * 0.1)]);
    p50.push(vals[Math.floor(MC_RUNS * 0.5)]);
    p90.push(vals[Math.floor(MC_RUNS * 0.9)]);
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
  const accTotal = accounts.reduce((s, a) => s + objectMoney(a, 'balance'), 0);
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
  const mPay = mort > 0 ? (mRate === 0 ? mort / 30 : mort * mRate / (1 - Math.pow(1 + mRate, -30))) : 0;
  const slPay = sl > 0 ? (slRate === 0 ? sl / 10 : sl * slRate / (1 - Math.pow(1 + slRate, -10))) : 0;
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
  const totalD = rows.map(r => displayAmount(r.totalLiquid));
  const investD = rows.map(r => r.invest >= 0 ? displayAmount(r.invest) : null);
  const accD = rows.map(r => displayAmount(r.totalAccAfterTax));

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
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtDisplayed(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: '#606078', font: { size: 9 }, maxTicksLimit: 14 }, grid: { color: 'rgba(44,44,58,0.4)' } },
        y: { ticks: { color: '#606078', font: { size: 9, family: 'DM Mono' }, callback: v => fmtDisplayed(v) }, grid: { color: 'rgba(44,44,58,0.4)' } },
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
        { label: t('chart.mcP90'), data: data.p90.map(displayAmount), borderColor: 'rgba(212,168,83,0.5)', backgroundColor: 'transparent', borderWidth: 1, pointRadius: 0, pointHoverRadius: 3, borderDash: [2, 4], tension: 0.3 },
        { label: t('chart.mcP50'), data: data.p50.map(displayAmount), borderColor: '#d4a853', backgroundColor: 'rgba(212,168,83,0.12)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.3 },
        { label: t('chart.mcP10'), data: data.p10.map(displayAmount), borderColor: 'rgba(212,168,83,0.5)', backgroundColor: 'transparent', borderWidth: 1, pointRadius: 0, pointHoverRadius: 3, borderDash: [2, 4], tension: 0.3 },
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
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtDisplayed(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: '#606078', font: { size: 9 }, maxTicksLimit: 14 }, grid: { color: 'rgba(44,44,58,0.4)' } },
        y: { ticks: { color: '#606078', font: { size: 9, family: 'DM Mono' }, callback: v => fmtDisplayed(v) }, grid: { color: 'rgba(44,44,58,0.4)' } },
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
    ${accCols.map(n => `<th>${escapeHTML(n)}</th>`).join('')}
    <th>${t('table.total')}</th>
    ${hsCols.map((sc, i) => `<th style="color:${HS_COLORS[i]}">${escapeHTML(sc.name)}</th>`).join('')}
  </tr>`;

  body.innerHTML = '';
  const list = showOnly ? rows.filter(r => r.isRetired) : rows;
  for (const r of list) {
    const tr = document.createElement('tr');
    if (r.age === retAge) tr.classList.add('hl');

    let ageCell = r.age + ageSfx;
    if (r.age === retAge) ageCell += '<span class="retire-tag">' + t('table.retireTag') + '</span>';

    const evContent = r.events.length ? r.events.map(e => `<span class="edot edot-${escapeHTML(e.type)}">${escapeHTML(e.label)}</span>`).join('') : '<span style="color:var(--text3)">—</span>';
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
  const accNow = accounts.reduce((s, a) => s + objectMoney(a, 'balance'), 0);
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
  if (!prepareRender()) { saveState(); return; }
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
  enhanceAccessibility();
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
  renderAll();
}

function updateMcSuccessLabel() {
  var el = document.getElementById('mcSuccessRate');
  if (!el) return;
  if (chartMode === 'montecarlo' && mcResult != null) {
    var pct = (mcResult.successRate * 100).toFixed(1);
    var extra = (mcResult.depletedCount != null && mcResult.depletedCount > 0)
      ? ' (' + mcResult.depletedCount + ' depleted)'
      : '';
    if (mcResult.pathsIdentical) extra = L(' (identical paths for these inputs)', ' (현재 입력에서 경로가 동일함)');
    el.textContent = t('chart.mcSuccess') + ': ' + pct + '%' + extra;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
  }
}

function runMonteCarloUI() {
  if (!prepareRender()) return;
  document.getElementById('mcStale').hidden = true;
  const btn = document.getElementById('btnRunMC');
  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('chart.mcRunning');
  }
  setTimeout(() => {
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
    currency: opts.currency || 'USD',
    type: opts.type || 'roth',
    name: opts.name || '',
    balance: opts.balance || '',
    rate: opts.rate ?? '7',
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
  rememberUndo();
  accounts = accounts.filter(a => a.id !== id);
  events.forEach(e => { if (Number(e.drainAccountId) === id) delete e.drainAccountId; });
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
  } else if (field === 'balance') {
    const el = document.querySelector('#ac-' + id + ' .acc-bal');
    try { if (el) el.textContent = nativeMoney(NWCore.number(value), a.currency); }
    catch (_) { if (el) el.textContent = '—'; }
  } else if (['type', 'employerMatchMode', 'currency'].includes(field)) {
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

  for (const raw of accounts) {
    const a = safeRecord(raw);
    const accType = ACC_TYPES[a.type] || ACC_TYPES.roth;
    const empMode = a.employerMatchMode || (a.contribEmployerRate ? 'percent' : 'fixed');
    const card = document.createElement('div');
    card.className = 'acc-card';
    card.id = 'ac-' + a.id;
    const typeLabel = getAccTypeLabel(a.type);
    const typeDesc = getAccTypeDesc(a.type);
    let balFmt = '—';
    try { balFmt = nativeMoney(NWCore.number(raw.balance), raw.currency); } catch (_) {}
    card.innerHTML = `
      <div class="acc-head" onclick="toggleAcc(${a.id})">
        <span class="acc-badge ${accType.badge}">${typeLabel}</span>
        <span class="acc-name">${a.name || typeLabel}</span>
        <span class="acc-bal">${balFmt}</span>
        <span class="acc-toggle">▼</span>
      </div>
      <div class="acc-body">
        ${currencySelect(a.currency, `updateAccount(${a.id},'currency',this.value)`)}
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
            <div class="iw"><input class="acc-num" type="text" value="${a.balance}" placeholder="0" oninput="updateAccount(${a.id},'balance',this.value)"><span class="sfx">${a.currency}</span></div>
          </div>
          <div class="field"><label>${t('acc.rate')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.rate}" placeholder="7" oninput="updateAccount(${a.id},'rate',this.value)"><span class="sfx">%</span></div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);margin:6px 0 4px;font-weight:600;">${t('acc.contribNote')}</div>
        <div class="row2">
          <div class="field"><label>${t('acc.contribSelf')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${a.contribSelf}" placeholder="0" oninput="updateAccount(${a.id},'contribSelf',this.value)"><span class="sfx">${a.currency}</span></div>
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
            <div class="iw"><input class="acc-num" type="text" value="${a.contribEmployer}" placeholder="0" oninput="updateAccount(${a.id},'contribEmployer',this.value)"><span class="sfx">${a.currency}</span></div>
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
    currency: opts.currency || 'USD',
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
  rememberUndo();
  events = events.filter(e => e.id !== id);
  renderEventList();
  renderAll();
}

function updateEvent(id, field, value) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  ev[field] = value;
  if (field === 'name') {
    const lbl = document.querySelector('#ev-' + id + ' .ev-lbl');
    if (lbl) lbl.textContent = value || t('ev.noName');
  } else if (field === 'age') {
    const tag = document.querySelector('#ev-' + id + ' .ev-age-tag');
    if (tag) tag.textContent = value + t('ageSfx');
  } else if (['type', 'currency'].includes(field)) {
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
    'income-add': ['ebadge-income-add', 'evBadge.income-add'],
    expense: ['ebadge-expense', 'evBadge.expense'],
    'expense-add': ['ebadge-expense-add', 'evBadge.expense-add'],
    'lumpsum-out': ['ebadge-lumpsum-out', 'evBadge.lumpsum-out'],
    'lumpsum-in': ['ebadge-lumpsum-in', 'evBadge.lumpsum-in'],
  };
  const sorted = [...events].sort((a, b) => parseInt(a.age) - parseInt(b.age));
  for (const raw of sorted) {
    const ev = safeRecord(raw);
    const [bc, blKey] = BADGES[ev.type] || ['ebadge-income', 'evBadge.default'];
    const bl = t(blKey);
    const isLump = ev.type.startsWith('lumpsum');
    const sfx = ev.currency + (isLump ? '' : L('/yr', '/년'));
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
        ${currencySelect(ev.currency, `updateEvent(${ev.id},'currency',this.value)`)}
        <div class="field"><label>${t('ev.kind')}</label>
          <select class="acc-sel" onchange="updateEvent(${ev.id},'type',this.value)">
            <option value="income" ${ev.type === 'income' ? 'selected' : ''}>${t('ev.income')}</option>
            <option value="income-add" ${ev.type === 'income-add' ? 'selected' : ''}>${t('ev.incomeAdd')}</option>
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
        ${ev.type === 'expense-add' || ev.type === 'income-add' ? `<div class="row2">
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
    id, currency: 'USD', type: type || 'buy', name: '', enabled: true,
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
  rememberUndo();
  housingScenarios = housingScenarios.filter(h => h.id !== id);
  renderHousingScenarioList();
  saveState();
}

function updateHousingScenario(id, field, value) {
  const h = housingScenarios.find(x => x.id === id);
  if (!h) return;
  h[field] = value;
  if (['type', 'currency'].includes(field)) renderHousingScenarioList();
  housingResult = null;
  renderAll();
}

function openHousingModal() {
  const overlay = document.getElementById('housingModalOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderHousingScenarioList();
  setupDialog(overlay, closeHousingModal);
  overlay.querySelector('button, input, select')?.focus();
}

function closeHousingModal() {
  releaseDialog('housingModalOverlay');
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
    const h = safeRecord(housingScenarios[idx]);
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
        ${currencySelect(h.currency, `updateHousingScenario(${h.id},'currency',this.value)`)}
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
              oninput="updateHousingScenario(${h.id},'purchasePrice',this.value)"><span class="sfx">${h.currency}</span></div></div>
          <div class="field"><label>${t('housing.appreciationRate')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.appreciationRate}"
              oninput="updateHousingScenario(${h.id},'appreciationRate',this.value)"><span class="sfx">%</span></div></div>
        </div>
        <div class="field"><label>${t('housing.annualMaintenance')}</label>
          <div class="iw"><input class="acc-num" type="text" value="${h.annualMaintenance}"
            oninput="updateHousingScenario(${h.id},'annualMaintenance',this.value)"><span class="sfx">${h.currency}${L('/yr', '/년')}</span></div></div>
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
              oninput="updateHousingScenario(${h.id},'deposit',this.value)"><span class="sfx">${h.currency}</span></div></div>
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
              oninput="updateHousingScenario(${h.id},'monthlyRent',this.value)"><span class="sfx">${h.currency}${L('/mo', '/월')}</span></div></div>
          <div class="field"><label>${t('housing.rentDeposit')}</label>
            <div class="iw"><input class="acc-num" type="text" value="${h.rentDeposit}"
              oninput="updateHousingScenario(${h.id},'rentDeposit',this.value)"><span class="sfx">${h.currency}</span></div></div>
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
  modal.querySelector('.housing-modal-title').id = 'housingModalOverlay-title';
  enhanceAccessibility(modal);
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

      if (age === Number(hs.startAge)) {
        started = true;
        if (hs.type === 'buy') {
          const price = objectMoney(hs, 'purchasePrice');
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
          currentDeposit = objectMoney(hs, 'deposit');
          investDelta -= currentDeposit;
          depositHeld = currentDeposit;
        } else if (hs.type === 'rent') {
          const dep = objectMoney(hs, 'rentDeposit') || 0;
          investDelta -= dep;
          depositHeld = dep;
          annualRent = (objectMoney(hs, 'monthlyRent') || 0) * 12;
        }
      }

      if (started && age > hs.startAge) {
        // Apply return on delta from previous year
        investDelta *= (1 + rr);

        if (hs.type === 'buy') {
          propertyValue *= (1 + (parseFloat(hs.appreciationRate) || 0) / 100);
          const maint = objectMoney(hs, 'annualMaintenance') || 0;
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
    data: sc.rows.map(r => displayAmount(r.netWorth)),
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
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtDisplayed(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: '#606078', font: { size: 9 }, maxTicksLimit: 14 }, grid: { color: 'rgba(44,44,58,0.4)' } },
        y: { ticks: { color: '#606078', font: { size: 9, family: 'DM Mono' }, callback: v => fmtDisplayed(v) }, grid: { color: 'rgba(44,44,58,0.4)' } },
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
    html += `<th style="color:${HS_COLORS[i]}">${escapeHTML(sc.name)}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Initial outlay row
  html += `<tr><td>${t('housing.tableInitial')}</td>`;
  for (const sc of data.scenarios) {
    const hs = housingScenarios.find(h => h.id === sc.id);
    let initial = 0;
    if (hs) {
      if (hs.type === 'buy') initial = objectMoney(hs, 'purchasePrice') * (1 - (parseFloat(hs.ltvRatio) || 0) / 100);
      else if (hs.type === 'jeonse') initial = objectMoney(hs, 'deposit');
      else if (hs.type === 'rent') initial = objectMoney(hs, 'rentDeposit') || 0;
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
        html += `<td>${fmt(objectMoney(hs, 'purchasePrice') * (parseFloat(hs.ltvRatio) || 0) / 100)}</td>`;
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
  setChartMode('housing');
}

function init() { setupWorkspace(); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
