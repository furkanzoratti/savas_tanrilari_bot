import { describe, expect, it } from "vitest";
import { commandBuilders } from "./commands.js";

describe("GM operation desk command", () => {
  it("registers a dedicated command without consuming the management subcommand limit", () => {
    const command = commandBuilders.find((item) => item.name === "operasyon-masasi");
    expect(command).toBeDefined();
    expect(command?.description).toContain("tek kullanımlık");
  });
});
