import {describe,expect,it} from "vitest";
import {greatGamesGladiatorChampionshipMigration} from "./great-games-gladiator-championship-migration.js";

describe("Capua championship migration",()=>{
  it("stores qualifier participation, unique placements and the final tournament type",()=>{
    expect(greatGamesGladiatorChampionshipMigration.version).toBe(124);
    expect(greatGamesGladiatorChampionshipMigration.name).toBe("capua_four_qualifiers_and_final_championship");
    expect(greatGamesGladiatorChampionshipMigration.sql).toContain("tournament_type IN ('QUALIFIER','FINAL')");
    expect(greatGamesGladiatorChampionshipMigration.sql).toContain("great_games_gladiator_tournament_entries");
    expect(greatGamesGladiatorChampionshipMigration.sql).toContain("great_games_gladiator_tournament_results");
    expect(greatGamesGladiatorChampionshipMigration.sql).toContain("UNIQUE (tournament_id,placement)");
    expect(greatGamesGladiatorChampionshipMigration.sql).toContain("ON CONFLICT(tournament_id,gladiator_id) DO NOTHING");
  });
});
