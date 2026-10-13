import {describe,expect,it} from "vitest";
import {espionageCaptivitiesMigration} from "./espionage-captivities-migration.js";
import {migrations} from "./migrations.js";

describe("espionage captivities migration",()=>{
  it("kaçırılan karakter ve soylular için tek etkin kalıcı esaret kaydı kurar",()=>{
    expect(espionageCaptivitiesMigration.version).toBe(194);
    expect(espionageCaptivitiesMigration.sql).toContain("CREATE TABLE IF NOT EXISTS espionage_captivities");
    expect(espionageCaptivitiesMigration.sql).toContain("'CHARACTER','DYNASTY','ROMAN_FAMILY'");
    expect(espionageCaptivitiesMigration.sql).toContain("WHERE status='HELD'");
    expect(espionageCaptivitiesMigration.sql).toContain("'HELD','RELEASED','EXECUTED'");
    expect(espionageCaptivitiesMigration.sql).toContain("operation.target_type='KIDNAP'");
    expect(migrations.find((migration)=>migration.version===194)).toBe(espionageCaptivitiesMigration);
  });
});
