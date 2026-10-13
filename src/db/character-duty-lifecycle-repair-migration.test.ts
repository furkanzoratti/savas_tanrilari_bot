import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {characterDutyLifecycleRepairMigration} from "./character-duty-lifecycle-repair-migration.js";

describe("karakter görevi yaşam döngüsü onarımı",()=>{
  it("eski tutsak ve yok olmuş devlet kayıtlarını kapatır",()=>{
    expect(characterDutyLifecycleRepairMigration.version).toBe(195);
    expect(characterDutyLifecycleRepairMigration.sql).toContain("espionage_captivities");
    expect(characterDutyLifecycleRepairMigration.sql).toContain("country.status='YOK_EDİLDİ'");
    expect(characterDutyLifecycleRepairMigration.sql).toContain("character_status='DISMISSED'");
    expect(characterDutyLifecycleRepairMigration.sql).toContain("UPDATE country_vassalages");
    expect(characterDutyLifecycleRepairMigration.sql).toContain("overlord_country_id");
    expect(migrations.find((migration)=>migration.version===195)).toBe(characterDutyLifecycleRepairMigration);
  });
});
