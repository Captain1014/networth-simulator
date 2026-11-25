async function runEventDateTests({ assert, equal, near, throws }) {
  const portion = (from, to) => (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) /
    (Date.UTC(Number(from.slice(0, 4)) + 1, 0, 1) - Date.UTC(Number(from.slice(0, 4)), 0, 1));
  const base = NWCore.emptyState();
  base.projectionStartDate = '2030-07-01';
  Object.assign(base.inputs, { currentAge: '30', retireAge: '55', returnRate: '0', inflation: '0', wageGrowthRate: '0' });
  base.money.investAsset.USD = '1000';
  function event(id, type, date, value, extra = {}) {
    return { id, type, date, value: String(value), currency: 'USD', name: `Event ${id}`, ...extra };
  }
  function load(items, extra = {}) {
    applyWorkspaceState({ ...structuredClone(base), events: items, ...extra });
    renderAll();
    return simulate();
  }
  equal(NWCore.date('2032-02-29'), '2032-02-29', 'Leap date accepted');
  throws(() => NWCore.date('2031-02-29'), 'Invalid leap date rejected');
  throws(() => NWCore.date('2030-04-31'), 'Impossible calendar day rejected');
  equal(NWCore.shiftYears('2032-02-29', 1), '2033-02-28', 'Leap-day default date clamps correctly');
  const oldProfile = structuredClone(base);
  delete oldProfile.projectionStartDate;
  equal(NWCore.validate(oldProfile).projectionStartDate, NWCore.today(), 'Old profiles receive a projection date without another migration prompt');
  let rows = load([
    event(2, 'lumpsum-out', '2032-03-04', 50),
    event(1, 'lumpsum-in', '2031-05-20', 100),
  ]);
  near(rows[0].invest, 1000, 'Dated event does not apply a year early');
  near(rows[1].invest, 1100, 'Dated income applies in its calendar year');
  near(rows[2].invest, 1050, 'Dated expense applies in its calendar year');
  equal(rows[1].year, 2031, 'Simulation rows carry calendar years');
  assert(chartInst.data.labels[0].startsWith('2030'), 'Graph labels include calendar year');
  assert(document.querySelector('#tblBody tr td').textContent.startsWith('2030'), 'Table rows include calendar year');
  assert(document.querySelectorAll('#tblBody tr')[1].textContent.includes(formatEventDate('2031-05-20')), 'Exact event date appears in yearly table');
  equal([...document.querySelectorAll('#eventTimeline time')].map(el => el.dateTime), ['2031-05-20', '2032-03-04'], 'Timeline is chronological regardless of insertion order');
  assert(document.getElementById('event-date-1').type === 'date', 'Event editor uses calendar date input');
  assert(!document.querySelector('#eventList input[type="number"]'), 'Event editor does not ask for age');
  document.querySelector('#eventTimeline button').click();
  assert(document.getElementById('ev-1').classList.contains('open'), 'Timeline item opens its event editor');
  equal(document.getElementById('projectionStartDate').value, '2030-07-01', 'Projection start date is visible');
  assert(formatEventDate('2031-01-01').includes('2031'), 'Date formatting does not shift January 1 into prior year');
  assert(buildYearlyTableText(rows, false).includes('2031-05-20'), 'Clipboard table includes exact dates');
  updateEvent(1, 'date', '2033-08-09');
  equal([...document.querySelectorAll('#eventTimeline time')].map(el => el.dateTime), ['2032-03-04', '2033-08-09'], 'Changing date reorders timeline');
  equal(simulate()[3].year, 2033, 'Edited date maps to the new calendar year');
  rows = load([
    event(1, 'income', '2031-10-01', 200),
    event(2, 'income', '2031-02-01', 100),
  ]);
  near(rows[1].income, 100 * portion('2031-02-01', '2031-10-01') + 200 * portion('2031-10-01', '2032-01-01'),
    'Same-year income replacements use the actual interval at each rate');
  rows = load([event(1, 'income-add', '2031-06-01', 100, { endDate: '2033-01-01' })]);
  near(rows[1].income, 100 * portion('2031-06-01', '2032-01-01'), 'Recurring addition is prorated from its actual start date');
  near(rows[2].income, 100, 'Recurring addition continues through overlapping year');
  near(rows[3].income, 0, 'January 1 end excludes that calendar year');
  assert(document.getElementById('event-end-date-1').type === 'date', 'Recurring event uses an end-date picker');
  updateEvent(1, 'endDate', '2033-06-01');
  near(simulate()[3].income, 100 * portion('2033-01-01', '2033-06-01'), 'Midyear end includes only active days');
  near(simulate()[4].income, 0, 'Recurring addition stops after final overlapping year');
  rows = load([event(1, 'expense-add', '2031-06-01', 80, { endDate: '2031-12-01' })]);
  near(rows[1].expense, 80 * portion('2031-06-01', '2031-12-01'), 'Same-year recurring interval counts only active days');
  near(rows[2].expense, 0, 'Same-year recurring interval does not leak into next year');
  const sameDay = getStateForExport();
  sameDay.events[0].endDate = sameDay.events[0].date;
  throws(() => NWCore.validate(sameDay), 'End date must be strictly after start date');
  const badDate = getStateForExport();
  badDate.events[0].date = '2031-02-30';
  throws(() => NWCore.validate(badDate), 'Invalid imported event date is rejected');
  rows = load([
    event(1, 'lumpsum-in', '2030-06-30', 999),
    event(2, 'lumpsum-in', '2030-07-01', 100),
    event(3, 'lumpsum-in', '2110-01-01', 999),
  ]);
  near(rows[0].invest, 1100, 'History before projection start is not double counted');
  assert(rows.every(row => row.invest === 1100), 'Beyond-horizon event does not affect projection');
  assert(document.querySelectorAll('#eventTimeline li').length === 3, 'History and beyond-horizon events remain visible');
  rows = load([{ id: 1, type: 'income-add', age: 31, endAge: 33, value: '10', name: 'Legacy', currency: 'USD' }]);
  near(rows[1].income, 10, 'Legacy age-based event keeps original start timing');
  near(rows[3].income, 0, 'Legacy age-based event keeps original end timing');
  equal(document.getElementById('event-date-1').value, '', 'Legacy event does not invent an exact date');
  assert(document.querySelector('#eventTimeline').textContent.includes('2031'), 'Legacy timeline shows approximate calendar year');
  updateEvent(1, 'date', '2031-08-02');
  assert(events[0].age == null, 'Choosing a date explicitly replaces legacy age timing');
  equal(events[0].endAge, 33, 'Choosing a start date preserves old end-age timing');
  near(simulate()[3].income, 0, 'Preserved legacy end age still stops additions');
  updateEvent(1, 'endDate', '');
  assert(events[0].endAge == null, 'No-end-date action explicitly clears legacy end age');
  near(simulate()[3].income, 10, 'Explicitly clearing end timing makes addition ongoing');
  addEvent({ type: 'lumpsum-in' });
  const added = events[0];
  equal(added.date, '2035-07-01', 'New UI events use a real default date');
  assert(added.age == null, 'New UI events do not store invented ages');
  rows = load([event(1, 'lumpsum-in', '2031-01-01', 500, { drainAccountId: 1 })], {
    accounts: [{ id: 1, currency: 'USD', type: 'taxable', balance: '500', rate: '0', retireDrawAge: '' }],
  });
  near(rows[0].accSnapshot[0].balance, 500, 'Dated account-transfer event waits for its year');
  near(rows[1].accSnapshot[0].balance, 0, 'Dated account-transfer event drains account in correct year');
  flushStateSave();
  const original = localStorage.getItem(NWCore.KEY);
  updateEvent(1, 'date', '2031-02-30');
  flushStateSave();
  equal(localStorage.getItem(NWCore.KEY), original, 'Invalid date draft preserves last valid save');
  assert(document.getElementById('resultsRegion').hidden, 'Invalid date draft pauses results');
  updateEvent(1, 'date', '2031-01-01');
  assert(!document.getElementById('resultsRegion').hidden, 'Correcting date resumes results');
  const state = getStateForExport();
  const token = await encryptData('test-date-backup-only', await gzipCompressUtf8(JSON.stringify(state)));
  const restored = NWCore.validate(await backupCipherToState('test-date-backup-only', token));
  equal(restored.events, state.events, 'Encrypted backup preserves exact event dates and account links');
  equal(restored.projectionStartDate, '2030-07-01', 'Encrypted backup preserves projection calendar anchor');
  applyWorkspaceState(restored);
  renderAll();
  equal(document.getElementById('event-date-1').value, '2031-01-01', 'Restored event editor shows its original date');
  document.getElementById('projectionStartDate').value = '2031-07-01';
  document.getElementById('projectionStartDate').dispatchEvent(new Event('change', { bubbles: true }));
  equal(simulate()[0].year, 2031, 'Projection start control re-anchors calendar years');
  equal(events[0].date, '2031-01-01', 'Re-anchoring never changes the recorded event date');
  near(simulate()[0].accSnapshot[0].balance, 500, 'Event before new projection anchor is no longer replayed');
  flushStateSave();
  equal(JSON.parse(localStorage.getItem(NWCore.KEY)).projectionStartDate, '2031-07-01', 'Re-anchored projection date is saved');
}
