import { PermissionFlagsBits, type Guild, type Role } from "discord.js";
import { GameError } from "../services/game-service.js";
import { EVENT_MANAGER_ROLE_NAME } from "./auth.js";

const DISCORD_GUILD_ROLE_LIMIT = 250;

function requireRoleManager(guild: Guild) {
  const botMember = guild.members.me;
  if (!botMember) throw new GameError("Botun sunucu üyeliği okunamadı.");
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new GameError("Botta **Rolleri Yönet** yetkisi bulunmuyor.");
  }
  return botMember;
}

function assertManageable(role: Role, botHighestPosition: number): void {
  if (role.managed || role.position >= botHighestPosition || !role.editable) {
    throw new GameError(`**${EVENT_MANAGER_ROLE_NAME}** rolü Bot rolünün altında ve bot tarafından yönetilebilir olmalıdır.`);
  }
}

async function findOrCreateRole(guild: Guild, actorId: string): Promise<{ role: Role; created: boolean }> {
  const botMember = requireRoleManager(guild);
  await guild.roles.fetch();
  let role = guild.roles.cache
    .filter((candidate) => candidate.id !== guild.id && !candidate.managed && candidate.name === EVENT_MANAGER_ROLE_NAME)
    .sort((first, second) => second.position - first.position)
    .first();
  let created = false;
  if (!role) {
    if (guild.roles.cache.size >= DISCORD_GUILD_ROLE_LIMIT) throw new GameError("Sunucu Discord'un 250 rol sınırına ulaştı.");
    role = await guild.roles.create({
      name: EVENT_MANAGER_ROLE_NAME,
      color: 0xa45cc7,
      hoist: false,
      mentionable: false,
      permissions: [],
      reason: `Olay yöneticisi rolü oluşturuldu • Yönetici: ${actorId}`
    });
    created = true;
  }
  assertManageable(role, botMember.roles.highest.position);
  return { role, created };
}

export async function setEventManagerRole(input: {
  guild: Guild;
  actorId: string;
  userId: string;
  grant: boolean;
}): Promise<{ role: Role | null; created: boolean; changed: boolean }> {
  if (!input.grant) {
    requireRoleManager(input.guild);
    await input.guild.roles.fetch();
    const role = input.guild.roles.cache
      .filter((candidate) => candidate.id !== input.guild.id && !candidate.managed && candidate.name === EVENT_MANAGER_ROLE_NAME)
      .sort((first, second) => second.position - first.position)
      .first() ?? null;
    if (!role) return { role: null, created: false, changed: false };
    assertManageable(role, input.guild.members.me!.roles.highest.position);
    const member = await input.guild.members.fetch(input.userId);
    if (!member.manageable) throw new GameError("Seçilen üyenin rol hiyerarşisi botun üstünde olduğu için rolü değiştirilemiyor.");
    if (!member.roles.cache.has(role.id)) return { role, created: false, changed: false };
    await member.roles.remove(role, `Olay yöneticisi yetkisi kaldırıldı • Yönetici: ${input.actorId}`);
    return { role, created: false, changed: true };
  }

  const { role, created } = await findOrCreateRole(input.guild, input.actorId);
  const member = await input.guild.members.fetch(input.userId);
  if (!member.manageable) throw new GameError("Seçilen üyenin rol hiyerarşisi botun üstünde olduğu için rolü değiştirilemiyor.");
  if (member.roles.cache.has(role.id)) return { role, created, changed: false };
  await member.roles.add(role, `Olay yöneticisi yetkisi verildi • Yönetici: ${input.actorId}`);
  return { role, created, changed: true };
}
