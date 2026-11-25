/* Calendar-date UI for the dated ledger and annual report buckets. */
function eventScheduleState() {
  return { projectionStartDate: W.state.projectionStartDate, inputs: { currentAge: pN('currentAge') } };
}
function renderProjectionPeriodNote(row) {
  const el = document.getElementById('projectionPeriodNote');
  if (!el || !row) return;
  el.textContent = `${row.periodStart} – ${row.periodEnd} · ${row.periodDays}/${row.yearDays}${L(' days', '일')}. ` +
    L('The first table row uses this period; inputs and annual summaries remain annual rates.',
      '첫 테이블 행은 이 기간만 계산합니다. 입력 금액과 연간 요약은 연간 기준입니다.');
}
function formatEventDate(value) {
  try {
    NWCore.date(value);
    return new Intl.DateTimeFormat(LOCALE === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    }).format(new Date(value + 'T00:00:00Z'));
  } catch (_) { return L('Choose a date', '날짜를 선택하세요'); }
}
function yearAgeLabel(row) {
  const year = row.year ?? NWCore.yearAtAge(row.age, eventScheduleState());
  const partial = row.yearFraction != null && row.yearFraction < 1
    ? ` · ${row.periodDays}/${row.yearDays}${L('d', '일')}` : '';
  return `${year} · ${row.age}${t('ageSfx')}${partial}`;
}
function eventWhenLabel(event) {
  if (event.date) return formatEventDate(event.date);
  if (event.age == null) return L('Choose a date', '날짜를 선택하세요');
  try {
    return `≈ ${NWCore.yearAtAge(event.age, eventScheduleState())} · ${event.age}${t('ageSfx')}`;
  } catch (_) { return `${event.age}${t('ageSfx')}`; }
}
function eventDateEditor(event) {
  const legacy = !event.date && event.age != null
    ? `<p class="event-legacy-note">${L('Previously scheduled by age', '기존 나이 기준 일정')}: ${event.age}${t('ageSfx')}. ${L('Choose a date to replace this timing; the year above is approximate.', '날짜를 선택하면 기존 나이 기준 일정을 변경합니다. 위 연도는 추정치입니다.')}</p>` : '';
  return `<div class="field"><label for="event-date-${event.id}">${L('Event date', '이벤트 날짜')}</label>
    <input class="acc-num event-date" id="event-date-${event.id}" type="date" min="1900-01-01" max="9999-12-31"
      value="${escapeHTML(event.date || '')}" onchange="updateEvent(${event.id},'date',this.value)">${legacy}</div>`;
}
function eventEndDateEditor(event) {
  const legacy = !event.endDate && event.endAge
    ? `<p class="event-legacy-note">${L('Existing end age', '기존 종료 나이')}: ${event.endAge}${t('ageSfx')}.
      ${L('Kept until you choose an end date or clear it.', '종료 날짜를 지정하거나 해제하기 전까지 유지됩니다.')}</p>` : '';
  return `<div class="field"><label for="event-end-date-${event.id}">${L('End date (optional, exclusive)', '종료 날짜 (선택, 해당 날짜 제외)')}</label>
    <input class="acc-num event-date" id="event-end-date-${event.id}" type="date" min="1900-01-01" max="9999-12-31"
      value="${escapeHTML(event.endDate || '')}" onchange="updateEvent(${event.id},'endDate',this.value)">${legacy}
    <button type="button" class="event-clear-end" onclick="updateEvent(${event.id},'endDate','')">${L('No end date', '종료 날짜 없음')}</button></div>`;
}
function focusLifeEvent(id) {
  mTab('events');
  const card = document.getElementById('ev-' + id);
  if (!card) return;
  card.classList.add('open');
  card.querySelector('.ev-head')?.setAttribute('aria-expanded', 'true');
  card.scrollIntoView({ block: 'center', behavior: 'auto' });
  (card.querySelector('.event-date') || card.querySelector('input, select'))?.focus({ preventScroll: true });
}
function renderEventTimeline() {
  const list = document.getElementById('eventTimeline');
  if (!list) return;
  list.replaceChildren();
  const state = eventScheduleState();
  try {
    NWCore.date(state.projectionStartDate);
    const source = typeof financeTimelineItems === 'function' ? financeTimelineItems() : events;
    const sorted = [...source].sort((a, b) => NWCore.eventSortKey(a, state).localeCompare(NWCore.eventSortKey(b, state)) ||
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    for (const event of sorted) {
      let status = '';
      const age = NWCore.eventAge(event, state);
      if (event.enabled === false) status = L('Disabled scenario / record', '비활성 시나리오·항목');
      else if (event.status === 'unknown') status = L('Unconfirmed · not forecast', '미확인 · 예측 제외');
      else if (age < Number(state.inputs.currentAge)) status = L('Before projection · not reapplied', '예측 시작 이전 · 계산에 재반영하지 않음');
      else if (age > 100) status = L('Beyond projection horizon', '예측 기간 이후');
      else if (!event.date) status = L('Age-based · exact date not set', '나이 기준 · 정확한 날짜 미지정');
      else status = event.date < NWCore.today() ? L('Past', '지난 일정') : event.date === NWCore.today() ? L('Today', '오늘') : L('Upcoming', '예정');
      const item = document.createElement('li');
      item.className = 'event-timeline-item';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-timeline-button';
      button.addEventListener('click', () => {
        if (!event.financeRef) { focusLifeEvent(event.id); return; }
        openFinanceSettings();
        const section = document.getElementById('finance-record-' + event.financeRef);
        if (section) { section.open = true; section.scrollIntoView({ block: 'nearest' }); section.querySelector('input, select')?.focus(); }
      });
      const when = document.createElement(event.date ? 'time' : 'span');
      if (event.date) when.dateTime = event.date;
      when.className = 'event-timeline-date';
      when.textContent = eventWhenLabel(event);
      const name = document.createElement('span');
      name.className = 'event-timeline-name';
      name.textContent = event.name || t('ev.noName');
      const detail = document.createElement('span');
      detail.className = 'event-timeline-detail';
      const kind = {
        income: 'ev.income', 'income-add': 'ev.incomeAdd', expense: 'ev.expense',
        'expense-add': 'ev.expenseAdd', 'lumpsum-in': 'ev.lumpIn', 'lumpsum-out': 'ev.lumpOut',
      }[event.type];
      let amount = '—';
      try { if (event.value != null && event.value !== '') amount = nativeMoney(NWCore.number(event.value), event.currency); } catch (_) {}
      detail.textContent = `${t(kind || 'ev.noName')} · ${amount} · ${status}` +
        (event.endDate ? ` · ${L('Until', '종료')} ${formatEventDate(event.endDate)}` : '');
      button.append(when, name, detail);
      item.appendChild(button);
      list.appendChild(item);
    }
  } catch (_) {
    const item = document.createElement('li');
    item.textContent = L('Check event dates and the projection start date to view the timeline.', '타임라인을 보려면 이벤트 날짜와 예측 시작 날짜를 확인하세요.');
    list.appendChild(item);
  }
  list.hidden = list.childElementCount === 0;
}
function setupEventDates() {
  const field = document.createElement('div');
  field.className = 'field projection-start';
  const label = document.createElement('label');
  label.htmlFor = 'projectionStartDate';
  label.textContent = L('Projection start date', '예측 시작 날짜');
  const input = document.createElement('input');
  input.type = 'date';
  input.id = 'projectionStartDate';
  input.min = '1900-01-01';
  input.max = '9900-12-31';
  input.addEventListener('change', () => {
    W.state.projectionStartDate = input.value;
    renderEventList();
    renderAll();
  });
  field.append(label, input);
  const periodNote = document.createElement('p');
  periodNote.id = 'projectionPeriodNote';
  periodNote.className = 'event-timing-help';
  field.appendChild(periodNote);
  document.querySelector('#panel-basic .section').appendChild(field);
  const intro = document.createElement('p');
  intro.className = 'event-timing-help';
  intro.textContent = L('Choose exact dates and follow your events below. The dated ledger is summarized by calendar year.', '날짜를 선택하고 아래 타임라인에서 일정을 확인하세요. 날짜별 계산 결과를 연도별로 요약합니다.');
  const details = document.createElement('details');
  details.className = 'event-date-details';
  const summary = document.createElement('summary');
  summary.textContent = L('How dates affect the forecast', '날짜를 예측에 반영하는 방식');
  const note = document.createElement('p');
  note.className = 'event-timing-help';
  note.textContent = L(
    'The first row covers the remaining calendar year; later rows cover full calendar years. In every year, recurring flows use their actual active dates: monthly amounts use month overlap, annual rates use actual year days. Accrued flows settle at month end unless a payment day is entered. Lump sums settle in full on their date, and returns compound over elapsed time. End dates are exclusive. Events before projection start are not replayed.',
    '첫 행은 해당 연도 남은 기간, 이후 행은 전체 연도를 표시합니다. 모든 연도에서 반복 흐름의 실제 시작·종료일을 반영하며 월 금액은 월별 겹치는 기간, 연 금액은 해당 연도 실제 일수로 계산합니다. 지급일을 지정하지 않은 누적 수입·지출은 월말에 정산합니다. 목돈은 지정 날짜에 전액 반영하고 수익률은 경과 기간만 복리 적용합니다. 종료 날짜는 제외하며 예측 시작 이전 이벤트는 재반영하지 않습니다.');
  const timeline = document.createElement('ol');
  timeline.id = 'eventTimeline';
  timeline.className = 'event-timeline';
  timeline.setAttribute('aria-label', L('Life event timeline', '인생 이벤트 타임라인'));
  details.append(summary, note);
  document.getElementById('eventList').before(intro, details, timeline);
}
