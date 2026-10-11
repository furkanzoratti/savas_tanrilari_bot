import {describe,expect,it} from "vitest";
import {steppeKhanateRestorationMigration} from "./steppe-khanate-restoration-migration.js";

describe("üç devletli bozkır hanlığı migration",()=>{
  const migration=steppeKhanateRestorationMigration;

  it("bozkır doktrinini yalnız Xiongnu, Dingling ve Xianbei için açar",()=>{
    expect(migration.version).toBe(182);
    for(const name of ["Xiongnu Konfederasyonu","Dingling Konfederasyonu","Xianbei Konfederasyonu"]){
      expect(migration.sql).toContain(name);
    }
    expect(migration.sql).toContain("country.is_steppe_state=FALSE");
    expect(migration.sql).toContain("DELETE FROM country_special_unit_unlocks");
    expect(migration.sql).toContain("'horse_archer','steppe_cavalry','kurgan_shieldbearer','oba_archer'");
  });

  it("Xiongnu hegemonyasını ve iki bağlı Hanı yeniden kurar",()=>{
    expect(migration.sql).toContain("INSERT INTO steppe_hegemonies");
    expect(migration.sql).toContain("INSERT INTO steppe_tributaries");
    expect(migration.sql).toContain("title.tier='KHAN'");
    expect(migration.sql).toContain("HAVING COUNT(*)=1");
    expect(migration.sql).toContain("title.tier='LANDHOLDER'");
    expect(migration.sql).toContain("status='REMOVED'");
  });
});
