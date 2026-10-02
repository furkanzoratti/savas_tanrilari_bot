import {describe,expect,it} from "vitest";
import {dynastyDeathLogsMigration} from "./dynasty-death-logs-migration.js";

describe("dynasty death log migration",()=>{
  it("adds a dedicated channel and durable publication state",()=>{
    expect(dynastyDeathLogsMigration.version).toBe(111);
    expect(dynastyDeathLogsMigration.sql).toContain("dynasty_death_log_channel_id");
    expect(dynastyDeathLogsMigration.sql).toContain("death_log_published_at");
    expect(dynastyDeathLogsMigration.sql).toContain("death_log_publish_attempts");
    expect(dynastyDeathLogsMigration.sql).toContain("dynasty_death_logs_pending_idx");
  });
});
