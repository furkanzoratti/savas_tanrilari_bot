import {describe,expect,it} from "vitest";
import {romanRepublicFamilyRostersMigration} from "./roman-republic-family-rosters-migration.js";

describe("Roma siyasi aile kadroları migration",()=>{
  it("mevcut dört aileyi değiştirmeden sekiz yeni aile ve 48 üye ekler",()=>{
    expect(romanRepublicFamilyRostersMigration.version).toBe(153);
    expect(romanRepublicFamilyRostersMigration.sql).toContain("CREATE TABLE IF NOT EXISTS roman_family_members");
    for(const family of ["Julius","Aemilius","Fabius","Valerius","Licinius","Junius","Servilius","Caecilius"]){
      expect(romanRepublicFamilyRostersMigration.sql).toContain(`'${family} ailesi'`);
    }
    for(const protectedFamily of ["Scipio ailesi","Magnus ailesi","Cato ailesi","Nero ailesi"]){
      expect(romanRepublicFamilyRostersMigration.sql).not.toContain(`UPDATE ${protectedFamily}`);
    }
    expect((romanRepublicFamilyRostersMigration.sql.match(/'HEAD'/g)??[])).toHaveLength(9);
    expect((romanRepublicFamilyRostersMigration.sql.match(/'SPOUSE'/g)??[])).toHaveLength(9);
    expect((romanRepublicFamilyRostersMigration.sql.match(/'CHILD'/g)??[])).toHaveLength(17);
  });
});
