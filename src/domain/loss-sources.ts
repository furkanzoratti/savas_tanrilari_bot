export function allocateLossBySource(
  requested: number,
  totalInitial: number,
  mercenaries: Array<{ contractId: string; quantity: number }>
): { state: number; mercenaries: Array<{ contractId: string; loss: number }> } {
  const capped = Math.max(0, Math.min(Math.floor(requested), Math.floor(totalInitial)));
  const mercTotal = mercenaries.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const sources = [
    { contractId: "STATE", quantity: Math.max(0, totalInitial - mercTotal) },
    ...mercenaries.map((item) => ({ contractId: item.contractId, quantity: Math.max(0, item.quantity) }))
  ].filter((item) => item.quantity > 0);
  if (!capped || !sources.length || totalInitial <= 0) return { state: 0, mercenaries: [] };

  const allocations = sources.map((source) => {
    const exact = capped * source.quantity / totalInitial;
    return { ...source, loss: Math.min(source.quantity, Math.floor(exact)), remainder: exact - Math.floor(exact) };
  });
  let left = capped - allocations.reduce((sum, source) => sum + source.loss, 0);
  for (const source of [...allocations].sort((a, b) => b.remainder - a.remainder || a.contractId.localeCompare(b.contractId))) {
    if (left <= 0) break;
    const extra = Math.min(left, source.quantity - source.loss);
    source.loss += extra;
    left -= extra;
  }

  return {
    state: allocations.find((item) => item.contractId === "STATE")?.loss ?? 0,
    mercenaries: allocations
      .filter((item) => item.contractId !== "STATE" && item.loss > 0)
      .map(({ contractId, loss }) => ({ contractId, loss }))
  };
}
