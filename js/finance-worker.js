/* Private profile data stays in this browser worker; no network submission. */
self.window = self;
importScripts('core.js?v=20261125-3', 'finance-state.js?v=20261125-3', 'finance-tax.js?v=20261125-3',
  'finance-timeline.js?v=20261125-3', 'finance-engine.js?v=20261125-3');
self.onmessage = event => {
  try { self.postMessage({ result: NWFinanceEngine.monteCarlo(event.data.state) }); }
  catch (error) { self.postMessage({ error: error.message || 'simulation-error' }); }
};
