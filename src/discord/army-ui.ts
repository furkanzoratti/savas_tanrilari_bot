import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { BattleUnitType } from "../domain/battle.js";
import type { MobileSiegeAssetType } from "../services/army-service.js";
import { armyService } from "../services/army-service.js";
import { GameError } from "../services/game-service.js";
import { assertCountryExecutiveAccess,resolveCountry } from "./auth.js";
import { renderArmyEmbed } from "./army-embed.js";
import { queueCharacterLog } from "./character-ui.js";
import { batchDocumentEmbeds } from "./document.js";

async function logCommanderAssignment(interaction: ChatInputCommandInteraction,countryName:string,entry:string):Promise<void>{
  await queueCharacterLog({client:interaction.client,guildId:interaction.guildId!,interactionId:interaction.id,
    actorUserId:interaction.user.id,title:"Komutan Görev Günlüğü",source:"COMMANDER_COMMAND",
    entry:"⚔️ <@"+interaction.user.id+"> • **"+countryName+"**\n↳ "+entry}).catch(()=>undefined);
}

export async function handleArmyCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Ordu komutları yalnızca bir sunucuda kullanılabilir.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const country = await resolveCountry(interaction);

  if(sub!=="bilgi")await assertCountryExecutiveAccess(interaction,country.id);

  if (sub === "olustur") {
    const army = await armyService.create({
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id,
      name: interaction.options.getString("ad", true), commanderId: interaction.options.getString("komutan")
    });
    await interaction.editReply({ content: "✅ Ordu oluşturuldu.", embeds: [renderArmyEmbed(army)] });
    if (army.commander_name) await logCommanderAssignment(interaction,country.name,"**"+army.commander_name+"**, **"+army.name+"** ordusunun başına atandı.");
    return;
  }
  if (sub === "bilgi") {
    const selected = interaction.options.getString("ordu");
    const armies = selected ? [await armyService.get(country.id, selected)] : await armyService.listCountry(country.id);
    if (!armies.length) throw new GameError("Devletinizde kurulmuş bir ordu bulunmuyor.");
    const pages = batchDocumentEmbeds(armies.map(renderArmyEmbed));
    await interaction.editReply({ embeds: pages[0] ?? [] });
    for (const page of pages.slice(1)) {
      await interaction.followUp({ embeds: page, flags: MessageFlags.Ephemeral });
    }
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
    await interaction.editReply({ content: sub === "asker-ekle"
      ? "✅ Askerler orduya tahsis edildi."
      : "✅ Askerlerin ordu tahsisi kaldırıldı; askerler yerleşke stokunda kullanılabilir.", embeds: [renderArmyEmbed(army)] });
  } else if (sub === "kusatma-aleti-ekle" || sub === "kusatma-aleti-cikar") {
    const input = {
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue,
      settlement: interaction.options.getString("yerleske", true),
      assetType: interaction.options.getString("alet", true) as MobileSiegeAssetType,
      quantity: interaction.options.getInteger("miktar", true)
    };
    const army = sub === "kusatma-aleti-ekle" ? await armyService.addSiegeAssets(input) : await armyService.removeSiegeAssets(input);
    await interaction.editReply({
      content: sub === "kusatma-aleti-ekle" ? "✅ Kuşatma aletleri orduya tahsis edildi." : "✅ Kuşatma aletlerinin ordu tahsisi kaldırıldı.",
      embeds: [renderArmyEmbed(army)]
    });
  } else if (sub === "komutan-ata") {
    const army = await armyService.assignCommander({
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue,
      commanderId: interaction.options.getString("komutan", true)
    });
    await interaction.editReply({ content: "✅ Komutan ordunun başına atandı.", embeds: [renderArmyEmbed(army)] });
    await logCommanderAssignment(interaction,country.name,"**"+(army.commander_name??"Komutan")+"**, **"+army.name+"** ordusunun başına atandı.");
  } else if (sub === "komutan-kaldir") {
    const army = await armyService.removeCommander({ guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue });
    await interaction.editReply({ content: "✅ Komutanın ordu görevi kaldırıldı.", embeds: [renderArmyEmbed(army)] });
    await logCommanderAssignment(interaction,country.name,"**"+army.name+"** ordusundaki Komutan görevi kaldırıldı.");
  } else if (sub === "dagit") {
    if (interaction.options.getString("onay", true).trim().toLocaleUpperCase("tr-TR") !== "DAGIT") throw new GameError("Orduyu dağıtmak için onay alanına DAGIT yazın.");
    const name = await armyService.disband({ guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id, army: armyValue });
    await interaction.editReply(`✅ **${name}** dağıtıldı. Askerler bağlı oldukları yerleşkelerin stokunda kalmaya devam ediyor.`);
  }
}
