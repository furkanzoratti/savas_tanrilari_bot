import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const service=readFileSync(new URL("./army-service.ts",import.meta.url),"utf8");

describe("toplu ordu işlemleri",()=>{
  it("havuzdaki yalnız tahsis edilmemiş saha birliklerini kökenleri korunarak hedef orduya ekler",()=>{
    expect(service).toContain("async allocateEntirePool");
    expect(service).toContain("stock.quantity-COALESCE(allocated.quantity,0)");
    expect(service).toContain("stock.unit_type<>'militia'");
    expect(service).toContain("origin_settlement_name,unit_type,quantity");
    expect(service).toContain("'army.pool.allocate'");
  });

  it("birleşmede birlikleri ve kuşatma aletlerini hedefe taşır, kaynak komutanı serbest bırakır",()=>{
    expect(service).toContain("async merge(input:");
    expect(service).toContain("SELECT $1,settlement_id,origin_settlement_name,unit_type,quantity FROM army_units WHERE army_id=$2");
    expect(service).toContain("SELECT $1,settlement_id,asset_type,quantity,enhanced_quantity FROM army_siege_assets WHERE army_id=$2");
    expect(service).toContain("UPDATE country_characters SET assignment='NONE',assigned_settlement_id=NULL");
    expect(service).toContain("DELETE FROM armies WHERE id=$1");
    expect(service).toContain("'army.merge'");
  });

  it("aktif kara veya deniz savaşına bağlı orduların toplu değişimini engeller",()=>{
    expect(service).toContain("b.status NOT IN ('FINISHED','CANCELLED')");
    expect(service).toContain("participant.embarked_army_id=$1");
    expect(service).toContain("battle.status NOT IN ('FINISHED','CANCELLED')");
  });
});
