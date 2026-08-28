import { PermissionFlagsBits, type AutocompleteInteraction, type ChatInputCommandInteraction, type GuildMember, type MessageComponentInteraction, type ModalSubmitInteraction } from "discord.js";
import { config } from "../config.js";
import { gameService, GameError } from "../services/game-service.js";

type GuildInteraction = AutocompleteInteraction | ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

export function isGameMaster(interaction: GuildInteraction): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const member = interaction.member as GuildMember | null;
  return member ? member.roles.cache.some((role) => config.adminRoleIds.has(role.id)) : false;
}

export async function resolveCountry(interaction: ChatInputCommandInteraction, requestedName?: string | null) {
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca bir Discord sunucusunda kullanılabilir.");
  if (requestedName && isGameMaster(interaction)) {
    const country = await gameService.countryByName(interaction.guildId, requestedName);
    if (!country) throw new GameError("Belirtilen ülke bulunamadı.");
    return country;
  }
  const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
  if (!country) throw new GameError("Discord hesabına atanmış bir ülke bulunamadı.");
  return country;
}

export async function assertCountryAccess(interaction: GuildInteraction, countryId: string): Promise<void> {
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca bir sunucuda kullanılabilir.");
  if (isGameMaster(interaction)) return;
  const ownCountry = await gameService.countryForUser(interaction.guildId, interaction.user.id);
  if (!ownCountry || ownCountry.id !== countryId) throw new GameError("Bu ülke üzerinde işlem yapma yetkin yok.");
}

export function requireGameMaster(interaction: ChatInputCommandInteraction): void {
  if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
}
