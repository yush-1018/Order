const LedgerEntry = require('../models/LedgerEntry');

/**
 * Calculates current customer balance:
 * Customer balance = sum(debits) - sum(credits) + sum(reversals)
 * Positive balance means customer owes money (Udhar)
 */
async function getCustomerBalance(businessId, customerId) {
  const entries = await LedgerEntry.find({ businessId, customerId });
  let balance = 0;

  for (const entry of entries) {
    if (entry.type === 'debit') {
      balance += entry.amount;
    } else if (entry.type === 'credit') {
      balance -= entry.amount;
    } else if (entry.type === 'reversal') {
      balance += entry.amount;
    }
  }

  return Math.round(balance * 100) / 100;
}

/**
 * Append-only ledger entry creator
 * Golden rule: Never edit or delete entries. Corrections/refunds are new entries.
 */
async function recordLedgerEntry({ businessId, customerId, orderId, paymentId, type, amount, note = '' }) {
  if (amount < 0) {
    throw new Error('Ledger entry amount cannot be negative');
  }

  // Get previous balance
  const previousBalance = await getCustomerBalance(businessId, customerId);

  let newBalance = previousBalance;
  if (type === 'debit') {
    newBalance += amount;
  } else if (type === 'credit') {
    newBalance -= amount;
  } else if (type === 'reversal') {
    newBalance += amount;
  }

  newBalance = Math.round(newBalance * 100) / 100;

  const entry = await LedgerEntry.create({
    businessId,
    customerId,
    orderId,
    paymentId,
    type,
    amount: Math.round(amount * 100) / 100,
    balanceAfter: newBalance,
    note: note.trim(),
  });

  return entry;
}

module.exports = {
  getCustomerBalance,
  recordLedgerEntry,
};
