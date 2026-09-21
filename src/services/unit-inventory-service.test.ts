import {describe,expect,it,vi} from "vitest";
import type {DbClient} from "../db/pool.js";
import {depositArmyStock,withdrawArmyStock} from "./unit-inventory-service.js";

vi.mock("./game-service.js",()=>({GameError:class GameError extends Error {}}));

describe("bağımsız ordu asker stoku",()=>{
  it("orduya geçen askeri yerel stok satırlarından tam miktarda düşer",async()=>{
    const writes:string[]=[];
    const client={query:async(sql:string,params:unknown[]=[])=>{
      if(sql.includes("SELECT id,quantity FROM unit_stacks"))return {rows:[{id:"a",quantity:300},{id:"b",quantity:400}],rowCount:2};
      if(sql.includes("DELETE FROM unit_stacks")){writes.push(`delete:${params[0]}`);return {rows:[],rowCount:1};}
      if(sql.includes("UPDATE unit_stacks SET quantity=")){writes.push(`update:${params[1]}:${params[0]}`);return {rows:[],rowCount:1};}
      throw new Error(`Unexpected query: ${sql}`);
    }} as unknown as DbClient;
    await withdrawArmyStock(client,"settlement","archer",500);
    expect(writes).toEqual(["delete:a","update:b:200"]);
  });

  it("ordudan çıkan askeri bulunduğu dost yerleşkenin stokuna ekler",async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:1}));
    await depositArmyStock({query} as unknown as DbClient,"settlement","archer",500);
    expect(String(query.mock.calls[0]?.[0])).toContain("ON CONFLICT(settlement_id,unit_type,status,force_type)");
    expect(query.mock.calls[0]?.[1]).toEqual(["settlement","archer",500]);
  });
});
