/* Private profile data stays in this browser worker; no network submission. */
self.window = self;
importScripts('core.js?v=20261125-4', 'finance-state.js?v=20261125-4', 'finance-tax.js?v=20261125-4',
  'finance-timeline.js?v=20261125-4', 'finance-engine.js?v=20261125-4');
self.onmessage = event => {
  try { self.postMessage({ result: NWFinanceEngine.monteCarlo(event.data.state) }); }
  catch (error) { self.postMessage({ error: error.message || 'simulation-error' }); }
};
