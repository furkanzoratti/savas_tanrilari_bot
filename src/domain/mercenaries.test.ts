import { describe, expect, it } from "vitest";
import { MERCENARY_COMPANIES, MERCENARY_CONTRACT_LIMITS, importedMercenarySchedule, mercenaryContractSchedule, mercenaryPersonnel } from "./mercenaries.js";

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

  it("26 şirketi özel savaş bonusu olmadan standart bileşimleriyle saklar", () => {
    expect(Object.keys(MERCENARY_COMPANIES)).toHaveLength(26);
    expect(MERCENARY_COMPANIES.hellas_breach_company.siege).toEqual({ ram: 1, ladder_group: 1, siege_tower: 1 });
    expect(mercenaryPersonnel(MERCENARY_COMPANIES.aegean_free_fleet)).toBe(500);
  });
});
