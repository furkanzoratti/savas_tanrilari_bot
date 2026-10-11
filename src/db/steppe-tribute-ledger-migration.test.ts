import {describe,expect,it} from "vitest";
import {steppeTributeLedgerMigration as migration} from "./steppe-tribute-ledger-migration.js";

describe("bozkır haraç muhasebe geçmişi göçü",()=>{
  it("yeni anlık görüntü alanlarını ekler ve eski işlemleri geriye dönük doldurur",()=>{
    expect(migration.version).toBe(186);
    expect(migration.sql).toContain("acquisition_income BIGINT");
    expect(migration.sql).toContain("treasury_before BIGINT");
    expect(migration.sql).toContain("treasury_after BIGINT");
    expect(migration.sql).toContain("ALTER COLUMN acquisition_income SET NOT NULL");
    expect(migration.sql).toContain("STEPPE_TRIBUTE_OUT");
    expect(migration.sql).toContain("reconstructed_after");
    expect(migration.sql).toContain("zero_payment_snapshots");
  });
});
