import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction,
  type StringSelectMenuInteraction, type TextChannel
} from "discord.js";
import { gold, number } from "../domain/format.js";
import { fullAnnexationWarScoreCosts } from "../domain/war-score.js";
import { gameService, GameError } from "../services/game-service.js";
import { diplomacyService } from "../services/diplomacy-service.js";
import {
  warDeclarationService, type OfficialWarDetailView, type OfficialWarView,
  type PeaceOfferView, type WarEndOutcome, type WarInvitationView, type WarSide
} from "../services/war-declaration-service.js";
import { PEACE_TERM_TYPES, WAR_GOALS, type WarGoalType } from "../domain/war-objectives.js";
import { assertCountryAccess, isGameMaster, requireGameMaster, resolveCountry } from "./auth.js";
import { playerMentionPayload } from "./player-mentions.js";
import { countryFlagEmoji } from "./country-flag-emojis.js";
import { deleteCountryRole } from "./country-roles.js";
import {
  WAR_DECLARATION_BANNER_NAME, WAR_DECLARATION_BANNER_PATH, WAR_DECLARATION_BANNER_URL,
  PEACE_TREATY_BANNER_NAME, PEACE_TREATY_BANNER_PATH, PEACE_TREATY_BANNER_URL
} from "./assets.js";

type PendingWarDialog = {
  guildId: string;
  userId: string;
  requestedCountryName: string | null;
} & (
  | { kind: "war_declare"; targetCountryName: string; goalType: WarGoalType; targetSettlementName:string|null }
  | { kind: "peace_offer"; targetCountryName: string; settlementName:string|null; settlementRecipient:"BEN"|"HEDEF"|null }
  | { kind: "war_pact"; attackerPactName: string; targetPactName: string | null; targetCountryName: string | null; goalType:WarGoalType; targetSettlementName:string|null }
);

const pendingWarDialogs = new Map<string, PendingWarDialog>();

type PendingPeaceWizard={
  token:string;guildId:string;userId:string;proposerCountryId:string;warId:string|null;
  landRecipientCountryId:string|null;
  settlementIds:string[];
  payer:"NONE"|"PROPOSER"|"RECEIVER";indemnityAmount:number;terms:string;
};

const pendingPeaceWizards=new Map<string,PendingPeaceWizard>();

function rememberPeaceWizard(wizard:PendingPeaceWizard):void{
  pendingPeaceWizards.set(wizard.token,wizard);
  const expiry=setTimeout(()=>pendingPeaceWizards.delete(wizard.token),15*60_000);
  expiry.unref();
}

function peaceWizard(token:string,guildId:string,userId:string):PendingPeaceWizard{
  const wizard=pendingPeaceWizards.get(token);
  if(!wizard||wizard.guildId!==guildId||wizard.userId!==userId)throw new GameError("Bu barış formunun süresi dolmuş. `/baris-teklifi` komutunu yeniden açın.");
  return wizard;
}

function rememberWarDialog(interaction: ChatInputCommandInteraction, dialog: PendingWarDialog): string {
  const token = interaction.id;
  pendingWarDialogs.set(token, dialog);
  const expiry = setTimeout(() => pendingWarDialogs.delete(token), 15 * 60_000);
  expiry.unref();
  return `war_context|${token}`;
}

function fieldValue(value: string): string {
  return `${value.slice(0, 1022)}\n\u200B`;
}

function longTextFields(name: string, value: string): Array<{ name: string; value: string }> {
  const parts = value.match(/[\s\S]{1,1022}/g) ?? [value];
  return parts.map((part, index) => ({
    name: index === 0 ? name : `${name} (Devamı)`,
    value: fieldValue(part)
  }));
}

export function renderWarDeclaration(war: OfficialWarView): EmbedBuilder {
  const attackerTitle = war.attacker_pact_name ?? war.attacker_country_name;
  const defenderTitle = war.defender_pact_name ?? war.defender_country_name;
  const attackerParticipants = war.attacker_participant_names ?? [war.attacker_country_name];
  const defenderParticipants = war.defender_participant_names ?? [war.defender_country_name];
  const attackerAllies = war.attacker_diplomatic_ally_names ?? [];
  const defenderAllies = war.defender_diplomatic_ally_names ?? [];
  return new EmbedBuilder()
    .setColor(0x9f252c)
    .setTitle("⚔️ RESMÎ SAVAŞ İLANI")
    .setImage(WAR_DECLARATION_BANNER_URL)
    .setDescription(`**${attackerTitle}**, **${defenderTitle}** cephesine savaş ilan etti.`)
    .addFields(
      { name: "⚔️ Saldıran Cephe Lideri", value: fieldValue(war.attacker_country_name), inline: true },
      { name: "🛡️ Savunan Cephe Lideri", value: fieldValue(war.defender_country_name), inline: true },
      { name: "🎯 Savaş Hedefi", value: fieldValue(`${WAR_GOALS[war.goal_type]?.label??war.war_goal}${war.goal_target_settlement_name?` • ${war.goal_target_settlement_name}`:""}`) },
      { name: "⚖️ Savaş Dengesi", value: fieldValue(`${war.attacker_country_name} açısından **${Number(war.attacker_score)>0?"+":""}${Number(war.attacker_score)}** / 100`) },
      { name: `🔴 Saldıran Cephe${war.attacker_pact_name ? ` • ${war.attacker_pact_name}` : ""}`, value: fieldValue(attackerParticipants.join("\n")) },
      { name: `🔵 Savunan Cephe${war.defender_pact_name ? ` • ${war.defender_pact_name}` : ""}`, value: fieldValue(defenderParticipants.join("\n")) },
      { name: "🤝 Çağrılabilecek Saldıran Müttefikleri", value: fieldValue(attackerAllies.length ? attackerAllies.join("\n") : "Bulunmuyor."), inline: true },
      { name: "🤝 Çağrılabilecek Savunan Müttefikleri", value: fieldValue(defenderAllies.length ? defenderAllies.join("\n") : "Bulunmuyor."), inline: true },
      { name: "📜 Savaş Gerekçesi", value: fieldValue(war.reason) },
      ...longTextFields("📣 Resmî İlan", war.declaration),
      { name: "⏳ Başlangıç", value: fieldValue(`Tur ${war.started_turn}`) }
    )
    .setFooter({ text: "Savaş durumu devlet bilgi kartlarına otomatik olarak işlenmiştir." });
}

export function renderWarInvitation(invitation: WarInvitationView, war: OfficialWarView): EmbedBuilder {
  const sideName = invitation.side === "ATTACKER"
    ? (war.attacker_pact_name ?? `${war.attacker_country_name} Cephesi`)
    : (war.defender_pact_name ?? `${war.defender_country_name} Cephesi`);
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle("📯 SAVAŞA KATILIM ÇAĞRISI")
    .setDescription(`**${invitation.invited_by_country_name}**, **${invitation.country_name}** devletini savaşa çağırıyor.`)
    .addFields(
      { name: "⚔️ Savaş", value: fieldValue(`${war.attacker_country_name} — ${war.defender_country_name}`) },
      { name: "🏳️ Katılacağı Cephe", value: fieldValue(sideName) },
      { name: "🎯 Savaş Hedefi", value: fieldValue(war.war_goal) }
    )
    .setFooter({ text: "Kabul edildiğinde devlet bu savaşın ilgili cephesine resmen katılır; barış yetkisi cephe liderinde kalır." });
}

export function renderWarStructureUpdate(war: OfficialWarView): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5965a8)
    .setTitle("🧭 SAVAŞ CEPHELERİ GÜNCELLENDİ")
    .setDescription(`**${war.attacker_country_name}** ve **${war.defender_country_name}** liderliğindeki savaşın resmî yapısı güncellendi.`)
    .addFields(
      { name: "🎯 Savaş Hedefi", value: fieldValue(`${WAR_GOALS[war.goal_type]?.label??war.war_goal}${war.goal_target_settlement_name?` • ${war.goal_target_settlement_name}`:""}`) },
      { name: "⚖️ Savaş Dengesi", value: fieldValue(`${war.attacker_country_name} açısından **${Number(war.attacker_score)>0?"+":""}${Number(war.attacker_score)}**`) },
      { name: `🔴 Saldıran Cephe Lideri${war.attacker_pact_name ? ` • ${war.attacker_pact_name}` : ""}`, value: fieldValue(`**${war.attacker_country_name}**\n${war.attacker_participant_names.join("\n")}`), inline: true },
      { name: `🔵 Savunan Cephe Lideri${war.defender_pact_name ? ` • ${war.defender_pact_name}` : ""}`, value: fieldValue(`**${war.defender_country_name}**\n${war.defender_participant_names.join("\n")}`), inline: true }
    )
    .setFooter({ text: "Barış teklifleri yalnızca burada gösterilen iki savaş lideri arasında yürütülür." });
}

const ACTIVE_WARS_PER_PAGE=6;
type CountryFlagResolver=(countryName:string,fallback:string)=>string;
const fallbackCountryFlag:CountryFlagResolver=(_countryName,fallback)=>fallback;

const warTerrainLabels:Record<string,string>={
  OPEN_PLAIN:"Açık Arazi",AMBUSH:"Pusu",DESERT:"Çöl",FOREST:"Orman",MARSH:"Bataklık",
  MOUNTAIN:"Dağ",MOUNTAIN_PASS:"Dağ Geçidi",RIVER_CROSSING:"Nehir Geçişi",SIEGE:"Kuşatma",NAVAL:"Deniz Savaşı"
};

const warBattleStatusLabels:Record<string,string>={
  DRAFT:"Taslak",WAITING_FIRST_ROLL:"İlk zar bekleniyor",WAITING_SECOND_ROLL:"İkinci zar bekleniyor",
  READY_TO_RESOLVE:"Çözüm bekliyor",FINISHED:"Tamamlandı",CANCELLED:"İptal edildi"
};

const warScoreEventLabels:Record<string,string>={
  BATTLE:"Muharebe zaferi",OCCUPATION:"Yerleşke işgali",TARGET_OCCUPATION:"Savaş hedefi işgali",
  CAPITAL_OCCUPATION:"Başkent işgali",BLOCKADE:"Liman ablukası",GM_ADJUSTMENT:"Yönetici düzenlemesi"
};

function activeWarChunks(wars:OfficialWarView[]):OfficialWarView[][]{
  const chunks:OfficialWarView[][]=[];
  for(let index=0;index<wars.length;index+=ACTIVE_WARS_PER_PAGE)chunks.push(wars.slice(index,index+ACTIVE_WARS_PER_PAGE));
  return chunks;
}

function activeWarSelectRow(wars:OfficialWarView[],pageIndex:number,selectedWarId?:string):ActionRowBuilder<StringSelectMenuBuilder>|null{
  const page=activeWarChunks(wars)[pageIndex];
  if(!page?.length)return null;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`active_war_detail|${pageIndex}`)
      .setPlaceholder("Ayrıntılarını görmek için bir savaş seç")
      .setMinValues(1).setMaxValues(1)
      .addOptions(page.map((war)=>({
        label:`${war.attacker_country_name} — ${war.defender_country_name}`.slice(0,100),
        description:`${WAR_GOALS[war.goal_type]?.label??war.war_goal} • Denge ${Number(war.attacker_score)>0?"+":""}${Number(war.attacker_score)}`.slice(0,100),
        value:war.id,
        default:war.id===selectedWarId
      })))
  );
}

export function renderActiveWarSelectionRows(wars:OfficialWarView[]):Array<ActionRowBuilder<StringSelectMenuBuilder>|null>{
  if(!wars.length)return[null];
  return activeWarChunks(wars).map((_,pageIndex)=>activeWarSelectRow(wars,pageIndex));
}

function compactWarFront(names:string[],leader:string,flag:CountryFlagResolver):string{
  const participants=names.length?names:[leader];
  return participants.map((name)=>`${flag(name,"🏳️")} ${name===leader?`**${name}**`:name}`).join(" · ");
}

export function renderActiveWarPages(wars:OfficialWarView[],flag:CountryFlagResolver=fallbackCountryFlag):EmbedBuilder[]{
  if(!wars.length)return[new EmbedBuilder()
    .setColor(0x5965a8)
    .setTitle("⚔️ Devam Eden Devlet Savaşları")
    .setDescription("Şu anda resmî olarak devam eden bir devlet savaşı bulunmuyor.")
    .setFooter({text:"Yeni savaş ilanları burada listelenecek."})];
  const pages:Array<OfficialWarView[]>=[];
  for(let index=0;index<wars.length;index+=ACTIVE_WARS_PER_PAGE)pages.push(wars.slice(index,index+ACTIVE_WARS_PER_PAGE));
  return pages.map((page,pageIndex)=>{
    const embed=new EmbedBuilder()
      .setColor(0x9f252c)
      .setTitle(`⚔️ Devam Eden Devlet Savaşları${pages.length>1?` • ${pageIndex+1}/${pages.length}`:""}`)
      .setDescription(`Sunucuda **${wars.length} aktif savaş** bulunuyor.`)
      .setFooter({text:`Aktif savaşlar • Sayfa ${pageIndex+1}/${pages.length}`});
    for(const war of page){
      const type=war.war_type==="PACT"?"Pakt Savaşı":war.war_type==="FACTION"?"Çok Taraflı Savaş":"Devlet Savaşı";
      const goal=`${WAR_GOALS[war.goal_type]?.label??war.war_goal}${war.goal_target_settlement_name?` • ${war.goal_target_settlement_name}`:""}`;
      const details=[
        `🎯 **Hedef:** ${goal}`,
        `⚖️ **Savaş dengesi:** ${war.attacker_country_name} açısından ${Number(war.attacker_score)>0?"+":""}${Number(war.attacker_score)}`,
        `**Saldıran:** ${compactWarFront(war.attacker_participant_names,war.attacker_country_name,flag)}`,
        `**Savunan:** ${compactWarFront(war.defender_participant_names,war.defender_country_name,flag)}`,
        `🏷️ ${type}  •  ⏳ **Tur ${war.started_turn}**`
      ].join("\n").slice(0,900);
      embed.addFields({
        name:`${flag(war.attacker_country_name,"🔴")} ${war.attacker_country_name}  ↔  ${flag(war.defender_country_name,"🔵")} ${war.defender_country_name}`.slice(0,256),
        value:`${details}\n\u200B`,inline:false
      });
    }
    return embed;
  });
}

function publicBattleType(terrain:string):string{
  return terrain==="SIEGE"?"Kuşatma Savaşı":terrain==="NAVAL"?"Deniz Muharebesi":"Meydan Muharebesi";
}

export function renderActiveWarDetail(detail:OfficialWarDetailView,flag:CountryFlagResolver=fallbackCountryFlag):EmbedBuilder[]{
  const {war}=detail;
  const attackerFlag=flag(war.attacker_country_name,"🔴");
  const defenderFlag=flag(war.defender_country_name,"🔵");
  const goal=`${WAR_GOALS[war.goal_type]?.label??war.war_goal}${war.goal_target_settlement_name?` • ${war.goal_target_settlement_name}`:""}`;
  const activeOccupations=detail.occupations.filter((occupation)=>occupation.status==="ACTIVE");
  const countryOccupationLines=detail.countryOccupationScores
    .filter((item)=>item.score>0)
    .map((item)=>`${flag(item.country_name,item.side==="ATTACKER"?"🔴":"🔵")} **${item.country_name}:** ${number(item.score)} / 100`);
  const overview=new EmbedBuilder()
    .setColor(0x9f252c)
    .setTitle(`${attackerFlag} ${war.attacker_country_name} — ${defenderFlag} ${war.defender_country_name}`)
    .setDescription(`Tur **${war.started_turn}** tarihinde başlayan resmî savaşın ayrıntılı durumu.`)
    .addFields(
      {name:"🎯 Yapısal Savaş Hedefi",value:fieldValue(goal)},
      {name:"⚖️ Güncel Savaş Dengesi",value:fieldValue(`**${war.attacker_country_name}** açısından **${Number(war.attacker_score)>0?"+":""}${Number(war.attacker_score)} / 100**`)},
      {name:"🔴 Saldıran Cephe",value:fieldValue(war.attacker_participant_names.map((name)=>`${flag(name,"▫️")} ${name}`).join("\n")),inline:true},
      {name:"🔵 Savunan Cephe",value:fieldValue(war.defender_participant_names.map((name)=>`${flag(name,"▫️")} ${name}`).join("\n")),inline:true},
      {name:"🩸 Toplam Muharebe Kayıpları",value:fieldValue(`${attackerFlag} ${war.attacker_country_name}: **${number(detail.attackerLosses)}**\n${defenderFlag} ${war.defender_country_name}: **${number(detail.defenderLosses)}**`)},
      {name:"🏳️ Devlet Bazlı Teslimiyet",value:fieldValue(countryOccupationLines.length
        ?`${countryOccupationLines.join("\n")}\n_Bu değer her devletin kendi topraklarının işgal oranıdır; tam işgal edilen devlet 100/100 olur._`
        :"Hiçbir devletin toprağı işgal altında değil.")},
      {name:"🚩 Aktif İşgaller",value:fieldValue(activeOccupations.length
        ?activeOccupations.map((occupation)=>`**${occupation.settlement_name}** • ${flag(occupation.occupier_country_name,"🚩")} ${occupation.occupier_country_name} işgali • Cephe **+${number(Number(occupation.score_points))}** • Devlet **+${number(Number(occupation.country_score_points))}** • Barış bedeli **${number(Number(occupation.peace_cost??0))}**`).join("\n")
        :"Aktif işgal bulunmuyor.")}
    )
    .setFooter({text:"Aşağıdaki seçim kutusundan aynı sayfadaki başka bir savaşa geçebilirsin."});

  const battleEmbeds:EmbedBuilder[]=[];
  const battlesPerEmbed=6;
  const publicBattles=detail.battles.filter((battle)=>!(battle.terrain==="SIEGE"&&!['FINISHED','CANCELLED'].includes(battle.status)));
  const displayedBattles=publicBattles.slice(0,42);
  for(let index=0;index<displayedBattles.length;index+=battlesPerEmbed){
    const chunk=displayedBattles.slice(index,index+battlesPerEmbed);
    const embed=new EmbedBuilder().setColor(0x6f4a2f)
      .setTitle(`⚔️ Muharebeler${publicBattles.length>battlesPerEmbed?` • ${Math.floor(index/battlesPerEmbed)+1}/${Math.ceil(Math.min(publicBattles.length,42)/battlesPerEmbed)}`:""}`)
      .setDescription(`Toplam **${publicBattles.length} sonuçlanmış veya açık meydan/deniz muharebesi** kaydı${publicBattles.length>42?" • En güncel 42 kayıt gösteriliyor":""}. Etkin kuşatmalar sonuçlanana kadar burada gösterilmez.`);
    for(const battle of chunk){
      const score=battle.battle_score_points>0
        ?` • Savaş puanı: **+${number(Number(battle.battle_score_points))} ${battle.battle_score_side==="ATTACKER"?"Saldıran":"Savunan"}**`
        :"";
      embed.addFields({
        name:publicBattleType(battle.terrain),
        value:fieldValue([
          `${flag(battle.country_a_name,"🔴")} **${battle.country_a_name}:** ${number(Number(battle.losses_a))} toplam kayıp`,
          `${flag(battle.country_b_name,"🔵")} **${battle.country_b_name}:** ${number(Number(battle.losses_b))} toplam kayıp`,
          `**Durum:** ${warBattleStatusLabels[battle.status]??battle.status} • ${number(Number(battle.round_number))} savaş turu${score}`
        ].filter(Boolean).join("\n"))
      });
    }
    battleEmbeds.push(embed);
  }

  const eventLines=detail.scoreEvents.slice(0,30).map((event)=>{
    const side=event.side==="ATTACKER"?war.attacker_country_name:war.defender_country_name;
    const subject=event.settlement_name??(event.battle_terrain?publicBattleType(event.battle_terrain):null);
    return `• **Tur ${number(Number(event.game_turn))}** • ${flag(side,event.side==="ATTACKER"?"🔴":"🔵")} ${side}: **+${number(Number(event.points))}** — ${warScoreEventLabels[event.event_type]??event.event_type}${subject?` • ${subject}`:""}`;
  });
  const scoreEmbed=new EmbedBuilder().setColor(0xc59b45).setTitle("⚖️ Savaş Puanı Hareketleri")
    .setDescription(eventLines.length?`${eventLines.join("\n").slice(0,4000)}${detail.scoreEvents.length>30?`\n\n_En güncel 30/${detail.scoreEvents.length} hareket gösteriliyor._`:""}`:"Henüz savaş puanı üreten bir olay bulunmuyor.");
  return[overview,...battleEmbeds,scoreEmbed].slice(0,10);
}

function peaceWarSelectionPayload(wizard:PendingPeaceWizard,wars:OfficialWarView[]){
  const eligible=wars.filter((war)=>war.attacker_country_id===wizard.proposerCountryId||war.defender_country_id===wizard.proposerCountryId);
  if(!eligible.length)throw new GameError("Barış teklifi gönderebileceğiniz aktif bir savaş bulunmuyor.");
  const menu=new StringSelectMenuBuilder().setCustomId(`peace_war_select|${wizard.token}`)
    .setPlaceholder("Müzakere edilecek savaşı seç")
    .addOptions(eligible.slice(0,25).map((war)=>({
      label:`${war.attacker_country_name} — ${war.defender_country_name}`.slice(0,100),
      description:`${WAR_GOALS[war.goal_type]?.label??war.war_goal} • Denge ${Number(war.attacker_score)>0?"+":""}${Number(war.attacker_score)}`.slice(0,100),
      value:war.id
    })));
  return{
    embeds:[new EmbedBuilder().setColor(0x3c8b5c).setTitle("🕊️ Barış Müzakeresi")
      .setDescription("Bağlayıcı barış teklifini hazırlamak için önce aktif savaşı seç. Sonraki ekranda toprak devri, altın ödemesi ve anlaşma metnini ayrı ayrı düzenleyebilirsin.")
      .addFields({name:"🔐 Yetki",value:fieldValue("Teklifi yalnızca savaş cephelerinden birinin lider devleti gönderebilir.")})],
    components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
  };
}

function peaceWizardPayload(wizard:PendingPeaceWizard,detail:OfficialWarDetailView){
  const {war}=detail;
  const receiverId=war.attacker_country_id===wizard.proposerCountryId?war.defender_country_id:war.attacker_country_id;
  const proposerName=war.attacker_country_id===wizard.proposerCountryId?war.attacker_country_name:war.defender_country_name;
  const receiverName=war.attacker_country_id===wizard.proposerCountryId?war.defender_country_name:war.attacker_country_name;
  const participantById=new Map(detail.participants.map((participant)=>[participant.country_id,participant]));
  const proposerSide=participantById.get(wizard.proposerCountryId)?.side
    ??(war.attacker_country_id===wizard.proposerCountryId?"ATTACKER":"DEFENDER");
  const landRecipient=participantById.get(wizard.landRecipientCountryId??wizard.proposerCountryId)
    ??participantById.get(wizard.proposerCountryId);
  if(!landRecipient)throw new GameError("Barış formunda teklif eden devletin savaş cephesi bulunamadı.");
  wizard.landRecipientCountryId=landRecipient.country_id;
  const activeOccupations=detail.occupations.filter((occupation)=>
    occupation.status==="ACTIVE"&&participantById.get(occupation.occupier_country_id)?.side===landRecipient.side
  );
  const selectedOccupations=activeOccupations.filter((occupation)=>wizard.settlementIds.includes(occupation.settlement_id));
  const displayedCostBySettlement=new Map(selectedOccupations.map((occupation)=>[
    occupation.settlement_id,Number(occupation.peace_cost??0)
  ]));
  const fullAnnexationOwnerIds=new Set<string>();
  const selectedByOwner=new Map<string,typeof selectedOccupations>();
  for(const occupation of selectedOccupations){
    selectedByOwner.set(occupation.legal_owner_country_id,[...(selectedByOwner.get(occupation.legal_owner_country_id)??[]),occupation]);
  }
  for(const [ownerId,occupations] of selectedByOwner){
    if(occupations.length!==Number(occupations[0]?.legal_owner_settlement_count??0))continue;
    const costs=fullAnnexationWarScoreCosts(occupations.map((occupation)=>Number(occupation.peace_cost??0)));
    occupations.forEach((occupation,index)=>displayedCostBySettlement.set(occupation.settlement_id,costs[index]??0));
    fullAnnexationOwnerIds.add(ownerId);
  }
  const payerName=wizard.payer==="PROPOSER"?proposerName:wizard.payer==="RECEIVER"?receiverName:null;
  const overallScoreBudget=Math.max(0,proposerSide==="ATTACKER"?Number(war.attacker_score):-Number(war.attacker_score));
  const demandedOwnerIds=new Set(selectedOccupations
    .filter(()=>landRecipient.side===proposerSide)
    .map((occupation)=>occupation.legal_owner_country_id));
  const countryScoreBudget=Math.max(0,...detail.countryOccupationScores
    .filter((item)=>demandedOwnerIds.has(item.country_id)&&item.side!==proposerSide)
    .map((item)=>Number(item.score)));
  const scoreBudget=Math.max(overallScoreBudget,countryScoreBudget);
  const landCost=selectedOccupations.reduce((sum,occupation)=>sum+Number(displayedCostBySettlement.get(occupation.settlement_id)??0)
    *(landRecipient.side===proposerSide?1:-1),0);
  const indemnityCost=wizard.indemnityAmount>0
    ?Math.ceil(wizard.indemnityAmount/1_000)*(wizard.payer==="RECEIVER"?1:-1)
    :0;
  const demandCost=selectedOccupations.reduce((sum,occupation)=>sum+(landRecipient.side===proposerSide
    ?Number(displayedCostBySettlement.get(occupation.settlement_id)??0):0),0)+Math.max(0,indemnityCost);
  const demandedCostByCountry=new Map<string,number>();
  if(landRecipient.side===proposerSide){
    for(const occupation of selectedOccupations){
      demandedCostByCountry.set(occupation.legal_owner_country_id,
        (demandedCostByCountry.get(occupation.legal_owner_country_id)??0)+Number(displayedCostBySettlement.get(occupation.settlement_id)??0));
    }
  }
  if(indemnityCost>0)demandedCostByCountry.set(receiverId,(demandedCostByCountry.get(receiverId)??0)+indemnityCost);
  const countryScoreById=new Map(detail.countryOccupationScores.map((item)=>[item.country_id,Number(item.score)]));
  const countryBudgetViolation=[...demandedCostByCountry.entries()].find(([countryId,cost])=>
    cost>Math.max(overallScoreBudget,countryScoreById.get(countryId)??0));
  const countryBudgetViolationName=countryBudgetViolation
    ?detail.participants.find((item)=>item.country_id===countryBudgetViolation[0])?.country_name??"Hedef devlet"
    :null;
  const concessionCost=Math.abs(Math.min(0,landCost))+Math.abs(Math.min(0,indemnityCost));
  const landSummary=selectedOccupations.length
    ?`${selectedOccupations.map((occupation)=>`• **${occupation.settlement_name}** → **${landRecipient.country_name}** • ${landRecipient.side===proposerSide?"Talep":"Taviz"} **${number(Number(displayedCostBySettlement.get(occupation.settlement_id)??0))}**`).join("\n")}${fullAnnexationOwnerIds.size?`\n\n🏴 **Tam ilhak:** ${[...fullAnnexationOwnerIds].map((ownerId)=>selectedByOwner.get(ownerId)?.[0]?.legal_owner_country_name).filter(Boolean).join(", ")} • Toprak bedeli toplam **100** savaş skoru.`:""}\n_Topraklar, fiilî işgalciyle aynı cephede bulunan seçili devlete devredilir._`
    :"Toprak devri talep edilmiyor.";
  const embed=new EmbedBuilder().setColor(0x3c8b5c).setTitle("🕊️ Barış Teklifi Hazırlama Masası")
    .setDescription(`**${proposerName}** → **${receiverName}**\nSeçimler henüz karşı tarafa gönderilmedi; aşağıdaki önizlemeyi dilediğin kadar değiştirebilirsin.`)
    .addFields(
      {name:"⚔️ Savaş",value:fieldValue(`${war.attacker_country_name} — ${war.defender_country_name}\n🎯 ${WAR_GOALS[war.goal_type]?.label??war.war_goal} • ⚖️ ${war.attacker_country_name} açısından ${Number(war.attacker_score)>0?"+":""}${Number(war.attacker_score)}`)},
      ...longTextFields("🗺️ Toprak Maddeleri",landSummary),
      {name:"💰 Altın Maddesi",value:fieldValue(wizard.indemnityAmount>0&&payerName?`**${payerName}** ${gold(wizard.indemnityAmount)} ödeyecek.`:"Altın ödemesi talep edilmiyor."),inline:true},
      {name:"⚖️ Talep Bütçesi",value:fieldValue(`Toprak dengesi **${landCost>=0?"+":""}${number(landCost)}** • Altın dengesi **${indemnityCost>=0?"+":""}${number(indemnityCost)}**\nTalep **${number(demandCost)} / ${number(scoreBudget)}** savaş skoru • Cephe bütçesi **${number(overallScoreBudget)}**${countryScoreBudget?` • İlgili devlet teslimiyeti **${number(countryScoreBudget)}/100**`:""} • Verilen taviz **${number(concessionCost)}**${demandCost>scoreBudget?"\n❌ Mevcut savaş skoru bu teklif için yetersiz.":""}${countryBudgetViolation?`\n❌ ${countryBudgetViolationName} devletinden istenen **${number(countryBudgetViolation[1])}** skor, bu devlete karşı kullanılabilir bütçeyi aşıyor.`:""}`)},
      {name:"📜 Anlaşma Metni",value:fieldValue(wizard.terms||"Henüz anlaşma metni yazılmadı.")}
    )
    .setFooter({text:"Teklifi Gönder düğmesi bütün maddeleri son kez doğrular ve karşı cephe liderine yollar."});
  const landOptions=activeOccupations.slice(0,25).map((occupation)=>({
      label:occupation.settlement_name.slice(0,100),
      description:`İşgal +${number(Number(occupation.score_points))} • Barış bedeli ${number(Number(occupation.peace_cost??0))} • ${occupation.occupier_country_name}`.slice(0,100),
      value:occupation.settlement_id,default:wizard.settlementIds.includes(occupation.settlement_id)
    }));
  const landMenu=new StringSelectMenuBuilder().setCustomId(`peace_land_select|${wizard.token}`)
    .setPlaceholder(activeOccupations.length?"Bir veya daha fazla toprak maddesi seç":"Devredilebilecek lider işgali bulunmuyor")
    .setMinValues(1).setMaxValues(Math.max(1,landOptions.length))
    .addOptions(landOptions.length?landOptions:[{label:"Devredilebilir toprak yok",description:"Aktif lider işgali bulunmuyor",value:"NONE"}])
    .setDisabled(!landOptions.length);
  const landRow=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    landMenu
  );
  const recipientRow=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`peace_land_recipient_select|${wizard.token}`)
      .setPlaceholder("Toprakları alacak devleti seç")
      .addOptions(detail.participants.slice(0,25).map((participant)=>(
        {label:participant.country_name.slice(0,100),description:`${participant.side==="ATTACKER"?"Saldıran":"Savunan"} cephe`,value:participant.country_id,default:participant.country_id===landRecipient.country_id}
      )))
  );
  const payerRow=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`peace_payer_select|${wizard.token}`).setPlaceholder("Altın ödemesinin yönünü seç").addOptions(
      {label:"Altın maddesi yok",description:"Teklifte tazminat bulunmaz",value:"NONE",default:wizard.payer==="NONE"},
      {label:`${proposerName} ödesin`.slice(0,100),description:"Teklif eden taraf ödeme yapar",value:"PROPOSER",default:wizard.payer==="PROPOSER"},
      {label:`${receiverName} ödesin`.slice(0,100),description:"Teklif edilen taraftan ödeme talep edilir",value:"RECEIVER",default:wizard.payer==="RECEIVER"}
    )
  );
  const buttonRow=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`peace_wizard_edit|${wizard.token}`).setLabel("Metin ve Altını Düzenle").setEmoji("✍️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`peace_wizard_send|${wizard.token}`).setLabel("Teklifi Gönder").setEmoji("🕊️").setStyle(ButtonStyle.Success)
      .setDisabled(demandCost>scoreBudget||Boolean(countryBudgetViolation)),
    new ButtonBuilder().setCustomId(`peace_wizard_clear_lands|${wizard.token}`).setLabel("Toprağı Temizle").setEmoji("🧹").setStyle(ButtonStyle.Secondary).setDisabled(!wizard.settlementIds.length),
    new ButtonBuilder().setCustomId(`peace_wizard_back|${wizard.token}`).setLabel("Savaşı Değiştir").setEmoji("↩️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`peace_wizard_cancel|${wizard.token}`).setLabel("İptal").setStyle(ButtonStyle.Secondary)
  );
  return{embeds:[embed],components:[landRow,recipientRow,payerRow,buttonRow],receiverId};
}

function warInvitationButtons(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`war_invite_accept|${id}`).setLabel("Savaşa Katıl").setEmoji("⚔️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`war_invite_reject|${id}`).setLabel("Çağrıyı Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

export function renderPeaceOffer(offer: PeaceOfferView): EmbedBuilder {
  const indemnity = offer.indemnity_amount > 0
    ? `**${offer.payer_country_name}** → **${offer.recipient_country_name}**\n${gold(offer.indemnity_amount)}`
    : "Tazminat talep edilmiyor.";
  const structured=(offer.structured_terms??[]).map((term)=>{
    const cost=Number(term.war_score_cost??0);
    const scoreText=cost===0?"":` • ${cost>0?"Talep":"Taviz"} **${number(Math.abs(cost))}** skor`;
    if(term.term_type==="TRANSFER_SETTLEMENT")return `• **Yerleşke Devri:** ${term.settlement_name} → ${term.target_country_name}${scoreText}`;
    if(term.term_type==="INDEMNITY")return `• **Tazminat:** ${term.source_country_name} → ${term.target_country_name} • ${gold(Number(term.amount??0))}${scoreText}`;
    return `• **${PEACE_TERM_TYPES[term.term_type]}**`;
  }).join("\n")||"• Beyaz Barış";
  return new EmbedBuilder()
    .setColor(0xc59b45)
    .setTitle("🕊️ BARIŞ TEKLİFİ")
    .setDescription(`**${offer.proposer_country_name}**, **${offer.receiver_country_name}** devletine barış teklif ediyor.`)
    .addFields(
      { name: "📤 Teklif Eden", value: fieldValue(offer.proposer_country_name), inline: true },
      { name: "📥 Teklif Edilen", value: fieldValue(offer.receiver_country_name), inline: true },
      ...longTextFields("📜 Barış Şartları", offer.terms),
      ...longTextFields("🧾 Bağlayıcı Maddeler",structured),
      { name: "💰 Savaş Tazminatı", value: fieldValue(indemnity) },
      { name: "⚖️ Talep Edilen Savaş Skoru", value: fieldValue(`**${number(Number(offer.total_war_score_cost??0))}**`) }
    )
    .setFooter({ text: "Yalnızca hedef devletin oyuncuları veya oyun yöneticisi yanıtlayabilir." });
}

export function renderPeaceAnnouncement(input: {
  firstCountry: string; secondCountry: string; turn: number | null; terms: string;
  firstSide?: string[]; secondSide?: string[];
  indemnityAmount?: number; payerCountry?: string | null; recipientCountry?: string | null;
  structuredTerms?: PeaceOfferView["structured_terms"];
}): EmbedBuilder {
  const firstSide = input.firstSide ?? [input.firstCountry];
  const secondSide = input.secondSide ?? [input.secondCountry];
  const embed = new EmbedBuilder()
    .setColor(0x3c8b5c)
    .setTitle("🕊️ BARIŞ ANTLAŞMASI • SAVAŞ SONA ERDİ")
    .setImage(PEACE_TREATY_BANNER_URL)
    .setDescription(`**${input.firstCountry}** ve **${input.secondCountry}** liderliğindeki savaş cepheleri barış yaptı.`)
    .addFields(
      { name: `🔴 ${input.firstCountry} Cephesi`, value: fieldValue(firstSide.join("\n")), inline: true },
      { name: `🔵 ${input.secondCountry} Cephesi`, value: fieldValue(secondSide.join("\n")), inline: true },
      ...longTextFields("📜 Barış Şartları", input.terms)
    );
  if (input.indemnityAmount && input.payerCountry && input.recipientCountry) {
    embed.addFields({
      name: "💰 Ödenen Savaş Tazminatı",
      value: fieldValue(`**${input.payerCountry}** → **${input.recipientCountry}**\n${gold(input.indemnityAmount)}`)
    });
  }
  const landTransfers=(input.structuredTerms??[])
    .filter((term)=>term.term_type==="TRANSFER_SETTLEMENT")
    .map((term)=>`**${term.settlement_name}** → **${term.target_country_name}**`);
  if(landTransfers.length)embed.addFields(...longTextFields("🗺️ Kesinleşen Toprak Devirleri",landTransfers.join("\n")));
  if (input.turn !== null) embed.addFields({ name: "⏳ Antlaşma Turu", value: fieldValue(`Tur ${input.turn}`) });
  return embed.setFooter({ text: "Bağlayıcı barış maddeleri kabul işlemiyle birlikte tek işlemde uygulanmıştır." });
}

export function renderWarEndAnnouncement(input: {
  firstCountry: string; secondCountry: string; winnerCountry: string | null;
  firstSide?: string[]; secondSide?: string[];
  outcome: WarEndOutcome; turn: number | null; description: string;
}): EmbedBuilder {
  const firstSide = input.firstSide ?? [input.firstCountry];
  const secondSide = input.secondSide ?? [input.secondCountry];
  const whitePeace = input.outcome === "WHITE_PEACE";
  const result = whitePeace ? "Beyaz Barış" : `Kazanan: **${input.winnerCountry}**`;
  return new EmbedBuilder()
    .setColor(whitePeace ? 0x3c8b5c : 0xc59b45)
    .setTitle(whitePeace ? "🕊️ BEYAZ BARIŞ • SAVAŞ SONA ERDİ" : "🏆 SAVAŞ SONA ERDİ")
    .setImage(PEACE_TREATY_BANNER_URL)
    .setDescription(`**${input.firstCountry}** ve **${input.secondCountry}** liderliğindeki savaş resmen sona erdi.`)
    .addFields(
      { name: `🔴 ${input.firstCountry} Cephesi`, value: fieldValue(firstSide.join("\n")), inline: true },
      { name: `🔵 ${input.secondCountry} Cephesi`, value: fieldValue(secondSide.join("\n")), inline: true },
      { name: "🏁 Sonuç", value: fieldValue(result) },
      ...longTextFields("📜 Savaş Bitiş Açıklaması", input.description),
      ...(input.turn === null ? [] : [{ name: "⏳ Bitiş Turu", value: fieldValue(`Tur ${input.turn}`) }])
    )
    .setFooter({ text: "Bu duyuru yalnızca resmî savaş durumunu kapatır; hazine ve yerleşke işlemleri ayrıca uygulanır." });
}

function peaceButtons(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`peace_accept|${id}`).setLabel("Barışı Kabul Et").setEmoji("🕊️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`peace_reject|${id}`).setLabel("Teklifi Reddet").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );
}

async function warChannel(interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction): Promise<TextChannel> {
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  const channelId = await warDeclarationService.channel(interaction.guildId);
  if (!channelId) throw new GameError("Önce yönetici /savas-ilan-kanali komutuyla savaşlar kanalını seçmelidir.");
  let channel;
  try {
    channel = await interaction.client.channels.fetch(channelId);
  } catch {
    throw new GameError("Belirlenen savaşlar kanalına erişilemiyor. Kanal ayarını ve bot izinlerini kontrol edin.");
  }
  if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== interaction.guildId) {
    throw new GameError("Belirlenen savaşlar kanalı geçerli bir sunucu metin kanalı değil.");
  }
  return channel;
}

async function countryByOption(interaction: ChatInputCommandInteraction, option: string) {
  const country = await gameService.countryByName(interaction.guildId!, interaction.options.getString(option, true));
  if (!country) throw new GameError("Belirtilen devlet bulunamadı.");
  return country;
}

function modalText(id: string, label: string, style: TextInputStyle, options: { required?: boolean; placeholder?: string; maxLength?: number; value?:string } = {}): ActionRowBuilder<TextInputBuilder> {
  const field = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(options.required ?? true);
  if (options.placeholder) field.setPlaceholder(options.placeholder);
  if (options.maxLength) field.setMaxLength(options.maxLength);
  if (options.value) field.setValue(options.value.slice(0,options.maxLength??4000));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(field);
}

function normalizePayer(value: string): string {
  return value.trim().toLocaleUpperCase("tr-TR").replaceAll("İ", "I").replaceAll("Ş", "S").replaceAll("Ğ", "G").replaceAll("Ü", "U").replaceAll("Ö", "O").replaceAll("Ç", "C");
}

export function parsePeaceIndemnity(raw: string): number {
  const normalized = raw.trim().replaceAll(".", "").replaceAll(",", "").replaceAll(" ", "");
  if (!normalized) return 0;
  if (!/^\d+$/.test(normalized)) throw new GameError("Tazminat yalnızca pozitif rakamlarla girilebilir.");
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new GameError("Tazminat tutarı geçerli bir tam sayı olmalıdır.");
  return amount;
}

export async function handleWarDeclarationCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const supported = ["savas-ilan-kanali", "savas-ilani", "pakt-savasi", "savas-cagrisi", "savas-yapilandir", "baris-teklifi", "aktif-savaslar", "savas-sonlandir"];
  if (!supported.includes(interaction.commandName)) return false;
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca bir Discord sunucusunda kullanılabilir.");

  if (interaction.commandName === "savas-ilan-kanali") {
    requireGameMaster(interaction);
    const operation = interaction.options.getString("islem", true);
    const channel = interaction.options.getChannel("kanal");
    if (operation === "set" && !channel) throw new GameError("Duyuru kanalını ayarlamak için bir metin kanalı seçmelisiniz.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await warDeclarationService.setChannel({ guildId: interaction.guildId, actorId: interaction.user.id, channelId: operation === "set" ? channel!.id : null });
    await interaction.editReply(operation === "set" ? `✅ Savaş ve barış duyuruları ${channel} kanalında yayımlanacak.` : "✅ Savaş duyuru kanalı kaldırıldı.");
    return true;
  }

  if (interaction.commandName === "aktif-savaslar") {
    await interaction.deferReply();
    const wars = await warDeclarationService.activeWars(interaction.guildId);
    const flag:CountryFlagResolver=(countryName,fallback)=>countryFlagEmoji(interaction.guild,countryName,fallback);
    const pages=renderActiveWarPages(wars,flag);
    const selections=renderActiveWarSelectionRows(wars);
    await interaction.editReply({embeds:[pages[0]!],components:selections[0]?[selections[0]]:[]});
    for(let index=1;index<pages.length;index++){
      const selection=selections[index];
      await interaction.followUp({embeds:[pages[index]!],components:selection?[selection]:[]});
    }
    return true;
  }

  if (interaction.commandName === "savas-sonlandir") {
    requireGameMaster(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await warChannel(interaction);
    const warId = interaction.options.getString("savas", true);
    const winnerSelection = interaction.options.getString("kazanan", true);
    const winnerCountryId = winnerSelection === "WHITE_PEACE" ? null : winnerSelection;
    const description = interaction.options.getString("aciklama", true);
    const war = await warDeclarationService.forceEnd({ guildId: interaction.guildId, actorId: interaction.user.id, warId, winnerCountryId, description });
    const outcome = war.end_outcome!;
    await channel.send({
      embeds: [renderWarEndAnnouncement({
        firstCountry: war.attacker_country_name, secondCountry: war.defender_country_name,
        firstSide: war.attacker_participant_names, secondSide: war.defender_participant_names,
        winnerCountry: war.winner_country_name, outcome, turn: war.ended_turn, description
      })],
      files: [new AttachmentBuilder(PEACE_TREATY_BANNER_PATH, { name: PEACE_TREATY_BANNER_NAME })]
    });
    const resultText = outcome === "WHITE_PEACE" ? "beyaz barışla" : `**${war.winner_country_name}** zaferiyle`;
    await interaction.editReply(`✅ **${war.attacker_country_name}** ile **${war.defender_country_name}** arasındaki savaş ${resultText} sonlandırıldı ve duyuruldu.`);
    return true;
  }

  if (interaction.commandName === "savas-yapilandir") {
    requireGameMaster(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await warChannel(interaction);
    const subcommand = interaction.options.getSubcommand();
    const warId = interaction.options.getString("savas", true);
    let war: OfficialWarView;
    let operation = "Savaş yapısı güncellendi.";
    if (subcommand === "hedef-ayarla") {
      war = await warDeclarationService.setWarGoal({
        guildId: interaction.guildId, actorId: interaction.user.id, warId,
        warGoal: interaction.options.getString("hedef", true)
      });
      operation = "Savaş hedefi güncellendi.";
    } else if (subcommand === "pakt-bagla") {
      const pact = await diplomacyService.pactByName(interaction.guildId, interaction.options.getString("pakt", true));
      if (!pact) throw new GameError("Bağlanacak pakt bulunamadı.");
      war = await warDeclarationService.attachPactToWar({
        guildId: interaction.guildId, actorId: interaction.user.id, warId,
        side: interaction.options.getString("cephe", true) as WarSide, pactId: pact.id
      });
      operation = `**${pact.name}** seçilen cepheye bağlandı; aktif üyeleri savaşa eklendi ve pakt lideri savaş lideri yapıldı.`;
    } else if (subcommand === "pakt-kaldir") {
      war = await warDeclarationService.detachPactFromWar({
        guildId: interaction.guildId, actorId: interaction.user.id, warId,
        side: interaction.options.getString("cephe", true) as WarSide
      });
      operation = "Cephe pakt bağı kaldırıldı; mevcut katılımcılar korundu.";
    } else {
      const countryName = interaction.options.getString("ulke", true);
      const country = await gameService.countryByName(interaction.guildId, countryName);
      if (!country) throw new GameError("Belirtilen devlet bulunamadı.");
      if (subcommand === "ulke-ekle") {
        war = await warDeclarationService.addWarParticipant({
          guildId: interaction.guildId, actorId: interaction.user.id, warId,
          side: interaction.options.getString("cephe", true) as WarSide, countryId: country.id
        });
        operation = `**${country.name}** seçilen cepheye doğrudan eklendi.`;
      } else if (subcommand === "ulke-cikar") {
        war = await warDeclarationService.removeWarParticipant({
          guildId: interaction.guildId, actorId: interaction.user.id, warId, countryId: country.id
        });
        operation = `**${country.name}** savaş cephesinden çıkarıldı.`;
      } else if (subcommand === "lider-degistir") {
        war = await warDeclarationService.changeWarLeader({
          guildId: interaction.guildId, actorId: interaction.user.id, warId,
          side: interaction.options.getString("cephe", true) as WarSide, countryId: country.id
        });
        operation = `**${country.name}** seçilen cephenin yeni savaş lideri oldu.`;
      } else {
        throw new GameError("Bilinmeyen savaş yapılandırma işlemi.");
      }
    }
    await channel.send({ embeds: [renderWarStructureUpdate(war)] });
    await interaction.editReply(`✅ ${operation}\nGüncel cephe yapısı ${channel} kanalında duyuruldu.`);
    return true;
  }

  if (interaction.commandName === "pakt-savasi") {
    const attackerPactName = interaction.options.getString("saldiran-pakt", true);
    const targetPactName = interaction.options.getString("hedef-pakt");
    const targetCountryName = interaction.options.getString("hedef-ulke");
    if (Boolean(targetPactName) === Boolean(targetCountryName)) throw new GameError("Hedef olarak yalnızca bir pakt veya bir devlet seçmelisiniz.");
    const customId = rememberWarDialog(interaction, {
      kind: "war_pact", guildId: interaction.guildId, userId: interaction.user.id,
      requestedCountryName: interaction.options.getString("ulke"), attackerPactName, targetPactName, targetCountryName,
      goalType:interaction.options.getString("hedef-turu",true) as WarGoalType,targetSettlementName:interaction.options.getString("hedef-yerleske")
    });
    const modal = new ModalBuilder().setCustomId(customId).setTitle("Pakt Savaşı İlanı");
    modal.addComponents(
      modalText("reason", "Savaş gerekçesi", TextInputStyle.Paragraph, { placeholder: "Savaşın diplomatik veya siyasi gerekçesi", maxLength: 1000 }),
      modalText("declaration", "Herkese açık resmî ilan metni", TextInputStyle.Paragraph, { placeholder: "Savaşlar kanalında yayımlanacak duyuru", maxLength: 2000 })
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.commandName === "savas-cagrisi") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await warChannel(interaction);
    const own = await resolveCountry(interaction, interaction.options.getString("ulke"));
    const target = await countryByOption(interaction, "hedef-ulke");
    const warId = interaction.options.getString("savas", true);
    const invitation = await warDeclarationService.createWarInvitation({
      guildId: interaction.guildId, actorId: interaction.user.id, warId, leaderCountryId: own.id, targetCountryId: target.id
    });
    const war = await warDeclarationService.getWar(warId);
    if (!war) throw new GameError("Aktif savaş bulunamadı.");
    try {
      const players = await gameService.playerIds(target.id);
      const notification=playerMentionPayload(players,`📯 **${target.name}** • Oyun yöneticisi yanıtlayabilir.`);
      const message = await channel.send({
        content: notification.content,
        embeds: [renderWarInvitation(invitation, war)], components: [warInvitationButtons(invitation.id)],
        allowedMentions: notification.allowedMentions
      });
      await warDeclarationService.attachWarInvitationMessage(invitation.id, channel.id, message.id);
    } catch (error) {
      await warDeclarationService.cancelWarInvitation(interaction.guildId, invitation.id).catch(() => undefined);
      throw error;
    }
    await interaction.editReply(`✅ **${target.name}** devletine savaş çağrısı gönderildi ve ${channel} kanalında yayımlandı.`);
    return true;
  }

  if (interaction.commandName === "savas-ilani") {
    const customId = rememberWarDialog(interaction, {
      kind: "war_declare", guildId: interaction.guildId, userId: interaction.user.id,
      requestedCountryName: interaction.options.getString("ulke"), targetCountryName: interaction.options.getString("hedef-ulke", true),
      goalType:interaction.options.getString("hedef-turu",true) as WarGoalType,targetSettlementName:interaction.options.getString("hedef-yerleske")
    });
    const modal = new ModalBuilder().setCustomId(customId).setTitle("Resmî Savaş İlanı");
    modal.addComponents(
      modalText("reason", "Savaş gerekçesi", TextInputStyle.Paragraph, { placeholder: "Savaşın diplomatik veya siyasi gerekçesi", maxLength: 1000 }),
      modalText("declaration", "Herkese açık resmî ilan metni", TextInputStyle.Paragraph, { placeholder: "Savaşlar kanalında yayımlanacak duyuru", maxLength: 2000 })
    );
    await interaction.showModal(modal);
    return true;
  }

  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const proposer=await resolveCountry(interaction,interaction.options.getString("ulke"));
  const wizard:PendingPeaceWizard={
    token:interaction.id,guildId:interaction.guildId,userId:interaction.user.id,proposerCountryId:proposer.id,warId:null,
    landRecipientCountryId:proposer.id,settlementIds:[],payer:"NONE",indemnityAmount:0,
    terms:"Taraflar arasında barış sağlanacak ve kabul edilen bağlayıcı maddeler uygulanacaktır."
  };
  rememberPeaceWizard(wizard);
  const payload=peaceWarSelectionPayload(wizard,await warDeclarationService.activeWars(interaction.guildId));
  await interaction.editReply(payload);
  return true;
}

export async function handleWarDeclarationModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if(interaction.customId.startsWith("peace_wizard_modal|")){
    const token=interaction.customId.split("|")[1];
    if(!interaction.guildId||!token)throw new GameError("Barış formunun bilgileri geçersiz.");
    const wizard=peaceWizard(token,interaction.guildId,interaction.user.id);
    if(!wizard.warId)throw new GameError("Önce müzakere edilecek savaşı seçin.");
    const amount=parsePeaceIndemnity(interaction.fields.getTextInputValue("indemnity"));
    if(amount>0&&wizard.payer==="NONE")throw new GameError("Altın tutarı girdiniz; formdaki seçim kutusundan ödeyecek tarafı da seçin.");
    wizard.terms=interaction.fields.getTextInputValue("terms").trim();
    wizard.indemnityAmount=amount;
    const detail=await warDeclarationService.activeWarDetail(interaction.guildId,wizard.warId);
    if(!detail)throw new GameError("Seçilen savaş artık aktif değil.");
    await interaction.deferUpdate();
    await interaction.editReply(peaceWizardPayload(wizard,detail));
    return true;
  }
  let [kind, firstId, secondId] = interaction.customId.split("|");
  let goalType:WarGoalType="LEGACY";
  let targetSettlementName:string|null=null;
  let peaceSettlementName:string|null=null;
  let peaceSettlementRecipient:"BEN"|"HEDEF"|null=null;
  if (kind !== "war_context" && kind !== "war_declare" && kind !== "war_pact" && kind !== "war_pact_country" && kind !== "peace_offer") return false;
  if (!interaction.guildId || !firstId) throw new GameError("Savaş veya barış formunun bilgileri geçersiz.");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = await warChannel(interaction);

  if (kind === "war_context") {
    const context = pendingWarDialogs.get(firstId);
    pendingWarDialogs.delete(firstId);
    if (!context || context.guildId !== interaction.guildId || context.userId !== interaction.user.id) {
      throw new GameError("Bu savaş formunun süresi dolmuş. Komutu yeniden açın.");
    }
    if(context.kind==="war_declare"||context.kind==="war_pact"){
      goalType=context.goalType;targetSettlementName=context.targetSettlementName;
    }else{
      peaceSettlementName=context.settlementName;peaceSettlementRecipient=context.settlementRecipient;
    }
    const own = context.requestedCountryName && isGameMaster(interaction)
      ? await gameService.countryByName(interaction.guildId, context.requestedCountryName)
      : await gameService.countryForUser(interaction.guildId, interaction.user.id);
    if (!own) throw new GameError("Discord hesabına atanmış veya belirtilen ülke bulunamadı.");

    if (context.kind === "war_pact") {
      const attackerPact = await diplomacyService.pactByName(interaction.guildId, context.attackerPactName);
      const defenderPact = context.targetPactName ? await diplomacyService.pactByName(interaction.guildId, context.targetPactName) : null;
      const defenderCountry = context.targetCountryName ? await gameService.countryByName(interaction.guildId, context.targetCountryName) : null;
      if (!attackerPact || (context.targetPactName && !defenderPact) || (context.targetCountryName && !defenderCountry)) throw new GameError("Saldıran pakt veya hedef taraf bulunamadı.");
      if (attackerPact.id === defenderPact?.id) throw new GameError("Bir pakt kendisine savaş ilan edemez.");
      if (attackerPact.founder_country_id === defenderCountry?.id) throw new GameError("Pakt lideri kendi devletine savaş ilan edemez.");
      if (attackerPact.founder_country_id !== own.id) throw new GameError("Pakt adına savaşı yalnızca paktın mevcut lider devleti ilan edebilir.");
      kind = defenderPact ? "war_pact" : "war_pact_country";
      firstId = attackerPact.id;
      secondId = defenderPact?.id ?? defenderCountry!.id;
    } else {
      const target = await gameService.countryByName(interaction.guildId, context.targetCountryName);
      if (!target) throw new GameError("Belirtilen hedef devlet bulunamadı.");
      if (own.id === target.id) throw new GameError("Bir devlet kendisini hedef seçemez.");
      const activeWar = await warDeclarationService.activeWarBetween(interaction.guildId, own.id, target.id);
      if (context.kind === "war_declare") {
        if (activeWar) throw new GameError("Bu devletler arasında zaten devam eden bir savaş bulunuyor.");
        kind = "war_declare";
        firstId = own.id;
        secondId = target.id;
      } else {
        if (!activeWar) throw new GameError("Bu devlete barış teklif etmek için aranızda aktif bir savaş bulunmalıdır.");
        if (![activeWar.attacker_country_id, activeWar.defender_country_id].includes(own.id)) throw new GameError("Barış teklifini yalnızca iki cephenin savaş liderleri gönderebilir.");
        const opposingLeaderId = activeWar.attacker_country_id === own.id ? activeWar.defender_country_id : activeWar.attacker_country_id;
        if (target.id !== opposingLeaderId) throw new GameError("Barış teklifi karşı cephenin savaş liderine gönderilmelidir.");
        kind = "peace_offer";
        firstId = activeWar.id;
        secondId = own.id;
      }
    }
  }

  if (!secondId) throw new GameError("Savaş veya barış formunun hedef bilgisi geçersiz.");

  if (kind === "war_declare" || kind === "war_pact" || kind === "war_pact_country") {
    let attackerCountryId = firstId;
    let defenderCountryId = secondId;
    let attackerPactId: string | null = null;
    let defenderPactId: string | null = null;
    if (kind === "war_pact" || kind === "war_pact_country") {
      const attackerPact = await diplomacyService.pactDetailsById(interaction.guildId, firstId);
      attackerCountryId = attackerPact.founder_country_id;
      attackerPactId = attackerPact.id;
      if (kind === "war_pact") {
        const defenderPact = await diplomacyService.pactDetailsById(interaction.guildId, secondId);
        defenderCountryId = defenderPact.founder_country_id;
        defenderPactId = defenderPact.id;
      }
    }
    await assertCountryAccess(interaction, attackerCountryId);
    let goalTargetSettlementId:string|null=null;
    if(targetSettlementName){
      const targetSettlements=await gameService.listSettlements(defenderCountryId);
      const targetSettlement=targetSettlements.find((item)=>item.name.toLocaleLowerCase("tr-TR")===targetSettlementName!.trim().toLocaleLowerCase("tr-TR"));
      if(!targetSettlement)throw new GameError("Yapısal savaş hedefindeki yerleşke hedef cephe liderine ait değil veya bulunamadı.");
      goalTargetSettlementId=targetSettlement.id;
    }
    const war = await warDeclarationService.declareWar({
      guildId: interaction.guildId, actorId: interaction.user.id, attackerCountryId, defenderCountryId,
      attackerPactId, defenderPactId, goalType,goalTargetCountryId:defenderCountryId,goalTargetSettlementId,
      reason: interaction.fields.getTextInputValue("reason"), declaration: interaction.fields.getTextInputValue("declaration")
    });
    try {
      const defenderParticipants = await warDeclarationService.participants(war.id);
      const playerGroups = await Promise.all(defenderParticipants.filter((item) => item.side === "DEFENDER").map((item) => gameService.playerIds(item.country_id)));
      const players = [...new Set(playerGroups.flat())];
      const message = await channel.send({
        content: players.length ? players.map((id) => `<@${id}>`).join(" ") : `⚔️ **${war.defender_country_name}** cephesine resmî savaş ilanı.`,
        embeds: [renderWarDeclaration(war)],
        files: [new AttachmentBuilder(WAR_DECLARATION_BANNER_PATH, { name: WAR_DECLARATION_BANNER_NAME })],
        allowedMentions: { users: players }
      });
      await warDeclarationService.attachWarMessage(war.id, channel.id, message.id);
    } catch (error) {
      await warDeclarationService.cancelWarDeclaration(interaction.guildId, war.id).catch(() => undefined);
      throw error;
    }
    await interaction.editReply(`✅ **${war.defender_country_name}** liderliğindeki cepheye savaş ilan edildi; duyuru ${channel} kanalında yayımlandı.`);
    return true;
  }

  const war = await warDeclarationService.getWar(firstId);
  if (!war || war.guild_id !== interaction.guildId || war.status !== "ACTIVE") throw new GameError("Barış teklifine konu olan aktif savaş bulunamadı.");
  await assertCountryAccess(interaction, secondId);
  if (![war.attacker_country_id, war.defender_country_id].includes(secondId)) throw new GameError("Yalnızca savaşın tarafları barış teklif edebilir.");
  const receiverCountryId = war.attacker_country_id === secondId ? war.defender_country_id : war.attacker_country_id;
  const amount = parsePeaceIndemnity(interaction.fields.getTextInputValue("indemnity"));
  const payerRaw = normalizePayer(interaction.fields.getTextInputValue("payer"));
  let payerCountryId: string | null = null;
  if (amount > 0) {
    if (payerRaw === "BEN") payerCountryId = secondId;
    else if (payerRaw === "HEDEF") payerCountryId = receiverCountryId;
    else throw new GameError("Tazminat belirtilmişse ödeme tarafına BEN veya HEDEF yazılmalıdır.");
  } else if (payerRaw) {
    throw new GameError("Tazminat belirtilmediyse ödeme tarafı boş bırakılmalıdır.");
  }
  let settlementId:string|null=null;
  let settlementRecipientCountryId:string|null=null;
  if(peaceSettlementName){
    const occupation=await warDeclarationService.activeOccupationByName(war.id,peaceSettlementName);
    if(!occupation)throw new GameError("Barış maddesine eklenen yerleşke bu savaşta aktif işgal altında değil.");
    if(!peaceSettlementRecipient)throw new GameError("Devredilecek yerleşkeyi alacak tarafı BEN veya HEDEF olarak seçmelisiniz.");
    settlementId=occupation.settlement_id;
    settlementRecipientCountryId=peaceSettlementRecipient==="BEN"?secondId:receiverCountryId;
  }else if(peaceSettlementRecipient){
    throw new GameError("Toprağı alacak taraf seçildiyse devredilecek yerleşke de yazılmalıdır.");
  }
  const offer = await warDeclarationService.createPeaceOffer({
    guildId: interaction.guildId, actorId: interaction.user.id, warId: war.id,
    proposerCountryId: secondId, receiverCountryId, terms: interaction.fields.getTextInputValue("terms"),
    indemnityAmount: amount, payerCountryId,settlementId,settlementRecipientCountryId
  });
  try {
    const players = await gameService.playerIds(offer.receiver_country_id);
    const message = await channel.send({
      content: players.length ? players.map((id) => `<@${id}>`).join(" ") : `**${offer.receiver_country_name}** • Oyun yöneticisi yanıtlayabilir.`,
      embeds: [renderPeaceOffer(offer)], components: [peaceButtons(offer.id)], allowedMentions: { users: players }
    });
    await warDeclarationService.attachPeaceMessage(offer.id, channel.id, message.id);
  } catch (error) {
    await warDeclarationService.cancelPeaceOffer(interaction.guildId, offer.id).catch(() => undefined);
    throw error;
  }
  await interaction.editReply(`✅ **${offer.receiver_country_name}** devletine barış teklifi gönderildi; teklif ${channel} kanalında yayımlandı.`);
  return true;
}

async function sendPeaceWizardOffer(interaction:ButtonInteraction,wizard:PendingPeaceWizard,detail:OfficialWarDetailView):Promise<PeaceOfferView>{
  const {war}=detail;
  await assertCountryAccess(interaction,wizard.proposerCountryId);
  if(![war.attacker_country_id,war.defender_country_id].includes(wizard.proposerCountryId))throw new GameError("Barış teklifini yalnızca savaş cephelerinden birinin lider devleti gönderebilir.");
  const receiverCountryId=war.attacker_country_id===wizard.proposerCountryId?war.defender_country_id:war.attacker_country_id;
  if(!wizard.terms.trim())throw new GameError("Barış teklifinde bir anlaşma metni bulunmalıdır.");
  if(wizard.payer!=="NONE"&&wizard.indemnityAmount<=0)throw new GameError("Altın ödeyecek taraf seçildi; ödeme tutarını **Metin ve Altını Düzenle** düğmesinden girin.");
  const payerCountryId=wizard.payer==="PROPOSER"?wizard.proposerCountryId:wizard.payer==="RECEIVER"?receiverCountryId:null;
  const participantById=new Map(detail.participants.map((participant)=>[participant.country_id,participant]));
  const recipient=participantById.get(wizard.landRecipientCountryId??wizard.proposerCountryId);
  if(!recipient)throw new GameError("Toprakları alacak devlet bu savaşın aktif katılımcısı değil.");
  const settlementTransfers=detail.occupations
    .filter((occupation)=>occupation.status==="ACTIVE"
      &&participantById.get(occupation.occupier_country_id)?.side===recipient.side
      &&wizard.settlementIds.includes(occupation.settlement_id))
    .map((occupation)=>({settlementId:occupation.settlement_id,recipientCountryId:recipient.country_id}));
  if(settlementTransfers.length!==wizard.settlementIds.length)throw new GameError("Seçilen toprak maddelerinden birinin işgal durumu değişti. Seçimleri yenileyin.");
  const offer=await warDeclarationService.createPeaceOffer({
    guildId:interaction.guildId!,actorId:interaction.user.id,warId:war.id,
    proposerCountryId:wizard.proposerCountryId,receiverCountryId,terms:wizard.terms,
    indemnityAmount:wizard.indemnityAmount,payerCountryId,
    settlementTransfers
  });
  try{
    const channel=await warChannel(interaction);
    const players=await gameService.playerIds(offer.receiver_country_id);
    const notification=playerMentionPayload(players,`🕊️ **${offer.receiver_country_name}** • Oyun yöneticisi barış teklifini yanıtlayabilir.`);
    const message=await channel.send({
      content:notification.content,embeds:[renderPeaceOffer(offer)],components:[peaceButtons(offer.id)],allowedMentions:notification.allowedMentions
    });
    await warDeclarationService.attachPeaceMessage(offer.id,channel.id,message.id);
  }catch(error){
    await warDeclarationService.cancelPeaceOffer(interaction.guildId!,offer.id).catch(()=>undefined);
    throw error;
  }
  return offer;
}

export async function handleWarDeclarationButton(interaction: ButtonInteraction): Promise<boolean> {
  const [action, offerId] = interaction.customId.split("|");
  if(action?.startsWith("peace_wizard_")){
    if(!offerId||!interaction.guildId)throw new GameError("Barış formunun bilgileri geçersiz.");
    const wizard=peaceWizard(offerId,interaction.guildId,interaction.user.id);
    if(action==="peace_wizard_cancel"){
      pendingPeaceWizards.delete(wizard.token);
      await interaction.update({embeds:[new EmbedBuilder().setColor(0x777777).setTitle("Barış Teklifi İptal Edildi").setDescription("Taslak silindi; karşı tarafa herhangi bir teklif gönderilmedi.")],components:[]});
      return true;
    }
    if(action==="peace_wizard_back"){
      await interaction.deferUpdate();
      wizard.warId=null;wizard.landRecipientCountryId=wizard.proposerCountryId;wizard.settlementIds=[];
      wizard.payer="NONE";wizard.indemnityAmount=0;
      const wars=await warDeclarationService.activeWars(interaction.guildId);
      await interaction.editReply(peaceWarSelectionPayload(wizard,wars));
      return true;
    }
    if(!wizard.warId)throw new GameError("Önce müzakere edilecek savaşı seçin.");
    if(action==="peace_wizard_clear_lands"){
      await interaction.deferUpdate();
      wizard.settlementIds=[];
      const detail=await warDeclarationService.activeWarDetail(interaction.guildId,wizard.warId);
      if(!detail)throw new GameError("Seçilen savaş artık aktif değil.");
      await interaction.editReply(peaceWizardPayload(wizard,detail));
      return true;
    }
    if(action==="peace_wizard_edit"){
      const modal=new ModalBuilder().setCustomId(`peace_wizard_modal|${wizard.token}`).setTitle("Barış Maddelerini Düzenle");
      modal.addComponents(
        modalText("terms","Anlaşma metni",TextInputStyle.Paragraph,{maxLength:2000,value:wizard.terms,placeholder:"Barışın siyasi ve diplomatik şartları"}),
        modalText("indemnity","Altın tutarı",TextInputStyle.Short,{
          required:false,maxLength:20,placeholder:"Altın maddesi yoksa boş bırak",
          ...(wizard.indemnityAmount?{value:String(wizard.indemnityAmount)}:{})
        })
      );
      await interaction.showModal(modal);
      return true;
    }
    if(action!=="peace_wizard_send")return false;
    await interaction.deferUpdate();
    const detail=await warDeclarationService.activeWarDetail(interaction.guildId,wizard.warId);
    if(!detail)throw new GameError("Seçilen savaş artık aktif değil.");
    const offer=await sendPeaceWizardOffer(interaction,wizard,detail);
    pendingPeaceWizards.delete(wizard.token);
    await interaction.editReply({
      embeds:[new EmbedBuilder().setColor(0x3c8b5c).setTitle("✅ Barış Teklifi Gönderildi")
        .setDescription(`Teklif **${offer.receiver_country_name}** devletine iletildi ve savaş kanalında yayımlandı.`)
        .addFields(
          {name:"🗺️ Toprak",value:fieldValue(offer.structured_terms.filter((term)=>term.term_type==="TRANSFER_SETTLEMENT").map((term)=>term.settlement_name).filter(Boolean).join(", ")||"Talep yok"),inline:true},
          {name:"💰 Altın",value:fieldValue(offer.indemnity_amount>0?gold(offer.indemnity_amount):"Talep yok"),inline:true}
        )],components:[]
    });
    return true;
  }
  if (action === "war_invite_accept" || action === "war_invite_reject") {
    if (!offerId || !interaction.guildId) throw new GameError("Savaş çağrısının bilgileri geçersiz.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const invitation = await warDeclarationService.getWarInvitation(offerId);
    if (!invitation || invitation.guild_id !== interaction.guildId) throw new GameError("Savaş çağrısı bulunamadı.");
    if (!isGameMaster(interaction)) {
      const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
      if (!country || country.id !== invitation.country_id) throw new GameError("Bu savaş çağrısını yalnızca davet edilen devletin oyuncuları yanıtlayabilir.");
    }
    const accepted = action === "war_invite_accept";
    const result = await warDeclarationService.respondWarInvitation({
      guildId: interaction.guildId, actorId: interaction.user.id, invitationId: offerId,
      countryId: invitation.country_id, accept: accepted
    });
    const resolved = EmbedBuilder.from(interaction.message.embeds[0]!)
      .setColor(accepted ? 0x3c8b5c : 0x9f252c)
      .setTitle(accepted ? "✅ SAVAŞ ÇAĞRISI KABUL EDİLDİ" : "❌ SAVAŞ ÇAĞRISI REDDEDİLDİ")
      .setFooter({ text: `${interaction.user.username} tarafından sonuçlandırıldı.` });
    await interaction.message.edit({
      content: accepted
        ? `⚔️ **${result.invitation.country_name}**, **${result.invitation.invited_by_country_name}** liderliğindeki cepheye katıldı.`
        : `❌ **${result.invitation.country_name}** savaş çağrısını reddetti.`,
      embeds: [resolved], components: []
    });
    if(accepted){
      const participants=await warDeclarationService.participants(result.war.id);
      const playerGroups=await Promise.all(participants.map((participant)=>gameService.playerIds(participant.country_id)));
      const notification=playerMentionPayload(playerGroups.flat(),"⚔️ Savaş cephelerinde oyuncu ataması bulunmuyor.");
      const channel=await warChannel(interaction);
      await channel.send({
        content:notification.content,
        embeds:[renderWarStructureUpdate(result.war)],
        allowedMentions:notification.allowedMentions
      });
    }
    await interaction.editReply("✅ Savaş çağrısı sonuçlandırıldı.");
    return true;
  }
  if (action !== "peace_accept" && action !== "peace_reject") return false;
  if (!offerId || !interaction.guildId) throw new GameError("Barış teklifinin bilgileri geçersiz.");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const offer = await warDeclarationService.getPeaceOffer(offerId);
  if (!offer || offer.guild_id !== interaction.guildId) throw new GameError("Barış teklifi bulunamadı.");
  if (!isGameMaster(interaction)) {
    const country = await gameService.countryForUser(interaction.guildId, interaction.user.id);
    if (!country || country.id !== offer.receiver_country_id) throw new GameError("Bu barış teklifini yalnızca hedef devletin oyuncuları yanıtlayabilir.");
  }
  const accepted = action === "peace_accept";
  const result = await warDeclarationService.respondPeace({
    guildId: interaction.guildId, actorId: interaction.user.id, offerId, receiverCountryId: offer.receiver_country_id, accept: accepted
  });
  if(accepted&&interaction.guild){
    for(const country of result.annexedCountries){
      await deleteCountryRole(interaction.guild,country.discordRoleId,`Barış antlaşmasıyla tam ilhak • İşlemi yapan: ${interaction.user.id}`).catch(()=>false);
    }
  }
  const resolved = EmbedBuilder.from(interaction.message.embeds[0]!)
    .setColor(accepted ? 0x3c8b5c : 0x9f252c)
    .setTitle(accepted ? "✅ BARIŞ TEKLİFİ KABUL EDİLDİ" : "❌ BARIŞ TEKLİFİ REDDEDİLDİ")
    .setFooter({ text: `${interaction.user.username} tarafından sonuçlandırıldı.` });
  await interaction.message.edit({
    content: accepted
      ? `🕊️ **${result.offer.receiver_country_name}**, barış teklifini kabul etti.${result.annexedCountries.length?`\n🏴 **${result.annexedCountries.map((country)=>country.countryName).join(", ")}** tamamen ilhak edildi.`:""}`
      : `❌ **${result.offer.receiver_country_name}**, barış teklifini reddetti; savaş devam ediyor.`,
    embeds: [resolved], components: []
  });
  await interaction.editReply("✅ Barış teklifi sonuçlandırıldı.");
  if (accepted) {
    const channel = await warChannel(interaction);
    await channel.send({
      embeds: [renderPeaceAnnouncement({
        firstCountry: result.war.attacker_country_name, secondCountry: result.war.defender_country_name,
        firstSide: result.war.attacker_participant_names, secondSide: result.war.defender_participant_names,
        turn: result.war.ended_turn, terms: result.offer.terms, indemnityAmount: result.offer.indemnity_amount,
        payerCountry: result.offer.payer_country_name, recipientCountry: result.offer.recipient_country_name,
        structuredTerms:result.offer.structured_terms
      })],
      files: [new AttachmentBuilder(PEACE_TREATY_BANNER_PATH, { name: PEACE_TREATY_BANNER_NAME })]
    });
  }
  return true;
}

export async function handleWarDeclarationSelect(interaction:StringSelectMenuInteraction):Promise<boolean>{
  const [action,contextValue]=interaction.customId.split("|");
  if(!["active_war_detail","peace_war_select","peace_land_select","peace_land_recipient_select","peace_payer_select"].includes(action??""))return false;
  if(!interaction.guildId)throw new GameError("Bu işlem yalnızca bir Discord sunucusunda kullanılabilir.");
  if(action==="active_war_detail"){
    const pageIndex=Math.max(0,Number.parseInt(contextValue??"0",10)||0);
    const warId=interaction.values[0];
    if(!warId)throw new GameError("Seçilen savaş bilgisi bulunamadı.");
    await interaction.deferUpdate();
    const [detail,wars]=await Promise.all([
      warDeclarationService.activeWarDetail(interaction.guildId,warId),
      warDeclarationService.activeWars(interaction.guildId)
    ]);
    if(!detail)throw new GameError("Bu savaş artık aktif değil. `/aktif-savaslar` komutunu yeniden kullanın.");
    const selection=activeWarSelectRow(wars,pageIndex,warId)
      ??activeWarSelectRow(wars,Math.max(0,activeWarChunks(wars).findIndex((page)=>page.some((war)=>war.id===warId))),warId);
    const flag:CountryFlagResolver=(countryName,fallback)=>countryFlagEmoji(interaction.guild,countryName,fallback);
    await interaction.editReply({embeds:renderActiveWarDetail(detail,flag),components:selection?[selection]:[]});
    return true;
  }
  if(!contextValue)throw new GameError("Barış formunun bilgileri eksik.");
  const wizard=peaceWizard(contextValue,interaction.guildId,interaction.user.id);
  await interaction.deferUpdate();
  if(action==="peace_war_select"){
    const warId=interaction.values[0];
    if(!warId)throw new GameError("Müzakere edilecek savaş seçilmedi.");
    const detail=await warDeclarationService.activeWarDetail(interaction.guildId,warId);
    if(!detail)throw new GameError("Seçilen savaş artık aktif değil.");
    if(![detail.war.attacker_country_id,detail.war.defender_country_id].includes(wizard.proposerCountryId)){
      throw new GameError("Barış teklifini yalnızca savaş cephelerinden birinin lider devleti gönderebilir.");
    }
    wizard.warId=warId;wizard.landRecipientCountryId=wizard.proposerCountryId;wizard.settlementIds=[];
    wizard.payer="NONE";wizard.indemnityAmount=0;
    await interaction.editReply(peaceWizardPayload(wizard,detail));
    return true;
  }
  if(!wizard.warId)throw new GameError("Önce müzakere edilecek savaşı seçin.");
  const detail=await warDeclarationService.activeWarDetail(interaction.guildId,wizard.warId);
  if(!detail)throw new GameError("Seçilen savaş artık aktif değil.");
  if(action==="peace_land_select"){
    const settlementIds=interaction.values;
    const participantById=new Map(detail.participants.map((participant)=>[participant.country_id,participant]));
    const recipientSide=participantById.get(wizard.landRecipientCountryId??wizard.proposerCountryId)?.side;
    const validIds=new Set(detail.occupations.filter((item)=>item.status==="ACTIVE"&&participantById.get(item.occupier_country_id)?.side===recipientSide).map((item)=>item.settlement_id));
    if(settlementIds.some((settlementId)=>!validIds.has(settlementId)))throw new GameError("Seçilen yerleşkelerden biri artık bu savaşta aktif işgal altında değil.");
    wizard.settlementIds=[...new Set(settlementIds)];
  }else if(action==="peace_land_recipient_select"){
    const recipientId=interaction.values[0];
    if(!recipientId||!detail.participants.some((participant)=>participant.country_id===recipientId))throw new GameError("Toprakları alacak devlet bu savaşın aktif katılımcısı değil.");
    wizard.landRecipientCountryId=recipientId;
    wizard.settlementIds=[];
  }else{
    const payer=interaction.values[0] as PendingPeaceWizard["payer"]|undefined;
    if(!payer||!["NONE","PROPOSER","RECEIVER"].includes(payer))throw new GameError("Altın ödemesinin yönü geçersiz.");
    wizard.payer=payer;
    if(payer==="NONE")wizard.indemnityAmount=0;
  }
  await interaction.editReply(peaceWizardPayload(wizard,detail));
  return true;
}
