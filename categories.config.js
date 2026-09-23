// Categories for the Accounts sheet. Edit this file and push: Vercel redeploys.
//
// Outgoings can be a plain category (Groceries) or a parent with sub-categories.
// Transactions are always filed under a plain category or a sub-category; a
// parent is just the sum of its subs. `keywords` are words that, when found in
// a transaction's merchant or description, file it there automatically (whole
// words, case-insensitive). Choices made in the app override these.
export default {
  income: [
    { id: 'salary', label: 'Salary', keywords: ['salary', 'payroll', 'wages'] },
    { id: 'loanrepay', label: 'Loan Repayments', keywords: ['repay', 'repayment'] },
    { id: 'miscincome', label: 'Misc Income', keywords: ['refund', 'cashback', 'interest'] },
  ],

  outgoings: [
    { id: 'groceries', label: 'Groceries', keywords: ['tesco', "sainsbury's", 'sainsburys', 'aldi', 'lidl', 'waitrose', 'asda', 'morrisons', 'co-op', 'coop', 'ocado', 'iceland'] },
    {
      id: 'luxuries',
      label: 'Luxuries',
      subs: [
        { id: 'foodout', label: 'Food Out', keywords: ['pret', 'deliveroo', 'uber eats', 'just eat', "mcdonald's", 'mcdonalds', "nando's", 'nandos', 'wagamama', 'greggs', 'costa', 'starbucks', 'cafe', 'restaurant', 'pizza'] },
        { id: 'subscriptions', label: 'Subscriptions', keywords: ['netflix', 'spotify', 'apple.com', 'prime video', 'amazon prime', 'disney', 'youtube', 'now tv', 'audible', 'icloud', 'patreon'] },
        { id: 'clothes', label: 'Clothes', keywords: ['zara', 'uniqlo', 'h&m', 'primark', 'asos', 'next retail', 'marks & spencer', 'm&s'] },
        { id: 'weekend', label: 'Weekend', keywords: ['pub', 'bar', 'cinema', 'odeon', 'vue', 'brewdog', 'wetherspoon', 'tavern'] },
        { id: 'holidays', label: 'Holidays', keywords: ['easyjet', 'ryanair', 'british airways', 'booking.com', 'airbnb', 'hotel', 'jet2', 'tui', 'expedia'] },
      ],
    },
    {
      id: 'living',
      label: 'Living',
      subs: [
        { id: 'water', label: 'Water', keywords: ['thames water', 'anglian water', 'severn trent', 'united utilities', 'yorkshire water', 'welsh water', 'southern water'] },
        { id: 'energy', label: 'Energy', keywords: ['edf', 'octopus', 'british gas', 'e.on', 'eon', 'ovo', 'scottish power', 'shell energy', 'utilita', 'bulb'] },
        { id: 'rent', label: 'Rent', keywords: ['rent'] },
        { id: 'counciltax', label: 'Council Tax', keywords: ['council tax', 'council'] },
      ],
    },
    {
      id: 'health',
      label: 'Health',
      subs: [
        { id: 'dentist', label: 'Dentist', keywords: ['dentist', 'dental'] },
        { id: 'gym', label: 'Gym', keywords: ['gym', 'puregym', 'david lloyd', 'virgin active', 'nuffield'] },
        { id: 'doctors', label: 'Doctors', keywords: ['doctor', 'clinic', 'nhs', 'bupa'] },
        { id: 'pharmacy', label: 'Pharmacy', keywords: ['boots', 'superdrug', 'pharmacy', 'chemist'] },
        { id: 'optician', label: 'Optician', keywords: ['specsavers', 'vision express', 'optician', 'optical'] },
      ],
    },
    {
      id: 'transport',
      label: 'Transport',
      subs: [
        { id: 'carbike', label: 'Car/Bike', keywords: ['halfords', 'kwik fit', 'dvla', 'mot', 'evans cycles', 'parking'] },
        { id: 'fuel', label: 'Fuel', keywords: ['shell', 'bp', 'esso', 'texaco', 'petrol', 'fuel'] },
        { id: 'travel', label: 'Travel', keywords: ['tfl', 'trainline', 'national rail', 'uber', 'bolt', 'national express', 'stagecoach', 'first bus', 'arriva', 'gwr', 'lner', 'avanti'] },
      ],
    },
    {
      id: 'money',
      label: 'Money',
      subs: [
        { id: 'hsbcloan', label: 'HSBC Loan', keywords: ['hsbc loan'] },
        { id: 'hsbcod', label: 'HSBC Overdraft', keywords: ['overdraft'] },
        { id: 'creditcard', label: 'Credit Card', keywords: ['amex', 'american express', 'barclaycard', 'credit card', 'capital one', 'mbna', 'vanquis'] },
        { id: 'tax', label: 'Tax', keywords: ['hmrc'] },
        { id: 'business', label: 'Business Account' },
        { id: 'loanedout', label: 'Loaned Out' },
      ],
    },
    {
      id: 'misc',
      label: 'Misc',
      subs: [
        { id: 'phone', label: 'Phone', keywords: ['vodafone', 'o2', 'three', 'giffgaff', 'sky mobile', 'tesco mobile', 'ee ltd', 'lebara', 'smarty'] },
        { id: 'miscother', label: 'Misc' },
      ],
    },
  ],

  // Money moved between your own accounts. Shown on the sheet but kept out of
  // the income and outgoings totals. Another connected account's name in the
  // description counts as a transfer too.
  transfers: {
    keywords: ['pot transfer', 'transfer to', 'transfer from', 'savings pot', 'internal transfer'],
  },
};
