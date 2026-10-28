import {describe,expect,it} from "vitest";
import {compactUuid,expandUuid} from "./document-component-id.js";

describe("yerleşke belge kontrol merkezi",()=>{
  it("Discord bileşenlerinde UUID kimliklerini güvenle kısaltır",()=>{
    const uuid="123e4567-e89b-12d3-a456-426614174000";
    const compact=compactUuid(uuid);
    expect(compact.length).toBeLessThan(uuid.length);
    expect(expandUuid(compact)).toBe(uuid);
  });
});
