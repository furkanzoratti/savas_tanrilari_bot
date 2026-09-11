import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
  type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction
} from "discord.js";
import { CHARACTER_ROLES, CITY_POLICIES, type CityPolicyKey } from "../domain/catalog.js";
import { gold } from "../domain/format.js";
import { cityService } from "../services/city-service.js";
import { characterService } from "../services/character-service.js";
import { gameService, GameError, type AcademyTrainingSession } from "../services/game-service.js";
import { assertCountryAccess, isGameMaster, requireEventManager, requireGameMaster, resolveCountry } from "./auth.js";
import { charactersEmbed, queueCharacterLog } from "./character-ui.js";
import { handleSettlementEventButton, handleSettlementEventCommand } from "./event-ui.js";

async function findSettlement(countryId: string, name: string) {
  const settlements = await gameService.listSettlements(countryId);
  const settlement = settlements.find((item) => item.name.toLocaleLowerCase("tr-TR") === name.trim().toLocaleLowerCase("tr-TR"));
  if (!settlement) throw new GameError("Yerleşke bulunamadı. Adı belgede göründüğü biçimde yazın.");
  return settlement;
}

function academyEmbed(countryName: string, settlementName: string, session: AcademyTrainingSession): EmbedBuilder {
  const role = session.result_role ? CHARACTER_ROLES[session.result_role] : null;
  const lines = [
    `**Devlet:** ${countryName}`,
    `**Akademi:** ${settlementName} • Sv${session.academy_level}`,
    `**Alım Turu:** ${session.acquisition_turn}`,
    session.excluded_role ? `**Elenen Görev:** ${CHARACTER_ROLES[session.excluded_role].label}` : null,
    session.selected_role ? `**Seçilen Görev:** ${CHARACTER_ROLES[session.selected_role].label}` : null,
    session.roll_value ? `🎲 **1d${session.roll_sides} → ${session.roll_value}**` : `🎲 **Beklenen Zar:** 1d${session.roll_sides}`,
    role ? `${role.emoji} **Yetişen Karakter:** ${role.label}` : null,
    `**Karakter Bonusu:** +${session.skill_bonus}`
  ].filter((line): line is string => Boolean(line));
  return new EmbedBuilder()
    .setColor(role ? 0x3f7f5f : 0xc59b45)
    .setTitle(role ? "🎓 Akademi Karakteri Hazır" : "🕯️ Akademi Eğitimi")
    .setDescription(lines.join("\n"));
}

function trainingButtons(countryId: string, session: AcademyTrainingSession): ActionRowBuilder<ButtonBuilder>[] {
  if (session.status === "COMPLETED" || session.status === "CANCELLED") return [];
  const naming = session.status === "AWAITING_NAME";
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${naming ? "academy_name" : "academy_roll"}|${countryId}|${session.id}`)
      .setLabel(naming ? "Karaktere İsim Ver" : "Eğitim Zarını At")
      .setEmoji(naming ? "✍️" : "🎲")
      .setStyle(naming ? ButtonStyle.Success : ButtonStyle.Primary)
  )];
}

async function logAcademyAction(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  countryName: string,
  entry: string
): Promise<void> {
  if (!interaction.guildId) return;
  await queueCharacterLog({
    client:interaction.client,guildId:interaction.guildId,interactionId:interaction.id,
    actorUserId:interaction.user.id,title:"Akademi Komut Günlüğü",source:"ACADEMY_COMMAND",
    entry:"👤 <@"+interaction.user.id+"> • **"+countryName+"**\n↳ "+entry
  }).catch(() => undefined);
}

export async function handleCityAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (!interaction.guildId || interaction.commandName !== "akademi") return false;
  const focused = interaction.options.getFocused(true);
  if (!["karakter", "yerleske"].includes(focused.name)) return false;
  const requestedCountry = interaction.options.getString("ulke");
  const country = requestedCountry && isGameMaster(interaction)
    ? await gameService.countryByName(interaction.guildId, requestedCountry)
    : await gameService.countryForUser(interaction.guildId, interaction.user.id);
  if (!country) { await interaction.respond([]); return true; }
  const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
  const sub = interaction.options.getSubcommand(false) ?? "";
  if (focused.name === "karakter") {
    let characters = (await characterService.list(country.id))
      .filter((character) => character.character_status === "ACTIVE");
    if (sub === "gorevden-al") {
      characters = characters.filter((character) => ["CURIA", "AGORA"].includes(character.assignment));
    } else if (sub === "ata") {
      characters = characters.filter((character) => ["NONE", "CURIA", "AGORA"].includes(character.assignment));
    }
    await interaction.respond(characters
      .filter((character) => !query || character.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0,25)
      .map((character) => ({
        name: `${character.name} • ${CHARACTER_ROLES[character.role].label} • ${character.assignment === "NONE" ? "Müsait" : character.assignment}`.slice(0,100),
        value: character.name
      })));
    return true;
  }
  const document = await gameService.document(country.id);
  const assignment = interaction.options.getString("gorev-yeri");
  let settlements = document.settlements;
  if (sub === "egit") {
    settlements = settlements.filter((item) => item.buildings.some((building) => building.building_type === "academy" && building.status === "ACTIVE"));
  } else if (sub === "ata" && assignment) {
    const buildingType = assignment === "CURIA" ? "curia" : "agora";
    settlements = settlements.filter((item) => item.buildings.some((building) => building.building_type === buildingType && building.status === "ACTIVE" && building.level >= 2));
  }
  await interaction.respond(settlements
    .filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query))
    .slice(0,25).map((item) => ({ name:item.name.slice(0,100), value:item.name })));
  return true;
}

export async function handleCityCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!["politika", "akademi", "panteon", "olay"].includes(interaction.commandName)) return false;
  if (!interaction.guildId) throw new GameError("Sunucu bulunamadı.");
  if (interaction.commandName === "olay") {
    requireEventManager(interaction);
    if (await handleSettlementEventCommand(interaction)) return true;
  }
  const sub = interaction.options.getSubcommand();
  const publicReply = interaction.commandName === "olay" || (interaction.commandName === "akademi" && sub === "egit");
  await interaction.deferReply({ ephemeral: !publicReply });
  const requestedCountry = interaction.options.getString("ulke");
  const country = interaction.commandName === "olay" && requestedCountry
    ? await gameService.countryByName(interaction.guildId, requestedCountry)
    : await resolveCountry(interaction, requestedCountry);
  if (!country) throw new GameError("Belirtilen ülke bulunamadı.");

  if (interaction.commandName === "olay") {
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    if (sub === "salgin") {
      const result = await cityService.rollDisease({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, baseChance: interaction.options.getInteger("baz-risk", true) });
      const protections = [
        result.oliveProtected ? "Zeytin: −10 puan" : null,
        result.innsReduction > 0 ? `Hanlar ve Hamamlar: −${result.innsReduction} puan` : null,
        result.pantheonProtected ? "Panteon Sv2+: kalan risk yarıya iner" : null
      ].filter(Boolean).join(" • ") || "Koruyucu bina veya kaynak yok";
      await interaction.editReply({ content: `🦠 **${settlement.name}** • Temel risk: **%${result.baseChance}** • Nihai risk: **%${result.chance}**\n🎲 **1d100 → ${result.roll}**\n🛡️ ${protections}\n${result.triggered ? "⚠️ Salgın olayı tetiklendi." : "✅ Salgın engellendi."}` });
    } else if (sub === "salgin-iyilesme") {
      const result = await cityService.rollDiseaseRecovery({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id });
      await interaction.editReply({ content: `🏥 **${settlement.name}** salgın iyileşme zarı: **1d20 → ${result.roll}**${result.bonus ? " • Su Kemeri +1" : ""}\n🎯 **Sonuç: ${result.total}**` });
    } else {
      const result = await cityService.triggerBlackMarket({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id });
      await interaction.editReply({ content: result.blocked ? `🛡️ **${settlement.name}** karaborsa olayını Agora Sv3 görevlisi **${result.merchantName}** engelledi.` : `⚠️ **${settlement.name}** yerleşkesinde karaborsa olayı tetiklendi; yönetici sonucunu belirler.` });
    }
    return true;
  }

  if (interaction.commandName === "politika") {
    if (sub === "liste") {
      const document = await gameService.document(country.id);
      const lines = document.settlements.map((settlement) => {
        const policies = settlement.policies.length
          ? settlement.policies.map((policy) => `${policy.status === "ACTIVE" ? "✅" : "⏳"} ${policy.slot}. ${CITY_POLICIES[policy.policy_key].label}${policy.status === "PENDING" ? ` • Tur ${policy.activation_turn}` : ""}`).join("\n")
          : "Aktif şehir politikası yok.";
        return `**${settlement.name}**\n${policies}`;
      });
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xc59b45).setTitle(`⚖️ ${country.name} • Şehir Politikaları`).setDescription((lines.join("\n\n") || "Yerleşke bulunmuyor.").slice(0, 4_000))] });
      return true;
    }
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const slot = interaction.options.getInteger("yuva", true) as 1 | 2;
    if (sub === "kaldir") {
      await cityService.removePolicy({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, slot });
      await interaction.editReply({ content: `✅ **${settlement.name}** yerleşkesindeki ${slot}. politika kaldırıldı.` });
      return true;
    }
    const key = interaction.options.getString("politika", true) as CityPolicyKey;
    const policy = await cityService.setPolicy({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, policyKey: key, slot });
    await interaction.editReply({ content: `⚖️ **${settlement.name}** • ${slot}. Politika: **${CITY_POLICIES[key].label}**\n⏳ **Tur ${policy.activation_turn}** başında etkinleşecek.\n${CITY_POLICIES[key].description}` });
    return true;
  }

  if (interaction.commandName === "akademi") {
    if (sub === "karakterler") {
      await interaction.editReply({embeds:[charactersEmbed(country.name,await characterService.list(country.id))]});
      await logAcademyAction(interaction,country.name,"Akademi karakterlerini görüntüledi.");
      return true;
    }
    if (sub === "gorevden-al") {
      const character = await cityService.unassignCharacter({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, characterName: interaction.options.getString("karakter", true) });
      await interaction.editReply({ content: `✅ **${character.name}** mevcut görevinden alındı.` });
      await logAcademyAction(interaction,country.name,"**"+character.name+"** görevden alındı.");
      return true;
    }
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    if (sub === "ata") {
      const result = await cityService.assignCharacter({
        guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id,
        characterName: interaction.options.getString("karakter", true), settlementId: settlement.id,
        assignment: interaction.options.getString("gorev-yeri", true) as "CURIA" | "AGORA"
      });
      await interaction.editReply({ content: `✅ **${result.character.name}**, **${settlement.name}** yerleşkesindeki **${result.character.assignment === "AGORA" ? "Agora / Forum" : "Curia"}** görevine atandı.${result.guardCreated ? "\n🛡️ Garnizona Curia muhafızı olarak 200 Ağır Piyade eklendi." : ""}` });
      await logAcademyAction(interaction,country.name,"**"+result.character.name+"**, **"+settlement.name+"** yerleşkesinde **"+(result.character.assignment === "AGORA" ? "Agora / Forum" : "Curia")+"** görevine atandı.");
      return true;
    }
    const session = await cityService.beginTraining({
      guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id,
      settlementId: settlement.id, excludedRole: interaction.options.getString("elenen-gorev"), selectedRole: interaction.options.getString("secilen-gorev")
    });
    await interaction.editReply({ embeds: [academyEmbed(country.name, settlement.name, session)], components: trainingButtons(country.id, session) });
    await logAcademyAction(interaction,country.name,"**"+settlement.name+"** Akademisinde eğitim başlatıldı.");
    return true;
  }

  if (sub === "kredi-al") {
    const settlement = await findSettlement(country.id, interaction.options.getString("yerleske", true));
    const result = await cityService.takePantheonLoan({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, amount: interaction.options.getInteger("miktar", true) });
    await interaction.editReply({ content: `🏛️ **${settlement.name}** Panteonu **${gold(result.amount)}** faizsiz savaş kredisi verdi. Son ödeme: **Tur ${result.dueTurn}**.` });
  } else {
    const amount = interaction.options.getInteger("miktar", true);
    const result = await cityService.repayPantheonLoan({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, amount });
    await interaction.editReply({ content: `✅ **${gold(amount)}** kredi geri ödendi. Kalan borç: **${gold(result.remaining)}**.` });
  }
  return true;
}

export async function handleCityButton(interaction: ButtonInteraction): Promise<boolean> {
  if (await handleSettlementEventButton(interaction)) return true;
  if (!interaction.customId.startsWith("academy_roll|") && !interaction.customId.startsWith("academy_name|")) return false;
  const [action, countryId, sessionId] = interaction.customId.split("|");
  if (!countryId || !sessionId || !interaction.guildId) throw new GameError("Akademi etkileşimi geçersiz.");
  if (action === "academy_name") {
    const modal = new ModalBuilder().setCustomId(`academy_modal|${countryId}|${sessionId}`).setTitle("Akademi Karakterine İsim Ver");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId("character_name").setLabel("Karakterin adı").setPlaceholder("Örn. Marcus Valerius").setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(60).setRequired(true)
    ));
    await interaction.showModal(modal);
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  await assertCountryAccess(interaction, countryId);
  const session = await cityService.rollTraining({ guildId: interaction.guildId, actorId: interaction.user.id, countryId, sessionId });
  const document = await gameService.document(countryId);
  const settlement = document.settlements.find((item) => item.id === session.settlement_id);
  await interaction.message.edit({ embeds: [academyEmbed(document.country.name, settlement?.name ?? "Akademi", session)], components: trainingButtons(countryId, session) });
  await interaction.editReply("✅ Akademi zarı işlendi.");
  await logAcademyAction(interaction,document.country.name,"Akademi eğitim zarı atıldı: **1d"+session.roll_sides+" → "+session.roll_value+"**.");
  return true;
}

export async function handleCityModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("academy_modal|")) return false;
  const [, countryId, sessionId] = interaction.customId.split("|");
  if (!countryId || !sessionId || !interaction.guildId) throw new GameError("Akademi isimlendirme formu geçersiz.");
  await interaction.deferReply();
  await assertCountryAccess(interaction, countryId);
  const character = await cityService.nameCharacter({
    guildId: interaction.guildId, actorId: interaction.user.id, countryId, sessionId,
    name: interaction.fields.getTextInputValue("character_name")
  });
  const role = CHARACTER_ROLES[character.role];
  await interaction.editReply({ content: `${role.emoji} **${character.name}** adlı **${role.label}** yetiştirildi ve devlet belgesine eklendi. Karakter bonusu: **+${character.skill_bonus}**.`, components: [] });
  const document = await gameService.document(countryId);
  await logAcademyAction(interaction,document.country.name,"**"+character.name+"** adlı **"+role.label+"** yetiştirildi • Bonus **+"+character.skill_bonus+"**.");
  if (interaction.message?.editable) await interaction.message.edit({ components: [] }).catch(() => undefined);
  return true;
}
