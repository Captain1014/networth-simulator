function runEventCurrencyTests({ assert, equal, near }) {
  // Deliberately synthetic amounts and dates; never use exported personal data here.
  const base = NWCore.emptyState();
  base.projectionStartDate = '2033-01-01';
  base.fx = { base: 'USD', quote: 'KRW', rate: 2000, date: NWCore.today(), fetchedAt: new Date().toISOString(), source: 'Frankfurter' };
  Object.assign(base.inputs, { currentAge: '40', retireAge: '70', returnRate: '0', inflation: '0', wageGrowthRate: '0' });
  base.money.investAsset.USD = '2000';
  base.money.annualIncome = { USD: '100', KRW: '200000' };
  base.money.annualExpense = { USD: '10', KRW: '40000' };
  const event = (id, type, currency, value, date = '2034-01-01') =>
    ({ id, type, currency, value: String(value), date, name: `Synthetic ${type} ${currency}` });
  function load(items, inputOverrides = {}) {
    const state = structuredClone(base);
    Object.assign(state.inputs, inputOverrides);
    state.events = items;
    applyWorkspaceState(state);
    renderAll();
    return simulate();
  }
  const changes = [
    event(1, 'income', 'USD', 600),
    event(2, 'income', 'KRW', 0),
    event(3, 'expense', 'USD', 90),
    event(4, 'expense', 'KRW', 0),
  ];
  let rows = load(changes);
  near(rows[0].income, 200, 'Initial mixed-currency income is summed once');
  near(rows[0].expense, 30, 'Initial mixed-currency expense is summed once');
  near(rows[1].income, 600, 'Zero KRW income does not erase new USD income');
  near(rows[1].expense, 90, 'Zero KRW expense does not erase new USD expense');
  near(rows[1].savings, 510, 'Same-day relocation events produce correct net savings');
  near(rows[2].income, 600, 'Currency-scoped income change persists in following years');
  const tableRow = document.querySelectorAll('#tblBody tr')[1];
  equal(tableRow.children[2].textContent, fmt(600), 'Yearly table shows corrected total income');
  equal(tableRow.children[3].textContent, fmt(90), 'Yearly table shows corrected total expense');
  assert(tableRow.children[1].textContent.includes(' '), 'Same-day event labels remain separated');
  assert(document.querySelector('#ev-1 .event-currency-scope').textContent.includes('USD'), 'Income event explains which currency it changes');
  rows = load(changes.map(item => ({ ...item, id: 5 - item.id })).reverse());
  near(rows[1].income, 600, 'Changing cross-currency event order does not change income');
  near(rows[1].expense, 90, 'Changing cross-currency event order does not change expense');
  rows = load([event(1, 'income', 'USD', 0), event(2, 'expense', 'USD', 0)]);
  near(rows[1].income, 100, 'Zero USD income preserves KRW income');
  near(rows[1].expense, 20, 'Zero USD expense preserves KRW expense');
  rows = load([event(1, 'income', 'KRW', 600000), event(2, 'expense', 'KRW', 100000)]);
  near(rows[1].income, 400, 'New KRW income is converted and added to unchanged USD stream');
  near(rows[1].expense, 60, 'New KRW expense is converted and added to unchanged USD stream');
  rows = load([event(1, 'income', 'KRW', 0), event(2, 'expense', 'KRW', 0)], { wageGrowthRate: '10', inflation: '10' });
  near(rows[1].income, 110, 'Unchanged USD stream retains wage growth after KRW replacement');
  near(rows[2].income, 121, 'Per-currency wage growth continues after replacement');
  near(rows[1].expense, 11, 'Unchanged USD expense retains inflation after KRW replacement');
  near(rows[2].expense, 12.1, 'Per-currency expense inflation continues after replacement');
  rows = load([event(1, 'income', 'USD', 300, '2034-02-01'), event(2, 'income', 'USD', 500, '2034-10-01')]);
  near(rows[1].income, 600, 'Latest same-currency replacement wins without clearing the other currency');
  rows = load([
    event(1, 'income-add', 'USD', 25), event(2, 'income', 'KRW', 0),
    event(3, 'expense-add', 'USD', 15), event(4, 'expense', 'KRW', 0),
  ]);
  near(rows[1].income, 125, 'Recurring additions remain independent of base-income changes');
  near(rows[1].expense, 25, 'Recurring expense additions survive base-expense changes');
  equal(getStateForExport().money.annualIncome, base.money.annualIncome, 'Simulation never rewrites entered native income amounts');
  equal(getStateForExport().money.annualExpense, base.money.annualExpense, 'Simulation never rewrites entered native expense amounts');
  setDisplayCurrency('KRW');
  equal(document.querySelectorAll('#tblBody tr')[1].children[2].textContent, fmt(125), 'KRW display uses the same corrected income result');
}
