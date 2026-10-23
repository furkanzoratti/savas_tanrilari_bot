export const GOVERNOR_FOCUSES = {
  REVENUE: { label: "Gelir İdaresi" },
  PUBLIC_ORDER: { label: "Kamu Düzeni" },
  RECONSTRUCTION: { label: "Yeniden İmar" },
  INTEGRATION: { label: "Bütünleşme" }
} as const;

export type GovernorFocus = keyof typeof GOVERNOR_FOCUSES;

export interface GovernorModifiers {
  incomeMultiplier: number;
  rebellionDelta: number;
  prosperityDelta: number;
  buildingCostMultiplier: number;
}

export function governorAdministration(skillBonus: number, specializationLevel: number): number {
  return Math.max(0, Math.trunc(skillBonus)) + Math.max(0, Math.trunc(specializationLevel));
}

export function governorModifiers(focus: GovernorFocus, administration: number): GovernorModifiers {
  const rating = Math.max(0, Math.trunc(administration));
  switch (focus) {
    case "REVENUE":
      return { incomeMultiplier: Number((1 + Math.min(14, rating * 2) / 100).toFixed(2)), rebellionDelta: 2, prosperityDelta: 0, buildingCostMultiplier: 1 };
    case "PUBLIC_ORDER":
      return { incomeMultiplier: 0.95, rebellionDelta: -(2 + rating), prosperityDelta: 0, buildingCostMultiplier: 1 };
    case "RECONSTRUCTION":
      return { incomeMultiplier: 1, rebellionDelta: 0, prosperityDelta: 2, buildingCostMultiplier: 0.95 };
    case "INTEGRATION":
      return { incomeMultiplier: 1, rebellionDelta: 0, prosperityDelta: 0, buildingCostMultiplier: 1 };
  }
}
