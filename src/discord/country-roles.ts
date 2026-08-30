import { PermissionFlagsBits, type Guild, type Role } from "discord.js";
import { countryRoleColor } from "../domain/country-colors.js";
import { gameService, GameError } from "../services/game-service.js";

const DISCORD_GUILD_ROLE_LIMIT = 250;

export interface CountryRoleTarget {
  id: string;
  name: string;
  discord_role_id: string | null;
}

export function countryRoleName(countryName: string): string {
  return countryName.trim().slice(0, 100);
}

function requireRoleManager(guild: Guild) {
  const botMember = guild.members.me;
  if (!botMember) throw new GameError("Botun sunucu üyeliği okunamadı.");
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new GameError("Botta **Rolleri Yönet** yetkisi bulunmuyor.");
  }
  return botMember;
}

function assertManageableRole(role: Role, botHighestPosition: number): void {
  if (role.managed || role.position >= botHighestPosition || !role.editable) {
    throw new GameError(`**${role.name}** rolü Bot rolünün altında veya bot tarafından yönetilebilir durumda değil.`);
  }
}

export async function ensureCountryRole(
  guild: Guild,
  country: CountryRoleTarget,
  actorId: string,
  rolesAlreadyFetched = false
): Promise<{ role: Role; created: boolean; linked: boolean; colorApplied: boolean; colorAvailable: boolean }> {
  const botMember = requireRoleManager(guild);
  if (!rolesAlreadyFetched) await guild.roles.fetch();
  const desiredColor = countryRoleColor(country.name);

  let role = country.discord_role_id ? guild.roles.cache.get(country.discord_role_id) : undefined;
  if (role) assertManageableRole(role, botMember.roles.highest.position);

  if (!role) {
    const expectedName = countryRoleName(country.name).toLocaleLowerCase("tr-TR");
    role = guild.roles.cache
      .filter((candidate) => candidate.id !== guild.id
        && !candidate.managed
        && candidate.position < botMember.roles.highest.position
        && candidate.name.toLocaleLowerCase("tr-TR") === expectedName)
      .sort((first, second) => second.position - first.position)
      .first();
  }

  let created = false;
  if (!role) {
    if (guild.roles.cache.size >= DISCORD_GUILD_ROLE_LIMIT) {
      throw new GameError("Sunucu Discord'un 250 rol sınırına ulaştığı için yeni devlet rolü oluşturulamıyor.");
    }
    role = await guild.roles.create({
      name: countryRoleName(country.name),
      color: desiredColor ?? 0,
      hoist: false,
      mentionable: false,
      reason: `Devlet rolü oluşturuldu • Yönetici: ${actorId}`
    });
    created = true;
  }

  assertManageableRole(role, botMember.roles.highest.position);
  const desiredName = countryRoleName(country.name);
  if (role.name !== desiredName) {
    role = await role.edit({ name: desiredName, reason: `Devlet adı değişikliğiyle eşitlendi • Yönetici: ${actorId}` });
  }
  let colorApplied = created && desiredColor !== null;
  if (!created && desiredColor !== null && role.color !== desiredColor) {
    role = await role.edit({ color: desiredColor, reason: `Devlet rolü harita rengiyle eşitlendi • Yönetici: ${actorId}` });
    colorApplied = true;
  }
  const linked = country.discord_role_id !== role.id;
  if (linked) await gameService.setCountryDiscordRole(guild.id, actorId, country.id, role.id);
  return { role, created, linked, colorApplied, colorAvailable: desiredColor !== null };
}

export async function addCountryRoleToMember(guild: Guild, userId: string, role: Role): Promise<boolean> {
  const member = await guild.members.fetch(userId);
  if (member.roles.cache.has(role.id)) return false;
  await member.roles.add(role, "Oyuncu devlete atandı");
  return true;
}

export async function removeCountryRoleFromMember(guild: Guild, userId: string, roleId: string | null): Promise<boolean> {
  if (!roleId) return false;
  const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || !member.roles.cache.has(role.id)) return false;
  await member.roles.remove(role, "Oyuncunun devlet ataması kaldırıldı");
  return true;
}

export async function deleteCountryRole(guild: Guild, roleId: string | null, reason: string): Promise<boolean> {
  if (!roleId) return false;
  const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return false;
  assertManageableRole(role, requireRoleManager(guild).roles.highest.position);
  await role.delete(reason);
  return true;
}
