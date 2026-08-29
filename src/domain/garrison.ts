export interface GarrisonComposition {
  lightInfantry: number;
  spears: number;
  archers: number;
}

export interface GarrisonDeficit {
  lightInfantry: number;
  spears: number;
  archers: number;
}

export function garrisonLevel(population: number): number {
  if (population < 50_000) return 0;
  return Math.floor(population / 25_000) - 1;
}

export function garrisonComposition(population: number): GarrisonComposition {
  if (population <= 0) return { lightInfantry: 0, spears: 0, archers: 0 };

  if (population < 50_000) {
    const total = Math.floor(population * 0.01);
    const lightInfantry = Math.floor(total * 0.4);
    const spears = Math.floor(total * 0.4);
    return { lightInfantry, spears, archers: total - lightInfantry - spears };
  }

  const blocks = Math.floor(population / 25_000);
  return { lightInfantry: blocks * 100, spears: blocks * 100, archers: blocks * 50 };
}

export function garrisonDeficit(target: GarrisonComposition, current: Partial<GarrisonComposition>): GarrisonDeficit {
  return {
    lightInfantry: Math.max(0, target.lightInfantry - (current.lightInfantry ?? 0)),
    spears: Math.max(0, target.spears - (current.spears ?? 0)),
    archers: Math.max(0, target.archers - (current.archers ?? 0))
  };
}

export function garrisonPersonnel(composition: GarrisonComposition): number {
  return composition.lightInfantry + composition.spears + composition.archers;
}

/** Standart market fiyatlarının 1.000 askerlik paketlerden kişi başına paylaştırılmış hâli. */
export function garrisonRecruitmentCost(composition: GarrisonComposition): number {
  return Math.ceil(
    composition.lightInfantry
    + composition.spears * 2
    + composition.archers * 2.5
  );
}
