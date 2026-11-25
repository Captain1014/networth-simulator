/* One dated ledger for Base, scenarios and Monte Carlo. All internal values are USD.
 * Original currencies/amounts remain immutable in the saved input snapshot. */
(() => {
  'use strict';
  const EPS = 1e-7;
  const T = () => NWFinanceTimeline;
  function rng(seed) {
    let s = 2166136261;
    for (const c of String(seed)) s = Math.imul(s ^ c.charCodeAt(0), 16777619);
    return () => {
      s += 0x6D2B79F5;
      let n = s;
      n = Math.imul(n ^ (n >>> 15), n | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(random) {
    const u = Math.max(1e-12, random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  }
  function emptyRow(year, age, period) {
    return {
      year, age, periodStart: period.startDate, periodEnd: period.lastDate,
      periodDays: period.days, yearDays: period.yearDays, yearFraction: period.fraction,
      income: 0, grossIncome: 0, netInputIncome: 0, grossTcTarget: 0, expense: 0, paidExpense: 0, taxes: 0,
      businessCosts: 0, grossSalary: 0, nonCashCompensation: 0, investmentIncome: 0,
      employeeContributions: 0, employerContributions: 0, esppDeductions: 0,
      debtPayments: 0, debtInterest: 0, transfers: 0, withdrawals: 0,
      shortfall: 0, skippedContributions: 0, dbBenefitCash: 0, dbBenefitTransfers: 0,
      autoInvested: 0, events: [], accSnapshot: [],
    };
  }
  function simulate(input, options = {}) {
    const m = input?.segments ? input : T().compile(input, options);
    const { state: s, f, start, retireDate, usd, money } = m;
    const warnings = new Set(m.warnings);
    const warn = message => warnings.add(message);
    const pct = v => (v ?? 0) / 100;
    const inf = pct(Number(s.inputs.inflation));
    const wage = pct(Number(s.inputs.wageGrowthRate));
    const scenarioDelta = options.scenario === 'opt' ? .02 : options.scenario === 'pes' ? -.02 : 0;
    const allocationRules = m.allocations.filter(x => !NWFinanceState.allocationIssues(s, x).length);
    const newCash = new Map(allocationRules.map(x => [x.id, 0]));
    const random = options.random || null;
    const cash = {};
    for (const c of ['USD', 'KRW']) {
      cash[c] = { model: 'cash', currency: c, balance: usd(s.money.investAsset[c], c),
        annualReturn: pct(f.cash[c].ratePct), interestTaxRate: pct(f.cash[c].interestTaxPct) };
      if (cash[c].balance > EPS && !f.cash[c].confirmed) warn(`Cash rate/tax unconfirmed; explicit cash assumptions used / 예금 가정 미확인: ${c}`);
      if (cash[c].balance > EPS && f.cash[c].interestTaxPct == null) warn(`Cash interest tax missing / 현금 이자 세율 미입력: ${c}`);
    }
    const accounts = s.accounts.filter(a => f.accounts[a.id].owner !== 'partner' || f.household.includePartner).map(a => {
      const cfg = f.accounts[a.id];
      const balance = usd(a.balance, a.currency);
      if (balance > EPS && !cfg.taxConfirmed) warn(`Account taxes unconfirmed / 계좌 세금 미확인: ${a.name || a.id}`);
      if (balance > EPS && cfg.model === 'brokerage' && (cfg.capitalGainsTaxPct == null || cfg.dividendTaxPct == null)) warn(`Brokerage effective tax input missing / 투자계좌 유효세율 미입력: ${a.name || a.id}`);
      if (balance > EPS && cfg.model === 'cash' && cfg.interestTaxPct == null) warn(`Account interest tax missing / 예금 이자세율 미입력: ${a.name || a.id}`);
      if (cfg.model === 'brokerage' && cfg.costBasis == null && balance > EPS) warn(`Basis unknown; opening balance assumed provisionally / 취득원가 미확인: ${a.name || a.id}`);
      if (!cfg.balanceConfirmed) warn(`Opening balance unconfirmed / 초기 잔액 미확인: ${a.name || a.id}`);
      if (!cfg.employerScheduleConfirmed && ((cfg.employerFixedAnnual ?? 0) > 0 ||
          Number(a.contribEmployer) > 0 || Number(a.contribEmployerRate) > 0 || a.employerMatchMode === 'match')) {
        warn(`Employer posting schedule assumed / 회사 납입 일정 가정: ${a.name || a.id}`);
      }
      return {
        ...a, cfg, balance, costBasis: cfg.costBasis == null ? balance : usd(cfg.costBasis, a.currency),
        deferredCompensation: 0, model: cfg.model, annualReturn: pct(Number(a.rate)),
        dividendYield: pct(cfg.dividendYieldPct), interestTaxRate: pct(cfg.interestTaxPct),
        dividendTaxRate: pct(cfg.dividendTaxPct), capitalGainsTaxRate: pct(cfg.capitalGainsTaxPct),
        effectiveTaxRate: pct(cfg.effectiveTaxPct ?? Number(a.withdrawTaxRate)),
        ordinaryTaxRate: 0, marketGroup: cfg.marketGroup || 'market',
        volatility: pct(cfg.volatilityPct ?? Number(s.inputs.returnVolatility)),
        annualSelf: usd(a.contribSelf, a.currency), annualEmployer: usd(a.contribEmployer, a.currency),
        periodWithdrawals: 0, periodTaxes: 0, yearSelfPaid: 0, yearIncomeBase: 0,
      };
    });
    const deposits = new Map(['USD', 'KRW'].map(c => [`initial-${c}`, {
      id: `initial-${c}`, currency: c, balance: usd(s.money.rentalDepositAsset[c], c),
    }]));
    const plans = new Map(m.espp.map(p => [p.id, { ...p, clearing: 0, contributedByYear: {} }]));
    const homes = [];
    const endedRent = new Map();
    const flows = m.flows.map(x => ({ ...x }));
    const loans = [];
    const otherDebt = money('otherDebt');
    function addLoan(id, balance, rate, years, date) {
      if (balance <= EPS) return;
      const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
      const payment = monthlyRate > 0 ? balance * monthlyRate / -Math.expm1(-years * 12 * Math.log1p(monthlyRate))
        : balance / (years * 12);
      loans.push({ id, balance, rate, years, payment, start: date, elapsedMonths: 0 });
    }
    addLoan('mortgage', money('mortgage'), pct(Number(s.inputs.mortgageRate)), 30, start);
    addLoan('student', money('studentLoan'), pct(Number(s.inputs.studentLoanRate)), 10, start);
    addLoan('car', money('carLoan'), 0, 5, start);
    const staticReal = money('realEstate') + money('vehicle') + money('otherAsset');
    const rows = [], journal = [], months = [];
    const rowMap = new Map();
    const pending = new Map();
    const pendingCosts = new Map();
    let monthlyFraction = 0, monthlyYearFraction = 0;
    let monthlyIncome = 0, monthlyGrossSalary = 0;
    let monthlyExpense = 0, monthlyDebtDue = 0, monthlyShortfall = 0, monthlyWithdrawals = 0;
    let monthlySelf = 0, monthlyEspp = 0;
    let activeDate = start, activeAge = m.startAge, row;
    function allocationActive(rule, date) {
      const scenario = rule.scenarioId ? m.scenarios.get(rule.scenarioId) : null;
      return date >= (rule.start || start) && date < (rule.end || m.end) &&
        (!scenario?.start || date >= scenario.start) && (!scenario?.end || date < scenario.end);
    }
    function trackNewCash(currency, amount) {
      for (const rule of allocationRules) if (rule.currency === currency && allocationActive(rule, activeDate)) {
        newCash.set(rule.id, newCash.get(rule.id) + amount);
      }
    }
    const journalEnabled = options.recordJournal !== false;
    function log(kind, label, amount, extra = {}) {
      if (!journalEnabled || journal.length >= 15000) return;
      journal.push({ date: activeDate, kind, label, amount, ...extra });
    }
    function accessible(a, date) {
      return ['cash', 'brokerage'].includes(a.model) || date >= m.ageDate(a.retireDrawAge || 60);
    }
    function afterTax(a) { return NWFinanceTax.withdraw(a, a.balance).net; }
    function snapshot(date) {
      const cashTotal = cash.USD.balance + cash.KRW.balance;
      let available = cashTotal, locked = 0, accountTotal = 0, accountAfterTax = 0;
      for (const a of accounts) {
        accountTotal += a.balance;
        const net = afterTax(a);
        accountAfterTax += net;
        if (accessible(a, date)) available += net;
        else locked += a.balance;
      }
      const deposit = [...deposits.values()].reduce((sum, x) => sum + x.balance, 0);
      const clearing = [...plans.values()].reduce((sum, x) => sum + x.clearing, 0);
      const property = homes.reduce((sum, x) => sum + x.value, 0);
      const debt = otherDebt + loans.reduce((sum, x) => sum + x.balance, 0);
      let protectedCash = 0, reserveTarget = 0, reserveShortfall = 0, reservesKnown = true;
      for (const c of ['USD', 'KRW']) {
        const reserve = f.cashReserves[c];
        if (reserve.emergencyAmount == null || reserve.earmarkAmount == null) { reservesKnown = false; continue; }
        const target = usd(reserve.emergencyAmount + reserve.earmarkAmount, c);
        reserveTarget += target;
        protectedCash += Math.min(cash[c].balance, target);
        reserveShortfall += Math.max(0, target - cash[c].balance);
      }
      return {
        cash: cashTotal, accountTotal, accountAfterTax, available, locked, deposit, clearing,
        protectedCash, reservesKnown, reserveTarget: reservesKnown ? reserveTarget : null,
        reserveShortfall: reservesKnown ? reserveShortfall : null,
        freeAvailable: reservesKnown ? Math.max(0, available - reserveTarget) : null,
        realAssets: staticReal + property, debt,
        netWorth: cashTotal + accountTotal + deposit + clearing + staticReal + property - debt,
        totalFinancial: cashTotal + accountTotal,
      };
    }
    const initial = snapshot(start);
    function fund(needed, currency, label, required = true, allowAccounts = true) {
      let left = Math.max(0, needed);
      for (const c of [currency, currency === 'USD' ? 'KRW' : 'USD']) {
        const take = Math.min(cash[c].balance, left);
        cash[c].balance = Math.max(0, cash[c].balance - take);
        trackNewCash(c, -take);
        left -= take;
      }
      if (allowAccounts && left > EPS) {
        const ordered = [...accounts].sort((a, b) =>
          (['cash', 'brokerage'].includes(a.model) ? 0 : 1) - (['cash', 'brokerage'].includes(b.model) ? 0 : 1) || a.id - b.id);
        for (const a of ordered) {
          if (left <= EPS) break;
          if (!accessible(a, activeDate) || a.balance <= EPS) continue;
          const result = NWFinanceTax.withdraw(a, left);
          a.balance = result.balance; a.costBasis = result.costBasis;
          a.deferredCompensation = result.deferredCompensation;
          a.periodWithdrawals += result.gross; a.periodTaxes += result.tax;
          row.taxes += result.tax; row.withdrawals += result.gross;
          row.grossIncome += result.ordinaryIncome || 0;
          monthlyWithdrawals += result.gross;
          left -= result.net;
          log('withdrawal', a.name || String(a.id), result.gross, { net: result.net, tax: result.tax, accountId: a.id });
        }
      }
      left = Math.max(0, left);
      if (left > EPS) {
        if (required) { row.shortfall += left; monthlyShortfall += left; }
        else row.skippedContributions += left;
        log(required ? 'shortfall' : 'skipped-saving', label, left);
      }
      return Math.max(0, needed - left);
    }
    function expense(needed, currency, label) {
      row.expense += needed;
      monthlyExpense += needed;
      const paid = fund(needed, currency, label);
      row.paidExpense += paid;
      log('expense', label, needed, { paid, shortfall: needed - paid });
      return paid;
    }
    function flowActive(flow, date) {
      if (date < flow.start || date >= flow.end) return false;
      if (endedRent.has(flow.id) && date >= endedRent.get(flow.id)) return false;
      if (flow.kind === 'expense' && m.useTarget && date >= retireDate &&
          flow.retirementRole === 'base' && !flow.retirementTarget) return false;
      if (flow.retirementTarget) {
        const override = flows.some(x => x.kind === 'expense' && x.currency === flow.currency &&
          x.retirementRole === 'override_target' && date >= x.start && date < x.end);
        if (override) return false;
      }
      return true;
    }
    function flowLevel(flow, date) {
      const growth = flow.growthPct == null ? (flow.kind === 'expense' ? inf : flow.kind === 'salary' ? wage : 0)
        : pct(flow.growthPct);
      const calendarStart = date.slice(0, 4) + '-01-01';
      const elapsed = calendarStart > flow.annualAnchor ? T().yearFraction(flow.annualAnchor, calendarStart) : 0;
      return NWCore.growthFactor(growth, elapsed);
    }
    function addPending(id, amount) { pending.set(id, (pending.get(id) || 0) + amount); }
    function payrollDeduct(sourceId, sourceNet, coverage) {
      for (const plan of plans.values()) {
        if (plan.eligibleAnnualPay == null || !plan.start || activeDate < plan.start || (plan.end && activeDate >= plan.end)) continue;
        if (plan.scenarioId) {
          const sc = m.scenarios.get(plan.scenarioId);
          if (!sc || (sc.start && activeDate < sc.start) || (sc.end && activeDate >= sc.end)) continue;
        }
        if (plan.payrollSourceId && plan.payrollSourceId !== sourceId) continue;
        if (!plan.payrollSourceId && sourceId !== '__month__') continue;
        const y = activeDate.slice(0, 4);
        const month = Number(activeDate.slice(5, 7));
        const periodStart = coverage > 1 ? `${y}-01-01` : activeDate.slice(0, 8) + '01';
        const periodEnd = coverage > 1 ? `${Number(y) + 1}-01-01` : T().iso(Date.UTC(Number(y), month, 1));
        const sc = plan.scenarioId ? m.scenarios.get(plan.scenarioId) : null;
        const from = [periodStart, start, plan.start, sc?.start || periodStart].sort().at(-1);
        const to = [periodEnd, plan.end || periodEnd, sc?.end || periodEnd].sort()[0];
        const allowed = Math.max(0, T().ms(to) - T().ms(from)) / (T().ms(periodEnd) - T().ms(periodStart)) * (coverage > 1 ? 12 : 1);
        const actualCoverage = Math.min(coverage, allowed);
        const cap = plan.annualLimit == null ? Infinity : usd(plan.annualLimit, plan.currency);
        const desired = Math.min(usd(plan.eligibleAnnualPay, plan.currency) / 12 * actualCoverage * pct(plan.contribPct),
          Math.max(0, cap - (plan.contributedByYear[y] || 0)));
        let paid;
        if (plan.netPayAlreadyDeducted) {
          // Salary is settled partly as cash, partly as employee-owned clearing funds.
          paid = desired;
          if (sourceNet <= EPS && desired > EPS) { warn(`ESPP source paid no salary / ESPP 급여 정산 확인: ${plan.name}`); paid = 0; }
          row.nonCashCompensation += paid;
        } else {
          paid = fund(desired, plan.currency, `ESPP ${plan.name}`, false, false);
          row.esppDeductions += paid;
          monthlyEspp += paid;
        }
        plan.clearing += paid;
        plan.contributedByYear[y] = (plan.contributedByYear[y] || 0) + paid;
        log('espp-payroll-transfer', plan.name, paid, { transfer: true, newIncome: false });
      }
    }
    function settleFlow(flow, gross, coverage = 0, costOverride = null) {
      if (gross <= EPS && !(flow.kind === 'business' && costOverride > EPS)) return;
      if (flow.kind === 'expense') { expense(gross, flow.currency, flow.name); return; }
      const costRatio = flow.amountUSD > 0 ? flow.costUSD / flow.amountUSD : 0;
      const cost = flow.kind === 'business' ? (costOverride ?? gross * costRatio) : 0;
      let cashGross = gross;
      if (flow.kind === 'gross_tc') {
        row.grossTcTarget += gross;
        const cashComponents = flows.some(x => x.tcParentId === flow.id);
        if (cashComponents || flow.cashSharePct == null) {
          log('gross-tc-target', flow.name, gross, { actualCash: 0, componentsUsed: cashComponents });
          return;
        }
        cashGross = gross * pct(flow.cashSharePct);
      }
      const profit = cashGross - cost;
      const tax = flow.taxTreatment === 'gross' ? Math.max(0, profit) * pct(flow.taxPct) : 0;
      const net = profit - tax;
      if (flow.taxTreatment === 'gross') {
        row.grossIncome += flow.kind === 'gross_tc' ? cashGross : gross;
        if (flow.kind === 'salary' || flow.kind === 'gross_tc') row.grossSalary += cashGross;
      } else row.netInputIncome += net;
      row.businessCosts += cost; row.taxes += tax; row.income += net;
      if (net >= 0) { cash[flow.currency].balance += net; trackNewCash(flow.currency, net); }
      else fund(-net, flow.currency, `Business loss: ${flow.name}`);
      monthlyIncome += net;
      if (flow.taxTreatment === 'gross' && (flow.kind === 'salary' || flow.kind === 'gross_tc')) monthlyGrossSalary += cashGross;
      log('income', flow.name, net, { gross, businessCost: cost, tax, currency: flow.currency });
      if (flow.kind === 'salary' || flow.kind === 'gross_tc') payrollDeduct(flow.id, net, coverage);
    }
    function employmentActive(a, date) {
      const cfg = a.cfg;
      const from = cfg.employmentStart || start;
      let end = cfg.employmentEnd || m.end;
      if (cfg.endOnScenario && m.scenarios.has(cfg.endOnScenario)) end = [end, m.scenarios.get(cfg.endOnScenario).start || m.end].sort()[0];
      return date >= from && date < end &&
        activeAge >= (Number(a.contribStartAge) || m.startAge) &&
        activeAge < (Number(a.contribEndAge) || Number(s.inputs.retireAge));
    }
    function employerDeposit(a, years, selfPaid = 0, incomeBase = 0) {
      if (!employmentActive(a, activeDate)) return;
      let amount = 0;
      const cfg = a.cfg;
      if (cfg.employerFixedAnnual != null) amount = usd(cfg.employerFixedAnnual, a.currency) * years;
      else if (a.employerMatchMode === 'match') amount = Math.min(selfPaid, pct(Number(a.matchCapPercent)) * incomeBase) * pct(Number(a.matchRate));
      else if (a.employerMatchMode === 'percent') {
        if (cfg.grossBaseAnnual == null && Number(a.contribEmployerRate) > 0) {
          warn(`Employer percentage uses net-income legacy basis / 회사 납입 기준급여 미확인: ${a.name}`);
        }
        amount = pct(Number(a.contribEmployerRate)) * (cfg.grossBaseAnnual == null ? incomeBase : usd(cfg.grossBaseAnnual, a.currency) * years);
      } else amount = a.annualEmployer * years;
      a.balance += amount; a.costBasis += amount; row.employerContributions += amount;
      row.nonCashCompensation += amount;
      log('employer-contribution', a.name, amount, { accountId: a.id, cashIncome: false });
    }
    function destination(id, label) {
      const a = accounts.find(x => x.id === Number(id));
      if (!a || a.model !== 'brokerage') { warn(`Stock destination must be a brokerage account / 주식 수령 일반계좌 필요: ${label}`); return null; }
      return a;
    }
    function settleDbBenefit(benefit) {
      const value = usd(benefit.expectedAmount, benefit.currency);
      const dest = benefit.settlement === 'retirement_account'
        ? accounts.find(a => a.id === benefit.destinationAccountId && a.model === 'deferred') : null;
      if (benefit.settlement === 'retirement_account' && !dest) {
        warn(`DB destination unavailable / DB 수령 계좌 사용 불가: ${benefit.name}`);
        return;
      }
      row.events.push({ type: 'db-benefit', label: benefit.name, date: activeDate });
      if (benefit.treatment === 'existing_account_transfer') {
        const source = accounts.find(a => a.id === benefit.sourceAccountId && a.model === 'deferred');
        if (!source) { warn(`DB existing asset source unavailable / DB 기존 자산 출처 사용 불가: ${benefit.name}`); return; }
        if (dest) {
          const amount = Math.min(source.balance, value);
          const ratio = source.balance > 0 ? amount / source.balance : 0;
          const basis = source.costBasis * ratio;
          source.balance = Math.max(0, source.balance - amount);
          source.costBasis = Math.max(0, source.costBasis - basis);
          source.periodWithdrawals += amount;
          dest.balance += amount; dest.costBasis += basis;
          row.transfers += amount; row.dbBenefitTransfers += amount;
          if (value - amount > EPS) warn(`DB transfer capped at owned balance / DB 이체액 잔액 한도 적용: ${benefit.name}`);
          log('db-retirement-transfer', benefit.name, amount, { sourceAccountId: source.id,
            destinationAccountId: dest.id, newIncome: false, modeledInternalTransfer: true });
        } else {
          if (!accessible(source, activeDate)) { warn(`DB source not yet accessible for cash / DB 현금 인출 시점 미도달: ${benefit.name}`); return; }
          const netFactor = source.balance > 0 ? afterTax(source) / source.balance : 1;
          const target = benefit.amountBasis === 'gross' ? value * netFactor : value;
          const result = NWFinanceTax.withdraw(source, target);
          source.balance = result.balance; source.costBasis = result.costBasis;
          source.deferredCompensation = result.deferredCompensation;
          source.periodWithdrawals += result.gross; source.periodTaxes += result.tax;
          cash[benefit.currency].balance += result.net;
          row.taxes += result.tax; row.withdrawals += result.gross; monthlyWithdrawals += result.gross;
          row.dbBenefitCash += result.net; row.transfers += result.net;
          if (result.shortfall > EPS) warn(`DB withdrawal capped at owned net value / DB 인출액 잔액 한도 적용: ${benefit.name}`);
          log('db-existing-asset-payment', benefit.name, result.net, { gross: result.gross, tax: result.tax,
            sourceAccountId: source.id, newIncome: false });
        }
        return;
      }
      const tax = benefit.amountBasis === 'gross' ? value * pct(benefit.effectiveTaxPct) : 0;
      const net = value - tax;
      row.taxes += tax;
      if (benefit.amountBasis === 'gross') row.grossIncome += value;
      else row.netInputIncome += net;
      if (dest) {
        dest.balance += net; dest.costBasis += net;
        row.nonCashCompensation += net; row.dbBenefitTransfers += net;
      } else {
        cash[benefit.currency].balance += net;
        trackNewCash(benefit.currency, net);
        row.income += net; monthlyIncome += net; row.dbBenefitCash += net;
      }
      log('db-new-benefit', benefit.name, net, { knownGross: benefit.amountBasis === 'gross' ? value : null,
        tax, cash: dest ? 0 : net, retirementAsset: dest ? net : 0, destinationAccountId: dest?.id ?? null });
    }
    function process(op) {
      const e = op.data;
      if (op.type === 'db-benefit') { settleDbBenefit(e); return; }
      if (op.type === 'annotation') { row.events.push({ type: e.type, label: e.name, date: activeDate }); return; }
      if (op.type === 'replacement') {
        const id = e.type === 'income' ? `legacy-income-${e.currency}` :
          m.useTarget && activeDate >= retireDate ? `retirement-target-${e.currency}` : `legacy-expense-${e.currency}`;
        const flow = flows.find(x => x.id === id);
        if (flow) { flow.amountUSD = e.amountUSD; flow.annualAnchor = activeDate; }
        row.events.push({ type: e.type, label: e.name, date: activeDate });
        return;
      }
      if (op.type === 'flow') {
        const flow = flows.find(x => x.id === e);
        if (flow && flowActive(flow, activeDate)) {
          const annualSplit = flow.frequency === 'annual_rate' && flow.payMonth == null ? 1 / 12 : 1;
          const amount = flow.amountUSD * flowLevel(flow, activeDate) * annualSplit;
          settleFlow(flow, amount, flow.frequency === 'annual_rate' && flow.payMonth != null ? 12 : flow.frequency === 'once' ? 0 : 1,
            flow.kind === 'business' ? flow.costUSD * flowLevel(flow, activeDate) * annualSplit : null);
        }
        return;
      }
      if (op.type === 'employer') {
        const a = accounts.find(x => x.id === e);
        if (a) {
          const yearStart = activeDate.slice(0, 4) + '-01-01';
          const yearEnd = `${Number(activeDate.slice(0, 4)) + 1}-01-01`;
          const endScenario = a.cfg.endOnScenario ? m.scenarios.get(a.cfg.endOnScenario)?.start : '';
          const begin = [yearStart, start, a.cfg.employmentStart || yearStart].sort().at(-1);
          const finish = [yearEnd, a.cfg.employmentEnd || yearEnd, endScenario || yearEnd].sort()[0];
          employerDeposit(a, T().yearFraction(begin, finish), a.yearSelfPaid, a.yearIncomeBase);
        }
        return;
      }
      if (op.type === 'rsu') {
        const { grant, vest } = e;
        const grossNative = vest.shares != null && vest.price != null ? vest.shares * vest.price : vest.amount;
        if (grossNative == null) { warn(`RSU vest value missing / RSU 베스팅 금액 미확인: ${grant.name}`); return; }
        const a = grant.saleMode === 'hold' ? destination(grant.accountId, grant.name) : null;
        if (grant.saleMode === 'hold' && !a) return;
        const result = NWFinanceTax.settleRsu({ gross: usd(grossNative, grant.currency), taxRate: pct(grant.taxPct), saleMode: grant.saleMode });
        row.grossIncome += result.grossIncome; row.grossSalary += result.grossIncome;
        row.taxes += result.tax;
        if (a) {
          a.balance += result.stock; a.costBasis += result.costBasis;
          row.nonCashCompensation += result.stock;
        } else {
          cash[grant.currency].balance += result.cash; row.income += result.cash; monthlyIncome += result.cash;
          trackNewCash(grant.currency, result.cash);
        }
        row.events.push({ type: 'rsu', label: grant.name, date: activeDate });
        log('rsu-vesting', grant.name, result.grossIncome, { tax: result.tax, cash: result.cash, stock: result.stock });
        return;
      }
      if (op.type === 'espp') {
        const { plan: source, purchase } = e;
        const plan = plans.get(source.id);
        if (!plan || plan.clearing <= EPS) return;
        const a = plan.saleMode === 'hold' ? destination(plan.accountId, plan.name) : null;
        if (plan.saleMode === 'hold' && !a) return;
        if (!purchase.offeringPrice || !purchase.marketPrice) { warn(`ESPP price missing; money stays in clearing / ESPP 가격 미입력: ${plan.name}`); return; }
        const result = NWFinanceTax.esppPurchase({
          contributions: plan.clearing, offeringPrice: usd(purchase.offeringPrice, plan.stockCurrency),
          purchasePrice: usd(purchase.marketPrice, plan.stockCurrency), discount: pct(plan.discountPct),
          lookback: plan.lookback, ordinaryTaxRate: pct(plan.taxPct), taxTiming: plan.taxTiming, saleMode: plan.saleMode,
        });
        const principal = plan.clearing;
        plan.clearing = 0;
        row.taxes += result.tax;
        if (plan.taxTiming === 'purchase' || plan.saleMode === 'sell') row.grossIncome += result.benefit;
        // Principal is a transfer, never new compensation.
        row.nonCashCompensation += Math.max(0, result.benefit - result.tax);
        if (a) {
          a.balance += result.stock; a.costBasis += result.costBasis;
          const combined = a.deferredCompensation + result.deferredCompensation;
          if (combined > 0) a.ordinaryTaxRate = (a.deferredCompensation * a.ordinaryTaxRate +
            result.deferredCompensation * pct(plan.taxPct)) / combined;
          a.deferredCompensation = combined;
        } else cash[plan.currency].balance += result.cash;
        row.events.push({ type: 'espp', label: plan.name, date: activeDate });
        log('espp-purchase', plan.name, principal, { principal, benefit: result.benefit, tax: result.tax,
          cash: result.cash, stock: result.stock, transfer: true });
        return;
      }
      if (op.type === 'home') {
        const price = usd(e.price, e.currency), closing = usd(e.closingCost, e.currency);
        const down = price * pct(e.downPaymentPct);
        const need = down + closing;
        const available = snapshot(activeDate).available;
        if (available + EPS < need) {
          row.shortfall += need - available;
          monthlyShortfall += need - available;
          warn(`Home purchase unfunded; no house created / 주택 자금 부족: ${e.name}`);
          log('unfunded-home', e.name, need, { shortfall: need - available });
          return;
        }
        fund(need, e.currency, e.name);
        homes.push({ ...e, value: price, start: activeDate,
          annualCost: usd((e.annualPropertyTax ?? 0) + (e.annualInsurance ?? 0) + (e.annualMaintenance ?? 0), e.currency) });
        addLoan(`home-${e.id}`, price - down, pct(e.loanRatePct), e.loanYears, activeDate);
        if (e.replaceRentFlowId) endedRent.set(e.replaceRentFlowId, activeDate);
        row.transfers += down; row.expense += closing; row.paidExpense += closing;
        monthlyExpense += closing;
        row.events.push({ type: 'home', label: e.name, date: activeDate });
        log('home-purchase', e.name, price, { downPayment: down, loan: price - down, closingCost: closing });
        return;
      }
      if (op.type !== 'event') return;
      const value = e.amountUSD;
      row.events.push({ type: e.type, label: e.name, date: activeDate });
      if (e.type === 'deposit-return') {
        let remaining = value;
        const positions = e.depositId ? [deposits.get(e.depositId)].filter(Boolean)
          : [...deposits.values()].filter(x => x.currency === e.currency);
        for (const position of positions) {
          const amount = Math.min(position.balance, remaining);
          position.balance -= amount; cash[e.currency].balance += amount; remaining -= amount;
        }
        if (remaining > EPS) { warn(`Deposit refund exceeds asset / 보증금 반환액 초과: ${e.name}`); row.shortfall += remaining; monthlyShortfall += remaining; }
        row.transfers -= value - remaining;
        log('deposit-return', e.name, value - remaining, { transfer: true, rejected: remaining });
      } else if (e.type === 'deposit-pay') {
        if (snapshot(activeDate).available + EPS < value) {
          const gap = value - snapshot(activeDate).available;
          row.shortfall += gap; monthlyShortfall += gap;
          log('unfunded-deposit', e.name, value, { shortfall: gap, assetCreated: 0 });
          return;
        }
        const paid = fund(value, e.currency, e.name);
        const id = e.depositId || `event-${e.id}`;
        if (!deposits.has(id)) deposits.set(id, { id, currency: e.currency, balance: 0 });
        const position = deposits.get(id);
        if (position.currency !== e.currency) throw new Error('deposit-currency');
        position.balance += paid; row.transfers += paid;
        log('deposit-pay', e.name, paid, { transfer: true, netWorthChangeBeforeCosts: 0 });
      } else if (e.type === 'lumpsum-in') {
        if (e.drainAccountId != null) {
          const a = accounts.find(x => x.id === e.drainAccountId);
          if (a && accessible(a, activeDate)) {
            const result = NWFinanceTax.withdraw(a, afterTax(a));
            a.balance = result.balance; a.costBasis = result.costBasis; a.deferredCompensation = result.deferredCompensation;
            a.periodWithdrawals += result.gross; a.periodTaxes += result.tax;
            cash[e.currency].balance += result.net; row.taxes += result.tax; row.withdrawals += result.gross;
            monthlyWithdrawals += result.gross; row.grossIncome += result.ordinaryIncome || 0;
            log('account-transfer', e.name, result.net, { tax: result.tax, newIncome: false });
          } else { warn(`Account transfer unavailable / 계좌 인출 불가: ${e.name}`); row.shortfall += value; monthlyShortfall += value; }
        } else {
          cash[e.currency].balance += value; row.income += value; row.grossIncome += value; monthlyIncome += value;
          trackNewCash(e.currency, value);
          log('lump-income', e.name, value);
        }
      } else if (e.type === 'lumpsum-out') expense(value, e.currency, e.name);
    }
    let bridgeOpening = null;
    const laterAccess = accounts.filter(a => !['cash', 'brokerage'].includes(a.model))
      .map(a => m.ageDate(a.retireDrawAge || 60)).filter(date => date > retireDate).sort()[0] || retireDate;
    const bridge = { start: retireDate, end: laterAccess, openingAvailable: 0, requiredNet: 0, shortfall: 0, withdrawals: 0 };
    function getRow(segment) {
      if (!rowMap.has(segment.year)) {
        const period = NWCore.calendarPeriod(start, segment.year - Number(start.slice(0, 4)));
        const result = emptyRow(segment.year, segment.age, period);
        result.isRetired = segment.from >= retireDate;
        rowMap.set(segment.year, result);
        rows.push(result);
        for (const a of accounts) { a.periodWithdrawals = 0; a.periodTaxes = 0; a.yearSelfPaid = 0; a.yearIncomeBase = 0; }
      }
      return rowMap.get(segment.year);
    }
    function accumulate(segment) {
      const values = new Map();
      for (const flow of flows) {
        if (!flowActive(flow, segment.from) || flow.frequency === 'once' || flow.payDay != null) continue;
        const portion = flow.frequency === 'monthly' ? segment.monthFraction : segment.fraction;
        values.set(flow.id, flow.amountUSD * flowLevel(flow, segment.from) * portion);
        if (flow.kind === 'business') pendingCosts.set(flow.id, (pendingCosts.get(flow.id) || 0) +
          flow.costUSD * flowLevel(flow, segment.from) * portion);
      }
      for (const flow of flows) {
        if (!values.has(flow.id)) continue;
        let amount = values.get(flow.id);
        const included = flows.filter(x => x.includedInFlowId === flow.id && values.has(x.id));
        if (included.length) {
          const children = included.reduce((sum, x) => sum + values.get(x.id), 0);
          if (children > amount + EPS) warn(`Split expenses exceed parent budget / 세부 지출이 원래 예산 초과: ${flow.name}`);
          amount = Math.max(0, amount - children);
        }
        addPending(flow.id, amount);
      }
    }
    function allocateSurplus() {
      // Never sell assets to auto-invest, or buy back assets withdrawn this month.
      if (monthlyShortfall > EPS || monthlyWithdrawals > EPS) return;
      let economicSurplus = Math.max(0, monthlyIncome - monthlyExpense - monthlyDebtDue - monthlySelf - monthlyEspp);
      for (const rule of allocationRules) {
        if (!allocationActive(rule, activeDate)) continue;
        const a = accounts.find(x => x.id === rule.accountId);
        if (!a || a.model !== 'brokerage') continue;
        const reserve = f.cashReserves[rule.currency];
        const floor = usd(reserve.emergencyAmount + reserve.earmarkAmount, rule.currency);
        const eligible = Math.max(0, Math.min(newCash.get(rule.id), economicSurplus,
          cash[rule.currency].balance - floor));
        const amount = eligible * pct(rule.percentPct);
        if (amount <= EPS) continue;
        cash[rule.currency].balance -= amount;
        newCash.set(rule.id, newCash.get(rule.id) - amount);
        economicSurplus -= amount;
        a.balance += amount; a.costBasis += amount;
        row.autoInvested += amount; row.transfers += amount;
        log('automatic-investment', rule.name, amount, { accountId: a.id, currency: rule.currency,
          eligibleSurplus: eligible, protectedFloor: floor, transfer: true, newIncome: false });
      }
    }
    function closeMonth(segment) {
      activeDate = segment.lastDate;
      const receipts = flows.filter(flow => pending.has(flow.id) && flow.kind !== 'expense');
      for (const flow of receipts) {
        const amount = pending.get(flow.id);
        settleFlow(flow, amount, monthlyFraction, pendingCosts.get(flow.id) ?? null);
      }
      payrollDeduct('__month__', monthlyIncome, monthlyFraction);
      for (const flow of flows.filter(x => pending.has(x.id) && x.kind === 'expense')) settleFlow(flow, pending.get(flow.id));
      pending.clear(); pendingCosts.clear();
      for (const home of homes) expense(home.annualCost * monthlyYearFraction, home.currency, `Home costs: ${home.name}`);
      for (const loan of loans) {
        if (loan.balance <= EPS || activeDate < loan.start) continue;
        const monthStart = activeDate.slice(0, 8) + '01';
        const from = [monthStart, start, loan.start].sort().at(-1);
        const endDate = segment.to;
        const coverage = Math.max(0, (T().ms(endDate) - T().ms(from)) / 86400000) /
          new Date(Date.UTC(segment.year, Number(activeDate.slice(5, 7)), 0)).getUTCDate();
        loan.elapsedMonths += coverage;
        const desired = loan.elapsedMonths + EPS >= loan.years * 12 ? loan.balance : Math.min(loan.balance, loan.payment * coverage);
        monthlyDebtDue += desired;
        const paid = fund(desired, 'USD', `Debt ${loan.id}`);
        loan.balance = Math.max(0, loan.balance - paid);
        row.debtPayments += paid;
        log('debt-payment', loan.id, paid, { requested: desired });
      }
      for (const a of accounts) {
        if (!employmentActive(a, activeDate)) continue;
        const cfg = a.cfg;
        if (cfg.contributionBase === 'gross_salary' && cfg.grossBaseAnnual == null &&
            monthlyGrossSalary <= EPS && Number(a.contribSelfRate) > 0) warn(`Gross contribution base missing; net pay is not gross / 세전 납입 기준 급여 미입력: ${a.name}`);
        const base = Math.max(0, cfg.contributionBase === 'gross_salary' ? (cfg.grossBaseAnnual == null
          ? monthlyGrossSalary : usd(cfg.grossBaseAnnual, a.currency) * monthlyYearFraction) : monthlyIncome);
        const desired = Number(a.contribSelfRate) > 0 ? base * pct(Number(a.contribSelfRate)) : a.annualSelf * monthlyYearFraction;
        const paid = fund(desired, a.currency, `Savings ${a.name}`, false, false);
        a.balance += paid; a.costBasis += paid; row.employeeContributions += paid;
        monthlySelf += paid;
        a.yearSelfPaid += paid; a.yearIncomeBase += base;
        log('employee-contribution', a.name, paid, { transfer: true });
        if (cfg.employerPayMonth == null) employerDeposit(a, monthlyYearFraction, paid, base);
      }
      allocateSurplus();
      if (activeDate >= bridge.start && activeDate < bridge.end) {
        bridge.requiredNet += Math.max(0, monthlyExpense + monthlyDebtDue - monthlyIncome);
        bridge.shortfall += monthlyShortfall;
        bridge.withdrawals += monthlyWithdrawals;
      }
      if (options.recordMonthly !== false) {
        const snap = snapshot(activeDate);
        months.push({ date: activeDate, cash: snap.cash, available: snap.available, netWorth: snap.netWorth,
          protectedCash: snap.protectedCash, freeAvailable: snap.freeAvailable, reserveShortfall: snap.reserveShortfall,
          cumulativeShortfall: row.shortfall });
      }
      monthlyFraction = 0; monthlyYearFraction = 0; monthlyIncome = 0; monthlyGrossSalary = 0;
      monthlyExpense = 0; monthlyDebtDue = 0; monthlyShortfall = 0; monthlyWithdrawals = 0;
      monthlySelf = 0; monthlyEspp = 0;
      for (const rule of allocationRules) newCash.set(rule.id, 0);
    }
    for (const segment of m.segments) {
      activeDate = segment.from; activeAge = segment.age; row = getRow(segment);
      if (bridgeOpening == null && activeDate >= retireDate) {
        bridgeOpening = snapshot(activeDate).available;
        bridge.openingAvailable = bridgeOpening;
      }
      for (const op of m.operations.get(activeDate) || []) process(op);
      const shocks = new Map();
      for (const c of ['USD', 'KRW']) {
        const result = NWFinanceTax.grow(cash[c], segment.fraction);
        cash[c].balance = result.balance;
        row.taxes += result.tax; row.investmentIncome += result.grossIncome;
        row.income += result.netIncome; row.grossIncome += result.grossIncome;
        monthlyIncome += result.netIncome;
        trackNewCash(c, result.netIncome);
      }
      for (const a of accounts) {
        if (a.balance > EPS && (!a.cfg.taxConfirmed || (a.model === 'brokerage' &&
            (a.cfg.capitalGainsTaxPct == null || a.cfg.costBasis == null)))) warn(`Account assumptions provisional / 계좌 가정 잠정: ${a.name || a.id}`);
        let periodReturn = null;
        if (random && a.model !== 'cash') {
          if (!shocks.has(a.marketGroup)) shocks.set(a.marketGroup, normal(random));
          const expected = Math.max(-.999999, a.annualReturn + scenarioDelta -
            (a.model === 'brokerage' ? a.dividendYield : 0));
          periodReturn = Math.exp((Math.log1p(expected) - a.volatility ** 2 / 2) * segment.fraction +
            a.volatility * Math.sqrt(segment.fraction) * shocks.get(a.marketGroup)) - 1;
        }
        const result = NWFinanceTax.grow({ ...a, annualReturn: a.annualReturn + (a.model === 'cash' ? 0 : scenarioDelta) },
          segment.fraction, periodReturn);
        a.balance = result.balance; a.costBasis = result.costBasis;
        row.taxes += result.tax; row.investmentIncome += result.grossIncome;
        row.grossIncome += result.grossIncome;
      }
      for (const loan of loans) {
        if (loan.balance <= EPS) continue;
        const interest = loan.balance * (NWCore.growthFactor(loan.rate, segment.fraction) - 1);
        loan.balance += interest; row.debtInterest += interest;
      }
      for (const home of homes) home.value *= NWCore.growthFactor(pct(home.appreciationPct), segment.fraction);
      accumulate(segment);
      monthlyFraction += segment.monthFraction; monthlyYearFraction += segment.fraction;
      if (segment.monthEnd) closeMonth(segment);
      const snap = snapshot(segment.lastDate);
      Object.assign(row, {
        invest: snap.cash, investRaw: snap.cash, totalLiquid: snap.available,
        netWorth: snap.netWorth, totalFinancial: snap.totalFinancial, rentalDepositAsset: snap.deposit,
        esppClearing: snap.clearing, lockedRetirement: snap.locked, realAssets: snap.realAssets,
        totalAccAfterTax: snap.accountAfterTax, totalAccBalancePre: snap.accountTotal, debtRemain: snap.debt,
        protectedCash: snap.protectedCash, freeAvailable: snap.freeAvailable, reservesKnown: snap.reservesKnown,
        reserveTarget: snap.reserveTarget, reserveShortfall: snap.reserveShortfall,
        savings: row.income - row.expense - row.debtPayments - row.employeeContributions - row.esppDeductions - row.autoInvested,
        accSnapshot: accounts.map(a => ({ id: a.id, balance: a.balance, costBasis: a.costBasis,
          accessible: accessible(a, segment.lastDate), withdrawals: a.periodWithdrawals, taxes: a.periodTaxes,
          afterTax: afterTax(a), deferredCompensation: a.deferredCompensation })),
      });
    }
    const annualTarget = (m.targets.USD + m.targets.KRW) * 12;
    const targetAtRetire = annualTarget * (f.retirement.targetBasis === 'today'
      ? NWCore.growthFactor(inf, T().yearFraction(start, retireDate)) : 1);
    const pensionEligibleAtRetirement = f.retirement.pensionConfirmed && f.retirement.pensionStartAge != null &&
      f.retirement.pensionStartAge <= Number(s.inputs.retireAge);
    const annualPensionAtRetirement = pensionEligibleAtRetirement ? money('externalPension') * 12 : 0;
    const fi = {
      pensionEligibleAtRetirement,
      currentAvailable: initial.available, requiredAtRetirement: Math.max(0, targetAtRetire - annualPensionAtRetirement) / (Number(s.inputs.withdrawRate) / 100),
      currentTarget: annualTarget / (Number(s.inputs.withdrawRate) / 100),
      partial: rows.filter(r => f.retirement.partialFiFrom != null && r.age >= f.retirement.partialFiFrom &&
        r.age <= (f.retirement.partialFiTo ?? f.retirement.partialFiFrom)).map(r => {
        const modelDate = [start, `${r.year}-01-01`].sort().at(-1);
        const targetFactor = f.retirement.targetBasis === 'today'
          ? NWCore.growthFactor(inf, T().yearFraction(start, modelDate))
          : modelDate < retireDate ? 1 / NWCore.growthFactor(inf, T().yearFraction(modelDate, retireDate))
          : NWCore.growthFactor(inf, T().yearFraction(retireDate, modelDate));
        const annualNeed = annualTarget > 0 ? annualTarget * targetFactor : r.expense / r.yearFraction;
        const supported = r.freeAvailable == null ? null : r.freeAvailable * Number(s.inputs.withdrawRate) / 100;
        return { year: r.year, age: r.age, annualNeed, portfolioSupport: supported,
          available: r.totalLiquid, freeAvailable: r.freeAvailable, shortfall: r.shortfall,
          maintainedWorkIncome: f.retirement.maintainedIncomeUSD,
          coveragePct: supported == null ? null : annualNeed > 0 ? (supported + (f.retirement.maintainedIncomeUSD ?? 0)) / annualNeed * 100 : 0,
          workIncomeNeeded: supported == null ? null : Math.max(0, annualNeed - supported - (f.retirement.maintainedIncomeUSD ?? 0)), goalPct: f.retirement.coveragePct };
      }),
    };
    const meta = { initial, bridge, fi, warnings: [...warnings], provisional: warnings.size > 0,
      planning: f.planningItems.filter(x => x.enabled).map(x => NWFinanceState.planningStatus(s, x, m)),
      success: rows.every(r => r.shortfall < EPS), journal, months,
      assumptions: { timing: 'dated/month-end accrual', fx: 'fixed reference rate', marketCorrelation: 'shared shock within each group',
        taxes: 'user effective rates; no treaty/legal determination', recordLimit: 15000 } };
    return { rows, meta };
  }
  function monteCarlo(input, options = {}) {
    const m = input?.segments ? input : T().compile(input, options);
    const runs = options.runs ?? m.f.model.runs;
    const random = rng(options.seed ?? m.f.model.seed);
    const values = [];
    let first = null, successCount = 0, provisional = false;
    for (let i = 0; i < runs; i++) {
      const result = simulate(m, { ...options, random, recordJournal: false, recordMonthly: false });
      first ||= result;
      if (result.meta.success) successCount++;
      provisional ||= result.meta.provisional;
      result.rows.forEach((r, j) => { if (!values[j]) values[j] = []; values[j].push(r.netWorth); });
    }
    const percentile = p => values.map(column => {
      column.sort((a, b) => a - b);
      return column[Math.min(column.length - 1, Math.floor((column.length - 1) * p))];
    });
    return {
      p10: percentile(.1), p50: percentile(.5), p90: percentile(.9),
      labels: first.rows.map(r => `${r.year} · ${r.age}`), successRate: successCount / runs,
      successCount, depletedCount: runs - successCount, runs, seed: String(options.seed ?? m.f.model.seed),
      provisional, warnings: first.meta.warnings,
      pathsIdentical: values.every(column => column[0] === column[column.length - 1]),
      metric: 'net worth; success requires every dated cash need funded',
    };
  }
  function compareFlow(input, id, options = {}) {
    const state = NWCore.validate(input);
    const comparison = state.finance.comparisons.find(x => x.id === id);
    if (!comparison) throw new Error('comparison-reference');
    const missing = NWFinanceState.comparisonIssues(state, comparison);
    if (!comparison.enabled || comparison.status === 'unknown') missing.push('enabled/status');
    if (missing.length) return { ready: false, missing };
    const source = state.finance.flows.find(x => x.id === comparison.sourceFlowId);
    const replacement = { ...source, id: crypto.randomUUID(), name: comparison.name, start: comparison.start,
      amount: comparison.amount, businessCost: comparison.businessCost, taxTreatment: 'gross', taxPct: comparison.taxPct };
    // A replacement is not an extra income stream, and the base input is immutable.
    if (source.start === comparison.start) source.enabled = false;
    else source.end = comparison.start;
    state.finance.flows.push(replacement);
    const result = simulate(state, options);
    return { ready: true, result };
  }
  window.NWFinanceEngine = { simulate, monteCarlo, rng, compareFlow };
})();
