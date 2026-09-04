import type { ChatInputCommandInteraction } from "discord.js";
import type { BattleUnitType } from "../domain/battle.js";
import { number } from "../domain/format.js";
import { armyService } from "../services/army-service.js";
import { GameError } from "../services/game-service.js";
import { resolveCountry } from "./auth.js";
import { renderArmyEmbed } from "./army-embed.js";

export async function handleArmyCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Ordu komutları yalnızca bir sunucuda kullanılabilir.");
  const country = await resolveCountry(interaction);
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (sub === "olustur") {
    const army = await armyService.create({
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id,
      name: interaction.options.getString("ad", true), commanderId: interaction.options.getString("komutan")
    });
    await interaction.editReply({ content: "✅ Ordu oluşturuldu.", embeds: [renderArmyEmbed(army)] });
    return;
  }
  if (sub === "bilgi") {
    const selected = interaction.options.getString("ordu");
    const armies = selected ? [await armyService.get(country.id, selected)] : await armyService.listCountry(country.id);
    if (!armies.length) throw new GameError("Devletinizde kurulmuş bir ordu bulunmuyor.");
    await interaction.editReply({ embeds: armies.slice(0, 10).map(renderArmyEmbed) });
    return;
  }
  const armyValue = interaction.options.getString("ordu", true);
  if (sub === "asker-ekle" || sub === "asker-cikar") {
    const input = {
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue,
      settlement: interaction.options.getString("yerleske", true),
      unitType: interaction.options.getString("birim", true) as BattleUnitType,
      quantity: interaction.options.getInteger("miktar", true)
    };
    const army = sub === "asker-ekle" ? await armyService.addUnits(input) : await armyService.removeUnits(input);
    await interaction.editReply({ content: sub === "asker-ekle" ? "✅ Askerler orduya tahsis edildi." : "✅ Askerlerin ordu tahsisi kaldırıldı.", embeds: [renderArmyEmbed(army)] });
  } else if (sub === "komutan-ata") {
    const army = await armyService.assignCommander({
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue,
      commanderId: interaction.options.getString("komutan", true)
    });
    await interaction.editReply({ content: "✅ Komutan ordunun başına atandı.", embeds: [renderArmyEmbed(army)] });
  } else if (sub === "komutan-kaldir") {
    const army = await armyService.removeCommander({ guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue });
    await interaction.editReply({ content: "✅ Komutanın ordu görevi kaldırıldı.", embeds: [renderArmyEmbed(army)] });
  } else if (sub === "dagit") {
    if (interaction.options.getString("onay", true).trim().toLocaleUpperCase("tr-TR") !== "DAGIT") throw new GameError("Orduyu dağıtmak için onay alanına DAGIT yazın.");
    const name = await armyService.disband({ guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue });
    await interaction.editReply(`✅ **${name}** dağıtıldı. Askerler kaynak yerleşkelerinde kalmaya devam ediyor.`);
  }
}
