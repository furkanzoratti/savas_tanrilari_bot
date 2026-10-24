import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, StringSelectMenuBuilder,
  type AutocompleteInteraction, type ButtonInteraction, type ChatInputCommandInteraction, type StringSelectMenuInteraction
} from "discord.js";
import { GOVERNOR_FOCUSES, governorAdministration, governorModifiers, type GovernorFocus } from "../domain/governorship.js";
import { characterService } from "../services/character-service.js";
import { gameService, GameError } from "../services/game-service.js";
import { governorshipService, type GovernorshipView } from "../services/governorship-service.js";
import { assertCountryAccess, isGameMaster, resolveCountry } from "./auth.js";

type GovernorshipInteraction = ButtonInteraction | StringSelectMenuInteraction;
type PanelView = "DASHBOARD" | "APPOINT" | "MANAGE";

interface GovernorshipPanelState {
  token: string;
  guildId: string;
  userId: string;
  countryId: string;
  countryName: string;
  view: PanelView;
  settlementId: string | null;
  characterId: string | null;
  governorshipId: string | null;
  focus: GovernorFocus;
  expiresAt: number;
}

const panelStates = new Map<string, GovernorshipPanelState>();
const PANEL_TTL_MS = 15 * 60_000;

function sameName(first: string, second: string): boolean {
  return first.trim().toLocaleLowerCase("tr-TR") === second.trim().toLocaleLowerCase("tr-TR");
}

function panelState(token: string, interaction: GovernorshipInteraction): GovernorshipPanelState {
  const state = panelStates.get(token);
  if (!state || state.expiresAt < Date.now()) {
    panelStates.delete(token);
    throw new GameError("Bu valilik panelinin süresi doldu. /valilik listele komutuyla yeniden açın.");
  }
  if (state.userId !== interaction.user.id || state.guildId !== interaction.guildId) {
    throw new GameError("Bu valilik panelini yalnızca açan oyuncu kullanabilir.");
  }
  state.expiresAt = Date.now() + PANEL_TTL_MS;
  return state;
}

function focusDescription(focus: GovernorFocus): string {
  switch (focus) {
    case "REVENUE": return "Yerel geliri artırır; huzursuzluk her tur bir miktar yükselebilir.";
    case "PUBLIC_ORDER": return "Gelirden feragat ederek isyan ilerlemesini her tur düşürür.";
    case "RECONSTRUCTION": return "Refahı artırır ve yerleşkedeki bina maliyetlerini düşürür.";
  }
}

function focusEffect(focus: GovernorFocus, skill: number, specializationLevel: number): string {
  const administration = governorAdministration(skill, specializationLevel);
  const modifiers = governorModifiers(focus, administration);
  if (focus === "REVENUE") return `Gelir **+%${Math.round((modifiers.incomeMultiplier - 1) * 100)}** • İsyan ilerlemesi turda **+${modifiers.rebellionDelta}**`;
  if (focus === "PUBLIC_ORDER") return `Gelir **-%${Math.round((1 - modifiers.incomeMultiplier) * 100)}** • İsyan ilerlemesi turda **${modifiers.rebellionDelta}**`;
  return `Refah turda **+${modifiers.prosperityDelta}** • Bina maliyeti **-%${Math.round((1 - modifiers.buildingCostMultiplier) * 100)}**`;
}

function governorshipCard(item: GovernorshipView): string {
  const specializationLevel = item.specialization === "PROVINCIAL_GOVERNOR" ? Number(item.specialization_level) : 0;
  return [
    `### 🏛️ ${item.settlement_name}`,
    `👤 **${item.character_name}** • Yetenek +${item.skill_bonus}${specializationLevel ? ` • Eyalet Valisi Sv${specializationLevel}` : ""}`,
    `🎯 **${GOVERNOR_FOCUSES[item.focus].label}:** ${focusEffect(item.focus, Number(item.skill_bonus), specializationLevel)}`,
    `📅 Atama: Tur ${item.appointed_turn} • En erken ayrılış: Tur ${item.minimum_end_turn}`
  ].join("\n");
}

async function panelData(state: GovernorshipPanelState) {
  const [active, settlements, characters] = await Promise.all([
    governorshipService.list(state.countryId),
    gameService.listSettlements(state.countryId),
    characterService.list(state.countryId)
  ]);
  const governed = new Set(active.map((item) => item.settlement_id));
  const availableSettlements = settlements.filter((item) => !governed.has(item.id));
  const availableDiplomats = characters.filter((item) =>
    item.role === "DIPLOMAT" && item.character_status === "ACTIVE" && item.assignment === "NONE" && !item.kidnapped
  );
  return { active, settlements, characters, availableSettlements, availableDiplomats };
}

async function dashboardPayload(state: GovernorshipPanelState) {
  const data = await panelData(state);
  state.view = "DASHBOARD";
  const embed = new EmbedBuilder().setColor(0x8a5a3b).setTitle(`🏛️ ${state.countryName} • Valilik Divanı`)
    .setDescription(data.active.length
      ? data.active.map(governorshipCard).join("\n\n").slice(0, 4000)
      : "Henüz etkin bir valilik bulunmuyor. Uygun bir diplomat ile yeni valilik kurabilirsiniz.")
    .addFields(
      { name: "Etkin valilik", value: `**${data.active.length}**`, inline: true },
      { name: "Valisiz yerleşke", value: `**${data.availableSettlements.length}**`, inline: true },
      { name: "Uygun diplomat", value: `**${data.availableDiplomats.length}**`, inline: true }
    )
    .setFooter({ text: "Seçimler 15 dakika boyunca yalnızca bu paneli açan oyuncu tarafından kullanılabilir." });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`governor_open_appoint|${state.token}`).setLabel("Yeni Vali Ata").setEmoji("➕").setStyle(ButtonStyle.Success).setDisabled(!data.availableSettlements.length || !data.availableDiplomats.length),
    new ButtonBuilder().setCustomId(`governor_open_manage|${state.token}`).setLabel("Valilikleri Yönet").setEmoji("⚙️").setStyle(ButtonStyle.Primary).setDisabled(!data.active.length),
    new ButtonBuilder().setCustomId(`governor_refresh|${state.token}`).setLabel("Yenile").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function focusMenu(token: string, selected: GovernorFocus) {
  return new StringSelectMenuBuilder().setCustomId(`governor_focus|${token}`).setPlaceholder("Valilik odağını seç")
    .addOptions((Object.entries(GOVERNOR_FOCUSES) as Array<[GovernorFocus, { label: string }]>).map(([value, item]) => ({
      label: item.label,
      description: focusDescription(value).slice(0, 100),
      value,
      default: value === selected
    })));
}

async function appointmentPayload(state: GovernorshipPanelState) {
  const data = await panelData(state);
  state.view = "APPOINT";
  if (!data.availableSettlements.length) throw new GameError("Vali atanabilecek boş bir yerleşke bulunmuyor.");
  if (!data.availableDiplomats.length) throw new GameError("Görevsiz ve kullanılabilir bir diplomat bulunmuyor.");
  if (!data.availableSettlements.some((item) => item.id === state.settlementId)) state.settlementId = data.availableSettlements[0]!.id;
  if (!data.availableDiplomats.some((item) => item.id === state.characterId)) state.characterId = data.availableDiplomats[0]!.id;
  const settlement = data.availableSettlements.find((item) => item.id === state.settlementId)!;
  const diplomat = data.availableDiplomats.find((item) => item.id === state.characterId)!;
  const specializationLevel = diplomat.specialization === "PROVINCIAL_GOVERNOR" ? Number(diplomat.specialization_level) : 0;
  const embed = new EmbedBuilder().setColor(0x3f6650).setTitle("➕ Yeni Valilik Kur")
    .setDescription("Yerleşke, diplomat ve yönetim odağını seç. Atama yapılmadan önce planı aşağıda görebilirsin.")
    .addFields(
      { name: "🏘️ Yerleşke", value: `**${settlement.name}** • ${Number(settlement.population).toLocaleString("tr-TR")} nüfus`, inline: true },
      { name: "👤 Vali adayı", value: `**${diplomat.name}** • Yetenek +${diplomat.skill_bonus}${specializationLevel ? ` • Eyalet Valisi Sv${specializationLevel}` : ""}`, inline: true },
      { name: `🎯 ${GOVERNOR_FOCUSES[state.focus].label}`, value: `${focusDescription(state.focus)}\n${focusEffect(state.focus, Number(diplomat.skill_bonus), specializationLevel)}` }
    );
  const settlementRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`governor_settlement|${state.token}`).setPlaceholder("Yerleşke seç")
      .addOptions(data.availableSettlements.slice(0, 25).map((item) => ({ label: item.name.slice(0, 100), description: `${Number(item.population).toLocaleString("tr-TR")} nüfus`, value: item.id, default: item.id === state.settlementId })))
  );
  const diplomatRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`governor_character|${state.token}`).setPlaceholder("Diplomat seç")
      .addOptions(data.availableDiplomats.slice(0, 25).map((item) => ({ label: item.name.slice(0, 100), description: `Yetenek +${item.skill_bonus}${item.specialization === "PROVINCIAL_GOVERNOR" ? ` • Eyalet Valisi Sv${item.specialization_level}` : ""}`.slice(0, 100), value: item.id, default: item.id === state.characterId })))
  );
  const focusRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(focusMenu(state.token, state.focus));
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`governor_appoint|${state.token}`).setLabel("Atamayı Onayla").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`governor_back|${state.token}`).setLabel("Divana Dön").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [settlementRow, diplomatRow, focusRow, buttons] };
}

async function managementPayload(state: GovernorshipPanelState) {
  const data = await panelData(state);
  state.view = "MANAGE";
  if (!data.active.length) throw new GameError("Yönetilebilecek etkin bir valilik bulunmuyor.");
  if (!data.active.some((item) => item.id === state.governorshipId)) {
    state.governorshipId = data.active[0]!.id;
    state.focus = data.active[0]!.focus;
  }
  const selected = data.active.find((item) => item.id === state.governorshipId)!;
  const specializationLevel = selected.specialization === "PROVINCIAL_GOVERNOR" ? Number(selected.specialization_level) : 0;
  const embed = new EmbedBuilder().setColor(0x536b91).setTitle("⚙️ Valilik Kontrol Masası")
    .setDescription(`**${selected.settlement_name}** valiliğinin odağını değiştirebilir veya valiyi görevden alabilirsin.`)
    .addFields(
      { name: "👤 Görevdeki vali", value: `**${selected.character_name}** • Yetenek +${selected.skill_bonus}${specializationLevel ? ` • Eyalet Valisi Sv${specializationLevel}` : ""}`, inline: true },
      { name: "📅 Görev takvimi", value: `Atama: **Tur ${selected.appointed_turn}**\nEn erken ayrılış: **Tur ${selected.minimum_end_turn}**`, inline: true },
      { name: `🎯 Mevcut odak • ${GOVERNOR_FOCUSES[selected.focus].label}`, value: focusEffect(selected.focus, Number(selected.skill_bonus), specializationLevel) },
      { name: `🧭 Seçilen yeni odak • ${GOVERNOR_FOCUSES[state.focus].label}`, value: `${focusDescription(state.focus)}\n${focusEffect(state.focus, Number(selected.skill_bonus), specializationLevel)}` }
    );
  const governorshipRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`governor_active|${state.token}`).setPlaceholder("Yönetilecek valiliği seç")
      .addOptions(data.active.slice(0, 25).map((item) => ({ label: item.settlement_name.slice(0, 100), description: `${item.character_name} • ${GOVERNOR_FOCUSES[item.focus].label}`.slice(0, 100), value: item.id, default: item.id === selected.id })))
  );
  const focusRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(focusMenu(state.token, state.focus));
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`governor_apply_focus|${state.token}`).setLabel("Odağı Uygula").setEmoji("🎯").setStyle(ButtonStyle.Primary).setDisabled(state.focus === selected.focus),
    new ButtonBuilder().setCustomId(`governor_remove|${state.token}`).setLabel("Görevden Al").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`governor_back|${state.token}`).setLabel("Divana Dön").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [governorshipRow, focusRow, buttons] };
}

async function renderPanel(state: GovernorshipPanelState) {
  if (state.view === "APPOINT") return appointmentPayload(state);
  if (state.view === "MANAGE") return managementPayload(state);
  return dashboardPayload(state);
}

async function openInteractivePanel(interaction: ChatInputCommandInteraction, country: { id: string; name: string }) {
  const state: GovernorshipPanelState = {
    token: randomUUID().replaceAll("-", "").slice(0, 12), guildId: interaction.guildId!, userId: interaction.user.id,
    countryId: country.id, countryName: country.name, view: "DASHBOARD", settlementId: null, characterId: null,
    governorshipId: null, focus: "REVENUE", expiresAt: Date.now() + PANEL_TTL_MS
  };
  panelStates.set(state.token, state);
  await interaction.editReply(await dashboardPayload(state));
}

export async function handleGovernorshipAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (interaction.commandName !== "valilik" || !interaction.guildId) return false;
  const focused = interaction.options.getFocused(true);
  if (!["ulke", "yerleske", "diplomat"].includes(focused.name)) return false;
  const query = String(focused.value).toLocaleLowerCase("tr-TR").trim();
  if (focused.name === "ulke") {
    const countries = isGameMaster(interaction)
      ? await gameService.listCountries(interaction.guildId)
      : [await gameService.countryForUser(interaction.guildId, interaction.user.id)].filter((item) => item !== null);
    await interaction.respond(countries
      .filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 25)
      .map((item) => ({ name: item.name.slice(0, 100), value: item.name })));
    return true;
  }
  const requestedCountry = interaction.options.getString("ulke");
  const country = requestedCountry && isGameMaster(interaction)
    ? await gameService.countryByName(interaction.guildId, requestedCountry)
    : await gameService.countryForUser(interaction.guildId, interaction.user.id);
  if (!country) { await interaction.respond([]); return true; }
  const subcommand = interaction.options.getSubcommand(false) ?? "";
  if (focused.name === "diplomat") {
    const diplomats = (await characterService.list(country.id)).filter((item) =>
      item.role === "DIPLOMAT" && item.character_status === "ACTIVE" && item.assignment === "NONE" && !item.kidnapped
    );
    await interaction.respond(diplomats
      .filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 25)
      .map((item) => ({
        name: `${item.name} • Yetenek +${item.skill_bonus}${item.specialization === "PROVINCIAL_GOVERNOR" ? ` • Eyalet Valisi Sv${item.specialization_level}` : ""}`.slice(0, 100),
        value: item.name
      })));
    return true;
  }
  const active = await governorshipService.list(country.id);
  if (subcommand === "ata") {
    const governed = new Set(active.map((item) => item.settlement_id));
    const settlements = (await gameService.listSettlements(country.id)).filter((item) => !governed.has(item.id));
    await interaction.respond(settlements
      .filter((item) => !query || item.name.toLocaleLowerCase("tr-TR").includes(query))
      .slice(0, 25)
      .map((item) => ({ name: `${item.name} • ${Number(item.population).toLocaleString("tr-TR")} nüfus`.slice(0, 100), value: item.name })));
    return true;
  }
  await interaction.respond(active
    .filter((item) => !query || `${item.settlement_name} ${item.character_name}`.toLocaleLowerCase("tr-TR").includes(query))
    .slice(0, 25)
    .map((item) => ({ name: `${item.settlement_name} • ${item.character_name}`.slice(0, 100), value: item.settlement_name })));
  return true;
}

export async function handleGovernorshipSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("governor_")) return false;
  if (!interaction.guildId) throw new GameError("Bu panel yalnızca sunucuda kullanılabilir.");
  const [action, token] = interaction.customId.split("|");
  if (!token) throw new GameError("Valilik paneli bilgisi eksik.");
  const state = panelState(token, interaction);
  await assertCountryAccess(interaction, state.countryId);
  await interaction.deferUpdate();
  const value = interaction.values[0];
  if (!value) throw new GameError("Bir seçim yapılmalıdır.");
  if (action === "governor_settlement") state.settlementId = value;
  else if (action === "governor_character") state.characterId = value;
  else if (action === "governor_focus") state.focus = value as GovernorFocus;
  else if (action === "governor_active") {
    state.governorshipId = value;
    const selected = (await governorshipService.list(state.countryId)).find((item) => item.id === value);
    if (!selected) throw new GameError("Seçilen valilik artık etkin değil.");
    state.focus = selected.focus;
  } else throw new GameError("Bu valilik seçimi artık geçerli değil.");
  await interaction.editReply(await renderPanel(state));
  return true;
}

export async function handleGovernorshipButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("governor_")) return false;
  if (!interaction.guildId) throw new GameError("Bu panel yalnızca sunucuda kullanılabilir.");
  const [action, token] = interaction.customId.split("|");
  if (!token) throw new GameError("Valilik paneli bilgisi eksik.");
  const state = panelState(token, interaction);
  await assertCountryAccess(interaction, state.countryId);
  await interaction.deferUpdate();
  if (action === "governor_open_appoint") {
    state.view = "APPOINT"; state.settlementId = null; state.characterId = null; state.focus = "REVENUE";
  } else if (action === "governor_open_manage") {
    state.view = "MANAGE"; state.governorshipId = null;
  } else if (action === "governor_back" || action === "governor_refresh") {
    state.view = "DASHBOARD";
  } else if (action === "governor_appoint") {
    if (!state.settlementId || !state.characterId) throw new GameError("Yerleşke ve diplomat seçilmelidir.");
    await governorshipService.appoint({ guildId: state.guildId, actorId: interaction.user.id, countryId: state.countryId, settlementId: state.settlementId, characterId: state.characterId, focus: state.focus });
    state.view = "DASHBOARD"; state.settlementId = null; state.characterId = null;
  } else if (action === "governor_apply_focus") {
    if (!state.governorshipId) throw new GameError("Bir valilik seçilmelidir.");
    await governorshipService.changeFocus({ guildId: state.guildId, actorId: interaction.user.id, countryId: state.countryId, governorshipId: state.governorshipId, focus: state.focus });
  } else if (action === "governor_remove") {
    if (!state.governorshipId) throw new GameError("Bir valilik seçilmelidir.");
    await governorshipService.remove({ guildId: state.guildId, actorId: interaction.user.id, countryId: state.countryId, governorshipId: state.governorshipId });
    state.view = "DASHBOARD"; state.governorshipId = null;
  } else throw new GameError("Bu valilik işlemi artık geçerli değil.");
  await interaction.editReply(await renderPanel(state));
  return true;
}

export async function handleGovernorshipCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName !== "valilik") return false;
  if (!interaction.guildId) throw new GameError("Bu komut yalnızca sunucuda kullanılabilir.");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const country = await resolveCountry(interaction, interaction.options.getString("ulke"));
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "listele") {
    await openInteractivePanel(interaction, country);
    return true;
  }
  const active = await governorshipService.list(country.id);
  const settlementName = interaction.options.getString("yerleske", true);
  const settlements = await gameService.listSettlements(country.id);
  const settlement = settlements.find((item) => sameName(item.name, settlementName));
  if (!settlement) throw new GameError("Bu devlete ait belirtilen yerleşke bulunamadı.");
  if (subcommand === "ata") {
    const diplomatName = interaction.options.getString("diplomat", true);
    const diplomat = (await characterService.list(country.id)).find((item) => item.role === "DIPLOMAT" && sameName(item.name, diplomatName));
    if (!diplomat) throw new GameError("Bu devlete ait belirtilen diplomat bulunamadı.");
    const result = await governorshipService.appoint({
      guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, settlementId: settlement.id, characterId: diplomat.id,
      focus: interaction.options.getString("odak", true) as GovernorFocus
    });
    await interaction.editReply(`✅ **${result.character_name}**, **${result.settlement_name}** yerleşkesine **${GOVERNOR_FOCUSES[result.focus].label}** odağıyla vali atandı.`);
    return true;
  }
  const governorship = active.find((item) => item.settlement_id === settlement.id);
  if (!governorship) throw new GameError("Bu yerleşkede etkin valilik bulunmuyor.");
  if (subcommand === "odak-degistir") {
    const result = await governorshipService.changeFocus({
      guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, governorshipId: governorship.id,
      focus: interaction.options.getString("odak", true) as GovernorFocus
    });
    await interaction.editReply(`✅ **${result.settlement_name}** valiliğinin odağı **${GOVERNOR_FOCUSES[result.focus].label}** olarak değiştirildi.`);
    return true;
  }
  await governorshipService.remove({ guildId: interaction.guildId, actorId: interaction.user.id, countryId: country.id, governorshipId: governorship.id });
  await interaction.editReply(`✅ **${governorship.character_name}**, **${governorship.settlement_name}** valiliğinden ayrıldı.`);
  return true;
}
