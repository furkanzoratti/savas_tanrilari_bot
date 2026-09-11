import { describe, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { EVENT_MANAGER_ROLE_NAME, isEventManager } from "./auth.js";

vi.mock("../config.js", () => ({ config: { adminRoleIds: new Set<string>() } }));
vi.mock("../services/game-service.js", () => ({ gameService: {}, GameError: class GameError extends Error {} }));

function interactionWithRoles(roleNames: string[]): ChatInputCommandInteraction {
  return {
    memberPermissions: { has: () => false },
    member: {
      roles: {
        cache: {
          some: (predicate: (role: { id: string; name: string }) => boolean) => roleNames.some((name, index) => predicate({ id: String(index), name }))
        }
      }
    }
  } as unknown as ChatInputCommandInteraction;
}

describe("olay yöneticisi yetkisi", () => {
  it("yalnızca tanımlı rol adına olay yetkisi verir", () => {
    expect(isEventManager(interactionWithRoles([EVENT_MANAGER_ROLE_NAME]))).toBe(true);
    expect(isEventManager(interactionWithRoles(["Moderatör"]))).toBe(false);
  });
});
