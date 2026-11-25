/* Explicit effective-rate assumptions, not statutory or treaty tax determinations. */
(() => {
  'use strict';
  function amount(v, name = 'amount') {
    if (!Number.isFinite(v) || v < 0) throw new Error(name);
    return v;
  }
  function rate(v = 0) {
    if (!Number.isFinite(v) || v < 0 || v >= 1) throw new Error('tax-rate');
    return v;
  }
  function factor(r, t) {
    if (!Number.isFinite(r) || !Number.isFinite(t) || t < 0) throw new Error('growth');
    return t === 0 ? 1 : Math.pow(Math.max(0, 1 + r), t);
  }
  function grow(a, fraction, pricePeriodReturn = null) {
    const balance = amount(a.balance);
    const basis = a.costBasis == null && a.model !== 'brokerage' ? balance : amount(a.costBasis, 'basis');
    if (!Number.isFinite(fraction) || fraction < 0) throw new Error('fraction');
    if (pricePeriodReturn != null && !Number.isFinite(pricePeriodReturn)) throw new Error('period-return');
    const annual = a.annualReturn ?? 0;
    let gross = 0, tax = 0, net = 0, appreciation = 0;
    let next = balance, nextBasis = basis;
    if (a.model === 'cash') {
      gross = balance * (factor(annual, fraction) - 1);
      tax = Math.max(0, gross) * rate(a.interestTaxRate);
      net = gross - tax;
      next += net;
      nextBasis = next;
    } else if (a.model === 'brokerage') {
      const yieldRate = amount(a.dividendYield ?? 0, 'dividend-yield');
      const priceFactor = pricePeriodReturn == null ? factor(annual - yieldRate, fraction)
        : Math.max(0, 1 + pricePeriodReturn);
      appreciation = balance * (priceFactor - 1);
      gross = balance * yieldRate * fraction;
      tax = gross * rate(a.dividendTaxRate);
      net = gross - tax;
      next = Math.max(0, balance + appreciation) + net;
      nextBasis += net; // Only the reinvested, after-tax dividend buys new basis.
    } else if (a.model === 'deferred' || a.model === 'roth') {
      const growth = pricePeriodReturn == null ? factor(annual, fraction) : Math.max(0, 1 + pricePeriodReturn);
      appreciation = balance * (growth - 1);
      next = Math.max(0, balance + appreciation);
    } else throw new Error('tax-model');
    return {
      balance: next, costBasis: nextBasis, deferredCompensation: amount(a.deferredCompensation ?? 0),
      tax, grossIncome: gross, netIncome: net, appreciation,
    };
  }
  function withdraw(a, netNeeded) {
    amount(netNeeded);
    const balance = amount(a.balance);
    const basis = a.costBasis == null && a.model !== 'brokerage' ? balance : amount(a.costBasis, 'basis');
    const deferred = amount(a.deferredCompensation ?? 0);
    let fractionTax = 0;
    let ordinaryFraction = 0;
    if (a.model === 'deferred' || a.model === 'roth') fractionTax = rate(a.effectiveTaxRate);
    else if (a.model === 'brokerage' && balance > 0) {
      const gainFraction = Math.max(0, balance - basis) / balance;
      ordinaryFraction = Math.min(Math.max(0, balance - basis), deferred) / balance;
      fractionTax = ordinaryFraction * rate(a.ordinaryTaxRate) +
        Math.max(0, gainFraction - ordinaryFraction) * rate(a.capitalGainsTaxRate);
    } else if (a.model !== 'cash' && a.model !== 'brokerage') throw new Error('tax-model');
    const gross = Math.min(balance, netNeeded / (1 - fractionTax));
    const tax = gross * fractionTax;
    const net = gross - tax;
    const soldFraction = balance > 0 ? gross / balance : 0;
    return {
      gross, net, tax, balance: Math.max(0, balance - gross),
      ordinaryIncome: gross * ordinaryFraction,
      costBasis: Math.max(0, basis * (1 - soldFraction)),
      deferredCompensation: Math.max(0, deferred * (1 - soldFraction)),
      shortfall: Math.max(0, netNeeded - net),
    };
  }
  function settleRsu({ gross, taxRate, saleMode }) {
    amount(gross);
    if (!['hold', 'sell'].includes(saleMode)) throw new Error('sale-mode');
    const tax = gross * rate(taxRate);
    const net = gross - tax;
    return { grossIncome: gross, tax, cash: saleMode === 'sell' ? net : 0,
      stock: saleMode === 'hold' ? net : 0, costBasis: saleMode === 'hold' ? net : 0 };
  }
  function esppPurchase({ contributions, offeringPrice, purchasePrice, discount, lookback,
    ordinaryTaxRate, taxTiming, saleMode }) {
    amount(contributions);
    amount(offeringPrice, 'offering-price');
    amount(purchasePrice, 'purchase-price');
    if (!offeringPrice || !purchasePrice) throw new Error('missing-price');
    rate(discount);
    rate(ordinaryTaxRate);
    if (!['purchase', 'sale'].includes(taxTiming) || !['hold', 'sell'].includes(saleMode)) throw new Error('settlement');
    const paidPrice = (lookback ? Math.min(offeringPrice, purchasePrice) : purchasePrice) * (1 - discount);
    const shares = contributions / paidPrice;
    const marketValue = shares * purchasePrice;
    const benefit = Math.max(0, marketValue - contributions);
    const recognize = taxTiming === 'purchase' || saleMode === 'sell';
    const tax = recognize ? benefit * ordinaryTaxRate : 0;
    const value = marketValue - tax;
    return {
      shares, paidPrice, marketValue, benefit, tax,
      cash: saleMode === 'sell' ? value : 0, stock: saleMode === 'hold' ? value : 0,
      costBasis: saleMode === 'sell' ? 0 : recognize ? value : contributions,
      deferredCompensation: saleMode === 'hold' && !recognize ? benefit : 0,
    };
  }
  window.NWFinanceTax = { grow, withdraw, settleRsu, esppPurchase };
})();
