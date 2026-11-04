import {describe,expect,it} from "vitest";
import {visualMovementBoardMigration} from "./visual-movement-board-migration.js";

describe("oyundan izole görsel hareket tahtası",()=>{
  it("konumları ve rotaları eski hareket tablolarına dokunmadan saklar",()=>{
    expect(visualMovementBoardMigration.version).toBe(243);
    expect(visualMovementBoardMigration.sql).toContain("visual_map_force_positions");
    expect(visualMovementBoardMigration.sql).toContain("visual_map_routes");
    expect(visualMovementBoardMigration.sql).not.toContain("INSERT INTO army_map_positions");
    expect(visualMovementBoardMigration.sql).not.toContain("movement_orders");
    expect(visualMovementBoardMigration.sql).toContain("positioned_by='R56_IMPORT'");
  });
});
