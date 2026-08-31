import { describe, expect, it } from "vitest";
import { MERCENARY_COMPANIES, MERCENARY_CONTRACT_LIMITS, importedMercenarySchedule, mercenaryContractSchedule, mercenaryPersonnel, mercenaryTerminationUpkeep } from "./mercenaries.js";

describe("paralı asker sözleşmeleri", () => {
  it("ikinci turda yapılan sözleşmenin ilk bakımını üçüncü tura koyar", () => {
    expect(mercenaryContractSchedule(2)).toEqual({ arrivalTurn: 3, endTurn: 5, firstUpkeepTurn: 3 });
  });

  it("manuel devralınan şirketten ilk bakımı sonraki turda alır", () => {
    expect(importedMercenarySchedule(8)).toEqual({ hiredTurn: 7, arrivalTurn: 8, endTurn: 10, lastUpkeepTurn: 8, firstUpkeepTurn: 9 });
  });

  it("Barış Düzeninde üç sözleşme hakkı verir", () => {
    expect(MERCENARY_CONTRACT_LIMITS.PEACE).toBe(3);
  });

  it("Alım Turunda kiralanıp iki tur sonra feshedilen şirkete iki bölümlük bakım uygular", () => {
    expect(mercenaryTerminationUpkeep({ turnUpkeep: 1_300, hiredTurn: 6, currentTurn: 8, acquisitionInterval: 3, lastUpkeepTurn: null, unpaid: false }))
      .toEqual({ amount: 867, chargedTurns: 2 });
  });

  it("bakımı daha önce alınmış şirkete fesihte ikinci kez bakım yazmaz", () => {
    expect(mercenaryTerminationUpkeep({ turnUpkeep: 1_300, hiredTurn: 5, currentTurn: 8, acquisitionInterval: 3, lastUpkeepTurn: 6, unpaid: false }))
      .toEqual({ amount: 0, chargedTurns: 0 });
  });
  it("26 şirketi özel savaş bonusu olmadan standart bileşimleriyle saklar", () => {
    expect(Object.keys(MERCENARY_COMPANIES)).toHaveLength(26);
    expect(MERCENARY_COMPANIES.hellas_breach_company.siege).toEqual({ ram: 1, ladder_group: 1, siege_tower: 1 });
    expect(mercenaryPersonnel(MERCENARY_COMPANIES.aegean_free_fleet)).toBe(500);
  });
});
