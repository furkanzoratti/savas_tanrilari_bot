import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("erkek öncelikli hanedan veraseti migration", () => {
  it("yaşayan veraset adaylarında erkekleri kadınlardan önce seçer", () => {
    const migration = migrations.find((item) => item.version === 121);
    expect(migration?.name).toBe("dynasty_male_preference_succession");
    expect(migration?.sql).toContain("CASE WHEN member.gender='MALE' THEN 0 ELSE 1 END");
    expect(migration?.sql).toContain("member.status='ALIVE'");
    expect(migration?.sql).toContain("member.is_monarch=FALSE");
    expect(migration?.sql).toContain("SET is_heir=TRUE");
  });
});
