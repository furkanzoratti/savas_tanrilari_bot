export function assimilationCompletionTurn(input: {
  conqueredTurn: number;
  hasWine: boolean;
  diplomatSkillBonus?: number | null;
}): number {
  const diplomatReduction = input.diplomatSkillBonus === null || input.diplomatSkillBonus === undefined
    ? 0
    : input.diplomatSkillBonus >= 2 ? 2 : 1;
  const wineReduction = input.hasWine ? 1 : 0;
  return input.conqueredTurn + 6 - wineReduction - diplomatReduction;
}
