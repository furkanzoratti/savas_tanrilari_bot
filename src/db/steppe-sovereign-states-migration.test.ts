import {describe,expect,it} from "vitest";
import {steppeSovereignStatesMigration} from "./steppe-sovereign-states-migration.js";

describe("bozkır iç siyasetini bağımsız devletlere dönüştüren migration",()=>{
  const migration=steppeSovereignStatesMigration;

  it("yedi eski toprak ağalığını ikişer yerleşkeli devlete dönüştürür",()=>{
    expect(migration.version).toBe(181);
    expect(migration.name).toBe("retire_steppe_titles_and_form_sovereign_states");
    for(const expected of [
      ["Baykal Devleti","Barguzin Vadisi","Uda Otlakları"],
      ["Sayan Devleti","Sayan Yaylası","Yukarı Yenisey"],
      ["Hangay Devleti","Hangay Yaylası","Orhun Kavşağı"],
      ["Khentii Devleti","Khentii Otlakları","Ongin Geçidi"],
      ["Onon Devleti","Onon Geçidi","Argun Otlakları"],
      ["Hulun Devleti","Hulun Gölü","Buir Gölü"],
      ["Khingan Devleti","Büyük Khingan","Nen Nehri Pazarı"]
    ]){
      for(const value of expected) expect(migration.sql).toContain(value);
    }
    expect(migration.sql).toContain("UPDATE settlements settlement");
    expect(migration.sql).toContain("SET country_id=target.id");
  });

  it("özel bozkır ordu doktrinini yalnız ana konfederasyonlarda tutar",()=>{
    expect(migration.sql).toContain("ADD COLUMN IF NOT EXISTS is_steppe_state BOOLEAN");
    expect(migration.sql).toContain("is_steppe_state=TRUE");
    expect(migration.sql).toContain("is_steppe_state=FALSE");
    expect(migration.sql).not.toContain("INSERT INTO country_special_unit_unlocks");
  });

  it("oyuncu, hanedan ve ordu bağlarını yeni ülkeye taşır",()=>{
    expect(migration.sql).toContain("INSERT INTO country_members");
    expect(migration.sql).toContain("UPDATE dynasties dynasty");
    expect(migration.sql).toContain("steppe_title_id=NULL");
    expect(migration.sql).toContain("UPDATE armies army");
    expect(migration.sql).toContain("UPDATE country_characters character");
  });

  it("geçişi idari sahiplik kaydıyla saklayıp yalnız Toprak Ağası katmanını kapatır",()=>{
    expect(migration.sql).toContain("settlement_ownership_history");
    expect(migration.sql).toContain("'ADMIN'");
    expect(migration.sql).toContain("UPDATE steppe_internal_titles SET status='REMOVED'");
    expect(migration.sql).toContain("tier='LANDHOLDER'");
    expect(migration.sql).not.toContain("UPDATE steppe_confederations SET status='ENDED'");
    expect(migration.sql).not.toContain("DELETE FROM steppe_hegemonies");
  });
});
