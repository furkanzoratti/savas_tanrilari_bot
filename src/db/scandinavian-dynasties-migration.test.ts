import {describe,expect,it} from "vitest";
import {migrations} from "./migrations.js";
import {scandinavianDynastiesMigration} from "./scandinavian-dynasties-migration.js";

describe("İskandinav ülke hanedanları göçü",()=>{
  it("dört İskandinav hanesini en az sekiz üyeyle kurar",()=>{
    expect(scandinavianDynastiesMigration.version).toBe(203);
    for(const dynasty of ["Boiorigid Hanedanı","Hadding Hanedanı","Hretheling Hanedanı","Yngling Hanedanı"]){
      expect(scandinavianDynastiesMigration.sql).toContain(dynasty);
    }
    for(const seedKey of ["CIMBRI","CHAEDINI","GAUT","SUION"]){
      const memberRows=scandinavianDynastiesMigration.sql.match(new RegExp(`\\('${seedKey}','[^']+'`,'g'))??[];
      expect(memberRows).toHaveLength(8);
    }
  });

  it("mevcut dolu hanedanlara dokunmaz ve ordu doktrininden hemen önce çalışır",()=>{
    expect(scandinavianDynastiesMigration.sql).toContain("ON CONFLICT(country_id) WHERE steppe_title_id IS NULL DO NOTHING");
    expect(scandinavianDynastiesMigration.sql).toContain("dynasty.country_id=country.id AND dynasty.steppe_title_id IS NULL");
    expect(scandinavianDynastiesMigration.sql).toContain("WHERE NOT EXISTS(SELECT 1 FROM dynasty_members member WHERE member.dynasty_id=dynasty.id)");
    expect(migrations.at(-2)).toBe(scandinavianDynastiesMigration);
  });
});
