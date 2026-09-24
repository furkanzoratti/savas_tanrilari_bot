import { describe,expect,it,vi } from "vitest";
import type { DbClient } from "../db/pool.js";
import { grantFormableFoundingReward } from "./formable-country-reward-service.js";

describe("kurulabilir ülke kuruluş ödülü",()=>{
  it("Büyük Kartaca kurulunca her aktif tersaneye iki Kerkouros ekler",async()=>{
    const query=vi.fn()
      .mockResolvedValueOnce({rows:[
        {settlement_id:"carthage",settlement_name:"Kartaca"},
        {settlement_id:"hippo",settlement_name:"Hippo"}
      ],rowCount:2})
      .mockResolvedValue({rows:[],rowCount:1});
    const result=await grantFormableFoundingReward({query} as unknown as DbClient,"country","CARTHAGE");
    expect(result).toEqual(["Kartaca: +2 Kerkouros","Hippo: +2 Kerkouros"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO naval_units"),["carthage","kerkouros",2]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO naval_units"),["hippo","kerkouros",2]);
  });

  it("kuruluş ödülü olmayan ülkelerde veritabanına dokunmaz",async()=>{
    const query=vi.fn();
    expect(await grantFormableFoundingReward({query} as unknown as DbClient,"country","BRITANNIA")).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
