import {describe,expect,it} from "vitest";
import {STEPPE_DOCTRINE_COUNTRIES,steppeVassalDoctrineMigration as migration} from "./steppe-vassal-doctrine-migration.js";

describe("bozkır vassal devlet doktrini",()=>{
  it("üç konfederasyon ile yedi planlanan vassala özel birlik ve kompozisyon açar",()=>{
    expect(migration.version).toBe(184);
    expect(STEPPE_DOCTRINE_COUNTRIES).toEqual([
      "Xiongnu Konfederasyonu","Dingling Konfederasyonu","Xianbei Konfederasyonu",
      "Baykal Devleti","Sayan Devleti","Hangay Devleti","Khentii Devleti",
      "Onon Devleti","Hulun Devleti","Khingan Devleti"
    ]);
    for(const name of STEPPE_DOCTRINE_COUNTRIES)expect(migration.sql).toContain(name);
    for(const unit of ["horse_archer","steppe_cavalry","kurgan_shieldbearer","oba_archer"]){
      expect(migration.sql).toContain(unit);
    }
    expect(migration.sql).toContain("SET is_steppe_state=");
    expect(migration.sql).toContain("country.is_steppe_state=TRUE");
    expect(migration.sql).toContain("country.is_steppe_state=FALSE");
  });
});
