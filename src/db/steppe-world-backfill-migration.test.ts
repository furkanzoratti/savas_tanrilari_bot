import {describe,expect,it} from "vitest";
import {STEPPE_SETTLEMENT_SEEDS} from "./steppe-settlements-migration.js";
import {steppeWorldBackfillMigration} from "./steppe-world-backfill-migration.js";

describe("bozkır dünyası canlı veritabanı onarımı",()=>{
  it("üç devleti ve tüm bağlı kayıtları eski göçler uygulanmış olsa da tamamlar",()=>{
    expect(steppeWorldBackfillMigration.version).toBe(169);
    expect(steppeWorldBackfillMigration.sql).toContain("FROM guilds guild");
    expect(steppeWorldBackfillMigration.sql).toContain("Dingling Konfederasyonu");
    expect(steppeWorldBackfillMigration.sql).toContain("Xianbei Konfederasyonu");
    expect(steppeWorldBackfillMigration.sql).toContain("Xiongnu Konfederasyonu");
    expect(steppeWorldBackfillMigration.sql).toContain("INSERT INTO settlements");
    expect(steppeWorldBackfillMigration.sql).toContain("INSERT INTO steppe_title_holdings");
    expect(steppeWorldBackfillMigration.sql).toContain("INSERT INTO steppe_common_holdings");
    expect(steppeWorldBackfillMigration.sql).toContain("INSERT INTO steppe_hegemonies");
    for(const settlement of STEPPE_SETTLEMENT_SEEDS){
      expect(steppeWorldBackfillMigration.sql).toContain(settlement.name);
    }
  });
});
