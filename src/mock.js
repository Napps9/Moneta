import { LunchFlowError, normalizeAccount, normalizeBalance } from './lunchflow.js';

/**
 * A stand-in for the real client so the app can be run and developed without
 * an API key. Shapes mirror what the Lunch Flow API returns.
 */

const ACCOUNTS = [
  { id: 101, name: 'Current Account', institution_name: 'Monzo', institution_logo: '', provider: 'gocardless', currency: 'GBP', status: 'ACTIVE' },
  { id: 102, name: 'Savings Pot', institution_name: 'Monzo', institution_logo: '', provider: 'gocardless', currency: 'GBP', status: 'ACTIVE' },
  { id: 201, name: 'Compte Courant', institution_name: 'BNP Paribas', institution_logo: '', provider: 'gocardless', currency: 'EUR', status: 'ACTIVE' },
  { id: 202, name: 'Livret A', institution_name: 'BNP Paribas', institution_logo: '', provider: 'gocardless', currency: 'EUR', status: 'ACTIVE' },
  { id: 301, name: 'Platinum Card', institution_name: 'American Express', institution_logo: '', provider: 'gocardless', currency: 'EUR', status: 'ACTIVE' },
  { id: 401, name: 'Total Checking', institution_name: 'Chase', institution_logo: '', provider: 'quiltt', currency: 'USD', status: 'DISCONNECTED' },
  { id: 501, name: 'Brokerage', institution_name: 'Interactive Brokers', institution_logo: '', provider: 'simplefin', currency: 'USD', status: 'ERROR' },
];

// Both balance shapes seen in the wild are represented on purpose.
const BALANCES = {
  101: { available: 2431.18, current: 2510.43, currency: 'GBP' },
  102: { available: 8000, current: 8000, currency: 'GBP' },
  201: { amount: 1834.27, currency: 'EUR' },
  202: { amount: 12450.0, currency: 'EUR' },
  301: { available: 4127.5, current: -872.5, currency: 'EUR' },
  401: { available: 640.12, current: 640.12, currency: 'USD' },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMockClient({ delayMs = 120 } = {}) {
  return {
    async listAccounts() {
      await sleep(delayMs);
      return ACCOUNTS.map(normalizeAccount);
    },
    async getBalance(accountId) {
      await sleep(delayMs);
      const raw = BALANCES[accountId];
      if (!raw) {
        throw new LunchFlowError('Internal Server Error: An unexpected error occurred while fetching balance.', {
          status: 500,
          code: 'Internal Server Error',
        });
      }
      return normalizeBalance(raw);
    },
  };
}
