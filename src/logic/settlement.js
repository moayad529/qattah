// Pure settlement logic (no storage). Same rules as the original app:
// each expense is split among its own `splitAmong` people, weighted by each
// person's shareRatio; legacy expenses without splitAmong are split among everyone.
// `payTo` used to be a single id; it is now a list. Accept both.
export const payeeIds = (payTo) => (Array.isArray(payTo) ? payTo : payTo ? [payTo] : []).filter(Boolean);

export function computeSettlements(participantsIn, expensesIn) {
  const empty = { totalExpense: 0, averagePerShareUnit: 0, totalShareUnits: 0, participants: [], settlements: [] };
  const participants = participantsIn || [];
  const expenses = expensesIn || [];
  if (participants.length === 0) return empty;

  const participantById = Object.fromEntries(participants.map((p) => [p.id, p]));
  const allIds = participants.map((p) => p.id);
  const paid = Object.fromEntries(allIds.map((id) => [id, 0]));
  const owed = Object.fromEntries(allIds.map((id) => [id, 0]));

  expenses.forEach((e) => {
    const rawSplit = Array.isArray(e.splitAmong) && e.splitAmong.length > 0 ? e.splitAmong : allIds;
    const splitIds = rawSplit.filter((id) => participantById[id]);
    if (splitIds.length === 0) return;

    if (paid[e.participantId] !== undefined) paid[e.participantId] += e.amount;

    const unitsTotal = splitIds.reduce((sum, id) => sum + (participantById[id]?.shareRatio ?? 0), 0);
    if (unitsTotal <= 0) return;
    splitIds.forEach((id) => {
      owed[id] += e.amount * (participantById[id].shareRatio / unitsTotal);
    });
  });

  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalShareUnits = participants.reduce((sum, p) => sum + p.shareRatio, 0);
  const averagePerShareUnit = totalShareUnits > 0 ? totalExpense / totalShareUnits : 0;

  const balances = participants.map((p) => ({
    id: p.id,
    name: p.name,
    shareRatio: p.shareRatio,
    totalExpense: paid[p.id],
    shouldPay: owed[p.id],
    balance: paid[p.id] - owed[p.id],
  }));

  const debtors = balances.map((b) => ({ ...b })).filter((b) => b.balance < 0).sort((a, b) => a.balance - b.balance);
  const creditors = balances.map((b) => ({ ...b })).filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);

  const settlements = [];
  const pushSettlement = (debtor, creditor, preferred) => {
    const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
    if (amount <= 0.005) return 0;
    settlements.push({
      from: debtor.name,
      to: creditor.name,
      amount: parseFloat(amount.toFixed(2)),
      ...(preferred ? { preferred: true } : {}),
    });
    debtor.balance += amount;
    creditor.balance -= amount;
    return amount;
  };

  // Phase 1 — the trip owner may ask that a member pays specific people first (`payTo`:
  // one id, or a list of ids in priority order — the order they were chosen).
  // Each chosen person is paid only while he is still owed money; whatever cannot be
  // paid to them falls through to phase 2 and goes to the other creditors.
  // Debtors are served biggest debt first, so when several people choose the same
  // payee his balance fills up in that order and the rest overflow to the others.
  const creditorById = Object.fromEntries(creditors.map((c) => [c.id, c]));
  debtors.forEach((debtor) => {
    const person = participantById[debtor.id];
    const wanted = person ? payeeIds(person.payTo) : [];
    wanted.forEach((id) => {
      const creditor = id !== debtor.id ? creditorById[id] : null;
      if (creditor && creditor.balance > 0.005 && debtor.balance < -0.005) pushSettlement(debtor, creditor, true);
    });
  });

  // Phase 2 — the original rule: biggest debtor pays the biggest creditor.
  const openDebtors = debtors.filter((d) => d.balance < -0.01).sort((a, b) => a.balance - b.balance);
  const openCreditors = creditors.filter((c) => c.balance > 0.01).sort((a, b) => b.balance - a.balance);
  let di = 0;
  let ci = 0;
  while (di < openDebtors.length && ci < openCreditors.length) {
    const debtor = openDebtors[di];
    const creditor = openCreditors[ci];
    pushSettlement(debtor, creditor, false);
    if (Math.abs(debtor.balance) < 0.01) di++;
    if (creditor.balance < 0.01) ci++;
  }

  // Present the result grouped by DEBTOR: all of one person's payments sit together.
  // Debtors: biggest total first (ties by name). Inside a group: the people the owner
  // chose come first (in his priority order), then the rest, biggest amount first.
  const totalOwedBy = {};
  settlements.forEach((x) => {
    totalOwedBy[x.from] = (totalOwedBy[x.from] || 0) + x.amount;
  });
  const seq = new Map(settlements.map((x, i) => [x, i]));
  settlements.sort((a, b) => {
    if (a.from !== b.from) return totalOwedBy[b.from] - totalOwedBy[a.from] || a.from.localeCompare(b.from);
    if (!!a.preferred !== !!b.preferred) return a.preferred ? -1 : 1;
    if (a.preferred) return seq.get(a) - seq.get(b);
    return b.amount - a.amount || seq.get(a) - seq.get(b);
  });

  const r2 = (n) => parseFloat(n.toFixed(2));
  return {
    totalExpense: r2(totalExpense),
    averagePerShareUnit: r2(averagePerShareUnit),
    totalShareUnits,
    participants: balances.map((b) => ({
      id: b.id,
      name: b.name,
      shareRatio: b.shareRatio,
      totalExpense: r2(b.totalExpense),
      shouldPay: r2(b.shouldPay),
      balance: r2(b.balance),
    })),
    settlements,
  };
}
