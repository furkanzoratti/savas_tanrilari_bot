const state = { session: null, csrf: "", countries: [], catalog: [], characterCatalog: null, religionCatalog: null, battleSimulationCatalog: null, rebellionData: null, guidedOperations: null, previewToken: null, selectedCountry: null, editor: null, pendingPageScrollTop: null, dataCatalog: null, dataTable: null, dataRows: [], dataOffset: 0, dataSearch: "", auditRows: [], auditOffset: 0, auditSearch: "", auditSource: "ALL", auditKind: "ALL", auditFrom: "", auditTo: "", activeRoute: "overview", focusTarget: null, navigationId: 0, navigationController: null };
const page = document.getElementById("page");
const app = document.getElementById("app");
const login = document.getElementById("login");
const modal = document.getElementById("army-modal");
const editorModal = document.getElementById("editor-modal");

const number = (value) => Number(value || 0).toLocaleString("tr-TR");
const money = (value) => `${number(value)} Altın`;
const date = (value) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const storageKey = (name) => `amrp-gm:${name}`;
const readStoredList = (name) => {
  try { const value = JSON.parse(localStorage.getItem(storageKey(name)) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
};
const writeStoredList = (name, value) => localStorage.setItem(storageKey(name), JSON.stringify(value.slice(0, 12)));
const searchTypeLabels = { COUNTRY: "Devlet", SETTLEMENT: "Yerleşke", ARMY: "Ordu", FLEET: "Filo", CHARACTER: "Karakter", FLEET_REPAIR: "Filo tamiri", VASSALAGE: "Vassallık" };
const searchTypeRoutes = { COUNTRY: "countries", SETTLEMENT: "settlements", ARMY: "armies", FLEET: "armies", CHARACTER: "characters", FLEET_REPAIR: "data-control", VASSALAGE: "data-control" };
const normalizeWorkspaceRecord = (row) => ({ type: row.type, id: row.id, label: row.label, detail: row.detail || "" });
function recordRecent(row) {
  const record = normalizeWorkspaceRecord(row);
  writeStoredList("recent", [record, ...readStoredList("recent").filter((item) => !(item.type === record.type && item.id === record.id))]);
}
function toggleFavorite(row) {
  const record = normalizeWorkspaceRecord(row);
  const favorites = readStoredList("favorites");
  const exists = favorites.some((item) => item.type === record.type && item.id === record.id);
  writeStoredList("favorites", exists ? favorites.filter((item) => !(item.type === record.type && item.id === record.id)) : [record, ...favorites]);
  return !exists;
}
function isFavorite(row) { return readStoredList("favorites").some((item) => item.type === row.type && item.id === row.id); }
const religionDistribution = (settlement) => {
  const shares = Array.isArray(settlement.religion_distribution) ? settlement.religion_distribution : [];
  if (!shares.length) return `${escapeHtml(settlement.religion_label || settlement.religion_key || "—")} · %${number(settlement.religion_adherence_percent)}`;
  return shares.flatMap((share, index) => [
    `${index === 0 ? "<strong>Ana din:</strong> " : "Din: "}${escapeHtml(share.religionLabel || share.religionKey)} · %${number(share.primaryPercent)}`,
    `<small>${index === 0 ? "İkinci mezhep" : "Mezhep"}: ${escapeHtml(share.secondaryLabel || "—")} · %${number(share.secondaryPercent)}</small>`
  ]).join("");
};
const assignmentLabels = {
  NONE: "Görevsiz", CURIA: "Curia görevi", AGORA: "Agora / Forum görevi", ARMY: "Ordu komutanı",
  FLEET: "Filo amirali", ESPIONAGE: "Casusluk görevi", ESPIONAGE_RETURNING: "Casusluktan dönüyor",
  CAPTURED: "Tutsak", COUNTERINTELLIGENCE_TRAVELING_COUNTRY: "Ülke karşı casusluğuna gidiyor",
  COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT: "Yerleşke karşı casusluğuna gidiyor",
  COUNTERINTELLIGENCE_COUNTRY: "Ülke karşı casusluğu", COUNTERINTELLIGENCE_SETTLEMENT: "Yerleşke karşı casusluğu",
  PERSONAL_GUARD: "Kişisel koruma", ASSIMILATION: "Asimilasyon görevi",
  MERCHANT_LOCAL_TRAVELING: "Yerel ticarete gidiyor", MERCHANT_LOCAL: "Yerel ticaret",
  MERCHANT_FOREIGN_PENDING: "Yabancı ticaret onayı bekliyor", MERCHANT_FOREIGN_TRAVELING: "Yabancı ticarete gidiyor",
  MERCHANT_FOREIGN: "Yabancı ticaret", MERCHANT_PURCHASE_TRAVELING: "Satın alma görevine gidiyor",
  MERCHANT_PURCHASE: "Satın alma görevi", MERCHANT_BLACK_MARKET_TRAVELING: "Karaborsaya gidiyor",
  MERCHANT_BLACK_MARKET: "Karaborsa görevi", DIPLOMAT_TRAVELING: "Diplomatik göreve gidiyor",
  DIPLOMAT_DEFENSE: "Diplomatik savunma", DIPLOMAT_RECONCILIATION: "Halkla uzlaşma",
  DIPLOMAT_CULTURE: "Kültür değiştirme", DIPLOMAT_VASSALIZE: "Diplomatik vassallaştırma",
  DIPLOMAT_INTEGRATE: "Vassal entegrasyonu", MISSIONARY_TRAVELING: "Din değiştirme görevine gidiyor",
  MISSIONARY_CONVERSION: "Din değiştirme"
};
const assignmentLabel = (value) => assignmentLabels[value] || String(value || "Görevsiz").replaceAll("_", " ");
const operationLabels = {
  LOCAL_TRADE: "Yerel ticaret", FOREIGN_CONCESSION: "Yabancı ticaret imtiyazı", PURCHASE_AGENT: "Satın alma görevlisi",
  BLACK_MARKET: "Karaborsa faaliyeti", RECONCILIATION: "Halkla uzlaşma", CULTURE_CHANGE: "Kültür değiştirme",
  VASSALIZE: "Diplomatik vassallaştırma", VASSAL_INTEGRATION: "Vassal entegrasyonu",
  ECONOMIC: "Ekonomik casusluk", MILITARY: "Askerî casusluk", PUBLIC: "Kamu casusluğu",
  NAVAL: "Deniz casusluğu", CONSTRUCTION: "İnşaat casusluğu", DISCREDIT: "İtibarsızlaştırma",
  KIDNAP: "Kaçırma", ASSASSINATE: "Suikast", CHARACTER_KIDNAP: "Karakter kaçırma", NOBLE_KIDNAP: "Soylu kaçırma",
  CHARACTER_ASSASSINATE: "Karakter suikastı", NOBLE_ASSASSINATE: "Soylu suikastı",
  SUPPLY_COLLAPSE: "İkmal çökertme", DESERTION: "Firar kışkırtma",
  RELIGIOUS_CONVERSION: "Din değiştirme"
};
const operationStatusLabels = {
  PENDING_ACCEPTANCE: "Onay bekliyor", TRAVELING: "İntikal ediyor", ACTIVE: "Aktif",
  CONTROLLED: "Denetimli", PAUSED: "Beklemede"
};
const roleLabels = { COMMANDER: "Komutan", DIPLOMAT: "Diplomat", MERCHANT: "Tüccar", SPY: "Casus", MISSIONARY: "Misyoner" };
const characterStatusLabels = { ACTIVE: "Aktif", DEAD: "Ölü", DISMISSED: "Görevden alınmış" };
const dynastyGenderLabels = { MALE: "Erkek", FEMALE: "Kadın" };
const dynastyHealthLabels = { HEALTHY: "Sağlıklı", SICK: "Hasta" };
const dynastyEventLabels = {
  DYNASTY_CREATED: "Hanedan oluşturuldu", DYNASTY_UPDATED: "Hanedan bilgileri güncellendi",
  MEMBER_ADDED: "Hanedan üyesi eklendi", MEMBER_UPDATED: "Hanedan üyesi güncellendi",
  BIRTH: "Doğum", BIRTH_AWAITING_NAME: "Doğum gerçekleşti, isim bekleniyor",
  BIRTH_ATTEMPT_FAILED: "Doğum denemesi başarısız", MATERNAL_ILLNESS: "Doğum sonrası hastalık",
  RECOVERY: "Hastalıktan iyileşme", DEATH: "Ölüm", DEATH_SAVE_FAILED: "Ölüm zarı başarısız",
  SUCCESSION: "Taht değişimi", HEIR_DESIGNATED: "Yeni varis", MONARCH_DESIGNATED: "Yeni hükümdar",
  SUCCESSION_CRISIS: "Veraset krizi", MARRIAGE: "Hanedan evliliği"
};
const countryStatusLabels = { ACTIVE: "Aktif", "YOK_EDİLDİ": "Yok edilmiş" };
const mobilizationLabels = { PEACE: "Barış", PARTIAL: "Kısmi seferberlik", GENERAL: "Genel seferberlik" };
const turnPhaseLabels = { OPEN: "Açık", CLOSED: "Kapalı", RESOLVING: "Çözümleniyor" };
const terrainLabels = {
  OPEN_PLAIN: "Açık arazi", DESERT: "Çöl", FOREST: "Orman", MARSH: "Bataklık", MOUNTAIN: "Dağlık",
  MOUNTAIN_PASS: "Dağ geçidi", RIVER_CROSSING: "Nehir geçişi", SIEGE: "Kuşatma", NAVAL: "Deniz"
};
const battleStatusLabels = {
  DRAFT: "Taslak", WAITING_FIRST_ROLL: "İlk zar bekleniyor", WAITING_SECOND_ROLL: "İkinci zar bekleniyor",
  READY_TO_RESOLVE: "Çözümleme hazır", FINISHED: "Tamamlandı", CANCELLED: "İptal edildi"
};
const aiPlanStatusLabels = {
  DRAFT: "İnceleme bekliyor", APPROVED: "Manuel uygulamaya uygun", REJECTED: "Reddedildi",
  SEALED: "Mühürlendi", VALIDATED: "Doğrulandı", EXECUTED: "Uygulandı", EXPIRED: "Süresi doldu"
};
const aiOrderCategoryLabels = { ECONOMY: "Ekonomi", MILITARY: "Kara ordusu", NAVAL: "Donanma", DIPLOMACY: "Diplomasi", CHARACTER: "Karakter" };
const aiOrderKindLabels = {
  HOLD_RESERVE: "Rezervi koru", CONSTRUCT: "Bina inşa et", RECRUIT: "Asker al", BUILD_SHIP: "Gemi üret",
  TRANSFER_TREASURY: "Hazine aktar", HIRE_MERCENARY: "Paralı asker kirala", REPAIR_FLEET: "Filoyu onar",
  DEFEND: "Savun", REINFORCE: "Takviye et", BESIEGE: "Kuşatma başlat", BLOCKADE: "Abluka kur", RAID: "Yağma yap",
  ASSIGN_CHARACTER: "Karakter görevlendir", PROPOSE_TRADE: "Ticaret öner", PROPOSE_ALLIANCE: "İttifak öner",
  PROPOSE_PACT: "Pakt öner", PROPOSE_PEACE: "Barış öner", DECLARE_WAR: "Savaş ilanı öner", NO_ACTION: "Hamle yapma"
};
const aiBattlePostureLabels = { AGGRESSIVE: "Saldırgan", BALANCED: "Dengeli", CAUTIOUS: "Temkinli", WITHDRAW: "Geri çekil" };
const aiNavalOrderLabels = { BALANCED: "Dengeli", RAM: "Mahmuz hücumu", DEFENSIVE: "Savunma düzeni", FLANK: "Kanat manevrası", RETREAT: "Geri çekil", CONTROLLED_RETREAT: "Kontrollü geri çekil" };
const siegePhaseLabels = { BOMBARDMENT: "Bombardıman", ASSAULT: "Hücum" };
const rebellionFactionLabels = { POPULAR: "Halk Ayaklanması", SEPARATIST: "Bağımsızlık Yanlıları", RELIGIOUS: "Dinî İsyancılar", SLAVE: "Köle İsyanı" };
const rebellionFactionStatusLabels = { ORGANIZING: "Örgütleniyor", ACTIVE: "Ayaklanma", OCCUPYING: "İşgal ediyor", SUPPRESSED: "Bastırıldı", ENFORCED: "Taleplerini kabul ettirdi" };
const rebelSiegeAssetKeys = ["ladder_group","ram","mantlet","ballista","catapult","siege_tower"];
const rebellionOutcomeLabels = { OUTBREAK: "İsyan çıktı", IMMUNE: "Koruma altında", ESCALATED: "Gerilim arttı", CALMED: "Gerilim azaldı", UNCHANGED: "Değişmedi" };
const romanBlocLabels = { CENTRIST: "Merkez", OPTIMATES: "Optimates", POPULARES: "Populares", EQUITES: "Equites", MILITARISTS: "Askerî hizip", TRADITIONALISTS: "Gelenekçiler" };
const romanPositionLabels = { HEAD: "Aile reisi", SPOUSE: "Eş", CHILD: "Çocuk", PARENT: "Ebeveyn", HEAD_SIBLING: "Aile reisinin kardeşi", SPOUSE_SIBLING: "Eşin kardeşi", HOUSEHOLD: "Hane mensubu" };
const romanFamilyColorKeys = {
  "scipio ailesi": "scipio", "magnus ailesi": "magnus", "cato ailesi": "cato", "nero ailesi": "nero",
  "julius ailesi": "julius", "aemilius ailesi": "aemilius", "fabius ailesi": "fabius", "valerius ailesi": "valerius",
  "licinius ailesi": "licinius", "junius ailesi": "junius", "servilius ailesi": "servilius", "caecilius ailesi": "caecilius"
};
const romanFamilyColorKey = (name, index = 0) => romanFamilyColorKeys[String(name || "").toLocaleLowerCase("tr-TR")] || `fallback-${index % 8}`;
const roleLabel = (row) => row.is_admiral ? "Amiral" : row.is_marshal ? "Mareşal" : (roleLabels[row.role] || row.role);
const characterStatusLabel = (value) => characterStatusLabels[value] || value;
const developmentLabel = (value) => {
  if (!value) return "—";
  const catalog = state.characterCatalog;
  const all = [...(catalog?.specializations || []), ...(catalog?.commanderDoctrines || []), ...(catalog?.admiralSpecializations || []), ...(catalog?.admiralDoctrines || [])];
  return all.find((item) => item.value === value)?.label || String(value).replaceAll("_", " ");
};

const inflightGets = new Map();
function api(path, options = {}) {
  const method = options.method || "GET";
  const execute = async () => {
    const headers = { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) };
    if (method !== "GET") headers["x-csrf-token"] = state.csrf;
    const controller = method === "GET" ? new AbortController() : null;
    const abortFromCaller = () => controller?.abort();
    if (controller && options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", abortFromCaller, { once: true });
    }
    const timeout = controller ? setTimeout(() => controller.abort(), 16_000) : null;
    try {
      const response = await fetch(path, { ...options, method, headers, signal: controller?.signal || options.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const suffix = payload.requestId ? ` · İşlem ${String(payload.requestId).slice(0, 8)}` : "";
        const error = new Error(`${payload.message || payload.error || "İşlem başarısız."}${suffix}`);
        error.status = response.status; error.requestId = payload.requestId || response.headers.get("x-request-id");
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError" && options.signal?.aborted) throw error;
      if (error?.name === "AbortError") throw new Error("Panel verisi 16 saniye içinde yüklenemedi. Bağlantıyı kontrol edip yeniden deneyin.");
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener("abort", abortFromCaller);
    }
  };
  if (method !== "GET") return execute();
  if (options.signal) return execute();
  if (inflightGets.has(path)) return inflightGets.get(path);
  const pending = execute().finally(() => inflightGets.delete(path));
  inflightGets.set(path, pending);
  return pending;
}

function toast(message, kind = "success") {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.className = `toast ${kind}`;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 4500);
}

const routeTitles = {
  overview: "Genel Bakış", workspace: "Çalışma Alanım", countries: "Devletler", settlements: "Yerleşkeler", armies: "Ordular & Filolar",
  characters: "Karakterler", dynasties: "Hanedanlar", "noble-traits": "Soylu Traitleri", "roman-politics": "Roma Siyaseti",
  "steppe-politics": "Bozkır Kurultayı", "diplomacy-control": "Diplomasi & Ticaret", assignments: "Görevler", "espionage-publications": "Olay Yayınları", "gm-operations": "Rehberli İşlemler", "bulk-operations": "Toplu İşlemler", "economy-control": "Ekonomi & Üretim", "great-projects": "Büyük Projeler", "npc-purchases": "NPC Alımları", battles: "Savaşlar", "battle-simulator": "Savaş Simülasyonu",
  rebellions: "İsyanlar", reports: "Raporlar", health: "Oyun Sağlığı", "data-control": "Tam Yetki", audit: "İşlem Geçmişi"
};
function loading() { page.innerHTML = '<div class="loading-shell"><div class="skeleton skeleton-title"></div><div class="loading-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><div class="skeleton skeleton-content"></div></div>'; }
function setActiveRoute(route) {
  state.activeRoute = route;
  document.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
  const title = routeTitles[route] || "GM Operasyon Masası";
  const activeTitle = document.getElementById("active-page-title");
  if (activeTitle) activeTitle.textContent = title;
  document.title = `${title} · AMRP GM`;
}

function revealFocusedRecord() {
  if (!state.focusTarget) return;
  const target = document.querySelector(`[data-record-type="${CSS.escape(state.focusTarget.type)}"][data-record-id="${CSS.escape(state.focusTarget.id)}"]`);
  if (!target) return;
  target.classList.add("record-focus");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => target.classList.remove("record-focus"), 3200);
  state.focusTarget = null;
}

async function openWorkspaceRecord(row) {
  if (!row?.type || !row?.id) return;
  recordRecent(row);
  if (row.type === "COUNTRY") return countryDetail(row.id);
  if (row.type === "SETTLEMENT") return settlementDetail(row.id);
  if (row.type === "FLEET_REPAIR") { state.dataTable = "fleet_repair_groups"; state.dataSearch = row.label || ""; state.dataOffset = 0; }
  if (row.type === "VASSALAGE") { state.dataTable = "country_vassalages"; state.dataSearch = ""; state.dataOffset = 0; }
  state.focusTarget = { type: row.type, id: row.id };
  return navigate(searchTypeRoutes[row.type] || "overview");
}

const humanKey = (value) => String(value || "—").replaceAll("_", " ").toLocaleLowerCase("tr-TR").replace(/(^|\s)\S/gu, (letter) => letter.toLocaleUpperCase("tr-TR"));
const signedMoney = (value) => `${Number(value) > 0 ? "+" : ""}${money(value)}`;
const rowsOrEmpty = (items, render, empty) => Array.isArray(items) && items.length
  ? items.map(render).join("")
  : `<div class="compact-empty muted">${empty}</div>`;

function countryRelationsPanel(data) {
  const diplomacy = data.diplomacy || {};
  const alliances = diplomacy.alliances || [];
  const vassalages = diplomacy.vassalages || [];
  const wars = diplomacy.wars || [];
  const pacts = diplomacy.pacts || [];
  const trades = diplomacy.trades || [];
  const relationRows = (items, render, empty) => items.length ? items.map(render).join("") : `<div class="compact-empty muted">${empty}</div>`;
  return `<div class="section-title"><h2>Diplomasi ve ilişkiler</h2><span>${number(alliances.length + vassalages.length + wars.length + pacts.length + trades.length)} bağlantı</span></div><section class="relation-grid"><article class="card"><div class="card-head"><div><h3>Savaşlar</h3><p>Aktif ve geçmiş devlet savaşları</p></div><span class="pill ${wars.some((row) => row.status === "ACTIVE") ? "danger" : "neutral"}">${number(wars.filter((row) => row.status === "ACTIVE").length)} aktif</span></div>${relationRows(wars.slice(0, 10), (row) => `<button class="relation-row" data-route-action="battles"><span><strong>${escapeHtml(row.opponent_name)}</strong><small>${row.war_role === "ATTACKER" ? "Saldıran taraf" : "Savunan taraf"} · Tur ${number(row.started_turn)} · ${escapeHtml(row.war_goal || row.reason)}</small></span><em>${row.status === "ACTIVE" ? "Sürüyor" : `Bitti · Tur ${number(row.ended_turn)}`}</em></button>`, "Savaş kaydı bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h3>İttifak ve vassallık</h3><p>Devletin siyasi bağlantıları</p></div></div>${relationRows(alliances.filter((row) => row.status === "ACTIVE"), (row) => `<button class="relation-row" data-related-country="${row.partner_id}"><span><strong>${escapeHtml(row.partner_name)}</strong><small>İttifak</small></span><em>Aktif</em></button>`, "Aktif ittifak bulunmuyor.")}${relationRows(vassalages.filter((row) => row.status === "ACTIVE"), (row) => `<button class="relation-row" data-related-country="${row.partner_id}"><span><strong>${escapeHtml(row.partner_name)}</strong><small>${row.relation_role === "VASSAL" ? "Bağlı vassal" : "Hâkim devlet"} · Tur ${number(row.started_turn)}</small></span><em>Aktif</em></button>`, "Aktif vassallık bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h3>Paktlar ve ticaret</h3><p>Kurumsal ve ekonomik ilişkiler</p></div></div>${relationRows(pacts, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.purpose)}</small></span><em>Pakt</em></div>`, "Pakt üyeliği bulunmuyor.")}${relationRows(trades.filter((row) => row.status === "ACTIVE"), (row) => `<button class="relation-row" data-related-country="${row.partner_id}"><span><strong>${escapeHtml(row.partner_name)}</strong><small>${row.route === "SEA" ? "Deniz" : "Kara"} ticareti · ${escapeHtml(row.proposer_settlement_name)} → ${escapeHtml(row.receiver_settlement_name || "Bekliyor")}</small></span><em>${money(row.income_per_country)}</em></button>`, "Aktif ticaret anlaşması bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h3>Son mali hareketler</h3><p>En yeni 30 hazine kaydı</p></div></div>${relationRows((data.transactions || []).slice(0, 10), (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.description)}</strong><small>Tur ${number(row.turn)}${row.settlement_name ? ` · ${escapeHtml(row.settlement_name)}` : ""}</small></span><em class="${Number(row.amount) < 0 ? "danger-text" : ""}">${signedMoney(row.amount)}</em></div>`, "Mali hareket bulunmuyor.")}</article></section>`;
}

function workspaceListMarkup() {
  const favorites = readStoredList("favorites").slice(0, 4);
  const recent = readStoredList("recent").slice(0, 4);
  const group = (title, items, source) => `<div class="workspace-group"><div class="section-head"><strong>${title}</strong><span>${items.length}</span></div>${items.length ? items.map((item, index) => `<button class="workspace-link" data-workspace-source="${source}" data-workspace-index="${index}"><span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.detail || searchTypeLabels[item.type] || item.type)}</small></span><em>${escapeHtml(searchTypeLabels[item.type] || item.type)}</em></button>`).join("") : `<p class="workspace-empty">${source === "favorites" ? "Arama sonuçlarındaki yıldızla kayıt ekleyebilirsin." : "Açtığın kayıtlar burada görünür."}</p>`}</div>`;
  return `<div class="workspace-shortcuts">${group("Favoriler", favorites, "favorites")}${group("Son açılanlar", recent, "recent")}</div>`;
}

function saveNamedView(route, label, params) {
  const view = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, route, label, params, createdAt: new Date().toISOString() };
  writeStoredList("saved-views", [view, ...readStoredList("saved-views")]);
  return view;
}

function openSaveView(route, params, suggestedLabel) {
  openEditor("Görünümü kaydet", routeTitles[route] || "GM görünümü", `<div class="guided-form-note">Mevcut tablo ve filtre ayarları bu tarayıcıdaki kişisel GM çalışma alanına kaydedilir.</div><label>Görünüm adı<input id="saved-view-name" minlength="2" maxlength="80" value="${escapeHtml(suggestedLabel)}" required></label>`, async () => {
    const view = saveNamedView(route, document.getElementById("saved-view-name").value.trim(), params);
    closeEditor(); toast(`“${view.label}” görünümü çalışma alanına kaydedildi.`);
  });
  setEditorSaveLabel("Görünümü kaydet");
}

function applySavedView(view) {
  if (view.route === "audit") {
    Object.assign(state, {
      auditSearch: view.params?.search || "", auditSource: view.params?.source || "ALL",
      auditKind: view.params?.kind || "ALL", auditFrom: view.params?.from || "",
      auditTo: view.params?.to || "", auditOffset: 0
    });
  } else if (view.route === "data-control") {
    state.dataTable = view.params?.table || state.dataTable;
    state.dataSearch = view.params?.search || "";
    state.dataOffset = 0;
  }
  return navigate(view.route);
}

async function workspacePage() {
  setActiveRoute("workspace");
  const favorites = readStoredList("favorites");
  const recent = readStoredList("recent");
  const views = readStoredList("saved-views");
  const recordCards = (items, source, empty) => items.length ? items.map((item, index) => `<article class="workspace-record"><div><span>${escapeHtml(searchTypeLabels[item.type] || item.type)}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail || "Oyun kaydı")}</small></div><button class="button compact" data-workspace-source="${source}" data-workspace-index="${index}">Aç</button></article>`).join("") : `<div class="empty">${escapeHtml(empty)}</div>`;
  page.innerHTML = `<div class="page-head workspace-hero"><div><span class="overview-kicker">KİŞİSEL GM ALANI</span><h1>Çalışma Alanım</h1><p>Favori kayıtlarını, son açtığın dosyaları ve kaydettiğin filtreli görünümleri tek yerde tut.</p></div><div class="actions"><button class="button" data-route-action="data-control">Tam Yetki</button><button class="button primary" data-route-action="audit">İşlem Geçmişi</button></div></div><section class="workspace-dashboard"><article class="card workspace-panel"><div class="card-head"><div><h2>Kaydedilmiş görünümler</h2><p>Filtreli çalışma listelerine tek tıkla dön</p></div><span class="pill neutral">${number(views.length)}</span></div><div class="saved-view-list">${views.length ? views.map((view, index) => `<article class="saved-view-card"><div><span>${escapeHtml(routeTitles[view.route] || view.route)}</span><strong>${escapeHtml(view.label)}</strong><small>${date(view.createdAt)}</small></div><div><button class="button compact" data-open-saved-view="${index}">Aç</button><button class="button compact danger" data-delete-saved-view="${index}">Sil</button></div></article>`).join("") : '<div class="empty">İşlem Geçmişi veya Tam Yetki ekranında “Görünümü kaydet” düğmesini kullanabilirsin.</div>'}</div></article><article class="card workspace-panel"><div class="card-head"><div><h2>Favoriler</h2><p>Sık kullandığın oyun kayıtları</p></div><span class="pill neutral">${number(favorites.length)}</span></div><div class="workspace-record-list">${recordCards(favorites, "favorites", "Henüz favori kayıt yok.")}</div></article><article class="card workspace-panel relation-span"><div class="card-head"><div><h2>Son açılanlar</h2><p>En son incelediğin kayıtlar</p></div><button class="button compact" data-clear-recents ${recent.length ? "" : "disabled"}>Geçmişi temizle</button></div><div class="workspace-record-grid">${recordCards(recent, "recent", "Henüz açılmış kayıt yok.")}</div></article></section>`;
  document.querySelectorAll("[data-open-saved-view]").forEach((button) => button.addEventListener("click", () => applySavedView(views[Number(button.dataset.openSavedView)])));
  document.querySelectorAll("[data-delete-saved-view]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.deleteSavedView);
    writeStoredList("saved-views", views.filter((_, itemIndex) => itemIndex !== index));
    toast("Kaydedilmiş görünüm silindi."); workspacePage();
  }));
  document.querySelector("[data-clear-recents]")?.addEventListener("click", () => { writeStoredList("recent", []); toast("Son açılanlar temizlendi."); workspacePage(); });
  bindPageActions();
}

function reportCountryValue(country, key) {
  if (key === "military") return Number(country.field_army || 0) + Number(country.garrison || 0);
  return Number(country[key] || 0);
}

function renderCountryComparison(data) {
  const first = data.countries.find((row) => row.id === document.getElementById("report-country-a")?.value) || data.countries[0];
  const second = data.countries.find((row) => row.id === document.getElementById("report-country-b")?.value) || data.countries[1];
  const target = document.getElementById("country-comparison");
  if (!target) return;
  if (!first || !second) { target.innerHTML = '<div class="empty">Karşılaştırma için en az iki aktif devlet gerekir.</div>'; return; }
  const metrics = [
    { key: "treasury", label: "Hazine", format: money }, { key: "turn_income", label: "Tur geliri", format: money },
    { key: "building_income", label: "Bina geliri", format: money }, { key: "tax_income", label: "Vergi geliri", format: money },
    { key: "land_trade_income", label: "Kara ticareti", format: money },
    { key: "sea_trade_income", label: "Deniz ticareti", format: money },
    { key: "population", label: "Nüfus", format: number }, { key: "military", label: "Kara askeri", format: number },
    { key: "ships", label: "Gemi", format: number }, { key: "settlements", label: "Yerleşke", format: number }
  ];
  target.innerHTML = metrics.map((metric) => {
    const a = reportCountryValue(first, metric.key); const b = reportCountryValue(second, metric.key);
    const max = Math.max(1, a, b); const diff = a - b;
    return `<div class="comparison-row"><span>${escapeHtml(metric.label)}</span><div class="comparison-side"><strong>${escapeHtml(metric.format(a))}</strong><i style="--comparison-width:${Math.round(a / max * 100)}%"></i></div><b class="${diff === 0 ? "" : diff > 0 ? "success-text" : "danger-text"}">${diff > 0 ? "+" : ""}${escapeHtml(metric.format(diff))}</b><div class="comparison-side second"><strong>${escapeHtml(metric.format(b))}</strong><i style="--comparison-width:${Math.round(b / max * 100)}%"></i></div></div>`;
  }).join("");
}

function downloadReportCsv(data) {
  const header = ["Devlet", "Yerleşke", "Nüfus", "Hazine", "Tur Geliri", "Bina Geliri", "Vergi Geliri", "Kara Ticareti", "Deniz Ticareti", "Saha Ordusu", "Garnizon", "Gemi", "Aktif Savaş"];
  const rows = data.countries.map((row) => [row.name, row.settlements, row.population, row.treasury, row.turn_income, row.building_income, row.tax_income, row.land_trade_income, row.sea_trade_income, row.field_army, row.garrison, row.ships, row.active_wars]);
  const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob([[header, ...rows].map((row) => row.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `amrp-devlet-raporu-tur-${data.guild.current_turn}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function reportsPage(signal) {
  setActiveRoute("reports"); loading();
  const data = await api("/api/reports", { signal });
  const totalTreasury = data.countries.reduce((sum, row) => sum + Number(row.treasury || 0), 0);
  const totalPopulation = data.countries.reduce((sum, row) => sum + Number(row.population || 0), 0);
  const totalMilitary = data.countries.reduce((sum, row) => sum + Number(row.field_army || 0) + Number(row.garrison || 0), 0);
  const turns = [];
  for (let turn = Number(data.firstTurn); turn <= Number(data.guild.current_turn); turn += 1) {
    const rows = data.financialHistory.filter((row) => Number(row.turn) === turn);
    turns.push({ turn, income: rows.reduce((sum, row) => sum + Number(row.income || 0), 0), expense: rows.reduce((sum, row) => sum + Number(row.expense || 0), 0), net: rows.reduce((sum, row) => sum + Number(row.net || 0), 0), count: rows.reduce((sum, row) => sum + Number(row.transaction_count || 0), 0) });
  }
  const maxFlow = Math.max(1, ...turns.flatMap((row) => [row.income, row.expense]));
  const options = data.countries.map((row, index) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join("");
  const warnings = loadWarningsMarkup(data.warnings);
  page.innerHTML = `<div class="page-head reports-hero"><div><span class="overview-kicker">OYUN RAPORLAMA MERKEZİ</span><h1>Raporlar & Karşılaştırma</h1><p>Devletlerin güncel gücünü karşılaştır, son sekiz turun mali akışını izle ve veriyi CSV olarak dışa aktar.</p></div><div class="actions"><span class="pill neutral">${date(data.generatedAt)}</span><button class="button primary" data-export-report>CSV dışa aktar</button></div></div><section class="kpi-grid"><div class="card kpi"><span>Aktif devlet</span><strong>${number(data.countries.length)}</strong><small>Karşılaştırılabilir kayıt</small></div><div class="card kpi"><span>Toplam hazine</span><strong>${money(totalTreasury)}</strong><small>Yerel hazineler toplamı</small></div><div class="card kpi"><span>Toplam nüfus</span><strong>${number(totalPopulation)}</strong><small>Özgür + köle nüfus</small></div><div class="card kpi"><span>Kara gücü</span><strong>${number(totalMilitary)}</strong><small>Saha ordusu + garnizon</small></div></section><section class="card comparison-card"><div class="card-head"><div><h2>Devlet karşılaştırması</h2><p>Aynı ölçekte iki devleti yan yana incele</p></div><div class="comparison-selectors"><select id="report-country-a">${options}</select><span>↔</span><select id="report-country-b">${data.countries.map((row, index) => `<option value="${row.id}" ${index === 1 ? "selected" : ""}>${escapeHtml(row.name)}</option>`).join("")}</select></div></div><div id="country-comparison" class="country-comparison"></div></section><section class="reports-grid"><article class="card"><div class="card-head"><div><h2>Son turların mali akışı</h2><p>Gelir, gider ve net işlem hareketi</p></div></div><div class="turn-flow-list">${turns.map((row) => `<div class="turn-flow"><strong>Tur ${number(row.turn)}</strong><div><span class="income" style="--flow-width:${Math.round(row.income / maxFlow * 100)}%">+${money(row.income)}</span><span class="expense" style="--flow-width:${Math.round(row.expense / maxFlow * 100)}%">−${money(row.expense)}</span></div><em class="${row.net < 0 ? "danger-text" : "success-text"}">${signedMoney(row.net)} · ${number(row.count)} işlem</em></div>`).join("")}</div></article><article class="card"><div class="card-head"><div><h2>İşlem türleri</h2><p>Son sekiz turdaki en yoğun mali hareketler</p></div></div>${rowsOrEmpty(data.transactionKinds, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(humanKey(row.kind))}</strong><small>${number(row.count)} işlem</small></span><em class="${Number(row.net) < 0 ? "danger-text" : "success-text"}">${signedMoney(row.net)}</em></div>`, "Mali işlem bulunmuyor.")}</article><article class="card relation-span"><div class="card-head"><div><h2>Yönetim etkinliği</h2><p>Son 14 günün panel ve oyun işlem sayıları</p></div></div><div class="activity-strip">${data.activity.map((row) => `<div><span>${new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit" }).format(new Date(row.day))}</span><strong>${number(row.total)}</strong><small>${number(row.panel)} panel · ${number(row.game)} oyun</small></div>`).join("") || '<div class="empty">Etkinlik kaydı bulunmuyor.</div>'}</div></article></section><div class="section-title"><h2>Tüm devletler</h2><span>Güncel karşılaştırmalı tablo</span></div><section class="card table-wrap"><table><thead><tr><th>Devlet</th><th>Yerleşke</th><th>Nüfus</th><th>Hazine</th><th>Tur geliri</th><th>Saha / Garnizon</th><th>Gemi</th><th>Savaş</th></tr></thead><tbody>${data.countries.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(mobilizationLabels[row.mobilization] || row.mobilization)}</small></td><td>${number(row.settlements)}</td><td>${number(row.population)}</td><td>${money(row.treasury)}</td><td><strong>${money(row.turn_income)}</strong><small>Bina ${money(row.building_income)} · Vergi ${money(row.tax_income)} · Kara ${money(row.land_trade_income)} · Deniz ${money(row.sea_trade_income)}</small></td><td>${number(row.field_army)} / ${number(row.garrison)}</td><td>${number(row.ships)}</td><td>${number(row.active_wars)}</td></tr>`).join("")}</tbody></table></section>`;
  if (warnings) page.querySelector(".page-head")?.insertAdjacentHTML("afterend", warnings);
  document.querySelector("[data-retry-page]")?.addEventListener("click", () => reportsPage().catch(showPageError));
  document.getElementById("report-country-a")?.addEventListener("change", () => renderCountryComparison(data));
  document.getElementById("report-country-b").addEventListener("change", () => renderCountryComparison(data));
  document.querySelector("[data-export-report]").addEventListener("click", () => downloadReportCsv(data));
  renderCountryComparison(data);
}

async function greatProjectsPage(signal) {
  setActiveRoute("great-projects"); loading();
  const data = await api("/api/great-projects", { signal });
  const active = data.projects.filter((row) => row.status === "ACTIVE").length;
  const building = data.projects.filter((row) => row.status === "BUILDING").length;
  const available = data.projects.filter((row) => row.status === "AVAILABLE").length;
  const statusLabel = (value) => value === "ACTIVE" ? "Tamamlandı" : value === "BUILDING" ? "İnşa ediliyor" : "İnşa edilebilir";
  page.innerHTML = `<div class="page-head"><div><span class="overview-kicker">YERLEŞKE MİRASLARI</span><h1>Büyük Projeler</h1><p>Projeler belirli yerleşkelere bağlıdır; tamamlanan etkiler yerleşkenin güncel sahibine ülke genelinde uygulanır.</p></div><span class="pill neutral">Tur ${number(data.turn)}</span></div><section class="kpi-grid"><div class="card kpi"><span>Proje alanı</span><strong>${number(data.projects.length)}</strong><small>Katalog: ${number(data.catalogCount)}</small></div><div class="card kpi"><span>Tamamlandı</span><strong>${number(active)}</strong><small>Etkin bonuslar</small></div><div class="card kpi"><span>İnşaat</span><strong>${number(building)}</strong><small>Tur bekleyen projeler</small></div><div class="card kpi"><span>Uygun alan</span><strong>${number(available)}</strong><small>Henüz başlanmamış</small></div></section><section class="card table-wrap"><table><thead><tr><th>Proje</th><th>Yerleşke / Sahip</th><th>Durum</th><th>Bedel / Süre</th><th>Etkiler</th><th>Yönetim</th></tr></thead><tbody>${data.projects.map((row) => `<tr><td><strong>${escapeHtml(row.projectName)}</strong><small>${escapeHtml(row.projectKey)}</small></td><td><strong>${escapeHtml(row.settlementName)}</strong><small>${escapeHtml(row.countryName)} · Yerel hazine ${money(row.local_treasury)}</small></td><td><span class="pill ${row.status === "ACTIVE" ? "success" : row.status === "BUILDING" ? "warning" : "neutral"}">${statusLabel(row.status)}</span>${row.completionTurn ? `<small>Tur ${number(row.completionTurn)}</small>` : ""}</td><td>${money(row.cost)}<small>${number(row.duration)} tur</small></td><td>${row.effects.map((effect) => `<small>• ${escapeHtml(effect)}</small>`).join("")}</td><td>${row.status === "AVAILABLE" ? `<button class="button compact primary" data-project-action="START" data-settlement-id="${row.id}">Anında etkinleştir</button>` : row.status === "BUILDING" ? `<button class="button compact primary" data-project-action="COMPLETE" data-settlement-id="${row.id}">İnşaatı tamamla</button><button class="button compact danger" data-project-action="RESET" data-settlement-id="${row.id}">Sıfırla</button>` : `<button class="button compact danger" data-project-action="RESET" data-settlement-id="${row.id}">Projeyi kaldır</button>`}</td></tr>`).join("")}</tbody></table></section>`;
  document.querySelectorAll("[data-project-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.projectAction;
    if (action === "RESET" && !confirm("Bu proje kaydı kaldırılacak ve alan yeniden inşa edilebilir olacak. Devam edilsin mi?")) return;
    button.disabled = true;
    try {
      const scroll = window.scrollY;
      const result = await api("/api/great-projects/action", { method: "POST", body: JSON.stringify({ settlementId: button.dataset.settlementId, action }) });
      toast(`${result.projectName} güncellendi.`);
      await greatProjectsPage();
      window.scrollTo({ top: scroll });
    } catch (error) { button.disabled = false; toast(error.message, "error"); }
  }));
}

function simulationUnitOptions(units, selected) {
  return units.map((unit) => `<option value="${unit.key}" ${unit.key === selected ? "selected" : ""}>${escapeHtml(unit.label)} · ${unit.clashDice}d${unit.clashSides} / ${unit.damageDice}d${unit.damageSides}</option>`).join("");
}

function addSimulationUnitRow(side, units, selected, quantity) {
  const container = document.querySelector(`[data-simulation-side="${side}"]`);
  if (!container) return;
  const row = document.createElement("div");
  row.className = "simulation-unit-row";
  row.innerHTML = `<select aria-label="Birlik türü">${simulationUnitOptions(units, selected || units[0]?.key)}</select><input aria-label="Birlik miktarı" type="number" min="1" step="1" value="${Number(quantity || (units === state.battleSimulationCatalog?.navalUnits ? 10 : 1000))}" required><button type="button" class="icon-button" aria-label="Satırı kaldır">×</button>`;
  row.querySelector("button").addEventListener("click", () => {
    if (container.querySelectorAll(".simulation-unit-row").length > 1) row.remove();
    else toast("Her tarafta en az bir birlik satırı bulunmalı.", "error");
  });
  container.append(row);
}

function simulationSideUnits(side) {
  const units = {};
  document.querySelectorAll(`[data-simulation-side="${side}"] .simulation-unit-row`).forEach((row) => {
    const key = row.querySelector("select").value;
    units[key] = (units[key] || 0) + Number(row.querySelector("input").value || 0);
  });
  return units;
}

function simulationLossText(items, field = "lost") {
  if (!items?.length) return "Kayıp yok";
  return items.map((item) => `${escapeHtml(item.label)} ${number(item[field])}`).join(" · ");
}

function renderBattleSimulationResult(result) {
  const target = document.getElementById("battle-simulation-result");
  if (!target) return;
  const isNaval = result.mode === "NAVAL";
  const sideCard = (key) => {
    const side = result.sides[key];
    return `<article class="simulation-result-side ${result.winner === key ? "winner" : ""}"><div class="simulation-result-heading"><div><span>${key} TARAFI</span><h3>${escapeHtml(side.name)}</h3></div>${result.winner === key ? '<span class="pill">Kazanan</span>' : ""}</div><div class="simulation-stat-grid"><div><span>Başlangıç</span><strong>${number(side.initialTotal)}</strong></div><div><span>Kayıp</span><strong class="danger-text">${number(side.lostTotal)}</strong></div><div><span>Kalan</span><strong>${number(side.remainingTotal)}</strong></div>${isNaval ? `<div><span>Aktif / Hasarlı</span><strong>${number(side.activeTotal)} / ${number(side.disabledTotal)}</strong></div><div><span>Filo durumu</span><strong>${escapeHtml(humanKey(side.condition))}</strong></div><div><span>Savaşabilir gövde canı</span><strong>${number(side.operationalHullHp)} / ${number(side.initialHullHp)} HP</strong></div>` : `<div><span>Düzen</span><strong>${escapeHtml(humanKey(side.order))} · ${number(side.pressure)} baskı</strong></div>`}</div><div class="simulation-unit-results">${side.units.map((unit) => `<div><span><strong>${escapeHtml(unit.label)}</strong><small>${number(unit.initial)} başlangıç</small></span><span><b>${number(unit.lost)}</b> kayıp · ${number(unit.remaining)} kalan${isNaval ? ` · ${number(unit.active)} aktif · ${number(unit.disabled)} hasarlı` : ""}</span></div>`).join("")}</div></article>`;
  };
  const roundRows = result.rounds.map((round) => `<details class="simulation-round"><summary><span><b>${number(round.round)}. savaş turu</b><small>${escapeHtml(humanKey(round.tier))}${round.winner ? ` · Tur üstünlüğü ${round.winner}` : " · Dengeli"}</small></span><strong>${number(round.sideA.lost)} / ${number(round.sideB.lost)} kayıp</strong></summary><div class="simulation-round-grid"><div><h4>${escapeHtml(result.sides.A.name)}</h4><p>Çarpışma ${number(round.sideA.clash)} · Hasar ${number(round.sideA.damage)}</p><p>Kalan ${number(round.sideA.remaining)}${isNaval ? ` · ${number(round.sideA.active)} aktif · ${number(round.sideA.disabled)} yeni hasarlı` : ` · ${escapeHtml(humanKey(round.sideA.order))} · ${number(round.sideA.pressure)} baskı`}</p><small>Kayıp: ${simulationLossText(round.sideA.lossesByUnit)}${isNaval && round.sideA.disabledByUnit?.length ? `<br>Devre dışı: ${simulationLossText(round.sideA.disabledByUnit, "disabled")}` : ""}</small></div><div><h4>${escapeHtml(result.sides.B.name)}</h4><p>Çarpışma ${number(round.sideB.clash)} · Hasar ${number(round.sideB.damage)}</p><p>Kalan ${number(round.sideB.remaining)}${isNaval ? ` · ${number(round.sideB.active)} aktif · ${number(round.sideB.disabled)} yeni hasarlı` : ` · ${escapeHtml(humanKey(round.sideB.order))} · ${number(round.sideB.pressure)} baskı`}</p><small>Kayıp: ${simulationLossText(round.sideB.lossesByUnit)}${isNaval && round.sideB.disabledByUnit?.length ? `<br>Devre dışı: ${simulationLossText(round.sideB.disabledByUnit, "disabled")}` : ""}</small></div></div></details>`).join("");
  target.innerHTML = `<section class="simulation-result-head"><div><span class="overview-kicker">SİMÜLASYON SONUCU</span><h2>${result.winnerName ? `${escapeHtml(result.winnerName)} kazandı` : "Savaş berabere sonuçlandı"}</h2><p>${escapeHtml(result.terrainLabel)} · ${number(result.roundCount)} savaş turu${result.reachedRoundLimit ? " · 30 tur güvenlik sınırında puanlandı" : ""}</p></div><button class="button" data-scroll-rounds>Tur dökümüne git</button></section><div class="simulation-result-grid">${sideCard("A")}${sideCard("B")}</div><section class="card simulation-round-list" id="simulation-round-list"><div class="card-head"><div><h3>Tur tur savaş dökümü</h3><p>Her turdaki zar, hasar, kayıp türleri ve kalan kuvvet</p></div><span class="pill neutral">${number(result.roundCount)} tur</span></div>${roundRows}</section>`;
  target.hidden = false;
  target.querySelector("[data-scroll-rounds]")?.addEventListener("click", () => document.getElementById("simulation-round-list")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function battleSimulatorPage(signal) {
  setActiveRoute("battle-simulator"); loading();
  const catalog = state.battleSimulationCatalog || await api("/api/battle-simulation/catalog", { signal });
  state.battleSimulationCatalog = catalog;
  page.innerHTML = `<div class="page-head battle-simulator-hero"><div><span class="overview-kicker">GM SAVAŞ LABORATUVARI</span><h1>Savaş Simülasyonu</h1><p>Canlı oyun verisini değiştirmeden kara veya deniz kuvvetlerini karşılaştır. Birlikleri ve miktarları tamamen sen belirle.</p></div><span class="pill neutral">En fazla ${number(catalog.limits.maxRounds)} savaş turu</span></div><form id="battle-simulation-form"><section class="card simulation-settings"><div><label>Savaş türü<select id="simulation-mode"><option value="LAND">Kara savaşı</option><option value="NAVAL">Deniz savaşı</option></select></label><label id="simulation-terrain-wrap">Arazi<select id="simulation-terrain">${catalog.terrains.map((terrain) => `<option value="${terrain.key}">${escapeHtml(terrain.label)} · Cephe ${number(terrain.frontageA)} / ${number(terrain.frontageB)}</option>`).join("")}</select></label></div><p>Sonuçlar oyunun gerçek çarpışma, hasar, dayanıklılık, düzen baskısı ve gemi gövde kurallarından hesaplanır.</p></section><section class="simulation-side-grid"><article class="card simulation-side-card side-a"><div class="simulation-side-title"><span>A</span><label>Taraf adı<input id="simulation-side-a-name" maxlength="60" value="A Tarafı" required></label></div><div class="section-head"><div><strong>A tarafı birlikleri</strong><span>Aynı türü birden fazla satırda eklersen miktarlar birleşir.</span></div><button type="button" class="button compact" data-add-simulation-unit="A">＋ Birlik</button></div><div class="simulation-unit-list" data-simulation-side="A"></div></article><article class="card simulation-side-card side-b"><div class="simulation-side-title"><span>B</span><label>Taraf adı<input id="simulation-side-b-name" maxlength="60" value="B Tarafı" required></label></div><div class="section-head"><div><strong>B tarafı birlikleri</strong><span>Aynı türü birden fazla satırda eklersen miktarlar birleşir.</span></div><button type="button" class="button compact" data-add-simulation-unit="B">＋ Birlik</button></div><div class="simulation-unit-list" data-simulation-side="B"></div></article></section><div class="simulation-submit"><div><strong>Güvenli deneme alanı</strong><span>Ordular, filolar, gemi canları ve hazineler etkilenmez.</span></div><button class="button primary" type="submit">⚔ Savaşı simüle et</button></div><p id="simulation-error" class="error" hidden></p></form><div id="battle-simulation-result" class="simulation-result" hidden></div>`;
  const refreshRows = () => {
    const mode = document.getElementById("simulation-mode").value;
    const units = mode === "NAVAL" ? catalog.navalUnits : catalog.landUnits;
    document.getElementById("simulation-terrain-wrap").hidden = mode === "NAVAL";
    document.querySelectorAll("[data-simulation-side]").forEach((container) => { container.innerHTML = ""; });
    addSimulationUnitRow("A", units, units[0]?.key, mode === "NAVAL" ? 10 : 1000);
    addSimulationUnitRow("B", units, units[Math.min(1, units.length - 1)]?.key, mode === "NAVAL" ? 10 : 1000);
  };
  refreshRows();
  document.getElementById("simulation-mode").addEventListener("change", refreshRows);
  document.querySelectorAll("[data-add-simulation-unit]").forEach((button) => button.addEventListener("click", () => {
    const units = document.getElementById("simulation-mode").value === "NAVAL" ? catalog.navalUnits : catalog.landUnits;
    addSimulationUnitRow(button.dataset.addSimulationUnit, units, units[0]?.key);
  }));
  document.getElementById("battle-simulation-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    const error = document.getElementById("simulation-error");
    error.hidden = true; submit.disabled = true; submit.textContent = "Hesaplanıyor…";
    try {
      const mode = document.getElementById("simulation-mode").value;
      const result = await api("/api/battle-simulation", { method: "POST", body: JSON.stringify({ mode, terrain: document.getElementById("simulation-terrain").value, sideA: { name: document.getElementById("simulation-side-a-name").value, units: simulationSideUnits("A") }, sideB: { name: document.getElementById("simulation-side-b-name").value, units: simulationSideUnits("B") } }) });
      renderBattleSimulationResult(result);
    } catch (requestError) {
      error.textContent = requestError.message; error.hidden = false;
    } finally {
      submit.disabled = false; submit.textContent = "⚔ Savaşı simüle et";
    }
  });
}

const espionagePublicationExample = {
  yerleske: "Atina", ulke: "Trakya", gorev: "Hazine Çalma", hedef: "Kraliyet hazinesi",
  etki: "2.400 Altın kaybedildi.", tur: "38", tespit: "Olayın ardında dış müdahale olmuş olabileceğine dair işaretler bulundu."
};

function renderPublicationText(value) {
  const rendered = String(value || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_match, key) => espionagePublicationExample[key] ?? `{{${key}}}`);
  return escapeHtml(rendered).replace(/\*\*(.+?)\*\*/gu, "<strong>$1</strong>").replace(/\n/gu, "<br>");
}

function publicationTemplateCard(template) {
  const outcomeLabel = template.outcome === "SUCCESS" ? "Başarılı" : "Başarısız";
  return `<article class="publication-template-card" data-publication-template data-publication-target="${template.targetType}" data-publication-outcome="${template.outcome}">
    <div class="publication-template-image ${template.imageUrl ? "has-image" : "no-image"}">${template.imageUrl ? `<img src="${template.imageUrl}" alt="${escapeHtml(template.targetLabel)} ${outcomeLabel} olay görseli" loading="lazy">` : "<span>Görsel yok</span>"}</div>
    <div class="publication-template-content">
      <div class="publication-template-meta"><span class="pill ${template.outcome === "SUCCESS" ? "" : "neutral"}">${outcomeLabel}</span><span class="pill ${template.enabled ? "neutral" : "danger"}">${template.enabled ? "Yayına açık" : "Kapalı"}</span>${template.customized ? '<span class="customized-mark">Özelleştirilmiş</span>' : ""}</div>
      <small>${escapeHtml(template.targetLabel)}</small><h3>${renderPublicationText(template.titleTemplate)}</h3><p>${renderPublicationText(template.bodyTemplate)}</p>
      <div class="publication-template-actions"><button class="button compact" data-edit-publication="${template.targetType}:${template.outcome}">Metni düzenle</button>${template.customized ? `<button class="button compact" data-reset-publication="${template.targetType}:${template.outcome}">Varsayılana dön</button>` : ""}</div>
    </div>
  </article>`;
}

function publicationEventRow(event) {
  const status = event.status === "PUBLISHED"
    ? { icon: "✓", label: "Yayınlandı", className: "published" }
    : event.status === "UNKNOWN"
      ? { icon: "?", label: "Eski teslim kaydı", className: "unknown" }
    : event.status === "PENDING"
      ? { icon: "…", label: "Bekliyor", className: "pending" }
      : { icon: "✕", label: event.status === "SKIPPED" ? "Yayınlanmadı" : "Yayınlanamadı", className: "failed" };
  const outcome = event.outcome === "SUCCESS" ? "Başarılı" : event.outcome === "FAILURE" ? "Başarısız" : "Ölüm kaydı";
  const reason = event.status === "FAILED" || event.status === "SKIPPED" || event.status === "UNKNOWN"
    ? `<div class="publication-event-error"><strong>Neden:</strong> ${escapeHtml(event.failureReason || "Yayın teslimi tamamlanamadı.")}</div>` : "";
  const detail = [event.subjectName, event.effectText].filter(Boolean).join(" · ");
  return `<article class="publication-event-row" data-publication-event data-turn="${event.turn}" data-source="${event.source}" data-status="${event.status}">
    <span class="publication-event-state ${status.className}" title="${status.label}">${status.icon}</span>
    <div class="publication-event-main"><div><span class="pill neutral">Tur ${number(event.turn)}</span><span class="pill ${event.source === "ESPIONAGE" ? "" : "warning"}">${event.source === "ESPIONAGE" ? "Casusluk" : "Ölüm"}</span><span class="pill neutral">${outcome}</span></div><strong>${escapeHtml(event.typeLabel)}</strong><small>${escapeHtml([event.countryName, event.settlementName].filter(Boolean).join(" · ") || "Konum kaydı yok")}</small>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}${reason}</div>
    <div class="publication-event-delivery"><strong>${status.label}</strong><small>${event.postedAt ? date(event.postedAt) : `${number(event.attempts)} deneme`}</small></div>
  </article>`;
}

function publicationPreviewCard(preview,kind) {
  return `<article class="publication-preview-card"><img src="${preview.imageUrl}" alt="${escapeHtml(preview.label)} görseli" loading="lazy"><div><span class="pill ${kind === "death" ? "warning" : "neutral"}">${kind === "death" ? "Ölüm yayını" : "Casusun akıbeti"}</span><h3>${escapeHtml(preview.title || preview.label)}</h3><strong>${escapeHtml(preview.label)}</strong><p>${escapeHtml(preview.description)}</p></div></article>`;
}

function openPublicationTemplateEditor(template, data) {
  const imageOptions = ['<option value="">Görsel kullanma</option>', ...data.images.map((image) => `<option value="${image.key}" ${selected(image.key, template.imageKey)}>${escapeHtml(image.key)}</option>`)].join("");
  const placeholderButtons = data.placeholders.map((item) => `<button type="button" class="publication-variable" data-insert-publication-variable="${item.key}" title="${escapeHtml(item.label)}">{{${item.key}}}</button>`).join("");
  openEditor(
    `${template.targetLabel} · ${template.outcome === "SUCCESS" ? "Başarılı" : "Başarısız"}`,
    "Oyunculara açık olay metni · saldırgan devlet ve casus bilgisi özellikle kullanılamaz",
    `<div class="publication-editor-grid"><div><label>Başlık<input id="publication-title" maxlength="100" minlength="2" value="${escapeHtml(template.titleTemplate)}" required></label><label>Olay metni<textarea id="publication-body" rows="8" maxlength="1800" minlength="10" required>${escapeHtml(template.bodyTemplate)}</textarea></label><label>Hazır görsel<select id="publication-image">${imageOptions}</select></label><label class="check"><input id="publication-enabled" type="checkbox" ${template.enabled ? "checked" : ""}> Bu sonuç türü oyuncu yayınına açık olsun</label><div class="publication-variable-box"><strong>Kullanılabilir değişkenler</strong><p>Bir değişkeni son kullandığın metin alanına eklemek için tıkla.</p><div>${placeholderButtons}</div></div></div><aside class="publication-live-preview"><span class="overview-kicker">CANLI ÖNİZLEME</span><div id="publication-image-preview" class="publication-editor-image"></div><h3 id="publication-title-preview"></h3><p id="publication-body-preview"></p><small>Örnek veriler yalnız önizleme içindir.</small></aside></div>`,
    async () => {
      await api("/api/espionage-publications/template", { method: "POST", body: JSON.stringify({
        targetType: template.targetType,
        outcome: template.outcome,
        titleTemplate: document.getElementById("publication-title").value,
        bodyTemplate: document.getElementById("publication-body").value,
        imageKey: document.getElementById("publication-image").value || null,
        enabled: document.getElementById("publication-enabled").checked
      }) });
      closeEditor(); toast("Casusluk olay şablonu güncellendi."); await refreshKeepingScroll(espionagePublicationsPage);
    }
  );
  editorModal.querySelector(".modal").classList.add("wide");
  let lastTextField = document.getElementById("publication-body");
  const updatePreview = () => {
    document.getElementById("publication-title-preview").innerHTML = renderPublicationText(document.getElementById("publication-title").value);
    document.getElementById("publication-body-preview").innerHTML = renderPublicationText(document.getElementById("publication-body").value);
    const image = document.getElementById("publication-image").value;
    document.getElementById("publication-image-preview").innerHTML = image ? `<img src="/espionage-events/${image}" alt="Olay görseli önizlemesi">` : "<span>Bu şablonda görsel kullanılmayacak.</span>";
  };
  ["publication-title", "publication-body"].forEach((id) => {
    const field = document.getElementById(id);
    field.addEventListener("focus", () => { lastTextField = field; });
    field.addEventListener("input", updatePreview);
  });
  document.getElementById("publication-image").addEventListener("change", updatePreview);
  document.querySelectorAll("[data-insert-publication-variable]").forEach((button) => button.addEventListener("click", () => {
    const token = `{{${button.dataset.insertPublicationVariable}}}`;
    const start = lastTextField.selectionStart ?? lastTextField.value.length;
    const end = lastTextField.selectionEnd ?? start;
    lastTextField.setRangeText(token, start, end, "end");
    lastTextField.focus(); updatePreview();
  }));
  updatePreview();
}

async function espionagePublicationsPage(signal) {
  setActiveRoute("espionage-publications"); loading();
  const data = await api("/api/espionage-publications", signal ? { signal } : {});
  const countries = [...new Set(data.settlements.map((item) => item.countryName))];
  const targetOptions = [...new Map(data.templates.map((item) => [item.targetType, item.targetLabel])).entries()];
  const eventTurnOptions=(data.eventTurns||[]).map((turn)=>`<option value="${turn}">Tur ${number(turn)}</option>`).join("");
  page.innerHTML = `<div class="page-head publication-hero"><div><span class="overview-kicker">YERLEŞKE OLAY YAYIN MERKEZİ</span><h1>Casusluk ve Ölüm Yayınları</h1><p>Yerleşkeleri Discord kanallarıyla eşleştir; casusluk sonuçlarıyla karakter, hanedan ve Roma ailesi ölümlerini doğru şehre otomatik gönder.</p></div><span class="pill">Otomatik gönderim aktif</span></div>
  <section class="kpi-grid publication-kpis"><article class="card kpi"><span>Yerleşke</span><strong>${number(data.summary.settlements)}</strong><small>Toplam kayıt</small></article><article class="card kpi"><span>Kanalı hazır</span><strong>${number(data.summary.mappedSettlements)}</strong><small>${number(data.summary.unmappedSettlements)} yerleşke bekliyor</small></article><article class="card kpi"><span>Hazır metin</span><strong>${number(data.summary.templates)}</strong><small>Başarı ve başarısızlık</small></article><article class="card kpi"><span>Özelleştirilmiş</span><strong>${number(data.summary.customizedTemplates)}</strong><small>${number(data.summary.enabledTemplates)} şablon açık</small></article></section>
  <section class="publication-workflow"><span>1</span><div><strong>Kanalları tanımla</strong><small>Her yerleşkeye oyuncuların görebileceği olay kanalını bağla.</small></div><b>→</b><span>2</span><div><strong>Metinleri hazırla</strong><small>Gizli bilgileri açığa çıkarmayan betimlemeleri düzenle.</small></div><b>→</b><span>3</span><div><strong>Yayını bağla</strong><small>Sonraki aşamada tur çözümlemesi bu güvenli verileri kullanacak.</small></div></section>
  <section class="card publication-section publication-history"><div class="card-head"><div><h2>Turluk olay yayınları</h2><p>Son sekiz turdaki casusluk ve ölüm olaylarının Discord teslim durumunu denetle. Başarısız kayıtlar nedenleriyle birlikte yeniden denenmek üzere kuyrukta kalır.</p></div><div class="publication-history-summary"><span class="pill">✓ ${number(data.summary.publishedEvents)} yayınlandı</span><span class="pill danger">✕ ${number(data.summary.failedEvents)} başarısız</span><span class="pill neutral">… ${number(data.summary.pendingEvents)} bekliyor</span>${data.summary.unknownEvents ? `<span class="pill warning">? ${number(data.summary.unknownEvents)} eski kayıt</span>` : ""}</div></div><div class="publication-toolbar publication-history-toolbar"><label>Tur<select id="publication-event-turn"><option value="">Son 8 turun tamamı</option>${eventTurnOptions}</select></label><label>Olay türü<select id="publication-event-source"><option value="">Casusluk ve ölüm</option><option value="ESPIONAGE">Yalnız casusluk</option><option value="DEATH">Yalnız ölüm</option></select></label><label>Yayın durumu<select id="publication-event-status"><option value="">Tüm durumlar</option><option value="PUBLISHED">Yayınlandı</option><option value="FAILED">Yayınlanamadı</option><option value="PENDING">Bekliyor</option><option value="SKIPPED">Yayınlanmadı</option><option value="UNKNOWN">Eski teslim kaydı</option></select></label></div><div id="publication-event-list" class="publication-event-list">${(data.events||[]).map(publicationEventRow).join("") || '<div class="empty">Son sekiz turda yayın olayı bulunmuyor.</div>'}</div><div id="publication-event-empty" class="empty" hidden>Seçilen filtrelere uyan olay yok.</div></section>
  <section class="card publication-section"><div class="card-head"><div><h2>Yerleşke–kanal eşleştirmeleri</h2><p>Aynı kanal hem casusluk sonuçları hem ölüm haberleri için kullanılır. Hanedan ölümleri ilgili devletin güncel başkentine, Roma ailelerinin ölümleri Roma devletinin güncel başkentine gönderilir. Kanal ID'sini veya Discord'dan kopyaladığın &lt;#kanal&gt; etiketini girebilirsin.</p></div><span class="pill neutral">${number(data.summary.mappedSettlements)} / ${number(data.summary.settlements)}</span></div><div class="publication-toolbar"><label>Yerleşke ara<input id="publication-settlement-search" placeholder="Yerleşke veya devlet adı"></label><label>Devlet<select id="publication-country-filter"><option value="">Tüm devletler</option>${countries.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join("")}</select></label><label class="check"><input id="publication-unmapped-only" type="checkbox"> Yalnız eşleşmeyenler</label></div><div id="publication-settlement-list" class="publication-settlement-list">${data.settlements.map((settlement) => `<form class="publication-settlement-row" data-publication-settlement data-country="${escapeHtml(settlement.countryName)}" data-search="${escapeHtml(`${settlement.name} ${settlement.countryName}`.toLocaleLowerCase("tr-TR"))}" data-configured="${settlement.configured}"><span class="publication-status ${settlement.configured ? "ready" : "missing"}">${settlement.configured ? "✓" : "!"}</span><div><strong>${escapeHtml(settlement.name)}</strong><small>${escapeHtml(settlement.countryName)}</small></div><label><span class="sr-only">Discord kanal ID'si</span><input name="channel" value="${escapeHtml(settlement.channelId || "")}" placeholder="Kanal ID veya <#kanal>"></label><input type="hidden" name="settlementId" value="${settlement.id}"><button class="button compact primary" type="submit">Kaydet</button>${settlement.configured ? '<button class="button compact" type="button" data-clear-publication-channel>Temizle</button>' : ""}</form>`).join("")}</div><div id="publication-settlement-empty" class="empty" hidden>Filtreye uyan yerleşke yok.</div></section>
  <section class="card publication-section"><div class="card-head"><div><h2>Hazır olay metinleri</h2><p>Her görev için başarı ve başarısızlık metni ayrı tutulur. Gerçek değerler yayın anında değişkenlerin yerine gelir.</p></div><span class="pill neutral">${number(data.summary.templates)} şablon</span></div><div class="publication-toolbar template-toolbar"><label>Görev<select id="publication-target-filter"><option value="">Tüm görevler</option>${targetOptions.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select></label><label>Sonuç<select id="publication-outcome-filter"><option value="">Tüm sonuçlar</option><option value="SUCCESS">Başarılı</option><option value="FAILURE">Başarısız</option></select></label><div class="publication-privacy-note"><strong>Gizlilik koruması</strong><span>Saldırgan devlet ve casus adı oyuncu şablonlarında kullanılamaz.</span></div></div><div id="publication-template-grid" class="publication-template-grid">${data.templates.map(publicationTemplateCard).join("")}</div></section>
  <section class="card publication-section"><div class="card-head"><div><h2>Tamamlayıcı yayın önizlemeleri</h2><p>Görev metninden sonra paylaşılabilecek casus akıbeti ve ölüm haberi görsellerini tek yerde kontrol et.</p></div><span class="pill neutral">${number((data.detectionPreviews||[]).length+(data.deathPreviews||[]).length)} önizleme</span></div><h3 class="publication-preview-heading">Casusun akıbeti</h3><div class="publication-preview-grid">${(data.detectionPreviews||[]).map((preview)=>publicationPreviewCard(preview,"spy")).join("")}</div><h3 class="publication-preview-heading">Ölüm haberleri</h3><div class="publication-preview-grid">${(data.deathPreviews||[]).map((preview)=>publicationPreviewCard(preview,"death")).join("")}</div></section>`;

  const filterEvents=()=>{
    const turn=document.getElementById("publication-event-turn").value;
    const source=document.getElementById("publication-event-source").value;
    const status=document.getElementById("publication-event-status").value;
    let visible=0;
    document.querySelectorAll("[data-publication-event]").forEach((row)=>{
      const show=(!turn||row.dataset.turn===turn)&&(!source||row.dataset.source===source)&&(!status||row.dataset.status===status);
      row.hidden=!show;if(show)visible+=1;
    });
    document.getElementById("publication-event-empty").hidden=visible>0;
  };
  ["publication-event-turn","publication-event-source","publication-event-status"].forEach((id)=>document.getElementById(id).addEventListener("change",filterEvents));

  const filterSettlements = () => {
    const search = document.getElementById("publication-settlement-search").value.trim().toLocaleLowerCase("tr-TR");
    const country = document.getElementById("publication-country-filter").value;
    const unmappedOnly = document.getElementById("publication-unmapped-only").checked;
    let visible = 0;
    document.querySelectorAll("[data-publication-settlement]").forEach((row) => {
      const show = (!search || row.dataset.search.includes(search)) && (!country || row.dataset.country === country) && (!unmappedOnly || row.dataset.configured !== "true");
      row.hidden = !show; if (show) visible += 1;
    });
    document.getElementById("publication-settlement-empty").hidden = visible > 0;
  };
  ["publication-settlement-search", "publication-country-filter", "publication-unmapped-only"].forEach((id) => document.getElementById(id).addEventListener(id.includes("search") ? "input" : "change", filterSettlements));
  document.querySelectorAll("[data-publication-settlement]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try {
        await api("/api/espionage-publications/settlement-channel", { method: "POST", body: JSON.stringify({ settlementId: form.elements.settlementId.value, channel: form.elements.channel.value }) });
        toast("Yerleşke kanalı kaydedildi."); await refreshKeepingScroll(espionagePublicationsPage);
      } catch (error) { toast(error.message, "error"); button.disabled = false; }
    });
    form.querySelector("[data-clear-publication-channel]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try {
        await api("/api/espionage-publications/settlement-channel", { method: "POST", body: JSON.stringify({ settlementId: form.elements.settlementId.value, channel: "" }) });
        toast("Yerleşke kanal eşleştirmesi kaldırıldı."); await refreshKeepingScroll(espionagePublicationsPage);
      } catch (error) { toast(error.message, "error"); button.disabled = false; }
    });
  });
  const filterTemplates = () => {
    const target = document.getElementById("publication-target-filter").value;
    const outcome = document.getElementById("publication-outcome-filter").value;
    document.querySelectorAll("[data-publication-template]").forEach((card) => { card.hidden = Boolean((target && card.dataset.publicationTarget !== target) || (outcome && card.dataset.publicationOutcome !== outcome)); });
  };
  document.getElementById("publication-target-filter").addEventListener("change", filterTemplates);
  document.getElementById("publication-outcome-filter").addEventListener("change", filterTemplates);
  document.querySelectorAll("[data-edit-publication]").forEach((button) => button.addEventListener("click", () => {
    const [targetType, outcome] = button.dataset.editPublication.split(":");
    const template = data.templates.find((item) => item.targetType === targetType && item.outcome === outcome);
    if (template) openPublicationTemplateEditor(template, data);
  }));
  document.querySelectorAll("[data-reset-publication]").forEach((button) => button.addEventListener("click", async () => {
    const [targetType, outcome] = button.dataset.resetPublication.split(":");
    if (!window.confirm("Bu şablon varsayılan metin, görsel ve açık/kapalı durumuna döndürülsün mü?")) return;
    button.disabled = true;
    try {
      await api("/api/espionage-publications/template/reset", { method: "POST", body: JSON.stringify({ targetType, outcome }) });
      toast("Şablon varsayılan hâline döndürüldü."); await refreshKeepingScroll(espionagePublicationsPage);
    } catch (error) { toast(error.message, "error"); button.disabled = false; }
  }));
}

function pageScrollTop() {
  return Math.max(window.scrollY, document.scrollingElement?.scrollTop || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
}

function restorePageScroll(scrollTop) {
  const apply = () => {
    const maximumScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const target = Math.min(scrollTop, maximumScroll);
    if (document.scrollingElement) document.scrollingElement.scrollTop = target;
    document.documentElement.scrollTop = target;
    document.body.scrollTop = target;
    window.scrollTo(0, target);
  };
  apply();
  requestAnimationFrame(apply);
}

async function refreshKeepingScroll(loader) {
  const scrollTop = Number.isFinite(state.pendingPageScrollTop) ? state.pendingPageScrollTop : pageScrollTop();
  state.pendingPageScrollTop = null;
  const previousMinHeight = page.style.minHeight;
  page.style.minHeight = `${Math.max(page.scrollHeight, window.innerHeight)}px`;
  try {
    await loader();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  } finally {
    page.style.minHeight = previousMinHeight;
    restorePageScroll(scrollTop);
  }
}

function auditRows(rows, limit = rows.length, interactive = false) {
  if (!rows?.length) return '<div class="empty">Henüz işlem kaydı yok.</div>';
  return rows.slice(0, limit).map((row, index) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(row.actionLabel)}</strong><span>${escapeHtml(row.entityLabel)} · ${date(row.created_at)} · ${escapeHtml(row.actorLabel)}</span>${row.detailSummary ? `<small>${escapeHtml(row.detailSummary)}</small>` : ""}</div>${interactive ? `<div class="audit-item-actions"><button class="button compact" data-audit-detail="${index}">İncele</button>${row.canUndo ? `<button class="button compact audit-undo-button" data-audit-undo="${row.id}">Geri almayı denetle</button>` : ""}</div>` : ""}</div>`).join("");
}

async function overview() {
  setActiveRoute("overview"); loading();
  const data = await api("/api/overview");
  document.getElementById("turn-badge").textContent = `Tur ${data.guild.current_turn} · ${turnPhaseLabels[data.guild.turn_phase] || data.guild.turn_phase}`;
  page.innerHTML = `<section class="page-head overview-hero"><div><span class="overview-kicker">ANTİK MEDENİYETLER ROLE PLAY</span><h1>Oyun Kontrol Merkezi</h1><p>Canlı oyun durumunu izle, kritik mekaniklere ulaş ve yönetici işlemlerini tek merkezden yürüt.</p></div><div class="actions"><button class="button" data-open-army>＋ Yeni ordu</button><button class="button primary" data-route-action="audit">İşlem geçmişi</button></div></section>
    <section class="kpi-grid"><div class="card kpi"><span>Aktif devlet</span><strong>${number(data.counts.countries)}</strong><small class="muted">${number(data.counts.settlements)} yerleşke</small></div><div class="card kpi"><span>Aktif savaş</span><strong>${number(data.counts.battles)}</strong><small class="muted">Devam eden tüm cepheler</small></div><div class="card kpi"><span>Ordu ve filo</span><strong>${number(data.counts.armies + data.counts.fleets)}</strong><small class="muted">${number(data.counts.armies)} ordu · ${number(data.counts.fleets)} filo</small></div><div class="card kpi"><span>Son 24 saat</span><strong>${number(data.counts.reviews)}</strong><small class="muted">Denetim kaydı</small></div></section>
    <section class="content-grid"><div class="card"><div class="card-head"><div><h2>Devlet durumu</h2><p>Askerî hareketliliğe göre öne çıkan kayıtlar</p></div><button class="button" data-route-action="countries">Tümünü gör</button></div><div class="data-list">${data.countries.map((country) => `<div class="data-row"><div><strong>${escapeHtml(country.name)}</strong><small>${number(country.settlement_count)} yerleşke · ${number(country.army_count)} ordu</small></div><span>${number(country.personnel)} asker</span><span>${money(country.treasury)}</span><button class="button" data-country="${country.id}">Aç</button></div>`).join("")}</div></div>
    <aside class="card"><div class="card-head"><div><h3>Hızlı işlemler</h3><p>Sık kullanılan GM araçları</p></div></div><div class="quick-actions"><button class="button" data-open-army>⚔ Yeni ordu oluştur</button><button class="button" data-route-action="health">♥ Oyun sağlığını denetle</button><button class="button" data-route-action="countries">♜ Devlet ve şehirleri aç</button><button class="button" data-route-action="audit">↶ Son değişiklikleri incele</button></div><hr>${workspaceListMarkup()}<hr><div class="card-head"><div><h3>Son kayıtlar</h3></div></div>${auditRows(data.audit, 5)}</aside></section>`;
  bindPageActions();
}

async function countries() {
  setActiveRoute("countries"); loading();
  state.countries = await api("/api/countries");
  page.innerHTML = `<div class="page-head"><div><h1>Devletler</h1><p>Aktif ve yok edilmiş bütün devlet kayıtları</p></div><button class="button primary" data-open-army>＋ Yeni ordu</button></div><section class="card table-wrap"><table><thead><tr><th>Devlet</th><th>Durum</th><th>Başkent</th><th>Yerleşke</th><th>Ordu</th><th>Filo</th><th>Hazine</th><th></th></tr></thead><tbody>${state.countries.map((country) => `<tr data-country-id="${country.id}" data-record-type="COUNTRY" data-record-id="${country.id}"><td><strong>${escapeHtml(country.name)}</strong></td><td><span class="pill ${country.status === "ACTIVE" ? "" : "neutral"}">${escapeHtml(countryStatusLabels[country.status] || country.status)}</span></td><td>${escapeHtml(country.capital_name || "Atanmamış")}</td><td>${number(country.settlement_count)}</td><td>${number(country.army_count)}</td><td>${number(country.fleet_count)}</td><td>${money(country.treasury)}</td><td>${country.status === "ACTIVE" ? `<button class="button compact" data-edit-country="${country.id}">Düzenle</button>` : ""}</td></tr>`).join("")}</tbody></table></section>`;
  bindPageActions();
  document.querySelectorAll("tr[data-country-id]").forEach((row) => row.addEventListener("click", () => {
    countryDetail(row.dataset.countryId).catch(showPageError);
  }));
  document.querySelectorAll("[data-edit-country]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openCountryEditor(state.countries.find((item) => item.id === button.dataset.editCountry));
  }));
  revealFocusedRecord();
}

async function countryDetail(id) {
  loading();
  const [data, catalog] = await Promise.all([api(`/api/countries/${id}`), state.characterCatalog ? Promise.resolve(state.characterCatalog) : api("/api/catalog/characters")]);
  state.characterCatalog = catalog;
  state.selectedCountry = data;
  recordRecent({ type: "COUNTRY", id: data.country.id, label: data.country.name, detail: countryStatusLabels[data.country.status] || data.country.status });
  const totalPopulation = data.settlements.reduce((sum, item) => sum + Number(item.population) + Number(item.slave_population), 0);
  const totalArmy = data.armies.reduce((sum, item) => sum + Number(item.total), 0);
  page.innerHTML = `<div class="page-head"><div><span class="pill">${escapeHtml(countryStatusLabels[data.country.status] || data.country.status)}</span><h1 style="margin-top:10px">${escapeHtml(data.country.name)}</h1><p>${number(data.settlements.length)} yerleşke · ${number(data.armies.length)} ordu · ${number(data.fleets.length)} filo</p></div><div class="actions"><button class="button" data-back-countries>← Devletler</button><button class="button" data-edit-country-detail>Düzenle</button>${data.country.status === "ACTIVE" && data.settlements.length > 1 ? '<button class="button" data-change-capital>♜ Başkent değiştir</button>' : ""}<button class="button primary" data-open-army data-default-country="${data.country.id}">＋ Ordu oluştur</button></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Hazine</span><strong>${money(data.country.treasury)}</strong></div><div class="detail-cell"><span>Başkent</span><strong>${escapeHtml(data.country.capital_name || "Atanmamış")}</strong><small>Gelir ve nüfus artışı +%1</small></div><div class="detail-cell"><span>Toplam nüfus</span><strong>${number(totalPopulation)}</strong></div><div class="detail-cell"><span>Ordu mevcudu</span><strong>${number(totalArmy)}</strong></div><div class="detail-cell"><span>Seferberlik</span><strong>${escapeHtml(mobilizationLabels[data.country.mobilization] || data.country.mobilization)}</strong></div></section>
    <div class="section-title"><h2>Yerleşkeler</h2><span>${number(data.settlements.length)} kayıt</span></div>
    <section class="card table-wrap"><table><thead><tr><th>Yerleşke</th><th>Nüfus</th><th>Köle</th><th>Hazine</th><th>Kaynak</th><th>Din</th><th>Kara ticareti</th><th>Asker</th><th>Gemi</th></tr></thead><tbody>${data.settlements.map((settlement) => `<tr data-open-settlement="${settlement.id}"><td><strong>${escapeHtml(settlement.name)}</strong>${settlement.is_capital ? '<small class="muted"> · ♜ Başkent</small>' : ""}${settlement.is_conquered ? '<small class="muted"> · Fethedildi</small>' : ""}</td><td>${number(settlement.population)}</td><td>${number(settlement.slave_population)}</td><td>${money(settlement.local_treasury)}</td><td>${escapeHtml(settlement.resource_label || settlement.resource_type || "—")}</td><td>${religionDistribution(settlement)}</td><td>${money(settlement.base_land_trade_income)}</td><td>${number(settlement.army_stock)}</td><td>${number(settlement.ships)}</td></tr>`).join("") || '<tr><td colspan="9" class="empty">Yerleşke bulunmuyor.</td></tr>'}</tbody></table></section>
    <section class="content-grid"><div class="card"><div class="card-head"><div><h3>Ordular</h3><p>Birlik ve komutan durumu</p></div></div>${data.armies.map((army) => `<div class="data-row"><div><strong>${escapeHtml(army.name)}</strong><small>${escapeHtml(army.commander_name || "Komutan atanmamış")}</small></div><span>${number(army.total)} asker</span><span>Tur ${number(army.created_turn)}</span><span class="pill neutral">Aktif</span></div>`).join("") || '<div class="empty">Henüz ordu yok.</div>'}</div><aside class="card"><div class="card-head"><div><h3>Filolar</h3><p>Gemi ve amiral durumu</p></div></div>${data.fleets.map((fleet) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(fleet.name)}</strong><span>${escapeHtml(fleet.commander_name || "Amiral atanmamış")} · ${number(fleet.total)} gemi</span></div></div>`).join("") || '<div class="empty">Henüz filo yok.</div>'}</aside></section>
    <section class="card section-gap"><div class="card-head"><div><h3>Karakterler</h3><p>Uzmanlık, görev ve durum kayıtları</p></div></div><div class="compact-grid">${data.characters.map((character) => `<div class="record-card"><strong>${escapeHtml(character.name)}</strong><span>${escapeHtml(roleLabel(character))} · Sv${number(character.level)} · +${number(character.skill_bonus)}</span><small>${escapeHtml(characterStatusLabel(character.status))} · ${escapeHtml(assignmentLabel(character.assignment))}${character.assigned_settlement_name ? ` · ${escapeHtml(character.assigned_settlement_name)}` : ""}${character.death_settlement_name ? ` · Ölüm: ${escapeHtml(character.death_settlement_name)}` : ""}</small></div>`).join("") || '<div class="empty">Karakter yok.</div>'}</div></section>${countryRelationsPanel(data)}`;
  bindPageActions();
  document.querySelector("[data-back-countries]").addEventListener("click", countries);
  document.querySelector("[data-edit-country-detail]").addEventListener("click", () => openCountryEditor(data.country));
  document.querySelector("[data-change-capital]")?.addEventListener("click", () => openCapitalEditor(data.country, data.settlements));
  document.querySelectorAll("[data-open-settlement]").forEach((row) => row.addEventListener("click", () => settlementDetail(row.dataset.openSettlement).catch(showPageError)));
  document.querySelectorAll("[data-related-country]").forEach((button) => button.addEventListener("click", () => countryDetail(button.dataset.relatedCountry).catch(showPageError)));
}

async function settlementsPage() {
  setActiveRoute("settlements"); loading();
  const [rows, religions] = await Promise.all([api("/api/settlements"), state.religionCatalog ? Promise.resolve(state.religionCatalog) : api("/api/catalog/religions")]);
  state.religionCatalog = religions;
  page.innerHTML = `<div class="page-head"><div><h1>Yerleşkeler</h1><p>Nüfus, ekonomi, din, vergi oranı, kaynak ve askerî stokların tamamı</p></div><span class="pill neutral">${number(rows.length)} yerleşke</span></div><section class="card table-wrap"><table><thead><tr><th>Yerleşke</th><th>Devlet</th><th>Nüfus / Köle</th><th>Din dağılımı</th><th>Yerel hazine</th><th>Vergi</th><th>Kara ticareti</th><th>Asker / Gemi</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr data-country-id="${row.country_id}" data-record-type="SETTLEMENT" data-record-id="${row.id}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.resource_label || row.resource_type)} · ${escapeHtml(row.culture_label || row.culture_group)} · ${row.is_coastal ? "Kıyı" : "İç bölge"}</small></td><td>${escapeHtml(row.country_name)}</td><td>${number(row.population)} / ${number(row.slave_population)}</td><td>${religionDistribution(row)}</td><td>${money(row.local_treasury)}</td><td>%${number(row.tax_rate_percent)}</td><td>${money(row.base_land_trade_income)}</td><td>${number(row.army_stock)} / ${number(row.ships)}</td><td><span class="pill ${row.ruin_stage > 0 || row.is_conquered ? "warning" : "neutral"}">${row.ruin_stage > 0 ? `Harap ${number(row.ruin_stage)}` : row.is_conquered ? "Fethedildi" : "Normal"}</span></td><td>${row.country_status === "ACTIVE" ? `<button class="button compact" data-edit-settlement="${row.id}">Düzenle</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="10" class="empty">Yerleşke bulunmuyor.</td></tr>'}</tbody></table></section>`;
  document.querySelectorAll('[data-record-type="SETTLEMENT"]').forEach((row) => row.addEventListener("click", () => settlementDetail(row.dataset.recordId).catch(showPageError)));
  document.querySelectorAll("[data-edit-settlement]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openSettlementEditor(rows.find((item) => item.id === button.dataset.editSettlement));
  }));
  revealFocusedRecord();
}

async function settlementDetail(id) {
  setActiveRoute("settlements"); loading();
  const [data, religions] = await Promise.all([
    api(`/api/settlements/${id}`),
    state.religionCatalog ? Promise.resolve(state.religionCatalog) : api("/api/catalog/religions")
  ]);
  state.religionCatalog = religions;
  const settlement = data.settlement;
  recordRecent({ type: "SETTLEMENT", id: settlement.id, label: settlement.name, detail: settlement.country_name });
  const income = Number(settlement.tax_income || 0) + Number(settlement.land_trade_income || 0) + Number(settlement.sea_trade_income || 0);
  const garrisonTotal = data.units.reduce((sum, row) => sum + Number(row.quantity), 0);
  const armyTotal = data.armyAllocations.reduce((sum, row) => sum + Number(row.quantity), 0);
  const shipTotal = data.ships.reduce((sum, row) => sum + Number(row.quantity), 0) + data.fleetAllocations.reduce((sum, row) => sum + Number(row.quantity), 0);
  page.innerHTML = `<div class="page-head"><div><span class="pill ${settlement.ruin_stage > 0 || settlement.is_conquered ? "warning" : ""}">${settlement.ruin_stage > 0 ? `Harap ${number(settlement.ruin_stage)}` : settlement.is_conquered ? "Fethedildi" : "Aktif yerleşke"}</span><h1 style="margin-top:10px">${escapeHtml(settlement.name)}</h1><p>${escapeHtml(settlement.country_name)} · ${escapeHtml(settlement.culture_label || settlement.culture_group)} · ${escapeHtml(settlement.resource_label || settlement.resource_type)}</p></div><div class="actions"><button class="button" data-back-settlements>← Yerleşkeler</button><button class="button" data-open-country="${settlement.country_id}">Devleti aç</button><button class="button primary" data-edit-settlement-detail>Düzenle</button></div></div><section class="detail-grid"><div class="detail-cell"><span>Toplam nüfus</span><strong>${number(Number(settlement.population) + Number(settlement.slave_population))}</strong><small>${number(settlement.population)} özgür · ${number(settlement.slave_population)} köle</small></div><div class="detail-cell"><span>Yerel hazine</span><strong>${money(settlement.local_treasury)}</strong><small>Vergi oranı %${number(settlement.tax_rate_percent)}</small></div><div class="detail-cell"><span>Tur geliri</span><strong>${money(income)}</strong><small>Vergi ${money(settlement.tax_income)} · Kara ${money(settlement.land_trade_income)} · Deniz ${money(settlement.sea_trade_income)}</small></div><div class="detail-cell"><span>Askerî varlık</span><strong>${number(garrisonTotal + armyTotal)} asker · ${number(shipTotal)} gemi</strong><small>${number(armyTotal)} asker ordulara tahsisli</small></div></section><section class="relation-grid"><article class="card"><div class="card-head"><div><h3>Binalar</h3><p>Seviye ve inşa durumu</p></div><span class="pill neutral">${number(data.buildings.length)}</span></div>${rowsOrEmpty(data.buildings, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(humanKey(row.building_type))}</strong><small>${row.status === "BUILDING" ? `İnşaat · Tur ${number(row.completion_turn)}` : "Kullanımda"}</small></span><em>Sv${number(row.level)}${row.target_level ? ` → ${number(row.target_level)}` : ""}</em></div>`, "Bina kaydı bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h3>Politikalar</h3><p>Yerleşke yönetim kararları</p></div></div>${rowsOrEmpty(data.policies, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(humanKey(row.policy_key))}</strong><small>${row.status === "ACTIVE" ? "Etkin" : `Tur ${number(row.activation_turn)} tarihinde etkinleşecek`}</small></span><em>${number(row.slot)}. yuva</em></div>`, "Etkin politika bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h3>Kara birlikleri</h3><p>Yerleşke stoku ve ordu tahsisleri</p></div></div>${rowsOrEmpty(data.units, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(humanKey(row.unit_type))}</strong><small>${escapeHtml(humanKey(row.force_type))} · ${escapeHtml(humanKey(row.status))}</small></span><em>${number(row.quantity)}</em></div>`, "Yerleşke stokunda asker bulunmuyor.")}${rowsOrEmpty(data.armyAllocations, (row) => `<button class="relation-row" data-open-army-detail="${row.army_id}"><span><strong>${escapeHtml(row.army_name)}</strong><small>${escapeHtml(humanKey(row.unit_type))}</small></span><em>${number(row.quantity)}</em></button>`, "Ordulara tahsis edilmiş asker bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h3>Donanma</h3><p>Rezerv ve filo gemileri</p></div></div>${rowsOrEmpty(data.ships, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(humanKey(row.ship_type))}</strong><small>${escapeHtml(humanKey(row.status))}</small></span><em>${number(row.quantity)}</em></div>`, "Yerleşke rezervinde gemi bulunmuyor.")}${rowsOrEmpty(data.fleetAllocations, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.fleet_name)}</strong><small>${escapeHtml(humanKey(row.ship_type))}</small></span><em>${number(row.quantity)}</em></div>`, "Filoya tahsis edilmiş gemi bulunmuyor.")}</article></section><div class="section-title"><h2>Ekonomi ve olay geçmişi</h2><span>İlişkili son kayıtlar</span></div><section class="relation-grid"><article class="card"><div class="card-head"><div><h3>Ticaret yolları</h3><p>Bu yerleşkeye bağlı anlaşmalar</p></div></div>${rowsOrEmpty(data.trades, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.proposer_country_name)} ↔ ${escapeHtml(row.receiver_country_name)}</strong><small>${escapeHtml(row.proposer_settlement_name)} → ${escapeHtml(row.receiver_settlement_name || "Bekliyor")} · ${row.route === "SEA" ? "Deniz" : "Kara"}</small></span><em>${row.status === "ACTIVE" ? money(row.income_per_country) : escapeHtml(humanKey(row.status))}</em></div>`, "Ticaret yolu bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h3>Son mali hareketler</h3><p>Yerleşke kaynaklı işlemler</p></div></div>${rowsOrEmpty(data.transactions.slice(0, 12), (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.description)}</strong><small>Tur ${number(row.turn)} · ${escapeHtml(humanKey(row.kind))}</small></span><em class="${Number(row.amount) < 0 ? "danger-text" : ""}">${signedMoney(row.amount)}</em></div>`, "Mali hareket bulunmuyor.")}</article><article class="card relation-span"><div class="card-head"><div><h3>Yerleşke olayları</h3><p>Son 25 olay ve tetiklenme sonucu</p></div></div>${rowsOrEmpty(data.events, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(humanKey(row.event_type))}</strong><small>Tur ${number(row.turn)} · Şans %${number(row.chance)} · Zar ${number(row.roll)}</small></span><em class="${row.triggered ? "danger-text" : ""}">${row.triggered ? "Tetiklendi" : "Gerçekleşmedi"}</em></div>`, "Yerleşke olayı bulunmuyor.")}</article></section>`;
  bindPageActions();
  document.querySelector("[data-back-settlements]").addEventListener("click", () => settlementsPage().catch(showPageError));
  document.querySelector("[data-open-country]").addEventListener("click", (event) => countryDetail(event.currentTarget.dataset.openCountry).catch(showPageError));
  document.querySelector("[data-edit-settlement-detail]").addEventListener("click", () => openSettlementEditor(settlement));
  document.querySelectorAll("[data-open-army-detail]").forEach((button) => button.addEventListener("click", () => openArmyEditor(button.dataset.openArmyDetail).catch((error) => toast(error.message, "error"))));
}

async function forcesPage() {
  setActiveRoute("armies"); loading();
  const data = await api("/api/forces");
  page.innerHTML = `<div class="page-head"><div><h1>Ordular & Filolar</h1><p>Kalıcı kuvvetlerin mevcudu, konumu ve komuta durumu</p></div><button class="button primary" data-open-army>＋ Yeni ordu</button></div>
    <div class="section-title"><h2>Ordular</h2><span>${number(data.armies.length)} kayıt</span></div><section class="card table-wrap"><table><thead><tr><th>Ordu</th><th>Devlet</th><th>Komutan</th><th>Mevcut</th><th>Köken</th><th>Kuruluş</th><th></th></tr></thead><tbody>${data.armies.map((row) => `<tr data-country-id="${row.country_id}" data-record-type="ARMY" data-record-id="${row.id}"><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.country_name)}</td><td>${escapeHtml(row.commander_name || "Atanmamış")}</td><td>${number(row.total)}</td><td>${number(row.origin_count)} yerleşke</td><td>Tur ${number(row.created_turn)}</td><td><button class="button compact" data-edit-army="${row.id}">Düzenle</button></td></tr>`).join("") || '<tr><td colspan="7" class="empty">Ordu bulunmuyor.</td></tr>'}</tbody></table></section>
    <div class="section-title"><h2>Filolar</h2><span>${number(data.fleets.length)} kayıt</span></div><section class="card table-wrap"><table><thead><tr><th>Filo</th><th>Devlet</th><th>Amiral</th><th>Hazır gemi</th><th>Hasarlı gemi</th><th>Kuruluş</th><th></th></tr></thead><tbody>${data.fleets.map((row) => `<tr data-country-id="${row.country_id}" data-record-type="FLEET" data-record-id="${row.id}"><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.country_name)}</td><td>${escapeHtml(row.commander_name || "Atanmamış")}</td><td>${number(Number(row.ready_ships) + Number(row.tracked_ships) - Number(row.damaged_ships))}</td><td>${number(row.damaged_ships)}</td><td>Tur ${number(row.created_turn)}</td><td><button class="button compact" data-edit-fleet="${row.id}">Gemi canları</button></td></tr>`).join("") || '<tr><td colspan="7" class="empty">Filo bulunmuyor.</td></tr>'}</tbody></table></section>`;
  bindPageActions(); bindCountryRows();
  document.querySelectorAll("[data-edit-army]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openArmyEditor(button.dataset.editArmy).catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-edit-fleet]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openFleetHealthEditor(button.dataset.editFleet).catch((error) => toast(error.message, "error"));
  }));
  revealFocusedRecord();
}

async function charactersPage() {
  setActiveRoute("characters"); loading();
  const [rows, catalog] = await Promise.all([api("/api/characters"), state.characterCatalog ? Promise.resolve(state.characterCatalog) : api("/api/catalog/characters")]);
  state.characterCatalog = catalog;
  const alive = rows.filter((row) => row.character_status === "ACTIVE").length;
  page.innerHTML = `<div class="page-head"><div><h1>Karakterler</h1><p>Karakter adları, puanları, uzmanlıkları ve doktrinleri</p></div><div class="actions"><span class="pill">${number(alive)} aktif</span><span class="pill neutral">${number(rows.length - alive)} ölü/görevden alınmış</span></div></div><section class="card table-wrap"><table><thead><tr><th>Karakter</th><th>Devlet</th><th>Rol</th><th>Seviye / Bonus</th><th>Uzmanlık</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr data-country-id="${row.country_id}" data-record-type="CHARACTER" data-record-id="${row.id}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.trained_settlement_name || "Köken bilinmiyor")}</small></td><td>${escapeHtml(row.country_name)}</td><td>${escapeHtml(roleLabel(row))}</td><td>Sv${number(row.specialization_level)} / +${number(row.skill_bonus)}</td><td>${escapeHtml(developmentLabel(row.specialization || row.admiral_specialization))}<small>${escapeHtml(row.doctrine || row.admiral_doctrine ? developmentLabel(row.doctrine || row.admiral_doctrine) : "Doktrin yok")}</small></td><td><span class="pill ${row.character_status === "ACTIVE" ? "" : "neutral"}">${escapeHtml(characterStatusLabel(row.character_status))}</span>${row.death_settlement_name ? `<small>Ölüm: ${escapeHtml(row.death_settlement_name)}</small>` : ""}</td><td>${row.character_status === "ACTIVE" ? `<button class="button compact" data-edit-character="${row.id}">Düzenle</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">Karakter bulunmuyor.</td></tr>'}</tbody></table></section>`;
  bindCountryRows();
  document.querySelectorAll("[data-edit-character]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openCharacterEditor(rows.find((item) => item.id === button.dataset.editCharacter)).catch((error) => toast(error.message, "error"));
  }));
  revealFocusedRecord();
}

async function dynastiesPage() {
  setActiveRoute("dynasties"); loading();
  const rows = await api("/api/dynasties");
  const living = rows.reduce((sum, row) => sum + Number(row.living_count || 0), 0);
  page.innerHTML = `<div class="page-head"><div><h1>Hanedanlar</h1><p>Devletleri yöneten aileler, hükümdarlar, varisler ve hanedan sağlık durumu</p></div><div class="actions"><span class="pill">${number(rows.length)} hanedan</span><span class="pill neutral">${number(living)} yaşayan üye</span></div></div>
    <section class="dynasty-grid">${rows.map((row) => `<article class="card dynasty-card"><div class="card-head"><div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.country_name)}${row.country_status === "ACTIVE" ? "" : " · Etkin değil"}</p></div><span class="pill ${Number(row.sick_count) ? "warning" : "neutral"}">${Number(row.sick_count) ? `${number(row.sick_count)} hasta` : "Sağlıklı"}</span></div><div class="dynasty-leadership"><span><small>Hükümdar</small><strong>${escapeHtml(row.monarch_name || "Atanmamış")}</strong>${row.monarch_title ? `<small>${escapeHtml(row.monarch_title)}</small>` : ""}</span><span><small>Varis</small><strong>${escapeHtml(row.heir_name || "Atanmamış")}</strong>${row.heir_title ? `<small>${escapeHtml(row.heir_title)}</small>` : ""}</span></div><div class="dynasty-card-footer"><span>${number(row.living_count)} yaşayan · ${number(row.member_count)} toplam üye</span><button class="button primary compact" data-open-dynasty="${row.id}">Hanedanı yönet</button></div></article>`).join("") || '<div class="card empty">Hanedan kaydı bulunmuyor.</div>'}</section>`;
  document.querySelectorAll("[data-open-dynasty]").forEach((button) => button.addEventListener("click", () => {
    dynastyDetailPage(button.dataset.openDynasty).catch(showPageError);
  }));
}

async function nobleTraitsPage() {
  setActiveRoute("noble-traits"); loading();
  const data = await api("/api/noble-traits");
  const catalog = data.catalog || [];
  const members = data.members || [];
  const traitByKey = new Map(catalog.map((trait) => [trait.key, trait]));
  const countries = [...new Set(members.map((member) => member.country_name))].sort((left, right) => left.localeCompare(right, "tr"));
  const categoryLabel = (value) => value === "POSITIVE" ? "Olumlu" : value === "MIXED" ? "Karma" : "Olumsuz";
  const traitOptions = (current) => `<option value="">Traitsiz</option>${["POSITIVE", "MIXED", "NEGATIVE"].map((category) => `<optgroup label="${categoryLabel(category)}">${catalog.filter((trait) => trait.category === category).map((trait) => `<option value="${trait.key}" ${selected(trait.key, current)}>${escapeHtml(trait.name)} — ${escapeHtml(trait.effects.join(" · "))}</option>`).join("")}</optgroup>`).join("")}`;
  const cards = catalog.map((trait) => `<article class="card"><div class="card-head"><div><h3>${escapeHtml(trait.name)}</h3><p>${escapeHtml(trait.description)}</p></div><span class="pill ${trait.category === "NEGATIVE" ? "danger" : trait.category === "MIXED" ? "warning" : ""}">${categoryLabel(trait.category)}</span></div><small>${escapeHtml(trait.effects.join(" · "))}</small></article>`).join("");
  const rows = members.map((member) => {
    const trait = traitByKey.get(member.trait_key);
    const search = `${member.name} ${member.title} ${member.country_name} ${member.dynasty_name} ${trait?.name || "traitsiz"}`.toLocaleLowerCase("tr-TR");
    const stateValue = member.trait_effect_active ? "ACTIVE" : member.status === "ALIVE" ? "INACTIVE" : "DEAD";
    const position = member.is_monarch ? '<span class="pill succession monarch">Hükümdar</span>' : member.is_heir ? '<span class="pill succession heir">Varis</span>' : `<strong class="dynasty-relation">${escapeHtml(member.relation)}</strong>`;
    const lifeState = member.status === "DEAD" ? "Ölü" : member.health === "SICK" ? "Hasta" : "Hayatta";
    return `<tr class="noble-trait-row ${member.status === "DEAD" ? "is-dead" : ""}" data-trait-row data-country="${escapeHtml(member.country_name)}" data-state="${stateValue}" data-search="${escapeHtml(search)}"><td><div class="dynasty-member-identity"><span class="dynasty-member-avatar">${escapeHtml(member.name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?")}</span><div><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.title)} · ${member.age === null ? "Yaş bilinmiyor" : `${number(member.age)} yaş`}</small></div></div></td><td><strong class="noble-trait-country">${escapeHtml(member.country_name)}</strong><small>${escapeHtml(member.dynasty_name)}${member.steppe_title_id ? " · İç hane" : ""}</small></td><td>${position}<small class="noble-member-state">${lifeState}</small></td><td class="dynasty-trait-cell">${nobleTraitVisual(trait)}</td><td><div class="noble-trait-picker"><small>Yeni seçim</small><select data-trait-select="${member.id}" aria-label="${escapeHtml(member.name)} traiti">${traitOptions(member.trait_key)}</select></div></td><td><div class="trait-management-actions"><button class="button compact primary" data-set-noble-trait="${member.id}">Uygula</button><button class="button compact" data-reroll-noble-trait="${member.id}">↻ Rastgele</button><button class="button compact danger ghost" data-remove-noble-trait="${member.id}" ${member.trait_key ? "" : "disabled"}>Kaldır</button><button class="button compact" data-open-noble-dynasty="${member.dynasty_id}">Hanedana git</button></div></td></tr>`;
  }).join("");
  page.innerHTML = `<div class="page-head noble-traits-head"><div><span class="overview-kicker">HANEDAN YÖNETİMİ</span><h1>Soylu Traitleri</h1><p>Tüm hanedan üyelerinin traitlerini tek ekrandan izle ve yönet. Trait etkileri yalnızca yaşayan hükümdar ile yaşayan eşinde çalışır.</p></div><div class="actions"><span class="pill">${number(members.filter((member) => member.trait_key).length)} traitli üye</span><span class="pill neutral">${number(members.filter((member) => member.trait_effect_active).length)} etkin trait</span></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Toplam trait</span><strong>${number(catalog.length)}</strong></div><div class="detail-cell"><span>Olumlu</span><strong>${number(catalog.filter((trait) => trait.category === "POSITIVE").length)}</strong></div><div class="detail-cell"><span>Karma</span><strong>${number(catalog.filter((trait) => trait.category === "MIXED").length)}</strong></div><div class="detail-cell"><span>Olumsuz</span><strong>${number(catalog.filter((trait) => trait.category === "NEGATIVE").length)}</strong></div></section>
    <details class="card section-gap"><summary><strong>Trait kataloğunu ve etkilerini göster</strong></summary><div class="dynasty-grid section-gap">${cards}</div></details>
    <section class="card section-gap noble-trait-filters"><div class="noble-trait-toolbar"><label>Üye, hanedan veya trait ara<input id="noble-trait-search" placeholder="Örn. Adil, Roma, hükümdar…"></label><label>Devlet<select id="noble-trait-country"><option value="ALL">Tüm devletler</option>${countries.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join("")}</select></label><label>Üye grubu<select id="noble-trait-state"><option value="ALL">Tüm üyeler</option><option value="ACTIVE">Hükümdar ve eşleri</option><option value="INACTIVE">Yaşayan diğer üyeler</option><option value="DEAD">Ölü üyeler</option></select></label></div></section>
    <section class="card table-wrap section-gap noble-traits-table-wrap"><table class="noble-traits-table"><thead><tr><th>Soylu</th><th>Devlet / Hanedan</th><th>Konum</th><th>Mevcut trait</th><th>Trait seçimi</th><th>Yönetim</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty">Hanedan üyesi bulunmuyor.</td></tr>'}</tbody></table></section>`;
  const applyFilters = () => {
    const search = document.getElementById("noble-trait-search").value.trim().toLocaleLowerCase("tr-TR");
    const country = document.getElementById("noble-trait-country").value;
    const stateValue = document.getElementById("noble-trait-state").value;
    document.querySelectorAll("[data-trait-row]").forEach((row) => { row.hidden = Boolean((search && !row.dataset.search.includes(search)) || (country !== "ALL" && row.dataset.country !== country) || (stateValue !== "ALL" && row.dataset.state !== stateValue)); });
  };
  document.getElementById("noble-trait-search").addEventListener("input", applyFilters);
  document.getElementById("noble-trait-country").addEventListener("change", applyFilters);
  document.getElementById("noble-trait-state").addEventListener("change", applyFilters);
  const mutate = async (memberId, payload, success) => {
    await api(`/api/admin/dynasty-members/${memberId}/trait`, { method: "POST", body: JSON.stringify(payload) });
    toast(success); await refreshKeepingScroll(nobleTraitsPage);
  };
  document.querySelectorAll("[data-set-noble-trait]").forEach((button) => button.addEventListener("click", () => {
    const traitKey = document.querySelector(`[data-trait-select="${button.dataset.setNobleTrait}"]`).value;
    return mutate(button.dataset.setNobleTrait, traitKey ? { action: "SET", traitKey } : { action: "REMOVE" }, traitKey ? "Soylu traiti güncellendi." : "Soylu traiti kaldırıldı.").catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-reroll-noble-trait]").forEach((button) => button.addEventListener("click", () => mutate(button.dataset.rerollNobleTrait, { action: "REROLL" }, "Yeni rastgele trait atandı.").catch((error) => toast(error.message, "error"))));
  document.querySelectorAll("[data-remove-noble-trait]").forEach((button) => button.addEventListener("click", () => mutate(button.dataset.removeNobleTrait, { action: "REMOVE" }, "Soylu traiti kaldırıldı.").catch((error) => toast(error.message, "error"))));
  document.querySelectorAll("[data-open-noble-dynasty]").forEach((button) => button.addEventListener("click", () => dynastyDetailPage(button.dataset.openNobleDynasty).catch(showPageError)));
}

function romanSenateSeats(families, totalSeats) {
  const seats = families.flatMap((family, familyIndex) => Array.from(
    { length: Math.max(0, Number(family.senate_seats || 0)) },
    () => `<span class="roman-seat ${romanFamilyColorKey(family.name, familyIndex)}" title="${escapeHtml(family.name)}"></span>`
  ));
  while (seats.length < Number(totalSeats || 100)) seats.push('<span class="roman-seat empty-seat" title="Boş koltuk"></span>');
  return seats.slice(0, Number(totalSeats || 100)).join("");
}

const romanVoteLabels = { YES: "Evet", NO: "Hayır", ABSTAIN: "Çekimser" };

function romanVoteSource(vote) {
  return vote?.votedBy === "NPC" || vote?.npcScore !== null && vote?.npcScore !== undefined ? "NPC otomatik" : "Oyuncu";
}

function romanElectionVoterRows(republic, election) {
  const ballots = election.ballots || [];
  const byFamily = new Map(ballots.map((ballot) => [ballot.voterFamilyId, ballot]));
  const preferences = new Map((election.npcPreferences || []).map((preference) => [preference.voterFamilyId, preference]));
  return republic.families.map((family) => {
    const ballot = byFamily.get(family.id);
    const senator = ballot?.senatorName || (family.members || []).find((member) => member.position === "HEAD" && member.status === "ALIVE")?.name || family.name;
    if (!ballot) {
      const preference = preferences.get(family.id);
      if (!Number(family.player_count) && election.status === "OPEN") {
        const effective = preference?.effectiveCandidateName
          ? `${preference.effectiveCandidateName} · ${preference.effectiveCandidateFamilyName}` : "Aday bekleniyor";
        const source = preference?.overrideCandidateId ? "Yönetici tercihi" : "Otomatik tahmin";
        return `<div class="roman-ballot-row pending npc-preview"><div><strong>${escapeHtml(family.name)} · ${escapeHtml(senator)}</strong><small>${escapeHtml(source)}${preference?.predictedScore === null || preference?.predictedScore === undefined ? "" : ` · Karar puanı ${number(preference.predictedScore)}`}</small></div><div><b>${escapeHtml(effective)}</b><small>Oy, seçim kapanırken kesinleşir.</small></div>${(election.candidates || []).length ? `<button class="button compact" data-roman-npc-preference data-election-id="${election.id}" data-family-id="${family.id}">Değiştir</button>` : ""}</div>`;
      }
      return `<div class="roman-ballot-row pending"><div><strong>${escapeHtml(family.name)}</strong><small>Senatör: ${escapeHtml(senator)}</small></div><span class="pill neutral">${Number(family.player_count) ? "Oyuncu oyu bekleniyor" : "Oy kullanılmadı"}</span></div>`;
    }
    return `<div class="roman-ballot-row"><div><strong>${escapeHtml(family.name)} · ${escapeHtml(senator)}</strong><small>${escapeHtml(romanVoteSource(ballot))}${ballot.npcScore === null || ballot.npcScore === undefined ? "" : ` · Karar puanı ${number(ballot.npcScore)}`}</small></div><div><b>${escapeHtml(ballot.candidateName)}</b><small>${escapeHtml(ballot.candidateFamilyName)} · ${number(ballot.seatWeight)} koltuk + ${number(ballot.influenceSpent)} nüfuz = ${number(ballot.totalWeight)}</small></div></div>`;
  }).join("");
}

function romanProposalVoterRows(republic, proposal) {
  const votes = proposal.votes || [];
  const byFamily = new Map(votes.map((vote) => [vote.familyId, vote]));
  return republic.families.map((family) => {
    const vote = byFamily.get(family.id);
    const senator = vote?.senatorName || (family.members || []).find((member) => member.position === "HEAD" && member.status === "ALIVE")?.name || family.name;
    if (!vote) return `<div class="roman-ballot-row pending"><div><strong>${escapeHtml(family.name)}</strong><small>Senatör: ${escapeHtml(senator)}</small></div><span class="pill neutral">${Number(family.player_count) ? "Oyuncu oyu bekleniyor" : proposal.status === "OPEN" ? "NPC oyu kapanışta" : "Oy kullanılmadı"}</span></div>`;
    return `<div class="roman-ballot-row"><div><strong>${escapeHtml(family.name)} · ${escapeHtml(senator)}</strong><small>${escapeHtml(romanVoteSource(vote))}${vote.npcScore === null || vote.npcScore === undefined ? "" : ` · Karar puanı ${number(vote.npcScore)}`}</small></div><div><b>${escapeHtml(romanVoteLabels[vote.choice] || vote.choice)}</b><small>${number(vote.seatWeight)} koltuk + ${number(vote.influenceSpent)} nüfuz = ${number(vote.totalWeight)}</small></div></div>`;
  }).join("");
}

function romanRepublicPanel(republic, currentTurn, businessCatalog = []) {
  const consul = republic.families.find((family) => family.is_consul);
  const allocated = republic.families.reduce((sum, family) => sum + Number(family.senate_seats || 0), 0);
  const election = republic.election;
  const familyCards = republic.families.map((family, index) => {
    const members = family.members || [];
    const businesses = family.businesses || [];
    const activeBusinesses = businesses.filter((business) => business.status === "ACTIVE");
    const businessIncome = activeBusinesses.reduce((sum, business) => sum + Number(business.turnIncome || 0), 0);
    return `<article class="card roman-family-card ${romanFamilyColorKey(family.name, index)}">
      <div class="roman-family-head"><div><span class="roman-color-dot"></span><strong>${escapeHtml(family.name)}</strong><small>${escapeHtml(romanBlocLabels[family.political_bloc] || family.political_bloc)}</small></div><div class="roman-family-actions">${family.is_consul ? '<span class="pill">Konsül ailesi</span>' : `<span class="pill neutral">${number(family.senate_seats)} koltuk</span>`}<button class="button compact" data-edit-roman-family="${family.id}">Aileyi yönet</button><button class="button compact" data-buy-roman-business="${family.id}">＋ İşletme al</button><button class="button primary compact" data-add-roman-member="${family.id}">＋ Üye ekle</button></div></div>
      <div class="roman-family-stats"><span><small>Aile hazinesi</small><strong>${money(family.treasury)}</strong></span><span><small>Siyasi nüfuz</small><strong>${number(family.political_influence)}</strong></span><span><small>İtibar / Skandal</small><strong>${number(family.reputation)} / ${number(family.scandal)}</strong></span><span><small>Oyuncu</small><strong>${number(family.player_count)}</strong></span></div>
      <div class="roman-businesses"><div class="roman-subhead"><strong>Aile işletmeleri</strong><span>${number(activeBusinesses.length)} işletme · tur geliri ${money(businessIncome)}</span></div><div class="roman-business-list">${activeBusinesses.map((business) => { const definition = businessCatalog.find((item) => item.value === business.businessType); return `<span class="roman-business-chip"><b>${escapeHtml(business.settlementName)}</b><small>${escapeHtml(definition ? `${definition.emoji} ${definition.label}` : business.businessType.replaceAll("_", " "))} · ${money(business.turnIncome)}/tur</small></span>`; }).join("") || '<span class="muted">Aktif işletme bulunmuyor.</span>'}</div></div>
      <div class="roman-members">${members.length ? members.map((member) => `<div class="roman-member-row ${member.status === "DEAD" ? "dead" : ""}"><div class="roman-member-meta"><b>${escapeHtml(member.name)}</b><small>${number(member.age)} yaş · ${escapeHtml(dynastyGenderLabels[member.gender] || member.gender)} · ${escapeHtml(romanPositionLabels[member.position] || member.position)}</small><small>${escapeHtml(member.relation)}${member.spouseName ? ` · Eş: ${escapeHtml(member.spouseName)}` : ""}</small>${member.status === "DEAD" ? `<small class="danger-text">Ölü · Tur ${number(member.diedTurn)} · ${escapeHtml(member.deathReason || "Neden belirtilmedi")}</small>` : member.health === "SICK" ? `<small class="warning-text">Hasta · Tur ${number(member.sickUntilTurn)} sonuna kadar</small>` : ""}</div><div class="roman-member-actions"><button class="button compact" data-edit-roman-member="${member.id}" data-family-id="${family.id}">Düzenle</button>${member.status === "ALIVE" ? `<button class="button compact danger" data-kill-roman-member="${member.id}" data-family-id="${family.id}">Öldü</button>` : ""}<button class="button compact danger" data-remove-roman-member="${member.id}" data-family-id="${family.id}">Kaldır</button></div></div>`).join("") : '<span class="muted">Bu ailede kayıtlı üye bulunmuyor.</span>'}</div>
    </article>`;
  }).join("");
  const electionPanels = (republic.elections || (election ? [election] : [])).map((item, index) => `<details class="roman-vote-card" ${index === 0 ? "open" : ""}><summary><div><strong>${number(item.sequence)}. Konsül seçimi</strong><small>Tur ${number(item.started_turn)}–${number(item.closes_turn)}${item.winner_family_name ? ` · Kazanan ${escapeHtml(item.winner_family_name)}` : ""}</small></div><span class="pill ${item.status === "OPEN" ? "" : "neutral"}">${item.status === "OPEN" ? "Açık" : escapeHtml(item.status)}</span></summary><div class="roman-candidate-grid">${(item.candidates || []).map((candidate) => `<span><small>${escapeHtml(candidate.familyName)}</small><strong>${escapeHtml(candidate.candidateName)}</strong><b>${number(candidate.totalWeight)} oy ağırlığı</b></span>`).join("") || '<span class="muted">Aday bulunmuyor.</span>'}</div><div class="roman-ballot-list">${romanElectionVoterRows(republic, item)}</div></details>`).join("");
  const proposalPanels = republic.proposals.map((proposal, index) => {
    const votes = proposal.votes || [];
    const liveYes = votes.filter((vote) => vote.choice === "YES").reduce((sum, vote) => sum + Number(vote.totalWeight || 0), 0);
    const liveNo = votes.filter((vote) => vote.choice === "NO").reduce((sum, vote) => sum + Number(vote.totalWeight || 0), 0);
    const liveAbstain = votes.filter((vote) => vote.choice === "ABSTAIN").length;
    return `<details class="roman-vote-card" ${proposal.status === "OPEN" || index === 0 ? "open" : ""}><summary><div><strong>${escapeHtml(proposal.title)}</strong><small>${escapeHtml(proposal.proposer_family_name)} · Tur ${number(proposal.opened_turn)}–${number(proposal.closes_turn)} · eşik %${number(proposal.threshold_percent)}</small></div><span class="pill ${proposal.status === "OPEN" ? "" : "neutral"}">${proposal.status === "OPEN" ? "Oylamada" : escapeHtml(proposal.status)}</span></summary><p class="roman-proposal-description">${escapeHtml(proposal.description || "Açıklama bulunmuyor.")}</p><div class="roman-vote-totals"><span>Evet <strong>${number(liveYes)}</strong></span><span>Hayır <strong>${number(liveNo)}</strong></span><span>Çekimser <strong>${number(liveAbstain)}</strong></span></div><div class="roman-ballot-list">${romanProposalVoterRows(republic, proposal)}</div></details>`;
  }).join("");
  return `<section class="roman-republic-section">
    <div class="page-head"><div><h1>🏛️ ${escapeHtml(republic.country_name)} · Roma Siyaseti</h1><p>Canlı konsül, seçim, Senato ve siyasi aile görünümü</p></div><div class="actions"><span class="pill">Tur ${number(currentTurn)}</span><span class="pill neutral">${number(republic.families.length)} aile</span></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Mevcut konsül ailesi</span><strong>${escapeHtml(consul?.name || "Belirlenmedi")}</strong></div><div class="detail-cell"><span>Görev dönemi</span><strong>${republic.term_started_turn === null ? "Başlamadı" : `Tur ${number(republic.term_started_turn)}–${number((republic.next_election_turn ?? republic.term_started_turn) - 1)}`}</strong></div><div class="detail-cell"><span>İlk / sonraki seçim</span><strong>${republic.next_election_turn === null ? "Belirlenmedi" : `Tur ${number(republic.next_election_turn)}`}</strong></div><div class="detail-cell"><span>Senato doluluğu</span><strong>${number(allocated)} / ${number(republic.senate_total_seats)}</strong></div></section>
    <section class="card roman-senate-card"><div class="card-head"><div><h2>100 Koltuklu Senato</h2><p>Her nokta bir koltuktur; aile renkleri Discord Senato formuyla aynıdır.</p></div><span class="pill neutral">${number(allocated)} dolu</span></div><div class="roman-seat-grid">${romanSenateSeats(republic.families, republic.senate_total_seats)}</div><div class="roman-legend">${republic.families.map((family, index) => `<span class="${romanFamilyColorKey(family.name, index)}"><i></i>${escapeHtml(family.name)} · ${number(family.senate_seats)}</span>`).join("")}</div></section>
    <div class="section-title"><h2>Siyasi aileler</h2><span>Hazine, nüfuz, koltuk, itibar ve aile kadroları</span></div><section class="roman-family-grid">${familyCards || '<div class="card empty">Roma siyasi ailesi bulunmuyor.</div>'}</section>
    <section class="roman-vote-panels"><div class="card"><div class="card-head"><div><h2>Konsül seçimleri</h2><p>Son dört seçimin aday ve aile bazlı oy dökümü</p></div></div>${electionPanels || '<div class="empty compact-empty">Henüz seçim kaydı yok.</div>'}</div><div class="card"><div class="card-head"><div><h2>Senato oylamaları</h2><p>Her ailenin senatörü, tercihi ve kullandığı siyasi nüfuz</p></div></div>${proposalPanels || '<div class="empty compact-empty">Teklif bulunmuyor.</div>'}</div></section>
  </section>`;
}

async function romanPoliticsPage() {
  setActiveRoute("roman-politics"); loading();
  const data = await api("/api/roman-politics");
  data.republics.forEach((republic) => { republic.current_turn = data.currentTurn; });
  page.innerHTML = data.republics.length
    ? data.republics.map((republic) => romanRepublicPanel(republic, data.currentTurn, data.businessCatalog || [])).join("")
    : '<div class="page-head"><div><h1>Roma Siyaseti</h1><p>Roma Cumhuriyeti iç yönetimi</p></div></div><div class="card empty">Henüz Roma Cumhuriyeti kaydı bulunmuyor. Discord’da /roma-yonetim kur komutunu kullanın.</div>';
  const familyEntries = data.republics.flatMap((republic) => republic.families.map((family) => ({ republic, family })));
  const families = new Map(familyEntries.map((entry) => [entry.family.id, entry]));
  const members = new Map(familyEntries.flatMap(({ republic, family }) => (family.members || []).map((member) => [member.id, { republic, family, member }])));
  document.querySelectorAll("[data-edit-roman-family]").forEach((button) => button.addEventListener("click", () => {
    const entry = families.get(button.dataset.editRomanFamily); if (entry) openRomanFamilyEditor(entry.republic, entry.family);
  }));
  document.querySelectorAll("[data-add-roman-member]").forEach((button) => button.addEventListener("click", () => {
    const entry = families.get(button.dataset.addRomanMember); if (entry) openRomanFamilyMemberEditor(entry.republic, entry.family);
  }));
  document.querySelectorAll("[data-buy-roman-business]").forEach((button) => button.addEventListener("click", () => {
    const entry = families.get(button.dataset.buyRomanBusiness); if (entry) openRomanFamilyBusinessEditor(entry.republic, entry.family, data.businessCatalog || []);
  }));
  document.querySelectorAll("[data-edit-roman-member]").forEach((button) => button.addEventListener("click", () => {
    const entry = members.get(button.dataset.editRomanMember); if (entry) openRomanFamilyMemberEditor(entry.republic, entry.family, entry.member);
  }));
  document.querySelectorAll("[data-kill-roman-member]").forEach((button) => button.addEventListener("click", () => {
    const entry = members.get(button.dataset.killRomanMember); if (entry) openRomanFamilyMemberDeathEditor(entry.republic, entry.family, entry.member);
  }));
  document.querySelectorAll("[data-remove-roman-member]").forEach((button) => button.addEventListener("click", () => {
    const entry = members.get(button.dataset.removeRomanMember); if (entry) openRomanFamilyMemberRemovalEditor(entry.republic, entry.family, entry.member);
  }));
  document.querySelectorAll("[data-roman-npc-preference]").forEach((button) => button.addEventListener("click", () => {
    const republic = data.republics.find((item) => (item.elections || []).some((election) => election.id === button.dataset.electionId));
    const election = republic?.elections?.find((item) => item.id === button.dataset.electionId);
    const preference = election?.npcPreferences?.find((item) => item.voterFamilyId === button.dataset.familyId);
    if (republic && election && preference) openRomanNpcElectionPreferenceEditor(republic, election, preference);
  }));
}

function openRomanNpcElectionPreferenceEditor(republic, election, preference) {
  const candidateOptions = (election.candidates || []).map((candidate) =>
    `<option value="${candidate.id}" ${selected(candidate.id, preference.overrideCandidateId)}>${escapeHtml(candidate.candidateName)} · ${escapeHtml(candidate.familyName)}</option>`
  ).join("");
  openEditor("NPC seçim tercihini değiştir", `${preference.voterFamilyName} · ${preference.senatorName}`,
    `<div class="preview-warning"><strong>Otomatik hesap: ${escapeHtml(preference.predictedCandidateName || "Henüz aday yok")}</strong><span>Yönetici tercihi seçersen bu aile seçim kapanırken belirlediğin adaya oy verir. “Otomatik hesapla” seçeneği ilişki, güven, rekabet, siyasi blok, itibar ve skandal puanlarını yeniden kullanır.</span></div><label>Oy verilecek aday<select id="roman-npc-preference-candidate"><option value="">Otomatik hesapla</option>${candidateOptions}</select></label><label>Değişiklik gerekçesi<textarea id="roman-npc-preference-reason" minlength="2" maxlength="300" rows="3" required placeholder="Örn. Senato dengesi için yönetici tercihi…"></textarea></label>`, async () => {
      const candidateId = document.getElementById("roman-npc-preference-candidate").value || null;
      await api(`/api/admin/roman-elections/${election.id}/npc-preferences/${preference.voterFamilyId}`, {
        method: "POST", body: JSON.stringify({ candidateId, reason: document.getElementById("roman-npc-preference-reason").value })
      });
      closeEditor(); toast(`${preference.voterFamilyName} ailesinin seçim tercihi güncellendi.`); await refreshKeepingScroll(romanPoliticsPage);
    });
}

function openRomanFamilyBusinessEditor(republic, family, catalog) {
  const businessOptions = catalog.map((business) => `<option value="${business.value}">${escapeHtml(business.emoji)} ${escapeHtml(business.label)} · ${money(business.purchaseCost)}</option>`).join("");
  const settlementOptions = (republic.settlements || []).map((settlement) => `<option value="${settlement.id}">${escapeHtml(settlement.name)}</option>`).join("");
  const catalogCards = catalog.map((business) => `<span class="roman-business-option"><b>${escapeHtml(business.emoji)} ${escapeHtml(business.label)}</b><small>Alım ${money(business.purchaseCost)} · Gelir ${money(business.turnIncome)}/tur · Nüfuz +${number(business.influenceOnPurchase)} · Sınır ${number(business.familyLimit)}</small><small>${escapeHtml(business.description)}</small></span>`).join("");
  openEditor("Aile işletmesi satın al", `${republic.country_name} · ${family.name}`, `<div class="preview-warning"><strong>NPC ve oyuncu ailelerinde aynı ekonomi kuralları uygulanır.</strong><span>Bedel aile hazinesinden düşer, işletme geliri sonraki uygun tur işlemlerine dahil edilir ve işlem denetim kaydına yazılır.</span></div><div class="roman-business-catalog">${catalogCards}</div><div class="form-grid"><label>İşletme<select id="roman-business-type" required>${businessOptions}</select></label><label>Yerleşke<select id="roman-business-settlement" required>${settlementOptions}</select></label></div><label>Satın alma gerekçesi<textarea id="roman-business-reason" minlength="2" maxlength="300" rows="3" required placeholder="Örn. NPC aile ekonomisini güçlendirme…"></textarea></label>`, async () => {
    await api(`/api/admin/roman-families/${family.id}/businesses`, { method: "POST", body: JSON.stringify({
      businessType: document.getElementById("roman-business-type").value,
      settlementId: document.getElementById("roman-business-settlement").value,
      reason: document.getElementById("roman-business-reason").value
    }) });
    closeEditor(); toast(`${family.name} ailesi için işletme satın alındı.`); await refreshKeepingScroll(romanPoliticsPage);
  });
}

function openRomanFamilyEditor(republic, family) {
  const blocOptions = Object.entries(romanBlocLabels).map(([value, label]) => `<option value="${value}" ${selected(value, family.political_bloc)}>${escapeHtml(label)}</option>`).join("");
  openEditor("Roma siyasi ailesini yönet", `${republic.country_name} · ${family.name}`, `<div class="preview-warning"><strong>Tam aile yönetimi</strong><span>Ekonomi ve siyasi değerler anında uygulanır. Her değişiklik gerekçesiyle birlikte GM denetim kaydına yazılır.</span></div><div class="form-grid"><label>Aile adı<input id="roman-family-name" value="${escapeHtml(family.name)}" minlength="2" maxlength="80" required></label><label>Aile hazinesi<input id="roman-family-treasury" type="number" min="0" step="1" value="${Number(family.treasury)}" required></label><label>Siyasi nüfuz<input id="roman-family-influence" type="number" min="0" step="1" value="${Number(family.political_influence)}" required></label><label>Senato koltuğu<input id="roman-family-seats" type="number" min="0" max="${Number(republic.senate_total_seats)}" step="1" value="${Number(family.senate_seats)}" required><small>Toplam doluluk ${number(republic.families.reduce((sum, item) => sum + Number(item.senate_seats || 0), 0))} / ${number(republic.senate_total_seats)}.</small></label><label>İtibar<input id="roman-family-reputation" type="number" min="0" max="100" step="1" value="${Number(family.reputation)}" required></label><label>Skandal<input id="roman-family-scandal" type="number" min="0" max="100" step="1" value="${Number(family.scandal)}" required></label><label>Siyasi blok<select id="roman-family-bloc">${blocOptions}</select></label><label>Aile yöneticisi Discord kullanıcı kimliği<input id="roman-family-leader" value="${escapeHtml(family.leader_user_id || "")}" maxlength="30" placeholder="Boş bırakılabilir"></label></div><label>Değişiklik gerekçesi<textarea id="roman-family-reason" minlength="2" maxlength="300" rows="3" required placeholder="Örn. Senato kararı, yönetici düzeltmesi…"></textarea></label>`, async () => {
    await api(`/api/admin/roman-families/${family.id}`, { method: "PATCH", body: JSON.stringify({
      name: document.getElementById("roman-family-name").value,
      treasury: Number(document.getElementById("roman-family-treasury").value),
      politicalInfluence: Number(document.getElementById("roman-family-influence").value),
      senateSeats: Number(document.getElementById("roman-family-seats").value),
      reputation: Number(document.getElementById("roman-family-reputation").value),
      scandal: Number(document.getElementById("roman-family-scandal").value),
      politicalBloc: document.getElementById("roman-family-bloc").value,
      leaderUserId: document.getElementById("roman-family-leader").value.trim() || null,
      reason: document.getElementById("roman-family-reason").value
    }) });
    closeEditor(); toast(`${family.name} güncellendi.`); await refreshKeepingScroll(romanPoliticsPage);
  });
}

function romanFamilyRelationOptions(republic, member, kind) {
  const current = kind === "spouse" ? member?.spouseId : kind === "mother" ? member?.motherId : member?.fatherId;
  const gender = kind === "mother" ? "FEMALE" : kind === "father" ? "MALE" : null;
  const candidates = republic.families.flatMap((family) => (family.members || []).map((candidate) => ({ ...candidate, familyName: family.name })));
  return `<option value="">Yok / belirtilmedi</option>${candidates.filter((candidate) => candidate.id !== member?.id && (!gender || candidate.gender === gender) && (kind !== "spouse" || candidate.id === current || (candidate.status === "ALIVE" && !candidate.spouseId))).map((candidate) => `<option value="${candidate.id}" ${selected(candidate.id, current)}>${escapeHtml(candidate.name)} · ${escapeHtml(candidate.familyName)}${candidate.status === "DEAD" ? " · Ölü" : ""}</option>`).join("")}`;
}

function romanFamilyMemberInput() {
  const optionalId = (id) => document.getElementById(id).value || null;
  const health = document.getElementById("roman-member-health").value;
  return {
    name: document.getElementById("roman-member-name").value,
    gender: document.getElementById("roman-member-gender").value,
    age: Number(document.getElementById("roman-member-age").value),
    position: document.getElementById("roman-member-position").value,
    relation: document.getElementById("roman-member-relation").value,
    health,
    sickUntilTurn: health === "SICK" ? Number(document.getElementById("roman-member-sick-until").value) : null,
    sortOrder: Number(document.getElementById("roman-member-sort-order").value),
    spouseId: optionalId("roman-member-spouse"),
    motherId: optionalId("roman-member-mother"),
    fatherId: optionalId("roman-member-father"),
    reason: document.getElementById("roman-member-reason").value
  };
}

function openRomanFamilyMemberEditor(republic, family, member = null) {
  const dead = member?.status === "DEAD";
  const health = dead ? "HEALTHY" : (member?.health || "HEALTHY");
  const positionOptions = Object.entries(romanPositionLabels).map(([value, label]) => `<option value="${value}" ${selected(value, member?.position || "HOUSEHOLD")}>${escapeHtml(label)}</option>`).join("");
  openEditor(member ? "Roma aile üyesini düzenle" : "Roma ailesine üye ekle", `${family.name} · ${republic.country_name}`, `<div class="preview-warning"><strong>Kimlik, yaş ve aile bağları üzerinde tam denetim</strong><span>Eş seçimi karşılıklı işlenir. Anne, baba ve eş aynı Roma Cumhuriyeti içindeki diğer ailelerden de seçilebilir.</span></div><div class="form-grid"><label>Adı<input id="roman-member-name" value="${escapeHtml(member?.name || "")}" minlength="2" maxlength="80" required></label><label>Cinsiyet<select id="roman-member-gender"><option value="MALE" ${selected("MALE", member?.gender || "MALE")}>Erkek</option><option value="FEMALE" ${selected("FEMALE", member?.gender)}>Kadın</option></select></label><label>Yaş<input id="roman-member-age" type="number" min="0" max="120" step="1" value="${Number(member?.age ?? 0)}" required></label><label>Hanedeki konum<select id="roman-member-position">${positionOptions}</select></label><label>Akrabalık / açıklama<input id="roman-member-relation" value="${escapeHtml(member?.relation || "Hane mensubu")}" minlength="2" maxlength="120" required></label><label>Liste sırası<input id="roman-member-sort-order" type="number" min="-10000" max="10000" step="1" value="${Number(member?.sortOrder ?? 0)}" required></label><label>Sağlık<select id="roman-member-health" ${dead ? "disabled" : ""}><option value="HEALTHY" ${selected("HEALTHY", health)}>Sağlıklı</option><option value="SICK" ${selected("SICK", health)}>Hasta</option></select></label><label>Hastalık bitiş turu<input id="roman-member-sick-until" type="number" min="${Number(republic.current_turn ?? 0)}" step="1" value="${Number(member?.sickUntilTurn ?? Number(republic.current_turn ?? 0) + 3)}" ${dead ? "disabled" : ""}></label><label>Eş<select id="roman-member-spouse">${romanFamilyRelationOptions(republic, member, "spouse")}</select></label><label>Anne<select id="roman-member-mother">${romanFamilyRelationOptions(republic, member, "mother")}</select></label><label>Baba<select id="roman-member-father">${romanFamilyRelationOptions(republic, member, "father")}</select></label></div>${dead ? `<div class="preview-warning"><strong>Ölü üye</strong><span>Kimlik ve akrabalık kaydı düzeltilebilir. Üyeyi yeniden hayata döndürmek yerine kayıt kaldırılıp yeni yaşayan kayıt eklenmelidir.</span></div>` : ""}<label>Değişiklik gerekçesi<textarea id="roman-member-reason" minlength="2" maxlength="300" rows="3" required placeholder="Örn. Oyuncu kadro düzeltmesi, yaş kaydı düzeltmesi…"></textarea></label>`, async () => {
    await api(member ? `/api/admin/roman-family-members/${member.id}` : `/api/admin/roman-families/${family.id}/members`, {
      method: member ? "PATCH" : "POST", body: JSON.stringify(romanFamilyMemberInput())
    });
    closeEditor(); toast(member ? `${member.name} güncellendi.` : `${family.name} ailesine yeni üye eklendi.`); await refreshKeepingScroll(romanPoliticsPage);
  });
}

function openRomanFamilyMemberDeathEditor(republic, family, member) {
  openEditor("Roma aile üyesini öldü olarak işle", `${family.name} · ${member.name}`, `<div class="preview-warning"><strong>Ölüm kalıcı tarih kaydıdır.</strong><span>Üye ölü olarak korunur; bekleyen evlilik ve isim bekleyen doğum işlemleri iptal edilir. Aile kadrosundan tamamen silinmez.</span></div><label>Ölüm nedeni<textarea id="roman-member-death-reason" minlength="2" maxlength="200" rows="3" required placeholder="Örn. Hastalık, savaş, yaşlılık…"></textarea></label>`, async () => {
    await api(`/api/admin/roman-family-members/${member.id}/death`, { method: "POST", body: JSON.stringify({ reason: document.getElementById("roman-member-death-reason").value }) });
    closeEditor(); toast(`${member.name} ölü olarak işlendi.`); await refreshKeepingScroll(romanPoliticsPage);
  });
}

function openRomanFamilyMemberRemovalEditor(republic, family, member) {
  openEditor("Roma aile üyesini kayıttan kaldır", `${family.name} · ${member.name}`, `<div class="preview-warning danger-zone"><strong>Bu işlem aile üyesi kaydını tamamen siler.</strong><span>Evlilik ve doğum bağlantıları etkilenebilir. Tarihsel bir ölüm için bu işlem yerine “Öldü” seçeneğini kullan.</span></div><label>Kaldırma gerekçesi<textarea id="roman-member-remove-reason" minlength="2" maxlength="300" rows="3" required></textarea></label><label>Onay<input id="roman-member-remove-confirmation" required autocomplete="off" placeholder="KALDIR yaz"></label>`, async () => {
    await api(`/api/admin/roman-family-members/${member.id}`, { method: "DELETE", body: JSON.stringify({
      confirmation: document.getElementById("roman-member-remove-confirmation").value.trim(),
      reason: document.getElementById("roman-member-remove-reason").value
    }) });
    closeEditor(); toast(`${member.name} aile kaydından kaldırıldı.`); await refreshKeepingScroll(romanPoliticsPage);
  });
}

const steppeResponseLabels = { PENDING: "Bekliyor", FULL: "Tam Katılım", LIMITED: "Sınırlı Katılım", NEUTRAL: "Tarafsız", REFUSE: "Reddetti", UNANSWERED: "Cevapsız" };

function steppeDelta(value) {
  const amount = Number(value || 0);
  return `${amount > 0 ? "+" : ""}${number(amount)}`;
}

function steppeHegemonyPanel(hegemony, currentTurn) {
  if (!hegemony) return "";
  const openCalls = hegemony.calls.filter((call) => call.status === "OPEN");
  const memberCards = hegemony.members.map((member) => `<article class="card dynasty-card">
    <div class="card-head"><div><h3>🏹 ${escapeHtml(member.khan_title_name || member.country_name + " Hanı")}</h3><p>${escapeHtml(member.country_name)} · Hanlar Hanına bağlı</p></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Han</span><strong>${escapeHtml(member.khan_holder_name || "Henüz Atanmadı")}</strong><small>${member.khan_holder_user_id ? `Discord: ${escapeHtml(member.khan_holder_user_id)}` : "Oyuncu atanmamış"}</small></div><div class="detail-cell"><span>Konum</span><strong>Bağlı Han</strong><small>Haraç ve üst savaş çağrısına tabidir.</small></div></section>
  </article>`).join("");
  const callCards = hegemony.calls.map((call) => `<article class="card"><div class="card-head"><div><h3>${escapeHtml(call.target_label)}</h3><p>Tur ${number(call.opened_turn)} · ${escapeHtml(call.reason)}</p></div><span class="pill ${call.status === "OPEN" ? "warning" : "neutral"}">${call.status === "OPEN" ? "Yanıt bekliyor" : "Kapandı"}</span></div>${call.responses.map((response) => `<div class="data-row"><div><strong>${escapeHtml(response.khanTitleName || response.countryName + " Hanı")}</strong><small>${escapeHtml(response.khanHolderName || response.countryName)}</small></div><span>${escapeHtml(steppeResponseLabels[response.response] || response.response)}</span><small>Otorite ${steppeDelta(response.authorityDelta)}</small></div>`).join("") || '<div class="empty compact-empty">Çağrıya bağlı Han bulunmuyor.</div>'}</article>`).join("");
  const eventRows = hegemony.events.map((event) => `<div class="data-row"><div><strong>Tur ${number(event.game_turn)} · ${escapeHtml(event.country_name || "Hanlar Hanlığı")}</strong><small>${escapeHtml(event.description)}</small></div><span>Otorite ${steppeDelta(event.authority_delta)}</span></div>`).join("");
  return `<section class="roman-republic-section">
    <div class="page-head"><div><h1>👑 ${escapeHtml(hegemony.hegemon_country_name)} · Hanlar Hanlığı</h1><p>Hanlar Hanı → bağlı Dingling ve Xianbei Hanları</p></div><div class="actions"><span class="pill">Tur ${number(currentTurn)}</span><button class="button primary" data-edit-steppe-hegemony>Hanlar Hanı otoritesini düzenle</button></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Hanlar Hanı Devleti</span><strong>${escapeHtml(hegemony.hegemon_country_name)}</strong></div><div class="detail-cell"><span>Hanlar Hanı</span><strong>${escapeHtml(hegemony.great_khan_holder_name || "Henüz Atanmadı")}</strong><small>${escapeHtml(hegemony.great_khan_title_name || "Xiongnu Hanı")}</small></div><div class="detail-cell"><span>Üst Otorite</span><strong>${number(hegemony.authority)} / 100</strong></div><div class="detail-cell"><span>Bağlı Han / Açık Çağrı</span><strong>${number(hegemony.members.length)} / ${number(openCalls.length)}</strong></div></section>
    <div class="section-title"><h2>Hanlar Hanlığı Hiyerarşisi</h2><span>Dingling ve Xianbei Hanları doğrudan Hanlar Hanına bağlıdır</span></div><section class="dynasty-grid">${memberCards || '<div class="card empty">Bağlı Han bulunmuyor.</div>'}</section>
    <div class="section-title"><h2>Hanlar Hanı Savaş Çağrıları</h2><span>Eksik veya olumsuz yanıtlar üst otoriteyi düşürür</span></div><section class="content-grid">${callCards || '<div class="card empty">Henüz üst savaş çağrısı bulunmuyor.</div>'}</section>
    <section class="card"><div class="card-head"><div><h2>Hanlar Hanlığı Kayıtları</h2><p>Haraç dışındaki üst siyasi olaylar</p></div></div>${eventRows || '<div class="empty compact-empty">Henüz üst siyasi kayıt yok.</div>'}</section>
  </section>`;
}

function steppeConfederationPanel(confederation, currentTurn) {
  const titleCards = confederation.titles.map((title) => `<article class="card dynasty-card">
    <div class="card-head"><div><h3>👑 ${escapeHtml(title.title_name)}</h3><p>${confederation.isHegemon ? "Hanlar Hanı makamı" : "Hanlık kademesi"}</p></div><button class="button compact" data-edit-steppe-title="${title.id}">Hanı düzenle</button></div>
    <section class="detail-grid"><div class="detail-cell"><span>Han</span><strong>${escapeHtml(title.holder_name)}</strong><small>${title.holder_user_id ? `Discord: ${escapeHtml(title.holder_user_id)}` : "Oyuncu atanmamış"}</small></div><div class="detail-cell"><span>Kurultay</span><strong>2 oy puanı</strong><small>Aday olabilen tek kademe</small></div></section>
  </article>`).join("");
  const settlementRows = (confederation.directSettlements || []).map((settlement) => `<div class="data-row"><div><strong>${escapeHtml(settlement.name)}</strong><small>Nüfus ${number(settlement.population)}</small></div><span>${number(settlement.land_trade_income)} kara ticareti</span></div>`).join("");
  const vassalCards = (confederation.vassals || []).map((vassal) => `<article class="card dynasty-card"><div class="card-head"><div><h3>♞ ${escapeHtml(vassal.name)}</h3><p>Normal devlet vassallığı · Tur ${number(vassal.started_turn)}</p></div><span class="pill neutral">Vassal</span></div><p class="muted">Bu devlet bozkır makamı değildir; kendi ülke, hanedan, ordu ve yerleşke kayıtlarını kullanır.</p></article>`).join("");
  const eventRows = confederation.events.map((event) => `<div class="data-row"><div><strong>Tur ${number(event.game_turn)} · ${escapeHtml(event.title_name || "Konfederasyon")}</strong><small>${escapeHtml(event.description)}</small></div><span>Otorite ${steppeDelta(event.authority_delta)}</span></div>`).join("");
  return `<section class="roman-republic-section">
    <div class="page-head"><div><h1>🐎 ${escapeHtml(confederation.country_name)} · ${confederation.isHegemon ? "Hanlar Hanı Devleti" : "Hanlık"}</h1><p>Bağımsız devlet yapısı, Han makamı ve normal vassalları</p></div><div class="actions"><span class="pill">Tur ${number(currentTurn)}</span><span class="pill ${confederation.isHegemon ? "warning" : "neutral"}">${confederation.isHegemon ? "Hanlar Hanı" : "Bağlı Han"}</span></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Siyasi kademe</span><strong>${confederation.isHegemon ? "Hanlar Hanı" : "Han"}</strong></div><div class="detail-cell"><span>Doğrudan yerleşke</span><strong>${number((confederation.directSettlements || []).length)}</strong></div><div class="detail-cell"><span>Normal vassal</span><strong>${number((confederation.vassals || []).length)}</strong></div><div class="detail-cell"><span>Ordu doktrini</span><strong>Bozkır özel kompozisyonu</strong><small>Yalnız üç konfederasyonda aktiftir.</small></div></section>
    <div class="section-title"><h2>Han makamı</h2><span>Toprak Ağası kademesi kullanılmaz</span></div><section class="dynasty-grid">${titleCards || '<div class="card empty">Etkin Han makamı bulunmuyor.</div>'}</section>
    <div class="section-title"><h2>Doğrudan yerleşkeler</h2><span>Yalnız bu devletin kendi mülkleri</span></div><section class="card">${settlementRows || '<div class="empty compact-empty">Doğrudan yerleşke bulunmuyor.</div>'}</section>
    <div class="section-title"><h2>Bağlı normal devletler</h2><span>Vassallık sistemi üzerinden yönetilir; bozkır makamı sayılmazlar</span></div><section class="dynasty-grid">${vassalCards || '<div class="card empty">Henüz normal vassal bağlanmamış.</div>'}</section>
    <section class="card"><div class="card-head"><div><h2>Son siyasi kayıtlar</h2><p>Han makamı ve yönetici işlemleri</p></div></div>${eventRows || '<div class="empty compact-empty">Henüz siyasi kayıt yok.</div>'}</section>
  </section>`;
}

function steppeKurultayPanel(kurultay) {
  if (!kurultay) return `<section class="card"><div class="card-head"><div><h2>🏕️ Büyük Bozkır Kurultayı</h2><p>İlk Kurultay henüz açılmadı.</p></div></div><div class="empty compact-empty">Kurultay, Discord’daki yönetici komutuyla vaktinde açılır.</div></section>`;
  const totalPoints = kurultay.voters.reduce((sum, voter) => sum + Number(voter.weight), 0);
  const castPoints = kurultay.voters.filter((voter) => voter.candidateTitleId).reduce((sum, voter) => sum + Number(voter.weight), 0);
  const candidateRows = kurultay.candidates.map((candidate) => `<div class="data-row"><div><strong>👑 ${escapeHtml(candidate.holderName)}</strong><small>${escapeHtml(candidate.titleName)} · ${escapeHtml(candidate.countryName)}</small></div><span>${number(candidate.points)} puan</span><small>${number(candidate.ballotCount)} seçmen oyu</small></div>`).join("");
  const voterRows = kurultay.voters.map((voter) => `<div class="data-row"><div><strong>${voter.tier === "KHAN" ? "👑" : "🐎"} ${escapeHtml(voter.voterName)}</strong><small>${escapeHtml(voter.representativeName)} · ${escapeHtml(voter.countryName)}${voter.holderUserId ? " · Oyuncu" : " · NPC"}</small></div><span>${number(voter.weight)} puan</span><small>${voter.candidateTitleName ? `Oy: ${escapeHtml(voter.candidateTitleName)}` : "Henüz oy yok"}</small></div>`).join("");
  return `<section class="roman-republic-section">
    <div class="page-head"><div><h1>🏕️ ${number(kurultay.sequence)}. Büyük Bozkır Kurultayı</h1><p>Hanlar Hanı seçimi · Hanlar 2, vassal devletler 1 oy puanı kullanır</p></div><div class="actions"><span class="pill ${kurultay.status === "OPEN" ? "warning" : "neutral"}">${kurultay.status === "OPEN" ? "Oy kullanımı açık" : kurultay.status === "COMPLETED" ? "Sonuçlandı" : "İptal"}</span>${kurultay.status === "OPEN" ? '<button class="button primary" data-steppe-kurultay-npc-vote>NPC oyu kullan</button>' : ""}</div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Açılış turu</span><strong>Tur ${number(kurultay.startedTurn)}</strong></div><div class="detail-cell"><span>Mevcut Hanlar Hanı</span><strong>${escapeHtml(kurultay.incumbentCountryName)}</strong></div><div class="detail-cell"><span>Katılım</span><strong>${number(castPoints)} / ${number(totalPoints)} puan</strong></div><div class="detail-cell"><span>Sonraki Kurultay</span><strong>Tur ${number(kurultay.nextKurultayTurn)}</strong></div></section>
    <div class="section-title"><h2>Han adayları</h2><span>Yalnız Hanlık kademesindeki Xiongnu, Dingling ve Xianbei makamları aday olabilir</span></div><section class="card">${candidateRows || '<div class="empty compact-empty">Han adayı bulunmuyor.</div>'}</section>
    <div class="section-title"><h2>Seçmen oyları</h2><span>Oyunculu Hanlar ve vassallar Discord formundan, NPC seçmenler bu panelden oy kullanır</span></div><section class="card">${voterRows || '<div class="empty compact-empty">Oy kullanabilecek seçmen bulunmuyor.</div>'}</section>
  </section>`;
}

function steppeTributePanel(hegemony, offers, currentTurn) {
  const responseLabels = { PENDING: "Yanıt bekliyor", FULL: "Tam ödeme", HALF: "Yarım ödeme", NONE: "Ödeme yok", CANCELLED: "İptal" };
  const snapshotMoney = (value) => value === null || value === undefined ? "—" : money(value);
  const signedMoney = (value) => value === null || value === undefined ? "—" : `${Number(value) > 0 ? "+" : ""}${money(value)}`;
  const rows = (offers || []).map((offer) => {
    const paid = offer.paid_amount === null || offer.paid_amount === undefined ? null : Number(offer.paid_amount);
    return `<article class="card">
      <div class="card-head"><div><h2>${escapeHtml(offer.hegemon_country_name)} → ${escapeHtml(offer.tributary_country_name)}</h2><p>Tur ${number(offer.turn)} · ${date(offer.created_at)}</p></div><span class="pill ${offer.response === "PENDING" ? "warning" : offer.response === "CANCELLED" ? "neutral" : "success"}">${escapeHtml(responseLabels[offer.response] || offer.response)}</span></div>
      <section class="detail-grid">
        <div class="detail-cell"><span>Haraç Öncesi Hazine</span><strong>${snapshotMoney(offer.treasury_before)}</strong></div>
        <div class="detail-cell"><span>Alım Turu Geliri</span><strong>${signedMoney(offer.acquisition_income)}</strong><small>Haraç hesabına esas net gelir</small></div>
        <div class="detail-cell"><span>Haraç Tutarı</span><strong>${paid === null ? "Henüz ödenmedi" : money(paid)}</strong><small>Tam talep: ${money(offer.full_due)}</small></div>
        <div class="detail-cell"><span>Ödeme Sonrası Kalan Hazine</span><strong>${snapshotMoney(offer.treasury_after)}</strong></div>
      </section>
    </article>`;
  }).join("");
  return `<section class="roman-republic-section">
    <div class="page-head"><div><h1>🐎 Bozkır Haracı</h1><p>Yalnız Alım Turlarında: Hanlar Hanı → Hanlar ve kendi vassalları, Han → kendi vassalları</p></div><div class="actions"><span class="pill">Tur ${number(currentTurn)}</span></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Mevcut Hanlar Hanı devleti</span><strong>${escapeHtml(hegemony?.hegemon_country_name || "Henüz belirlenmedi")}</strong></div><div class="detail-cell"><span>Haraç oranı</span><strong>Tam %10 · Yarım %5</strong><small>Hedef devletin son Alım Turu net geliri üzerinden</small></div><div class="detail-cell"><span>Yanıtlar</span><strong>Tam · Yarım · Yok</strong><small>Otorite veya bağlılık puanı uygulanmaz</small></div></section>
    <div class="section-title"><h2>Geçmiş Haraç İşlemleri</h2><span>Son 30 teklif ve ayrıntılı hazine hareketi</span></div><section class="dynasty-grid">${rows || '<div class="card empty">Henüz haraç teklifi bulunmuyor.</div>'}</section>
  </section>`;
}

async function steppePoliticsPage() {
  setActiveRoute("steppe-politics"); loading();
  const data = await api("/api/steppe-politics");
  {
    page.innerHTML = [
      `<div class="page-head"><div><h1>Bozkır Kurultayı ve Haraç</h1><p>Bozkır devletleri diğer devletlerle aynı komutları kullanır; burada yalnız iki özel işlem yönetilir.</p></div></div>`,
      steppeKurultayPanel(data.kurultay),
      steppeTributePanel(data.hegemony, data.tributeOffers, data.currentTurn)
    ].join("");
    document.querySelector("[data-steppe-kurultay-npc-vote]")?.addEventListener("click", () => {
      const kurultay = data.kurultay;
      if (!kurultay || kurultay.status !== "OPEN") return;
      const voters = kurultay.voters.filter((voter) => !voter.holderUserId && !voter.candidateTitleId);
      if (!voters.length) return toast("Oy kullanmamış NPC Han veya vassal bulunmuyor.", "error");
      const voterOptions = voters.map((voter) => `<option value="${voter.voterId}">${escapeHtml(voter.voterName)} · ${escapeHtml(voter.representativeName)} · ${number(voter.weight)} puan</option>`).join("");
      const candidateOptions = kurultay.candidates.map((candidate) => `<option value="${candidate.titleId}">${escapeHtml(candidate.holderName)} · ${escapeHtml(candidate.countryName)}</option>`).join("");
      openEditor("NPC Kurultay oyu", `${number(kurultay.sequence)}. Büyük Bozkır Kurultayı`, `<div class="preview-warning"><strong>Oy kesindir ve değiştirilemez.</strong><span>Yalnız oyuncuya atanmamış Hanlar ve vassal devletler panelden oy kullanabilir.</span></div><div class="form-grid"><label>Oy kullanacak NPC seçmen<select id="steppe-kurultay-voter" required>${voterOptions}</select></label><label>Han adayı<select id="steppe-kurultay-candidate" required>${candidateOptions}</select></label></div>`, async () => {
        await api(`/api/admin/steppe-kurultay/${kurultay.id}/vote`, { method: "POST", body: JSON.stringify({ voterId: document.getElementById("steppe-kurultay-voter").value, candidateTitleId: document.getElementById("steppe-kurultay-candidate").value }) });
        closeEditor(); toast("NPC Kurultay oyu kaydedildi."); await refreshKeepingScroll(steppePoliticsPage);
      });
    });
    return;
  }
  const sections = [steppeHegemonyPanel(data.hegemony, data.currentTurn), steppeKurultayPanel(data.kurultay), ...data.confederations.map((confederation) => steppeConfederationPanel(confederation, data.currentTurn))].filter(Boolean);
  page.innerHTML = sections.length
    ? sections.join("")
    : '<div class="page-head"><div><h1>Bozkır Siyaseti</h1><p>Üç konfederasyonlu Hanlar Hanlığı</p></div></div><div class="card empty">Xiongnu, Dingling ve Xianbei bozkır kayıtları bulunamadı.</div>';
  const titles = new Map(data.confederations.flatMap((confederation) => confederation.titles).map((title) => [title.id, title]));
  document.querySelector("[data-steppe-kurultay-npc-vote]")?.addEventListener("click", () => {
    const kurultay = data.kurultay;
    if (!kurultay || kurultay.status !== "OPEN") return;
    const voters = kurultay.voters.filter((voter) => !voter.holderUserId && !voter.candidateTitleId);
    if (!voters.length) return toast("Oy kullanmamış NPC bozkır makamı bulunmuyor.", "error");
    const voterOptions = voters.map((voter) => `<option value="${voter.voterId}">${escapeHtml(voter.voterName)} · ${escapeHtml(voter.representativeName)} · ${number(voter.weight)} puan</option>`).join("");
    const candidateOptions = kurultay.candidates.map((candidate) => `<option value="${candidate.titleId}">${escapeHtml(candidate.holderName)} · ${escapeHtml(candidate.titleName)} · ${escapeHtml(candidate.countryName)}</option>`).join("");
    openEditor("NPC Kurultay oyu", `${number(kurultay.sequence)}. Büyük Bozkır Kurultayı`, `<div class="preview-warning"><strong>Oy kesindir ve değiştirilemez.</strong><span>Yalnız oyuncuya atanmamış Hanlar ve vassal devletler panelden oy kullanabilir.</span></div><div class="form-grid"><label>Oy kullanacak NPC seçmen<select id="steppe-kurultay-voter" required>${voterOptions}</select></label><label>Han adayı<select id="steppe-kurultay-candidate" required>${candidateOptions}</select></label></div>`, async () => {
      await api(`/api/admin/steppe-kurultay/${kurultay.id}/vote`, { method: "POST", body: JSON.stringify({ voterId: document.getElementById("steppe-kurultay-voter").value, candidateTitleId: document.getElementById("steppe-kurultay-candidate").value }) });
      closeEditor(); toast("NPC Kurultay oyu kaydedildi."); await refreshKeepingScroll(steppePoliticsPage);
    });
  });
  document.querySelector("[data-edit-steppe-hegemony]")?.addEventListener("click", () => {
    if (!data.hegemony) return;
    openEditor("Hanlar Hanı otoritesi", data.hegemony.hegemon_country_name, `<div class="form-grid"><label>Üst otorite<input id="edit-steppe-hegemony-authority" type="number" min="0" max="100" step="1" value="${number(data.hegemony.authority)}" required></label><label class="full">Düzenleme gerekçesi<textarea id="edit-steppe-hegemony-reason" maxlength="300" required></textarea></label></div>`, async () => {
      await api("/api/admin/steppe-hegemony", { method: "PATCH", body: JSON.stringify({ authority: Number(document.getElementById("edit-steppe-hegemony-authority").value), reason: document.getElementById("edit-steppe-hegemony-reason").value }) });
      closeEditor(); toast("Hanlar Hanı otoritesi güncellendi."); await refreshKeepingScroll(steppePoliticsPage);
    });
  });
  document.querySelectorAll("[data-edit-steppe-title]").forEach((button) => button.addEventListener("click", () => {
    const title = titles.get(button.dataset.editSteppeTitle);
    if (!title) return;
    openEditor("Bozkır makamını düzenle", title.title_name, `<div class="form-grid"><label>Makam sahibi<input id="edit-steppe-holder-name" maxlength="100" value="${escapeHtml(title.holder_name)}" required></label><label>Discord kullanıcı kimliği<input id="edit-steppe-holder-user" value="${escapeHtml(title.holder_user_id || "")}" placeholder="Oyuncusuz makam için boş bırak"></label><label class="full">Düzenleme gerekçesi<textarea id="edit-steppe-title-reason" maxlength="300" required></textarea></label></div>`, async () => {
      await api(`/api/admin/steppe-titles/${title.id}`, { method: "PATCH", body: JSON.stringify({ holderName: document.getElementById("edit-steppe-holder-name").value, holderUserId: document.getElementById("edit-steppe-holder-user").value || null, reason: document.getElementById("edit-steppe-title-reason").value }) });
      closeEditor(); toast("Bozkır makamı güncellendi."); await refreshKeepingScroll(steppePoliticsPage);
    });
  }));
}

function dynastyMemberConnections(member) {
  const values = [
    member.spouse_name ? `Eş: ${member.spouse_name}` : "",
    member.mother_name ? `Anne: ${member.mother_name}` : "",
    member.father_name ? `Baba: ${member.father_name}` : ""
  ].filter(Boolean);
  return values.join(" · ") || "Akrabalık bağlantısı girilmemiş";
}

function canMarryLocalNoble(member) {
  return member.status === "ALIVE" && Number(member.age) >= 16 &&
    (!member.spouse_id || member.spouse_status === "DEAD");
}

function dynastyTrait(dynasty, member) {
  return (dynasty.traitCatalog || []).find((trait) => trait.key === member?.trait_key) || null;
}

function nobleTraitVisual(trait, actions = "") {
  if (!trait) {
    return `<div class="noble-trait-card noble-trait-empty"><div class="noble-trait-head"><span class="noble-trait-icon">◇</span><div><strong>Trait atanmamış</strong><small>İstersen rastgele belirleyebilirsin</small></div></div>${actions ? `<div class="noble-trait-actions">${actions}</div>` : ""}</div>`;
  }
  const meta = {
    POSITIVE: { label: "Olumlu", icon: "✦", tone: "positive" },
    MIXED: { label: "Karma", icon: "◈", tone: "mixed" },
    NEGATIVE: { label: "Olumsuz", icon: "◆", tone: "negative" }
  }[trait.category] || { label: "Soylu traiti", icon: "✦", tone: "mixed" };
  return `<div class="noble-trait-card noble-trait-${meta.tone}"><div class="noble-trait-head"><span class="noble-trait-icon">${meta.icon}</span><div><strong>${escapeHtml(trait.name)}</strong><small>${meta.label}</small></div></div><p>${escapeHtml(trait.effects.join(" · "))}</p>${actions ? `<div class="noble-trait-actions">${actions}</div>` : ""}</div>`;
}

function dynastyTraitOptions(dynasty, member) {
  const groups = [["POSITIVE", "Olumlu"], ["MIXED", "Karma"], ["NEGATIVE", "Olumsuz"]];
  return `<option value="" ${member?.trait_key ? "" : "selected"}>Traitsiz</option>${groups.map(([key, label]) => `<optgroup label="${label}">${(dynasty.traitCatalog || []).filter((trait) => trait.category === key).map((trait) => `<option value="${trait.key}" ${selected(trait.key, member?.trait_key)}>${escapeHtml(trait.name)} — ${escapeHtml(trait.effects.join(" · "))}</option>`).join("")}</optgroup>`).join("")}`;
}

async function dynastyDetailPage(dynastyId) {
  setActiveRoute("dynasties"); loading();
  const dynasty = await api(`/api/dynasties/${dynastyId}`);
  const alive = dynasty.members.filter((member) => member.status === "ALIVE");
  const sick = alive.filter((member) => member.health === "SICK");
  const localMarriageCandidates = alive.filter(canMarryLocalNoble);
  page.innerHTML = `<div class="page-head dynasty-detail-head"><div><button class="button compact" data-back-dynasties>← Hanedanlar</button><span class="overview-kicker">HANEDAN YÖNETİMİ</span><h1>${escapeHtml(dynasty.name)}</h1><p>${escapeHtml(dynasty.country_name)} · Tur ${number(dynasty.current_turn)}</p></div><div class="actions"><button class="button" data-edit-dynasty="${dynasty.id}">Hanedanı düzenle</button><button class="button" data-local-noble-marriage="${dynasty.id}" ${localMarriageCandidates.length ? "" : "disabled"}>Yerel soyluyla evlendir</button><button class="button primary" data-add-dynasty-member="${dynasty.id}">＋ Yeni üye / akraba</button></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Toplam üye</span><strong>${number(dynasty.members.length)}</strong></div><div class="detail-cell"><span>Hayatta</span><strong>${number(alive.length)}</strong></div><div class="detail-cell"><span>Hasta</span><strong>${number(sick.length)}</strong></div><div class="detail-cell"><span>Son doğum denemesi</span><strong>${dynasty.last_birth_attempt_turn === null ? "—" : `Tur ${number(dynasty.last_birth_attempt_turn)}`}</strong></div></section>
    <div class="section-title"><h2>Hanedan üyeleri</h2><span>Ad, yaş, unvan, sağlık ve akrabalık düzenlenebilir</span></div>
    <section class="card table-wrap dynasty-members-wrap"><table class="dynasty-member-table"><thead><tr><th>Üye</th><th>Konum</th><th>Yaş / Cinsiyet</th><th>Sağlık</th><th>Soylu traiti</th><th>Akrabalık bağları</th><th>Veraset</th><th></th></tr></thead><tbody>${dynasty.members.map((member) => {
      const trait = dynastyTrait(dynasty, member);
      const traitActions = `<button class="button compact" data-reroll-dynasty-trait="${member.id}">↻ Rastgele</button>${trait ? `<button class="button compact danger ghost" data-remove-dynasty-trait="${member.id}">Kaldır</button>` : ""}`;
      return `<tr class="dynasty-member-row ${member.status === "DEAD" ? "is-dead" : ""}"><td><div class="dynasty-member-identity"><span class="dynasty-member-avatar">${escapeHtml(member.name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?")}</span><div><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.title)}</small></div></div></td><td><strong class="dynasty-relation">${escapeHtml(member.relation)}</strong></td><td>${member.age === null ? "—" : number(member.age)} · ${escapeHtml(dynastyGenderLabels[member.gender] || member.gender)}</td><td><span class="pill ${member.status === "DEAD" ? "neutral" : member.health === "SICK" ? "warning" : ""}">${member.status === "DEAD" ? "Ölü" : escapeHtml(dynastyHealthLabels[member.health] || member.health)}</span>${member.health === "SICK" && member.sick_until_turn !== null ? `<small>Tur ${number(member.sick_until_turn)} sonuna kadar</small>` : member.status === "DEAD" ? `<small>Tur ${number(member.died_turn)} · ${escapeHtml(member.death_reason || "Neden belirtilmedi")}</small>` : ""}</td><td class="dynasty-trait-cell">${nobleTraitVisual(trait, traitActions)}</td><td><small class="dynasty-connections">${escapeHtml(dynastyMemberConnections(member))}</small></td><td>${member.is_monarch ? '<span class="pill succession monarch">Hükümdar</span>' : member.is_heir ? '<span class="pill succession heir">Varis</span>' : member.succession_rank ? `<span class="succession-rank">Sıra ${number(member.succession_rank)}</span>` : "—"}</td><td><div class="row-actions dynasty-row-actions"><button class="button compact" data-edit-dynasty-member="${member.id}">Düzenle</button>${member.status === "ALIVE" ? `<button class="button compact danger" data-kill-dynasty-member="${member.id}">Öldü olarak işle</button>` : ""}</div></td></tr>`;
    }).join("") || '<tr><td colspan="8" class="empty">Hanedan üyesi bulunmuyor.</td></tr>'}</tbody></table></section>
    <div class="section-title"><h2>Son hanedan olayları</h2><span>${number(dynasty.events.length)} kayıt</span></div><section class="card">${dynasty.events.map((event) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(dynastyEventLabels[event.event_type] || event.event_type.replaceAll("_", " "))}</strong><span>Tur ${number(event.game_turn)}${event.member_name ? ` · ${escapeHtml(event.member_name)}` : ""}</span></div></div>`).join("") || '<div class="empty">Henüz hanedan olayı bulunmuyor.</div>'}</section>`;
  document.querySelector("[data-back-dynasties]").addEventListener("click", dynastiesPage);
  document.querySelector("[data-edit-dynasty]").addEventListener("click", () => openDynastyEditor(dynasty));
  document.querySelector("[data-add-dynasty-member]").addEventListener("click", () => openDynastyMemberEditor(dynasty));
  document.querySelector("[data-local-noble-marriage]")?.addEventListener("click", () => openLocalNobleMarriageEditor(dynasty));
  document.querySelectorAll("[data-edit-dynasty-member]").forEach((button) => button.addEventListener("click", () => {
    openDynastyMemberEditor(dynasty, dynasty.members.find((member) => member.id === button.dataset.editDynastyMember));
  }));
  document.querySelectorAll("[data-kill-dynasty-member]").forEach((button) => button.addEventListener("click", () => {
    openDynastyDeathEditor(dynasty, dynasty.members.find((member) => member.id === button.dataset.killDynastyMember));
  }));
  document.querySelectorAll("[data-reroll-dynasty-trait]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/admin/dynasty-members/${button.dataset.rerollDynastyTrait}/trait`, { method: "POST", body: JSON.stringify({ action: "REROLL" }) });
    toast("Soylu traiti yeniden belirlendi."); await refreshKeepingScroll(() => dynastyDetailPage(dynasty.id));
  }));
  document.querySelectorAll("[data-remove-dynasty-trait]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/admin/dynasty-members/${button.dataset.removeDynastyTrait}/trait`, { method: "POST", body: JSON.stringify({ action: "REMOVE" }) });
    toast("Soylu traiti kaldırıldı."); await refreshKeepingScroll(() => dynastyDetailPage(dynasty.id));
  }));
}

function openDynastyEditor(dynasty) {
  openEditor("Hanedanı düzenle", dynasty.country_name, `<label>Hanedan adı<input id="edit-dynasty-name" value="${escapeHtml(dynasty.name)}" required minlength="2" maxlength="80"></label>`, async () => {
    await api(`/api/admin/dynasties/${dynasty.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-dynasty-name").value }) });
    closeEditor(); toast("Hanedan bilgileri güncellendi."); await refreshKeepingScroll(() => dynastyDetailPage(dynasty.id));
  });
}

function openLocalNobleMarriageEditor(dynasty) {
  const candidates = dynasty.members.filter(canMarryLocalNoble);
  if (!candidates.length) return toast("Bu hanedanda yerel soyluyla evlenebilecek uygun üye bulunmuyor.", "error");
  const options = candidates.map((member) => `<option value="${member.id}">${escapeHtml(member.name)} · ${escapeHtml(dynastyGenderLabels[member.gender] || member.gender)} · ${number(member.age)} yaş · ${escapeHtml(member.title)}${member.spouse_status === "DEAD" ? " · Dul" : ""}</option>`).join("");
  openEditor(
    "Yerel soyluyla evlendir",
    `${dynasty.country_name} · ${dynasty.name}`,
    `<div class="preview-warning"><strong>Erkek ve kadın hanedan üyeleri evlendirilebilir.</strong><span>Erkek üyeye kadın, kadın üyeye erkek yerel soylu eş oluşturulur. Dul üyeler yeniden evlenebilir; yeni eş veraset sırasına girmez.</span></div><label>Evlenecek hanedan üyesi<select id="local-noble-member">${options}</select></label><div class="form-grid"><label>Yerel soylunun adı<input id="local-noble-first-name" minlength="2" maxlength="50" required></label><label>Soyadı (isteğe bağlı)<input id="local-noble-surname" maxlength="50" placeholder="Boş bırakılabilir"></label><label>Yaşı<input id="local-noble-age" type="number" min="16" max="120" step="1" value="18" required></label></div>`,
    async () => {
      await api(`/api/admin/dynasties/${dynasty.id}/local-noble-marriages`, {
        method: "POST",
        body: JSON.stringify({
          memberId: document.getElementById("local-noble-member").value,
          firstName: document.getElementById("local-noble-first-name").value,
          surname: document.getElementById("local-noble-surname").value.trim() || null,
          age: Number(document.getElementById("local-noble-age").value)
        })
      });
      closeEditor(); toast("Yerel soylu evliliği hanedana işlendi."); await refreshKeepingScroll(() => dynastyDetailPage(dynasty.id));
    }
  );
}

function dynastyRelationOptions(dynasty, member, kind) {
  const gender = kind === "mother" ? "FEMALE" : kind === "father" ? "MALE" : null;
  const current = kind === "spouse" ? member?.spouse_id : kind === "mother" ? member?.mother_id : member?.father_id;
  const candidates = dynasty.relationCandidates || dynasty.members;
  return `<option value="">Yok / belirtilmedi</option>${candidates.filter((candidate) => candidate.id !== member?.id && (!gender || candidate.gender === gender) && (kind !== "spouse" || candidate.id === current || (candidate.status === "ALIVE" && !candidate.spouse_id))).map((candidate) => `<option value="${candidate.id}" ${selected(candidate.id, current)}>${escapeHtml(candidate.name)} · ${escapeHtml(candidate.title)} · ${escapeHtml(candidate.country_name || dynasty.country_name)}${candidate.status === "DEAD" ? " · Ölü" : ""}</option>`).join("")}`;
}

function dynastyMemberInput() {
  const nullable = (id) => document.getElementById(id).value || null;
  return {
    name: document.getElementById("dynasty-member-name").value,
    gender: document.getElementById("dynasty-member-gender").value,
    age: Number(document.getElementById("dynasty-member-age").value),
    title: document.getElementById("dynasty-member-title").value,
    relation: document.getElementById("dynasty-member-relation").value,
    health: document.getElementById("dynasty-member-health").value,
    sickUntilTurn: nullable("dynasty-member-sick-until") === null ? null : Number(document.getElementById("dynasty-member-sick-until").value),
    isMonarch: document.getElementById("dynasty-member-monarch").checked,
    isHeir: document.getElementById("dynasty-member-heir").checked,
    successionRank: nullable("dynasty-member-rank") === null ? null : Number(document.getElementById("dynasty-member-rank").value),
    spouseId: nullable("dynasty-member-spouse"), motherId: nullable("dynasty-member-mother"), fatherId: nullable("dynasty-member-father"),
    traitKey: nullable("dynasty-member-trait")
  };
}

function openDynastyMemberEditor(dynasty, member = null) {
  const dead = member?.status === "DEAD";
  const health = dead ? "HEALTHY" : (member?.health || "HEALTHY");
  const defaultSickUntil = member?.sick_until_turn ?? Number(dynasty.current_turn) + 3;
  openEditor(member ? "Hanedan üyesini düzenle" : "Yeni hanedan üyesi / akraba", `${dynasty.country_name} · ${dynasty.name}`, `<div class="form-grid"><label>Adı<input id="dynasty-member-name" value="${escapeHtml(member?.name || "")}" minlength="2" maxlength="80" required></label><label>Cinsiyet<select id="dynasty-member-gender"><option value="MALE" ${selected("MALE", member?.gender || "MALE")}>Erkek</option><option value="FEMALE" ${selected("FEMALE", member?.gender)}>Kadın</option></select></label><label>Yaş<input id="dynasty-member-age" type="number" min="0" max="120" step="1" value="${Number(member?.age ?? 0)}" required></label><label>Unvan<input id="dynasty-member-title" value="${escapeHtml(member?.title || "Hanedan Üyesi")}" minlength="2" maxlength="80" required></label><label>Özel açıklama / yedek ilişki<input id="dynasty-member-relation" value="${escapeHtml(member?.relation || "Soy bağı belirlenemedi")}" minlength="2" maxlength="120" required><small>Anne, baba ve eş kayıtları yeterliyse hükümdara akrabalık otomatik hesaplanır.</small></label><label>Soylu traiti<select id="dynasty-member-trait">${dynastyTraitOptions(dynasty, member)}</select><small>Trait yalnızca bu üye hayatta olan hükümdarsa ülke genelinde çalışır.</small></label><label>Sağlık<select id="dynasty-member-health" ${dead ? "disabled" : ""}><option value="HEALTHY" ${selected("HEALTHY", health)}>Sağlıklı</option><option value="SICK" ${selected("SICK", health)}>Hasta</option></select></label><label>Hastalık bitiş turu<input id="dynasty-member-sick-until" type="number" min="${Number(dynasty.current_turn)}" step="1" value="${Number(defaultSickUntil)}" ${dead ? "disabled" : ""}><small>Sağlıklı seçilirse bu alan temizlenir.</small></label><label>Veraset sırası<input id="dynasty-member-rank" type="number" min="1" step="1" value="${member?.succession_rank ?? ""}" placeholder="Boş bırakılabilir"></label><label>Eş<select id="dynasty-member-spouse">${dynastyRelationOptions(dynasty, member, "spouse")}</select></label><label>Anne<select id="dynasty-member-mother">${dynastyRelationOptions(dynasty, member, "mother")}</select></label><label>Baba<select id="dynasty-member-father">${dynastyRelationOptions(dynasty, member, "father")}</select></label></div><div class="check-grid"><label class="check"><input id="dynasty-member-monarch" type="checkbox" ${member?.is_monarch ? "checked" : ""} ${dead ? "disabled" : ""}> Hükümdar</label><label class="check"><input id="dynasty-member-heir" type="checkbox" ${member?.is_heir ? "checked" : ""} ${dead ? "disabled" : ""}> Taht varisi</label></div>${dead ? '<div class="preview-warning"><strong>Ölü üye kaydı</strong><span>Kimlik ve akrabalık bilgileri düzeltilebilir; sağlık ve veraset görevleri yeniden açılamaz.</span></div>' : '<div class="preview-warning"><strong>Erkek öncelikli veraset aktiftir.</strong><span>Yaşayan ve verasete uygun erkek varken kadın üye varis veya yeni hükümdar seçilemez.</span></div>'}`, async () => {
    const input = dynastyMemberInput();
    await api(member ? `/api/admin/dynasty-members/${member.id}` : `/api/admin/dynasties/${dynasty.id}/members`, { method: member ? "PATCH" : "POST", body: JSON.stringify(input) });
    closeEditor(); toast(member ? "Hanedan üyesi güncellendi." : "Yeni hanedan üyesi eklendi."); await refreshKeepingScroll(() => dynastyDetailPage(dynasty.id));
  });
}

function openDynastyDeathEditor(dynasty, member) {
  if (!member) return;
  openEditor("Hanedan üyesini öldü olarak işle", `${dynasty.country_name} · ${member.name}`, `<div class="preview-warning"><strong>Bu işlem veraset düzenini değiştirebilir.</strong><span>Üye hükümdar veya varisse sistem yaşayan uygun üyeler arasından yeni atama yapar. Bekleyen evlilik teklifleri iptal edilir.</span></div><label>Ölüm nedeni<textarea id="dynasty-death-reason" minlength="2" maxlength="200" rows="3" required placeholder="Örn. Hastalık, savaş yaraları, yaşlılık…"></textarea></label>`, async () => {
    await api(`/api/admin/dynasty-members/${member.id}/death`, { method: "POST", body: JSON.stringify({ reason: document.getElementById("dynasty-death-reason").value }) });
    closeEditor(); toast(`${member.name} öldü olarak işlendi.`); await refreshKeepingScroll(() => dynastyDetailPage(dynasty.id));
  });
}

function assignmentTarget(row) {
  if (row.assigned_army_name) return `Ordu: ${row.assigned_army_name}`;
  if (row.assigned_fleet_name) return `Filo: ${row.assigned_fleet_name}`;
  if (row.protected_character_name) return `Korunan: ${row.protected_character_name}`;
  if (row.target_settlement_name) return `${row.target_settlement_name}${row.target_country_name ? ` (${row.target_country_name})` : ""}`;
  if (row.assigned_settlement_name) return `${row.assigned_settlement_name}${row.assigned_country_name ? ` (${row.assigned_country_name})` : ""}`;
  if (row.target_country_name) return row.target_country_name;
  return "Ülke geneli";
}

async function assignmentsPage() {
  setActiveRoute("assignments"); loading();
  const rows = await api("/api/character-assignments");
  page.innerHTML = `<div class="page-head"><div><h1>Karakter Görevleri</h1><p>Tüm aktif karakter görevleri, hedefleri, ilerlemeleri ve iptal işlemleri</p></div><span class="pill">${number(rows.length)} aktif görev</span></div><section class="card table-wrap"><table><thead><tr><th>Karakter</th><th>Devlet</th><th>Rol</th><th>Görev</th><th>Hedef / Konum</th><th>Durum</th><th>İlerleme / Süre</th><th></th></tr></thead><tbody>${rows.map((row) => {
    const task = operationLabels[row.operation_type] || assignmentLabel(row.assignment);
    const status = operationStatusLabels[row.operation_status] || (row.assignment_ready_turn ? "Hazırlanıyor" : "Aktif");
    const progress = row.operation_goal ? `${number(row.operation_progress)} / ${number(row.operation_goal)}` : row.assignment_ready_turn ? `Tur ${number(row.assignment_ready_turn)}` : "—";
    const assignment = assignmentLabel(row.assignment);
    return `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.country_name)}</td><td>${escapeHtml(roleLabel(row))}</td><td><strong>${escapeHtml(task)}</strong>${assignment !== task ? `<small>${escapeHtml(assignment)}</small>` : ""}</td><td>${escapeHtml(assignmentTarget(row))}</td><td><span class="pill ${row.operation_status === "PAUSED" ? "warning" : "neutral"}">${escapeHtml(status)}</span></td><td>${escapeHtml(progress)}</td><td><button class="button compact danger" data-cancel-character="${row.id}">Görevi iptal et</button></td></tr>`;
  }).join("") || '<tr><td colspan="8" class="empty">Aktif karakter görevi bulunmuyor.</td></tr>'}</tbody></table></section>`;
  document.querySelectorAll("[data-cancel-character]").forEach((button) => button.addEventListener("click", async () => {
    const character = rows.find((item) => item.id === button.dataset.cancelCharacter);
    if (!character) return;
    openEditor("Karakter görevini sonlandır", `${character.country_name} · ${character.name}`, `<div class="preview-warning"><strong>${escapeHtml(operationLabels[character.operation_type] || assignmentLabel(character.assignment))}</strong><span>Karakter silinmez; görev ve bağlı operasyon kayıtları güvenli biçimde sonlandırılır.</span></div><label>Gerekçe<textarea id="assignment-cancel-reason" minlength="3" maxlength="500" rows="3" required placeholder="Görevin neden sonlandırıldığı"></textarea></label>`, async () => {
      await api(`/api/admin/characters/${character.id}/cancel-assignment`, { method: "POST", body: JSON.stringify({ reason: document.getElementById("assignment-cancel-reason").value }) });
      closeEditor(); toast(`${character.name} karakterinin görevi sonlandırıldı.`); await refreshKeepingScroll(assignmentsPage);
    });
    setEditorSaveLabel("Görevi sonlandır", true);
  }));
}

function guidedRelationLabel(kind) {
  return kind === "ALLIANCE" ? "İttifak" : kind === "VASSALAGE" ? "Vassallık" : "Resmî savaş";
}

function setEditorSaveLabel(label, danger = false) {
  const button = document.getElementById("editor-save");
  button.textContent = label;
  button.classList.toggle("danger", danger);
}

function finishGuidedOperation(message) {
  closeEditor();
  toast(message);
  return refreshKeepingScroll(guidedOperationsPage);
}

function openGuidedTreasury(data, defaultTarget = "") {
  const targets = [
    ...data.countries.map((country) => ({ value: `COUNTRY:${country.id}`, label: `Devlet · ${country.name}`, balance: country.treasury })),
    ...data.settlements.map((settlement) => ({ value: `SETTLEMENT:${settlement.id}`, label: `Yerleşke · ${settlement.country_name} / ${settlement.name}`, balance: settlement.local_treasury }))
  ];
  openEditor("Hazine düzeltmesi", "Önce mevcut ve yeni bakiye hesaplanır; veri ancak ikinci onayda değişir.", `<div class="guided-form-note">Bu işlem seçilen devletin veya yerleşkenin hazinesine gerekçeli bir düzeltme uygular.</div><label>Hedef<select id="guided-treasury-target" required>${targets.map((target) => `<option value="${target.value}" ${selected(target.value, defaultTarget)}>${escapeHtml(target.label)} · ${money(target.balance)}</option>`).join("")}</select></label><div class="form-grid"><label>İşlem<select id="guided-treasury-direction"><option value="ADD">Altın ekle</option><option value="SUBTRACT">Altın çıkar</option></select></label><label>Tutar<input id="guided-treasury-amount" type="number" min="1" step="1" required></label></div><label>Gerekçe<textarea id="guided-treasury-reason" minlength="3" maxlength="500" rows="3" required placeholder="Düzeltmenin oyun içi veya teknik gerekçesi"></textarea></label>`, async () => {
    const [targetType, targetId] = document.getElementById("guided-treasury-target").value.split(":");
    const preview = await api("/api/operations/treasury/preview", { method: "POST", body: JSON.stringify({ targetType, targetId, direction: document.getElementById("guided-treasury-direction").value, amount: Number(document.getElementById("guided-treasury-amount").value), reason: document.getElementById("guided-treasury-reason").value }) });
    openEditor("Hazine düzeltmesini onayla", `${preview.label} · önizleme 10 dakika geçerli`, `<div class="preview-warning"><strong>Henüz hiçbir veri değişmedi.</strong><span>Bakiyeyi ve gerekçeyi kontrol edip işlemi uygula.</span></div><div class="guided-preview-grid"><div><span>Mevcut hazine</span><strong>${money(preview.currentBalance)}</strong></div><div><span>Düzeltme</span><strong class="${preview.delta < 0 ? "danger-text" : "success-text"}">${preview.delta > 0 ? "+" : ""}${money(preview.delta)}</strong></div><div><span>Yeni hazine</span><strong>${money(preview.nextBalance)}</strong></div></div><div class="guided-reason"><span>Gerekçe</span><p>${escapeHtml(preview.reason)}</p></div>`, async () => {
      const result = await api("/api/operations/treasury/apply", { method: "POST", body: JSON.stringify({ previewToken: preview.previewToken }) });
      await finishGuidedOperation(`${result.label} hazinesi ${money(result.balance)} olarak güncellendi.`);
    });
    setEditorSaveLabel("Düzeltmeyi uygula");
  });
  setEditorSaveLabel("Önizlemeyi oluştur");
}

function openGuidedSettlementTransfer(data) {
  if (!data.settlements.length || data.countries.length < 2) return toast("Devir için en az iki aktif devlet ve bir yerleşke gerekir.", "error");
  openEditor("Yerleşke devri", "Bağlı asker, ticaret ve son yerleşke etkileri uygulamadan önce gösterilir.", `<div class="guided-form-note">Yerleşkenin yeni sahibini ve devir türünü seç. Sistem mevcut sahipliği ve bağlı kayıtları yeniden doğrular.</div><label>Yerleşke<select id="guided-transfer-settlement" required>${data.settlements.map((settlement) => `<option value="${settlement.id}" data-owner="${settlement.country_id}">${escapeHtml(settlement.country_name)} · ${escapeHtml(settlement.name)}</option>`).join("")}</select></label><label>Yeni devlet<select id="guided-transfer-country" required>${data.countries.map((country) => `<option value="${country.id}">${escapeHtml(country.name)}</option>`).join("")}</select></label><label>Devir türü<select id="guided-transfer-type"><option value="CONQUEST">Fetih</option><option value="PEACE_TRANSFER">Barış anlaşması</option><option value="VOLUNTARY_TRANSFER">Gönüllü devir</option></select></label><label>Gerekçe<textarea id="guided-transfer-reason" minlength="3" maxlength="500" rows="3" required placeholder="Devrin gerekçesi"></textarea></label>`, async () => {
    const settlementSelect = document.getElementById("guided-transfer-settlement");
    const targetCountryId = document.getElementById("guided-transfer-country").value;
    if (settlementSelect.selectedOptions[0]?.dataset.owner === targetCountryId) throw new Error("Yerleşkenin mevcut sahibinden farklı bir hedef devlet seçin.");
    const preview = await api("/api/operations/settlement-transfer/preview", { method: "POST", body: JSON.stringify({ settlementId: settlementSelect.value, targetCountryId, transferType: document.getElementById("guided-transfer-type").value, reason: document.getElementById("guided-transfer-reason").value }) });
    openEditor("Yerleşke devrini onayla", `${preview.settlementName} · ${preview.sourceCountryName} → ${preview.targetCountryName}`, `<div class="preview-warning"><strong>Bu işlem birden fazla oyun kaydını etkileyebilir.</strong><span>Önizleme 10 dakika geçerlidir ve sahiplik değişirse otomatik olarak iptal edilir.</span></div><div class="guided-preview-grid"><div><span>Kaynak</span><strong>${escapeHtml(preview.sourceCountryName)}</strong></div><div><span>Hedef</span><strong>${escapeHtml(preview.targetCountryName)}</strong></div><div><span>Devir türü</span><strong>${escapeHtml(preview.transferLabel)}</strong></div></div><div class="guided-impact-list"><strong>Beklenen etkiler</strong>${preview.warnings.length ? preview.warnings.map((warning) => `<span>⚠ ${escapeHtml(warning)}</span>`).join("") : "<span>Bağlı riskli kayıt bulunmadı.</span>"}${preview.armyPersonnel ? `<span>⚔ ${number(preview.armyPersonnel)} saha askeri devir kurallarına göre işlenecek.</span>` : ""}</div><div class="guided-reason"><span>Gerekçe</span><p>${escapeHtml(preview.reason)}</p></div>`, async () => {
      const result = await api("/api/operations/settlement-transfer/apply", { method: "POST", body: JSON.stringify({ previewToken: preview.previewToken }) });
      await finishGuidedOperation(`${preview.settlementName}, ${preview.targetCountryName} yönetimine devredildi${result?.lastStandDetails?.length ? "; Son Direniş süreci başlatıldı" : ""}.`);
    });
    setEditorSaveLabel("Devri uygula", true);
  });
  setEditorSaveLabel("Etkileri önizle");
}

function openGuidedCapitalChange(data) {
  const eligibleCountries = data.countries
    .map((country) => ({
      ...country,
      settlements: data.settlements.filter((settlement) => settlement.country_id === country.id)
    }))
    .filter((country) => country.settlements.some((settlement) => settlement.id !== country.capital_settlement_id));
  if (!eligibleCountries.length) return toast("Başkent değiştirilebilecek uygun bir devlet bulunmuyor.", "error");

  const countryOptions = eligibleCountries
    .map((country) => `<option value="${country.id}">${escapeHtml(country.name)} · mevcut başkent: ${escapeHtml(country.capital_name || "Atanmamış")}</option>`)
    .join("");
  openEditor("Başkent değişimi", "Devletin yönetim merkezini ve +%1 başkent bonuslarını başka bir yerleşkeye taşı.", `<div class="preview-warning"><strong>Bonuslar aynı işlemde taşınır.</strong><span>Eski başkent gelir ve nüfus artışı +%1 bonusunu kaybeder; yeni başkent iki bonusu da anında kazanır.</span></div><label>Devlet<select id="guided-capital-country" required>${countryOptions}</select></label><label>Yeni başkent<select id="guided-capital-settlement" required></select></label><label>Gerekçe<textarea id="guided-capital-reason" minlength="2" maxlength="300" rows="3" required placeholder="Başkent değişikliğinin gerekçesi"></textarea></label>`, async () => {
    const countryId = document.getElementById("guided-capital-country").value;
    const settlementId = document.getElementById("guided-capital-settlement").value;
    const reason = document.getElementById("guided-capital-reason").value.trim();
    if (reason.length < 2) throw new Error("Başkent değişikliği için kısa bir gerekçe yazın.");
    const result = await api(`/api/admin/countries/${countryId}/capital`, {
      method: "POST",
      body: JSON.stringify({ settlementId, reason })
    });
    await finishGuidedOperation(`${result.countryName}: ${result.newCapitalName} yeni başkent oldu; +%1 bonuslar taşındı.`);
  });
  const countrySelect = document.getElementById("guided-capital-country");
  const settlementSelect = document.getElementById("guided-capital-settlement");
  const updateSettlements = () => {
    const country = eligibleCountries.find((item) => item.id === countrySelect.value);
    settlementSelect.innerHTML = (country?.settlements || [])
      .filter((settlement) => settlement.id !== country?.capital_settlement_id)
      .map((settlement) => `<option value="${settlement.id}">${escapeHtml(settlement.name)} · ${number(Number(settlement.population) + Number(settlement.slave_population))} nüfus</option>`)
      .join("");
  };
  countrySelect.addEventListener("change", updateSettlements);
  updateSettlements();
  setEditorSaveLabel("Başkenti değiştir");
}

function openGuidedCharacterCancel(data) {
  if (!data.assignments.length) return toast("Sonlandırılabilecek aktif karakter görevi bulunmuyor.", "error");
  openEditor("Karakter görevini sonlandır", "Bağlı görev, komutanlık ve operasyon kayıtları birlikte temizlenir.", `<label>Aktif görev<select id="guided-assignment" required>${data.assignments.map((row) => `<option value="${row.id}">${escapeHtml(row.country_name)} · ${escapeHtml(row.name)} · ${escapeHtml(operationLabels[row.operation_type] || assignmentLabel(row.assignment))}</option>`).join("")}</select></label><label>Gerekçe<textarea id="guided-assignment-reason" minlength="3" maxlength="500" rows="3" required placeholder="Görevin neden sonlandırıldığı"></textarea></label><div class="preview-warning"><strong>Karakter silinmez.</strong><span>Yalnız etkin görevi ve bu göreve bağlı operasyon/komutanlık kayıtları sonlandırılır.</span></div>`, async () => {
    const id = document.getElementById("guided-assignment").value;
    const character = data.assignments.find((row) => row.id === id);
    const result = await api(`/api/admin/characters/${id}/cancel-assignment`, { method: "POST", body: JSON.stringify({ reason: document.getElementById("guided-assignment-reason").value }) });
    await finishGuidedOperation(`${character?.name || result.name} karakterinin görevi sonlandırıldı.`);
  });
  setEditorSaveLabel("Görevi sonlandır", true);
}

function openGuidedDiplomacyEnd(data) {
  const relations = [
    ...data.alliances.map((row) => ({ kind: "ALLIANCE", id: row.id, label: `İttifak · ${row.proposer_name} ↔ ${row.receiver_name}`, parties: [row.proposer_country_id, row.receiver_country_id] })),
    ...data.vassalages.map((row) => ({ kind: "VASSALAGE", id: row.id, label: `Vassallık · ${row.overlord_name} → ${row.vassal_name}`, parties: [row.overlord_country_id, row.vassal_country_id] })),
    ...data.wars.map((row) => ({ kind: "WAR", id: row.id, label: `Savaş · ${row.attacker_name} ↔ ${row.defender_name}`, parties: [row.attacker_country_id, row.defender_country_id] }))
  ];
  if (!relations.length) return toast("Sonlandırılabilecek aktif diplomatik ilişki veya savaş bulunmuyor.", "error");
  openEditor("Diplomatik ilişkiyi sonlandır", "Aktif ittifak, vassallık veya resmî savaşı kontrollü biçimde kapat.", `<label>Aktif ilişki<select id="guided-relation" required>${relations.map((row, index) => `<option value="${index}">${escapeHtml(row.label)}</option>`).join("")}</select></label><label id="guided-winner-wrap">Savaş galibi<select id="guided-winner"><option value="">Galip yok / anlaşmalı bitiş</option></select></label><label>Gerekçe<textarea id="guided-diplomacy-reason" minlength="3" maxlength="2000" rows="3" required placeholder="İlişkinin neden sonlandırıldığı"></textarea></label><label>Güvenlik onayı<input id="guided-diplomacy-confirmation" autocomplete="off" required placeholder="SONLANDIR yazın"></label><div class="preview-warning"><strong>İlişki geçmişi silinmez.</strong><span>Kayıt sona ermiş olarak işaretlenir ve işlem geçmişine yönetici gerekçesiyle yazılır.</span></div>`, async () => {
    const relation = relations[Number(document.getElementById("guided-relation").value)];
    await api("/api/operations/diplomacy/end", { method: "POST", body: JSON.stringify({ kind: relation.kind, relationId: relation.id, winnerCountryId: relation.kind === "WAR" ? document.getElementById("guided-winner").value || null : null, reason: document.getElementById("guided-diplomacy-reason").value, confirmation: document.getElementById("guided-diplomacy-confirmation").value }) });
    await finishGuidedOperation(`${guidedRelationLabel(relation.kind)} sona erdirildi.`);
  });
  const relationSelect = document.getElementById("guided-relation");
  const updateWinner = () => {
    const relation = relations[Number(relationSelect.value)];
    const wrap = document.getElementById("guided-winner-wrap");
    wrap.hidden = relation.kind !== "WAR";
    document.getElementById("guided-winner").innerHTML = `<option value="">Galip yok / anlaşmalı bitiş</option>${data.countries.filter((country) => relation.parties.includes(country.id)).map((country) => `<option value="${country.id}">${escapeHtml(country.name)}</option>`).join("")}`;
  };
  relationSelect.addEventListener("change", updateWinner);
  updateWinner();
  setEditorSaveLabel("İlişkiyi sonlandır", true);
}

async function guidedOperationsPage() {
  setActiveRoute("gm-operations"); loading();
  const data = await api("/api/gm-operations");
  state.guidedOperations = data;
  const relationCount = data.alliances.length + data.vassalages.length + data.wars.length;
  page.innerHTML = `<div class="page-head guided-hero"><div><span class="overview-kicker">GÜVENLİ GM AKIŞLARI</span><h1>Rehberli İşlemler</h1><p>Riskli oyun müdahalelerini hedef seçimi, etki önizlemesi, açık gerekçe ve ikinci onayla uygula.</p></div><span class="pill neutral">Tur ${number(data.guild.current_turn)} · ${turnPhaseLabels[data.guild.turn_phase] || data.guild.turn_phase}</span></div><section class="guided-operation-grid"><article class="card guided-operation-card"><div class="guided-operation-icon">¤</div><div><h2>Hazine düzeltmesi</h2><p>Devlet veya yerleşke hazinesine kontrollü altın ekle ya da çıkar.</p></div><div class="guided-operation-meta"><span>${number(data.countries.length)} devlet</span><span>${number(data.settlements.length)} yerleşke</span></div><button class="button primary" data-guided-treasury>İşlemi başlat</button></article><article class="card guided-operation-card"><div class="guided-operation-icon">⌖</div><div><h2>Yerleşke devri</h2><p>Fetih, barış veya gönüllü devir etkilerini uygulamadan önce incele.</p></div><div class="guided-operation-meta"><span>${number(data.settlements.length)} yerleşke</span><span>Bağlı kayıt kontrolü</span></div><button class="button primary" data-guided-transfer>İşlemi başlat</button></article><article class="card guided-operation-card"><div class="guided-operation-icon">♜</div><div><h2>Başkent değişimi</h2><p>Yönetim merkezini değiştir ve +%1 gelir ile nüfus artışı bonuslarını yeni şehre taşı.</p></div><div class="guided-operation-meta"><span>${number(data.countries.length)} devlet</span><span>Eski bonus otomatik kaldırılır</span></div><button class="button primary" data-guided-capital>İşlemi başlat</button></article><article class="card guided-operation-card"><div class="guided-operation-icon">♟</div><div><h2>Karakter görevi</h2><p>Etkin görevleri ve bağlı operasyonları tek güvenli akışta sonlandır.</p></div><div class="guided-operation-meta"><span>${number(data.assignments.length)} aktif görev</span><span>Karakter korunur</span></div><button class="button primary" data-guided-character>İşlemi başlat</button></article><article class="card guided-operation-card"><div class="guided-operation-icon">⚖</div><div><h2>Diplomatik sonlandırma</h2><p>İttifak, vassallık veya resmî savaşı gerekçeli biçimde kapat.</p></div><div class="guided-operation-meta"><span>${number(relationCount)} aktif kayıt</span><span>Geçmiş korunur</span></div><button class="button primary" data-guided-diplomacy>İşlemi başlat</button></article></section><section class="card guided-safety"><div><strong>Her kritik adım yeniden doğrulanır</strong><p>Önizlemeden sonra sahiplik veya hazine değişirse işlem uygulanmaz. Aynı imzalı işlem ikinci kez gönderilirse çoğaltılmaz.</p></div><button class="button" data-route-action="audit">İşlem geçmişini aç</button></section>`;
  document.querySelector("[data-guided-treasury]").addEventListener("click", () => openGuidedTreasury(data));
  document.querySelector("[data-guided-transfer]").addEventListener("click", () => openGuidedSettlementTransfer(data));
  document.querySelector("[data-guided-capital]").addEventListener("click", () => openGuidedCapitalChange(data));
  document.querySelector("[data-guided-character]").addEventListener("click", () => openGuidedCharacterCancel(data));
  document.querySelector("[data-guided-diplomacy]").addEventListener("click", () => openGuidedDiplomacyEnd(data));
  bindPageActions();
}

const bulkOperationConfig = {
  COUNTRY_MOBILIZATION: {
    title: "Devlet seferberliği", description: "Seçili devletlerin seferberlik düzeyini aynı anda değiştir.", icon: "♜",
    targetLabel: "Devletler", nextLabel: "Yeni seferberlik",
    nextField: `<select id="bulk-next-value"><option value="PEACE">Barış</option><option value="PARTIAL">Kısmi seferberlik</option><option value="GENERAL">Genel seferberlik</option></select>`
  },
  SETTLEMENT_TAX: {
    title: "Yerleşke vergisi", description: "Seçili yerleşkelere ortak bir vergi oranı uygula.", icon: "%",
    targetLabel: "Yerleşkeler", nextLabel: "Yeni vergi oranı",
    nextField: `<input id="bulk-next-value" type="number" min="0" max="100" step="0.1" value="3" required>`
  },
  CHARACTER_ASSIGNMENT_CANCEL: {
    title: "Karakter görevleri", description: "Seçili karakterlerin etkin görevlerini ve bağlı operasyonlarını sonlandır.", icon: "♟",
    targetLabel: "Aktif görevler", nextLabel: "Yeni durum",
    nextField: `<input id="bulk-next-value" value="Görevsiz" disabled>`
  }
};

function bulkTargets(data, kind) {
  if (kind === "COUNTRY_MOBILIZATION") return data.countries.map((row) => ({ id: row.id, label: row.name, detail: mobilizationLabels[row.mobilization] || row.mobilization }));
  if (kind === "SETTLEMENT_TAX") return data.settlements.map((row) => ({ id: row.id, label: `${row.country_name} · ${row.name}`, detail: `%${number(row.tax_rate_percent)}` }));
  return data.assignments.map((row) => ({ id: row.id, label: `${row.country_name} · ${row.name}`, detail: operationLabels[row.operation_type] || assignmentLabel(row.assignment) }));
}

function bulkValueLabel(kind, value) {
  if (kind === "COUNTRY_MOBILIZATION") return mobilizationLabels[value] || value;
  if (kind === "SETTLEMENT_TAX") return `%${number(value)}`;
  return assignmentLabel(value);
}

function openBulkOperation(data, kind) {
  const config = bulkOperationConfig[kind];
  const targets = bulkTargets(data, kind);
  if (!targets.length) return toast(`${config.targetLabel} için uygun kayıt bulunmuyor.`, "error");
  openEditor(config.title, `${config.description} En fazla 100 kayıt seçilebilir.`, `<div class="bulk-toolbar"><strong>${escapeHtml(config.targetLabel)}</strong><div><button type="button" class="button compact" data-bulk-select-all>Tümünü seç</button><button type="button" class="button compact" data-bulk-select-none>Temizle</button></div></div><div class="bulk-target-list">${targets.map((target) => `<label class="bulk-target"><input type="checkbox" name="bulk-target" value="${target.id}"><span><strong>${escapeHtml(target.label)}</strong><small>${escapeHtml(target.detail)}</small></span></label>`).join("")}</div><div class="form-grid bulk-fields"><label>${escapeHtml(config.nextLabel)}${config.nextField}</label><label>Gerekçe<textarea id="bulk-reason" minlength="3" maxlength="500" rows="3" required placeholder="Toplu değişikliğin gerekçesi"></textarea></label></div>`, async () => {
    const targetIds = [...document.querySelectorAll('input[name="bulk-target"]:checked')].map((input) => input.value);
    if (!targetIds.length) throw new Error("En az bir kayıt seçin.");
    const payload = { kind, targetIds, reason: document.getElementById("bulk-reason").value };
    if (kind === "COUNTRY_MOBILIZATION") payload.mobilization = document.getElementById("bulk-next-value").value;
    if (kind === "SETTLEMENT_TAX") payload.taxRatePercent = Number(document.getElementById("bulk-next-value").value);
    const preview = await api("/api/operations/bulk/preview", { method: "POST", body: JSON.stringify(payload) });
    openEditor("Toplu işlemi onayla", `${config.title} · ${number(preview.rows.length)} kayıt · önizleme 10 dakika geçerli`, `<div class="preview-warning"><strong>Henüz hiçbir kayıt değiştirilmedi.</strong><span>Tüm kayıtlar tek işlemde uygulanır; bir kayıt değişmişse toplu işlemin tamamı durdurulur.</span></div><div class="bulk-preview-list">${preview.rows.map((row) => `<div><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(bulkValueLabel(kind, row.currentValue))}</span><b>→</b><span>${escapeHtml(bulkValueLabel(kind, row.nextValue))}</span></div>`).join("")}</div><div class="guided-reason"><span>Gerekçe</span><p>${escapeHtml(preview.reason)}</p></div>`, async () => {
      const result = await api("/api/operations/bulk/apply", { method: "POST", body: JSON.stringify({ previewToken: preview.previewToken }) });
      await finishBulkOperation(`${number(result.affected)} kayıt toplu olarak güncellendi.`);
    });
    editorModal.querySelector(".modal").classList.add("wide");
    setEditorSaveLabel("Toplu işlemi uygula", kind === "CHARACTER_ASSIGNMENT_CANCEL");
  });
  editorModal.querySelector(".modal").classList.add("wide");
  document.querySelector("[data-bulk-select-all]").addEventListener("click", () => document.querySelectorAll('input[name="bulk-target"]').forEach((input) => { input.checked = true; }));
  document.querySelector("[data-bulk-select-none]").addEventListener("click", () => document.querySelectorAll('input[name="bulk-target"]').forEach((input) => { input.checked = false; }));
  setEditorSaveLabel("Önizlemeyi oluştur");
}

function finishBulkOperation(message) {
  closeEditor();
  toast(message);
  return refreshKeepingScroll(bulkOperationsPage);
}

async function bulkOperationsPage() {
  setActiveRoute("bulk-operations"); loading();
  const data = await api("/api/gm-operations");
  page.innerHTML = `<div class="page-head"><div><span class="overview-kicker">ÇOKLU KAYIT YÖNETİMİ</span><h1>Toplu İşlem Merkezi</h1><p>Aynı değişikliği seçili oyun kayıtlarına önizleme, tutarlılık kontrolü ve tek işlem güvencesiyle uygula.</p></div><span class="pill neutral">En fazla 100 kayıt / işlem</span></div><section class="bulk-operation-grid">${Object.entries(bulkOperationConfig).map(([kind, config]) => { const count = bulkTargets(data, kind).length; return `<article class="card bulk-operation-card"><div class="guided-operation-icon">${config.icon}</div><div><h2>${escapeHtml(config.title)}</h2><p>${escapeHtml(config.description)}</p></div><span class="bulk-count">${number(count)} uygun kayıt</span><button class="button primary" data-bulk-kind="${kind}" ${count ? "" : "disabled"}>Seç ve önizle</button></article>`; }).join("")}</section><section class="card guided-safety"><div><strong>Ya hep ya hiç uygulama</strong><p>Seçilen kayıtlardan biri önizlemeden sonra değişirse hiçbir kayıt güncellenmez. Her toplu işlem tek denetim kaydı ve benzersiz işlem anahtarıyla izlenir.</p></div><button class="button" data-route-action="audit">İşlem geçmişini aç</button></section>`;
  document.querySelectorAll("[data-bulk-kind]").forEach((button) => button.addEventListener("click", () => openBulkOperation(data, button.dataset.bulkKind)));
  bindPageActions();
}

function openMechanicDataTable(table) {
  state.dataTable = table;
  state.dataOffset = 0;
  state.dataSearch = "";
  navigate("data-control");
}

function loadWarningsMarkup(warnings) {
  if (!Array.isArray(warnings) || !warnings.length) return "";
  return `<section class="load-warning"><div><strong>Bazı alt bölümler yüklenemedi</strong><span>${warnings.map((warning) => escapeHtml(warning)).join(" · ")}</span></div><button class="button compact" data-retry-page>Yeniden dene</button></section>`;
}

async function diplomacyControlPage(signal) {
  setActiveRoute("diplomacy-control"); loading();
  const data = await api("/api/mechanics-control?scope=DIPLOMACY", { signal });
  const activeAlliances = data.alliances.filter((row) => row.status === "ACTIVE");
  const pendingAlliances = data.alliances.filter((row) => row.status === "PENDING");
  const activeTrades = data.trades.filter((row) => row.status === "ACTIVE");
  const pendingTrades = data.trades.filter((row) => row.status === "PENDING");
  const activePorts = data.portAccess.filter((row) => row.status === "ACTIVE");
  const pendingPorts = data.portAccess.filter((row) => row.status === "PENDING");
  const pendingDecisions = [
    ...pendingAlliances.map((row) => ({ label: `${row.proposer_name} → ${row.receiver_name}`, detail: "İttifak teklifi", table: "country_alliances" })),
    ...pendingTrades.map((row) => ({ label: `${row.proposer_country_name} → ${row.receiver_country_name}`, detail: `${row.route === "SEA" ? "Deniz" : "Kara"} ticaret teklifi`, table: "trade_agreements" })),
    ...pendingPorts.map((row) => ({ label: `${row.requester_name} → ${row.grantor_name}`, detail: "Liman erişimi talebi", table: "country_port_access" }))
  ];
  const countryDiplomacy = (data.diplomacyCountries || []).map((country) => {
    const alliances = activeAlliances.filter((row) => row.proposer_country_id === country.id || row.receiver_country_id === country.id).length;
    const vassalages = data.vassalages.filter((row) => row.overlord_country_id === country.id || row.vassal_country_id === country.id);
    const wars = data.wars.filter((row) => row.attacker_country_id === country.id || row.defender_country_id === country.id).length;
    const trades = activeTrades.filter((row) => row.proposer_country_id === country.id || row.receiver_country_id === country.id).length;
    const ports = activePorts.filter((row) => row.requester_country_id === country.id || row.grantor_country_id === country.id).length;
    const pending = pendingAlliances.filter((row) => row.proposer_country_id === country.id || row.receiver_country_id === country.id).length
      + pendingTrades.filter((row) => row.proposer_country_id === country.id || row.receiver_country_id === country.id).length
      + pendingPorts.filter((row) => row.requester_country_id === country.id || row.grantor_country_id === country.id).length;
    const vassalRole = vassalages.find((row) => row.vassal_country_id === country.id) ? "Vassal"
      : vassalages.some((row) => row.overlord_country_id === country.id) ? "Hâkim devlet" : "Bağımsız";
    return { ...country, alliances, wars, trades, ports, pending, vassalRole, score: alliances + wars + trades + ports + vassalages.length };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "tr"));
  const warnings = loadWarningsMarkup(data.warnings);
  page.innerHTML = `<div class="page-head mechanics-hero"><div><span class="overview-kicker">DIŞ İLİŞKİLER MASASI</span><h1>Diplomasi & Ticaret</h1><p>Bekleyen kararları öne al, devletlerin ilişki yoğunluğunu karşılaştır ve aktif diplomatik bağları tek merkezden yönet.</p></div><div class="actions"><button class="button" data-open-diplomacy-data>Ham kayıtları aç</button><button class="button primary" data-end-diplomacy>İlişkiyi sonlandır</button></div></div><section class="kpi-grid"><div class="card kpi"><span>Bekleyen karar</span><strong>${number(pendingDecisions.length)}</strong><small>İttifak, ticaret ve liman talepleri</small></div><div class="card kpi"><span>Aktif ittifak</span><strong>${number(activeAlliances.length)}</strong><small>Devletler arası savunma bağı</small></div><div class="card kpi"><span>Resmî savaş</span><strong>${number(data.wars.length)}</strong><small>Devam eden çatışmalar</small></div><div class="card kpi"><span>Ekonomik bağlantı</span><strong>${number(activeTrades.length + activePorts.length)}</strong><small>Ticaret yolu ve liman erişimi</small></div></section><section class="diplomacy-priority-grid"><article class="card"><div class="card-head"><div><h2>Karar bekleyen teklifler</h2><p>GM dikkatine ihtiyaç duyan açık diplomatik işlemler</p></div><span class="pill ${pendingDecisions.length ? "warning" : "success"}">${number(pendingDecisions.length)}</span></div>${rowsOrEmpty(pendingDecisions, (row) => `<button class="relation-row" data-diplomacy-table="${row.table}"><span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span><em>İncele →</em></button>`, "Bekleyen diplomatik karar bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h2>Devlet ilişki görünümü</h2><p>En yoğun diplomatik trafiğe sahip devletler</p></div></div><div class="diplomacy-country-list">${rowsOrEmpty(countryDiplomacy, (row) => `<button class="diplomacy-country-row" data-related-country="${row.id}"><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.vassalRole)}${row.pending ? ` · ${number(row.pending)} karar bekliyor` : ""}</small></span><div><b>${number(row.alliances)}</b><small>ittifak</small></div><div><b>${number(row.wars)}</b><small>savaş</small></div><div><b>${number(row.trades + row.ports)}</b><small>ticaret</small></div></button>`, "Aktif devlet bulunmuyor.")}</div></article></section><div class="section-title"><h2>Aktif diplomatik düzen</h2><span>İttifak, egemenlik ve savaş bağlantıları</span></div><section class="mechanics-grid"><article class="card"><div class="card-head"><div><h2>İttifaklar</h2><p>Etkin savunma ortaklıkları</p></div></div>${rowsOrEmpty(activeAlliances, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.proposer_name)} ↔ ${escapeHtml(row.receiver_name)}</strong><small>Etkin ittifak</small></span><em class="pill success">Aktif</em></div>`, "Aktif ittifak bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h2>Vassallıklar</h2><p>Hâkim ve bağlı devletler</p></div></div>${rowsOrEmpty(data.vassalages, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.overlord_name)} → ${escapeHtml(row.vassal_name)}</strong><small>Tur ${number(row.started_turn)} tarihinden beri</small></span><em>Etkin</em></div>`, "Aktif vassallık bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h2>Resmî savaşlar</h2><p>Devam eden devlet savaşları</p></div></div>${rowsOrEmpty(data.wars, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.attacker_name)} ⚔ ${escapeHtml(row.defender_name)}</strong><small>Tur ${number(row.started_turn)} · ${escapeHtml(row.reason)}</small></span><em class="danger-text">Savaşta</em></div>`, "Aktif savaş bulunmuyor.")}</article><article class="card"><div class="card-head"><div><h2>Diplomatik paktlar</h2><p>Kurucular ve üye sayıları</p></div></div>${rowsOrEmpty(data.pacts, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.founder_name)} · ${escapeHtml(row.purpose)}</small></span><em>${number(row.member_count)} üye</em></div>`, "Diplomatik pakt bulunmuyor.")}</article><article class="card relation-span"><div class="card-head"><div><h2>Ticaret yolları</h2><p>Aktif kara ve deniz bağlantıları</p></div><button class="button compact" data-open-trades>Tüm kayıtlar</button></div>${rowsOrEmpty(activeTrades, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.proposer_country_name)} ↔ ${escapeHtml(row.receiver_country_name)}</strong><small>${escapeHtml(row.proposer_settlement_name)} → ${escapeHtml(row.receiver_settlement_name || "Yerleşke bekleniyor")} · ${row.route === "SEA" ? "Deniz" : "Kara"}</small></span><em class="pill success">${money(row.income_per_country)}</em></div>`, "Aktif ticaret yolu bulunmuyor.")}</article><article class="card relation-span"><div class="card-head"><div><h2>Liman erişimleri</h2><p>Yabancı tersane ve liman kullanım hakları</p></div><button class="button compact" data-open-ports>Tüm kayıtlar</button></div>${rowsOrEmpty(activePorts, (row) => `<div class="relation-row static"><span><strong>${escapeHtml(row.requester_name)} → ${escapeHtml(row.grantor_name)}</strong><small>Liman erişimi etkin</small></span><em class="pill success">Aktif</em></div>`, "Aktif liman erişimi bulunmuyor.")}</article></section>`;
  if (warnings) page.querySelector(".page-head")?.insertAdjacentHTML("afterend", warnings);
  document.querySelector("[data-retry-page]")?.addEventListener("click", () => diplomacyControlPage().catch(showPageError));
  document.querySelector("[data-end-diplomacy]").addEventListener("click", async () => openGuidedDiplomacyEnd(await api("/api/gm-operations")));
  document.querySelector("[data-open-diplomacy-data]").addEventListener("click", () => openMechanicDataTable("country_alliances"));
  document.querySelector("[data-open-trades]").addEventListener("click", () => openMechanicDataTable("trade_agreements"));
  document.querySelector("[data-open-ports]").addEventListener("click", () => openMechanicDataTable("country_port_access"));
  document.querySelectorAll("[data-diplomacy-table]").forEach((button) => button.addEventListener("click", () => openMechanicDataTable(button.dataset.diplomacyTable)));
  document.querySelectorAll("[data-related-country]").forEach((button) => button.addEventListener("click", () => countryDetail(button.dataset.relatedCountry).catch(showPageError)));
}

async function economyControlPage(signal) {
  setActiveRoute("economy-control"); loading();
  const data = await api("/api/mechanics-control?scope=ECONOMY", { signal });
  const totalTreasury = data.countries.reduce((sum, row) => sum + Number(row.treasury || 0), 0);
  const totalIncome = data.countries.reduce((sum, row) => sum + Number(row.tax_income || 0) + Number(row.land_trade_income || 0) + Number(row.sea_trade_income || 0), 0);
  const productionCount = data.buildings.length + data.recruitments.length + data.navalOrders.length;
  const currentTurn = Number(data.guild.current_turn || 0);
  const visibleTurns = [currentTurn, Math.max(0, currentTurn - 1), Math.max(0, currentTurn - 2)].filter((turn, index, turns) => turns.indexOf(turn) === index);
  const countryHistory = data.countryTurnHistory || [];
  const settlements = data.settlementEconomies || [];
  const settlementHistory = data.settlementTurnHistory || [];
  const turnSummary = (rows, turn) => rows.find((row) => Number(row.turn) === turn) || { income: 0, expense: 0, net: 0, transaction_count: 0, movements: [] };
  const turnCards = (rows, compact = false) => `<div class="finance-turn-grid ${compact ? "compact" : ""}">${visibleTurns.map((turn) => { const snapshot = turnSummary(rows, turn); return `<div class="finance-turn-card"><span>Tur ${number(turn)}</span><strong class="${Number(snapshot.net) < 0 ? "danger-text" : "success-text"}">${signedMoney(snapshot.net)}</strong><small>+${money(snapshot.income)} · −${money(snapshot.expense)}</small><em>${number(snapshot.transaction_count)} hareket</em></div>`; }).join("")}</div>`;
  const sortedCountries = [...data.countries].sort((a, b) => Number(b.treasury) - Number(a.treasury) || a.name.localeCompare(b.name, "tr"));
  const warnings = loadWarningsMarkup(data.warnings);
  page.innerHTML = `<div class="page-head mechanics-hero"><div><span class="overview-kicker">TUR ${number(currentTurn)} MALİ DURUMU</span><h1>Ekonomi & Üretim</h1><p>Devletleri mevcut hazinelerine göre izle; ayrıntıda yerleşke ekonomilerini ve son üç turun gerçek mali hareketlerini incele.</p></div><div class="actions"><button class="button" data-bulk-tax>Toplu vergi</button><button class="button primary" data-new-treasury>Hazine düzelt</button></div></div><section class="kpi-grid"><div class="card kpi"><span>Toplam hazine</span><strong>${money(totalTreasury)}</strong><small>${number(data.countries.length)} aktif devlet</small></div><div class="card kpi"><span>Mevcut tur geliri</span><strong>${money(totalIncome)}</strong><small>Vergi + kara + deniz</small></div><div class="card kpi"><span>Üretim kuyruğu</span><strong>${number(productionCount)}</strong><small>İnşaat, asker ve gemi</small></div><div class="card kpi"><span>Aktif ticaret</span><strong>${number(data.trades.filter((row) => row.status === "ACTIVE").length)}</strong><small>Gelir üreten anlaşma</small></div></section><div class="section-title"><h2>Devlet hazineleri</h2><span>En yüksek hazineden düşüğe · ayrıntı için devleti aç</span></div><section class="economy-ledger">${sortedCountries.map((country) => { const ownHistory = countryHistory.filter((row) => row.country_id === country.id); const ownSettlements = settlements.filter((row) => row.country_id === country.id); const current = turnSummary(ownHistory, currentTurn); return `<details class="card economy-ledger-country"><summary><div><span class="turn-chip">Tur ${number(currentTurn)}</span><h3>${escapeHtml(country.name)}</h3><small>${number(ownSettlements.length)} yerleşke · ${number(country.population)} nüfus</small></div><div class="ledger-main-value"><small>Mevcut hazine</small><strong>${money(country.treasury)}</strong></div><div class="ledger-net"><small>Bu tur net hareket</small><strong class="${Number(current.net) < 0 ? "danger-text" : "success-text"}">${signedMoney(current.net)}</strong></div><span class="details-cue">Detay</span></summary><div class="economy-ledger-detail"><div class="ledger-toolbar"><div><strong>${escapeHtml(country.name)} · Son 3 tur</strong><span>Hazine hareketleri ve yerleşke kırılımı</span></div><button class="button compact" data-country-treasury="${country.id}">Hazineyi düzelt</button></div>${turnCards(ownHistory)}<div class="settlement-finance-list">${rowsOrEmpty(ownSettlements, (settlement) => { const history = settlementHistory.filter((row) => row.settlement_id === settlement.id); const currentIncome = Number(settlement.tax_income || 0) + Number(settlement.land_trade_income || 0) + Number(settlement.sea_trade_income || 0); return `<article class="settlement-finance-card"><header><div><h4>${escapeHtml(settlement.name)}</h4><small>${number(Number(settlement.population || 0) + Number(settlement.slave_population || 0))} nüfus · Güncel gelir ${money(currentIncome)}</small></div><strong>${money(settlement.local_treasury)}</strong></header>${turnCards(history, true)}<div class="settlement-movements">${rowsOrEmpty(history.flatMap((row) => (Array.isArray(row.movements) ? row.movements : []).slice(0, 4).map((movement) => ({ ...movement, turn: row.turn }))).slice(0, 8), (movement) => `<div><span><b>${escapeHtml(movement.description || humanKey(movement.kind))}</b><small>Tur ${number(movement.turn)} · ${escapeHtml(humanKey(movement.kind))}</small></span><em class="${Number(movement.amount) < 0 ? "danger-text" : "success-text"}">${signedMoney(movement.amount)}</em></div>`, "Son üç turda yerleşkeye bağlı mali hareket yok.")}</div><button class="button compact" data-production-settlement="${settlement.id}">Yerleşkeyi aç</button></article>`; }, "Bu devlete bağlı yerleşke bulunmuyor.")}</div></div></details>`; }).join("") || '<div class="card empty">Aktif devlet bulunmuyor.</div>'}</section><div class="section-title"><h2>Devam eden üretim</h2><span>Aktif inşaat ve siparişler</span></div><section class="mechanics-grid"><article class="card"><div class="card-head"><div><h2>İnşaatlar</h2><p>Bina seviyesi ve tamamlanma turu</p></div></div>${rowsOrEmpty(data.buildings, (row) => `<button class="relation-row" data-production-settlement="${row.settlement_id}"><span><strong>${escapeHtml(row.country_name)} · ${escapeHtml(row.settlement_name)}</strong><small>${escapeHtml(humanKey(row.building_type))} · Sv${number(row.level)} → Sv${number(row.target_level)}</small></span><em>Tur ${number(row.completion_turn)}</em></button>`, "Devam eden bina inşaatı yok.")}</article><article class="card"><div class="card-head"><div><h2>Asker alımları</h2><p>Kalan birlik ve sonraki dalga</p></div></div>${rowsOrEmpty(data.recruitments, (row) => `<button class="relation-row" data-production-settlement="${row.settlement_id}"><span><strong>${escapeHtml(row.country_name)} · ${escapeHtml(row.settlement_name)}</strong><small>${escapeHtml(humanKey(row.unit_type))} · ${number(row.remaining_quantity)} / ${number(row.total_quantity)} kaldı</small></span><em>Tur ${number(row.next_due_turn)}</em></button>`, "Devam eden asker alımı yok.")}</article><article class="card relation-span"><div class="card-head"><div><h2>Gemi üretimi</h2><p>Tersane siparişleri ve tamamlanma turu</p></div></div>${rowsOrEmpty(data.navalOrders, (row) => `<button class="relation-row" data-production-settlement="${row.settlement_id}"><span><strong>${escapeHtml(row.country_name)} · ${escapeHtml(row.settlement_name)}</strong><small>${number(row.quantity)} ${escapeHtml(humanKey(row.ship_type))}</small></span><em>Tur ${number(row.completion_turn)}</em></button>`, "Devam eden gemi üretimi yok.")}</article></section>`;
  if (warnings) page.querySelector(".page-head")?.insertAdjacentHTML("afterend", warnings);
  document.querySelector("[data-retry-page]")?.addEventListener("click", () => economyControlPage().catch(showPageError));
  document.querySelector("[data-new-treasury]").addEventListener("click", async () => openGuidedTreasury(await api("/api/gm-operations")));
  document.querySelector("[data-bulk-tax]").addEventListener("click", async () => openBulkOperation(await api("/api/gm-operations"), "SETTLEMENT_TAX"));
  document.querySelectorAll("[data-country-treasury]").forEach((button) => button.addEventListener("click", async () => openGuidedTreasury(await api("/api/gm-operations"), `COUNTRY:${button.dataset.countryTreasury}`)));
  document.querySelectorAll("[data-production-settlement]").forEach((button) => button.addEventListener("click", () => settlementDetail(button.dataset.productionSettlement).catch(showPageError)));
}

let npcPurchaseMode = "GENERAL";

function npcPlanActionCount(plan) {
  return (plan.buildingActions || []).length + (plan.shipActions || []).length + (plan.unitActions || []).length;
}

function npcPurchasePlanMarkup(plan, modeLabel) {
  const buildings = (plan.buildingActions || []).map((action) =>
    `<div class="npc-plan-line building"><span><b>${escapeHtml(action.settlementName)}</b><small>${action.targetLevel === 1 ? "Yeni bina" : "Seviye yükseltme"}</small></span><strong>${escapeHtml(action.buildingName)} · Sv${number(action.targetLevel)}</strong><em>${money(action.cost)}</em></div>`
  ).join("");
  const ships = (plan.shipActions || []).map((action) =>
    `<div class="npc-plan-line ship"><span><b>${escapeHtml(action.settlementName)}</b><small>Gemi üretimi</small></span><strong>${number(action.quantity)} × ${escapeHtml(humanKey(action.shipType))}</strong><em>${money(action.cost)}</em></div>`
  ).join("");
  const units = (plan.unitActions || []).map((action) =>
    `<div class="npc-plan-line unit"><span><b>${escapeHtml(action.settlementName)}</b><small>Asker alımı</small></span><strong>${number(action.quantity)} ${escapeHtml(humanKey(action.unitType))}</strong><em>${money(action.cost)}</em></div>`
  ).join("");
  const actions = buildings + ships + units;
  const notes = (plan.notes || []).map((note) => `<span>• ${escapeHtml(note)}</span>`).join("");
  return `<article class="npc-plan-card"><header><div><span class="pill neutral">${escapeHtml(modeLabel)}</span><h3>${escapeHtml(plan.countryName)}</h3><small>${number(npcPlanActionCount(plan))} emir · Başlangıç ${money(plan.startingTreasury)}</small></div><div><small>Planlanan harcama</small><strong>${money(plan.plannedCost)}</strong><em>Kullanılabilir ${money(plan.spendLimit)}</em></div></header><div class="npc-plan-actions">${actions || '<div class="compact-empty muted">Bu alım türü için uygulanabilir emir bulunmadı.</div>'}</div>${notes ? `<footer>${notes}</footer>` : ""}</article>`;
}

async function openNpcPurchasePreview(data, countryId, mode = npcPurchaseMode) {
  const plans = await api("/api/npc-purchases/preview", { method: "POST", body: JSON.stringify({ ...(countryId ? { countryId } : {}), mode }) });
  const actionCount = plans.reduce((sum, plan) => sum + npcPlanActionCount(plan), 0);
  const totalCost = plans.reduce((sum, plan) => sum + Number(plan.plannedCost || 0), 0);
  const modeLabel = data.modes[mode]?.label || mode;
  const content = `<div class="preview-warning"><strong>Henüz hiçbir alım uygulanmadı.</strong><span>${escapeHtml(modeLabel)} planı yerel hazine, eğitim/tersane kapasitesi, askerî limit ve özel birlik erişimlerine göre hazırlandı. Onayda şartlar yeniden hesaplanır.</span></div><div class="npc-preview-totals"><span><small>Devlet</small><strong>${number(plans.length)}</strong></span><span><small>Toplam emir</small><strong>${number(actionCount)}</strong></span><span><small>Planlanan bütçe</small><strong>${money(totalCost)}</strong></span></div><div class="npc-plan-list">${plans.map((plan) => npcPurchasePlanMarkup(plan, modeLabel)).join("") || '<div class="empty">Oyuncusuz aktif devlet bulunmuyor.</div>'}</div>`;
  const canExecute = actionCount > 0;
  openEditor(countryId ? "NPC devlet alım planı" : "Toplu NPC alım planı", `${number(actionCount)} emir · ${money(totalCost)}`, content, canExecute ? async () => {
    const results = await api("/api/admin/npc-purchases/execute", { method: "POST", body: JSON.stringify({ ...(countryId ? { countryId } : {}), mode }) });
    const spent = results.reduce((sum, result) => sum + Number(result.actualCost || 0), 0);
    const failed = results.reduce((sum, result) => sum + (result.errors || []).length, 0);
    closeEditor();
    toast(`${number(results.length)} NPC devlet işlendi · ${money(spent)} harcandı${failed ? ` · ${number(failed)} emir uygulanamadı` : ""}.`, failed ? "error" : "success");
    await refreshKeepingScroll(npcPurchasesPage);
  } : undefined);
  editorModal.querySelector(".modal").classList.add("wide");
  if (canExecute) setEditorSaveLabel(countryId ? "Bu devletin alımlarını uygula" : "Tüm planı uygula");
}

function npcBuildingManagerMarkup(data, settlementId) {
  const settlement = data.settlements.find((item) => item.id === settlementId) || data.settlements[0];
  if (!settlement) return '<div class="empty">Bu devlete bağlı yerleşke bulunmuyor.</div>';
  const available = settlement.buildings.filter((building) => !building.unavailableReason).length;
  const treasuryBlocked = settlement.buildings.filter((building) => building.unavailableReason === "Yerel hazine yetersiz");
  const orderedBuildings = [...settlement.buildings].sort((left, right) => Number(Boolean(left.unavailableReason)) - Number(Boolean(right.unavailableReason)) || left.name.localeCompare(right.name, "tr"));
  const canTransfer = data.settlements.some((item) => item.id !== settlement.id && Number(item.localTreasury) > 0);
  return `<section class="npc-city-command"><div class="npc-city-command-main"><label>Yönetilecek yerleşke<select id="npc-building-settlement">${data.settlements.map((item) => `<option value="${item.id}" ${selected(item.id, settlement.id)}>${escapeHtml(item.name)} · ${money(item.localTreasury)}</option>`).join("")}</select></label><div class="npc-city-balance"><span>Yerel hazine</span><strong>${money(settlement.localTreasury)}</strong><small>${treasuryBlocked.length ? `${number(treasuryBlocked.length)} bina için kaynak gerekiyor` : `${number(available)} işlem şu anda yapılabilir`}</small></div><button class="button npc-transfer-button" data-npc-open-transfer ${canTransfer ? "" : "disabled"}><span>⇄</span><div><strong>Hazine taşı</strong><small>${canTransfer ? "Başka yerleşkeden aktar" : "Uygun kaynak şehir yok"}</small></div></button></div><div class="npc-city-capacity"><span><small>Bina yuvası</small><strong>${number(settlement.slots.used)} / ${number(settlement.slots.limit)}</strong><i style="--fill:${Math.min(100, settlement.slots.used / Math.max(1, settlement.slots.limit) * 100)}%"></i></span><span><small>İnşaat kapasitesi</small><strong>${number(settlement.construction.used)} / ${number(settlement.construction.limit)}</strong><i style="--fill:${Math.min(100, settlement.construction.used / Math.max(1, settlement.construction.limit) * 100)}%"></i></span><span><small>Hazır işlem</small><strong>${number(available)}</strong><i style="--fill:${Math.min(100, available / Math.max(1, settlement.buildings.length) * 100)}%"></i></span></div></section><div class="npc-building-section-head"><div><strong>Bina kataloğu</strong><small>Uygun işlemler ilk sırada gösterilir</small></div><span>${number(settlement.buildings.length)} bina türü</span></div><div class="npc-building-grid">${orderedBuildings.map((building) => `<article class="npc-building-row ${building.unavailableReason ? "disabled" : "ready"}"><div class="npc-building-icon">${building.key === "port" || building.key === "shipyard" ? "⚓" : building.key === "farm" || building.key === "aqueduct" ? "♨" : building.key === "academy" ? "⌘" : building.key === "engineering" ? "⚒" : "▥"}</div><div><strong>${escapeHtml(building.name)}</strong><small>${building.currentLevel ? `Mevcut Sv${number(building.currentLevel)}` : "Yeni yapı"} · Azami Sv${number(building.maxLevel)}</small></div><div><strong>${building.nextLevel ? `Sv${number(building.nextLevel)}` : "Azami"}</strong><small>${building.cost === null ? "Tamamlandı" : `${money(building.cost)} · ${number(building.duration)} tur`}</small></div><button class="button compact ${building.unavailableReason ? "" : "primary"}" data-npc-buy-building="${escapeHtml(building.key)}" ${building.unavailableReason ? "disabled" : ""}>${escapeHtml(building.unavailableReason || (building.currentLevel ? "Yükselt" : "İnşa et"))}</button></article>`).join("")}</div>`;
}

async function openNpcTreasuryTransfer(country, data, targetSettlementId) {
  const target = data.settlements.find((item) => item.id === targetSettlementId) || data.settlements[0];
  if (!target) return;
  const sources = data.settlements.filter((item) => item.id !== target.id && Number(item.localTreasury) > 0).sort((left, right) => Number(right.localTreasury) - Number(left.localTreasury));
  if (!sources.length) return toast("Hazine aktarabilecek başka bir yerleşke bulunmuyor.", "error");
  const cheapestBlocked = target.buildings.filter((building) => building.unavailableReason === "Yerel hazine yetersiz" && building.cost !== null).sort((left, right) => Number(left.cost) - Number(right.cost))[0];
  const suggestion = Math.max(1, Number(cheapestBlocked?.cost || 0) - Number(target.localTreasury));
  const initialAmount = Math.min(suggestion, Number(sources[0].localTreasury));
  openEditor("Yerleşkeler arası hazine aktarımı", `${country.name} · Hedef: ${target.name}`, `<div class="npc-transfer-visual"><div><small>KAYNAK</small><strong id="npc-transfer-source-name">${escapeHtml(sources[0].name)}</strong><span id="npc-transfer-source-balance">${money(sources[0].localTreasury)}</span></div><b>→</b><div><small>HEDEF</small><strong>${escapeHtml(target.name)}</strong><span>${money(target.localTreasury)}</span></div></div><div class="form-grid"><label>Kaynak yerleşke<select id="npc-transfer-source">${sources.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${money(item.localTreasury)}</option>`).join("")}</select></label><label>Aktarılacak tutar<input id="npc-transfer-amount" type="number" min="1" max="${Number(sources[0].localTreasury)}" step="1" value="${initialAmount}" required><small>${cheapestBlocked ? `${escapeHtml(cheapestBlocked.name)} için gereken fark önerildi.` : "Pozitif bir tam sayı gir."}</small></label></div><div class="preview-warning"><strong>Güvenli transfer kuralları uygulanır.</strong><span>Tur başı devlet ve kaynak şehir kotası ile zorunlu bakım rezervi korunur. İşlem iki yerleşkenin hazinesine ve işlem geçmişine birlikte yazılır.</span></div>`, async () => {
    const result = await api(`/api/admin/npc-purchases/countries/${country.id}/treasury-transfer`, { method: "POST", body: JSON.stringify({ sourceSettlementId: document.getElementById("npc-transfer-source").value, targetSettlementId: target.id, amount: Number(document.getElementById("npc-transfer-amount").value) }) });
    toast(`${result.sourceName} → ${result.targetName}: ${money(result.amount)} aktarıldı.`);
    closeEditor();
    await openNpcBuildingManager(country, target.id);
  });
  setEditorSaveLabel("Hazineyi aktar");
  document.getElementById("npc-transfer-source").addEventListener("change", (event) => {
    const source = sources.find((item) => item.id === event.target.value);
    document.getElementById("npc-transfer-source-name").textContent = source?.name || "Kaynak";
    document.getElementById("npc-transfer-source-balance").textContent = money(source?.localTreasury || 0);
    const amount = document.getElementById("npc-transfer-amount");
    amount.max = String(Number(source?.localTreasury || 0));
    if (Number(amount.value) > Number(amount.max)) amount.value = amount.max;
  });
}

async function openNpcBuildingManager(country, initialSettlementId) {
  let data = await api(`/api/npc-purchases/countries/${country.id}/buildings`);
  let selectedSettlementId = data.settlements.some((item) => item.id === initialSettlementId) ? initialSettlementId : data.settlements[0]?.id;
  const render = () => {
    document.getElementById("editor-content").innerHTML = npcBuildingManagerMarkup(data, selectedSettlementId);
    const selector = document.getElementById("npc-building-settlement");
    selector?.addEventListener("change", () => { selectedSettlementId = selector.value; render(); });
    document.querySelector("[data-npc-open-transfer]")?.addEventListener("click", () => openNpcTreasuryTransfer(country, data, selectedSettlementId).catch((error) => toast(error.message, "error")));
    document.querySelectorAll("[data-npc-buy-building]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await api(`/api/admin/npc-purchases/countries/${country.id}/buildings`, { method: "POST", body: JSON.stringify({ settlementId: selectedSettlementId, buildingType: button.dataset.npcBuyBuilding }) });
        toast(`${country.name}: bina emri verildi · Sv${number(result.targetLevel)} · ${money(result.cost)}.`);
        data = await api(`/api/npc-purchases/countries/${country.id}/buildings`);
        render();
      } catch (error) {
        button.disabled = false;
        toast(error.message, "error");
      }
    }));
  };
  openEditor("Hızlı bina alımı", country.name, "");
  editorModal.querySelector(".modal").classList.add("wide");
  render();
}

async function npcPurchasesPage() {
  setActiveRoute("npc-purchases"); loading();
  const data = await api("/api/npc-purchases");
  if (!data.modes[npcPurchaseMode]) npcPurchaseMode = "GENERAL";
  const acquisitionState = data.guild.acquisitionTurn ? "Alım turu açık" : `Sonraki uygun tur: ${Math.ceil((data.guild.currentTurn + 1) / data.guild.acquisitionInterval) * data.guild.acquisitionInterval}`;
  const selectedMode = data.modes[npcPurchaseMode];
  const maxNpcTreasury = Math.max(1, ...data.countries.map((country) => Number(country.localTreasury) || 0));
  page.innerHTML = `<div class="page-head npc-purchase-hero"><div><span class="overview-kicker">NPC EKONOMİ VE ÜRETİM MASASI</span><h1>NPC Devlet Alımları</h1><p>Oyuncuların kullandığı otomatik alım planlarını NPC devletlere uygula; binaları yerleşke bazında hızlıca kur, yükselt ve şehirler arasında kaynak taşı.</p></div><div class="actions"><span class="npc-turn-light ${data.guild.acquisitionTurn ? "open" : ""}"><i></i>${data.guild.acquisitionTurn ? "Alım turu açık" : "Alım turu bekleniyor"}</span><button class="button primary" data-npc-preview-all ${data.guild.acquisitionTurn ? "" : "disabled"}>Tümünü önizle <b>→</b></button></div></div><section class="kpi-grid npc-kpi-grid"><div class="card kpi"><span>Oyuncusuz devlet</span><strong>${number(data.countries.length)}</strong><small>Tüm aktif NPC devletler</small></div><div class="card kpi"><span>Seçili alım</span><strong>${escapeHtml(selectedMode.label)}</strong><small>${escapeHtml(selectedMode.description)}</small></div><div class="card kpi"><span>Tur durumu</span><strong>${data.guild.acquisitionTurn ? "Uygun" : "Bekliyor"}</strong><small>${escapeHtml(acquisitionState)}</small></div><div class="card kpi"><span>Hızlı önizleme</span><strong>6 paralel</strong><small>Devlet belgeleri kontrollü yüklenir</small></div></section><div class="npc-section-label"><div><span>1</span><strong>Alım stratejisini seç</strong></div><small>Seçim bütün toplu ve tekil planlarda kullanılır</small></div><section class="npc-mode-picker">${Object.entries(data.modes).map(([key, mode]) => `<button class="card npc-mode-card ${key === npcPurchaseMode ? "active" : ""}" data-npc-mode="${key}"><span>${key === "HEAVY_SHIPS" ? "⚓" : key === "MIXED_SHIPS" ? "⛵" : key === "QUALITY" ? "♜" : key === "LIGHT" ? "➶" : "⚔"}</span><div><strong>${escapeHtml(mode.label)}</strong><small>${escapeHtml(mode.description)}</small></div><i>${key === npcPurchaseMode ? "Seçili" : "Seç"}</i></button>`).join("")}</section><div class="npc-section-label"><div><span>2</span><strong>Devleti yönet</strong></div><small>Planı aç veya yerleşke ekonomisine müdahale et</small></div><section class="card npc-purchase-toolbar"><label>Devlet ara<input id="npc-purchase-search" placeholder="Devlet adı…" autocomplete="off"></label><div><span>Seçili plan</span><strong>${escapeHtml(selectedMode.label)}</strong><small>Önizleme ve uygulama bu türe göre yapılır</small></div></section><section class="npc-country-grid">${data.countries.map((country) => { const treasuryRate = Math.max(4, Math.round(Number(country.localTreasury) / maxNpcTreasury * 100)); return `<article class="card npc-country-card" data-npc-country-card data-name="${escapeHtml(country.name.toLocaleLowerCase("tr-TR"))}"><header><div class="npc-country-title"><span class="npc-country-sigil">${escapeHtml(country.name.trim().slice(0, 1).toLocaleUpperCase("tr-TR"))}</span><div><span class="pill">NPC devlet</span><h3>${escapeHtml(country.name)}</h3><small>${number(country.settlementCount)} yerleşke · ${number(country.population)} nüfus</small></div></div></header><div class="npc-treasury-band"><div><small>Toplam yerel hazine</small><strong>${money(country.localTreasury)}</strong></div><i><b style="width:${treasuryRate}%"></b></i></div><div class="npc-country-finance"><span><small>Yerleşke başına</small><strong>${money(Math.floor(Number(country.localTreasury) / Math.max(1, Number(country.settlementCount))))}</strong></span><span><small>Hazırlanacak plan</small><strong>${escapeHtml(selectedMode.label)}</strong></span></div><footer><button class="button compact npc-building-action" data-npc-country-buildings="${country.id}"><span>▥</span> Bina ve hazine</button><button class="button primary compact" data-npc-country-preview="${country.id}" ${data.guild.acquisitionTurn ? "" : "disabled"}>Planı aç <b>→</b></button></footer></article>`; }).join("") || '<div class="card empty">Oyuncusuz aktif devlet bulunmuyor.</div>'}</section>`;
  document.querySelectorAll("[data-npc-mode]").forEach((button) => button.addEventListener("click", () => { npcPurchaseMode = button.dataset.npcMode; refreshKeepingScroll(npcPurchasesPage).catch(showPageError); }));
  document.querySelector("[data-npc-preview-all]")?.addEventListener("click", () => openNpcPurchasePreview(data).catch((error) => toast(error.message, "error")));
  document.querySelectorAll("[data-npc-country-preview]").forEach((button) => button.addEventListener("click", () => openNpcPurchasePreview(data, button.dataset.npcCountryPreview).catch((error) => toast(error.message, "error"))));
  document.querySelectorAll("[data-npc-country-buildings]").forEach((button) => button.addEventListener("click", () => openNpcBuildingManager(data.countries.find((country) => country.id === button.dataset.npcCountryBuildings)).catch((error) => toast(error.message, "error"))));
  const applyFilter = () => {
    const query = document.getElementById("npc-purchase-search").value.trim().toLocaleLowerCase("tr-TR");
    document.querySelectorAll("[data-npc-country-card]").forEach((card) => {
      card.hidden = Boolean(query && !card.dataset.name.includes(query));
    });
  };
  document.getElementById("npc-purchase-search").addEventListener("input", applyFilter);
}

function compositionAmount(composition) {
  return Object.values(composition || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function battleMercenariesMarkup(mercenaries) {
  if (!Array.isArray(mercenaries) || !mercenaries.length) return "";
  return `<div class="battle-mercenaries"><strong>🪙 Savaşa Bağlı Paralı Asker Kampanyaları</strong>${mercenaries.map((assignment) => {
    const personnel = compositionAmount(assignment.land);
    const ships = compositionAmount(assignment.ships);
    const assets = compositionAmount(assignment.assets);
    const force = [personnel ? `${number(personnel)} asker` : "", ships ? `${number(ships)} gemi` : "", assets ? `${number(assets)} kuşatma aleti` : ""].filter(Boolean).join(" · ") || "Kayıtlı kuvvet yok";
    return `<span><b>${escapeHtml(assignment.sideKey || "?")} Tarafı · ${escapeHtml(assignment.companyName || assignment.companyKey || "Paralı asker grubu")}</b> — ${escapeHtml(assignment.countryName || "Devlet bilinmiyor")} · ${force}</span>`;
  }).join("")}</div>`;
}

function activeBattleForcesMarkup(battle) {
  if (battle.terrain === "NAVAL") {
    return (battle.fleets || []).map((fleet) => `<div class="record-card"><strong>${escapeHtml(fleet.countryName)} · ${escapeHtml(fleet.name)}</strong><span>${fleet.sideKey} Tarafı · ${number(fleet.total)} gemi</span><small>${(fleet.ships || []).map((ship) => `${escapeHtml(ship.originName || "Liman yok")}: ${escapeHtml(state.catalog.find((item) => item.value === ship.shipType)?.label || ship.shipType)} ${number(ship.quantity)}`).join(" · ") || "Gemi yok"}</small></div>`).join("") || '<div class="empty">Henüz kalıcı filo eklenmemiş.</div>';
  }
  return (battle.armies || []).map((army) => `<div class="record-card"><strong>${escapeHtml(army.countryName)} · ${escapeHtml(army.name)}</strong><span>${army.sideKey} Tarafı · ${number(army.total)} asker</span><small>${army.units.map((unit) => `${escapeHtml(unit.originName || "Köken yok")}: ${escapeHtml(state.catalog.find((item) => item.value === unit.unitType)?.label || unit.unitType)} ${number(unit.quantity)}`).join(" · ") || "Birlik yok"}</small><button class="button" data-edit-army="${army.id}">Askerleri düzenle</button></div>`).join("") || '<div class="empty">Henüz kalıcı ordu eklenmemiş.</div>';
}

async function battlesPage() {
  setActiveRoute("battles"); loading();
  const [rows, activeBattles, catalog] = await Promise.all([api("/api/battles"), api("/api/active-battles"), state.catalog.length ? Promise.resolve(state.catalog) : api("/api/catalog/units")]);
  state.catalog = catalog;
  const active = rows.filter((row) => !["FINISHED", "CANCELLED"].includes(row.status)).length;
  const battleById = new Map(rows.map((row) => [row.id,row]));
  page.innerHTML = `<div class="page-head"><div><h1>Savaşlar</h1><p>Kara, kuşatma ve deniz savaşlarında katılımcı, ordu, filo ve paralı kuvvet yönetimi</p></div><span class="pill">${number(active)} aktif savaş</span></div>
    <div class="section-title"><h2>Aktif Savaşlar ve Kuvvetler</h2><span>${number(activeBattles.length)} savaş</span></div><section class="siege-list">${activeBattles.map((battle) => `<article class="card"><div class="card-head"><div><h3>${escapeHtml(battle.terrain === "SIEGE" ? battle.settlementName || "Yerleşke belirtilmemiş" : `${battle.countryAName || "A Tarafı"} — ${battle.countryBName || "B Tarafı"}`)}</h3><p>${escapeHtml(terrainLabels[battle.terrain] || battle.terrain)} · ${escapeHtml(battle.countryAName || "A Tarafı")} — ${escapeHtml(battle.countryBName || "B Tarafı")} · ${escapeHtml(battleStatusLabels[battle.status] || battle.status)} · Değerlendirme ${number(battle.roundNumber)}${battle.terrain === "SIEGE" ? ` · ${escapeHtml(siegePhaseLabels[battle.siegePhase] || battle.siegePhase || "Hücum")}` : ""}</p></div><button class="button primary" data-manage-active-battle="${battle.id}">Katılımcıları yönet</button></div><div class="compact-grid">${activeBattleForcesMarkup(battle)}</div>${battleMercenariesMarkup(battleById.get(battle.id)?.mercenaries)}</article>`).join("") || '<div class="card empty">Aktif savaş bulunmuyor.</div>'}</section>
    <div class="section-title"><h2>Tüm Savaşlar</h2><span>${number(rows.length)} kayıt</span></div><section class="battle-grid">${rows.map((row) => `<article class="card battle-card"><div class="card-head"><div><h3>${escapeHtml(row.country_a_name || "A Tarafı")} — ${escapeHtml(row.country_b_name || "B Tarafı")}</h3><p>${escapeHtml(terrainLabels[row.terrain] || row.terrain)} · Tur ${number(row.round_number)}${row.defender_settlement_name ? ` · ${escapeHtml(row.defender_settlement_name)}` : ""}</p></div><span class="pill ${["FINISHED", "CANCELLED"].includes(row.status) ? "neutral" : ""}">${escapeHtml(battleStatusLabels[row.status] || row.status)}</span></div><div class="battle-sides"><div><strong>${escapeHtml(row.country_a_name || "A")}</strong><span>${number(row.current_a)} / ${number(row.initial_a)}</span><small>${number(row.losses_a)} kayıp · ${number(row.pressure_a)} baskı</small></div><div><strong>${escapeHtml(row.country_b_name || "B")}</strong><span>${number(row.current_b)} / ${number(row.initial_b)}</span><small>${number(row.losses_b)} kayıp · ${number(row.pressure_b)} baskı</small></div></div>${row.wall_max_hp ? `<div class="battle-structure">Sur ${number(row.wall_current_hp)}/${number(row.wall_max_hp)} · Kapı ${number(row.gate_current_hp)}/${number(row.gate_max_hp)}</div>` : ""}${battleMercenariesMarkup(row.mercenaries)}<div class="row-actions"><button type="button" class="button compact" data-manage-battle-rosters="${row.id}">Kadroları gör / temizle</button></div></article>`).join("") || '<div class="card empty">Savaş kaydı bulunmuyor.</div>'}</section>`;
  document.querySelectorAll("[data-edit-army]").forEach((button) => button.addEventListener("click", () => {
    openArmyEditor(button.dataset.editArmy).catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-manage-active-battle]").forEach((button) => button.addEventListener("click", () => {
    const battle = activeBattles.find((item) => item.id === button.dataset.manageActiveBattle);
    openActiveBattleManager(battle).catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-manage-battle-rosters]").forEach((button) => button.addEventListener("click", () => {
    const battle = rows.find((item) => item.id === button.dataset.manageBattleRosters);
    openBattleRosterManager(battle).catch((error) => toast(error.message, "error"));
  }));
}

function rebellionProgressMarkup(value, tone = "") {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="rebellion-progress ${tone}"><span style="width:${progress}%"></span></div>`;
}

function rebellionArmyMarkup(item, live = false) {
  const faction = live ? item.liveFaction : item.predictedFaction;
  if (!faction?.type) return '<div class="empty compact-empty">Henüz isyancı tipi belirlenmedi.</div>';
  const composition = Object.entries(faction.composition || {}).filter(([, quantity]) => Number(quantity) > 0);
  const siegeAssets=Object.entries(faction.siegeAssets||{}).filter(([,quantity])=>Number(quantity)>0);
  return `<div class="rebel-army"><div class="rebel-army-head"><div><small>${live ? "SAHADAKİ İSYANCI ORDU" : "İSYAN ÇIKARSA OLUŞACAK GRUP"}</small><strong>${escapeHtml((live&&faction.armyName)||faction.name||faction.label||"İsyancılar")}</strong>${live?`<small>İsyan lideri: ${escapeHtml(faction.leaderName)} • Komuta +${number(faction.leaderSkill)}</small>`:""}</div><span class="pill ${live ? "danger" : "neutral"}">${escapeHtml(faction.label || rebellionFactionLabels[faction.type] || faction.type)}</span></div><div class="rebel-army-stats"><span><small>Personel</small><strong>${number(faction.personnel)}</strong></span><span><small>Askerî güç</small><strong>${number(faction.militaryPower)}</strong></span>${live ? `<span><small>Durum</small><strong>${escapeHtml(rebellionFactionStatusLabels[faction.status] || faction.status)}</strong></span>` : ""}</div><small>Birlikler</small><div class="rebel-composition">${composition.map(([unit, quantity]) => `<span>${escapeHtml(item.unitLabels?.[unit] || unit)} <b>${number(quantity)}</b></span>`).join("")}</div><small>Kuşatma treni</small><div class="rebel-composition">${siegeAssets.length?siegeAssets.map(([asset,quantity])=>`<span>${escapeHtml(item.siegeAssetLabels?.[asset]||asset)} <b>${number(quantity)}</b></span>`).join(""):'<span>Kuşatma aleti yok</span>'}</div></div>`;
}

function rebellionCard(item) {
  const active = item.rebellionActive || item.liveFaction;
  const critical = !active && item.rebellionProgress >= 70;
  const tone = active ? "danger" : critical ? "warning" : item.risk >= 25 ? "warning" : "";
  const projection = item.projection;
  const delta = projection.expected - item.rebellionProgress;
  const projectionText = item.rebellionActive ? "Açık isyan"
    : item.immuneNextTurn ? `Koruma: Tur ${number(item.recentUprisingUntilTurn)}`
      : `${number(projection.expected)}/100 ${delta > 0 ? `(+${number(delta)})` : delta < 0 ? `(${number(delta)})` : "(±0)"}`;
  return `<article class="card rebellion-card ${tone}" data-rebellion-card="${item.id}" data-country="${escapeHtml(item.countryName)}" data-status="${active ? "ACTIVE" : critical ? "CRITICAL" : item.risk >= 25 ? "THREATENED" : "STABLE"}" data-faction="${item.factionType || "NONE"}"><div class="rebellion-card-head"><div><span class="rebellion-country">${escapeHtml(item.countryName)}</span><h3>${escapeHtml(item.name)}</h3><div class="rebellion-badges"><span class="pill ${active ? "danger" : critical ? "warning" : "neutral"}">${active ? "🔥 Açık isyan" : critical ? "⚠ Kritik gerilim" : item.risk >= 25 ? "Yüksek risk" : "İzleniyor"}</span>${item.factionLabel ? `<span class="pill neutral">${escapeHtml(item.factionLabel)}</span>` : ""}</div></div><button class="button primary compact" data-open-rebellion="${item.id}">Ayrıntı & Müdahale</button></div><div class="rebellion-meter-head"><span>İsyan gerilimi <strong>${number(item.rebellionProgress)}/100</strong></span><span>Tur riski <strong>%${number(item.risk)}</strong></span></div>${rebellionProgressMarkup(item.rebellionProgress,tone)}<div class="rebellion-forecast"><span><small>Gelecek tur beklentisi</small><strong>${projectionText}</strong></span><span><small>Başarılı risk zarı</small><strong>${number(projection.onSuccess)}/100</strong></span><span><small>Başarısız risk zarı</small><strong>${number(projection.onFailure)}/100</strong></span><span><small>İsyan çıkma ihtimali</small><strong>%${number(projection.outbreakChance)}</strong></span></div><div class="rebellion-card-split"><div><small>Refah</small><strong>${number(item.prosperity)}/100 · ${escapeHtml(item.prosperityTier)}</strong><span>Sonraki tur: ${number(projection.prosperityOnFailure)}–${number(projection.prosperityOnSuccess)}</span></div><div><small>Başlıca etkenler</small><div class="factor-chips">${item.factors.slice().sort((a,b)=>Math.abs(b.adjustment)-Math.abs(a.adjustment)).slice(0,5).map((factor)=>`<span class="${factor.adjustment > 0 ? "bad" : "good"}">${factor.adjustment > 0 ? "+" : ""}${number(factor.adjustment)} ${escapeHtml(factor.label)}</span>`).join("")}</div></div></div>${rebellionArmyMarkup(item,Boolean(item.liveFaction))}</article>`;
}

function bindRebellionFilters() {
  const render = () => {
    const query = document.getElementById("rebellion-search").value.trim().toLocaleLowerCase("tr-TR");
    const country = document.getElementById("rebellion-country-filter").value;
    const status = document.getElementById("rebellion-status-filter").value;
    const faction = document.getElementById("rebellion-faction-filter").value;
    const rows = state.rebellionData.settlements.filter((item) => {
      const itemStatus = item.rebellionActive || item.liveFaction ? "ACTIVE" : item.rebellionProgress >= 70 ? "CRITICAL" : item.risk >= 25 ? "THREATENED" : "STABLE";
      return (!query || `${item.countryName} ${item.name} ${item.predictedFaction?.name || ""}`.toLocaleLowerCase("tr-TR").includes(query)) &&
        (!country || item.countryName === country) && (!status || itemStatus === status) && (!faction || item.factionType === faction);
    });
    document.getElementById("rebellion-results").innerHTML = rows.map(rebellionCard).join("") || '<div class="card empty">Filtrelere uyan yerleşke bulunamadı.</div>';
    document.getElementById("rebellion-result-count").textContent = `${number(rows.length)} yerleşke`;
    document.querySelectorAll("[data-open-rebellion]").forEach((button) => button.addEventListener("click", () => {
      openRebellionEditor(button.dataset.openRebellion).catch((error) => toast(error.message,"error"));
    }));
  };
  ["rebellion-search","rebellion-country-filter","rebellion-status-filter","rebellion-faction-filter"].forEach((id) => document.getElementById(id).addEventListener(id === "rebellion-search" ? "input" : "change",render));
  render();
}

async function rebellionsPage() {
  setActiveRoute("rebellions"); loading();
  const data = await api("/api/rebellions");
  state.rebellionData = data;
  const countries = [...new Set(data.settlements.map((item)=>item.countryName))].sort((a,b)=>a.localeCompare(b,"tr"));
  page.innerHTML = `<div class="page-head"><div><h1>İsyanlar Komuta Merkezi</h1><p>Mevcut gerilim, gerçek tur hesabı, isyancı kuvvet önizlemesi ve yönetici müdahaleleri</p></div><div class="actions"><span class="pill ${data.settlements[0]?.systemEnabled === false ? "warning" : ""}">${data.settlements[0]?.systemEnabled === false ? "Sistem kapalı" : "Sistem aktif"}</span><button class="button" data-refresh-rebellions>↻ Yenile</button></div></div><section class="kpi-grid rebellion-kpis"><div class="card kpi danger"><span>Açık isyan</span><strong>${number(data.summary.active)}</strong><small>Sahada etkin grup</small></div><div class="card kpi warning"><span>Kritik gerilim</span><strong>${number(data.summary.critical)}</strong><small>70+ ilerleme</small></div><div class="card kpi"><span>Yüksek risk</span><strong>${number(data.summary.threatened)}</strong><small>%25+ tur riski</small></div><div class="card kpi"><span>Gelecek tur patlama</span><strong>${number(data.summary.projectedOutbreaks)}</strong><small>Sıfırdan büyük ihtimal</small></div></section><section class="card rebellion-toolbar"><label>Yerleşke veya grup ara<input id="rebellion-search" placeholder="Örn. Baktriya Gönüllüleri…"></label><label>Devlet<select id="rebellion-country-filter"><option value="">Tüm devletler</option>${countries.map((country)=>`<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join("")}</select></label><label>Durum<select id="rebellion-status-filter"><option value="">Tüm durumlar</option><option value="ACTIVE">Açık isyan</option><option value="CRITICAL">Kritik</option><option value="THREATENED">Yüksek risk</option><option value="STABLE">İzleniyor</option></select></label><label>İsyan türü<select id="rebellion-faction-filter"><option value="">Tüm türler</option>${Object.entries(rebellionFactionLabels).map(([value,label])=>`<option value="${value}">${escapeHtml(label)}</option>`).join("")}</select></label></section><div class="section-title"><h2>Yerleşke İstikrar Dosyaları</h2><span id="rebellion-result-count"></span></div><section id="rebellion-results" class="rebellion-grid"></section>`;
  document.querySelector("[data-refresh-rebellions]").addEventListener("click",()=>refreshKeepingScroll(rebellionsPage));
  bindRebellionFilters();
}

function rebellionHistoryMarkup(history) {
  if (!history?.length) return '<div class="empty compact-empty">Henüz tur kaydı yok.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Tur</th><th>Refah</th><th>Gerilim</th><th>Risk / Zar</th><th>Sonuç</th></tr></thead><tbody>${history.map((row)=>`<tr><td>${number(row.game_turn)}</td><td>${number(row.prosperity_before)} → ${number(row.prosperity_after)}</td><td>${number(row.rebellion_before)} → ${number(row.rebellion_after)}</td><td>%${number(row.unrest_risk)} / ${row.rebellion_roll === null ? "—" : number(row.rebellion_roll)}</td><td>${escapeHtml(rebellionOutcomeLabels[row.outcome] || row.outcome)}</td></tr>`).join("")}</tbody></table></div>`;
}

async function runRebellionAction(item, action) {
  const warnings = {
    OUTBREAK: `${item.name} yerleşkesinde isyan hemen başlatılacak ve öngörülen isyancı kuvvet oluşturulacak. Devam edilsin mi?`,
    SUPPRESS: `${item.name} isyanı bastırılacak, grup kapatılacak ve 3 tur koruma verilecek. Devam edilsin mi?`,
    ESCALATE: `${item.name} isyan gerilimi 20 puan artırılsın mı?`,
    CALM: `${item.name} isyan gerilimi 20 puan azaltılsın mı?`,
    CLEAR_PROTECTION: `${item.name} için yeni ayaklanma koruması kaldırılsın mı?`
  };
  if (!window.confirm(warnings[action])) return;
  await api(`/api/admin/rebellions/${item.id}/action`,{method:"POST",body:JSON.stringify({action})});
  closeEditor();
  toast(action === "OUTBREAK" ? "İsyan ve isyancı kuvvet oluşturuldu." : action === "SUPPRESS" ? "İsyan bastırıldı ve koruma başladı." : "İsyan durumu güncellendi.");
  await refreshKeepingScroll(rebellionsPage);
}

async function openRebellionEditor(settlementId) {
  const item = await api(`/api/rebellions/${settlementId}`);
  const projection=item.projection;
  const active=Boolean(item.liveFaction||item.rebellionActive);
  const factionOptions=`<option value="">Otomatik belirle</option>${Object.entries(rebellionFactionLabels).map(([value,label])=>`<option value="${value}" ${selected(value,item.factionType)}>${escapeHtml(label)}</option>`).join("")}`;
  const factorRows=item.factors.slice().sort((a,b)=>b.adjustment-a.adjustment).map((factor)=>`<div class="factor-row ${factor.adjustment>0?"bad":"good"}"><span>${escapeHtml(factor.label)}</span><strong>${factor.adjustment>0?"+":""}${number(factor.adjustment)}</strong></div>`).join("");
  const siegeFields=item.liveFaction?rebelSiegeAssetKeys.map((asset)=>`<label>${escapeHtml(item.siegeAssetLabels?.[asset]||asset)}<input id="edit-rebel-siege-${asset}" type="number" min="0" max="${asset==="ram"?1:25}" step="1" value="${Number(item.liveFaction.siegeAssets?.[asset]||0)}"></label>`).join(""):"";
  const liveFields=item.liveFaction?`<div class="section-title"><h2>Sahadaki isyancı grup</h2><span>Canlı kayıt</span></div><div class="form-grid"><label>Grup adı<input id="edit-rebel-live-name" minlength="2" maxlength="100" value="${escapeHtml(item.liveFaction.name)}"></label><label>Durum<select id="edit-rebel-live-status">${["ORGANIZING","ACTIVE","OCCUPYING"].map((value)=>`<option value="${value}" ${selected(value,item.liveFaction.status)}>${escapeHtml(rebellionFactionStatusLabels[value])}</option>`).join("")}</select></label><label>Personel<input id="edit-rebel-live-personnel" type="number" min="1000" max="250000" step="100" value="${Number(item.liveFaction.personnel)}"><small>Kaydedildiğinde birlik dağılımı ve askerî güç yeniden hesaplanır.</small></label><label>İsyan lideri<input id="edit-rebel-live-leader" minlength="2" maxlength="100" value="${escapeHtml(item.liveFaction.leaderName)}"></label><label>Komuta seviyesi<select id="edit-rebel-live-skill">${[1,2,3].map((value)=>`<option value="${value}" ${selected(value,item.liveFaction.leaderSkill)}>+${value}</option>`).join("")}</select><small>Savaş çarpışma zarına komutan bonusu verir.</small></label></div><div class="section-title"><h2>İsyancı kuşatma treni</h2><button type="button" class="button compact" data-recalculate-rebel-siege>Otomatik Hesapla</button></div><div class="form-grid">${siegeFields}</div><small>Bu envanter isyancı grup saldıran taraf olduğunda kuşatmaya otomatik aktarılır.</small>`:"";
  openEditor("İsyan dosyasını yönet",`${item.countryName} · ${item.name} · Tur ${number(item.currentTurn)}`,`<div class="rebellion-detail-hero ${active?"danger":item.rebellionProgress>=70?"warning":""}"><div><span>${active?"🔥 AÇIK İSYAN":"⚑ İSYAN GERİLİMİ"}</span><strong>${number(item.rebellionProgress)}/100</strong></div><div><span>TUR RİSKİ</span><strong>%${number(item.risk)}</strong></div><div><span>GELECEK TUR BEKLENTİSİ</span><strong>${number(projection.expected)}/100</strong><small>${number(projection.onFailure)}–${number(projection.onSuccess)} olası aralık</small></div><div><span>İSYAN ÇIKIŞI</span><strong>%${number(projection.outbreakChance)}</strong></div></div><div class="rebellion-detail-grid"><section><div class="section-title"><h2>Risk hesabı</h2><span>${item.eligible?"Gerilim üretmeye uygun":"Aktif tetikleyici yok"}</span></div><div class="factor-list">${factorRows}</div><div class="condition-grid">${Object.entries(item.conditions).map(([key,value])=>`<span><small>${escapeHtml({conquered:"Fethedilmiş",foreignCulture:"Yabancı kültür",missionary:"Misyoner",besieged:"Kuşatma",epidemic:"Salgın",famine:"Kıtlık",recentRaid:"Yakın yağma",strictTaxation:"Sıkı vergi",ruinStage:"Haraplık",warExhaustion:"Savaş yorgunluğu",slaveRatio:"Köle oranı"}[key]||key)}</small><strong>${typeof value==="boolean"?(value?"Var":"Yok"):key==="slaveRatio"?`%${number(value)}`:number(value)}</strong></span>`).join("")}</div></section><section><div class="section-title"><h2>Gelecek tur senaryosu</h2><span>Tur ${number(projection.nextTurn)}</span></div><div class="scenario-grid"><div><span>Risk zarı başarılı · %${number(projection.successChance)}</span><strong>Gerilim ${number(projection.onSuccess)}/100</strong><small>Refah ${number(projection.prosperityOnSuccess)}/100</small></div><div><span>Risk zarı başarısız · %${number(100-projection.successChance)}</span><strong>Gerilim ${number(projection.onFailure)}/100</strong><small>Refah ${number(projection.prosperityOnFailure)}/100</small></div></div>${rebellionArmyMarkup(item,active)}</section></div><div class="section-title"><h2>Son tur kayıtları</h2><span>${number(item.history.length)} kayıt</span></div>${rebellionHistoryMarkup(item.history)}<div class="section-title"><h2>Doğrudan durum düzenleme</h2><span>Kaydet ile uygulanır</span></div><div class="form-grid"><label>Refah<input id="edit-rebellion-prosperity" type="number" min="0" max="100" step="1" value="${Number(item.prosperity)}"></label><label>İsyan gerilimi<input id="edit-rebellion-progress" type="number" min="0" max="100" step="1" value="${Number(item.rebellionProgress)}"></label><label>İsyan türü<select id="edit-rebellion-faction">${factionOptions}</select></label><label>Koruma bitiş turu<input id="edit-rebellion-protection" type="number" min="0" step="1" value="${item.recentUprisingUntilTurn??""}" placeholder="Koruma yok"></label></div><label class="check"><input id="edit-rebellion-unrest" type="checkbox" ${item.unrestActive?"checked":""}> Aktif huzursuzluk</label><div class="section-title"><h2>Bir sonraki isyancı oluşumu</h2><span>Boş bırakırsan sistem hesaplar</span></div><div class="form-grid"><label>Özel grup adı<input id="edit-rebellion-planned-name" minlength="2" maxlength="100" value="${item.predictedFaction.nameOverridden?escapeHtml(item.predictedFaction.name):""}" placeholder="${escapeHtml(item.predictedFaction.name||"Otomatik ad")}"></label><label>Özel personel<input id="edit-rebellion-planned-personnel" type="number" min="1000" max="250000" step="100" value="${item.predictedFaction.personnelOverridden?Number(item.predictedFaction.personnel):""}" placeholder="Otomatik: ${number(item.predictedFaction.personnel)}"><small>Boşsa nüfus, isyan türü ve savaş yorgunluğuna göre hesaplanır.</small></label></div>${liveFields}<div class="section-title"><h2>Hızlı müdahaleler</h2><span>Her işlem ayrıca denetim kaydı oluşturur</span></div><div class="rebellion-actions"><button type="button" class="button" data-rebellion-action="CALM" ${active?"disabled":""}>−20 Gerilimi azalt</button><button type="button" class="button warning" data-rebellion-action="ESCALATE" ${active?"disabled":""}>+20 Gerilimi yükselt</button><button type="button" class="button danger" data-rebellion-action="OUTBREAK" ${active?"disabled":""}>İsyanı şimdi başlat</button><button type="button" class="button danger" data-rebellion-action="SUPPRESS" ${active?"":"disabled"}>İsyanı bastır</button><button type="button" class="button" data-rebellion-action="CLEAR_PROTECTION" ${item.recentUprisingUntilTurn===null?"disabled":""}>Korumayı kaldır</button></div>`,async()=>{
    await api(`/api/admin/rebellions/${item.id}`,{method:"PATCH",body:JSON.stringify({
      prosperity:Number(document.getElementById("edit-rebellion-prosperity").value),
      rebellionProgress:Number(document.getElementById("edit-rebellion-progress").value),
      factionType:document.getElementById("edit-rebellion-faction").value||null,
      unrestActive:document.getElementById("edit-rebellion-unrest").checked,
      recentUprisingUntilTurn:document.getElementById("edit-rebellion-protection").value===""?null:Number(document.getElementById("edit-rebellion-protection").value),
      plannedFactionName:document.getElementById("edit-rebellion-planned-name").value.trim()||null,
      plannedFactionPersonnel:document.getElementById("edit-rebellion-planned-personnel").value===""?null:Number(document.getElementById("edit-rebellion-planned-personnel").value),
      liveFactionName:item.liveFaction?document.getElementById("edit-rebel-live-name").value:undefined,
      liveFactionPersonnel:item.liveFaction?Number(document.getElementById("edit-rebel-live-personnel").value):undefined,
      liveFactionStatus:item.liveFaction?document.getElementById("edit-rebel-live-status").value:undefined,
      liveLeaderName:item.liveFaction?document.getElementById("edit-rebel-live-leader").value:undefined,
      liveLeaderSkill:item.liveFaction?Number(document.getElementById("edit-rebel-live-skill").value):undefined,
      liveSiegeAssets:item.liveFaction?Object.fromEntries(rebelSiegeAssetKeys.map((asset)=>[asset,Number(document.getElementById(`edit-rebel-siege-${asset}`).value)||0])):undefined
    })});
    closeEditor();toast("Yerleşkenin isyan durumu ve isyancı kaydı güncellendi.");await refreshKeepingScroll(rebellionsPage);
  });
  editorModal.querySelector(".modal").classList.add("wide");
  document.querySelector("[data-recalculate-rebel-siege]")?.addEventListener("click",()=>{
    const personnel=Math.max(0,Number(document.getElementById("edit-rebel-live-personnel")?.value||0));
    const type=document.getElementById("edit-rebellion-faction")?.value||item.liveFaction?.type||"POPULAR";
    const engineering=Math.max(0,Math.min(3,Number(item.engineeringLevel||0)));
    const calculated={
      ladder_group:Math.min(8,Math.ceil(personnel/2000)),
      ram:personnel>=4000?1:0,
      mantlet:Math.min(5,Math.floor(personnel/4000)),
      ballista:(engineering>=1?1:0)+(type==="SEPARATIST"?1:0),
      catapult:engineering>=2?1:0,
      siege_tower:engineering>=3?1:0
    };
    for(const asset of rebelSiegeAssetKeys){
      const input=document.getElementById(`edit-rebel-siege-${asset}`);
      if(input)input.value=String(Number(calculated[asset]||0));
    }
    toast("Kuşatma treni personel, isyan türü ve yerel mühendislik seviyesine göre hesaplandı. Uygulamak için Kaydet'e basın.");
  });
  document.querySelectorAll("[data-rebellion-action]").forEach((button)=>button.addEventListener("click",async()=>{
    button.disabled=true;
    try{await runRebellionAction(item,button.dataset.rebellionAction);}catch(error){toast(error.message,"error");button.disabled=false;}
  }));
}

async function openBattleRosterManager(battle) {
  if (!battle) return;
  const data = await api(`/api/battles/${battle.id}/manual-rosters`);
  const rosterCommand = data.terrain === "NAVAL" ? "/savas filo-ayarla" : "/savas kadro-ayarla";
  const rosterCards = data.rosters.map((roster) => `<div class="record-card"><div class="card-head"><div><strong>${escapeHtml(roster.sideKey)} Tarafı · ${escapeHtml(roster.countryName)}</strong><small>${roster.sourceSettlementName ? `Köken: ${escapeHtml(roster.sourceSettlementName)} · ` : ""}${number(roster.total)} mevcut${roster.initialTotal !== roster.total ? ` / ${number(roster.initialTotal)} başlangıç` : ""}</small></div>${roster.total > 0 ? `<button type="button" class="button compact danger" data-clear-battle-roster="${roster.countryId}" ${data.editable ? "" : "disabled"}>Kadroyu temizle</button>` : ""}</div><div class="army-unit-editor">${roster.units.map((unit) => `<div class="army-unit-line"><div><strong>${escapeHtml(unit.label)}</strong><small>${number(unit.quantity)} mevcut${unit.initialQuantity !== unit.quantity ? ` · ${number(unit.initialQuantity)} başlangıç` : ""}</small></div>${unit.quantity > 0 ? `<button type="button" class="button compact danger" data-remove-battle-roster-unit="${unit.unitType}" data-country-id="${roster.countryId}" ${data.editable ? "" : "disabled"}>Birliği çıkar</button>` : ""}</div>`).join("") || '<div class="empty">Birlik bulunmuyor.</div>'}</div></div>`).join("");
  openEditor("Manuel savaş kadroları", `${data.country_a_name || "A Tarafı"} — ${data.country_b_name || "B Tarafı"} · ${battleStatusLabels[data.status] || data.status}`, `
    <div class="preview-warning"><strong>${rosterCommand} ile girilen kuvvetler</strong><span>Kalıcı ordular, filolar ve savaşa bağlı paralı asker kampanyaları bu ekranda değiştirilmez.${data.editable ? " Birlik türlerini ayrı ayrı veya Kadroyu temizle düğmesiyle kalan kadronun tamamını savaştan çekebilirsin. Çekilen askerler kayıp sayılmaz." : ` ${escapeHtml(data.editableReason || "Kadro şu anda değiştirilemiyor.")}`}</span></div>
    <div class="compact-grid">${rosterCards || '<div class="empty">Bu savaşta manuel olarak girilmiş kadro bulunmuyor.</div>'}</div>
  `, async () => closeEditor());
  document.getElementById("editor-save").textContent = "Kapat";

  const removeRoster = async (countryId, unitType) => {
    const roster = data.rosters.find((item) => item.countryId === countryId);
    if (!roster) return;
    const unit = unitType ? roster.units.find((item) => item.unitType === unitType) : null;
    const description = unit ? `${roster.countryName} kadrosundaki ${unit.label}` : `${roster.countryName} devletinin bütün manuel kadrosu`;
    if (!window.confirm(`${description} savaştan çıkarılsın mı?`)) return;
    await api(`/api/admin/battles/${battle.id}/manual-rosters/remove`, {
      method:"POST",body:JSON.stringify({ countryId,unitType:unitType || null })
    });
    toast(unit ? `${unit.label} savaş kadrosundan çıkarıldı.` : `${roster.countryName} manuel kadrosu temizlendi.`);
    await openBattleRosterManager(battle);
  };
  document.querySelectorAll("[data-remove-battle-roster-unit]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await removeRoster(button.dataset.countryId,button.dataset.removeBattleRosterUnit); }
    catch (error) { toast(error.message,"error"); button.disabled = false; }
  }));
  document.querySelectorAll("[data-clear-battle-roster]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await removeRoster(button.dataset.clearBattleRoster,null); }
    catch (error) { toast(error.message,"error"); button.disabled = false; }
  }));
}

async function openActiveBattleManager(battle) {
  if (!battle) return;
  const data = await api(`/api/battles/${battle.id}/roster-options`);
  const isNaval = data.terrain === "NAVAL";
  const sideName = (side) => side === "A"
    ? `A · ${data.terrain === "SIEGE" ? "Kuşatan" : "Saldıran"}`
    : "B · Savunan";
  const participants = data.countries.filter((country) => country.side_key);
  const unassignedCountries = data.countries.filter((country) => !country.side_key);
  const forces = isNaval ? (data.fleets || []) : (data.armies || []);
  const assignedForces = forces.filter((force) => force.assigned_side);
  const forceName = isNaval ? "Filo" : "Ordu";
  const forceNameLower = isNaval ? "filo" : "ordu";
  const forceAmountName = isNaval ? "gemi" : "asker";
  const forceEndpoint = isNaval ? "fleets" : "armies";
  const forcePayloadKey = isNaval ? "fleetId" : "armyId";
  const mercenaries = Array.isArray(data.mercenaries) ? data.mercenaries : [];
  const assignedMercenaries = mercenaries.filter((contract) => contract.assignedSide);
  const participantCards = participants.map((country) => {
    const countryForces = assignedForces.filter((force) => force.country_id === country.id);
    const contracts = assignedMercenaries.filter((contract) => contract.countryId === country.id);
    const forceSummary=[...countryForces.map((force)=>`${escapeHtml(force.name)} (${number(force.total)})`),...contracts.map((contract)=>`${escapeHtml(contract.companyName)} (${number(compositionAmount(isNaval?contract.ships:contract.land))})`)].join(" · ");
    return `<div class="record-card"><strong>${escapeHtml(country.name)}</strong><span>${sideName(country.side_key)}${country.is_primary ? " · Ana devlet" : ""}</span><small>${forceSummary || `Bağlı ${forceNameLower} veya paralı kuvvet yok`}</small>${country.is_primary ? "" : `<button type="button" class="button compact danger" data-battle-remove-country="${country.id}" data-side="${country.side_key}">Devleti çıkar</button>`}</div>`;
  }).join("");
  const forceCards = assignedForces.map((force) => `<div class="army-unit-line"><div><strong>${escapeHtml(force.country_name)} · ${escapeHtml(force.name)}</strong><small>${sideName(force.assigned_side)} · ${number(force.total)} ${forceAmountName}</small></div><button type="button" class="button compact danger" data-battle-remove-force="${force.id}" data-side="${force.assigned_side}">Çıkar</button></div>`).join("");
  const mercenaryCards=assignedMercenaries.map((contract)=>{
    const assets=compositionAmount(contract.assets);
    const amount=compositionAmount(isNaval?contract.ships:contract.land);
    return `<div class="army-unit-line"><div><strong>${escapeHtml(contract.countryName)} · ${escapeHtml(contract.companyName)}</strong><small>${sideName(contract.assignedSide)} · ${number(amount)} ${forceAmountName}${!isNaval&&assets?` · ${number(assets)} kuşatma aleti`:""} · ${escapeHtml(contract.settlementName)}</small></div><button type="button" class="button compact danger" data-battle-remove-mercenary="${contract.id}" data-side="${contract.assignedSide}">Çıkar</button></div>`;
  }).join("");
  openEditor("Savaş katılımcılarını yönet", `${terrainLabels[data.terrain] || data.terrain} · ${battleStatusLabels[data.status] || data.status}`, `
    <div class="preview-warning"><strong>Aktif savaşa takviye işlemi</strong><span>Eklenen ${forceNameLower} veya paralı kuvvet mevcut ve başlangıç kuvvet havuzuna birlikte yazılır; önceki kayıplar değişmez. ${isNaval?"Gemi sağlamlık kayıtları da savaş durumuna eklenir.":"Kuşatan tarafa bağlı kuşatma aletleri de eklenir."} Değerlendirme zarı atılmaya başladıysa önce o değerlendirme sonuçlandırılmalıdır.</span></div>
    <div class="section-title"><h2>Mevcut devletler</h2><span>${number(participants.length)} devlet</span></div><div class="compact-grid">${participantCards || '<div class="empty">Katılımcı bulunamadı.</div>'}</div>
    <div class="section-title"><h2>Devlet ekle</h2><span>Önce tarafı seç</span></div><div class="form-grid"><label>Taraf<select id="battle-country-side"><option value="A">${sideName("A")}</option><option value="B">${sideName("B")}</option></select></label><label>Devlet<select id="battle-country-id">${unassignedCountries.map((country) => `<option value="${country.id}">${escapeHtml(country.name)}</option>`).join("")}</select></label></div><button type="button" class="button primary" id="battle-add-country" ${unassignedCountries.length ? "" : "disabled"}>Devleti savaşa ekle</button>
    <div class="section-title"><h2>${forceName} ekle</h2><span>Yalnız uygun ${forceNameLower}lar</span></div><div class="form-grid"><label>Taraf<select id="battle-force-side"><option value="A">${sideName("A")}</option><option value="B">${sideName("B")}</option></select></label><label>Devlet<select id="battle-force-country"></select></label><label>${forceName}<select id="battle-force-id"></select></label></div><button type="button" class="button primary" id="battle-add-force">${forceName}yu savaşa sok</button>
    <div class="section-title"><h2>Bağlı ${forceNameLower}lar</h2><span>${number(assignedForces.length)} ${forceNameLower}</span></div><div class="army-unit-editor">${forceCards || `<div class="empty">Bağlı kalıcı ${forceNameLower} yok.</div>`}</div>
    <div class="section-title"><h2>Paralı asker ekle</h2><span>Yalnız etkin sözleşmeler</span></div><div class="form-grid"><label>Taraf<select id="battle-mercenary-side"><option value="A">${sideName("A")}</option><option value="B">${sideName("B")}</option></select></label><label>Devlet<select id="battle-mercenary-country"></select></label><label>Şirket<select id="battle-mercenary-id"></select></label></div><button type="button" class="button primary" id="battle-add-mercenary">Paralı askeri savaşa sok</button>
    <div class="section-title"><h2>Bağlı paralı askerler</h2><span>${number(assignedMercenaries.length)} şirket</span></div><div class="army-unit-editor">${mercenaryCards || '<div class="empty">Bağlı paralı asker grubu yok.</div>'}</div>
  `, null);

  const forceSide = document.getElementById("battle-force-side");
  const forceCountry = document.getElementById("battle-force-country");
  const forceSelect = document.getElementById("battle-force-id");
  const addForceButton = document.getElementById("battle-add-force");
  const refreshForceCountries = () => {
    const countries = participants.filter((country) => country.side_key === forceSide.value);
    forceCountry.innerHTML = countries.map((country) => `<option value="${country.id}">${escapeHtml(country.name)}</option>`).join("");
    refreshForceChoices();
  };
  const refreshForceChoices = () => {
    const choices = forces.filter((force) => force.country_id === forceCountry.value && !force.assigned_side);
    forceSelect.innerHTML = choices.map((force) => `<option value="${force.id}" ${force.blocking_reason ? "disabled" : ""}>${escapeHtml(force.name)} · ${number(force.total)} ${forceAmountName}${force.blocking_reason ? ` · ${escapeHtml(force.blocking_reason)}` : ""}</option>`).join("");
    const selectable = choices.some((force) => !force.blocking_reason && Number(force.total) > 0);
    addForceButton.disabled = !selectable;
    if (selectable) forceSelect.value = choices.find((force) => !force.blocking_reason && Number(force.total) > 0)?.id || "";
  };
  forceSide.addEventListener("change", refreshForceCountries);
  forceCountry.addEventListener("change", refreshForceChoices);
  refreshForceCountries();

  const mercenarySide=document.getElementById("battle-mercenary-side");
  const mercenaryCountry=document.getElementById("battle-mercenary-country");
  const mercenarySelect=document.getElementById("battle-mercenary-id");
  const addMercenaryButton=document.getElementById("battle-add-mercenary");
  const refreshMercenaryCountries=()=>{
    const countries=participants.filter((country)=>country.side_key===mercenarySide.value);
    mercenaryCountry.innerHTML=countries.map((country)=>`<option value="${country.id}">${escapeHtml(country.name)}</option>`).join("");
    refreshMercenaryChoices();
  };
  const refreshMercenaryChoices=()=>{
    const contracts=mercenaries.filter((contract)=>contract.countryId===mercenaryCountry.value&&!contract.assignedSide);
    mercenarySelect.innerHTML=contracts.map((contract)=>`<option value="${contract.id}" ${contract.blockingReason?"disabled":""}>${escapeHtml(contract.companyName)} · ${number(compositionAmount(isNaval?contract.ships:contract.land))} ${forceAmountName} · ${escapeHtml(contract.settlementName)}${contract.blockingReason?` · ${escapeHtml(contract.blockingReason)}`:""}</option>`).join("");
    const selectable=contracts.some((contract)=>!contract.blockingReason&&compositionAmount(isNaval?contract.ships:contract.land)>0);
    addMercenaryButton.disabled=!selectable;
    if(selectable)mercenarySelect.value=contracts.find((contract)=>!contract.blockingReason&&compositionAmount(isNaval?contract.ships:contract.land)>0)?.id||"";
  };
  mercenarySide.addEventListener("change",refreshMercenaryCountries);
  mercenaryCountry.addEventListener("change",refreshMercenaryChoices);
  refreshMercenaryCountries();

  document.getElementById("battle-add-country").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api(`/api/admin/battles/${battle.id}/participants`, { method:"POST",body:JSON.stringify({
        countryId:document.getElementById("battle-country-id").value,side:document.getElementById("battle-country-side").value,action:"ADD"
      }) });
      closeEditor(); toast("Devlet aktif savaşa eklendi."); await refreshKeepingScroll(battlesPage);
    } catch (error) { toast(error.message,"error"); event.currentTarget.disabled = false; }
  });
  addForceButton.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api(`/api/admin/battles/${battle.id}/${forceEndpoint}`, { method:"POST",body:JSON.stringify({
        [forcePayloadKey]:forceSelect.value,side:forceSide.value,action:"ADD"
      }) });
      closeEditor(); toast(`${forceName} aktif savaşa takviye olarak eklendi.`); await refreshKeepingScroll(battlesPage);
    } catch (error) { toast(error.message,"error"); event.currentTarget.disabled = false; }
  });
  addMercenaryButton.addEventListener("click",async(event)=>{
    event.currentTarget.disabled=true;
    try{
      await api(`/api/admin/battles/${battle.id}/mercenaries`,{method:"POST",body:JSON.stringify({
        contractId:mercenarySelect.value,side:mercenarySide.value,action:"ADD"
      })});
      closeEditor();toast("Paralı asker aktif savaşa takviye olarak eklendi.");await refreshKeepingScroll(battlesPage);
    }catch(error){toast(error.message,"error");event.currentTarget.disabled=false;}
  });
  document.querySelectorAll("[data-battle-remove-force]").forEach((button) => button.addEventListener("click", async () => {
    const force = assignedForces.find((item) => item.id === button.dataset.battleRemoveForce);
    if (!force || !window.confirm(`${force.name} ${forceNameLower}sunu aktif savaştan çıkarmak istediğine emin misin? Savaşa katıldıktan sonra zar atıldıysa işlem engellenecek.`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/battles/${battle.id}/${forceEndpoint}`, { method:"POST",body:JSON.stringify({ [forcePayloadKey]:force.id,side:button.dataset.side,action:"REMOVE" }) });
      closeEditor(); toast(`${forceName} savaştan çıkarıldı.`); await refreshKeepingScroll(battlesPage);
    } catch (error) { toast(error.message,"error"); button.disabled = false; }
  }));
  document.querySelectorAll("[data-battle-remove-mercenary]").forEach((button)=>button.addEventListener("click",async()=>{
    const contract=assignedMercenaries.find((item)=>item.id===button.dataset.battleRemoveMercenary);
    if(!contract||!window.confirm(`${contract.companyName} grubunu aktif savaştan çıkarmak istediğine emin misin? Savaşa katıldıktan sonra zar atıldıysa işlem engellenecek.`))return;
    button.disabled=true;
    try{
      await api(`/api/admin/battles/${battle.id}/mercenaries`,{method:"POST",body:JSON.stringify({contractId:contract.id,side:button.dataset.side,action:"REMOVE"})});
      closeEditor();toast("Paralı asker savaştan çıkarıldı.");await refreshKeepingScroll(battlesPage);
    }catch(error){toast(error.message,"error");button.disabled=false;}
  }));
  document.querySelectorAll("[data-battle-remove-country]").forEach((button) => button.addEventListener("click", async () => {
    const country = participants.find((item) => item.id === button.dataset.battleRemoveCountry);
    if (!country || !window.confirm(`${country.name} devletini aktif savaştan çıkarmak istediğine emin misin?`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/battles/${battle.id}/participants`, { method:"POST",body:JSON.stringify({ countryId:country.id,side:button.dataset.side,action:"REMOVE" }) });
      closeEditor(); toast("Devlet savaştan çıkarıldı."); await refreshKeepingScroll(battlesPage);
    } catch (error) { toast(error.message,"error"); button.disabled = false; }
  }));
}

async function aiGovernancePage() {
  setActiveRoute("ai-governance"); loading();
  const data = await api("/api/ai-governance");
  const playerless = data.countries.filter((country) => Number(country.player_count) === 0).length;
  const candidates = data.countries.filter((country) => country.profile_enabled).length;
  const testModeEnabled = data.settings.enabled === true;
  page.innerHTML = `<div class="page-head"><div><h1>Yapay Zekâ Devletleri</h1><p>Savaş, bütçe, bina ve kesin asker alımı hazırlayan denetlenebilir devlet kurmayı</p></div><div class="actions"><span class="pill ${testModeEnabled ? "" : "warning"}">${testModeEnabled ? "Test modu açık" : "Test modu kapalı"}</span><span class="pill neutral">${number(candidates)} aday / ${number(playerless)} oyuncusuz</span><button class="button ${testModeEnabled ? "danger" : "primary"}" data-toggle-ai-global>${testModeEnabled ? "Test modunu kapat" : "Test modunu aç"}</button></div></div>
    <section class="card ai-safety-banner"><div><strong>Hiçbir oyun emri otomatik uygulanmıyor.</strong><p>Test modu yalnız sen düğmeye bastığında taslak üretimine izin verir. Zamanlanmış planlama ve emir yürütme daima kapalıdır. AI yalnız seçilen ülkenin kendi kayıtlarını, kamuya açık diplomasiyi, katıldığı savaşları ve o ülkeye teslim edilmiş istihbaratı görebilir.</p></div><div class="ai-safety-grid"><span>Model<br><strong>${escapeHtml(data.settings.model)}</strong></span><span>API<br><strong>${data.apiConfigured ? "Hazır" : "Anahtar bekliyor"}</strong></span><span>Manuel taslak<br><strong>${testModeEnabled ? "Açık" : "Kapalı"}</strong></span><span>Emir yürütme<br><strong>Kapalı</strong></span></div></section>
    <section class="card table-wrap section-gap"><table><thead><tr><th>Devlet</th><th>Oyuncu</th><th>Doktrin</th><th>Karakter</th><th>Son taslak</th><th>Durum</th><th></th></tr></thead><tbody>${data.countries.map((country) => {
      const doctrine = data.doctrines[country.doctrine] || { label: country.doctrine };
      const playerCount = Number(country.player_count);
      const planStatus = aiPlanStatusLabels[country.latest_plan_status] || country.latest_plan_status;
      const countryEnabled = testModeEnabled && country.profile_enabled;
      return `<tr><td><strong>${escapeHtml(country.name)}</strong><small>${escapeHtml(country.strategic_goals || "Stratejik hedef girilmedi")}</small></td><td>${playerCount ? `<span class="pill warning">${number(playerCount)} oyuncu</span>` : '<span class="pill neutral">Oyuncusuz</span>'}</td><td>${escapeHtml(doctrine.label)}</td><td>Saldırganlık ${number(country.aggression)}<small>Risk ${number(country.risk_tolerance)} · Rezerv %${number(country.reserve_percent)}</small></td><td>${country.latest_plan_id ? `<strong>Tur ${number(country.latest_plan_turn)} · ${escapeHtml(planStatus)}</strong><small>${escapeHtml(country.latest_plan_summary || "Özet yok")}</small>${country.latest_plan_review_note ? `<small>İnceleme: ${escapeHtml(country.latest_plan_review_note)}</small>` : ""}` : "Taslak yok"}</td><td><span class="pill ${countryEnabled ? "" : "neutral"}">${countryEnabled ? "AI açık" : country.profile_enabled ? "Test modu kapalı" : "AI kapalı"}</span></td><td><div class="row-actions"><button class="button compact" data-edit-ai-country="${country.id}">Profil</button>${country.latest_plan_id ? `<button class="button compact" data-review-ai-plan="${country.latest_plan_id}">Planı incele</button>` : ""}${playerCount === 0 ? `<button class="button compact ${country.profile_enabled ? "danger" : ""}" data-toggle-ai-country="${country.id}">${country.profile_enabled ? "Ülkeyi kapat" : "Ülkeyi aç"}</button><button class="button compact" data-inspect-ai-country="${country.id}">Görünür veri</button><button class="button compact primary" data-generate-ai-country="${country.id}" ${!data.apiConfigured || !country.profile_enabled || !testModeEnabled ? "disabled" : ""}>Tam strateji üret</button>` : ""}</div></td></tr>`;
    }).join("") || '<tr><td colspan="7" class="empty">Aktif devlet bulunmuyor.</td></tr>'}</tbody></table></section>`;
  document.querySelectorAll("[data-edit-ai-country]").forEach((button) => button.addEventListener("click", () => {
    const country = data.countries.find((item) => item.id === button.dataset.editAiCountry);
    if (country) openAiCountryEditor(country, data.doctrines);
  }));
  document.querySelector("[data-toggle-ai-global]").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const nextEnabled = !testModeEnabled;
    if (!window.confirm(`AI test modu ${nextEnabled ? "açılsın" : "kapatılsın"} mı? Bu işlem otomatik oyun emri oluşturmaz.`)) return;
    button.disabled = true;
    try {
      await api("/api/admin/ai-governance/settings", { method: "PATCH", body: JSON.stringify({ enabled: nextEnabled }) });
      toast(`AI test modu ${nextEnabled ? "açıldı" : "kapatıldı"}; otomatik emir yürütme kapalı kaldı.`);
      await refreshKeepingScroll(aiGovernancePage);
    } catch (error) { toast(error.message, "error"); button.disabled = false; }
  });
  document.querySelectorAll("[data-toggle-ai-country]").forEach((button) => button.addEventListener("click", async () => {
    const country = data.countries.find((item) => item.id === button.dataset.toggleAiCountry);
    if (!country) return;
    const enabled = !country.profile_enabled;
    button.disabled = true;
    try {
      await api(`/api/admin/ai-governance/countries/${country.id}`, { method: "PATCH", body: JSON.stringify({
        enabled, doctrine: country.doctrine, aggression: Number(country.aggression), riskTolerance: Number(country.risk_tolerance),
        reservePercent: Number(country.reserve_percent), strategicGoals: country.strategic_goals || "", customInstructions: country.custom_instructions || ""
      }) });
      toast(`${country.name} için AI taslak üretimi ${enabled ? "açıldı" : "kapatıldı"}; hiçbir emir uygulanmadı.`);
      await refreshKeepingScroll(aiGovernancePage);
    } catch (error) { toast(error.message, "error"); button.disabled = false; }
  }));
  document.querySelectorAll("[data-review-ai-plan]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const record = await api(`/api/ai-governance/plans/${button.dataset.reviewAiPlan}`);
      openAiPlanReport(record);
    } catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; }
  }));
  document.querySelectorAll("[data-inspect-ai-country]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const observation = await api(`/api/ai-governance/countries/${button.dataset.inspectAiCountry}/observation`);
      const country = data.countries.find((item) => item.id === button.dataset.inspectAiCountry);
      openEditor("AI görünür veri özeti", `${country?.name || "Devlet"} · düşmanların gizli kayıtları dahil değildir`, `<div class="detail-grid"><div class="detail-cell"><span>Tur</span><strong>${number(observation.turn)}</strong></div><div class="detail-cell"><span>Yerleşke</span><strong>${number(observation.settlements.length)}</strong></div><div class="detail-cell"><span>Ordu / Filo</span><strong>${number(observation.armies.length)} / ${number(observation.fleets.length)}</strong></div><div class="detail-cell"><span>İstihbarat</span><strong>${number(observation.intelligenceReports.length)}</strong></div></div><pre class="json-preview">${escapeHtml(JSON.stringify(observation, null, 2))}</pre>`, async () => closeEditor());
      document.getElementById("editor-save").textContent = "Kapat";
    } catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; }
  }));
  document.querySelectorAll("[data-generate-ai-country]").forEach((button) => button.addEventListener("click", async () => {
    const country = data.countries.find((item) => item.id === button.dataset.generateAiCountry);
    if (!country || !window.confirm(`${country.name} için yalnızca TASLAK plan üretilecek. Hiçbir emir uygulanmayacak. Devam edilsin mi?`)) return;
    button.disabled = true; button.textContent = "Strateji hazırlanıyor…";
    try {
      const result = await api(`/api/admin/ai-governance/countries/${country.id}/generate-draft`, { method: "POST" });
      toast(`${country.name}: Tur ${number(result.game_turn)} taslağı oluşturuldu; hiçbir emir uygulanmadı.`);
      await refreshKeepingScroll(aiGovernancePage);
    } catch (error) { toast(error.message, "error"); button.disabled = false; button.textContent = "Tam strateji üret"; }
  }));
}

function openAiPlanReport(record) {
  const plan = record.plan || {};
  const observation = record.observation || {};
  const references = new Map();
  const addReferences = (rows, prefix = "") => (rows || []).forEach((row) => {
    if (row?.id) references.set(row.id, `${prefix}${row.name || row.opponent_country_name || row.id}`);
  });
  addReferences(observation.publicCountries);
  if (observation.country?.id) references.set(observation.country.id, observation.country.name);
  addReferences(observation.settlements, "Yerleşke: ");
  addReferences(observation.armies, "Ordu: ");
  addReferences(observation.fleets, "Filo: ");
  addReferences(observation.characters, "Karakter: ");
  (observation.visibleBattles || []).forEach((battle) => references.set(battle.id, `Savaş: ${observation.country?.name || "Yönetilen devlet"} — ${battle.opponent_country_name || "bilinmeyen taraf"}`));
  const refLabel = (value) => value ? (references.get(value) || value) : "—";
  const list = (items, empty) => items?.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`;
  const orders = (plan.orders || []).map((order, index) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(aiOrderCategoryLabels[order.category] || order.category)}</span><strong>${index + 1}. ${escapeHtml(aiOrderKindLabels[order.kind] || order.kind)}</strong></div><span class="ai-priority">Öncelik ${number(order.priority)}/5</span></div><div class="ai-order-route"><span><small>Kaynak</small>${escapeHtml(refLabel(order.sourceRef))}</span><span><small>Hedef</small>${escapeHtml(refLabel(order.targetRef))}</span>${order.amount !== null && order.amount !== undefined ? `<span><small>Miktar</small>${number(order.amount)}</span>` : ""}</div><p><strong>Gerekçe:</strong> ${escapeHtml(order.reason)}</p>${order.condition ? `<p><strong>Koşul:</strong> ${escapeHtml(order.condition)}</p>` : ""}</article>`).join("") || '<div class="empty">AI bu tur için işlem önermedi.</div>';
  const policies = (plan.battlePolicies || []).map((policy) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>Savaş planı</span><strong>${escapeHtml(refLabel(policy.battleId))}</strong></div><span class="ai-priority">${escapeHtml(aiBattlePostureLabels[policy.posture] || policy.posture)}</span></div><p><strong>Geri çekilme ölçütü:</strong> ${escapeHtml(policy.retreatRule)}</p>${policy.preferredNavalOrder ? `<p><strong>Deniz manevrası:</strong> ${escapeHtml(aiNavalOrderLabels[policy.preferredNavalOrder] || policy.preferredNavalOrder)}</p>` : ""}<p><strong>Gerekçe:</strong> ${escapeHtml(policy.reason)}</p></article>`).join("") || '<div class="empty">Aktif savaşa özel öneri yok.</div>';
  const construction = (plan.constructionPlan || []).map((action) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(refLabel(action.settlementRef))}</span><strong>${escapeHtml(action.buildingName)} → Sv${number(action.targetLevel)}</strong></div><span class="ai-priority">Öncelik ${number(action.priority)}/5</span></div><div class="ai-order-route"><span><small>Maliyet</small>${money(action.estimatedCost)}</span><span><small>Süre</small>${number(action.durationTurns)} tur</span></div><p>${escapeHtml(action.reason)}</p></article>`).join("") || '<div class="empty">Bu tur bina yatırımı önerilmedi.</div>';
  const recruitment = (plan.recruitmentPlan || []).map((action) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(refLabel(action.settlementRef))}</span><strong>${number(action.quantity)} ${escapeHtml(action.unitName)}</strong></div><span class="ai-priority">Öncelik ${number(action.priority)}/5</span></div><div class="ai-order-route"><span><small>Maliyet</small>${money(action.estimatedCost)}</span><span><small>Yeni bakım</small>${money(action.addedUpkeep)}</span></div><p>${escapeHtml(action.reason)}</p></article>`).join("") || '<div class="empty">Bu tur asker alımı önerilmedi.</div>';
  const shipbuilding = (plan.shipbuildingPlan || []).map((action) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(refLabel(action.settlementRef))}</span><strong>${number(action.quantity)} ${escapeHtml(action.shipName)}</strong></div><span class="ai-priority">Öncelik ${number(action.priority)}/5</span></div><div class="ai-order-route"><span><small>Maliyet</small>${money(action.estimatedCost)}</span><span><small>Yeni bakım</small>${money(action.addedUpkeep)}</span><span><small>Süre</small>${number(action.completionTurns)} tur</span></div><p>${escapeHtml(action.reason)}</p></article>`).join("") || '<div class="empty">Bu tur gemi üretimi önerilmedi.</div>';
  const wars = (plan.warPlans || []).map((war) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(war.posture)}</span><strong>${escapeHtml(refLabel(war.opponentCountryRef))}</strong></div></div><p><strong>Hedef:</strong> ${escapeHtml(war.objective)}</p><p><strong>Kuvvetler:</strong> ${escapeHtml([...(war.committedArmyRefs || []), ...(war.committedFleetRefs || [])].map(refLabel).join(", ") || "Belirlenmedi")}</p><ol>${(war.phases || []).map((phase) => `<li>${escapeHtml(phase)}</li>`).join("")}</ol><p><strong>Saldırı şartı:</strong> ${escapeHtml(war.attackCondition)}</p><p><strong>Vazgeçme şartı:</strong> ${escapeHtml(war.abortCondition)}</p><p><strong>Gerekçe:</strong> ${escapeHtml(war.reason)}</p></article>`).join("") || '<div class="empty">Ayrı bir savaş harekâtı önerilmedi.</div>';
  const budget = plan.budgetPlan || {};
  const validationErrors = record.validation?.errors || [];
  const status = aiPlanStatusLabels[record.status] || record.status;
  const reviewable = ["DRAFT", "APPROVED", "REJECTED"].includes(record.status);
  openEditor("AI strateji ve yatırım raporu", `${record.country_name} · Tur ${number(record.game_turn)} · ${status}`, `<div class="preview-warning ai-plan-boundary"><strong>Yalnız öneri — oyun emri değildir</strong><span>Bu rapor hiçbir komut oluşturmaz ve oyun verisini değiştirmez.</span></div><div class="detail-grid ai-plan-facts"><div class="detail-cell"><span>Durum</span><strong>${escapeHtml(status)}</strong></div><div class="detail-cell"><span>Tur / Sürüm</span><strong>${number(record.game_turn)} / ${number(record.revision)}</strong></div><div class="detail-cell"><span>Model</span><strong>${escapeHtml(record.model)}</strong></div><div class="detail-cell"><span>Doğrulama</span><strong>${record.validation?.valid ? "Geçti" : "Hatalı"}</strong></div></div><section class="ai-plan-section"><h3>Genel strateji</h3><p>${escapeHtml(plan.summary || "Özet yok.")}</p></section><section class="ai-plan-section"><h3>Stratejik değerlendirme</h3>${list(plan.strategicAssessment, "Değerlendirme yok.")}</section><section class="ai-plan-section"><h3>Tur bütçesi</h3><div class="detail-grid"><div class="detail-cell"><span>Başlangıç</span><strong>${money(budget.startingTreasury)}</strong></div><div class="detail-cell"><span>Korunacak rezerv</span><strong>${money(budget.reserveAmount)}</strong></div><div class="detail-cell"><span>Planlanan harcama</span><strong>${money(budget.plannedSpending)}</strong></div><div class="detail-cell"><span>Tahmini kalan</span><strong>${money(budget.estimatedTreasuryAfter)}</strong></div></div><p>${escapeHtml(budget.reasoning || "Bütçe açıklaması yok.")}</p></section><section class="ai-plan-section"><div class="section-head"><strong>Bina yatırımları</strong><span>${number(plan.constructionPlan?.length)}</span></div><div class="ai-order-list">${construction}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Asker alımı</strong><span>${number(plan.recruitmentPlan?.length)}</span></div><div class="ai-order-list">${recruitment}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Gemi üretimi</strong><span>${number(plan.shipbuildingPlan?.length)}</span></div><div class="ai-order-list">${shipbuilding}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Savaş ve harekât planları</strong><span>${number(plan.warPlans?.length)}</span></div><div class="ai-order-list">${wars}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Diğer önerilen hamleler</strong><span>${number(plan.orders?.length)}</span></div><div class="ai-order-list">${orders}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Aktif savaş kararları</strong><span>${number(plan.battlePolicies?.length)}</span></div><div class="ai-order-list">${policies}</div></section><div class="ai-plan-two-columns"><section class="ai-plan-section"><h3>Riskler</h3>${list(plan.risks, "Belirtilen risk yok.")}</section><section class="ai-plan-section"><h3>Sonraki tur hedefleri</h3>${list(plan.nextTurnGoals, "Sonraki tur hedefi yok.")}</section></div>${validationErrors.length ? `<section class="ai-plan-section error"><h3>Doğrulama hataları</h3>${list(validationErrors, "")}</section>` : ""}<label>İnceleme notu<textarea id="ai-review-note" maxlength="2000" rows="3" placeholder="Neden uygun bulduğunu veya reddettiğini yazabilirsin.">${escapeHtml(record.review_note || "")}</textarea></label>${reviewable ? `<div class="ai-review-actions"><button type="button" class="button danger" data-ai-review="REJECT">Reddet</button><button type="button" class="button primary" data-ai-review="APPROVE" ${record.validation?.valid ? "" : "disabled"}>Manuel uygulamaya uygun</button></div>` : ""}`, async () => closeEditor());
  document.getElementById("editor-save").textContent = "Kapat";
  document.querySelectorAll("[data-ai-review]").forEach((button) => button.addEventListener("click", async () => {
    const decision = button.dataset.aiReview;
    button.disabled = true;
    try {
      await api(`/api/admin/ai-governance/plans/${record.id}/review`, { method: "POST", body: JSON.stringify({ decision, note: document.getElementById("ai-review-note").value }) });
      closeEditor();
      toast(decision === "APPROVE" ? "Plan manuel uygulamaya uygun işaretlendi; hiçbir oyun emri uygulanmadı." : "Plan reddedildi; hiçbir oyun emri uygulanmadı.");
      await refreshKeepingScroll(aiGovernancePage);
    } catch (error) { toast(error.message, "error"); button.disabled = false; }
  }));
}

function openAiCountryEditor(country, doctrines) {
  const doctrineOptions = Object.entries(doctrines).map(([value, item]) => `<option value="${value}" ${selected(value, country.doctrine)}>${escapeHtml(item.label)}</option>`).join("");
  openEditor("AI devlet profilini düzenle", `${country.name} · yalnız manuel taslak üretimini ayarlar`, `<label class="check"><input id="edit-ai-enabled" type="checkbox" ${country.profile_enabled ? "checked" : ""} ${Number(country.player_count) > 0 ? "disabled" : ""}> Bu ülke için AI taslak üretimini aç</label><div class="form-grid"><label>Doktrin<select id="edit-ai-doctrine">${doctrineOptions}</select></label><label>Hazine rezervi (%)<input id="edit-ai-reserve" type="number" min="0" max="100" step="1" value="${Number(country.reserve_percent)}"></label><label>Saldırganlık (0–100)<input id="edit-ai-aggression" type="number" min="0" max="100" step="1" value="${Number(country.aggression)}"></label><label>Risk toleransı (0–100)<input id="edit-ai-risk" type="number" min="0" max="100" step="1" value="${Number(country.risk_tolerance)}"></label></div><label>Uzun vadeli stratejik hedefler<textarea id="edit-ai-goals" maxlength="2000" rows="4" placeholder="Örn. Ege adalarını koru; kara savaşından kaçın…">${escapeHtml(country.strategic_goals || "")}</textarea></label><label>Ülke karakteri ve özel sınırlar<textarea id="edit-ai-instructions" maxlength="4000" rows="5" placeholder="Örn. Antlaşmaları kolay bozma; sivillere karşı yağma yapma…">${escapeHtml(country.custom_instructions || "")}</textarea><small>Bu alan yalnız ülkenin oyun kişiliğini tanımlar; oyun kurallarını geçersiz kılamaz.</small></label><div class="preview-warning"><strong>Test sınırı</strong><span>Bu ayar yalnız senin başlatacağın taslak üretimini açar. Zamanlanmış planlama ve oyun emri yürütme kapalı kalır.</span></div>`, async () => {
    await api(`/api/admin/ai-governance/countries/${country.id}`, { method: "PATCH", body: JSON.stringify({
      enabled: document.getElementById("edit-ai-enabled").checked,
      doctrine: document.getElementById("edit-ai-doctrine").value,
      aggression: Number(document.getElementById("edit-ai-aggression").value),
      riskTolerance: Number(document.getElementById("edit-ai-risk").value),
      reservePercent: Number(document.getElementById("edit-ai-reserve").value),
      strategicGoals: document.getElementById("edit-ai-goals").value,
      customInstructions: document.getElementById("edit-ai-instructions").value
    }) });
    closeEditor(); toast(`${country.name} AI profili kaydedildi; otomatik emir yürütme kapalı kaldı.`); await refreshKeepingScroll(aiGovernancePage);
  });
}

function showPageError(error) {
  page.innerHTML = `<div class="card error"><strong>Veri yüklenemedi.</strong><br>${escapeHtml(error.message)}</div>`;
}

function bindCountryRows() {
  document.querySelectorAll("tr[data-country-id]").forEach((row) => row.addEventListener("click", () => {
    countryDetail(row.dataset.countryId).catch(showPageError);
  }));
}

function selected(value, current) { return String(value ?? "") === String(current ?? "") ? "selected" : ""; }

function openEditor(title, subtitle, content, submit) {
  state.editor = { submit, pageScrollTop: pageScrollTop() };
  document.getElementById("editor-title").textContent = title;
  document.getElementById("editor-subtitle").textContent = subtitle || "";
  document.getElementById("editor-content").innerHTML = content;
  document.getElementById("editor-error").hidden = true;
  const saveButton = document.getElementById("editor-save");
  saveButton.hidden = typeof submit !== "function";
  saveButton.disabled = false;
  saveButton.classList.remove("danger");
  saveButton.textContent = "Değişiklikleri kaydet";
  editorModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  if (Number.isFinite(state.editor?.pageScrollTop)) state.pendingPageScrollTop = state.editor.pageScrollTop;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  editorModal.hidden = true;
  editorModal.querySelector(".modal").classList.remove("wide");
  state.editor = null;
  document.body.style.overflow = "";
}

function openCountryEditor(country) {
  if (!country) return;
  openEditor("Devleti düzenle", country.name, `<div class="form-grid"><label>Devlet adı<input id="edit-country-name" value="${escapeHtml(country.name)}" required minlength="2" maxlength="80"></label><label>Hazine<input id="edit-country-treasury" type="number" min="0" step="1" value="${Number(country.treasury)}" required></label></div><label>Seferberlik<select id="edit-country-mobilization"><option value="PEACE" ${selected("PEACE", country.mobilization)}>Barış</option><option value="PARTIAL" ${selected("PARTIAL", country.mobilization)}>Kısmi</option><option value="GENERAL" ${selected("GENERAL", country.mobilization)}>Genel</option></select></label>`, async () => {
    await api(`/api/admin/countries/${country.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-country-name").value, treasury: Number(document.getElementById("edit-country-treasury").value), mobilization: document.getElementById("edit-country-mobilization").value }) });
    closeEditor(); toast("Devlet bilgileri güncellendi."); await refreshKeepingScroll(countries);
  });
}

function openCapitalEditor(country, settlements) {
  if (!country || !Array.isArray(settlements)) return;
  const candidates = settlements.filter((settlement) => settlement.id !== country.capital_settlement_id);
  if (!candidates.length) {
    toast("Başkent olarak seçilebilecek başka bir yerleşke bulunmuyor.", "error");
    return;
  }
  const currentCapital = settlements.find((settlement) => settlement.id === country.capital_settlement_id);
  const options = candidates
    .map((settlement) => `<option value="${settlement.id}">${escapeHtml(settlement.name)} · ${number(Number(settlement.population) + Number(settlement.slave_population))} nüfus</option>`)
    .join("");
  openEditor(
    "Başkent değiştir",
    `${country.name} · Mevcut başkent: ${currentCapital?.name || "Atanmamış"}`,
    `<div class="preview-warning"><strong>Başkent bonusları anında taşınır.</strong><span>${escapeHtml(currentCapital?.name || "Eski başkent")} gelir ve nüfus artışı +%1 bonusunu kaybeder; seçilen yeni başkent iki bonusu da kazanır. Nüfus veya hazine değerleri doğrudan değiştirilmez.</span></div><label>Yeni başkent<select id="edit-country-capital" required>${options}</select></label><label>Yönetici işlem gerekçesi<textarea id="edit-country-capital-reason" required minlength="2" maxlength="300" placeholder="Başkent değişikliğinin kısa gerekçesi"></textarea></label>`,
    async () => {
      const settlementId = document.getElementById("edit-country-capital").value;
      const reason = document.getElementById("edit-country-capital-reason").value.trim();
      if (reason.length < 2) throw new Error("Başkent değişikliği için kısa bir gerekçe yazın.");
      const result = await api(`/api/admin/countries/${country.id}/capital`, {
        method: "POST",
        body: JSON.stringify({ settlementId, reason })
      });
      closeEditor();
      toast(`${result.newCapitalName} yeni başkent oldu; +%1 bonuslar taşındı.`);
      await refreshKeepingScroll(() => countryDetail(country.id));
    }
  );
}

function openSettlementEditor(settlement) {
  if (!settlement) return;
  const religions = state.religionCatalog || [];
  const religionOptions = religions.map((item) => `<option value="${item.value}" ${selected(item.value, settlement.religion_key)}>${escapeHtml(item.label)} — ${escapeHtml(item.secondaryLabel)}</option>`).join("");
  openEditor("Yerleşkeyi düzenle", `${settlement.country_name} · ${settlement.name}`, `<div class="form-grid"><label>Yerleşke adı<input id="edit-settlement-name" value="${escapeHtml(settlement.name)}" required minlength="2" maxlength="80"></label><label>Yerel hazine<input id="edit-settlement-treasury" type="number" min="0" step="1" value="${Number(settlement.local_treasury)}" required></label><label>Özgür nüfus<input id="edit-settlement-population" type="number" min="0" step="1" value="${Number(settlement.population)}" required></label><label>Köle nüfusu<input id="edit-settlement-slaves" type="number" min="0" step="1" value="${Number(settlement.slave_population)}" required></label><label>Vergi oranı (%)<input id="edit-settlement-tax-rate" type="number" min="0" max="100" step="0.001" value="${Number(settlement.tax_rate_percent ?? 3)}" required><small>Alım turunda halk vergisi bu oran × özgür nüfus olarak hesaplanır.</small></label><label>Temel kara ticareti<input id="edit-settlement-land-trade" type="number" min="0" step="1" value="${Number(settlement.base_land_trade_income)}" required></label><label>Ana din<select id="edit-settlement-religion">${religionOptions}</select></label><label>Din bağlılığı (%)<input id="edit-settlement-religion-adherence" type="number" min="0" max="100" step="0.01" value="${Number(settlement.religion_adherence_percent ?? 75)}" required><small>%80+ tam, %50–79 yarım, %50 altı ana dinin yerel etkisini vermez. Kalan oran seçilen dine bağlı ikinci mezhebe otomatik atanır; ikinci mezhep %25’te tam, %10–24’te yarım etki verir.</small></label><label>Haraplık<select id="edit-settlement-ruin"><option value="0" ${selected(0, settlement.ruin_stage)}>Normal</option><option value="1" ${selected(1, settlement.ruin_stage)}>Harap I</option><option value="2" ${selected(2, settlement.ruin_stage)}>Harap II</option></select></label><div class="check-grid"><label class="check"><input id="edit-settlement-coastal" type="checkbox" ${settlement.is_coastal ? "checked" : ""}> Kıyı yerleşkesi</label><label class="check"><input id="edit-settlement-conquered" type="checkbox" ${settlement.is_conquered ? "checked" : ""}> Fethedilmiş</label></div></div>`, async () => {
    await api(`/api/admin/settlements/${settlement.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-settlement-name").value, population: Number(document.getElementById("edit-settlement-population").value), slavePopulation: Number(document.getElementById("edit-settlement-slaves").value), localTreasury: Number(document.getElementById("edit-settlement-treasury").value), taxRatePercent: Number(document.getElementById("edit-settlement-tax-rate").value), baseLandTradeIncome: Number(document.getElementById("edit-settlement-land-trade").value), religionKey: document.getElementById("edit-settlement-religion").value, religionAdherencePercent: Number(document.getElementById("edit-settlement-religion-adherence").value), ruinStage: Number(document.getElementById("edit-settlement-ruin").value), isCoastal: document.getElementById("edit-settlement-coastal").checked, isConquered: document.getElementById("edit-settlement-conquered").checked }) });
    closeEditor(); toast("Yerleşke ekonomisi, dini ve durumu güncellendi."); await refreshKeepingScroll(settlementsPage);
  });
}

async function openCharacterEditor(character) {
  if (!character) return;
  if (!state.characterCatalog) state.characterCatalog = await api("/api/catalog/characters");
  const catalog = state.characterCatalog;
  const specializations = catalog.specializations.filter((item) => item.role === character.role);
  const commander = character.role === "COMMANDER";
  const admiral = Boolean(character.is_admiral);
  const options = (items, current) => `<option value="">Yok</option>${items.map((item) => `<option value="${item.value}" ${selected(item.value, current)}>${escapeHtml(item.label)}</option>`).join("")}`;
  openEditor("Karakteri düzenle", `${character.country_name} · ${roleLabel(character)}`, `<div class="form-grid"><label>Karakter adı<input id="edit-character-name" value="${escapeHtml(character.name)}" required minlength="2" maxlength="80"></label><label>Puan / bonus<input id="edit-character-skill" type="number" min="0" max="100" step="1" value="${Number(character.skill_bonus)}" required></label><label>Uzmanlık<select id="edit-character-specialization">${options(specializations, character.specialization)}</select></label><label>Uzmanlık seviyesi<select id="edit-character-level"><option value="0" ${selected(0, character.specialization_level)}>Sv0</option><option value="1" ${selected(1, character.specialization_level)}>Sv1</option><option value="2" ${selected(2, character.specialization_level)}>Sv2</option><option value="3" ${selected(3, character.specialization_level)}>Sv3</option></select></label>${commander ? `<label>Komutan doktrini<select id="edit-character-doctrine">${options(catalog.commanderDoctrines, character.doctrine)}</select></label><label>Kara zaferi<input id="edit-character-victories" type="number" min="0" max="999" step="1" value="${Number(character.commander_victories || 0)}"></label>` : ""}${admiral ? `<label>Amiral uzmanlığı<select id="edit-admiral-specialization">${options(catalog.admiralSpecializations, character.admiral_specialization)}</select></label><label>Amiral uzmanlık seviyesi<select id="edit-admiral-level"><option value="0" ${selected(0, character.admiral_specialization_level)}>Sv0</option><option value="1" ${selected(1, character.admiral_specialization_level)}>Sv1</option><option value="2" ${selected(2, character.admiral_specialization_level)}>Sv2</option><option value="3" ${selected(3, character.admiral_specialization_level)}>Sv3</option></select></label><label>Amiral doktrini<select id="edit-admiral-doctrine">${options(catalog.admiralDoctrines, character.admiral_doctrine)}</select></label><label>Deniz zaferi<input id="edit-admiral-victories" type="number" min="0" max="9" step="1" value="${Number(character.admiral_victories || 0)}"></label>` : ""}</div><div class="preview-warning"><strong>Görev bağlantısı korunur.</strong><span>Ad, puan, uzmanlık ve doktrin değişir; karakter mevcut görevinden çıkarılmaz.</span></div>`, async () => {
    const nullable = (id) => document.getElementById(id)?.value || null;
    await api(`/api/admin/characters/${character.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-character-name").value, skillBonus: Number(document.getElementById("edit-character-skill").value), specialization: nullable("edit-character-specialization"), specializationLevel: Number(document.getElementById("edit-character-level").value), doctrine: commander ? nullable("edit-character-doctrine") : null, commanderVictories: commander ? Number(document.getElementById("edit-character-victories").value) : 0, admiralSpecialization: admiral ? nullable("edit-admiral-specialization") : null, admiralSpecializationLevel: admiral ? Number(document.getElementById("edit-admiral-level").value) : 0, admiralDoctrine: admiral ? nullable("edit-admiral-doctrine") : null, admiralVictories: admiral ? Number(document.getElementById("edit-admiral-victories").value) : 0 }) });
    closeEditor(); toast("Karakter bilgileri güncellendi."); await refreshKeepingScroll(charactersPage);
  });
}

async function openArmyEditor(armyId) {
  if (!state.catalog.length) state.catalog = await api("/api/catalog/units");
  const data = await api(`/api/armies/${armyId}`);
  const army = data.army;
  const active = Boolean(army.active_battle_id);
  const commanderOptions = `<option value="">Atanmamış</option>${data.commanders.map((item) => `<option value="${item.id}" ${selected(item.id, army.commander_character_id)}>${escapeHtml(item.name)} (+${number(item.skill_bonus)})${item.army_name || item.fleet_name ? ` · ${escapeHtml(item.army_name || item.fleet_name)}` : ""}</option>`).join("")}`;
  const settlementOptions = data.settlements.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("");
  const unitOptions = state.catalog.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join("");
  openEditor("Orduyu düzenle", `${army.country_name} · ${army.name}`, `<div class="form-grid"><label>Ordu adı<input id="edit-army-name" value="${escapeHtml(army.name)}" required minlength="2" maxlength="60"></label><label>Komutan<select id="edit-army-commander">${commanderOptions}</select></label></div>${active ? `<div class="preview-warning"><strong>Aktif ${escapeHtml(terrainLabels[army.active_battle_terrain] || army.active_battle_terrain)} savaşı</strong><span>Asker azaltmaları savaş formuna da anında işlenir. Aktif savaş bitmeden asker eklenemez.</span></div>` : ""}<div class="section-title"><h2>Birlikler</h2><span>Yeni toplam mevcudu yaz</span></div><div class="army-unit-editor">${data.units.map((unit, index) => `<div class="army-unit-line"><div><strong>${escapeHtml(state.catalog.find((item) => item.value === unit.unit_type)?.label || unit.unit_type)}</strong><small>${escapeHtml(unit.settlement_name || "Köken yok")}</small></div><input class="edit-army-unit" type="number" min="0" step="1" value="${Number(unit.quantity)}" data-original="${Number(unit.quantity)}" data-settlement="${unit.settlement_id}" data-unit="${unit.unit_type}" aria-label="Yeni toplam miktar ${index + 1}"></div>`).join("") || '<div class="empty">Bu orduda birlik yok.</div>'}</div>${active ? "" : `<div class="section-title"><h2>Yeni asker ekle</h2><span>Girilen miktar mevcut birliğe eklenir; eksik stok otomatik tamamlanır</span></div><div class="form-grid"><label>Köken yerleşke<select id="edit-army-new-settlement">${settlementOptions}</select></label><label>Birlik türü<select id="edit-army-new-unit">${unitOptions}</select></label><label>Eklenecek miktar<input id="edit-army-new-quantity" type="number" min="0" step="1" value="0"></label></div>`}<div class="card danger-zone"><div class="card-head"><div><h3>Orduyu sil</h3><p>${active ? "Etkin savaş kadrosundan çıkarılmadan silinemez." : "Ordu kaydı ve birlik tahsisleri kaldırılır; komutan serbest bırakılır."}</p></div><button id="delete-army" class="button danger" type="button" ${active ? "disabled" : ""}>Kalıcı olarak sil</button></div></div>`, async () => {
    await api(`/api/admin/armies/${armyId}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-army-name").value, commanderId: document.getElementById("edit-army-commander").value || null }) });
    for (const input of document.querySelectorAll(".edit-army-unit")) {
      const quantity = Number(input.value);
      if (quantity !== Number(input.dataset.original)) await api("/api/admin/army-units", { method: "POST", body: JSON.stringify({ armyId, settlementId: input.dataset.settlement, unitType: input.dataset.unit, quantity }) });
    }
    const newQuantity = Number(document.getElementById("edit-army-new-quantity")?.value || 0);
    if (newQuantity > 0) await api("/api/admin/army-units", { method: "POST", body: JSON.stringify({ armyId, settlementId: document.getElementById("edit-army-new-settlement").value, unitType: document.getElementById("edit-army-new-unit").value, quantity: newQuantity, operation: "ADD" }) });
    closeEditor(); toast(active ? "Ordu ve aktif savaş mevcudu güncellendi." : "Ordu güncellendi.");
    const route = document.querySelector("[data-route].active")?.dataset.route || "armies";
    await refreshKeepingScroll(() => navigate(route));
  });
  document.getElementById("delete-army")?.addEventListener("click", async () => {
    const confirmation = window.prompt("Bu orduyu kalıcı olarak silmek için ORDUYU SIL yazın.");
    if (confirmation !== "ORDUYU SIL") return;
    const reason = window.prompt("Silme gerekçesini yazın.");
    if (!reason?.trim()) return;
    try {
      await api(`/api/admin/armies/${armyId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation, reason: reason.trim() })
      });
      const route = document.querySelector("[data-route].active")?.dataset.route || "armies";
      closeEditor();
      toast(`${army.name} silindi; birlik tahsisleri serbest bırakıldı.`);
      await refreshKeepingScroll(() => navigate(route));
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function openFleetHealthEditor(fleetId) {
  const data=await api(`/api/fleets/${fleetId}`);
  const fleet=data.fleet;
  const shipLabels={kerkouros:"Kerkouros",hjortspring:"Hjortspring Savaş Teknesi",trireme:"Trireme",quinquereme:"Quinquereme"};
  const statusLabels={HEALTHY:"Sağlam",DAMAGED:"Hasarlı",DISABLED:"İş göremez"};
  const hasDamaged=data.healthGroups.some((group)=>Number(group.current_hp)<Number(group.max_hp));
  const blockedReason=fleet.active_battle_id
    ?"Bu filo etkin savaşa bağlı. Önce Savaşlar menüsünden savaş kadrosundan çıkarılmalıdır."
    :fleet.active_blockade_id
      ?"Bu filo etkin ablukaya bağlı. Önce abluka kaldırılmalıdır."
      :fleet.pending_raid_id
        ?"Bu filo sonuç bekleyen deniz yağmasına bağlıdır. Önce yağma sonuçlandırılmalıdır."
        :null;
  const rows=data.healthGroups.map((group,index)=>{
    const percent=Math.round(Number(group.current_hp)*100/Number(group.max_hp));
    return `<div class="army-unit-line"><div><strong>${number(group.quantity)} ${escapeHtml(shipLabels[group.ship_type]||group.ship_type)} · %${number(percent)}</strong><small>${escapeHtml(group.settlement_name)} · ${escapeHtml(statusLabels[group.status]||group.status)} · azami ${number(group.max_hp)} HP</small></div><input class="edit-fleet-hp" type="number" min="1" max="${Number(group.max_hp)}" step="1" value="${Number(group.current_hp)}" data-original="${Number(group.current_hp)}" data-index="${index}" aria-label="Yeni gemi canı ${index+1}" ${blockedReason?"disabled":""}></div>`;
  }).join("")||'<div class="empty">Bu filoda düzenlenebilir gemi bulunmuyor.</div>';
  openEditor(
    "Filo gemi canlarını düzenle",
    `${fleet.country_name} · ${fleet.name}`,
    `${blockedReason?`<div class="preview-warning"><strong>Düzenleme şu anda kilitli</strong><span>${escapeHtml(blockedReason)}</span></div>`:'<div class="preview-warning"><strong>Doğrudan sağlamlık yönetimi</strong><span>Her satır aynı tür, liman ve can değerindeki gemileri temsil eder. Azami HP verilen hasar kayıtları kaldırılır ve belgeye %100 yansır.</span></div>'}<div class="section-title"><h2>Filo gemileri</h2><span>HP değerini doğrudan yaz</span></div><div class="army-unit-editor">${rows}</div><label>Değişiklik gerekçesi<textarea id="edit-fleet-health-reason" rows="2" minlength="3" maxlength="500" required placeholder="Örn. tamamlanan tamirin düzeltilmesi"></textarea></label><div class="card danger-zone"><div class="card-head"><div><h3>Filoyu sil</h3><p>${blockedReason?escapeHtml(blockedReason):hasDamaged?"Hasarlı gemiler azami HP'ye çıkarılmadan filo silinemez.":"Filo kaydı ve gemi tahsisleri kaldırılır; gemiler kaynak limanlarına döner ve Amiral serbest bırakılır."}</p></div><button id="delete-fleet" class="button danger" type="button" ${blockedReason||hasDamaged?"disabled":""}>Kalıcı olarak sil</button></div></div>`,
    blockedReason?null:async()=>{
      const reason=document.getElementById("edit-fleet-health-reason").value.trim();
      if(reason.length<3)throw new Error("Değişiklik gerekçesi en az 3 karakter olmalıdır.");
      const changed=[...document.querySelectorAll(".edit-fleet-hp")].filter((input)=>Number(input.value)!==Number(input.dataset.original));
      if(!changed.length)throw new Error("En az bir gemi grubunun canını değiştirin.");
      for(const input of changed){
        const group=data.healthGroups[Number(input.dataset.index)];
        await api(`/api/admin/fleets/${fleetId}/health`,{method:"PATCH",body:JSON.stringify({
          settlementId:group.settlement_id,shipType:group.ship_type,damageIds:group.damage_ids,
          quantity:Number(group.quantity),currentHp:Number(input.value),reason
        })});
      }
      closeEditor();toast(`${fleet.name} gemi canları güncellendi.`);
      await refreshKeepingScroll(forcesPage);
    }
  );
  editorModal.querySelector(".modal").classList.add("wide");
  document.getElementById("delete-fleet")?.addEventListener("click",async()=>{
    const confirmation=window.prompt("Bu filoyu kalıcı olarak silmek için FILOYU SIL yazın.");
    if(confirmation!=="FILOYU SIL")return;
    const reason=window.prompt("Silme gerekçesini yazın.");
    if(!reason?.trim())return;
    try{
      const result=await api(`/api/admin/fleets/${fleetId}`,{
        method:"DELETE",body:JSON.stringify({confirmation,reason:reason.trim()})
      });
      closeEditor();toast(`${fleet.name} silindi; ${number(result.releasedShips)} gemi kaynak limanlarına döndü.`);
      await refreshKeepingScroll(forcesPage);
    }catch(error){toast(error.message,"error");}
  });
}

async function submitEditor(event) {
  event.preventDefault();
  if (!state.editor?.submit) return;
  const button = document.getElementById("editor-save");
  const error = document.getElementById("editor-error");
  error.hidden = true; button.disabled = true; button.textContent = "Kaydediliyor…";
  try { await state.editor.submit(); }
  catch (caught) { error.textContent = caught.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = "Değişiklikleri kaydet"; }
}

const dataFieldLabels = {
  id: "Kayıt kimliği", guild_id: "Discord sunucusu", country_id: "Devlet", settlement_id: "Yerleşke",
  proposer_country_id: "Teklif eden devlet", receiver_country_id: "Teklif alan devlet",
  requester_country_id: "Talep eden devlet", grantor_country_id: "İzin veren devlet",
  overlord_country_id: "Hâkim devlet", vassal_country_id: "Vassal devlet",
  attacker_country_id: "Saldıran devlet", defender_country_id: "Savunan devlet",
  army_id: "Ordu", fleet_id: "Filo", character_id: "Karakter", dynasty_id: "Hanedan",
  status: "Durum", name: "Ad", title: "Başlık", treasury: "Hazine", population: "Nüfus",
  quantity: "Miktar", unit_type: "Birlik türü", offered_by: "Teklif eden oyuncu",
  responded_by: "Yanıtlayan oyuncu", created_by: "Oluşturan oyuncu", updated_by: "Güncelleyen oyuncu",
  created_at: "Oluşturulma", updated_at: "Son güncelleme", responded_at: "Yanıtlanma", ended_at: "Sona erme",
  channel_id: "Discord kanalı", message_id: "Discord mesajı", current_turn: "Güncel tur"
};
const dataValueLabels = {
  ACTIVE: "Aktif", PENDING: "Bekliyor", REJECTED: "Reddedildi", ENDED: "Sona erdi", CANCELLED: "İptal edildi",
  APPROVED: "Onaylandı", ACCEPTED: "Kabul edildi", DECLINED: "Reddedildi", PAUSED: "Duraklatıldı",
  COMPLETED: "Tamamlandı", DRAFT: "Taslak", OPEN: "Açık", CLOSED: "Kapalı", ALIVE: "Hayatta", DEAD: "Ölü",
  PEACE: "Barış", PARTIAL: "Kısmi seferberlik", GENERAL: "Genel seferberlik", true: "Evet", false: "Hayır"
};
const technicalDataColumns = new Set(["id", "guild_id", "discord_id", "channel_id", "message_id", "created_at", "updated_at", "created_by", "updated_by", "offered_by", "responded_by", "ended_by", "actor_user_id"]);
const isTechnicalDataColumn = (column) => technicalDataColumns.has(column.name) || (column.name.endsWith("_id") && !column.reference);
const dataFieldWords = {
  action: "İşlem", active: "Aktif", age: "Yaş", amount: "Tutar", army: "Ordu", authority: "Otorite",
  battle: "Savaş", bonus: "Bonus", candidate: "Aday", capacity: "Kapasite", character: "Karakter", commander: "Komutan",
  cost: "Maliyet", country: "Devlet", culture: "Kültür", damage: "Hasar", defender: "Savunan", description: "Açıklama",
  duration: "Süre", election: "Seçim", enabled: "Etkin", end: "Bitiş", event: "Olay", family: "Aile", fleet: "Filo",
  gender: "Cinsiyet", health: "Sağlık", income: "Gelir", influence: "Nüfuz", level: "Seviye", limit: "Sınır",
  loyalty: "Sadakat", member: "Üye", name: "Ad", operation: "Operasyon", owner: "Sahip", percent: "Yüzde",
  points: "Puan", population: "Nüfus", progress: "İlerleme", quantity: "Miktar", reason: "Gerekçe", receiver: "Alan",
  relation: "İlişki", religion: "Din", reputation: "İtibar", result: "Sonuç", scandal: "Skandal", seats: "Koltuk",
  settlement: "Yerleşke", side: "Taraf", skill: "Yetenek", start: "Başlangıç", status: "Durum", target: "Hedef",
  tax: "Vergi", title: "Unvan", total: "Toplam", trade: "Ticaret", treasury: "Hazine", turn: "Tur", type: "Tür",
  unit: "Birlik", user: "Kullanıcı", value: "Değer", vote: "Oy", war: "Savaş"
};
const dataColumnLabel = (name) => dataFieldLabels[name] || String(name || "").split("_").map((part) => dataFieldWords[part] || (part ? `${part[0].toLocaleUpperCase("tr-TR")}${part.slice(1)}` : part)).join(" ");
const dataValuePreview = (value) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 180);
  const raw = String(value);
  if (dataValueLabels[raw]) return dataValueLabels[raw];
  if (/^\d{4}-\d{2}-\d{2}T/u.test(raw)) {
    try { return date(raw); } catch { /* Ham değeri göster. */ }
  }
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(raw)) return "Teknik kayıt";
  return raw.slice(0, 180);
};

function dataInputValue(column, value) {
  if (value === null || value === undefined) return "";
  if (column.dataType === "json" || column.dataType === "jsonb" || column.dataType === "ARRAY" || typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function dataField(column, value, insert, options = []) {
  const identifier = `data-field-${column.name}`;
  const attributes = `data-data-column="${escapeHtml(column.name)}" data-data-type="${escapeHtml(column.dataType)}" data-nullable="${column.nullable}" data-default="${column.defaultValue ? "true" : "false"}"`;
  const hint = [column.dataType, column.nullable ? "boş olabilir" : "zorunlu", column.defaultValue ? `varsayılan: ${column.defaultValue}` : ""].filter(Boolean).join(" · ");
  const disabled = !insert && (column.primary || column.generated);
  const valueText = dataInputValue(column, value);
  let control;
  if (column.reference) {
    const current = value === null || value === undefined ? "" : String(value);
    const available = [...options];
    if (current && !available.some((option) => String(option.value) === current)) available.unshift({ value: current, label: "Mevcut seçim" });
    control = `<select id="${identifier}" ${attributes} ${disabled ? "disabled" : ""}>${column.nullable ? `<option value="" ${!current ? "selected" : ""}>Seçilmedi</option>` : `<option value="" ${!current ? "selected" : ""}>Seçin…</option>`}${available.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
  } else if (column.dataType === "boolean") {
    control = `<select id="${identifier}" ${attributes} ${disabled ? "disabled" : ""}>${column.nullable ? `<option value="" ${value === null ? "selected" : ""}>NULL</option>` : ""}<option value="true" ${value === true ? "selected" : ""}>true</option><option value="false" ${value === false ? "selected" : ""}>false</option></select>`;
  } else if (column.dataType === "json" || column.dataType === "jsonb" || column.dataType === "ARRAY") {
    control = `<textarea id="${identifier}" ${attributes} rows="4" ${disabled ? "disabled" : ""}>${escapeHtml(valueText)}</textarea>`;
  } else {
    const numeric = ["smallint", "integer", "real", "double precision", "numeric", "decimal"].includes(column.dataType);
    control = `<input id="${identifier}" ${attributes} type="${numeric ? "number" : "text"}" value="${escapeHtml(valueText)}" ${disabled ? "disabled" : ""}>`;
  }
  return `<label>${escapeHtml(dataColumnLabel(column.name))}${control}<small>${escapeHtml(hint)}${column.primary ? " · birincil anahtar" : ""}${column.generated ? " · otomatik üretilir" : ""}</small></label>`;
}

function collectDataEditorValues(insert) {
  const values = {};
  for (const element of document.querySelectorAll("[data-data-column]")) {
    if (element.disabled) continue;
    const raw = element.value;
    if (insert && raw === "" && element.dataset.default === "true") continue;
    if (raw === "" && element.dataset.nullable === "true") { values[element.dataset.dataColumn] = null; continue; }
    if (["json", "jsonb", "ARRAY"].includes(element.dataset.dataType)) {
      try { values[element.dataset.dataColumn] = raw === "" ? null : JSON.parse(raw); }
      catch { throw new Error(`${dataColumnLabel(element.dataset.dataColumn)} geçerli JSON olmalıdır.`); }
    } else if (element.dataset.dataType === "boolean") values[element.dataset.dataColumn] = raw === "true";
    else values[element.dataset.dataColumn] = raw;
  }
  return values;
}

async function openDataRecordEditor(table, record = null) {
  const insert = !record;
  const values = record?.values || {};
  const columns = table.columns.filter((column) => insert ? !column.generated : true);
  const optionEntries = await Promise.all(columns.filter((column) => column.reference).map(async (column) => {
    const query = new URLSearchParams({ table: table.name, column: column.name });
    if (values[column.name] !== null && values[column.name] !== undefined) query.set("current", String(values[column.name]));
    return [column.name, await api(`/api/admin-data/options?${query}`)];
  }));
  const optionMap = new Map(optionEntries);
  const mainColumns = columns.filter((column) => !isTechnicalDataColumn(column));
  const technicalColumns = columns.filter(isTechnicalDataColumn);
  const fields = mainColumns.map((column) => dataField(column, values[column.name], insert, optionMap.get(column.name) || [])).join("");
  const technicalFields = technicalColumns.map((column) => dataField(column, values[column.name], insert, optionMap.get(column.name) || [])).join("");
  openEditor(
    insert ? "Yeni oyun kaydı" : "Oyun kaydını düzenle",
    `${table.category} · ${table.label} (${table.name})`,
    `<div class="preview-warning"><strong>GM müdahalesi</strong><span>Devlet, yerleşke, karakter ve diğer bağlantılar adlarıyla seçilir. İşlem önce/sonra görüntüsüyle denetim geçmişine yazılır.</span></div><div class="form-grid data-control-form">${fields}</div>${technicalFields ? `<details class="data-technical"><summary>Teknik alanlar</summary><p>Discord ve sistem kimlikleri yalnızca zorunlu durumlarda değiştirilmelidir.</p><div class="form-grid data-control-form">${technicalFields}</div></details>` : ""}<label>Değişiklik gerekçesi<textarea id="data-change-reason" rows="2" minlength="3" maxlength="500" required placeholder="Bu değişikliğin oyun içi gerekçesi…"></textarea></label>${!insert && table.mutable ? '<button type="button" class="button danger" id="data-delete-record">Bu kaydı kalıcı olarak sil</button>' : ""}`,
    table.mutable ? async () => {
      const reason = document.getElementById("data-change-reason").value.trim();
      if (reason.length < 3) throw new Error("Değişiklik gerekçesi en az 3 karakter olmalıdır.");
      await api("/api/admin-data/mutate", { method: "POST", body: JSON.stringify({
        table: table.name,
        action: insert ? "INSERT" : "UPDATE",
        key: record?.key,
        values: collectDataEditorValues(insert),
        reason
      }) });
      closeEditor();
      toast(insert ? `${table.label} tablosuna yeni kayıt eklendi.` : `${table.label} kaydı güncellendi.`);
      await refreshKeepingScroll(dataControlPage);
    } : null
  );
  editorModal.querySelector(".modal").classList.add("wide");
  const deleteButton = document.getElementById("data-delete-record");
  if (deleteButton) deleteButton.addEventListener("click", async () => {
    const reason = document.getElementById("data-change-reason").value.trim();
    if (reason.length < 3) return toast("Silme gerekçesini önce yazın.", "error");
    if (window.prompt("Kalıcı silmeyi onaylamak için SIL yazın.") !== "SIL") return;
    deleteButton.disabled = true;
    try {
      await api("/api/admin-data/mutate", { method: "POST", body: JSON.stringify({ table: table.name, action: "DELETE", key: record.key, reason, confirmation: "SIL" }) });
      closeEditor();
      toast(`${table.label} kaydı silindi.`);
      await refreshKeepingScroll(dataControlPage);
    } catch (error) { toast(error.message, "error"); deleteButton.disabled = false; }
  });
}

function dataRecordTitle(table, row) {
  const values = row.displayValues || row.values;
  for (const key of ["name", "display_name", "title", "full_name"]) {
    if (values[key]) return dataValuePreview(values[key]);
  }
  const relationValues = table.columns
    .filter((column) => column.reference && !isTechnicalDataColumn(column))
    .map((column) => values[column.name])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(dataValuePreview)
    .filter((value) => value !== "Teknik kayıt");
  if (relationValues.length >= 2) return `${relationValues[0]} → ${relationValues[1]}`;
  if (relationValues.length === 1) return relationValues[0];
  const meaningful = table.columns.find((column) => !isTechnicalDataColumn(column) && !column.primary && values[column.name] !== null && values[column.name] !== undefined);
  return meaningful ? `${table.label} · ${dataValuePreview(values[meaningful.name])}` : `${table.label} kaydı`;
}

function dataRecordCard(table, row, index) {
  const values = row.displayValues || row.values;
  const status = values.status ?? values.state ?? values.phase;
  const details = table.columns
    .filter((column) => !isTechnicalDataColumn(column) && !column.primary && !["name", "display_name", "title", "full_name", "status", "state", "phase"].includes(column.name))
    .filter((column) => values[column.name] !== null && values[column.name] !== undefined && values[column.name] !== "")
    .slice(0, 6);
  return `<article class="data-record-card"><div class="data-record-head"><div><span class="data-record-kind">${escapeHtml(table.category)}</span><h3>${escapeHtml(dataRecordTitle(table, row))}</h3></div>${status ? `<span class="pill ${String(status) === "ACTIVE" ? "success" : "neutral"}">${escapeHtml(dataValuePreview(status))}</span>` : ""}</div><div class="data-record-details">${details.map((column) => `<div><span>${escapeHtml(dataColumnLabel(column.name))}</span><strong>${escapeHtml(dataValuePreview(values[column.name]))}</strong></div>`).join("") || '<p class="empty">Ek oyun alanı bulunmuyor.</p>'}</div><div class="data-record-actions"><span>${row.values.updated_at ? `Güncellendi: ${escapeHtml(dataValuePreview(row.values.updated_at))}` : row.values.created_at ? `Oluşturuldu: ${escapeHtml(dataValuePreview(row.values.created_at))}` : "Kimlikler arka planda yönetilir"}</span><button class="button compact" data-data-row="${index}">${table.mutable ? "Yönet" : "Görüntüle"}</button></div></article>`;
}

async function dataControlPage() {
  setActiveRoute("data-control"); loading();
  if (!state.dataCatalog) state.dataCatalog = await api("/api/admin-data/catalog");
  const catalog = state.dataCatalog;
  if (!state.dataTable || !catalog.some((table) => table.name === state.dataTable)) state.dataTable = catalog.find((table) => table.name === "countries")?.name || catalog[0]?.name;
  if (!state.dataTable) throw new Error("Yönetilebilir oyun veri tablosu bulunamadı.");
  const table = catalog.find((item) => item.name === state.dataTable);
  const query = new URLSearchParams({ table: table.name, search: state.dataSearch, offset: String(state.dataOffset), limit: "25" });
  const data = await api(`/api/admin-data/rows?${query}`);
  state.dataRows = data.rows;
  const categories = new Map();
  for (const item of catalog) {
    const items = categories.get(item.category) || [];
    items.push(item);
    categories.set(item.category, items);
  }
  const options = [...categories.entries()].map(([category, tables]) => `<optgroup label="${escapeHtml(category)}">${tables.map((item) => `<option value="${item.name}" ${item.name === table.name ? "selected" : ""}>${escapeHtml(item.label)}${item.mutable ? "" : " · salt okunur"}</option>`).join("")}</optgroup>`).join("");
  const rows = data.rows.map((row, index) => dataRecordCard(table, row, index)).join("");
  const end = Math.min(data.total, data.offset + data.rows.length);
  page.innerHTML = `<div class="page-head"><div><span class="pill danger">GM Kontrol Merkezi</span><h1 style="margin-top:10px">Oyun Mekanikleri</h1><p>Teknik kimliklerle uğraşmadan devletleri, yerleşkeleri, orduları ve mekanik kayıtlarını doğrudan yönet.</p></div><div class="actions"><span class="pill neutral">${number(catalog.length)} mekanik tablosu</span><button class="button" data-save-data-view>Görünümü kaydet</button>${table.mutable ? '<button class="button primary" data-data-new>＋ Yeni kayıt</button>' : ""}</div></div><section class="card data-control-warning"><strong>Adlarla ve seçimlerle tam kontrol</strong><p>Bağlantılı kayıtlar UUID yerine oyun içindeki adlarıyla gösterilir ve seçim kutusundan değiştirilir. Teknik alanlar düzenleme ekranında ayrı ve kapalı tutulur. Her işlem gerekçe, eski değer ve yeni değerle kaydedilir.</p></section><section class="card data-control-toolbar"><label>Yönetilecek mekanik<select id="data-table-select">${options}</select></label><form id="data-search-form"><label>Ad veya duruma göre ara<input id="data-search" value="${escapeHtml(state.dataSearch)}" placeholder="Örn. Roma, Atina, aktif, bekliyor…"></label><button class="button" type="submit">Ara</button></form></section><div class="section-title"><h2>${escapeHtml(table.label)}</h2><span>${escapeHtml(table.category)} · ${number(data.total)} kayıt · ${table.scoped ? "bu Discord sunucusu" : "oyun geneli"}</span></div><section class="data-record-grid">${rows || '<div class="card empty">Bu mekanikte henüz kayıt bulunmuyor.</div>'}</section><div class="data-pager"><button class="button" data-data-prev ${data.offset <= 0 ? "disabled" : ""}>← Önceki</button><span>${data.total ? `${number(data.offset + 1)}–${number(end)} / ${number(data.total)}` : "0 kayıt"}</span><button class="button" data-data-next ${end >= data.total ? "disabled" : ""}>Sonraki →</button></div>`;
  document.getElementById("data-table-select").addEventListener("change", (event) => { state.dataTable = event.target.value; state.dataOffset = 0; state.dataSearch = ""; dataControlPage().catch(showPageError); });
  document.getElementById("data-search-form").addEventListener("submit", (event) => { event.preventDefault(); state.dataSearch = document.getElementById("data-search").value.trim(); state.dataOffset = 0; dataControlPage().catch(showPageError); });
  document.querySelector("[data-data-new]")?.addEventListener("click", () => openDataRecordEditor(table).catch((error) => toast(error.message, "error")));
  document.querySelector("[data-save-data-view]").addEventListener("click", () => openSaveView("data-control", { table: table.name, search: state.dataSearch }, `${table.label}${state.dataSearch ? ` · ${state.dataSearch}` : ""}`));
  document.querySelectorAll("[data-data-row]").forEach((button) => button.addEventListener("click", () => openDataRecordEditor(table, state.dataRows[Number(button.dataset.dataRow)]).catch((error) => toast(error.message, "error"))));
  document.querySelector("[data-data-prev]")?.addEventListener("click", () => { state.dataOffset = Math.max(0, state.dataOffset - 25); refreshKeepingScroll(dataControlPage).catch(showPageError); });
  document.querySelector("[data-data-next]")?.addEventListener("click", () => { state.dataOffset += 25; refreshKeepingScroll(dataControlPage).catch(showPageError); });
}

async function gameHealthPage() {
  setActiveRoute("health"); loading();
  const [data, system] = await Promise.all([api("/api/game-health"), api("/api/system-status")]);
  const severityLabel = { CRITICAL: "Kritik", WARNING: "Uyarı", INFO: "Bilgi" };
  const repairable = data.issues.filter((issue) => issue.repairAction).length;
  const issueRows = data.issues.map((issue, index) => `<article class="health-issue ${issue.severity.toLowerCase()}"><div class="health-icon">${issue.severity === "CRITICAL" ? "!" : issue.severity === "WARNING" ? "△" : "i"}</div><div><div class="health-meta"><span>${escapeHtml(issue.category)}</span><span>•</span><span>${escapeHtml(severityLabel[issue.severity] || issue.severity)}</span>${issue.repairAction ? '<span class="health-repairable">• Güvenli onarım var</span>' : ""}</div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.detail)}</p></div><div class="health-actions"><span class="pill ${issue.severity === "CRITICAL" ? "danger" : issue.severity === "WARNING" ? "warning" : "neutral"}">${number(issue.count)} kayıt</span>${issue.repairAction ? `<button class="button compact primary" data-health-repair="${index}">Onar</button>` : ""}${issue.targetId ? `<button class="button compact" data-health-issue="${index}">Kayda git</button>` : `<button class="button compact" data-route-action="${issue.route}">İncele</button>`}</div></article>`).join("");
  const poolState = system.pool.waiting > 0 ? "Yoğun" : "Hazır";
  page.innerHTML = `<div class="page-head"><div><span class="pill ${data.summary.critical ? "danger" : data.summary.warning ? "warning" : ""}">${data.summary.total ? `${number(data.summary.total)} bulgu` : "Sistem sağlıklı"}</span><h1 style="margin-top:10px">Oyun Sağlığı ve Onarım</h1><p>Veri tutarsızlıklarını tara; sonucu açık ve deterministik olan sorunları gerekçeli, denetlenebilir onarımla düzelt.</p></div><button class="button" data-refresh-health>↻ Yeniden tara</button></div><section class="health-summary"><div class="card kpi health-critical"><span>Kritik</span><strong>${number(data.summary.critical)}</strong><small>Oyun akışını bozabilir</small></div><div class="card kpi health-warning"><span>Uyarı</span><strong>${number(data.summary.warning)}</strong><small>Yönetici incelemesi gerekir</small></div><div class="card kpi"><span>Onarılabilir</span><strong>${number(repairable)}</strong><small>Güvenli otomatik düzeltme</small></div><div class="card kpi"><span>Son tarama</span><strong class="health-time">${date(data.checkedAt)}</strong><small>Tur ${number(data.guild.current_turn)} · ${escapeHtml(turnPhaseLabels[data.guild.turn_phase] || data.guild.turn_phase)}</small></div></section><section class="card system-status"><div class="card-head"><div><h2>Panel çalışma durumu</h2><p>Canlı hizmet ölçümleri yalnız yöneticinin teşhis yapabilmesi için gösterilir.</p></div><span class="pill ${system.pool.waiting > 0 ? "warning" : ""}">${poolState}</span></div><div class="system-status-grid"><div><span>Veritabanı yanıtı</span><strong>${number(system.databaseLatencyMs)} ms</strong><small>Sorgu gidiş-dönüş süresi</small></div><div><span>Bağlantı havuzu</span><strong>${number(system.pool.idle)} / ${number(system.pool.total)}</strong><small>Boş / toplam · bekleyen ${number(system.pool.waiting)}</small></div><div><span>Panel belleği</span><strong>${number(system.memoryMb)} MB</strong><small>Çalışan süreç kullanımı</small></div><div><span>Çalışma süresi</span><strong>${number(Math.floor(system.uptimeSeconds / 3600))} sa</strong><small>Kesintisiz hizmet süresi</small></div><div><span>İşlem hareketi</span><strong>${number(system.processingOperations)}</strong><small>Devam eden · son saatte ${number(system.recentAudits)} kayıt</small></div></div></section><section class="card health-panel"><div class="card-head"><div><h2>Denetim bulguları</h2><p>Veri kaybı riski taşıyan bulgular yalnız ilgili kayıt ekranına yönlendirir; güvenli olanlarda Onar düğmesi görünür.</p></div></div><div class="health-list">${issueRows || '<div class="health-clean"><span>✓</span><div><h3>Tutarsızlık bulunmadı</h3><p>Kontrol edilen temel oyun kayıtları birbiriyle uyumlu.</p></div></div>'}</div></section>`;
  document.querySelector("[data-refresh-health]").addEventListener("click", () => refreshKeepingScroll(gameHealthPage).catch(showPageError));
  document.querySelectorAll("[data-health-repair]").forEach((button) => button.addEventListener("click", () => {
    const issue = data.issues[Number(button.dataset.healthRepair)];
    openEditor("Oyun sağlığı bulgusunu onar", issue.targetLabel || issue.title, `<div class="preview-warning"><strong>${escapeHtml(issue.title)}</strong><span>${escapeHtml(issue.detail)}</span></div><label>Onarım gerekçesi<textarea id="health-repair-reason" minlength="3" maxlength="500" rows="3" required placeholder="Bu onarım neden uygulanıyor?"></textarea></label><label>Güvenlik onayı<input id="health-repair-confirmation" autocomplete="off" required placeholder="ONAR yazın"></label>`, async () => {
      await api("/api/game-health/repair", { method: "POST", body: JSON.stringify({ action: issue.repairAction, targetId: issue.targetId, reason: document.getElementById("health-repair-reason").value, confirmation: document.getElementById("health-repair-confirmation").value }) });
      closeEditor(); toast(`${issue.title} güvenle onarıldı.`); await refreshKeepingScroll(gameHealthPage);
    });
    setEditorSaveLabel("Onarımı uygula", true);
  }));
  document.querySelectorAll("[data-health-issue]").forEach((button) => button.addEventListener("click", () => {
    const issue = data.issues[Number(button.dataset.healthIssue)];
    openWorkspaceRecord({ type: issue.targetType, id: issue.targetId, label: issue.targetLabel || issue.title, detail: issue.detail }).catch(showPageError);
  }));
  bindPageActions();
}

async function openAuditUndo(auditId) {
  const preview = await api(`/api/admin-data/undo-preview/${auditId}`);
  const changes = preview.changes.map((change) => `<div class="undo-diff-row"><div><span>${escapeHtml(dataColumnLabel(change.field))}</span><strong>${escapeHtml(dataValuePreview(change.after))}</strong></div><span class="undo-arrow">→</span><div><span>Geri yüklenecek</span><strong>${escapeHtml(dataValuePreview(change.before))}</strong></div></div>`).join("");
  const content = `<div class="preview-warning ${preview.reversible ? "" : "danger-zone"}"><strong>${preview.reversible ? "Güvenli geri alma hazır" : "Bu işlem otomatik geri alınamaz"}</strong><span>${escapeHtml(preview.reason)}</span></div><div class="undo-summary"><div><span>Veri alanı</span><strong>${escapeHtml(preview.tableLabel)}</strong></div><div><span>İşlem zamanı</span><strong>${date(preview.createdAt)}</strong></div><div><span>Değişen alan</span><strong>${number(preview.changes.length)}</strong></div></div>${changes ? `<section class="undo-diff"><div class="section-title"><h3>Önce / geri yüklenecek</h3><span>Veritabanındaki güncel değer soldadır</span></div>${changes}</section>` : '<div class="empty">Karşılaştırılabilir alan değişikliği bulunamadı.</div>'}${preview.reversible ? '<label>Geri alma gerekçesi<textarea id="undo-reason" rows="3" minlength="3" maxlength="500" required placeholder="Bu geri alma neden gerekli?"></textarea></label><label>Onay<input id="undo-confirmation" autocomplete="off" required placeholder="GERI AL yaz"></label>' : ""}`;
  openEditor("Değişikliği geri alma", `${preview.tableLabel} · çakışma korumalı işlem`, content, preview.reversible ? async () => {
    const reason = document.getElementById("undo-reason").value.trim();
    const confirmation = document.getElementById("undo-confirmation").value.trim();
    if (reason.length < 3) throw new Error("Geri alma gerekçesi en az 3 karakter olmalıdır.");
    if (confirmation !== "GERI AL") throw new Error("Onay alanına GERI AL yazılmalıdır.");
    await api("/api/admin-data/undo", { method: "POST", body: JSON.stringify({ auditId, reason, confirmation }) });
    closeEditor();
    toast("Değişiklik önceki değerlerine güvenle döndürüldü.");
    await refreshKeepingScroll(auditPage);
  } : null);
  if (preview.reversible) document.getElementById("editor-save").textContent = "Onayla ve geri al";
}

function openAuditDetail(row) {
  const source = row.action?.startsWith("admin.panel.") || row.action?.startsWith("ADMIN_DATA_") ? "GM Operasyon Masası" : "Discord komutu / oyun akışı";
  openEditor("İşlem ayrıntısı", row.actionLabel, `<div class="audit-detail-grid"><div><span>Hedef kayıt</span><strong>${escapeHtml(row.entityLabel)}</strong></div><div><span>Kaynak</span><strong>${escapeHtml(source)}</strong></div><div><span>İşlemi yapan</span><strong>${escapeHtml(row.actorLabel)}</strong></div><div><span>Zaman</span><strong>${date(row.created_at)}</strong></div></div><section class="audit-detail-summary"><h3>Kaydedilen değişiklik</h3><p>${escapeHtml(row.detailSummary || "Bu işlem için ek açıklama kaydedilmemiş.")}</p></section><details class="data-technical"><summary>Teknik denetim bilgisi</summary><div class="audit-technical-id"><span>İşlem kodu</span><code>${escapeHtml(row.id)}</code></div><div class="audit-technical-id"><span>Eylem anahtarı</span><code>${escapeHtml(row.action || "—")}</code></div></details>${row.canUndo ? '<div class="preview-warning"><strong>Kontrollü geri alma adayı</strong><span>İşlem geçmişindeki “Geri almayı denetle” düğmesi, kaydın daha sonra değişip değişmediğini kontrol eder.</span></div>' : ""}`, null);
}

async function auditPage() {
  setActiveRoute("audit"); loading();
  const query = new URLSearchParams({
    search: state.auditSearch, source: state.auditSource, kind: state.auditKind,
    from: state.auditFrom, to: state.auditTo, offset: String(state.auditOffset), limit: "50"
  });
  const data = await api(`/api/audit?${query}`);
  state.auditRows = data.rows;
  const end = Math.min(data.total, data.offset + data.rows.length);
  page.innerHTML = `<div class="page-head"><div><h1>İşlem Geçmişi</h1><p>Discord ve panel üzerinden yapılan yönetici işlemlerini filtrele, incele ve uygun değişiklikleri güvenle geri al.</p></div><div class="actions"><span class="pill neutral">${number(data.total)} kayıt</span><button class="button" data-save-audit-view>Görünümü kaydet</button><button class="button" data-refresh-audit>↻ Yenile</button></div></div><section class="card audit-safety-note"><strong>Çakışma korumalı geri alma</strong><p>Tam Yetki ekranındaki güncellemeler, yalnız kayıt daha sonra değiştirilmediyse geri alınabilir. Ekleme ve silme işlemleri bağlantılı oyun verilerini korumak için otomatik geri alınmaz.</p></section><form id="audit-filter-form" class="card audit-toolbar"><label>İşlem veya kayıt ara<input id="audit-search" value="${escapeHtml(state.auditSearch)}" maxlength="120" placeholder="Devlet, işlem, gerekçe…"></label><label>Kaynak<select id="audit-source"><option value="ALL" ${selected("ALL", state.auditSource)}>Tüm kaynaklar</option><option value="PANEL" ${selected("PANEL", state.auditSource)}>GM paneli</option><option value="DISCORD" ${selected("DISCORD", state.auditSource)}>Discord ve oyun</option></select></label><label>İşlem türü<select id="audit-kind"><option value="ALL" ${selected("ALL", state.auditKind)}>Tüm işlemler</option><option value="CREATE" ${selected("CREATE", state.auditKind)}>Oluşturma / atama</option><option value="UPDATE" ${selected("UPDATE", state.auditKind)}>Güncelleme</option><option value="DELETE" ${selected("DELETE", state.auditKind)}>Silme / sonlandırma</option><option value="UNDO" ${selected("UNDO", state.auditKind)}>Geri alma</option></select></label><label>Başlangıç<input id="audit-from" type="date" value="${escapeHtml(state.auditFrom)}"></label><label>Bitiş<input id="audit-to" type="date" value="${escapeHtml(state.auditTo)}"></label><div class="audit-filter-actions"><button class="button primary" type="submit">Filtrele</button><button class="button" type="button" data-audit-clear>Temizle</button></div></form><section class="card audit-list">${auditRows(data.rows, data.rows.length, true)}</section><div class="data-pager"><button class="button" data-audit-prev ${data.offset <= 0 ? "disabled" : ""}>← Önceki</button><span>${data.total ? `${number(data.offset + 1)}–${number(end)} / ${number(data.total)}` : "0 kayıt"}</span><button class="button" data-audit-next ${end >= data.total ? "disabled" : ""}>Sonraki →</button></div>`;
  document.querySelector("[data-refresh-audit]").addEventListener("click", () => refreshKeepingScroll(auditPage));
  document.querySelector("[data-save-audit-view]").addEventListener("click", () => openSaveView("audit", { search: state.auditSearch, source: state.auditSource, kind: state.auditKind, from: state.auditFrom, to: state.auditTo }, `İşlem geçmişi${state.auditSearch ? ` · ${state.auditSearch}` : ""}`));
  document.getElementById("audit-filter-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.auditSearch = document.getElementById("audit-search").value.trim();
    state.auditSource = document.getElementById("audit-source").value;
    state.auditKind = document.getElementById("audit-kind").value;
    state.auditFrom = document.getElementById("audit-from").value;
    state.auditTo = document.getElementById("audit-to").value;
    state.auditOffset = 0;
    auditPage().catch(showPageError);
  });
  document.querySelector("[data-audit-clear]").addEventListener("click", () => {
    Object.assign(state, { auditSearch: "", auditSource: "ALL", auditKind: "ALL", auditFrom: "", auditTo: "", auditOffset: 0 });
    auditPage().catch(showPageError);
  });
  document.querySelector("[data-audit-prev]")?.addEventListener("click", () => { state.auditOffset = Math.max(0, state.auditOffset - 50); refreshKeepingScroll(auditPage).catch(showPageError); });
  document.querySelector("[data-audit-next]")?.addEventListener("click", () => { state.auditOffset += 50; refreshKeepingScroll(auditPage).catch(showPageError); });
  document.querySelectorAll("[data-audit-detail]").forEach((button) => button.addEventListener("click", () => openAuditDetail(state.auditRows[Number(button.dataset.auditDetail)])));
  document.querySelectorAll("[data-audit-undo]").forEach((button) => button.addEventListener("click", () => openAuditUndo(button.dataset.auditUndo).catch((error) => toast(error.message, "error"))));
}

function bindPageActions() {
  document.querySelectorAll("[data-open-army]").forEach((button) => button.addEventListener("click", () => openArmyModal(button.dataset.defaultCountry)));
  document.querySelectorAll("[data-country]").forEach((button) => button.addEventListener("click", () => countryDetail(button.dataset.country)));
  document.querySelectorAll("[data-route-action]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.routeAction)));
  document.querySelectorAll("[data-workspace-source]").forEach((button) => button.addEventListener("click", () => {
    const row = readStoredList(button.dataset.workspaceSource)[Number(button.dataset.workspaceIndex)];
    openWorkspaceRecord(row).catch(showPageError);
  }));
}

async function navigate(route) {
  const navigationId = ++state.navigationId;
  state.navigationController?.abort();
  const controller = new AbortController();
  state.navigationController = controller;
  try {
    if (route === "overview") return await overview();
    if (route === "workspace") return await workspacePage();
    if (route === "countries") return await countries();
    if (route === "settlements") return await settlementsPage();
    if (route === "armies") return await forcesPage();
    if (route === "characters") return await charactersPage();
    if (route === "dynasties") return await dynastiesPage();
    if (route === "noble-traits") return await nobleTraitsPage();
    if (route === "roman-politics") return await romanPoliticsPage();
    if (route === "steppe-politics") return await steppePoliticsPage();
    if (route === "diplomacy-control") return await diplomacyControlPage(controller.signal);
    if (route === "assignments") return await assignmentsPage();
    if (route === "espionage-publications") return await espionagePublicationsPage(controller.signal);
    if (route === "gm-operations") return await guidedOperationsPage();
    if (route === "bulk-operations") return await bulkOperationsPage();
    if (route === "economy-control") return await economyControlPage(controller.signal);
    if (route === "great-projects") return await greatProjectsPage(controller.signal);
    if (route === "npc-purchases") return await npcPurchasesPage();
    if (route === "battles") return await battlesPage();
    if (route === "battle-simulator") return await battleSimulatorPage(controller.signal);
    if (route === "rebellions") return await rebellionsPage();
    if (route === "reports") return await reportsPage(controller.signal);
    if (route === "health") return await gameHealthPage();
    if (route === "data-control") return await dataControlPage();
    if (route === "audit") return await auditPage();
    return await overview();
  } catch (error) {
    if (controller.signal.aborted || navigationId !== state.navigationId) return;
    showPageError(error);
  } finally {
    if (navigationId === state.navigationId) state.navigationController = null;
  }
}

function addUnitRow(unitType = "light_infantry", quantity = 100) {
  const row = document.createElement("div");
  row.className = "unit-row";
  row.innerHTML = `<label><span class="sr-only">Birlik türü</span><select class="unit-type">${state.catalog.map((unit) => `<option value="${unit.value}" ${unit.value === unitType ? "selected" : ""}>${escapeHtml(unit.label)}</option>`).join("")}</select></label><label><span class="sr-only">Miktar</span><input class="unit-quantity" type="number" min="1" step="1" value="${quantity}" required></label><button type="button" aria-label="Birliği kaldır">×</button>`;
  row.querySelector("button").addEventListener("click", () => { if (document.querySelectorAll(".unit-row").length > 1) row.remove(); });
  document.getElementById("unit-rows").append(row);
}

async function loadArmyCountries(defaultCountry) {
  if (!state.countries.length) state.countries = await api("/api/countries");
  const active = state.countries.filter((country) => country.status === "ACTIVE");
  const select = document.getElementById("army-country");
  select.innerHTML = active.map((country) => `<option value="${country.id}" ${country.id === defaultCountry ? "selected" : ""}>${escapeHtml(country.name)}</option>`).join("");
  await loadArmySettlements();
}

async function loadArmySettlements() {
  const countryId = document.getElementById("army-country").value;
  const data = await api(`/api/countries/${countryId}`);
  const select = document.getElementById("army-settlement");
  select.innerHTML = data.settlements.map((settlement) => `<option value="${settlement.id}">${escapeHtml(settlement.name)}</option>`).join("");
}

async function openArmyModal(defaultCountry) {
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  state.previewToken = null;
  document.getElementById("army-fields").hidden = false;
  document.getElementById("army-preview").hidden = true;
  document.getElementById("army-error").hidden = true;
  document.getElementById("unit-rows").innerHTML = "";
  try {
    if (!state.catalog.length) state.catalog = await api("/api/catalog/units");
    await loadArmyCountries(defaultCountry);
    addUnitRow();
  } catch (error) { toast(error.message, "error"); closeArmyModal(); }
}

function closeArmyModal() { modal.hidden = true; document.body.style.overflow = ""; }

async function previewArmy(event) {
  event.preventDefault();
  const errorBox = document.getElementById("army-error");
  errorBox.hidden = true;
  const units = [...document.querySelectorAll(".unit-row")].map((row) => ({ unitType: row.querySelector(".unit-type").value, quantity: Number(row.querySelector(".unit-quantity").value) }));
  try {
    const preview = await api("/api/operations/army/preview", { method: "POST", body: JSON.stringify({ countryId: document.getElementById("army-country").value, settlementId: document.getElementById("army-settlement").value, name: document.getElementById("army-name").value, mode: document.getElementById("army-mode").value, units }) });
    state.previewToken = preview.previewToken;
    document.getElementById("preview-content").innerHTML = `<div class="detail-grid" style="margin-top:14px"><div class="detail-cell"><span>Devlet</span><strong>${escapeHtml(preview.country.name)}</strong></div><div class="detail-cell"><span>Ordu</span><strong>${escapeHtml(preview.name)}</strong></div><div class="detail-cell"><span>Bakım şehri</span><strong>${escapeHtml(preview.settlement.name)}</strong></div><div class="detail-cell"><span>Toplam</span><strong>${number(preview.total)} asker</strong></div></div><div class="card preview-table"><div class="card-head"><div><h3>Birlik dağılımı</h3><p>${preview.mode === "CREATE_NEW" ? "Yeni asker ve bakım kaydı oluşturulacak" : "Mevcut stoktan tahsis edilecek"}</p></div></div>${preview.units.map((unit) => `<div class="data-row"><div><strong>${escapeHtml(unit.label)}</strong><small>Stok ${number(unit.stock)} · Ayrılmış ${number(unit.allocated)} · Müsait ${number(unit.available)}</small></div><span>${number(unit.quantity)}</span><span></span><span class="pill neutral">${preview.mode === "CREATE_NEW" ? "Yeni" : "Tahsis"}</span></div>`).join("")}</div>`;
    document.getElementById("army-fields").hidden = true;
    document.getElementById("army-preview").hidden = false;
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
}

async function confirmArmy() {
  const button = document.getElementById("confirm-army");
  const errorBox = document.getElementById("preview-error");
  errorBox.hidden = true; button.disabled = true; button.textContent = "Uygulanıyor…";
  try {
    const result = await api("/api/operations/army/create", { method: "POST", body: JSON.stringify({ previewToken: state.previewToken }) });
    closeArmyModal();
    toast(`${result.countryName}: ${result.armyName} oluşturuldu; ${number(result.total)} asker ${result.settlementName} bakımına bağlandı.`);
    await overview();
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
  finally { button.disabled = false; button.textContent = "Onayla ve oluştur"; }
}

const paletteCommands = [
  { route: "overview", label: "Genel Bakış", detail: "Oyun kontrol merkezini aç" },
  { route: "workspace", label: "Çalışma Alanım", detail: "Favoriler, son kayıtlar ve kaydedilmiş görünümler" },
  { route: "countries", label: "Devletler", detail: "Devlet kayıtlarını yönet" },
  { route: "settlements", label: "Yerleşkeler", detail: "Nüfus, ekonomi, kültür ve dini incele" },
  { route: "armies", label: "Ordular & Filolar", detail: "Kuvvetleri ve komutanları yönet" },
  { route: "characters", label: "Karakterler", detail: "Karakter ve uzmanlık kayıtlarını aç" },
  { route: "noble-traits", label: "Soylu Traitleri", detail: "Hanedan traitlerini görüntüle, değiştir, kaldır veya yeniden belirle" },
  { route: "gm-operations", label: "Rehberli İşlemler", detail: "Riskli GM müdahalelerini önizleme ve onayla uygula" },
  { route: "bulk-operations", label: "Toplu İşlemler", detail: "Birden fazla oyun kaydını tek güvenli işlemde güncelle" },
  { route: "diplomacy-control", label: "Diplomasi & Ticaret", detail: "İttifak, vassallık, savaş, pakt ve ticaret bağlantılarını yönet" },
  { route: "economy-control", label: "Ekonomi & Üretim", detail: "Hazine, gelir ve üretim kuyruklarını kontrol et" },
  { route: "npc-purchases", label: "NPC Alımları", detail: "Oyuncusuz devletlerin bina, asker ve gemi alımlarını yönet" },
  { route: "great-projects", label: "Büyük Projeler", detail: "Yerleşkeye bağlı projeleri izle ve yönet" },
  { route: "reports", label: "Raporlar & Karşılaştırma", detail: "Devletleri karşılaştır ve mali eğilimleri incele" },
  { route: "battles", label: "Savaşlar", detail: "Aktif savaş ve kuşatmaları aç" },
  { route: "rebellions", label: "İsyanlar", detail: "İsyan durumlarını incele" },
  { route: "health", label: "Oyun Sağlığı", detail: "Veri tutarlılığı taramasını çalıştır" },
  { route: "data-control", label: "Tam Yetki", detail: "Tüm oyun mekaniklerine eriş" },
  { route: "audit", label: "İşlem Geçmişi", detail: "Yönetici değişikliklerini incele" }
];
const searchInput = document.getElementById("global-search");
const searchResults = document.getElementById("search-results");

function bindPaletteResults() {
  searchResults.querySelectorAll("[data-command-route]").forEach((button) => button.addEventListener("click", () => {
    searchResults.hidden = true; searchInput.value = ""; navigate(button.dataset.commandRoute);
  }));
  searchResults.querySelectorAll("[data-palette-index]").forEach((button) => button.addEventListener("click", () => {
    const row = state.paletteRows[Number(button.dataset.paletteIndex)];
    searchResults.hidden = true; searchInput.value = ""; openWorkspaceRecord(row).catch(showPageError);
  }));
  searchResults.querySelectorAll("[data-palette-source]").forEach((button) => button.addEventListener("click", () => {
    const row = readStoredList(button.dataset.paletteSource)[Number(button.dataset.paletteSourceIndex)];
    searchResults.hidden = true; searchInput.value = ""; openWorkspaceRecord(row).catch(showPageError);
  }));
  searchResults.querySelectorAll("[data-palette-favorite]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const row = state.paletteRows[Number(button.dataset.paletteFavorite)];
    const added = toggleFavorite(row);
    button.textContent = added ? "★" : "☆";
    button.title = added ? "Favorilerden çıkar" : "Favorilere ekle";
  }));
}

function paletteStoredGroup(title, source) {
  const items = readStoredList(source).slice(0, 5);
  if (!items.length) return "";
  return `<div class="palette-heading">${title}</div>${items.map((item, index) => `<button class="search-result" data-palette-source="${source}" data-palette-source-index="${index}"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail || searchTypeLabels[item.type] || item.type)}</small></span><em>${escapeHtml(searchTypeLabels[item.type] || item.type)}</em></button>`).join("")}`;
}

function renderPaletteHome() {
  searchResults.innerHTML = `${paletteStoredGroup("Favoriler", "favorites")}${paletteStoredGroup("Son açılanlar", "recent")}<div class="palette-heading">Hızlı geçiş</div>${paletteCommands.slice(0, 6).map((command) => `<button class="search-result" data-command-route="${command.route}"><span><strong>${escapeHtml(command.label)}</strong><small>${escapeHtml(command.detail)}</small></span><em>Sayfa</em></button>`).join("")}`;
  searchResults.hidden = false;
  bindPaletteResults();
}

function renderPaletteSearch(rows, query) {
  const normalizedQuery = query.toLocaleLowerCase("tr-TR");
  const commands = paletteCommands.filter((command) => `${command.label} ${command.detail}`.toLocaleLowerCase("tr-TR").includes(normalizedQuery));
  state.paletteRows = rows;
  const commandMarkup = commands.map((command) => `<button class="search-result" data-command-route="${command.route}"><span><strong>${escapeHtml(command.label)}</strong><small>${escapeHtml(command.detail)}</small></span><em>Komut</em></button>`).join("");
  const rowMarkup = rows.map((row, index) => `<div class="search-result-row"><button class="search-result" data-palette-index="${index}"><span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span><em>${escapeHtml(searchTypeLabels[row.type] || row.type)}</em></button><button class="favorite-button" data-palette-favorite="${index}" title="${isFavorite(row) ? "Favorilerden çıkar" : "Favorilere ekle"}">${isFavorite(row) ? "★" : "☆"}</button></div>`).join("");
  searchResults.innerHTML = commandMarkup || rowMarkup ? `${commands.length ? '<div class="palette-heading">Komutlar</div>' : ""}${commandMarkup}${rows.length ? '<div class="palette-heading">Oyun kayıtları</div>' : ""}${rowMarkup}` : '<div class="empty">Sonuç bulunamadı.</div>';
  searchResults.hidden = false;
  bindPaletteResults();
}

let searchTimer;
searchInput.addEventListener("focus", () => { if (!searchInput.value.trim()) renderPaletteHome(); });
searchInput.addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const query = event.target.value.trim();
  if (!query) return renderPaletteHome();
  if (query.length < 2) return renderPaletteSearch([], query);
  searchTimer = setTimeout(async () => {
    try { renderPaletteSearch(await api(`/api/search?q=${encodeURIComponent(query)}`), query); }
    catch (error) { toast(error.message, "error"); }
  }, 220);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("tr-TR") === "k") {
    event.preventDefault(); searchInput.focus(); searchInput.select(); renderPaletteHome();
  } else if (event.key === "Escape" && !searchResults.hidden) {
    searchResults.hidden = true; searchInput.blur();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-wrap")) searchResults.hidden = true;
});

document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.route)));
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeArmyModal));
document.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", closeEditor));
document.getElementById("editor-form").addEventListener("submit", submitEditor);
document.getElementById("add-unit").addEventListener("click", () => addUnitRow());
document.getElementById("army-country").addEventListener("change", () => loadArmySettlements().catch((error) => toast(error.message, "error")));
document.getElementById("army-form").addEventListener("submit", previewArmy);
document.getElementById("back-to-army").addEventListener("click", () => { document.getElementById("army-preview").hidden = true; document.getElementById("army-fields").hidden = false; });
document.getElementById("confirm-army").addEventListener("click", confirmArmy);
document.getElementById("logout").addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }); location.reload(); });

(async function initialize() {
  try {
    const session = await api("/api/session");
    state.session = session.user; state.csrf = session.csrf;
    document.getElementById("user-name").textContent = session.user.username;
    const avatar = document.getElementById("user-avatar");
    if (session.user.avatar) avatar.innerHTML = `<img alt="" src="https://cdn.discordapp.com/avatars/${session.user.id}/${session.user.avatar}.png?size=64">`;
    else avatar.textContent = session.user.username.slice(0, 2).toUpperCase();
    app.hidden = false;
    await overview();
  } catch (error) {
    if (error.status === 401) login.hidden = false;
    else { login.hidden = false; toast(error.message, "error"); }
  }
})();
