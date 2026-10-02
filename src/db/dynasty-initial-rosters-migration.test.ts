import {describe,expect,it} from "vitest";
import {dynastyInitialRostersMigration} from "./dynasty-initial-rosters-migration.js";

describe("initial dynasty rosters migration",()=>{
  it("seeds all supplied countries with the thirty year age offset",()=>{
    expect(dynastyInitialRostersMigration.version).toBe(109);
    for(const country of ["Britanya","Fenike-Aram","Büyük Kartaca","Boylar","Karnutlar","Sardes","Nebatiler","Persler","Sebe","Mısır","Sarmatya","Gallaekler","Bosporos Krallığı","Ermenistan","Medya","Greko-Baktriya","Bergama","Saketler","Hindu Kuş","Satraplar","Pandaya","Satavahana","Şunga","Panchala","Kosola","Anuradhapura","Malaya"])
      expect(dynastyInitialRostersMigration.sql).toContain("('"+country+"'");
    expect(dynastyInitialRostersMigration.sql).toContain("'Ecbert York','MALE',65");
    expect(dynastyInitialRostersMigration.sql).toContain("'Al Qasim','MALE',31");
    expect(dynastyInitialRostersMigration.sql).toContain("'Corocotta Albioni','MALE',88");
    expect(dynastyInitialRostersMigration.sql).toContain("'Sevan Nişanyan','MALE',51");
    expect(dynastyInitialRostersMigration.sql).toContain("'Cyaxares Astiyagid','MALE',44");
    expect(dynastyInitialRostersMigration.sql).toContain("'Alexander Eucratid','MALE',12");
    expect(dynastyInitialRostersMigration.sql).toContain("'I. Attalos Soter','MALE',54");
    expect(dynastyInitialRostersMigration.sql).toContain("('Bergama','Soter Hanedanı')");
    expect(dynastyInitialRostersMigration.sql).toContain("'I Alperen Saket','MALE',40");
    expect(dynastyInitialRostersMigration.sql).toContain("'Nile Saket','FEMALE',38");
    expect(dynastyInitialRostersMigration.sql).toContain("'Demure Saker','FEMALE',22");
    expect(dynastyInitialRostersMigration.sql).toContain("'Devanampiya Tissa','MALE',48");
    expect(dynastyInitialRostersMigration.sql).toContain("'Merong Mahawangsa','MALE',42");
    expect(dynastyInitialRostersMigration.sql).toContain("ALTER COLUMN age DROP NOT NULL");
  });
});
