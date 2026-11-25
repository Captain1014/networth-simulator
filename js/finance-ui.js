/* Input-only UI. All calculations and validation live in the pure finance modules. */
function financeLabel(text) {
  const parts = String(text || '').split(' / ');
  return LOCALE === 'ko' ? parts[parts.length - 1] : parts[0];
}
function financeRefreshStatuses() {
  let state;
  try { state = captureState(); } catch (_) { return; }
  for (const element of document.querySelectorAll('.finance-allocation-status')) {
    const rule = state.finance.allocations.find(x => x.id === element.dataset.ruleId);
    if (!rule) continue;
    const missing = NWFinanceState.allocationIssues(state, rule);
    element.textContent = missing.length ? L('Paused — required: ', '계산 보류 — 필수 입력: ') + missing.join(', ') :
      rule.enabled ? L('Configured; subject to dates/scenario and cash availability', '설정됨 · 날짜·시나리오·가용 현금 조건 적용') :
        L('Configured but disabled', '설정됨 · 사용 꺼짐');
  }
}
function financeEnsure() {
  W.state.finance ||= NWFinanceState.defaults();
  for (const a of accounts) W.state.finance.accounts[a.id] ||= NWFinanceState.accountDefaults(a);
  return W.state.finance;
}
function financeAt(path) {
  let value = financeEnsure();
  for (const key of path) value = value[key];
  return value;
}
function financeSet(path, value) {
  let obj = financeEnsure();
  for (const key of path.slice(0, -1)) obj = obj[key];
  obj[path[path.length - 1]] = value;
  try {
    captureState();
    renderAll();
    document.getElementById('financeFormError').textContent = '';
    financeRefreshStatuses();
  } catch (error) {
    document.getElementById('financeFormError').textContent = L('Check setting: ', '설정을 확인하세요: ') + error.message;
    renderAll();
  }
}
function financeField(path, spec, container) {
  const field = document.createElement('div');
  field.className = 'finance-field';
  const label = document.createElement('label');
  const id = 'finance-' + path.join('-');
  label.htmlFor = id;
  label.textContent = financeLabel(spec.label || path.at(-1));
  let input;
  const key = path.at(-1);
  const references = ['scenarioId', 'endOnScenario', 'payrollSourceId', 'includedInFlowId', 'replaceRentFlowId', 'tcParentId', 'accountId',
    'sourceAccountId', 'destinationAccountId', 'replacesFlowId', 'replacesEventId', 'sourceFlowId', 'referenceId'];
  if (references.includes(key)) {
    input = document.createElement('select');
    const none = document.createElement('option'); none.value = ''; none.textContent = L('None / not entered', '없음 / 미입력'); input.appendChild(none);
    let choices = [];
    const f = financeEnsure();
    if (key === 'referenceId') {
      const group = f.planningItems[path[1]].referenceGroup;
      choices = group === 'accounts' ? accounts.map(x => [x.id, x.name || getAccTypeLabel(x.type)]) :
        group === 'cash' ? ['USD', 'KRW'].map(x => [x, x]) :
        ['retirement', 'benefits'].includes(group) ? [[group, group]] :
        Array.isArray(f[group]) ? f[group].map(x => [x.id, x.name || x.id]) : [];
    } else if (key === 'sourceFlowId') choices = f.flows.filter(x => x.kind === 'business').map(x => [x.id, x.name || x.id]);
    else if (['sourceAccountId', 'destinationAccountId'].includes(key)) choices = accounts
      .filter(a => ['traditional', 'pension_kr', 'dc_kr', 'irp_kr'].includes(a.type)).map(a => [a.id, a.name || getAccTypeLabel(a.type)]);
    else if (key === 'replacesEventId') choices = events.filter(e => e.type === 'lumpsum-in').map(e => [e.id, e.name || String(e.id)]);
    else if (key === 'replacesFlowId') choices = f.flows.filter(x => x.frequency === 'once' && !['expense', 'gross_tc'].includes(x.kind)).map(x => [x.id, x.name || x.id]);
    else if (key === 'accountId') choices = accounts.filter(a => a.type === 'taxable').map(a => [a.id, a.name || `Account ${a.id}`]);
    else if (['scenarioId', 'endOnScenario'].includes(key)) choices = f.scenarios.map(x => [x.id, x.name || x.id]);
    else choices = f.flows.filter(x => key === 'payrollSourceId' ? ['salary', 'gross_tc'].includes(x.kind)
      : key === 'tcParentId' ? x.kind === 'gross_tc' : x.kind === 'expense').map(x => [x.id, x.name || x.id]);
    for (const [value, text] of choices) {
      const option = document.createElement('option'); option.value = String(value); option.textContent = text; input.appendChild(option);
    }
    input.value = financeAt(path) == null ? '' : String(financeAt(path));
  } else if (spec.type === 'select') {
    input = document.createElement('select');
    const names = {
      db: L('DB defined benefit', 'DB 확정급여형'), severance_lump_sum: L('Severance lump sum', '일시금 퇴직금'),
      gross: L('Before tax', '세전'), net: L('After tax', '세후'),
      cash: L('Cash payment', '현금 수령'), retirement_account: L('Retirement account', '연금계좌 수령'),
      new_benefit: L('New separate entitlement', '기존 자산에 없는 별도 퇴직급여'),
      existing_account_transfer: L('Transfer already-owned retirement assets', '이미 보유한 퇴직자산 이동'),
    };
    for (const choice of spec.choices) {
      const option = document.createElement('option'); option.value = choice; option.textContent = names[choice] || choice.replaceAll('_', ' '); input.appendChild(option);
    }
    input.value = financeAt(path) ?? spec.value;
  } else {
    input = document.createElement('input');
    input.type = spec.type === 'boolean' ? 'checkbox' : spec.type === 'date' ? 'date' : spec.type === 'number' ? 'number' : 'text';
    if (spec.type === 'boolean') input.checked = !!financeAt(path);
    else input.value = financeAt(path) ?? '';
    if (spec.type === 'number') {
      input.min = spec.min ?? 0; input.max = spec.max ?? 1e15; input.step = 'any';
      input.placeholder = L('Unknown / not entered', '미확인 / 미입력');
    }
    if (spec.type === 'date') { input.min = '1900-01-01'; input.max = '9900-12-31'; }
  }
  input.id = id;
  input.addEventListener('change', () => {
    let value = spec.type === 'boolean' ? input.checked : input.value;
    if (spec.type === 'number' || key === 'accountId') value = input.value === '' ? null : input.value;
    if (key === 'referenceGroup') {
      financeEnsure().planningItems[path[1]].referenceId = '';
      financeEnsure().planningItems[path[1]].reviewConfirmed = false;
    }
    financeSet(path, value);
    if (key === 'referenceGroup') renderFinanceForm();
    if (key === 'name') field.closest('details')?.querySelector('summary')?.replaceChildren(document.createTextNode(input.value || L('Unnamed', '이름 없음')));
  });
  field.append(label, input); container.appendChild(field);
  return input;
}
function financeSection(parent, title, open = false) {
  const details = document.createElement('details');
  details.className = 'finance-section'; details.open = open;
  const summary = document.createElement('summary'); summary.textContent = title;
  const body = document.createElement('div'); body.className = 'finance-grid';
  details.append(summary, body); parent.appendChild(details);
  return { details, body };
}
function financeToggleDetailed(checked) {
  const f = financeEnsure();
  try {
    if (checked && !f.useDetailedFlows && !f.flows.length) {
      if (!confirm(L('Convert the annual inputs and cash-flow events into dated itemized records? Original fields/events remain in the backup but will not be counted twice.',
        '연간 입력과 수입·지출 이벤트를 날짜별 상세 항목으로 옮길까요? 원래 입력과 이벤트는 보존하되 중복 계산하지 않습니다.'))) return;
      const state = NWFinanceState.convertLegacy(captureState());
      W.state.finance = state.finance;
    } else {
      if (!checked && f.flows.length && !confirm(L('Switch back to legacy annual totals? Itemized records remain saved but will not be used.',
        '이전 연간 합계 방식으로 바꿀까요? 상세 항목은 보존하되 계산에는 사용하지 않습니다.'))) return;
      f.useDetailedFlows = checked;
    }
    renderAll();
    renderFinanceForm();
  } catch (error) { document.getElementById('financeFormError').textContent = error.message; }
}
function addFinanceRecord(group, kind = null) {
  if (group === 'flows' && !financeEnsure().useDetailedFlows) {
    financeToggleDetailed(true);
    if (!financeEnsure().useDetailedFlows) return;
  }
  const record = NWFinanceState.newRecord(group);
  if (kind) record.kind = kind;
  record.name = L('New ', '새 ') + (kind || group);
  financeEnsure()[group].push(record);
  renderFinanceForm();
  const element = document.getElementById('finance-record-' + record.id);
  if (element) { element.open = true; element.scrollIntoView({ block: 'nearest' }); }
  renderAll();
}
function removeFinanceRecord(group, index) {
  const f = financeEnsure(), item = f[group][index];
  if (!confirm(L('Remove this record? Input changes are not an undo history; download a backup first if needed.',
    '이 항목을 삭제할까요? 필요하면 먼저 백업을 다운로드하세요.'))) return;
  if (group === 'scenarios') {
    const referenced = [...f.flows, ...f.rsu, ...f.espp, ...f.homes, ...f.dbBenefits, ...f.allocations, ...f.comparisons].some(x => x.scenarioId === item.id || x.endOnScenario === item.id) ||
      events.some(e => e.scenarioId === item.id) || Object.values(f.accounts).some(x => x.endOnScenario === item.id);
    if (referenced) { item.enabled = false; renderFinanceForm(); renderAll(); return; }
  }
  if (group === 'flows') {
    for (const comparison of f.comparisons) if (comparison.sourceFlowId === item.id) { comparison.sourceFlowId = ''; comparison.enabled = false; }
    for (const benefit of f.dbBenefits) if (benefit.replacesFlowId === item.id) benefit.replacesFlowId = '';
    for (const flow of f.flows) {
      if (flow.includedInFlowId === item.id) flow.includedInFlowId = '';
      if (flow.tcParentId === item.id) flow.tcParentId = '';
    }
    for (const grant of f.rsu) if (grant.tcParentId === item.id) grant.tcParentId = '';
    for (const plan of f.espp) if (plan.payrollSourceId === item.id) {
      plan.enabled = false; plan.payrollSourceId = ''; plan.netPayAlreadyDeducted = false;
    }
    for (const home of f.homes) if (home.replaceRentFlowId === item.id) { home.enabled = false; home.replaceRentFlowId = ''; }
  }
  for (const plan of f.planningItems) if (plan.referenceGroup === group && plan.referenceId === item.id) {
    plan.referenceId = ''; plan.reviewConfirmed = false;
  }
  f[group].splice(index, 1); renderFinanceForm(); renderAll();
}
function renderFinanceForm() {
  const modal = document.getElementById('financeForm');
  if (!modal) return;
  const previouslyOpen = new Set([...modal.querySelectorAll('details[open][id]')].map(x => x.id));
  modal.replaceChildren();
  const title = document.createElement('h2'); title.className = 'import-modal-title'; title.id = 'financeModal-title';
  title.textContent = L('Finance model settings', '재무 모델 설정');
  modal.appendChild(title);
  const intro = document.createElement('p');
  intro.textContent = L('Effective-rate estimates, not statutory tax advice. Blank means unknown, not confirmed zero. Income, transfers and stock compensation settle once. Date ends are exclusive.',
    '유효세율에 따른 추정 모델입니다. 빈칸은 확인된 0이 아니라 미입력입니다. 소득·자금이동·주식 보상은 한 번만 정산하며 종료 날짜는 제외합니다.');
  modal.appendChild(intro);
  const error = document.createElement('p'); error.id = 'financeFormError'; error.setAttribute('role', 'alert'); modal.appendChild(error);
  const close = document.createElement('button'); close.type = 'button'; close.textContent = L('Apply and close', '적용 후 닫기');
  close.addEventListener('click', () => {
    try { captureState(); renderAll(); flushStateSave(); closeFinanceSettings(); }
    catch (e) { error.textContent = L('Check inputs: ', '입력을 확인하세요: ') + e.message; }
  });
  modal.appendChild(close);
  const mode = document.createElement('label'); mode.className = 'finance-mode';
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!financeEnsure().useDetailedFlows;
  checkbox.addEventListener('change', () => financeToggleDetailed(checkbox.checked));
  mode.append(checkbox, document.createTextNode(L('Use dated itemized income/expense records instead of annual fields and legacy cash-flow events',
    '연간 입력·기존 수입/지출 이벤트 대신 날짜별 상세 항목 사용')));
  modal.appendChild(mode);
  for (const c of ['USD', 'KRW']) {
    const { body } = financeSection(modal, `${c} ${L('cash and bank deposits', '현금·예금')}`, true);
    const specs = {
      ratePct: { type: 'number', label: 'Bank annual yield % / 예금 연 이율', min: -99.99, max: 1000 },
      interestTaxPct: { type: 'number', label: 'Effective interest tax % / 이자 유효세율', max: 99.99 },
      confirmed: { type: 'boolean', label: 'Cash assumptions reviewed / 현금 가정 확인' },
    };
    for (const [key, spec] of Object.entries(specs)) financeField(['cash', c, key], spec, body);
    const reserve = financeSection(modal, `${c} ${L('protected cash targets', '보호 현금 목표')}`, true);
    for (const [key, spec] of Object.entries(NWFinanceState.reserveSchema)) financeField(['cashReserves', c, key], spec, reserve.body);
    const note = document.createElement('p');
    note.textContent = L('Enter 0 explicitly only if no reserve is required. Targets are manual cash earmarks, not new assets or automatic forecasts of future bills. Required spending may still use this cash.',
      '보호할 금액이 없을 때만 0을 직접 입력하세요. 수동 현금 적립 목표이며 새 자산이나 향후 지출의 자동 추정이 아닙니다. 필수 지출에는 이 현금을 사용할 수 있습니다.');
    reserve.body.appendChild(note);
  }
  for (const a of accounts) {
    const { details, body } = financeSection(modal, `${a.name || getAccTypeLabel(a.type)} · ${a.currency}`);
    details.id = 'finance-account-' + a.id;
    details.open = previouslyOpen.has(details.id);
    for (const [key, spec] of Object.entries(NWFinanceState.accountSchema)) if (key !== 'model') {
      financeField(['accounts', String(a.id), key], spec, body);
    }
  }
  const settingSchemas = {
    retirement: {
      spendingMode: { type: 'select', choices: ['target', 'path'], label: 'Retirement spending mode / 은퇴 지출 방식' },
      targetBasis: { type: 'select', choices: ['today', 'retirement'], label: 'Monthly target purchasing-power date / 목표 구매력 기준' },
      pensionStartAge: { type: 'number', max: 100, label: 'Government pension start age / 공적 연금 개시 나이' },
      pensionConfirmed: { type: 'boolean', label: 'Pension amount/timing reviewed / 연금 가정 확인' },
      partialFiFrom: { type: 'number', max: 100, label: 'Partial FI goal age from / 부분 FI 시작 나이' },
      partialFiTo: { type: 'number', max: 100, label: 'Partial FI goal age to / 부분 FI 종료 나이' },
      coveragePct: { type: 'number', max: 100, label: 'Partial FI living-cost coverage goal % / 생활비 충당 목표' },
      maintainedIncomeUSD: { type: 'number', label: 'Maintained annual net work income (USD) / 유지할 연 세후 근로·사업 소득 USD' },
    },
    model: {
      includeTentative: { type: 'boolean', label: 'Include estimated scenarios / 잠정 시나리오 포함' },
      seed: { type: 'text', label: 'Monte Carlo seed / 재현 시드' },
      runs: { type: 'number', max: 2000, label: 'Monte Carlo paths (1–2000) / 경로 수' },
    },
    household: {
      includePartner: { type: 'boolean', label: 'Include partner accounts/flows / 파트너 합산' },
      partnerStatus: { type: 'select', choices: ['not_entered', 'entered'], label: 'Partner inputs / 파트너 입력 상태' },
      childrenStatus: { type: 'select', choices: ['not_entered', 'excluded', 'scenario'], label: 'Children scenario / 자녀 시나리오' },
      parentsStatus: { type: 'select', choices: ['not_entered', 'entered', 'included_in_other'], label: 'Parents support / 부모님 지원' },
      petStatus: { type: 'select', choices: ['not_entered', 'entered', 'included_in_other'], label: 'Pet budget / 반려견 예산' },
      travelStatus: { type: 'select', choices: ['not_entered', 'entered', 'included_in_other'], label: 'Travel budget / 여행 예산' },
    },
    benefits: {
      nationalPensionStatus: { type: 'select', choices: ['not_entered', 'enrolled', 'not_enrolled'], label: 'National pension membership / 국민연금 가입' },
      severanceStatus: { type: 'select', choices: ['not_entered', 'dc', 'db', 'other'], label: 'Severance arrangement / 퇴직급여 제도' },
    },
  };
  for (const [group, schema] of Object.entries(settingSchemas)) {
    const { body } = financeSection(modal, group.replaceAll('_', ' '));
    for (const [key, spec] of Object.entries(schema)) financeField([group, key], spec, body);
  }
  for (const [group, schema] of Object.entries(NWFinanceState.schemas)) {
    const groupName = ({ dbBenefits: L('DB / severance benefits', 'DB형·일시금 퇴직급여'),
      allocations: L('Automatic surplus investing', '신규 잉여자금 자동 투자'),
      planningItems: L('Plan input review', '인생계획 입력 검토'),
      comparisons: L('Replacement revenue comparisons', '매출 대체 비교') })[group] || group;
    const { details, body } = financeSection(modal, `${groupName} · ${financeEnsure()[group].length}`);
    details.id = 'finance-group-' + group;
    details.open = previouslyOpen.has(details.id);
    body.classList.add('finance-records');
    if (group === 'allocations' || group === 'planningItems' || group === 'comparisons') {
      const help = document.createElement('p'); help.id = 'finance-' + group + '-help';
      help.textContent = ({
        allocations: L(
          'Simulation only, not brokerage orders. At month end invest the chosen share of the smaller of new net surplus and source cash above both reserve targets. Existing cash, refunds and asset withdrawals are not new earnings. Expenses, ESPP and existing savings come first. Months with account withdrawals or funding gaps do not auto-invest. Dates govern settlement dates; ends are exclusive. Blank start uses projection start. Missing required inputs pause investing. Enabled periods cannot overlap within a source currency.',
          '투자 주문이 아닌 시뮬레이션입니다. 월말 신규 순잉여와 두 보호 목표를 초과한 출금 통화 현금 중 작은 금액에 지정 비율을 적용합니다. 기존 현금·반환금·자산 인출은 신규 소득이 아닙니다. 지출·ESPP·기존 납입을 먼저 처리하고 계좌 인출·자금 부족 발생 월에는 자동 투자하지 않습니다. 날짜는 정산일 기준이며 종료일은 제외합니다. 시작일 빈칸은 예측 시작일입니다. 필수 입력 빈칸은 계산 보류이며 통화별 활성 기간은 겹칠 수 없습니다.'),
        planningItems: L('Planning amounts are notes, not additional cash flows. Recorded, input-ready and included in the base are distinct states.',
          '계획 금액은 메모이며 현금흐름에 더하지 않습니다. 기록 존재·필수 입력 완료·기준 계산 포함을 각각 구분합니다.'),
        comparisons: L('After entering a start date, costs and tax, run manually. A separate calculation replaces one business flow; it never adds revenue to the base.',
          '시작일·사업비·세율 입력 후 수동 실행합니다. 별도 계산에서 기존 사업 흐름 하나를 대체하며 기준 예측에 매출을 더하지 않습니다.'),
      })[group];
      body.appendChild(help);
    }
    if (group === 'dbBenefits') {
      const help = document.createElement('p'); help.id = 'finance-db-help';
      help.textContent = L(
        'Enter a manual expected total, not a salary/tenure statutory formula. Future benefits are not opening wealth. Enable only after reviewing the date and amount. Confirm a new benefit is separate from existing DC/assets; otherwise select an existing-asset transfer. Gross new benefits use the payment tax; net amounts are not taxed again. Existing cash distributions use the source account tax/access age. Retirement-to-retirement transfers are modeled as untaxed principal transfers with carried basis, not new income; confirm legal eligibility separately. Link any old one-time payout to replace it, or remove its duplicate manually.',
        '급여·근속연수 법정 산식이 아닌 수동 예상 총액입니다. 미래 퇴직급여는 현재 자산에 포함하지 않습니다. 지급일·금액 확인 후 사용을 켜세요. 신규 급여는 기존 DC·자산과 별도 권리임을 확인하고, 이미 보유한 금액은 자산 이동을 선택하세요. 신규 세전액에는 지급 유효세율을 적용하며 세후액에는 재과세하지 않습니다. 기존 자산의 현금 인출에는 출처 계좌의 세율·인출 가능 나이를 적용합니다. 연금계좌 간에는 입력액을 원금으로 비과세·취득원가 승계 이체하며 신규 소득이 아닙니다. 실제 이체 적격성은 별도 확인하세요. 기존 일회성 지급 항목은 교체 대상으로 연결하거나 중복 항목을 직접 삭제하세요.');
      body.appendChild(help);
    }
    const add = document.createElement('button'); add.type = 'button'; add.textContent = L('Add ', '추가: ') + groupName;
    add.addEventListener('click', () => addFinanceRecord(group));
    body.appendChild(add);
    financeEnsure()[group].forEach((record, index) => {
      const recordSection = financeSection(body, record.name || L('Unnamed record', '이름 없는 항목'));
      recordSection.details.id = 'finance-record-' + record.id;
      recordSection.details.open = previouslyOpen.has(recordSection.details.id);
      const info = document.createElement('small'); info.className = 'finance-reference'; info.textContent = `ID: ${record.id}`; recordSection.body.appendChild(info);
      for (const [key, spec] of Object.entries(schema)) {
        if (group === 'scenarios' && key === 'scenarioId') continue;
        financeField([group, index, key], spec, recordSection.body);
      }
      if (group === 'allocations') {
        const status = document.createElement('p'); status.className = 'finance-allocation-status';
        status.dataset.ruleId = record.id; status.setAttribute('aria-live', 'polite');
        recordSection.body.appendChild(status);
      }
      if (group === 'comparisons') {
        const run = document.createElement('button'); run.type = 'button'; run.textContent = L('Run replacement comparison', '매출 대체 비교 실행');
        const output = document.createElement('p'); output.className = 'finance-comparison-result'; output.setAttribute('aria-live', 'polite');
        run.addEventListener('click', () => {
          try {
            const state = captureState(), comparison = state.finance.comparisons[index];
            const result = NWFinanceEngine.compareFlow(state, comparison.id);
            if (!result.ready) { output.textContent = L('Required inputs: ', '필수 입력: ') + result.missing.join(', '); return; }
            const original = NWFinanceEngine.simulate(state).rows.find(x => x.age === Number(state.inputs.retireAge));
            const retirement = result.result.rows.find(x => x.age === Number(state.inputs.retireAge));
            output.textContent = L('Separate provisional comparison — retirement net worth: ', '별도 잠정 비교 — 은퇴 시 순자산: ') +
              fmt(retirement.netWorth) + L(' · change vs base: ', ' · 기준 대비: ') + fmt(retirement.netWorth - original.netWorth);
          } catch (_) { output.textContent = L('Check comparison settings.', '비교 설정을 확인하세요.'); }
        });
        recordSection.body.append(run, output);
      }
      if (['rsu', 'espp'].includes(group)) {
        const listKey = group === 'rsu' ? 'schedule' : 'purchases';
        const schedule = document.createElement('div'); schedule.className = 'finance-schedule';
        const addDate = document.createElement('button'); addDate.type = 'button'; addDate.textContent = L('Add actual schedule entry', '실제 일정 추가');
        addDate.addEventListener('click', () => {
          record = financeEnsure()[group][index];
          record[listKey].push({ date: NWCore.today(), amount: null, shares: null, price: null, offeringPrice: null, marketPrice: null });
          renderFinanceForm();
        });
        schedule.appendChild(addDate);
        record[listKey].forEach((entry, entryIndex) => {
          const grid = document.createElement('div'); grid.className = 'finance-grid finance-schedule-entry';
          const fields = group === 'rsu' ? ['date', 'amount', 'shares', 'price'] : ['date', 'offeringPrice', 'marketPrice'];
          for (const key of fields) financeField([group, index, listKey, entryIndex, key],
            { type: key === 'date' ? 'date' : 'number', label: key, max: 1e15 }, grid);
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = L('Remove date', '일정 삭제');
          remove.addEventListener('click', () => { financeEnsure()[group][index][listKey].splice(entryIndex, 1); renderFinanceForm(); renderAll(); });
          grid.appendChild(remove); schedule.appendChild(grid);
        });
        recordSection.body.appendChild(schedule);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = L('Remove / disable linked scenario', '삭제 / 연결된 시나리오 비활성화');
      remove.addEventListener('click', () => removeFinanceRecord(group, index));
      recordSection.body.appendChild(remove);
    });
  }
  financeRefreshStatuses();
  enhanceAccessibility(modal);
}
function openFinanceSettings(accountId = null) {
  if (document.getElementById('financeModal')) return;
  financeEnsure();
  const overlay = document.createElement('div'); overlay.id = 'financeModal'; overlay.className = 'import-modal-overlay';
  const form = document.createElement('div'); form.id = 'financeForm'; form.className = 'import-modal finance-modal';
  overlay.appendChild(form); document.body.appendChild(overlay);
  renderFinanceForm();
  setupDialog(overlay, closeFinanceSettings);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeFinanceSettings(); });
  if (accountId != null) {
    const section = document.getElementById('finance-account-' + accountId);
    if (section) { section.open = true; section.scrollIntoView({ block: 'nearest' }); }
  }
  form.querySelector('button')?.focus({ preventScroll: true });
}
function closeFinanceSettings() { releaseDialog('financeModal'); document.getElementById('financeModal')?.remove(); }
function setupFinanceBaseFields() {
  const field = document.createElement('div'); field.className = 'field';
  const label = document.createElement('label'); label.textContent = L('Refundable rental deposit asset (not cash)', '반환받을 임대보증금 자산 (현금 아님)');
  const wrapper = document.createElement('div'); wrapper.className = 'iw';
  const input = document.createElement('input'); input.type = 'text'; input.id = 'rentalDepositAsset'; input.value = ''; input.placeholder = '0';
  const suffix = document.createElement('span'); suffix.className = 'sfx'; suffix.textContent = 'USD';
  wrapper.append(input, suffix); field.append(label, wrapper);
  document.querySelector('#panel-basic .section').appendChild(field);
}
async function importPrivateFinanceFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('file-size');
    importWorkspace(JSON.parse(await file.text()));
  } catch (_) { setNotice(L('Could not load private profile. Current inputs were not replaced.', '개인 프로필을 읽지 못했습니다. 현재 입력은 교체되지 않았습니다.')); }
  input.value = '';
}
function setupFinanceControls() {
  if (document.getElementById('openFinanceSettings')) return;
  const bar = document.getElementById('workspaceBar');
  const controls = document.createElement('div'); controls.className = 'finance-actions';
  const button = document.createElement('button'); button.id = 'openFinanceSettings'; button.type = 'button';
  button.textContent = L('Finance model settings', '재무 모델 설정');
  button.addEventListener('click', () => openFinanceSettings());
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.json'; file.id = 'privateFinanceFile'; file.hidden = true;
  file.addEventListener('change', () => importPrivateFinanceFile(file));
  const load = document.createElement('button'); load.type = 'button'; load.textContent = L('Load private JSON profile', '개인 JSON 프로필 불러오기');
  load.addEventListener('click', () => file.click());
  controls.append(button, load, file); bar.appendChild(controls);
  const modelInfo = document.createElement('p'); modelInfo.className = 'finance-model-description';
  modelInfo.textContent = L('Base: fixed account returns. Monte Carlo: all market accounts, shared shocks within a group. Cash yield is separate; FX remains fixed. Unknown assumptions make results provisional.',
    'Base는 고정 계좌 수익률, Monte Carlo는 모든 시장 투자계좌에 그룹별 공통 충격을 적용합니다. 예금 이율과 환율 가정은 별도이며 미확인 가정이 있으면 결과는 잠정입니다.');
  controls.appendChild(modelInfo);
}
function enhanceFinanceCards() {
  financeEnsure();
  for (const a of accounts) {
    const card = document.getElementById('ac-' + a.id);
    if (!card || card.querySelector('.finance-account-button')) continue;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'finance-account-button';
    button.textContent = L('Tax / return / employer settings', '세금·수익·회사 납입 설정');
    button.addEventListener('click', () => openFinanceSettings(a.id));
    card.querySelector('.acc-body')?.prepend(button);
  }
  const detailed = !!W.state.finance.useDetailedFlows;
  for (const key of ['annualIncome', 'annualExpense']) {
    document.getElementById(key).closest('.field').classList.toggle('finance-legacy-inactive', detailed);
  }
  const info = document.getElementById('detailedFlowNotice') || document.createElement('p');
  info.id = 'detailedFlowNotice'; info.className = 'event-timing-help';
  info.textContent = detailed ? L('Income/expense calculations use Finance model settings. The annual fields and old cash-flow events are preserved but not counted again.',
    '수입·지출은 재무 모델 설정의 상세 항목을 사용합니다. 연간 입력과 이전 수입·지출 이벤트는 보존하되 다시 합산하지 않습니다.') : '';
  if (!info.isConnected) document.getElementById('annualIncome').closest('.section').prepend(info);
  document.querySelectorAll('#eventList .ev-card').forEach(card => {
    const event = events.find(e => card.id === 'ev-' + e.id);
    const archived = detailed && event && ['income', 'expense', 'income-add', 'expense-add'].includes(event.type);
    card.classList.toggle('finance-archived-event', !!archived);
    card.querySelectorAll('input, select').forEach(el => { el.disabled = !!archived; });
  });
}
