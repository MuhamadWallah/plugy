import { env } from '../config/env.js';

const formatter = (() => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: env.CURRENCY, currencyDisplay: 'narrowSymbol' });
  } catch {
    return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });
  }
})();

/** Formats an amount in the marketplace currency (CURRENCY), e.g. "$25.00" */
export const formatMoney = (value: unknown): string => formatter.format(Number(value));
