import { LunchFlowError, normalizeAccount, normalizeBalance, normalizeTransaction } from './lunchflow.js';

/**
 * A stand-in for the real client so the app can be run and developed without
 * an API key. Shapes mirror what the Lunch Flow API returns. Transactions are
 * generated deterministically per account so screens look the same every run.
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

// How busy each account is: [outgoing transactions per week, monthly income].
const PROFILES = {
  101: { perWeek: 12, salary: 2650, incomeLabel: 'ACME LTD SALARY' },
  102: { perWeek: 0.3, salary: 0, interest: 12.4 },
  201: { perWeek: 6, salary: 1900, incomeLabel: 'VIREMENT SALAIRE' },
  202: { perWeek: 0.2, salary: 0, interest: 31.1 },
  301: { perWeek: 8, salary: 0, cardPayment: 900 },
  401: { perWeek: 4, salary: 1400, incomeLabel: 'PAYROLL' },
};

const MERCHANTS = [
  ['Tesco', 'Groceries'], ["Sainsbury's", 'Groceries'], ['TfL', 'Transport'], ['Amazon', 'Shopping'], ['Netflix', 'Entertainment'],
  ['Pret A Manger', 'Eating out'], ['Shell', 'Transport'], ['Boots', 'Health'], ['Spotify', 'Entertainment'], ['EDF Energy', 'Bills'],
  ['Deliveroo', 'Eating out'], ['Uber', 'Transport'], ['Zara', 'Shopping'], ['Costa Coffee', 'Eating out'], ['Vodafone', 'Bills'],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoDate = (date) => date.toISOString().slice(0, 10);
const money = (value) => Math.round(value * 100) / 100;

export function generateTransactions(account, { days = 150, now = Date.now() } = {}) {
  const profile = PROFILES[account.id] || { perWeek: 2, salary: 0 };
  const rand = mulberry32(Number(account.id) || 1);
  const out = [];
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  for (let back = 0; back < days; back += 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - back);
    const iso = isoDate(date);
    const day = date.getUTCDate();

    const expected = profile.perWeek / 7;
    let count = Math.floor(expected);
    if (rand() < expected - count) count += 1;
    for (let i = 0; i < count; i += 1) {
      const [merchant, category] = MERCHANTS[Math.floor(rand() * MERCHANTS.length)];
      const amount = -money(2.5 + rand() * rand() * 140);
      out.push({ id: `${account.id}-${iso}-${i}`, accountId: account.id, date: iso, amount, currency: account.currency, merchant, description: merchant.toUpperCase(), category, isPending: back === 0 && i === 0 });
    }
    if (profile.salary && day === 25) {
      out.push({ id: `${account.id}-${iso}-salary`, accountId: account.id, date: iso, amount: money(profile.salary + rand() * 120), currency: account.currency, merchant: null, description: profile.incomeLabel || 'SALARY', category: 'Income', isPending: false });
    }
    if (profile.interest && day === 1) {
      out.push({ id: `${account.id}-${iso}-interest`, accountId: account.id, date: iso, amount: money(profile.interest + rand() * 3), currency: account.currency, merchant: null, description: 'INTEREST PAID', category: 'Interest', isPending: false });
    }
    if (profile.cardPayment && day === 15) {
      out.push({ id: `${account.id}-${iso}-payment`, accountId: account.id, date: iso, amount: money(profile.cardPayment + rand() * 300), currency: account.currency, merchant: null, description: 'PAYMENT RECEIVED - THANK YOU', category: 'Payment', isPending: false });
    }
  }
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMockClient({ delayMs = 120, now = () => Date.now() } = {}) {
  const transactionCache = new Map();
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
    async listTransactions(accountId, { from = null, to = null } = {}) {
      await sleep(delayMs);
      const account = ACCOUNTS.find((a) => String(a.id) === String(accountId));
      if (!account) throw new LunchFlowError('Not Found: Account not found.', { status: 404, code: 'Not Found' });
      if (!BALANCES[accountId]) {
        throw new LunchFlowError('Internal Server Error: An unexpected error occurred while fetching transactions.', {
          status: 500,
          code: 'Internal Server Error',
        });
      }
      if (!transactionCache.has(accountId)) transactionCache.set(accountId, generateTransactions(account, { now: now() }));
      return transactionCache
        .get(accountId)
        .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
        .map(normalizeTransaction);
    },
  };
}
