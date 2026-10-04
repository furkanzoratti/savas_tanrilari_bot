import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, LabelBuilder, MessageFlags, ModalBuilder,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
  type ButtonInteraction, type ChatInputCommandInteraction, type Client, type ModalSubmitInteraction, type StringSelectMenuInteraction
} from "discord.js";
import {
  ACTIVE_GREAT_GAME_TYPES, AUCTION_BID_INCREMENT, AUCTION_OPENING_BID, CARAVAN_ROUTES, CARAVAN_TRACK_TARGET, CHARIOT_TACTICS, CHARIOT_TRACK_TARGET,
  GLADIATOR_COUPON_MAX_ODDS,GLADIATOR_COUPON_MAX_SELECTIONS,GLADIATOR_COUPON_MIN_SELECTIONS,
  GREAT_GAMES_RACE_ROUNDS, GREAT_GAME_TYPES, auctionNextMinimum, diplomacyGoalKey, nextIstanbulAuctionDeadline,
  gladiatorCouponOdds,parseCaravanRoute, parseChariotTactic, parseKingsDecision,
  type CaravanRoute, type ChariotTactic, type GreatGameType, type KingsDecision
} from "../domain/great-games.js";
import { gold } from "../domain/format.js";
import { greatGamesService, type GreatGamesDashboard, type GreatGamesEntryRow } from "../services/great-games-service.js";
import { greatGamesFlowService } from "../services/great-games-flow-service.js";
import { greatGamesAuctionService } from "../services/great-games-auction-service.js";
import { greatGamesBetService } from "../services/great-games-bet-service.js";
import { greatGamesWalletService } from "../services/great-games-wallet-service.js";
import { greatGamesGladiatorService, type GladiatorMatchRow, type GladiatorTournamentView } from "../services/great-games-gladiator-service.js";
import { greatGamesGladiatorAuctionService } from "../services/great-games-gladiator-auction-service.js";
import { GameError, gameService } from "../services/game-service.js";
import { logger } from "../logger.js";
import { isGameMaster } from "./auth.js";

interface AdminPanelPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

const CARAVAN_ROLE_LABELS: Record<string, string> = {
  MERCHANT: "Tüccar",
  GUARD: "Muhafız",
  GUIDE: "Rehber",
  FINANCIER: "Finansör"
};

const RACE_TRACK_DISPLAY_STEPS = 30;

function gameId(value: string): GreatGameType {

  if (!(value in GREAT_GAME_TYPES)) throw new GameError("Büyük Oyun türü geçersiz.");
  return value as GreatGameType;
}

async function ownCountry(guildId: string | null, userId: string) {
  if (!guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const country = await gameService.countryForUser(guildId, userId);
  if (!country) throw new GameError("Discord hesabına atanmış etkin bir devlet bulunamadı.");
  return country;
}

function gameRules(type: GreatGameType): string {
  if (type === "AUCTION") return `Tek turlu açık artırmadır. Teklif sırasında cüzdandan para düşmez; yalnız kazanılan kalemlerin bedeli oyun sonunda kesilir. Aynı anda lider olunan tekliflerin toplamı cüzdan bakiyesini aşamaz. Açılış ${gold(AUCTION_OPENING_BID)} ve her yeni teklif tam ${gold(AUCTION_BID_INCREMENT)} artar.`;
  if (type === "CHARIOT") return `Katılım 1.000 Altın. Form yayınlandıktan sonra bahisler açılır. Yarış ${GREAT_GAMES_RACE_ROUNDS} etap sürer; her etapta gizli taktik verilir ve 50 kademeli pistteki atlar sonuçlarla birlikte ilerler. Katılım havuzu %65/%35 paylaşılır.`;
  if (type === "CARAVAN") return `Seçilen devletler 2–3 kişilik kervanlara ayrılır. ${GREAT_GAMES_RACE_ROUNDS} aşamanın her birinde, her kervandan yalnız bir takım üyesi ortak rotayı gizlice seçer. Her devletten oyun başlarken 1.000 Altın alınır; kervanların 50 kademeli pistteki sırası canlı değişir.`;
  if (type === "KINGS_BET") return "Katılım 1.000 Altın. Üç ikilemde İşbirliği veya İhanet ve rakibin kararı için tahmin gizlice seçilir. Rakipler her turun ardından yeniden karıştırılır; mümkün olduğu sürece aynı rakiple üst üste eşleşilmez.";
  if (type === "GLADIATOR") return "Capua sezonu dört adet 32 kişilik eleme ve 12 kişilik finalden oluşur. 64 gladyatörün her biri elemelere tam iki kez katılır; her turnuvada 1. sıra 32, son sıra 1 puan kazanır. Dört elemenin puan sıralamasındaki ilk 12 finale çıkar, ilk 4 doğrudan çeyrek finale geçer. Dövüşte taraflar sırayla saldırır: 1d20 + Güç/10 saldırı, 1d20 + Güç/12 savunma zarıdır. Saldırı savunmayı geçerse 1d10 + Güç/25 hasar verilir. Tekli bahsin yanında aynı turdan 2–5 eşleşmeli, en fazla 12.00x oranlı birleşik kupon hazırlanabilir.";
  return "Her masa üç devletten oluşur. Anlaşma yalnız bir ana ve en fazla bir ikincil kazanan çıkarabilir. Katılım 500 Altındır.";
}

function chosenEntries(data: GreatGamesDashboard, type: GreatGameType): GreatGamesEntryRow[] {
  return data.entries.filter((entry) => entry.game_type === type && ["SELECTED", "ACTIVE", "FINISHED"].includes(entry.status));
}

function auctionLifecycle(data: GreatGamesDashboard): "IDLE" | "PREPARED" | "PUBLISHED" | "ACTIVE" | "FINISHED" | "CANCELLED" {
  const explicit = data.season?.auction_status;
  if (explicit) return explicit;
  if (data.season?.current_game !== "AUCTION") return "IDLE";
  if (data.season.status === "ACTIVE") return "ACTIVE";
  if (data.season.status === "PUBLISHED") return "PUBLISHED";
  if (data.season.status === "CANCELLED") return "CANCELLED";
  return "PREPARED";
}

function statusLabel(data: GreatGamesDashboard, type: GreatGameType, entries: GreatGamesEntryRow[]): string {
  if (type === "AUCTION") {
    const status = auctionLifecycle(data);
    if (status === "PREPARED") return "Katılımcılar seçildi • Yayın bekliyor";
    if (status === "PUBLISHED") return "Yayınlandı • Başlatılmayı bekliyor";
    if (status === "ACTIVE") return "Açık artırma sürüyor";
    if (status === "FINISHED") return "Tamamlandı";
    if (status === "CANCELLED") return "İptal edildi";
    return "Hazırlanmayı bekliyor";
  }
  if (data.season?.current_game === type) {
    if (data.season.status === "PUBLISHED") return "Yayınlandı • Bahis/ön hazırlık açık";
    if (data.season.status === "ACTIVE") return `Devam ediyor • Aşama ${data.season.current_round}`;
    if (data.season.status === "OPEN" && entries.some((entry) => entry.status === "SELECTED")) return "Katılımcılar seçildi • Yayın bekliyor";
  }
  if (entries.some((entry) => entry.status === "FINISHED")) return "Tamamlandı";
  return "Kayıtlar açık";
}

function clip(value: string, maximum = 1_020): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function kingsDecisionLabel(value: KingsDecision): string {
  return value === "COOPERATE" ? "İşbirliği" : "İhanet";
}

function raceTrack(score: number, target: number, marker: string): string {
  const position = Math.max(0, Math.min(RACE_TRACK_DISPLAY_STEPS, Math.floor((score / target) * RACE_TRACK_DISPLAY_STEPS)));
  return `Başlangıç ${"━".repeat(position)}${marker}${"·".repeat(RACE_TRACK_DISPLAY_STEPS - position)} 🏁`;
}

function chariotFields(entries: GreatGamesEntryRow[]) {
  const ranked = [...entries].sort((left, right) => Number(right.score) - Number(left.score) || left.country_name.localeCompare(right.country_name, "tr"));
  const blocks = ranked.map((entry, index) =>
    `**${index + 1}. ${entry.country_name} — ${Number(entry.score)} puan**\n${raceTrack(Number(entry.score), CHARIOT_TRACK_TARGET, "🐎")}`
  );
  const chunks: string[] = [];
  for (const block of blocks) {
    const current = chunks.at(-1);
    if (!current || current.length + block.length + 2 > 1_000) chunks.push(block);
    else chunks[chunks.length - 1] = `${current}\n\n${block}`;
  }
  return (chunks.length ? chunks : ["Henüz yarışçı bulunmuyor."]).slice(0, 19).map((value, index) => ({
    name: index === 0 ? "🏇 Yarış Pisti" : `🏇 Yarış Pisti • Devam ${index + 1}`,
    value,
    inline: false
  }));
}

function chariotResultFields(result: { round: number; summary: string[] }) {
  const chunks: string[] = [];
  for (const line of result.summary) {
    const current = chunks.at(-1);
    if (!current || current.length + line.length + 1 > 1_000) chunks.push(line);
    else chunks[chunks.length - 1] = `${current}\n${line}`;
  }
  return chunks.slice(0, 5).map((value, index) => ({
    name: index === 0 ? `🎲 Son Etap Sonuçları • Etap ${result.round}` : `🎲 Son Etap Sonuçları • Devam ${index + 1}`,
    value,
    inline: false
  }));
}

function caravanFields(entries: GreatGamesEntryRow[]) {
  const teams = new Map<string, GreatGamesEntryRow[]>();
  for (const entry of entries) {
    const name = String(entry.metadata.teamName ?? "Kervansız");
    teams.set(name, [...(teams.get(name) ?? []), entry]);
  }
  const ranked = [...teams.entries()].map(([name, members]) => ({
    name,
    members,
    score: Number(members[0]?.score ?? 0)
  })).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "tr"));
  const medals = ["🥇", "🥈", "🥉"];
  return ranked.slice(0, 24).map((team, index) => {
    const track = raceTrack(team.score, CARAVAN_TRACK_TARGET, "🐫");
    const members = team.members.map((member) => `${member.country_name} (${CARAVAN_ROLE_LABELS[String(member.metadata.role)] ?? "Görev bekliyor"})`).join(" • ");
    return {
      name: `${medals[index] ?? `${index + 1}.`} ${team.name} — ${team.score} puan`,
      value: clip(`${track}\n${members}`),
      inline: false
    };
  });
}

const AUCTION_REWARD_EMOJIS: Record<string, string> = {
  IMPERIAL_REVENUE: "💰",
  GREAT_MIGRATION: "👥",
  GRAND_TRADE_CHARTER: "🤝",
  MASTER_BUILDERS: "🏗️",
  ROYAL_TUTOR: "📚",
  RESOURCE_CONCESSION: "⛏️",
  ROYAL_FLEET_ORDER: "⚓",
  GRAND_SIEGE_TRAIN: "🏰"
};

function auctionTitleParts(title: string): { name: string; effect: string } {
  const [name, ...effectParts] = title.split(" • ");
  return { name: name?.trim() || title, effect: effectParts.join(" • ").trim() };
}

function auctionFields(lots: Awaited<ReturnType<typeof greatGamesAuctionService.lots>>) {
  return lots.slice(0, 24).map((lot) => {
    const currentBid = Number(lot.current_bid ?? lot.winning_bid ?? 0);
    const { name, effect } = auctionTitleParts(lot.title);
    const emoji = AUCTION_REWARD_EMOJIS[lot.reward_type] ?? "🏺";
    const effectLine = effect ? `*${effect}*\n` : "";
    if (lot.phase === "FINISHED") {
      return {
        name: `🏆 ${lot.lot_order}. ${name}`.slice(0, 256),
        value: lot.winning_country_name
          ? `${effectLine}👑 **${lot.winning_country_name}** • ${gold(Number(lot.winning_bid ?? 0))}`
          : `${effectLine}— Teklif verilmedi.`,
        inline: false
      };
    }
    return {
      name: `${emoji} ${lot.lot_order}. ${name}`.slice(0, 256),
      value: currentBid > 0
        ? `${effectLine}👑 **${lot.leading_country_name ?? "Bilinmiyor"}**\n💰 ${gold(currentBid)}  →  **${gold(auctionNextMinimum(currentBid))}**\n🔨 ${lot.bid_count} devlet teklif verdi`
        : `${effectLine}💰 **${gold(AUCTION_OPENING_BID)}** ile açılıyor • Henüz teklif yok`,
      inline: false
    };
  });
}

function auctionOverview(lots: Awaited<ReturnType<typeof greatGamesAuctionService.lots>>): string {
  const bidCount = lots.reduce((total, lot) => total + Number(lot.bid_count ?? 0), 0);
  const leaders = new Set(lots.map((lot) => lot.leading_country_name).filter(Boolean)).size;
  return `📦 **${lots.length} imtiyaz**  •  🔨 **${bidCount} teklif**  •  👑 **${leaders} lider devlet**`;
}

const GLADIATOR_ROUND_LABELS: Record<number, string> = {
  1: "Son 32",
  2: "Son 16",
  3: "Çeyrek Final",
  4: "Yarı Final",
  5: "Final"
};

const GLADIATOR_FINAL_ROUND_LABELS:Record<number,string>={
  1:"Final Ön Elemesi",2:"Final Çeyrek Finali",3:"Final Yarı Finali",4:"Büyük Final"
};

function gladiatorRoundLabel(tournament:GladiatorTournamentView["tournament"],round:number):string{
  return tournament?.tournament_type==="FINAL"
    ? GLADIATOR_FINAL_ROUND_LABELS[round]??`Final Turu ${round}`
    : GLADIATOR_ROUND_LABELS[round]??`Tur ${round}`;
}

const GLADIATOR_ROSTER_PAGE_SIZE=16;
const GLADIATOR_OWNERSHIP_PAGE_SIZE=10;
const GLADIATOR_BETS_PAGE_SIZE=10;
const GLADIATOR_COUPON_MATCHES_PER_PAGE=8;

interface GladiatorCouponDraft{
  tournamentId:string;
  round:number;
  countryId:string;
  amount:number|null;
  selections:Map<string,string>;
  updatedAt:number;
}

const gladiatorCouponDrafts=new Map<string,GladiatorCouponDraft>();

function gladiatorCouponDraftKey(guildId:string,userId:string){
  return `${guildId}:${userId}`;
}

function activeCouponMatches(view:GladiatorTournamentView){
  return view.matches.filter((match)=>
    match.round===view.tournament?.current_round&&match.status==="PENDING"&&
    match.fighter_a_id&&match.fighter_b_id&&match.odds_a&&match.odds_b
  );
}

function couponDraftFor(
  guildId:string,userId:string,countryId:string,view:GladiatorTournamentView
):GladiatorCouponDraft{
  const tournament=view.tournament;
  if(!tournament||tournament.status!=="BETTING")throw new GameError("Bu turda kupon bahis alımı kapalı.");
  const key=gladiatorCouponDraftKey(guildId,userId);
  const existing=gladiatorCouponDrafts.get(key);
  if(existing&&existing.tournamentId===tournament.id&&existing.round===tournament.current_round&&existing.countryId===countryId){
    existing.updatedAt=Date.now();
    return existing;
  }
  const draft:GladiatorCouponDraft={
    tournamentId:tournament.id,round:tournament.current_round,countryId,amount:null,selections:new Map(),updatedAt:Date.now()
  };
  gladiatorCouponDrafts.set(key,draft);
  return draft;
}

function selectedCouponFighters(view:GladiatorTournamentView,draft:GladiatorCouponDraft){
  const selected=activeCouponMatches(view).flatMap((match)=>{
    const fighterId=draft.selections.get(match.id);
    if(fighterId===match.fighter_a_id)return [{
      matchId:match.id,fighterId,matchNumber:match.bracket_position,
      fighterName:match.fighter_a_name!,fighterCode:"A",odds:Number(match.odds_a)
    }];
    if(fighterId===match.fighter_b_id)return [{
      matchId:match.id,fighterId,matchNumber:match.bracket_position,
      fighterName:match.fighter_b_name!,fighterCode:"B",odds:Number(match.odds_b)
    }];
    if(fighterId)draft.selections.delete(match.id);
    return [];
  });
  return selected.sort((left,right)=>left.matchNumber-right.matchNumber);
}

async function gladiatorCouponPayload(
  guildId:string,userId:string,countryId:string,requestedPage=0
){
  for(const [key,draft] of gladiatorCouponDrafts)
    if(Date.now()-draft.updatedAt>30*60*1_000)gladiatorCouponDrafts.delete(key);
  const view=await greatGamesGladiatorService.view(guildId);
  const draft=couponDraftFor(guildId,userId,countryId,view);
  const matches=activeCouponMatches(view);
  if(!matches.length)throw new GameError("Bu turda kupona eklenebilecek eşleşme bulunmuyor.");
  const pageCount=Math.max(1,Math.ceil(matches.length/GLADIATOR_COUPON_MATCHES_PER_PAGE));
  const page=safePage(requestedPage,pageCount);
  const pageMatches=matches.slice(page*GLADIATOR_COUPON_MATCHES_PER_PAGE,(page+1)*GLADIATOR_COUPON_MATCHES_PER_PAGE);
  const selected=selectedCouponFighters(view,draft);
  const combinedOdds=selected.length>=GLADIATOR_COUPON_MIN_SELECTIONS
    ? gladiatorCouponOdds(selected.map((selection)=>selection.odds))
    : null;
  const possiblePayout=draft.amount&&combinedOdds?Math.floor(draft.amount*combinedOdds):null;
  const selectedLines=selected.length?selected.map((selection)=>
    `✅ **#${selection.matchNumber} ${selection.fighterName}** — ${selection.odds.toFixed(2)}x`
  ).join("\n"):"Henüz seçim yapılmadı.";
  const embed=new EmbedBuilder()
    .setColor(0x6f4ab1)
    .setTitle("🎟️ Capua • Birleşik Bahis Kuponu")
    .setDescription(`Aynı turdan **${GLADIATOR_COUPON_MIN_SELECTIONS}–${GLADIATOR_COUPON_MAX_SELECTIONS} farklı eşleşme** seç. Kuponun kazanması için bütün seçimlerin doğru çıkması gerekir. Birleşik oran en fazla **${GLADIATOR_COUPON_MAX_ODDS.toFixed(2)}x** olabilir.\n\n**Eşleşme sayfası:** ${page+1}/${pageCount}`)
    .addFields(
      {name:`⚔️ Kupon Seçimleri • ${selected.length}/${GLADIATOR_COUPON_MAX_SELECTIONS}`,value:selectedLines,inline:false},
      {name:"💰 Kupon Özeti",value:`**Bahis:** ${draft.amount?gold(draft.amount):"Henüz girilmedi"}\n**Birleşik oran:** ${combinedOdds?`${combinedOdds.toFixed(2)}x`:"En az iki seçim gerekli"}\n**Öngörülen kazanç:** ${possiblePayout?gold(possiblePayout):"—"}`,inline:false}
    )
    .setFooter({text:"Seçimlerini sayfalar arasında değiştirebilirsin; para yalnız kuponu onayladığında kesilir."});
  const options=pageMatches.flatMap((match)=>[
    {
      label:`#${match.bracket_position} • ${match.fighter_a_name}`.slice(0,100),
      description:`A tarafı • ${Number(match.odds_a).toFixed(2)}x • Rakip: ${match.fighter_b_name}`.slice(0,100),
      value:`${match.id}:${match.fighter_a_id}`,
      default:draft.selections.get(match.id)===match.fighter_a_id
    },
    {
      label:`#${match.bracket_position} • ${match.fighter_b_name}`.slice(0,100),
      description:`B tarafı • ${Number(match.odds_b).toFixed(2)}x • Rakip: ${match.fighter_a_name}`.slice(0,100),
      value:`${match.id}:${match.fighter_b_id}`,
      default:draft.selections.get(match.id)===match.fighter_b_id
    }
  ]);
  const selector=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ggs2|gladiator-coupon|${page}`)
      .setPlaceholder("Bu sayfadaki kupon seçimlerini düzenle")
      .setMinValues(0).setMaxValues(Math.min(GLADIATOR_COUPON_MAX_SELECTIONS,options.length))
      .addOptions(options)
  );
  const buttons=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|gladiator-coupon-page|${page-1}`).setLabel("Önceki").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId(`gg2|gladiator-coupon-page|${page+1}`).setLabel("Sonraki").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page===pageCount-1),
    new ButtonBuilder().setCustomId("gg2|gladiator-coupon-amount|GLADIATOR").setLabel("Tutar Gir").setEmoji("💰").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gg2|gladiator-coupon-confirm|GLADIATOR").setLabel("Kuponu Onayla").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(selected.length<GLADIATOR_COUPON_MIN_SELECTIONS||!draft.amount),
    new ButtonBuilder().setCustomId("gg2|gladiator-coupon-cancel|GLADIATOR").setLabel("İptal").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
  );
  return {embeds:[embed],components:[selector,buttons]};
}

function safePage(requested:number,pageCount:number){
  return Math.min(Math.max(0,Number.isSafeInteger(requested)?requested:0),Math.max(0,pageCount-1));
}

function gladiatorRosterFields(view: GladiatorTournamentView,page:number) {
  const start=page*GLADIATOR_ROSTER_PAGE_SIZE;
  const lines = view.roster.slice(start,start+GLADIATOR_ROSTER_PAGE_SIZE).map((fighter, index) => {
    const market = fighter.owner_country_name
      ? `Sahip **${fighter.owner_country_name}**`
      : view.auctionStatus === "OPEN" && fighter.current_bid
        ? `Lider **${fighter.leading_country_name}** • ${gold(Number(fighter.current_bid))}`
        : view.auctionStatus === "OPEN"
          ? "Sahipsiz • Açılış 50 Altın"
          : "Sahipsiz";
    return `**${start+index+1}. ${fighter.name}** [${fighter.code}] — G**${fighter.power}** C**${fighter.max_hp}** • Eleme **${fighter.qualifier_appearances}/2** • **${fighter.qualifier_points} P** • ${market}`;
  });
  const chunks: string[] = [];
  for (const line of lines) {
    const current = chunks.at(-1);
    if (!current || current.length + line.length + 1 > 980) chunks.push(line);
    else chunks[chunks.length - 1] = `${current}\n${line}`;
  }
  return chunks.map((value, index) => ({
    name: index === 0 ? "📊 Dövüşçüler • Güç Sıralaması" : `📊 Güç Sıralaması • Devam ${index + 1}`,
    value,
    inline: false
  }));
}

function gladiatorMatchLine(match: GladiatorMatchRow): string {
  if (!match.fighter_a_name || !match.fighter_b_name) return `**#${match.bracket_position}** — Üst tur sonuçları bekleniyor`;
  const left = `${match.fighter_a_name} (G${match.fighter_a_power} • C${match.fighter_a_max_hp})`;
  const right = `${match.fighter_b_name} (G${match.fighter_b_power} • C${match.fighter_b_max_hp})`;
  if (match.status === "FINISHED") {
    return `**#${match.bracket_position}** ${left} — ${right}\n↳ 🏆 **${match.winner_name}** • Kalan can ${match.score_a}–${match.score_b}`;
  }
  return `**#${match.bracket_position}** ${left} **${Number(match.odds_a).toFixed(2)}x** — ${right} **${Number(match.odds_b).toFixed(2)}x**`;
}

function gladiatorBracketFields(view: GladiatorTournamentView) {
  if (!view.tournament) return [{ name: "🏟️ Turnuva Ağacı", value: "Henüz turnuva başlatılmadı.", inline: false }];
  const fields: Array<{ name: string; value: string; inline: false }> = [];
  for (let round = 1; round <= view.tournament.round_count; round += 1) {
    const roundMatches = view.matches.filter((match) => match.round === round);
    const chunks: string[] = [];
    for (const match of roundMatches) {
      const line = gladiatorMatchLine(match);
      const current = chunks.at(-1);
      if (!current || current.length + line.length + 2 > 980) chunks.push(line);
      else chunks[chunks.length - 1] = `${current}\n${line}`;
    }
    for (let index = 0; index < chunks.length; index += 1) {
      fields.push({
        name: `⚔️ ${gladiatorRoundLabel(view.tournament,round)}${index ? ` • Devam ${index + 1}` : ""}`,
        value: chunks[index]!,
        inline: false
      });
    }
  }
  return fields;
}

function gladiatorStandingFields(view:GladiatorTournamentView){
  if(!view.standings.length)return [];
  return [{
    name:`🏆 Eleme Puan Tablosu • ${view.qualifiersCompleted}/4`,
    value:view.standings.map((fighter,index)=>
      `**${index+1}. ${fighter.name}** — **${fighter.points} P** • ${fighter.appearances}/2 turnuva • En iyi ${fighter.best_placement}.`
    ).join("\n"),inline:false as const
  }];
}

function gladiatorStatus(view: GladiatorTournamentView): string {
  const tournament = view.tournament;
  if (!tournament) return "Turnuva bekleniyor";
  if (tournament.status === "COMPLETED") return `Tamamlandı • Şampiyon ${tournament.champion_name ?? "Bilinmiyor"}`;
  const round = gladiatorRoundLabel(tournament,tournament.current_round);
  return tournament.status === "BETTING" ? `${round} • Bahisler açık` : `${round} • Bahisler kapalı, dövüşler sürüyor`;
}

async function gladiatorRosterPayload(guildId: string, content?: string,requestedPage=0) {
  const view = await greatGamesGladiatorService.view(guildId);
  const pageCount=Math.max(1,Math.ceil(view.roster.length/GLADIATOR_ROSTER_PAGE_SIZE));
  const page=safePage(requestedPage,pageCount);
  const embed = new EmbedBuilder().setColor(0xb43b32).setTitle("⚔️ Capua • Gladyatör Listesi")
    .setDescription(`**Müzayede:** ${view.auctionStatus === "OPEN" ? "Tekliflere açık" : view.auctionStatus === "FINISHED" ? "Tamamlandı" : "Henüz açılmadı"} • **Sayfa:** ${page+1}/${pageCount}\nTeklifler **50 Altından** başlar. Sonraki teklif güncel bedelin üzerindeki **herhangi bir tam sayı** olabilir. Her devlet en fazla **3 gladyatöre** sahip olabilir.`)
    .addFields(...gladiatorStandingFields(view),...gladiatorRosterFields(view,page));
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|gladiator-roster-page|${page-1}`).setLabel("Önceki").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId(`gg2|gladiator-roster-refresh|${page}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gg2|gladiator-roster-page|${page+1}`).setLabel("Sonraki").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page===pageCount-1)
  );
  if (view.auctionStatus === "OPEN") buttons.addComponents(
    new ButtonBuilder().setCustomId("gg2|gladiator-auction-bid|GLADIATOR").setLabel("Teklif Ver").setEmoji("💰").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gg2|gladiator-auction-close|GLADIATOR").setLabel("Müzayedeyi Bitir").setEmoji("🏁").setStyle(ButtonStyle.Danger)
  );
  return { content: content ?? "", embeds: [embed], components: [buttons] };
}

async function gladiatorOwnershipPayload(guildId:string,requestedPage=0){
  const [view,wallets]=await Promise.all([
    greatGamesGladiatorService.view(guildId),
    greatGamesWalletService.listParticipants(guildId)
  ]);
  const fightersByCountry=new Map<string,typeof view.roster>();
  for(const fighter of view.roster){
    if(!fighter.owner_country_name)continue;
    const owned=fightersByCountry.get(fighter.owner_country_name)??[];
    owned.push(fighter);
    fightersByCountry.set(fighter.owner_country_name,owned);
  }
  const countryNames=new Set(wallets.map((wallet)=>wallet.country_name));
  for(const countryName of fightersByCountry.keys())countryNames.add(countryName);
  const countries=[...countryNames].sort((left,right)=>left.localeCompare(right,"tr"));
  const pageCount=Math.max(1,Math.ceil(countries.length/GLADIATOR_OWNERSHIP_PAGE_SIZE));
  const page=safePage(requestedPage,pageCount);
  const ownedCount=view.roster.filter((fighter)=>Boolean(fighter.owner_country_name)).length;
  const fields=countries
    .slice(page*GLADIATOR_OWNERSHIP_PAGE_SIZE,(page+1)*GLADIATOR_OWNERSHIP_PAGE_SIZE)
    .map((countryName)=>{
      const fighters=[...(fightersByCountry.get(countryName)??[])].sort((left,right)=>
        Number(right.power)-Number(left.power)||left.name.localeCompare(right.name,"tr")
      );
      return {
        name:`🏛️ ${countryName} • ${fighters.length}/3`.slice(0,256),
        value:fighters.length
          ? fighters.map((fighter)=>`• **${fighter.name}** [${fighter.code}] — G**${fighter.power}** • ${gold(Number(fighter.purchase_price??0))}`).join("\n")
          : "Henüz gladyatörü bulunmuyor.",
        inline:false as const
      };
    });
  const embed=new EmbedBuilder()
    .setColor(0x9b6a35)
    .setTitle("🏛️ Capua • Ülke Gladyatör Sahiplikleri")
    .setDescription(`**Katılımcı devlet:** ${countries.length} • **Sahipli gladyatör:** ${ownedCount}/${view.roster.length} • **Sayfa:** ${page+1}/${pageCount}\nHer devlet en fazla **3 gladyatöre** sahip olabilir. Listede kod, güç ve gladyatörün alış bedeli gösterilir.`)
    .addFields(...(fields.length?fields:[{name:"Kayıt bulunamadı",value:"Henüz katılımcı devlet veya gladyatör sahipliği bulunmuyor.",inline:false}]))
    .setFooter({text:"Sahiplik değişikliklerini görmek için Yenile düğmesini kullanabilirsin."});
  const navigation=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|gladiator-owners-page|${page-1}`).setLabel("Önceki").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId(`gg2|gladiator-owners-page|${page}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gg2|gladiator-owners-page|${page+1}`).setLabel("Sonraki").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page===pageCount-1)
  );
  return {embeds:[embed],components:[navigation]};
}

function gladiatorBetStatus(status:"LOCKED"|"WON"|"LOST"|"REFUNDED"){
  if(status==="WON")return "✅ Kazandı";
  if(status==="LOST")return "❌ Kaybetti";
  if(status==="REFUNDED")return "↩️ İade edildi";
  return "🟡 Sonuç bekliyor";
}

async function gladiatorBetsPayload(
  guildId:string,requestedPage=0,countryId?:string,requestedRunNumber?:number,requestedRound?:number
){
  const selection=Number.isSafeInteger(requestedRunNumber)&&Number.isSafeInteger(requestedRound)
    ?{runNumber:requestedRunNumber!,round:requestedRound!}:undefined;
  const ledger=await greatGamesGladiatorService.betLedger(guildId,countryId,selection);
  if(!ledger)throw new GameError("Henüz görüntülenebilecek bir Capua turnuvası bulunmuyor.");
  const entries=[
    ...ledger.bets.map((bet)=>{
      const projected=Math.floor(bet.amount*bet.locked_odds);
      const result=bet.status==="WON"?` • **Ödenen:** ${gold(bet.payout)}`:"";
      return {
        createdAt:new Date(bet.created_at).getTime(),
        field:{
          name:`🏛️ ${bet.country_name} • Tekli • Eşleşme #${bet.match_number}`.slice(0,256),
          value:`⚔️ **${bet.fighter_name}** [${bet.fighter_code}]\n💰 **Bahis:** ${gold(bet.amount)} • **Oran:** ${bet.locked_odds.toFixed(2)}x\n🎯 **Öngörülen kazanç:** ${gold(projected)} • ${gladiatorBetStatus(bet.status)}${result}`,
          inline:false as const
        }
      };
    }),
    ...ledger.coupons.map((coupon)=>{
      const projected=Math.floor(coupon.amount*coupon.combined_odds);
      const result=coupon.status==="WON"?` • **Ödenen:** ${gold(coupon.payout)}`:"";
      const selections=coupon.selections.map((selection)=>{
        const marker=selection.status==="WON"?"✅":selection.status==="LOST"?"❌":selection.status==="REFUNDED"?"↩️":"⏳";
        return `${marker} **#${selection.match_number} ${selection.fighter_name}** [${selection.fighter_code}] — ${selection.locked_odds.toFixed(2)}x`;
      }).join("\n");
      return {
        createdAt:new Date(coupon.created_at).getTime(),
        field:{
          name:`🎟️ ${coupon.country_name} • Kupon • ${coupon.selections.length} seçim`.slice(0,256),
          value:`${selections}\n💰 **Bahis:** ${gold(coupon.amount)} • **Birleşik oran:** ${coupon.combined_odds.toFixed(2)}x\n🎯 **Öngörülen kazanç:** ${gold(projected)} • ${gladiatorBetStatus(coupon.status)}${result}`,
          inline:false as const
        }
      };
    })
  ].sort((left,right)=>left.createdAt-right.createdAt);
  const pageCount=Math.max(1,Math.ceil(entries.length/GLADIATOR_BETS_PAGE_SIZE));
  const page=safePage(requestedPage,pageCount);
  const fields=entries.slice(page*GLADIATOR_BETS_PAGE_SIZE,(page+1)*GLADIATOR_BETS_PAGE_SIZE).map((entry)=>entry.field);
  const totalStake=ledger.bets.reduce((sum,bet)=>sum+bet.amount,0)+ledger.coupons.reduce((sum,coupon)=>sum+coupon.amount,0);
  const totalProjected=ledger.bets.reduce((sum,bet)=>sum+Math.floor(bet.amount*bet.locked_odds),0)
    +ledger.coupons.reduce((sum,coupon)=>sum+Math.floor(coupon.amount*coupon.combined_odds),0);
  const tournamentLabel=ledger.tournamentType==="FINAL"?"12 Kişilik Final":"Eleme Turnuvası";
  const embed=new EmbedBuilder()
    .setColor(0x6f4ab1)
    .setTitle(countryId?"🎟️ Capua • Bahislerim":"💰 Capua • Gladyatör Bahis Dökümü")
    .setDescription(`**Turnuva:** ${ledger.runNumber}. ${tournamentLabel} • **Aşama:** ${gladiatorRoundLabel({tournament_type:ledger.tournamentType} as GladiatorTournamentView["tournament"],ledger.round)}\n**Tekli:** ${ledger.bets.length} • **Kupon:** ${ledger.coupons.length} • **Toplam yatırılan:** ${gold(totalStake)} • **Toplam öngörülen kazanç:** ${gold(totalProjected)} • **Sayfa:** ${page+1}/${pageCount}\nÖngörülen kazanç, bahis sırasında kilitlenen oranla hesaplanan **brüt ödemedir**.`)
    .addFields(...(fields.length?fields:[{name:"Bu turda bahis bulunmuyor",value:countryId?"Devletinin seçilen aşamada tekli bahsi veya kuponu bulunmuyor.":"Seçilen aşamada hiçbir devlet bahis yapmadı.",inline:false}]))
    .setFooter({text:countryId?"Bu form yalnızca sana görünür. Üstteki menüden geçmiş turları seçebilirsin.":"Bu form yalnızca oyun yöneticilerine açıktır. Üstteki menüden bütün geçmiş turları seçebilirsin."});
  const pageAction=countryId?"gladiator-my-bets-page":"gladiator-bets-page";
  const scope=countryId?"my":"admin";
  const roundOptions=[...ledger.availableRounds].reverse().slice(0,25);
  const roundSelector=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ggs2|gladiator-bets-round|${scope}`)
      .setPlaceholder("Görüntülenecek turnuva ve turu seç")
      .addOptions(roundOptions.map((option)=>{
        const optionTournament=option.tournamentType==="FINAL"?"12 Kişilik Final":`${option.runNumber}. Eleme`;
        const optionRound=gladiatorRoundLabel({tournament_type:option.tournamentType} as GladiatorTournamentView["tournament"],option.round);
        return {
          label:`${optionTournament} • ${optionRound}`.slice(0,100),
          value:`${option.runNumber}:${option.round}`,
          description:option.tournamentStatus==="COMPLETED"?"Tamamlandı":option.runNumber===ledger.runNumber&&option.round===ledger.round?"Güncel aşama":"Geçmiş aşama",
          default:option.runNumber===ledger.runNumber&&option.round===ledger.round
        };
      }))
  );
  const navigation=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|${pageAction}|${page-1}|${ledger.runNumber}|${ledger.round}`).setLabel("Önceki").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId(`gg2|${pageAction}|${page}|${ledger.runNumber}|${ledger.round}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gg2|${pageAction}|${page+1}|${ledger.runNumber}|${ledger.round}`).setLabel("Sonraki").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page===pageCount-1)
  );
  return {embeds:[embed],components:[roundSelector,navigation]};
}

async function gladiatorPointsPayload(guildId:string,requestedPage=0){
  const view=await greatGamesGladiatorService.view(guildId);
  const ranked=[...view.roster].sort((left,right)=>
    Number(right.qualifier_points)-Number(left.qualifier_points)
    ||Number(left.qualifier_best_placement??Number.MAX_SAFE_INTEGER)-Number(right.qualifier_best_placement??Number.MAX_SAFE_INTEGER)
    ||Number(right.power)-Number(left.power)||left.name.localeCompare(right.name,"tr")
  );
  const pageCount=Math.max(1,Math.ceil(ranked.length/GLADIATOR_ROSTER_PAGE_SIZE));
  const page=safePage(requestedPage,pageCount);
  const start=page*GLADIATOR_ROSTER_PAGE_SIZE;
  const lines=ranked.slice(start,start+GLADIATOR_ROSTER_PAGE_SIZE).map((fighter,index)=>{
    const rank=start+index;
    const finalLine=rank<12?"🟢":"⚪";
    const best=fighter.qualifier_best_placement?`${fighter.qualifier_best_placement}.` : "—";
    return `${finalLine} **${rank+1}. ${fighter.name}** — **${fighter.qualifier_points} P** • Katılım ${fighter.qualifier_appearances}/2 • En iyi ${best} • G${fighter.power}`;
  });
  const chunks:string[]=[];
  for(const line of lines){
    const current=chunks.at(-1);
    if(!current||current.length+line.length+1>980)chunks.push(line);
    else chunks[chunks.length-1]=`${current}\n${line}`;
  }
  const embed=new EmbedBuilder().setColor(0xd6ad3c).setTitle("🏆 Capua • Gladyatör Puan Durumu")
    .setDescription(`**Tamamlanan eleme:** ${view.qualifiersCompleted}/4 • **Sayfa:** ${page+1}/${pageCount}\n🟢 İlk 12 final çizgisindedir. Dört eleme tamamlandığında ilk dört gladyatör doğrudan çeyrek finale geçer.`)
    .addFields(...chunks.map((value,index)=>({
      name:index===0?"📊 Genel Sıralama":`📊 Genel Sıralama • Devam ${index+1}`,value,inline:false
    })));
  const navigation=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|gladiator-points-page|${page-1}`).setLabel("Önceki").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page===0),
    new ButtonBuilder().setCustomId(`gg2|gladiator-points-page|${page}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gg2|gladiator-points-page|${page+1}`).setLabel("Sonraki").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page===pageCount-1)
  );
  return {embeds:[embed],components:[navigation]};
}

const GLADIATOR_AUCTION_PAGE_SIZE = 25;

async function gladiatorAuctionSelectionPayload(guildId: string, requestedPage: number) {
  const view = await greatGamesGladiatorService.view(guildId);
  if (view.auctionStatus !== "OPEN") throw new GameError("Capua gladyatör müzayedesi tekliflere kapalı.");
  const fighters = view.roster.filter((fighter) => !fighter.owner_country_name);
  if (!fighters.length) throw new GameError("Teklif verilebilecek gladyatör bulunmuyor.");
  const pageCount = Math.max(1, Math.ceil(fighters.length / GLADIATOR_AUCTION_PAGE_SIZE));
  const safePage = Number.isSafeInteger(requestedPage) ? requestedPage : 0;
  const page = Math.min(Math.max(0, safePage), pageCount - 1);
  const pageFighters = fighters.slice(page * GLADIATOR_AUCTION_PAGE_SIZE, (page + 1) * GLADIATOR_AUCTION_PAGE_SIZE);
  const selector = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ggs2|gladiator-fighter|${page}`)
      .setPlaceholder("Teklif verilecek gladyatörü seç")
      .addOptions(pageFighters.map((fighter) => ({
        label: fighter.name.slice(0, 100),
        value: fighter.id,
        description: `${fighter.code} • Güç ${fighter.power} • Can ${fighter.max_hp} • ${fighter.current_bid ? `Güncel ${gold(Number(fighter.current_bid))}` : "Açılış 50 Altın"}`.slice(0, 100)
      })))
  );
  const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|gladiator-auction-page|${page - 1}`).setLabel("Önceki").setEmoji("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`gg2|gladiator-auction-page|${page + 1}`).setLabel("Sonraki").setEmoji("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page === pageCount - 1)
  );
  return {
    content: `💰 **Teklif verilecek gladyatörü seç.**\nSayfa **${page + 1}/${pageCount}** • Açılış en az **50 Altın**; sonraki teklif güncel bedelin üzerindeki herhangi bir tam sayı olabilir.`,
    embeds: [],
    components: [selector, navigation]
  };
}

async function adminDashboardPayload(guildId: string): Promise<AdminPanelPayload> {
  const data = await greatGamesService.dashboard(guildId);
  const status = data.season
    ? `${data.season.status}${data.season.current_game ? ` • ${GREAT_GAME_TYPES[data.season.current_game].label}` : ""}`
    : "Henüz açılmadı";
  const embed = new EmbedBuilder().setColor(0xd6ad3c).setTitle("🏛️ 30. Tur Büyük Oyunları • Yönetici Paneli")
    .setDescription(`**Oyun turu:** ${data.currentTurn} • **Ana oyun:** ${status}\n**Bağımsız müzayede:** ${statusLabel(data, "AUCTION", chosenEntries(data, "AUCTION"))}\nOyuncular bu paneli göremez. Capua ve Devletler Müzayedesi ana oyunlardan bağımsız ilerleyebilir.`);
  for (const type of ACTIVE_GREAT_GAME_TYPES) {
    const selected = chosenEntries(data, type);
    embed.addFields({
      name: `${GREAT_GAME_TYPES[type].emoji} ${GREAT_GAME_TYPES[type].label}`,
      value: `Aday kayıt: **${data.counts[type]}** • Seçilen: **${selected.filter((entry) => entry.status !== "FINISHED").length}** • ${statusLabel(data, type, selected)}`
    });
  }
  const games = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...ACTIVE_GREAT_GAME_TYPES.map((type) => new ButtonBuilder()
      .setCustomId(`gg2|admin-view|${type}`).setLabel(GREAT_GAME_TYPES[type].label.slice(0, 30))
      .setEmoji(GREAT_GAME_TYPES[type].emoji).setStyle(ButtonStyle.Secondary))
  );
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("gg2|admin-home").setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [games, controls] };
}

async function adminGamePayload(guildId: string, type: GreatGameType): Promise<AdminPanelPayload> {
  const data = await greatGamesService.dashboard(guildId);
  if (type === "GLADIATOR") {
    const view = await greatGamesGladiatorService.view(guildId);
    const embed = new EmbedBuilder().setColor(0xb43b32).setTitle("⚔️ Capua Gladyatör Dövüşleri • Yönetim")
      .setDescription(`${gameRules(type)}\n\n**Durum:** ${gladiatorStatus(view)}\n**Gladyatör müzayedesi:** ${view.auctionStatus === "OPEN" ? "Tekliflere açık" : view.auctionStatus === "FINISHED" ? "Tamamlandı" : "Henüz açılmadı"}\n**Etkinliğe kayıtlı devlet:** ${view.registeredCountries}\n**Tamamlanan eleme:** ${view.qualifiersCompleted}/4${view.finalCompleted ? " • Final tamamlandı" : ""}`)
      .addFields(...gladiatorBracketFields(view));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("gg2|admin-home").setLabel("Ana Panel").setStyle(ButtonStyle.Secondary)
    );
    const running = view.tournament && ["BETTING", "FIGHTING"].includes(view.tournament.status);
    if (data.season && !["FINISHED","CANCELLED"].includes(data.season.status) && !running && !view.finalCompleted) row.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-start|GLADIATOR")
        .setLabel(view.qualifiersCompleted>=4?"12 Kişilik Finali Başlat":`${view.qualifiersCompleted+1}. Elemeyi Başlat`)
        .setEmoji("🎲").setStyle(ButtonStyle.Success)
    );
    if (view.tournament?.status === "BETTING") row.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-close|GLADIATOR").setLabel("Bahisleri Kapat").setEmoji("🔒").setStyle(ButtonStyle.Danger)
    );
    if (view.tournament?.status === "FIGHTING") row.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-fight|GLADIATOR").setLabel("Sıradaki Dövüşü Yap").setEmoji("🎲").setStyle(ButtonStyle.Primary)
    );
    if (running) row.addComponents(
      new ButtonBuilder().setCustomId("gg2|recover|GLADIATOR").setLabel("Formu Yeniden Yayınla").setEmoji("📣").setStyle(ButtonStyle.Secondary)
    );
    const auctionRow = new ActionRowBuilder<ButtonBuilder>();
    if (view.auctionStatus === "NOT_OPENED" || view.auctionStatus === "CANCELLED") auctionRow.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-auction-open|GLADIATOR").setLabel("Gladyatör Müzayedesini Aç").setEmoji("🔨").setStyle(ButtonStyle.Success)
    );
    if (view.auctionStatus === "OPEN") auctionRow.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-auction-close|GLADIATOR").setLabel("Gladyatör Müzayedesini Bitir").setEmoji("🏁").setStyle(ButtonStyle.Danger)
    );
    return { embeds: [embed], components: auctionRow.components.length ? [row, auctionRow] : [row] };
  }
  const entries = chosenEntries(data, type).filter((entry) => entry.status !== "FINISHED");
  const auctionState = auctionLifecycle(data);
  const selectedNames = entries.length ? entries.map((entry, index) => `${index + 1}. ${entry.country_name}`).join("\n") : "Henüz katılımcı seçilmedi.";
  const embed = new EmbedBuilder().setColor(0xb78b32).setTitle(`${GREAT_GAME_TYPES[type].emoji} ${GREAT_GAME_TYPES[type].label} • Yönetim`)
    .setDescription(`${gameRules(type)}\n\n**Durum:** ${statusLabel(data, type, entries)}\n**Aday kayıt:** ${data.counts[type]}\n\n**Seçilen devletler**\n${clip(selectedNames, 3_800)}`);
  if (type === "CARAVAN" && entries.length) embed.addFields(...caravanFields(entries));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("gg2|admin-home").setLabel("Ana Panel").setStyle(ButtonStyle.Secondary)
  );
  const canChoose = type === "AUCTION"
    ? Boolean(data.season) && !["PUBLISHED", "ACTIVE"].includes(auctionState)
    : data.season?.status === "OPEN";
  if (canChoose) {
    row.addComponents(new ButtonBuilder().setCustomId(`gg2|choose|${type}`).setLabel(type === "AUCTION" ? "Tüm Devletleri Ekle" : "Katılımcıları Seç").setEmoji("🎯").setStyle(ButtonStyle.Primary));
    const readyToPublish = type === "AUCTION" ? auctionState === "PREPARED" : data.season?.current_game === type;
    if (readyToPublish && entries.length) row.addComponents(
      new ButtonBuilder().setCustomId(`gg2|publish|${type}`).setLabel("Oyunu Yayınla").setEmoji("📣").setStyle(ButtonStyle.Success)
    );
  }
  const publishedForType = type === "AUCTION"
    ? auctionState === "PUBLISHED"
    : data.season?.status === "PUBLISHED" && data.season.current_game === type;
  if (publishedForType) row.addComponents(
    new ButtonBuilder().setCustomId(`gg2|publish|${type}`).setLabel("Formu Yeniden Yayınla").setEmoji("📣").setStyle(ButtonStyle.Success)
  );
  const recoverable = type === "AUCTION"
    ? ["PUBLISHED", "ACTIVE"].includes(auctionState)
    : data.season?.current_game === type && ["PUBLISHED", "ACTIVE"].includes(data.season.status);
  if (recoverable) row.addComponents(
    new ButtonBuilder().setCustomId(`gg2|recover|${type}`).setLabel("Formu Kurtar").setEmoji("🛠️").setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row] };
}

async function publicGamePayload(guildId: string, type: GreatGameType, content?: string) {
  const data = await greatGamesService.dashboard(guildId);
  const entries = chosenEntries(data, type);
  const auctionState = auctionLifecycle(data);
  const activeForType = type === "AUCTION" ? auctionState !== "IDLE" : data.season?.current_game === type;
  const publishedForType = type === "AUCTION"
    ? auctionState === "PUBLISHED"
    : data.season?.status === "PUBLISHED" && activeForType;
  const runningForType = type === "AUCTION"
    ? auctionState === "ACTIVE"
    : data.season?.status === "ACTIVE" && activeForType;
  const gladiatorView = type === "GLADIATOR" ? await greatGamesGladiatorService.view(guildId) : null;

  const embed = new EmbedBuilder().setColor(type === "GLADIATOR" ? 0xb43b32 : type === "CARAVAN" ? 0xc88a3d : 0xd6ad3c)
    .setTitle(`${GREAT_GAME_TYPES[type].emoji} ${GREAT_GAME_TYPES[type].label}`)
    .setDescription(type === "GLADIATOR" && gladiatorView
      ? `${gameRules(type)}\n\n**Durum:** ${gladiatorStatus(gladiatorView)} • **Gladyatör müzayedesi:** ${gladiatorView.auctionStatus === "OPEN" ? "Açık" : gladiatorView.auctionStatus === "FINISHED" ? "Tamamlandı" : "Kapalı"} • **Katılabilecek devlet:** ${gladiatorView.registeredCountries}`
      : `${gameRules(type)}\n\n**Durum:** ${statusLabel(data, type, entries)} • **Katılımcı:** ${entries.length}`);

  if (type === "GLADIATOR" && gladiatorView) {
    embed.addFields(...gladiatorBracketFields(gladiatorView));
    embed.setFooter({ text: "Güç, can, sahiplik ve güncel müzayede teklifleri: /oyunlar gladyatorler" });
  } else if (type === "AUCTION") {
    const lots = await greatGamesAuctionService.lots(guildId);
    const status = statusLabel(data, type, entries);
    const deadline = data.season?.auction_ends_at ? new Date(data.season.auction_ends_at) : null;
    const deadlineUnix = deadline && Number.isFinite(deadline.getTime()) ? Math.floor(deadline.getTime() / 1_000) : null;
    const statusIcon = runningForType
      ? "🔔"
      : lots.some((lot) => lot.phase === "FINISHED") ? "🏁" : "📣";
    embed
      .setTitle("🏺 Devletler Müzayedesi")
      .setDescription(
        `## ${statusIcon} ${status}\n` +
        `${auctionOverview(lots)}\n\n` +
        `💵 **Açılış:** ${gold(AUCTION_OPENING_BID)}  •  ⬆️ **Artış:** ${gold(AUCTION_BID_INCREMENT)}\n` +
        (deadlineUnix && runningForType ? `⏳ **Otomatik kapanış:** <t:${deadlineUnix}:F> • <t:${deadlineUnix}:R>\n` : "") +
        `🔒 Teklif verirken para kesilmez; yalnız kazandığın kalemler kapanışta cüzdanından tahsil edilir.`
      );
    if (lots.length) embed.addFields(...auctionFields(lots));
    else embed.addFields({ name: "📦 Müzayede Kalemleri", value: "Henüz müzayede kataloğu hazırlanmadı.", inline: false });
    embed.setFooter({ text: "Aşağıdaki menüden imtiyazı seç; açılan teklif ekranındaki sıradaki bedeli onayla. Formu Yenile düğmesi güncel liderleri getirir." });
  } else if (type === "CARAVAN") {
    embed.addFields(...caravanFields(entries));
    embed.setFooter({ text: "Her aşama çözüldüğünde kervanlar 50 kademeli pistte yeni puanlarına göre ilerler." });
  } else if (type === "CHARIOT") {
    embed.addFields(...chariotFields(entries));
  } else {
    const ranked = [...entries].sort((left, right) => Number(right.score) - Number(left.score) || left.country_name.localeCompare(right.country_name, "tr"));
    embed.addFields({ name: "Katılan Devletler", value: clip(ranked.map((entry, index) => `${index + 1}. **${entry.country_name}**${Number(entry.score) ? ` — ${entry.score} puan` : ""}`).join("\n") || "Katılımcı bulunmuyor.") });
  }

  if (type === "CARAVAN" && data.season?.status === "ACTIVE" && activeForType) {
    const readiness = await greatGamesFlowService.roundReadiness(guildId, type);
    const lines = readiness.rooms.map((room) => {
      const chooser = room.countries.find((country) => country.submitted);
      return chooser
        ? `✅ **${room.roomKey}** — Seçim tamamlandı (${chooser.countryName})`
        : `⏳ **${room.roomKey}** — Ortak rota bekleniyor`;
    });
    const completed = readiness.rooms.filter((room) => room.countries.some((country) => country.submitted)).length;
    embed.addFields({
      name: `🔒 Kervan Rotaları • Aşama ${readiness.round}`,
      value: clip(`${lines.join("\n") || "Henüz kervan bulunmuyor."}\n\n**Hazır:** ${completed}/${readiness.rooms.length}${completed === readiness.rooms.length && readiness.rooms.length ? " • Yönetici aşamayı çözebilir." : ""}`)
    });
  }

  if ((type === "KINGS_BET" || type === "CHARIOT") && data.season?.status === "ACTIVE" && activeForType) {
    const readiness = await greatGamesFlowService.roundReadiness(guildId, type);
    if (type === "CHARIOT") {
      const racers = readiness.rooms.flatMap((room) => room.countries);
      const submitted = racers.filter((country) => country.submitted).length;
      const lines = racers.map((country) => `${country.submitted ? "✅" : "⏳"} **${country.countryName}** — ${country.submitted ? "Taktiğini tamamladı" : "Taktik bekleniyor"}`);
      embed.addFields({
        name: `🔒 Gizli Taktikler • Etap ${readiness.round}`,
        value: clip(`${lines.join("\n") || "Henüz yarışçı bulunmuyor."}\n\n**Hazır:** ${submitted}/${racers.length}${submitted === racers.length && racers.length ? " • Yönetici etabı çözebilir." : ""}`)
      });
    } else {
      const lines = readiness.rooms.map((room, index) => {
        const countries = room.countries.map((country) => `${country.submitted ? "✅" : "⏳"} ${country.countryName}`).join(" • ");
        const submitted = room.countries.filter((country) => country.submitted).length;
        const complete = room.countries.length === 2 && submitted === 2;
        return `**Eşleşme ${index + 1}:** ${countries}\n↳ ${complete ? "İki taraf da seçimini tamamladı; çözüm bekleniyor." : `${submitted}/2 seçim tamamlandı.`}`;
      });
      embed.addFields({
        name: `🔒 Gizli Seçimler • Aşama ${readiness.round}`,
        value: clip(lines.join("\n") || "Henüz eşleşme bulunmuyor.")
      });
    }
  }

  if (type === "CHARIOT") {
    const latestResult = await greatGamesService.latestRoundResult(guildId, type);
    if (latestResult) embed.addFields(...chariotResultFields(latestResult));
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gg2|public-refresh|${type}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
  );
  if(type==="GLADIATOR"&&gladiatorView?.tournament?.status==="BETTING"){
    buttons.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-bet|GLADIATOR").setLabel("Tekli Bahis").setEmoji("💰").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("gg2|gladiator-coupon-open|GLADIATOR").setLabel("Kupon Yap").setEmoji("🎟️").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("gg2|gladiator-close|GLADIATOR").setLabel("Bahisleri Kapat").setEmoji("🔒").setStyle(ButtonStyle.Danger)
    );
  }else if(type==="GLADIATOR"&&gladiatorView?.tournament?.status==="FIGHTING"){
    buttons.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-fight|GLADIATOR").setLabel("Sıradaki Dövüşü Yap").setEmoji("🎲").setStyle(ButtonStyle.Danger)
    );
  }
  if (type!=="GLADIATOR" && publishedForType) {
    if (type === "CHARIOT") buttons.addComponents(new ButtonBuilder().setCustomId("gg2|bet|CHARIOT").setLabel("Bahis Yap").setEmoji("💰").setStyle(ButtonStyle.Primary));
    buttons.addComponents(new ButtonBuilder().setCustomId(`gg2|start|${type}`).setLabel("Oyunu Başlat").setEmoji("▶️").setStyle(ButtonStyle.Success));
  }
  if (type!=="GLADIATOR" && runningForType) {
    if (type !== "AUCTION") buttons.addComponents(new ButtonBuilder().setCustomId(`gg2|action|${type}`).setLabel("Gizli Hamle Ver").setStyle(ButtonStyle.Primary));
    buttons.addComponents(new ButtonBuilder().setCustomId(`gg2|resolve|${type}`).setLabel(type === "AUCTION" ? "Müzayedeyi Bitir" : "Aşamayı Çöz").setEmoji(type === "AUCTION" ? "🏁" : "🎲").setStyle(ButtonStyle.Danger));
  }
  if (type === "GLADIATOR" && gladiatorView?.auctionStatus === "OPEN") {
    buttons.addComponents(
      new ButtonBuilder().setCustomId("gg2|gladiator-auction-bid|GLADIATOR").setLabel("Gladyatöre Teklif Ver").setEmoji("💰").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("gg2|gladiator-auction-close|GLADIATOR").setLabel("Müzayedeyi Bitir").setEmoji("🏁").setStyle(ButtonStyle.Danger)
    );
  }
  const components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];
  if (type === "AUCTION" && runningForType) {
    const lots = (await greatGamesAuctionService.lots(guildId)).filter((lot) => lot.phase === "FINAL");
    if (lots.length) components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("ggs2|auction-lot").setPlaceholder("🏺 Teklif vereceğin imtiyazı seç")
        .addOptions(lots.slice(0, 25).map((lot) => {
          const currentBid = Number(lot.current_bid ?? 0);
          const { name, effect } = auctionTitleParts(lot.title);
          return {
            label: `${lot.lot_order}. ${name}`.slice(0, 100),
            value: lot.id,
            description: (currentBid > 0
              ? `Güncel ${gold(currentBid)} • Sıradaki ${gold(auctionNextMinimum(currentBid))}`
              : `Açılış ${gold(AUCTION_OPENING_BID)} • ${effect}`).slice(0, 100),
            emoji: AUCTION_REWARD_EMOJIS[lot.reward_type] ?? "🏺"
          };
        }))
    ));
  }
  components.push(buttons);
  return { content: content ?? "", embeds: [embed], components };
}

let automaticAuctionProcessing = false;

export async function processDueGreatGamesAuctions(client: Client): Promise<{ closed: number; published: number; failed: number }> {
  if (automaticAuctionProcessing) return { closed: 0, published: 0, failed: 0 };
  automaticAuctionProcessing = true;
  let closed = 0;
  let published = 0;
  let failed = 0;
  try {
    for (const due of await greatGamesAuctionService.dueAutomaticClosures()) {
      try {
        let summary: string[] = [];
        if (due.status === "ACTIVE") {
          const result = await greatGamesAuctionService.advance(due.guildId);
          summary = result.summary;
          closed += 1;
        }
        const content = summary.length
          ? `⏰ **Süre doldu; müzayede otomatik kapandı.**\n\n🏺 **Müzayede Sonuçları**\n${summary.join("\n")}`.slice(0, 2_000)
          : "🏁 **Müzayede tamamlandı.** Sonuçlar aşağıdaki forma işlendi.";
        const payload = await publicGamePayload(due.guildId, "AUCTION", content);
        const channel = await client.channels.fetch(due.channelId);
        if (!channel?.isTextBased() || channel.isDMBased()) throw new Error("Müzayede sonuç kanalı bulunamadı veya sunucu yazı kanalı değil.");

        let publishedMessageId = due.messageId;
        try {
          const message = await channel.messages.fetch(due.messageId);
          await message.edit(payload);
        } catch (error) {
          if (Number((error as { code?: number }).code ?? 0) !== 10_008) throw error;
          if (!channel.isSendable()) throw new Error("Müzayede sonuç kanalı mesaj göndermeye uygun değil.");
          const message = await channel.send(payload);
          publishedMessageId = message.id;
        }
        await greatGamesAuctionService.markResultPublished(due.guildId, publishedMessageId);
        published += 1;
      } catch (error) {
        failed += 1;
        logger.error({ error, guildId: due.guildId, channelId: due.channelId }, "Süresi dolan Devletler Müzayedesi kapatılamadı veya yayımlanamadı");
      }
    }
    return { closed, published, failed };
  } finally {
    automaticAuctionProcessing = false;
  }
}

function diplomacyActionModal(data: GreatGamesDashboard, countryId: string): ModalBuilder {
  const ownEntry = data.entries.find((entry) =>
    entry.game_type === "DIPLOMACY" && entry.country_id === countryId && entry.status === "ACTIVE"
  );
  if (!ownEntry?.room_key) throw new GameError("Devletin etkin bir Diplomasi Masası bulunmuyor.");
  const table = data.entries.filter((entry) =>
    entry.game_type === "DIPLOMACY" && entry.room_key === ownEntry.room_key && entry.status === "ACTIVE"
  );
  if (table.length !== 3) throw new GameError("Diplomasi Masası üç devlet olarak hazırlanamadı.");
  const goalOptions = table.filter((entry) => entry.country_id !== countryId).flatMap((entry) => ([
    { label: String(entry.metadata.primaryGoal).slice(0, 100), value: diplomacyGoalKey(entry.country_id, "PRIMARY") },
    { label: String(entry.metadata.secondaryGoal).slice(0, 100), value: diplomacyGoalKey(entry.country_id, "SECONDARY") }
  ])).sort((left, right) => left.label.localeCompare(right.label, "tr"));
  if (goalOptions.length !== 4) throw new GameError("Diğer iki devletin dört diplomasi hedefi hazırlanamadı.");
  const context = [
    `## ${String(ownEntry.metadata.scenario ?? "Diplomatik Kriz")}`,
    String(ownEntry.metadata.crisis ?? "Kriz açıklaması bulunmuyor."),
    `**Senin ana hedefin:** ${String(ownEntry.metadata.primaryGoal ?? "Belirlenmedi")}`,
    `**Senin ikincil hedefin:** ${String(ownEntry.metadata.secondaryGoal ?? "Belirlenmedi")}`,
    `**Masa gelişmesi:** ${String(ownEntry.metadata.development ?? "Gelişme bulunmuyor.")}`,
    "Aşağıdaki dört sonuç yalnızca diğer iki devletin hedefleridir; kendi hedeflerine oy veremezsin."
  ].join("\n");
  return new ModalBuilder()
    .setCustomId("ggm2|action|DIPLOMACY")
    .setTitle(`Diplomasi • ${String(ownEntry.metadata.scenario ?? "Masa")}`.slice(0, 45))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(context.slice(0, 4_000)))
    .addLabelComponents(
      new LabelBuilder().setLabel("Ana sonuç").setDescription("Anlaşmanın temel hükmü olacak hedefi seç.")
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId("primary").setPlaceholder("Dört hedeften ana sonucu seç").setRequired(true).addOptions(goalOptions)),
      new LabelBuilder().setLabel("İkincil sonuç").setDescription("Anlaşmaya eklenecek farklı bir hedefi seç.")
        .setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId("secondary").setPlaceholder("Dört hedeften ikincil sonucu seç").setRequired(true).addOptions(goalOptions))
    );
}

function actionModal(type: GreatGameType): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`ggm2|action|${type}`).setTitle(`${GREAT_GAME_TYPES[type].label} Hamlesi`);
  if (type === "CHARIOT") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("tactic").setLabel("Saldırgan / Dengeli / Temkinli / Sıkıştır").setPlaceholder("Dengeli").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("target").setLabel("Sıkıştırma hedefinin devlet adı").setStyle(TextInputStyle.Short).setRequired(false))
  );
  if (type === "CARAVAN") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("route").setLabel("Güvenli / Dengeli / Tehlikeli").setPlaceholder("Dengeli").setStyle(TextInputStyle.Short).setRequired(true))
  );
  if (type === "KINGS_BET") return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("decision").setLabel("Kararın: İşbirliği veya İhanet").setPlaceholder("İşbirliği").setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("prediction").setLabel("Rakip tahmini: İşbirliği veya İhanet").setPlaceholder("İhanet").setStyle(TextInputStyle.Short).setRequired(true))
  );

  throw new GameError("Bu oyun için oyuncu hamlesi bulunmuyor.");
}

export async function handleGreatGamesCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "oyunlar") return false;
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca sunucuda kullanılabilir.");
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "panel") {
    if (!isGameMaster(interaction)) throw new GameError("Büyük Oyunlar yönetim panelini yalnızca oyun yöneticisi açabilir.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.reply({ ...(await adminDashboardPayload(interaction.guildId)), flags: MessageFlags.Ephemeral });
    return true;
  }
  if (subcommand === "katilimci-ulkeler") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    const wallets = await greatGamesWalletService.listParticipants(interaction.guildId);
    if (!wallets.length) throw new GameError("Büyük Oyunlara katılmış devlet bulunmuyor.");
    const lines = wallets.map((wallet, index) => `${index + 1}. **${wallet.country_name}** — ${gold(Number(wallet.balance))}${wallet.closed_at ? " • Kapalı" : " • Açık"}`);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xd6ad3c).setTitle("🏛️ Büyük Oyunlar • Katılımcı Ülkeler").setDescription(clip(lines.join("\n"), 3_900))], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (subcommand === "puan-durumu") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    const [standings, dashboard] = await Promise.all([
      greatGamesService.pointStandings(interaction.guildId), greatGamesService.dashboard(interaction.guildId)
    ]);
    if (!standings.length) throw new GameError("Büyük Oyunlara katılmış devlet veya kaydedilmiş puan bulunmuyor.");
    const lines = standings.map((standing, index) =>
      `**${index + 1}. ${standing.countryName} — ${standing.total} Puan**\n` +
      `↳ 🏺 Müzayede ${standing.byGame.AUCTION} • 🏇 Arabalar ${standing.byGame.CHARIOT} • 👑 Krallar ${standing.byGame.KINGS_BET} • ⚔️ Capua ${standing.byGame.GLADIATOR}`
    );
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xd6ad3c)
        .setTitle("🏆 Büyük Oyunlar • Puan Durumu")
        .setDescription(clip(`💰 **Müzayede Ödül Havuzu:** ${gold(Number(dashboard.season?.prize_pool ?? 0))}\nKapanışta genel sıralamanın ilk üçüne %50 / %30 / %20 dağıtılır.\n\n${lines.join("\n\n")}`, 3_900))
        .setFooter({ text: "Puanlar oyunlar sonuçlandırıldığında kalıcı olarak kaydedilir; ödül dağıtımı yalnızca yönetici kapanışında yapılır." })],
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  if (subcommand === "cuzdan-bonusu") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await greatGamesWalletService.grantAuctionBonus(interaction.guildId, `discord:${interaction.id}`);
    await interaction.editReply(
      `💰 **Müzayede cüzdan bonusu tamamlandı.**\n` +
      `Ödeme yapılan açık cüzdan: **${result.credited}**\n` +
      `Toplam eklenen bakiye: **${gold(result.total)}**`
    );
    return true;
  }
  if (subcommand === "cuzdan-duzenle") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    const countryName = interaction.options.getString("ulke", true);
    const amount = interaction.options.getInteger("miktar", true);
    const description = interaction.options.getString("aciklama") ?? undefined;
    const country = await gameService.countryByName(interaction.guildId, countryName);
    if (!country) throw new GameError("Belirtilen ülke bulunamadı.");
    const result = await greatGamesWalletService.adminAdjust({
      guildId: interaction.guildId,
      countryId: country.id,
      amount,
      ...(description ? { description } : {}),
      sourceKey: `discord:wallet-adjust:${interaction.id}`
    });
    const operation = amount > 0 ? `+${gold(amount)}` : `−${gold(Math.abs(amount))}`;
    await interaction.reply({
      content: `${result.changed ? "✅" : "ℹ️"} **${country.name}** oyun cüzdanı ${operation} düzenlendi.\n**Önce:** ${gold(result.before)} • **Sonra:** ${gold(result.after)}${result.changed ? "" : "\nBu işlem daha önce uygulanmıştı; yeniden yazılmadı."}`,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  if (subcommand === "kurtar") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    const data = await greatGamesService.dashboard(interaction.guildId);
    let type=data.season?.current_game??null;
    if(!type&&["PUBLISHED","ACTIVE"].includes(auctionLifecycle(data)))type="AUCTION";
    if(!type){
      const capua=await greatGamesGladiatorService.view(interaction.guildId);
      if(capua.tournament&&["BETTING","FIGHTING"].includes(capua.tournament.status))type="GLADIATOR";
    }
    const recoverableAuction=type==="AUCTION"&&["PUBLISHED","ACTIVE"].includes(auctionLifecycle(data));
    if(!type||!data.season||(type!=="GLADIATOR"&&type!=="AUCTION"&&!["PUBLISHED","ACTIVE"].includes(data.season.status))||(type==="AUCTION"&&!recoverableAuction))
      throw new GameError("Kurtarılabilecek yayında veya etkin bir oyun bulunmuyor.");
    await interaction.reply(await publicGamePayload(interaction.guildId, type, "🛠️ Aktif oyun formu kayıtlar korunarak yeniden oluşturuldu."));
    return true;
  }
  if (subcommand === "cuzdan-onar") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await greatGamesService.repairFinishedCaravanPayments(interaction.guildId);
    const lines = result.countries.map((item) => `**${item.countryName}:** ${gold(item.before)} → ${gold(item.after)} • Katılım −${gold(item.stake)} • Ödül +${gold(item.payout)}`);
    await interaction.editReply({ content: clip(`✅ Ticaret Kervanı cüzdan denetimi tamamlandı.\n**Toplam katılım havuzu:** ${gold(result.totalStake)} • **Dağıtılan:** ${gold(result.totalPayout)}\n\n${lines.join("\n")}`, 1_990) });
    return true;
  }
  if (subcommand === "yonetici-bitir") {
    if (!isGameMaster(interaction)) throw new GameError("Bu komut yalnızca oyun yöneticileri tarafından kullanılabilir.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await greatGamesWalletService.closeAll(interaction.guildId);
    const awards = result.prizeAwards.length
      ? `\n\n🏆 **Müzayede ödül havuzu dağıtımı**\n${result.prizeAwards.map((award) =>
        `${award.rank}. **${award.countryName}** — ${award.points} puan • +${gold(award.amount)}`
      ).join("\n")}`
      : "";
    const countries = result.countries.map((item) =>
      `• **${item.countryName}:** ${gold(item.originalBalance)} → devlete **${gold(item.amount)}** • sıfırlanan ${gold(item.discarded)}`
    ).join("\n");
    await interaction.editReply(clip(
      `🏛️ Büyük Oyunlar kapatıldı. Ödül havuzu önce dereceye giren cüzdanlara dağıtıldı. ` +
      `Ardından her cüzdanın **%30’u** devlete aktarıldı, kalan **%70** sıfırlandı.\n\n${countries}\n\n` +
      `**Toplam aktarılan:** ${gold(result.total)} • **Toplam sıfırlanan:** ${gold(result.discardedTotal)}${awards}`,
      1_990
    ));
    return true;
  }
  if (subcommand === "gladyatorler") {
    await interaction.reply(await gladiatorRosterPayload(interaction.guildId));
    return true;
  }
  if(subcommand==="gladyator-sahiplikleri"){
    await interaction.reply(await gladiatorOwnershipPayload(interaction.guildId));
    return true;
  }
  if(subcommand==="gladyator-bahisleri"){
    if(!isGameMaster(interaction))throw new GameError("Gladyatör bahis dökümünü yalnızca oyun yöneticileri görebilir.");
    await interaction.reply({...await gladiatorBetsPayload(interaction.guildId),flags:MessageFlags.Ephemeral});
    return true;
  }
  if(subcommand==="gladyator-puanlari"){
    await interaction.reply(await gladiatorPointsPayload(interaction.guildId));
    return true;
  }
  const country = await ownCountry(interaction.guildId, interaction.user.id);
  if(subcommand==="bahislerim"){
    await interaction.reply({
      ...(await gladiatorBetsPayload(interaction.guildId,0,country.id)),
      flags:MessageFlags.Ephemeral
    });
    return true;
  }
  if (subcommand === "katil") {
    const result = await greatGamesWalletService.join(interaction.guildId, country.id, interaction.user.id);
    await interaction.reply({ content: result.created
      ? `✅ ${country.name}, 30. Tur Büyük Oyunlarına yeniden katıldı ve dört etkin oyuna aday kaydedildi. Oyun cüzdanına **${gold(5_000)}** yüklendi.`
      : `ℹ️ ${country.name} zaten kayıtlı. Eksik oyun adaylıkları tamamlandı; güncel bakiye **${gold(result.balance)}**.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (subcommand === "cuzdan") {
    const wallet = await greatGamesWalletService.get(interaction.guildId, country.id);
    if (!wallet) throw new GameError("Önce `/oyunlar katil` kullanmalısın.");
    await interaction.reply({ content: `🎟️ **${country.name} • Oyun Cüzdanı**\nBakiye: **${gold(Number(wallet.balance))}**`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (subcommand === "para-aktar") {
    const amount = interaction.options.getInteger("miktar", true);
    const result = await greatGamesWalletService.transferFromRandomSettlement({ guildId: interaction.guildId, countryId: country.id, amount, sourceKey: `discord:${interaction.id}` });
    await interaction.reply({ content: `✅ **${result.settlementName}** hazinesinden ${gold(amount)} aktarıldı. Yeni oyun bakiyesi: **${gold(result.walletBalance)}**`, flags: MessageFlags.Ephemeral });
    return true;
  }
  throw new GameError("Büyük Oyunlar alt komutu tanınmadı.");
}

export async function handleGreatGamesButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("gg2|")) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const [, action, rawType,rawRunNumber,rawRound] = interaction.customId.split("|");
  const fromAdminCard = interaction.message.embeds[0]?.title?.includes("Yönetim") ?? false;
  if (action === "admin-home") {
    if (!isGameMaster(interaction)) throw new GameError("Bu panel yalnızca oyun yöneticisine açıktır.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.update(await adminDashboardPayload(interaction.guildId)); return true;
  }
  if (action === "admin-view") {
    if (!isGameMaster(interaction)) throw new GameError("Bu panel yalnızca oyun yöneticisine açıktır.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.update(await adminGamePayload(interaction.guildId, gameId(rawType!))); return true;
  }
  if (action === "recover") {
    if (!isGameMaster(interaction)) throw new GameError("Oyunu yalnızca oyun yöneticisi kurtarabilir.");
    const type = gameId(rawType!);
    const data = await greatGamesService.dashboard(interaction.guildId);
    if(type==="GLADIATOR"){
      const capua=await greatGamesGladiatorService.view(interaction.guildId);
      if(!capua.tournament||!["BETTING","FIGHTING"].includes(capua.tournament.status))
        throw new GameError("Capua turnuvası artık kurtarılabilir durumda değil.");
    }else if(type==="AUCTION"){
      if(!["PUBLISHED","ACTIVE"].includes(auctionLifecycle(data)))throw new GameError("Müzayede artık kurtarılabilir durumda değil.");
    }else if(!data.season||data.season.current_game!==type||!["PUBLISHED","ACTIVE"].includes(data.season.status)){
      throw new GameError("Bu oyun artık kurtarılabilir durumda değil.");
    }
    await interaction.deferUpdate();
    await interaction.editReply(await adminGamePayload(interaction.guildId, type));
    await interaction.followUp({ ...(await publicGamePayload(interaction.guildId, type, "🛠️ Aktif oyun formu kayıtlar korunarak yeniden oluşturuldu.")), ephemeral: false });
    return true;
  }
  if (action === "open") {
    if (!isGameMaster(interaction)) throw new GameError("Yalnızca oyun yöneticisi kayıtları açabilir.");
    await greatGamesService.openSeason(interaction.guildId, interaction.user.id);
    await interaction.update(await adminDashboardPayload(interaction.guildId)); return true;
  }
  if (action === "gladiator-roster-refresh") {
    await interaction.update(await gladiatorRosterPayload(interaction.guildId,undefined,Number(rawType)));
    return true;
  }
  if(action==="gladiator-roster-page"){
    await interaction.update(await gladiatorRosterPayload(interaction.guildId,undefined,Number(rawType)));
    return true;
  }
  if(action==="gladiator-owners-page"){
    await interaction.update(await gladiatorOwnershipPayload(interaction.guildId,Number(rawType)));
    return true;
  }
  if(action==="gladiator-bets-page"){
    if(!isGameMaster(interaction))throw new GameError("Gladyatör bahis dökümünü yalnızca oyun yöneticileri görebilir.");
    await interaction.update(await gladiatorBetsPayload(interaction.guildId,Number(rawType),undefined,Number(rawRunNumber),Number(rawRound)));
    return true;
  }
  if(action==="gladiator-my-bets-page"){
    const country=await ownCountry(interaction.guildId,interaction.user.id);
    await interaction.update(await gladiatorBetsPayload(interaction.guildId,Number(rawType),country.id,Number(rawRunNumber),Number(rawRound)));
    return true;
  }
  if(action==="gladiator-points-page"){
    await interaction.update(await gladiatorPointsPayload(interaction.guildId,Number(rawType)));
    return true;
  }
  if (action === "gladiator-auction-open") {
    if (!isGameMaster(interaction)) throw new GameError("Gladyatör müzayedesini yalnızca oyun yöneticisi açabilir.");
    await interaction.deferUpdate();
    await greatGamesGladiatorAuctionService.open(interaction.guildId, interaction.user.id);
    await interaction.editReply(await adminGamePayload(interaction.guildId, "GLADIATOR"));
    await interaction.followUp({
      ...(await gladiatorRosterPayload(interaction.guildId, "🔨 **Capua Gladyatör Müzayedesi açıldı.** Teklifler 50 Altından başlar; sonraki teklif güncel bedelin üzerindeki herhangi bir tam sayı olabilir.")),
      ephemeral: false
    });
    return true;
  }
  if (action === "gladiator-auction-close") {
    if (!isGameMaster(interaction)) throw new GameError("Gladyatör müzayedesini yalnızca oyun yöneticisi bitirebilir.");
    await interaction.deferUpdate();
    const winners = await greatGamesGladiatorAuctionService.close(interaction.guildId);
    const preview = winners.slice(0, 15).map((winner) => `• **${winner.gladiatorName}** → ${winner.countryName} • ${gold(winner.amount)}`).join("\n");
    const notice = clip(`🏁 **Capua Gladyatör Müzayedesi tamamlandı.**\nSatılan gladyatör: **${winners.length}**${preview ? `\n\n${preview}${winners.length > 15 ? `\n…ve ${winners.length - 15} satış daha.` : ""}` : "\nTeklif verilen gladyatör bulunmadı."}`, 1_990);
    const fromRosterCard = interaction.message.embeds[0]?.title?.includes("Gladyatör Listesi") ?? false;
    if (fromAdminCard) {
      await interaction.editReply(await adminGamePayload(interaction.guildId, "GLADIATOR"));
      await interaction.followUp({ ...(await gladiatorRosterPayload(interaction.guildId, notice)), ephemeral: false });
    } else if (fromRosterCard) {
      await interaction.editReply(await gladiatorRosterPayload(interaction.guildId, notice));
    } else {
      await interaction.editReply(await publicGamePayload(interaction.guildId, "GLADIATOR", notice));
    }
    return true;
  }
  if (action === "gladiator-auction-bid") {
    await interaction.reply({ ...(await gladiatorAuctionSelectionPayload(interaction.guildId, 0)), flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "gladiator-auction-page") {
    await interaction.update(await gladiatorAuctionSelectionPayload(interaction.guildId, Number(rawType ?? 0)));
    return true;
  }
  if (action === "gladiator-start") {
    if (!isGameMaster(interaction)) throw new GameError("Capua turnuvasını yalnızca oyun yöneticisi başlatabilir.");
    await interaction.deferUpdate();
    const result = await greatGamesGladiatorService.start(interaction.guildId, interaction.user.id);
    await interaction.editReply(await adminGamePayload(interaction.guildId, "GLADIATOR"));
    const opening=result.tournamentType==="FINAL"
      ? "🏆 **Capua 12 Kişilik Final Turnuvası** başladı. 5–12. sıralar final ön elemesine çıktı; ilk dört gladyatör çeyrek finali bekliyor."
      : `🎲 **${result.qualifierNumber}. Capua Eleme Turnuvası** başladı. 32 kişilik dengeli kadro belirlendi; Son 32 bahisleri açıldı.`;
    await interaction.followUp({
      ...(await publicGamePayload(interaction.guildId, "GLADIATOR", opening)),
      ephemeral: false
    });
    return true;
  }
  if (action === "gladiator-close") {
    if (!isGameMaster(interaction)) throw new GameError("Capua bahislerini yalnızca oyun yöneticisi kapatabilir.");
    await interaction.deferUpdate();
    const result = await greatGamesGladiatorService.closeBetting(interaction.guildId);
    const notice = `🔒 **${result.tournamentType==="FINAL"?(GLADIATOR_FINAL_ROUND_LABELS[result.round]??`Final Turu ${result.round}`):(GLADIATOR_ROUND_LABELS[result.round]??`Tur ${result.round}`)} bahisleri kapandı.** Yönetici dövüşleri sırayla çözebilir.`;
    if (fromAdminCard) {
      await interaction.editReply(await adminGamePayload(interaction.guildId, "GLADIATOR"));
      await interaction.followUp({ ...(await publicGamePayload(interaction.guildId, "GLADIATOR", notice)), ephemeral: false });
    } else {
      await interaction.editReply(await publicGamePayload(interaction.guildId, "GLADIATOR", notice));
    }
    return true;
  }
  if (action === "gladiator-fight") {
    if (!isGameMaster(interaction)) throw new GameError("Capua dövüşlerini yalnızca oyun yöneticisi çözebilir.");
    await interaction.deferUpdate();
    const result = await greatGamesGladiatorService.resolveNextFight(interaction.guildId);
    const championRewardNotice=result.championRewardCountry&&result.championReward
      ? ` 🪙 **${result.championRewardCountry}** oyun cüzdanına **${gold(result.championReward)}** şampiyonluk ödülü aktarıldı.`
      : "";
    const resultHeadline = result.tournamentCompleted
      ? result.tournamentType==="FINAL"
        ? `👑 **Capua Büyük Şampiyonu: ${result.winner}!** Büyük Final ${result.combatTurns} hücum turu ve ${result.successfulHits} başarılı vuruş sürdü. Kalan can: ${result.score}. Capua sezonu tamamlandı.`
        : `🏆 **${result.qualifiersCompleted}. Eleme Turnuvası Şampiyonu: ${result.winner}!** Final ${result.combatTurns} hücum turu ve ${result.successfulHits} başarılı vuruş sürdü. Kalan can: ${result.score}.${championRewardNotice} ${result.qualifiersCompleted<4?"Sıradaki eleme turnuvası açılabilir.":"Dört eleme tamamlandı; 12 kişilik final turnuvası açılabilir."}`
      : result.roundCompleted
        ? `⚔️ **${result.fighterA} — ${result.fighterB}:** Kazanan **${result.winner}** • ${result.combatTurns} hücum turu • ${result.successfulHits} başarılı vuruş • Kalan can ${result.score}\n✅ Tur tamamlandı. **${result.tournamentType==="FINAL"?(GLADIATOR_FINAL_ROUND_LABELS[result.nextRound!]??`Final Turu ${result.nextRound}`):(GLADIATOR_ROUND_LABELS[result.nextRound!]??`Tur ${result.nextRound}`)} bahisleri açıldı.**`
        : `⚔️ **${result.fighterA} — ${result.fighterB}:** Kazanan **${result.winner}** • ${result.combatTurns} hücum turu • ${result.successfulHits} başarılı vuruş • Kalan can ${result.score}`;
    const notice = clip(`${resultHeadline}\n\n**Dövüş Zarları**\n${result.combatLog.join("\n")}`, 1_990);
    if (fromAdminCard) {
      await interaction.editReply(await adminGamePayload(interaction.guildId, "GLADIATOR"));
      await interaction.followUp({ ...(await publicGamePayload(interaction.guildId, "GLADIATOR", notice)), ephemeral: false });
    } else {
      await interaction.editReply(await publicGamePayload(interaction.guildId, "GLADIATOR", notice));
    }
    return true;
  }
  if(action==="gladiator-coupon-open"){
    const country=await ownCountry(interaction.guildId,interaction.user.id);
    await interaction.reply({
      ...(await gladiatorCouponPayload(interaction.guildId,interaction.user.id,country.id,0)),
      flags:MessageFlags.Ephemeral
    });
    return true;
  }
  if(action==="gladiator-coupon-page"){
    const country=await ownCountry(interaction.guildId,interaction.user.id);
    await interaction.update(await gladiatorCouponPayload(
      interaction.guildId,interaction.user.id,country.id,Number(rawType)
    ));
    return true;
  }
  if(action==="gladiator-coupon-amount"){
    const key=gladiatorCouponDraftKey(interaction.guildId,interaction.user.id);
    const draft=gladiatorCouponDrafts.get(key);
    if(!draft)throw new GameError("Önce kupon seçimlerini açmalısın.");
    const amountInput=new TextInputBuilder()
      .setCustomId("amount").setLabel("Kupon Bahsi: 100–5.000 Altın")
      .setPlaceholder("1000").setMaxLength(10).setStyle(TextInputStyle.Short).setRequired(true);
    if(draft.amount)amountInput.setValue(String(draft.amount));
    await interaction.showModal(
      new ModalBuilder().setCustomId("ggm2|gladiator-coupon-amount|GLADIATOR").setTitle("Capua Kupon Tutarı")
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput))
    );
    return true;
  }
  if(action==="gladiator-coupon-confirm"){
    const country=await ownCountry(interaction.guildId,interaction.user.id);
    const key=gladiatorCouponDraftKey(interaction.guildId,interaction.user.id);
    const draft=gladiatorCouponDrafts.get(key);
    if(!draft||draft.countryId!==country.id)throw new GameError("Onaylanacak kupon taslağı bulunamadı.");
    const view=await greatGamesGladiatorService.view(interaction.guildId);
    if(view.tournament?.id!==draft.tournamentId||view.tournament.current_round!==draft.round||view.tournament.status!=="BETTING")
      throw new GameError("Kuponun hazırlandığı bahis aşaması artık açık değil.");
    const selections=selectedCouponFighters(view,draft);
    if(!draft.amount)throw new GameError("Kuponu onaylamadan önce bahis tutarını girmelisin.");
    await interaction.deferUpdate();
    const result=await greatGamesGladiatorService.placeCoupon({
      guildId:interaction.guildId,countryId:country.id,amount:draft.amount,sourceKey:`discord:${interaction.id}`,
      selections:selections.map((selection)=>({matchId:selection.matchId,fighterId:selection.fighterId}))
    });
    gladiatorCouponDrafts.delete(key);
    const selectionLines=result.selections.map((selection)=>
      `✅ **#${selection.matchNumber} ${selection.fighterName}** [${selection.fighterCode}] — ${selection.odds.toFixed(2)}x`
    ).join("\n");
    await interaction.editReply({
      content:"",
      embeds:[new EmbedBuilder().setColor(0x3a9d62).setTitle("✅ Capua Kuponu Onaylandı")
        .setDescription(`${selectionLines}\n\n💰 **Bahis:** ${gold(draft.amount)}\n🎟️ **Birleşik oran:** ${result.combinedOdds.toFixed(2)}x\n🎯 **Öngörülen kazanç:** ${gold(result.possiblePayout)}\n👛 **Kalan cüzdan:** ${gold(result.balance)}`)
        .setFooter({text:"Bütün seçimler doğru çıkarsa ödeme son kupon eşleşmesi çözüldüğünde otomatik yapılır."})],
      components:[]
    });
    return true;
  }
  if(action==="gladiator-coupon-cancel"){
    gladiatorCouponDrafts.delete(gladiatorCouponDraftKey(interaction.guildId,interaction.user.id));
    await interaction.update({content:"🗑️ Capua kupon taslağı iptal edildi; cüzdandan para kesilmedi.",embeds:[],components:[]});
    return true;
  }
  if (action === "gladiator-bet") {
    await interaction.showModal(new ModalBuilder().setCustomId("ggm2|gladiator-bet|GLADIATOR").setTitle("Capua Gladyatör Bahsi").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("match").setLabel("Eşleşme numarası").setPlaceholder("Örnek: 3").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("side").setLabel("Dövüşçü tarafı: A veya B").setPlaceholder("A").setMaxLength(1).setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Bahis: 100–5.000 Altın").setPlaceholder("1000").setMaxLength(10).setStyle(TextInputStyle.Short).setRequired(true))
    ));
    return true;
  }
  if (action === "cancel") {
    throw new GameError("Büyük Oyunlar sabit olarak açık tutulur; sezon bütünüyle iptal edilemez.");
  }
  if (action === "choose") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    if (type === "AUCTION") {
      await interaction.deferUpdate();
      const result = await greatGamesFlowService.selectParticipants({ guildId: interaction.guildId, gameType: type, mode: "ALL" });
      await interaction.editReply({ ...(await adminGamePayload(interaction.guildId, type)), content: `✅ Kayıtlı **${result.count} devletin tamamı** müzayedeye eklendi.` });
      return true;
    }
    await interaction.update({ content: `**${GREAT_GAME_TYPES[type].label}** katılımcıları nasıl seçilsin?`, embeds: [], components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`gg2|select-random|${type}`).setLabel("Rastgele Seç").setEmoji("🎲").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gg2|select-manual|${type}`).setLabel("Elle Seç").setEmoji("📝").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gg2|admin-view|${type}`).setLabel("Geri").setStyle(ButtonStyle.Danger)
      )
    ] });
    return true;
  }
  if (action === "select-random") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    await interaction.showModal(new ModalBuilder().setCustomId(`ggm2|select-random|${type}`).setTitle("Rastgele Katılımcı Seç").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("count").setLabel("Seçilecek devlet sayısı").setStyle(TextInputStyle.Short).setRequired(true))
    )); return true;
  }
  if (action === "select-manual") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    await interaction.showModal(new ModalBuilder().setCustomId(`ggm2|select-manual|${type}`).setTitle("Katılımcıları Elle Seç").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("countries").setLabel("Devletler; virgül veya yeni satırla").setStyle(TextInputStyle.Paragraph).setMaxLength(4_000).setRequired(true))
    )); return true;
  }
  if (action === "publish") {
    if (!isGameMaster(interaction)) throw new GameError("Oyunu yalnızca oyun yöneticisi yayınlayabilir.");
    const type = gameId(rawType!);
    await interaction.deferUpdate();
    await greatGamesFlowService.publishGame(interaction.guildId, type);
    await interaction.editReply(await adminGamePayload(interaction.guildId, type));
    await interaction.followUp({ ...(await publicGamePayload(interaction.guildId, type)), ephemeral: false });
    return true;
  }
  if (action === "public-refresh") {
    await interaction.update(await publicGamePayload(interaction.guildId, gameId(rawType!))); return true;
  }
  if (action === "start") {
    if (!isGameMaster(interaction)) throw new GameError("Oyunu yalnızca oyun yöneticisi başlatabilir.");
    const type = gameId(rawType!);
    await interaction.deferUpdate();
    const deadline = type === "AUCTION" ? nextIstanbulAuctionDeadline() : null;
    const result = await greatGamesFlowService.startPublishedGame(interaction.guildId, type, deadline ? {
      endsAt: deadline,
      channelId: interaction.channelId,
      messageId: interaction.message.id
    } : undefined);
    const notice = deadline
      ? `▶️ Müzayede **${result.count} devletle** başladı. Otomatik kapanış: <t:${Math.floor(deadline.getTime() / 1_000)}:F>.`
      : `▶️ Oyun **${result.count} devletle** başladı.`;
    await interaction.editReply(await publicGamePayload(interaction.guildId, type, notice));
    return true;
  }
  if (action === "bet") {
    await interaction.showModal(new ModalBuilder().setCustomId("ggm2|chariot-bet|CHARIOT").setTitle("Savaş Arabaları Bahsi").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("target").setLabel("Bahis yapılan devlet").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Bahis: 1–2.000 Altın").setStyle(TextInputStyle.Short).setRequired(true))
    )); return true;
  }
  if (action === "action") {
    const type = gameId(rawType!);
    if (type === "DIPLOMACY") {
      const [country, data] = await Promise.all([
        ownCountry(interaction.guildId, interaction.user.id),
        greatGamesService.dashboard(interaction.guildId)
      ]);
      await interaction.showModal(diplomacyActionModal(data, country.id));
    } else {
      await interaction.showModal(actionModal(type));
    }
    return true;
  }
  if (action === "resolve") {
    if (!isGameMaster(interaction)) throw new GameError("Aşamayı yalnızca oyun yöneticisi çözebilir.");
    const type = gameId(rawType!);
    await interaction.deferUpdate();
    if (type === "AUCTION") {
      const result = await greatGamesAuctionService.advance(interaction.guildId);
      await interaction.editReply(await publicGamePayload(interaction.guildId, type, `🏺 **Müzayede Sonuçları**\n${result.summary.join("\n")}`.slice(0, 2_000)));
      await greatGamesAuctionService.markResultPublished(interaction.guildId, interaction.message.id);
    } else {
      const result = await greatGamesService.resolveRound(interaction.guildId);
      const resultContent = type === "CHARIOT"
        ? undefined
        : `🎲 **Aşama ${result.round} Sonuçları**\n${result.summary.join("\n")}${result.finished ? "\n🏁 Oyun tamamlandı." : ""}`.slice(0, 2_000);
      await interaction.editReply(await publicGamePayload(interaction.guildId, type, resultContent));
    }
    return true;
  }
  return false;
}

export async function handleGreatGamesSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if(interaction.customId.startsWith("ggs2|gladiator-bets-round|")){
    if(!interaction.guildId)throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
    const scope=interaction.customId.split("|")[2];
    const [rawRun,rawRound]=interaction.values[0]?.split(":")??[];
    const runNumber=Number(rawRun);
    const round=Number(rawRound);
    if(!Number.isSafeInteger(runNumber)||!Number.isSafeInteger(round))throw new GameError("Capua bahis turu seçimi geçersiz.");
    if(scope==="admin"){
      if(!isGameMaster(interaction))throw new GameError("Gladyatör bahis dökümünü yalnızca oyun yöneticileri görebilir.");
      await interaction.update(await gladiatorBetsPayload(interaction.guildId,0,undefined,runNumber,round));
      return true;
    }
    const country=await ownCountry(interaction.guildId,interaction.user.id);
    await interaction.update(await gladiatorBetsPayload(interaction.guildId,0,country.id,runNumber,round));
    return true;
  }
  if(interaction.customId.startsWith("ggs2|gladiator-coupon|")){
    if(!interaction.guildId)throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
    const page=Number(interaction.customId.split("|")[2]??0);
    const country=await ownCountry(interaction.guildId,interaction.user.id);
    const view=await greatGamesGladiatorService.view(interaction.guildId);
    const draft=couponDraftFor(interaction.guildId,interaction.user.id,country.id,view);
    const matches=activeCouponMatches(view);
    const pageCount=Math.max(1,Math.ceil(matches.length/GLADIATOR_COUPON_MATCHES_PER_PAGE));
    const safe=safePage(page,pageCount);
    const pageMatches=matches.slice(safe*GLADIATOR_COUPON_MATCHES_PER_PAGE,(safe+1)*GLADIATOR_COUPON_MATCHES_PER_PAGE);
    const pageMatchById=new Map(pageMatches.map((match)=>[match.id,match]));
    const nextSelections=new Map(draft.selections);
    for(const match of pageMatches)nextSelections.delete(match.id);
    for(const value of interaction.values){
      const [matchId,fighterId]=value.split(":");
      const match=matchId?pageMatchById.get(matchId):undefined;
      if(!match||!fighterId||(fighterId!==match.fighter_a_id&&fighterId!==match.fighter_b_id))
        throw new GameError("Kupon seçimi artık geçerli değil; formu yenileyip tekrar dene.");
      if(nextSelections.has(match.id))throw new GameError("Aynı eşleşmeden iki gladyatör kupona eklenemez.");
      nextSelections.set(match.id,fighterId);
    }
    if(nextSelections.size>GLADIATOR_COUPON_MAX_SELECTIONS)
      throw new GameError(`Bir kuponda en fazla ${GLADIATOR_COUPON_MAX_SELECTIONS} eşleşme seçebilirsin.`);
    draft.selections=nextSelections;
    draft.updatedAt=Date.now();
    await interaction.update(await gladiatorCouponPayload(interaction.guildId,interaction.user.id,country.id,safe));
    return true;
  }
  if (interaction.customId.startsWith("ggs2|gladiator-fighter|")) {
    if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
    const fighterId = interaction.values[0];
    if (!fighterId) throw new GameError("Gladyatör seçilmedi.");
    const view = await greatGamesGladiatorService.view(interaction.guildId);
    if (view.auctionStatus !== "OPEN") throw new GameError("Capua gladyatör müzayedesi tekliflere kapalı.");
    const fighter = view.roster.find((item) => item.id === fighterId && !item.owner_country_name);
    if (!fighter) throw new GameError("Seçilen gladyatör artık tekliflere açık değil.");
    const minimum = fighter.current_bid ? Number(fighter.current_bid) + 1 : 50;
    await interaction.showModal(new ModalBuilder()
      .setCustomId(`ggm2|gladiator-auction-bid|${fighter.id}`)
      .setTitle(`${fighter.name} • Teklif`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("amount").setLabel(`Yeni teklif • En az ${gold(minimum)}`.slice(0, 45)).setPlaceholder(String(minimum)).setMaxLength(15).setStyle(TextInputStyle.Short).setRequired(true)
        )
      ));
    return true;
  }
  if (interaction.customId !== "ggs2|auction-lot") return false;
  const lotId = interaction.values[0];
  if (!lotId) throw new GameError("Müzayede kalemi seçilmedi.");
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const lot = (await greatGamesAuctionService.lots(interaction.guildId)).find((item) => item.id === lotId && item.phase === "FINAL");
  if (!lot) throw new GameError("Seçilen müzayede kalemi artık teklif kabul etmiyor; formu yenileyin.");
  const nextBid = auctionNextMinimum(Number(lot.current_bid ?? 0));
  const { name } = auctionTitleParts(lot.title);
  await interaction.showModal(new ModalBuilder().setCustomId(`ggm2|bid|${lotId}`).setTitle(`${name} • Teklif`.slice(0, 45)).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel(`Sıradaki teklif • ${gold(nextBid)}`.slice(0, 45)).setPlaceholder(nextBid.toLocaleString("tr-TR")).setValue(nextBid.toLocaleString("tr-TR")).setMaxLength(15).setStyle(TextInputStyle.Short).setRequired(true))
  ));
  return true;
}

export async function handleGreatGamesModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("ggm2|")) return false;
  if (!interaction.guildId) throw new GameError("Bu işlem yalnızca sunucuda kullanılabilir.");
  const [, action, rawType] = interaction.customId.split("|");
  if (action === "select-random" || action === "select-manual") {
    if (!isGameMaster(interaction)) throw new GameError("Katılımcıları yalnızca oyun yöneticisi seçebilir.");
    const type = gameId(rawType!);
    const result = action === "select-random"
      ? await greatGamesFlowService.selectParticipants({ guildId: interaction.guildId, gameType: type, mode: "RANDOM", count: Number(interaction.fields.getTextInputValue("count")) })
      : await greatGamesFlowService.selectParticipants({ guildId: interaction.guildId, gameType: type, mode: "MANUAL", countryNames: interaction.fields.getTextInputValue("countries").split(/[\n,;]+/).map((name) => name.trim()).filter(Boolean) });
    const payload = await adminGamePayload(interaction.guildId, type);
    const content = `${result.count} devlet seçildi${result.rooms.length > 1 ? `:\n${result.rooms.map((room, index) => `${index + 1}. ${room}`).join("\n")}` : "."}`.slice(0, 2_000);
    if (interaction.isFromMessage()) await interaction.update({ ...payload, content });
    else await interaction.reply({ ...payload, content });
    return true;
  }
  const country = await ownCountry(interaction.guildId, interaction.user.id);
  if(action==="gladiator-coupon-amount"){
    const amount=Number(interaction.fields.getTextInputValue("amount").replaceAll(".","").trim());
    if(!Number.isSafeInteger(amount)||amount<100||amount>5_000)
      throw new GameError("Capua kupon bahsi 100–5.000 Altın arasında olmalıdır.");
    const draft=gladiatorCouponDrafts.get(gladiatorCouponDraftKey(interaction.guildId,interaction.user.id));
    if(!draft||draft.countryId!==country.id)throw new GameError("Güncellenecek kupon taslağı bulunamadı.");
    draft.amount=amount;
    draft.updatedAt=Date.now();
    const payload=await gladiatorCouponPayload(interaction.guildId,interaction.user.id,country.id,0);
    if(interaction.isFromMessage())await interaction.update(payload);
    else await interaction.reply({...payload,flags:MessageFlags.Ephemeral});
    return true;
  }
  if (action === "gladiator-auction-bid") {
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", "").trim());
    const result = await greatGamesGladiatorAuctionService.bid({
      guildId: interaction.guildId,
      countryId: country.id,
      userId: interaction.user.id,
      gladiatorId: rawType!,
      amount
    });
    await interaction.reply({
      content: `✅ **${result.gladiatorName}** için teklifin **${gold(result.amount)}** olarak kaydedildi. Lider olduğun/sahip olduğun gladyatör: **${result.leadingLots}/3** • Kalan teklif kapasitesi: **${gold(result.availableAfter)}**`,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  if (action === "gladiator-bet") {
    const matchNumber = Number(interaction.fields.getTextInputValue("match").trim());
    const sideRaw = interaction.fields.getTextInputValue("side").trim().toLocaleUpperCase("tr-TR");
    if (sideRaw !== "A" && sideRaw !== "B") throw new GameError("Dövüşçü tarafı `A` veya `B` olmalıdır.");
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", "").trim());
    const result = await greatGamesGladiatorService.placeBet({
      guildId: interaction.guildId,
      countryId: country.id,
      matchNumber,
      side: sideRaw,
      amount
    });
    await interaction.reply({
      content: `✅ **${result.fighterName}** için **${gold(amount)}** bahis kilitlendi. Oran: **${result.odds.toFixed(2)}x** • Olası ödeme: **${gold(result.possiblePayout)}** • Cüzdan: **${gold(result.balance)}**`,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }
  if (action === "chariot-bet") {
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", ""));
    const targetCountryName = interaction.fields.getTextInputValue("target").trim();
    await greatGamesBetService.place({ guildId: interaction.guildId, bettorCountryId: country.id, targetCountryName, amount });
    await interaction.reply({ content: `✅ ${targetCountryName} sürücüsüne ${gold(amount)} bahis kilitlendi.`, flags: MessageFlags.Ephemeral }); return true;
  }
  if (action === "bid") {
    const amount = Number(interaction.fields.getTextInputValue("amount").replaceAll(".", ""));
    const result = await greatGamesAuctionService.bid({ guildId: interaction.guildId, countryId: country.id, userId: interaction.user.id, lotId: rawType!, amount });
    await interaction.reply({ content: `✅ Açık artırma teklifin **${gold(result.amount)}** olarak kaydedildi; cüzdandan para kesilmedi. Diğer lider tekliflerin hesaba katıldığında kalan teklif kapasiten: **${gold(result.availableAfter)}**.`, flags: MessageFlags.Ephemeral }); return true;
  }
  if (action !== "action") return false;
  const type = gameId(rawType!);
  let payload: Record<string, unknown>;
  if (type === "CHARIOT") {
    const tactic = parseChariotTactic(interaction.fields.getTextInputValue("tactic"));
    if (!tactic) throw new GameError("Taktik `Saldırgan`, `Dengeli`, `Temkinli` veya `Sıkıştır` olmalıdır.");
    const targetName = interaction.fields.getTextInputValue("target").trim();
    if (tactic === "SQUEEZE" && !targetName) throw new GameError("Sıkıştır taktiğinde hedef devlet yazılmalıdır.");
    const target = tactic === "SQUEEZE" ? await gameService.countryByName(interaction.guildId, targetName) : null;
    if (tactic === "SQUEEZE" && !target) throw new GameError("Sıkıştırma hedefi bulunamadı.");
    payload = { tactic, targetCountryId: target?.id ?? null };
  } else if (type === "CARAVAN") {
    const route = parseCaravanRoute(interaction.fields.getTextInputValue("route"));
    if (!route) throw new GameError("Kervan rotası `Güvenli`, `Dengeli` veya `Tehlikeli` olmalıdır.");
    payload = { route };
  } else if (type === "KINGS_BET") {
    const decision = parseKingsDecision(interaction.fields.getTextInputValue("decision"));
    const prediction = parseKingsDecision(interaction.fields.getTextInputValue("prediction"));
    if (!decision || !prediction) throw new GameError("Karar ve tahmin `İşbirliği` veya `İhanet` olmalıdır.");
    payload = { decision, prediction };
  } else if (type === "DIPLOMACY") {
    const primaryGoalKey = interaction.fields.getStringSelectValues("primary")[0];
    const secondaryGoalKey = interaction.fields.getStringSelectValues("secondary")[0];
    if (!primaryGoalKey || !secondaryGoalKey) throw new GameError("Ana ve ikincil diplomasi hedefleri seçilmelidir.");
    const data = await greatGamesService.dashboard(interaction.guildId);
    const ownEntry = data.entries.find((entry) => entry.game_type === "DIPLOMACY" && entry.country_id === country.id && entry.status === "ACTIVE");
    const allowedGoalKeys = new Set(data.entries.filter((entry) =>
      entry.game_type === "DIPLOMACY" && entry.room_key === ownEntry?.room_key
        && entry.status === "ACTIVE" && entry.country_id !== country.id
    ).flatMap((entry) => [
      diplomacyGoalKey(entry.country_id, "PRIMARY"),
      diplomacyGoalKey(entry.country_id, "SECONDARY")
    ]));
    if (!ownEntry || allowedGoalKeys.size !== 4 || !allowedGoalKeys.has(primaryGoalKey) || !allowedGoalKeys.has(secondaryGoalKey)) {
      throw new GameError("Yalnızca diğer iki devletin ana ve ikincil hedefleri seçilebilir.");
    }
    if (secondaryGoalKey === primaryGoalKey) throw new GameError("Ana ve ikincil sonuç için aynı hedef seçilemez.");
    payload = { primary: primaryGoalKey, secondary: secondaryGoalKey };
  } else throw new GameError("Bu oyun için oyuncu hamlesi bulunmuyor.");
  await greatGamesService.submitAction({ guildId: interaction.guildId, countryId: country.id, gameType: type, actionType: "ROUND", payload });
  const confirmation = type === "KINGS_BET"
    ? `✅ Kralların Bahsi seçimin gizlice kaydedildi.\n**Kararın:** ${kingsDecisionLabel(payload.decision as KingsDecision)}\n**Rakip tahminin:** ${kingsDecisionLabel(payload.prediction as KingsDecision)}`
    : type === "CHARIOT"
      ? `✅ Savaş Arabaları taktiğin gizlice kaydedildi.\n**Taktiğin:** ${CHARIOT_TACTICS[payload.tactic as ChariotTactic].label}${payload.targetCountryId ? "\n**Sıkıştırma hedefin de kaydedildi.**" : ""}`
    : type === "CARAVAN"
      ? `✅ Kervanının ortak rota seçimi gizlice kaydedildi.\n**Rota:** ${CARAVAN_ROUTES[payload.route as CaravanRoute].label}`
    : type === "DIPLOMACY"
      ? `✅ Diplomasi Masası oyun gizlice kaydedildi. Seçtiğin ana ve ikincil hedef yalnızca sonuç çözülünce açıklanacak.`
    : "✅ Büyük Oyun hamlen gizlice kaydedildi.";
  if (interaction.isFromMessage()) {
    await interaction.update(await publicGamePayload(interaction.guildId, type));
    await interaction.followUp({ content: confirmation, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: confirmation, flags: MessageFlags.Ephemeral });
  }
  return true;
}
