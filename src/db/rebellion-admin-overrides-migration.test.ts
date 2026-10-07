import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("rebellion admin overrides migration",()=>{
  it("adds one-shot rebel name and personnel overrides after the rebellion schema",()=>{
    const migration=migrations.find((item)=>item.version===142);
    expect(migration?.name).toBe("rebellion_admin_planning_overrides");
    expect(migration?.sql).toContain("rebellion_name_override");
    expect(migration?.sql).toContain("rebellion_personnel_override");
  });
});
