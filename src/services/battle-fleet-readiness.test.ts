import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import type {DbClient} from "../db/pool.js";

vi.mock("../db/pool.js",()=>({pool:{},withTransaction:vi.fn()}));
vi.mock("./game-service.js",()=>({GameError:class GameError extends Error{}}));

import {navalFleetReadiness} from "./battle-service.js";

describe("deniz savaşı filo hazır olma kontrolü",()=>{
  it("eski süreli iş göremezlik alanını dikkate almaz",async()=>{
    let capturedSql="";
    const client={query:async(sql:string)=>{
      capturedSql=sql;
      return {rows:[{
        settlement_name:"Brundisium",ship_type:"trireme",quantity:8,
        stock_total:8,other_allocated:0,disabled:0
      }],rowCount:1};
    }} as unknown as DbClient;

    await expect(navalFleetReadiness(client,"fleet-1")).resolves.toEqual([{
      settlementName:"Brundisium",shipType:"trireme",quantity:8,
      stockTotal:8,otherAllocated:0,disabled:0,physicalAvailable:8,readyAvailable:8
    }]);
    expect(capturedSql).not.toContain("disabled_until_turn");
    expect(capturedSql).toContain("damage.status='DISABLED'");
  });

  it("yalnız diğer filo tahsislerini ve gerçekten iş göremez gemileri düşer",async()=>{
    const client={query:async()=>({rows:[{
      settlement_name:"Brundisium",ship_type:"kerkouros",quantity:6,
      stock_total:10,other_allocated:2,disabled:1
    }],rowCount:1})} as unknown as DbClient;

    await expect(navalFleetReadiness(client,"fleet-1")).resolves.toMatchObject([{
      quantity:6,stockTotal:10,otherAllocated:2,disabled:1,physicalAvailable:8,readyAvailable:7
    }]);
  });

  it("iş göremez gemileri fiziksel filo tahsisinden düşmez",async()=>{
    const client={query:async()=>({rows:[{
      settlement_name:"Rodos",ship_type:"trireme",quantity:6,
      stock_total:6,other_allocated:0,disabled:4
    }],rowCount:1})} as unknown as DbClient;

    await expect(navalFleetReadiness(client,"fleet-1")).resolves.toMatchObject([{
      quantity:6,disabled:4,physicalAvailable:6,readyAvailable:2
    }]);
  });

  it("komut ve panel savaş atamasında iş göremez gemiyi engel saymaz",()=>{
    const battleSource=readFileSync(new URL("./battle-service.ts",import.meta.url),"utf8");
    const adminSource=readFileSync(new URL("../admin/service.ts",import.meta.url),"utf8");
    expect(battleSource).toContain("row.quantity > row.physicalAvailable");
    expect(adminSource).toContain("row.quantity>row.physicalAvailable");
    expect(battleSource).not.toContain("Önce bu gemileri tamire gönderin");
    expect(adminSource).not.toContain("tanesi iş göremez.`");
  });
});
