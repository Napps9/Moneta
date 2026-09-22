// How Moneta groups your accounts. Edit this file and push: Vercel redeploys.
//
// Every account lands in exactly one group. Most are recognised from their
// name ("Chase Saver" is savings, "Monzo Flex" is credit, anything else is
// spending). Put an account under `accounts` to override that.
export default {
  // Groups, in the order they appear on the page.
  groups: [
    { id: 'savings', label: 'Savings' },
    { id: 'spending', label: 'Spending' },
    { id: 'credit', label: 'Credit' },
  ],

  // Manual assignments. The key is the account name, "Institution · Account name",
  // or the numeric account id; the value is a group id from the list above.
  accounts: {
    // 'Account 1': 'savings',
    // 'Monzo · Personal Account': 'spending',
    // '12345': 'credit',
  },

  // Extra words that put an account in a group, in addition to the built-in
  // ones (saver, savings, isa, pot, credit, card, flex, loan, ...).
  keywords: {
    // savings: ['rainy day'],
    // credit: ['klarna'],
  },

  // Accounts with no matching words go here.
  defaultGroup: 'spending',
};
