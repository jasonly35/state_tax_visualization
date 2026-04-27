export const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const fmtPct = (n: number) =>
  (n * 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';

export const fmtPctShort = (n: number) =>
  (n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
