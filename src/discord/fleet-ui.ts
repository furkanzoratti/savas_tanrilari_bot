import type { ChatInputCommandInteraction } from "discord.js";
import type { NavalUnitType } from "../domain/battle.js";
import { fleetService } from "../services/fleet-service.js";
import { GameError } from "../services/game-service.js";
import { resolveCountry } from "./auth.js";
import { queueCharacterLog } from "./character-ui.js";
import { renderFleetEmbed } from "./fleet-embed.js";

async function logCommanderAssignment(interaction:ChatInputCommandInteraction,countryName:string,entry:string):Promise<void>{
  await queueCharacterLog({client:interaction.client,guildId:interaction.guildId!,interactionId:interaction.id,
    actorUserId:interaction.user.id,title:"Komutan Görev Günlüğü",source:"COMMANDER_COMMAND",
    entry:"⚓ <@"+interaction.user.id+"> • **"+countryName+"**\n↳ "+entry}).catch(()=>undefined);
}

export async function handleFleetCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Filo komutları yalnızca bir sunucuda kullanılabilir.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral:true });
  const country = await resolveCountry(interaction);
  if (sub === "olustur") {
    const fleet = await fleetService.create({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      name:interaction.options.getString("ad",true),commanderId:interaction.options.getString("komutan")
    });
    await interaction.editReply({ content:"✅ Filo oluşturuldu.",embeds:[renderFleetEmbed(fleet)] });
    if (fleet.commander_name) await logCommanderAssignment(interaction,country.name,`**${fleet.commander_name}**, **${fleet.name}** filosunun başına atandı.`);
    return;
  }
  if (sub === "bilgi") {
    const selected = interaction.options.getString("filo");
    const fleets = selected ? [await fleetService.get(country.id,selected)] : await fleetService.listCountry(country.id);
    if (!fleets.length) throw new GameError("Devletinizde kurulmuş bir filo bulunmuyor.");
    await interaction.editReply({ embeds:fleets.slice(0,10).map(renderFleetEmbed) });
    return;
  }
  const fleetValue = interaction.options.getString("filo",true);
  if (sub === "gemi-ekle" || sub === "gemi-cikar") {
    const input = {
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,fleet:fleetValue,
      settlement:interaction.options.getString("yerleske",true),
      shipType:interaction.options.getString("gemi",true) as NavalUnitType,
      quantity:interaction.options.getInteger("miktar",true)
    };
    const fleet = sub === "gemi-ekle" ? await fleetService.addShips(input) : await fleetService.removeShips(input);
    await interaction.editReply({
      content:sub === "gemi-ekle" ? "✅ Gemiler filoya tahsis edildi." : "✅ Gemilerin filo tahsisi kaldırıldı.",
      embeds:[renderFleetEmbed(fleet)]
    });
  } else if (sub === "komutan-ata") {
    const fleet = await fleetService.assignCommander({
      guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,fleet:fleetValue,
      commanderId:interaction.options.getString("komutan",true)
    });
    await interaction.editReply({ content:"✅ Komutan filonun başına atandı.",embeds:[renderFleetEmbed(fleet)] });
    await logCommanderAssignment(interaction,country.name,`**${fleet.commander_name ?? "Komutan"}**, **${fleet.name}** filosunun başına atandı.`);
  } else if (sub === "komutan-kaldir") {
    const fleet = await fleetService.removeCommander({ guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,fleet:fleetValue });
    await interaction.editReply({ content:"✅ Komutanın filo görevi kaldırıldı.",embeds:[renderFleetEmbed(fleet)] });
    await logCommanderAssignment(interaction,country.name,`**${fleet.name}** filosundaki Komutan görevi kaldırıldı.`);
  } else if (sub === "dagit") {
    if (interaction.options.getString("onay",true).trim().toLocaleUpperCase("tr-TR") !== "DAGIT") throw new GameError("Filoyu dağıtmak için onay alanına DAGIT yazın.");
    const name = await fleetService.disband({ guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,fleet:fleetValue });
    await interaction.editReply(`✅ **${name}** dağıtıldı. Gemiler kaynak limanlarında kalmaya devam ediyor.`);
  }
}
