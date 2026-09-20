import type { ChatInputCommandInteraction } from "discord.js";
import type { BattleUnitType } from "../domain/battle.js";
import { BATTLE_UNIT_STATS } from "../domain/battle.js";
import type { MobileSiegeAssetType } from "../services/army-service.js";
import { number } from "../domain/format.js";
import { armyService } from "../services/army-service.js";
import { armyMusterService } from "../services/army-muster-service.js";
import { GameError } from "../services/game-service.js";
import { resolveCountry } from "./auth.js";
import { renderArmyEmbed } from "./army-embed.js";
import { queueCharacterLog } from "./character-ui.js";

const musterStatus:Record<string,string>={SUBMITTED:"Emir verildi",IN_PROGRESS:"Yolda",BLOCKED:"Yönetici bekleniyor",
  WAITING_ARMY:"Orduyu bekliyor",COMPLETED:"Katıldı",CANCELLED:"İptal"};

async function logCommanderAssignment(interaction: ChatInputCommandInteraction,countryName:string,entry:string):Promise<void>{
  await queueCharacterLog({client:interaction.client,guildId:interaction.guildId!,interactionId:interaction.id,
    actorUserId:interaction.user.id,title:"Komutan Görev Günlüğü",source:"COMMANDER_COMMAND",
    entry:"⚔️ <@"+interaction.user.id+"> • **"+countryName+"**\n↳ "+entry}).catch(()=>undefined);
}

export async function handleArmyCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) throw new GameError("Ordu komutları yalnızca bir sunucuda kullanılabilir.");
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });
  const country = await resolveCountry(interaction);

  if (sub === "olustur") {
    const army = await armyService.create({
      guildId: interaction.guildId, countryId: country.id, actorId: interaction.user.id,
      name: interaction.options.getString("ad", true), commanderId: interaction.options.getString("komutan"),
      rallySettlement:interaction.options.getString("toplanma-yerleskesi")
    });
    await interaction.editReply({ content: "✅ Ordu oluşturuldu.", embeds: [renderArmyEmbed(army)] });
    if (army.commander_name) await logCommanderAssignment(interaction,country.name,"**"+army.commander_name+"**, **"+army.name+"** ordusunun başına atandı.");
    return;
  }
  if (sub === "bilgi") {
    const selected = interaction.options.getString("ordu");
    const armies = selected ? [await armyService.get(country.id, selected)] : await armyService.listCountry(country.id);
    if (!armies.length) throw new GameError("Devletinizde kurulmuş bir ordu bulunmuyor.");
    await interaction.editReply({ embeds: armies.slice(0, 10).map(renderArmyEmbed) });
    return;
  }
  if (sub === "toplama-emirleri") {
    const orders = await armyMusterService.list(country.id);
    await interaction.editReply(orders.length ? `🪖 **${country.name} • Ordu Toplama Emirleri**\n${orders.map((order) =>
      `• \`${order.id.slice(0,8)}\` **${order.army_name}** ← ${order.settlement_name}: ${number(order.quantity)} ${BATTLE_UNIT_STATS[order.unit_type]?.label??order.unit_type} • ${order.current_hex} → ${order.destination_hex} • ${order.returning?"Geri dönüyor":musterStatus[order.status]??order.status}${order.blocked_reason ? ` • ${order.blocked_reason}` : ""}`
    ).join("\n")}`.slice(0,1900) : "Etkin veya geçmiş ordu toplama emri bulunmuyor.");
    return;
  }
  if (sub === "toplama-iptal") {
    await armyMusterService.cancelUnstarted({ guildId:interaction.guildId,countryId:country.id,actorId:interaction.user.id,
      orderId:interaction.options.getString("emir-id",true) });
    await interaction.editReply("✅ Henüz yola çıkmamış ordu toplama emri iptal edildi; askerler kaynak yerleşkede kullanılabilir.");
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
      ? army.muster
        ? `🪖 Toplanma intikali başladı: **${army.muster.start} → ${army.muster.destination}**, ${army.muster.steps} Hex; tur başına ${army.muster.allowance} Hex. Emir: \`${army.muster.id}\`. Askerler varıncaya kadar ordu mevcuduna eklenmez.`
        : "✅ Askerler orduya tahsis edildi."
      : "✅ Askerlerin ordu tahsisi kaldırıldı.", embeds: [renderArmyEmbed(army)] });
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
    await interaction.editReply(`✅ **${name}** dağıtıldı. Askerler kaynak yerleşkelerinde kalmaya devam ediyor.`);
  }
}
