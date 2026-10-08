import {describe,expect,it} from "vitest";
import {dynastyMarriageHouseTransferMigration} from "./dynasty-marriage-house-transfer-migration.js";

describe("evlenen kadının yeni haneye geçiş migrationı",()=>{
  it("doğduğu haneyi korur ve mevcut yabancı evlilikleri kocanın hanesine taşır",()=>{
    expect(dynastyMarriageHouseTransferMigration.version).toBe(148);
    expect(dynastyMarriageHouseTransferMigration.sql).toContain("birth_dynasty_id");
    expect(dynastyMarriageHouseTransferMigration.sql).toContain("wife.gender='FEMALE'");
    expect(dynastyMarriageHouseTransferMigration.sql).toContain("husband.gender='MALE'");
    expect(dynastyMarriageHouseTransferMigration.sql).toContain("dynasty_id=transfer.target_dynasty_id");
    expect(dynastyMarriageHouseTransferMigration.sql).toContain("relation='Evlilik yoluyla hanedana katıldı'");
  });

  it("çift bazlı gebelik sayacını yeni haneye aktarır",()=>{
    expect(dynastyMarriageHouseTransferMigration.sql).toContain("INSERT INTO dynasty_couple_birth_attempts");
    expect(dynastyMarriageHouseTransferMigration.sql).toContain("attempt.dynasty_id=transfer.source_dynasty_id");
  });
});
