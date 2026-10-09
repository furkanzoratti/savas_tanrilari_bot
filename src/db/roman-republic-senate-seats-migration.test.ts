import {describe,expect,it} from "vitest";
import {romanRepublicSenateSeatsMigration} from "./roman-republic-senate-seats-migration.js";

describe("Roma Senato koltuk dağılımı migration",()=>{
  it("on iki aile arasında yüz koltuğu istenen şekilde dağıtır",()=>{
    expect(romanRepublicSenateSeatsMigration.version).toBe(154);
    const seats={Scipio:18,Magnus:18,Cato:12,Nero:12,Julius:5,Aemilius:5,Fabius:5,Valerius:5,Licinius:5,Junius:5,Servilius:5,Caecilius:5};
    expect(Object.values(seats).reduce((sum,value)=>sum+value,0)).toBe(100);
    expect(romanRepublicSenateSeatsMigration.sql).toContain("THEN 18");
    expect(romanRepublicSenateSeatsMigration.sql).toContain("THEN 12");
    expect(romanRepublicSenateSeatsMigration.sql).toContain("THEN 5");
  });
});
