import { EmbedBuilder, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { GOVERNOR_FOCUSES, type GovernorFocus } from "../domain/governorship.js";
import { characterService } from "../services/character-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { governorshipService } from "../services/governorship-service.js";
import { resolveCountry } from "./auth.js";

function sameName(first:string,second:string):boolean{
  return first.trim().toLocaleLowerCase("tr-TR")===second.trim().toLocaleLowerCase("tr-TR");
}

export async function handleGovernorshipCommand(interaction:ChatInputCommandInteraction):Promise<boolean>{
  if(interaction.commandName!=="valilik")return false;
  if(!interaction.guildId)throw new GameError("Bu komut yalnızca sunucuda kullanılabilir.");
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const country=await resolveCountry(interaction,interaction.options.getString("ulke"));
  const subcommand=interaction.options.getSubcommand();
  const active=await governorshipService.list(country.id);
  if(subcommand==="listele"){
    const lines=active.length?active.map((item)=>[
      `**${item.settlement_name}** • ${item.character_name}`,
      `${GOVERNOR_FOCUSES[item.focus].label} • Yetenek +${item.skill_bonus}${item.specialization==="PROVINCIAL_GOVERNOR"?` • Eyalet Valisi Sv${item.specialization_level}`:""}`,
      `Tur ${item.appointed_turn} tarihinde atandı • En erken ayrılış Tur ${item.minimum_end_turn}`
    ].join("\n")).join("\n\n"):"Etkin valilik bulunmuyor.";
    await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x8a5a3b).setTitle(`🏛️ ${country.name} • Valilikler`).setDescription(lines)]});
    return true;
  }
  const settlementName=interaction.options.getString("yerleske",true);
  const settlements=await gameService.listSettlements(country.id);
  const settlement=settlements.find((item)=>sameName(item.name,settlementName));
  if(!settlement)throw new GameError("Bu devlete ait belirtilen yerleşke bulunamadı.");
  if(subcommand==="ata"){
    const diplomatName=interaction.options.getString("diplomat",true);
    const diplomat=(await characterService.list(country.id)).find((item)=>item.role==="DIPLOMAT"&&sameName(item.name,diplomatName));
    if(!diplomat)throw new GameError("Bu devlete ait belirtilen diplomat bulunamadı.");
    const result=await governorshipService.appoint({
      guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,settlementId:settlement.id,characterId:diplomat.id,
      focus:interaction.options.getString("odak",true) as GovernorFocus
    });
    await interaction.editReply(`✅ **${result.character_name}**, **${result.settlement_name}** yerleşkesine **${GOVERNOR_FOCUSES[result.focus].label}** odağıyla vali atandı.`);
    return true;
  }
  const governorship=active.find((item)=>item.settlement_id===settlement.id);
  if(!governorship)throw new GameError("Bu yerleşkede etkin valilik bulunmuyor.");
  if(subcommand==="odak-degistir"){
    const result=await governorshipService.changeFocus({
      guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,governorshipId:governorship.id,
      focus:interaction.options.getString("odak",true) as GovernorFocus
    });
    await interaction.editReply(`✅ **${result.settlement_name}** valiliğinin odağı **${GOVERNOR_FOCUSES[result.focus].label}** olarak değiştirildi.`);
    return true;
  }
  await governorshipService.remove({guildId:interaction.guildId,actorId:interaction.user.id,countryId:country.id,governorshipId:governorship.id});
  await interaction.editReply(`✅ **${governorship.character_name}**, **${governorship.settlement_name}** valiliğinden ayrıldı.`);
  return true;
}
