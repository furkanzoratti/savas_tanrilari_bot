const state = { session: null, csrf: "", countries: [], catalog: [], characterCatalog: null, religionCatalog: null, previewToken: null, selectedCountry: null, editor: null };
const page = document.getElementById("page");
const app = document.getElementById("app");
const login = document.getElementById("login");
const modal = document.getElementById("army-modal");
const editorModal = document.getElementById("editor-modal");

const number = (value) => Number(value || 0).toLocaleString("tr-TR");
const money = (value) => `${number(value)} Altın`;
const date = (value) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
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
  KIDNAP: "Kaçırma", ASSASSINATE: "Suikast", SUPPLY_COLLAPSE: "İkmal çökertme", DESERTION: "Firar kışkırtma",
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
  MOVE_ARMY: "Orduyu hareket ettir", MOVE_FLEET: "Filoyu hareket ettir", DEFEND: "Savun", REINFORCE: "Takviye et",
  BESIEGE: "Kuşatma başlat", BLOCKADE: "Abluka kur", RAID: "Yağma yap", DISEMBARK: "Çıkarma yap",
  ASSIGN_CHARACTER: "Karakter görevlendir", PROPOSE_TRADE: "Ticaret öner", PROPOSE_ALLIANCE: "İttifak öner",
  PROPOSE_PACT: "Pakt öner", PROPOSE_PEACE: "Barış öner", DECLARE_WAR: "Savaş ilanı öner", NO_ACTION: "Hamle yapma"
};
const aiBattlePostureLabels = { AGGRESSIVE: "Saldırgan", BALANCED: "Dengeli", CAUTIOUS: "Temkinli", WITHDRAW: "Geri çekil" };
const aiNavalOrderLabels = { BALANCED: "Dengeli", RAM: "Mahmuz hücumu", DEFENSIVE: "Savunma düzeni", FLANK: "Kanat manevrası", RETREAT: "Geri çekil", CONTROLLED_RETREAT: "Kontrollü geri çekil" };
const siegePhaseLabels = { BOMBARDMENT: "Bombardıman", ASSAULT: "Hücum" };
const roleLabel = (row) => row.is_admiral ? "Amiral" : (roleLabels[row.role] || row.role);
const characterStatusLabel = (value) => characterStatusLabels[value] || value;
const developmentLabel = (value) => {
  if (!value) return "—";
  const catalog = state.characterCatalog;
  const all = [...(catalog?.specializations || []), ...(catalog?.commanderDoctrines || []), ...(catalog?.admiralSpecializations || []), ...(catalog?.admiralDoctrines || [])];
  return all.find((item) => item.value === value)?.label || String(value).replaceAll("_", " ");
};

async function api(path, options = {}) {
  const headers = { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) };
  if (options.method && options.method !== "GET") headers["x-csrf-token"] = state.csrf;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "İşlem başarısız.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function toast(message, kind = "success") {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.className = `toast ${kind}`;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 4500);
}

function loading() { page.innerHTML = '<div class="skeleton"></div>'; }
function setActiveRoute(route) { document.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === route)); }

function auditRows(rows, limit = rows.length) {
  if (!rows?.length) return '<div class="empty">Henüz işlem kaydı yok.</div>';
  return rows.slice(0, limit).map((row) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(row.actionLabel)}</strong><span>${escapeHtml(row.entityLabel)} · ${date(row.created_at)} · ${escapeHtml(row.actorLabel)}</span>${row.detailSummary ? `<small>${escapeHtml(row.detailSummary)}</small>` : ""}</div></div>`).join("");
}

async function overview() {
  setActiveRoute("overview"); loading();
  const data = await api("/api/overview");
  document.getElementById("turn-badge").textContent = `Tur ${data.guild.current_turn} · ${turnPhaseLabels[data.guild.turn_phase] || data.guild.turn_phase}`;
  page.innerHTML = `<div class="page-head"><div><h1>Genel Bakış</h1><p>Canlı oyun durumu ve sık kullanılan yönetici işlemleri</p></div><div class="actions"><button class="button" data-open-army>＋ Yeni ordu</button><button class="button primary" data-route-action="audit">İşlem geçmişi</button></div></div>
    <section class="kpi-grid"><div class="card kpi"><span>Aktif devlet</span><strong>${number(data.counts.countries)}</strong><small class="muted">${number(data.counts.settlements)} yerleşke</small></div><div class="card kpi"><span>Aktif savaş</span><strong>${number(data.counts.battles)}</strong><small class="muted">Devam eden tüm cepheler</small></div><div class="card kpi"><span>Ordu ve filo</span><strong>${number(data.counts.armies + data.counts.fleets)}</strong><small class="muted">${number(data.counts.armies)} ordu · ${number(data.counts.fleets)} filo</small></div><div class="card kpi"><span>Son 24 saat</span><strong>${number(data.counts.reviews)}</strong><small class="muted">Denetim kaydı</small></div></section>
    <section class="content-grid"><div class="card"><div class="card-head"><div><h2>Devlet durumu</h2><p>Askerî hareketliliğe göre öne çıkan kayıtlar</p></div><button class="button" data-route-action="countries">Tümünü gör</button></div><div class="data-list">${data.countries.map((country) => `<div class="data-row"><div><strong>${escapeHtml(country.name)}</strong><small>${number(country.settlement_count)} yerleşke · ${number(country.army_count)} ordu</small></div><span>${number(country.personnel)} asker</span><span>${money(country.treasury)}</span><button class="button" data-country="${country.id}">Aç</button></div>`).join("")}</div></div>
    <aside class="card"><div class="card-head"><div><h3>Hızlı işlemler</h3><p>Sık kullanılan GM araçları</p></div></div><div class="quick-actions"><button class="button" data-open-army>⚔ Yeni ordu oluştur</button><button class="button" data-route-action="countries">♜ Devlet ve şehirleri aç</button><button class="button" data-route-action="audit">↶ Son değişiklikleri incele</button></div><hr><div class="card-head"><div><h3>Son kayıtlar</h3></div></div>${auditRows(data.audit, 5)}</aside></section>`;
  bindPageActions();
}

async function countries() {
  setActiveRoute("countries"); loading();
  state.countries = await api("/api/countries");
  page.innerHTML = `<div class="page-head"><div><h1>Devletler</h1><p>Aktif ve yok edilmiş bütün devlet kayıtları</p></div><button class="button primary" data-open-army>＋ Yeni ordu</button></div><section class="card table-wrap"><table><thead><tr><th>Devlet</th><th>Durum</th><th>Yerleşke</th><th>Ordu</th><th>Filo</th><th>Hazine</th><th></th></tr></thead><tbody>${state.countries.map((country) => `<tr data-country-id="${country.id}"><td><strong>${escapeHtml(country.name)}</strong></td><td><span class="pill ${country.status === "ACTIVE" ? "" : "neutral"}">${escapeHtml(countryStatusLabels[country.status] || country.status)}</span></td><td>${number(country.settlement_count)}</td><td>${number(country.army_count)}</td><td>${number(country.fleet_count)}</td><td>${money(country.treasury)}</td><td>${country.status === "ACTIVE" ? `<button class="button compact" data-edit-country="${country.id}">Düzenle</button>` : ""}</td></tr>`).join("")}</tbody></table></section>`;
  bindPageActions();
  document.querySelectorAll("tr[data-country-id]").forEach((row) => row.addEventListener("click", () => {
    countryDetail(row.dataset.countryId).catch(showPageError);
  }));
  document.querySelectorAll("[data-edit-country]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openCountryEditor(state.countries.find((item) => item.id === button.dataset.editCountry));
  }));
}

async function countryDetail(id) {
  loading();
  const [data, catalog] = await Promise.all([api(`/api/countries/${id}`), state.characterCatalog ? Promise.resolve(state.characterCatalog) : api("/api/catalog/characters")]);
  state.characterCatalog = catalog;
  state.selectedCountry = data;
  const totalPopulation = data.settlements.reduce((sum, item) => sum + Number(item.population) + Number(item.slave_population), 0);
  const totalArmy = data.armies.reduce((sum, item) => sum + Number(item.total), 0);
  page.innerHTML = `<div class="page-head"><div><span class="pill">${escapeHtml(countryStatusLabels[data.country.status] || data.country.status)}</span><h1 style="margin-top:10px">${escapeHtml(data.country.name)}</h1><p>${number(data.settlements.length)} yerleşke · ${number(data.armies.length)} ordu · ${number(data.fleets.length)} filo</p></div><div class="actions"><button class="button" data-back-countries>← Devletler</button><button class="button primary" data-open-army data-default-country="${data.country.id}">＋ Ordu oluştur</button></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Hazine</span><strong>${money(data.country.treasury)}</strong></div><div class="detail-cell"><span>Toplam nüfus</span><strong>${number(totalPopulation)}</strong></div><div class="detail-cell"><span>Ordu mevcudu</span><strong>${number(totalArmy)}</strong></div><div class="detail-cell"><span>Seferberlik</span><strong>${escapeHtml(mobilizationLabels[data.country.mobilization] || data.country.mobilization)}</strong></div></section>
    <div class="section-title"><h2>Yerleşkeler</h2><span>${number(data.settlements.length)} kayıt</span></div>
    <section class="card table-wrap"><table><thead><tr><th>Yerleşke</th><th>Nüfus</th><th>Köle</th><th>Hazine</th><th>Kaynak</th><th>Din</th><th>Kara ticareti</th><th>Asker</th><th>Gemi</th></tr></thead><tbody>${data.settlements.map((settlement) => `<tr><td><strong>${escapeHtml(settlement.name)}</strong>${settlement.is_conquered ? '<small class="muted"> · Fethedildi</small>' : ""}</td><td>${number(settlement.population)}</td><td>${number(settlement.slave_population)}</td><td>${money(settlement.local_treasury)}</td><td>${escapeHtml(settlement.resource_label || settlement.resource_type || "—")}</td><td>${religionDistribution(settlement)}</td><td>${money(settlement.base_land_trade_income)}</td><td>${number(settlement.army_stock)}</td><td>${number(settlement.ships)}</td></tr>`).join("") || '<tr><td colspan="9" class="empty">Yerleşke bulunmuyor.</td></tr>'}</tbody></table></section>
    <section class="content-grid"><div class="card"><div class="card-head"><div><h3>Ordular</h3><p>Birlik ve komutan durumu</p></div></div>${data.armies.map((army) => `<div class="data-row"><div><strong>${escapeHtml(army.name)}</strong><small>${escapeHtml(army.commander_name || "Komutan atanmamış")}</small></div><span>${number(army.total)} asker</span><span>Tur ${number(army.created_turn)}</span><span class="pill neutral">Aktif</span></div>`).join("") || '<div class="empty">Henüz ordu yok.</div>'}</div><aside class="card"><div class="card-head"><div><h3>Filolar</h3><p>Gemi ve amiral durumu</p></div></div>${data.fleets.map((fleet) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(fleet.name)}</strong><span>${escapeHtml(fleet.commander_name || "Amiral atanmamış")} · ${number(fleet.total)} gemi</span></div></div>`).join("") || '<div class="empty">Henüz filo yok.</div>'}</aside></section>
    <section class="card section-gap"><div class="card-head"><div><h3>Karakterler</h3><p>Uzmanlık, görev ve durum kayıtları</p></div></div><div class="compact-grid">${data.characters.map((character) => `<div class="record-card"><strong>${escapeHtml(character.name)}</strong><span>${escapeHtml(roleLabel(character))} · Sv${number(character.level)} · +${number(character.skill_bonus)}</span><small>${escapeHtml(characterStatusLabel(character.status))} · ${escapeHtml(assignmentLabel(character.assignment))}${character.assigned_settlement_name ? ` · ${escapeHtml(character.assigned_settlement_name)}` : ""}${character.death_settlement_name ? ` · Ölüm: ${escapeHtml(character.death_settlement_name)}` : ""}</small></div>`).join("") || '<div class="empty">Karakter yok.</div>'}</div></section>`;
  bindPageActions();
  document.querySelector("[data-back-countries]").addEventListener("click", countries);
}

async function settlementsPage() {
  setActiveRoute("settlements"); loading();
  const [rows, religions] = await Promise.all([api("/api/settlements"), state.religionCatalog ? Promise.resolve(state.religionCatalog) : api("/api/catalog/religions")]);
  state.religionCatalog = religions;
  page.innerHTML = `<div class="page-head"><div><h1>Yerleşkeler</h1><p>Nüfus, ekonomi, din, vergi oranı, kaynak ve askerî stokların tamamı</p></div><span class="pill neutral">${number(rows.length)} yerleşke</span></div><section class="card table-wrap"><table><thead><tr><th>Yerleşke</th><th>Devlet</th><th>Nüfus / Köle</th><th>Din dağılımı</th><th>Yerel hazine</th><th>Vergi</th><th>Kara ticareti</th><th>Asker / Gemi</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr data-country-id="${row.country_id}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.resource_label || row.resource_type)} · ${escapeHtml(row.culture_label || row.culture_group)} · ${row.is_coastal ? "Kıyı" : "İç bölge"}</small></td><td>${escapeHtml(row.country_name)}</td><td>${number(row.population)} / ${number(row.slave_population)}</td><td>${religionDistribution(row)}</td><td>${money(row.local_treasury)}</td><td>%${number(row.tax_rate_percent)}</td><td>${money(row.base_land_trade_income)}</td><td>${number(row.army_stock)} / ${number(row.ships)}</td><td><span class="pill ${row.ruin_stage > 0 || row.is_conquered ? "warning" : "neutral"}">${row.ruin_stage > 0 ? `Harap ${number(row.ruin_stage)}` : row.is_conquered ? "Fethedildi" : "Normal"}</span></td><td>${row.country_status === "ACTIVE" ? `<button class="button compact" data-edit-settlement="${row.id}">Düzenle</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="10" class="empty">Yerleşke bulunmuyor.</td></tr>'}</tbody></table></section>`;
  bindCountryRows();
  document.querySelectorAll("[data-edit-settlement]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openSettlementEditor(rows.find((item) => item.id === button.dataset.editSettlement));
  }));
}

async function forcesPage() {
  setActiveRoute("armies"); loading();
  const data = await api("/api/forces");
  page.innerHTML = `<div class="page-head"><div><h1>Ordular & Filolar</h1><p>Kalıcı kuvvetlerin mevcudu, konumu ve komuta durumu</p></div><button class="button primary" data-open-army>＋ Yeni ordu</button></div>
    <div class="section-title"><h2>Ordular</h2><span>${number(data.armies.length)} kayıt</span></div><section class="card table-wrap"><table><thead><tr><th>Ordu</th><th>Devlet</th><th>Komutan</th><th>Mevcut</th><th>Köken</th><th>Konum</th><th>Kuruluş</th><th></th></tr></thead><tbody>${data.armies.map((row) => `<tr data-country-id="${row.country_id}"><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.country_name)}</td><td>${escapeHtml(row.commander_name || "Atanmamış")}</td><td>${number(row.total)}</td><td>${number(row.origin_count)} yerleşke</td><td>${escapeHtml(row.hex_id || "Belirlenmedi")}</td><td>Tur ${number(row.created_turn)}</td><td><button class="button compact" data-edit-army="${row.id}">Düzenle</button></td></tr>`).join("") || '<tr><td colspan="8" class="empty">Ordu bulunmuyor.</td></tr>'}</tbody></table></section>
    <div class="section-title"><h2>Filolar</h2><span>${number(data.fleets.length)} kayıt</span></div><section class="card table-wrap"><table><thead><tr><th>Filo</th><th>Devlet</th><th>Amiral</th><th>Hazır gemi</th><th>Hasarlı gemi</th><th>Konum</th><th>Kuruluş</th></tr></thead><tbody>${data.fleets.map((row) => `<tr data-country-id="${row.country_id}"><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.country_name)}</td><td>${escapeHtml(row.commander_name || "Atanmamış")}</td><td>${number(Number(row.ready_ships) + Number(row.tracked_ships) - Number(row.damaged_ships))}</td><td>${number(row.damaged_ships)}</td><td>${escapeHtml(row.hex_id || "Belirlenmedi")}</td><td>Tur ${number(row.created_turn)}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">Filo bulunmuyor.</td></tr>'}</tbody></table></section>`;
  bindPageActions(); bindCountryRows();
  document.querySelectorAll("[data-edit-army]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openArmyEditor(button.dataset.editArmy).catch((error) => toast(error.message, "error"));
  }));
}

async function charactersPage() {
  setActiveRoute("characters"); loading();
  const [rows, catalog] = await Promise.all([api("/api/characters"), state.characterCatalog ? Promise.resolve(state.characterCatalog) : api("/api/catalog/characters")]);
  state.characterCatalog = catalog;
  const alive = rows.filter((row) => row.character_status === "ACTIVE").length;
  page.innerHTML = `<div class="page-head"><div><h1>Karakterler</h1><p>Karakter adları, puanları, uzmanlıkları ve doktrinleri</p></div><div class="actions"><span class="pill">${number(alive)} aktif</span><span class="pill neutral">${number(rows.length - alive)} ölü/görevden alınmış</span></div></div><section class="card table-wrap"><table><thead><tr><th>Karakter</th><th>Devlet</th><th>Rol</th><th>Seviye / Bonus</th><th>Uzmanlık</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr data-country-id="${row.country_id}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.trained_settlement_name || "Köken bilinmiyor")}</small></td><td>${escapeHtml(row.country_name)}</td><td>${escapeHtml(roleLabel(row))}</td><td>Sv${number(row.specialization_level)} / +${number(row.skill_bonus)}</td><td>${escapeHtml(developmentLabel(row.specialization || row.admiral_specialization))}<small>${escapeHtml(row.doctrine || row.admiral_doctrine ? developmentLabel(row.doctrine || row.admiral_doctrine) : "Doktrin yok")}</small></td><td><span class="pill ${row.character_status === "ACTIVE" ? "" : "neutral"}">${escapeHtml(characterStatusLabel(row.character_status))}</span>${row.death_settlement_name ? `<small>Ölüm: ${escapeHtml(row.death_settlement_name)}</small>` : ""}</td><td>${row.character_status === "ACTIVE" ? `<button class="button compact" data-edit-character="${row.id}">Düzenle</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">Karakter bulunmuyor.</td></tr>'}</tbody></table></section>`;
  bindCountryRows();
  document.querySelectorAll("[data-edit-character]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openCharacterEditor(rows.find((item) => item.id === button.dataset.editCharacter)).catch((error) => toast(error.message, "error"));
  }));
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

async function dynastyDetailPage(dynastyId) {
  setActiveRoute("dynasties"); loading();
  const dynasty = await api(`/api/dynasties/${dynastyId}`);
  const alive = dynasty.members.filter((member) => member.status === "ALIVE");
  const sick = alive.filter((member) => member.health === "SICK");
  const localMarriageCandidates = alive.filter(canMarryLocalNoble);
  page.innerHTML = `<div class="page-head"><div><button class="button compact" data-back-dynasties>← Hanedanlar</button><h1>${escapeHtml(dynasty.name)}</h1><p>${escapeHtml(dynasty.country_name)} · Tur ${number(dynasty.current_turn)}</p></div><div class="actions"><button class="button" data-edit-dynasty="${dynasty.id}">Hanedanı düzenle</button><button class="button" data-local-noble-marriage="${dynasty.id}" ${localMarriageCandidates.length ? "" : "disabled"}>Yerel soyluyla evlendir</button><button class="button primary" data-add-dynasty-member="${dynasty.id}">＋ Yeni üye / akraba</button></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Toplam üye</span><strong>${number(dynasty.members.length)}</strong></div><div class="detail-cell"><span>Hayatta</span><strong>${number(alive.length)}</strong></div><div class="detail-cell"><span>Hasta</span><strong>${number(sick.length)}</strong></div><div class="detail-cell"><span>Son doğum denemesi</span><strong>${dynasty.last_birth_attempt_turn === null ? "—" : `Tur ${number(dynasty.last_birth_attempt_turn)}`}</strong></div></section>
    <div class="section-title"><h2>Hanedan üyeleri</h2><span>Ad, yaş, unvan, sağlık ve akrabalık düzenlenebilir</span></div>
    <section class="card table-wrap"><table><thead><tr><th>Üye</th><th>Konum</th><th>Yaş / Cinsiyet</th><th>Sağlık</th><th>Akrabalık bağları</th><th>Veraset</th><th></th></tr></thead><tbody>${dynasty.members.map((member) => `<tr><td><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.title)}</small></td><td>${escapeHtml(member.relation)}</td><td>${member.age === null ? "—" : number(member.age)} · ${escapeHtml(dynastyGenderLabels[member.gender] || member.gender)}</td><td><span class="pill ${member.status === "DEAD" ? "neutral" : member.health === "SICK" ? "warning" : ""}">${member.status === "DEAD" ? "Ölü" : escapeHtml(dynastyHealthLabels[member.health] || member.health)}</span>${member.health === "SICK" && member.sick_until_turn !== null ? `<small>Tur ${number(member.sick_until_turn)} sonuna kadar</small>` : member.status === "DEAD" ? `<small>Tur ${number(member.died_turn)} · ${escapeHtml(member.death_reason || "Neden belirtilmedi")}</small>` : ""}</td><td><small>${escapeHtml(dynastyMemberConnections(member))}</small></td><td>${member.is_monarch ? '<span class="pill">Hükümdar</span>' : member.is_heir ? '<span class="pill">Varis</span>' : member.succession_rank ? `Sıra ${number(member.succession_rank)}` : "—"}</td><td><div class="row-actions"><button class="button compact" data-edit-dynasty-member="${member.id}">Düzenle</button>${member.status === "ALIVE" ? `<button class="button compact danger" data-kill-dynasty-member="${member.id}">Öldü olarak işle</button>` : ""}</div></td></tr>`).join("") || '<tr><td colspan="7" class="empty">Hanedan üyesi bulunmuyor.</td></tr>'}</tbody></table></section>
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
}

function openDynastyEditor(dynasty) {
  openEditor("Hanedanı düzenle", dynasty.country_name, `<label>Hanedan adı<input id="edit-dynasty-name" value="${escapeHtml(dynasty.name)}" required minlength="2" maxlength="80"></label>`, async () => {
    await api(`/api/admin/dynasties/${dynasty.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-dynasty-name").value }) });
    closeEditor(); toast("Hanedan bilgileri güncellendi."); await dynastyDetailPage(dynasty.id);
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
      closeEditor(); toast("Yerel soylu evliliği hanedana işlendi."); await dynastyDetailPage(dynasty.id);
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
    spouseId: nullable("dynasty-member-spouse"), motherId: nullable("dynasty-member-mother"), fatherId: nullable("dynasty-member-father")
  };
}

function openDynastyMemberEditor(dynasty, member = null) {
  const dead = member?.status === "DEAD";
  const health = dead ? "HEALTHY" : (member?.health || "HEALTHY");
  const defaultSickUntil = member?.sick_until_turn ?? Number(dynasty.current_turn) + 3;
  openEditor(member ? "Hanedan üyesini düzenle" : "Yeni hanedan üyesi / akraba", `${dynasty.country_name} · ${dynasty.name}`, `<div class="form-grid"><label>Adı<input id="dynasty-member-name" value="${escapeHtml(member?.name || "")}" minlength="2" maxlength="80" required></label><label>Cinsiyet<select id="dynasty-member-gender"><option value="MALE" ${selected("MALE", member?.gender || "MALE")}>Erkek</option><option value="FEMALE" ${selected("FEMALE", member?.gender)}>Kadın</option></select></label><label>Yaş<input id="dynasty-member-age" type="number" min="0" max="120" step="1" value="${Number(member?.age ?? 0)}" required></label><label>Unvan<input id="dynasty-member-title" value="${escapeHtml(member?.title || "Hanedan Üyesi")}" minlength="2" maxlength="80" required></label><label>Akrabalık / konum<input id="dynasty-member-relation" value="${escapeHtml(member?.relation || "Hanedan akrabası")}" minlength="2" maxlength="120" required></label><label>Sağlık<select id="dynasty-member-health" ${dead ? "disabled" : ""}><option value="HEALTHY" ${selected("HEALTHY", health)}>Sağlıklı</option><option value="SICK" ${selected("SICK", health)}>Hasta</option></select></label><label>Hastalık bitiş turu<input id="dynasty-member-sick-until" type="number" min="${Number(dynasty.current_turn)}" step="1" value="${Number(defaultSickUntil)}" ${dead ? "disabled" : ""}><small>Sağlıklı seçilirse bu alan temizlenir.</small></label><label>Veraset sırası<input id="dynasty-member-rank" type="number" min="1" step="1" value="${member?.succession_rank ?? ""}" placeholder="Boş bırakılabilir"></label><label>Eş<select id="dynasty-member-spouse">${dynastyRelationOptions(dynasty, member, "spouse")}</select></label><label>Anne<select id="dynasty-member-mother">${dynastyRelationOptions(dynasty, member, "mother")}</select></label><label>Baba<select id="dynasty-member-father">${dynastyRelationOptions(dynasty, member, "father")}</select></label></div><div class="check-grid"><label class="check"><input id="dynasty-member-monarch" type="checkbox" ${member?.is_monarch ? "checked" : ""} ${dead ? "disabled" : ""}> Hükümdar</label><label class="check"><input id="dynasty-member-heir" type="checkbox" ${member?.is_heir ? "checked" : ""} ${dead ? "disabled" : ""}> Taht varisi</label></div>${dead ? '<div class="preview-warning"><strong>Ölü üye kaydı</strong><span>Kimlik ve akrabalık bilgileri düzeltilebilir; sağlık ve veraset görevleri yeniden açılamaz.</span></div>' : '<div class="preview-warning"><strong>Erkek öncelikli veraset aktiftir.</strong><span>Yaşayan ve verasete uygun erkek varken kadın üye varis veya yeni hükümdar seçilemez.</span></div>'}`, async () => {
    const input = dynastyMemberInput();
    await api(member ? `/api/admin/dynasty-members/${member.id}` : `/api/admin/dynasties/${dynasty.id}/members`, { method: member ? "PATCH" : "POST", body: JSON.stringify(input) });
    closeEditor(); toast(member ? "Hanedan üyesi güncellendi." : "Yeni hanedan üyesi eklendi."); await dynastyDetailPage(dynasty.id);
  });
}

function openDynastyDeathEditor(dynasty, member) {
  if (!member) return;
  openEditor("Hanedan üyesini öldü olarak işle", `${dynasty.country_name} · ${member.name}`, `<div class="preview-warning"><strong>Bu işlem veraset düzenini değiştirebilir.</strong><span>Üye hükümdar veya varisse sistem yaşayan uygun üyeler arasından yeni atama yapar. Bekleyen evlilik teklifleri iptal edilir.</span></div><label>Ölüm nedeni<textarea id="dynasty-death-reason" minlength="2" maxlength="200" rows="3" required placeholder="Örn. Hastalık, savaş yaraları, yaşlılık…"></textarea></label>`, async () => {
    await api(`/api/admin/dynasty-members/${member.id}/death`, { method: "POST", body: JSON.stringify({ reason: document.getElementById("dynasty-death-reason").value }) });
    closeEditor(); toast(`${member.name} öldü olarak işlendi.`); await dynastyDetailPage(dynasty.id);
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
    if (!character || !window.confirm(`${character.name} karakterinin “${operationLabels[character.operation_type] || assignmentLabel(character.assignment)}” görevini iptal etmek istediğine emin misin?`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/characters/${character.id}/cancel-assignment`, { method: "POST" });
      toast(`${character.name} karakterinin görevi iptal edildi.`);
      await assignmentsPage();
    } catch (error) { toast(error.message, "error"); button.disabled = false; }
  }));
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

async function battlesPage() {
  setActiveRoute("battles"); loading();
  const [rows, sieges, catalog] = await Promise.all([api("/api/battles"), api("/api/sieges"), state.catalog.length ? Promise.resolve(state.catalog) : api("/api/catalog/units")]);
  state.catalog = catalog;
  const active = rows.filter((row) => !["FINISHED", "CANCELLED"].includes(row.status)).length;
  const battleById = new Map(rows.map((row) => [row.id,row]));
  page.innerHTML = `<div class="page-head"><div><h1>Savaşlar</h1><p>Aktif kuşatma ordularına müdahale ve bütün savaş formlarının yönetici özeti</p></div><span class="pill">${number(active)} aktif savaş</span></div>
    <div class="section-title"><h2>Aktif Kuşatmalar ve Ordular</h2><span>${number(sieges.length)} kuşatma</span></div><section class="siege-list">${sieges.map((siege) => `<article class="card"><div class="card-head"><div><h3>${escapeHtml(siege.settlementName || "Yerleşke belirtilmemiş")}</h3><p>${escapeHtml(siege.countryAName || "A Tarafı")} — ${escapeHtml(siege.countryBName || "B Tarafı")} · ${escapeHtml(battleStatusLabels[siege.status] || siege.status)} · Değerlendirme ${number(siege.roundNumber)} · ${escapeHtml(siegePhaseLabels[siege.siegePhase] || siege.siegePhase || "Hücum")}</p></div><button class="button primary" data-manage-siege="${siege.id}">Katılımcıları yönet</button></div><div class="compact-grid">${siege.armies.map((army) => `<div class="record-card"><strong>${escapeHtml(army.countryName)} · ${escapeHtml(army.name)}</strong><span>${army.sideKey} Tarafı · ${number(army.total)} asker</span><small>${army.units.map((unit) => `${escapeHtml(unit.originName || "Köken yok")}: ${escapeHtml(state.catalog.find((item) => item.value === unit.unitType)?.label || unit.unitType)} ${number(unit.quantity)}`).join(" · ") || "Birlik yok"}</small><button class="button" data-edit-army="${army.id}">Askerleri düzenle</button></div>`).join("") || '<div class="empty">Henüz kalıcı ordu eklenmemiş.</div>'}</div>${battleMercenariesMarkup(battleById.get(siege.id)?.mercenaries)}</article>`).join("") || '<div class="card empty">Aktif kuşatma bulunmuyor.</div>'}</section>
    <div class="section-title"><h2>Tüm Savaşlar</h2><span>${number(rows.length)} kayıt</span></div><section class="battle-grid">${rows.map((row) => `<article class="card battle-card"><div class="card-head"><div><h3>${escapeHtml(row.country_a_name || "A Tarafı")} — ${escapeHtml(row.country_b_name || "B Tarafı")}</h3><p>${escapeHtml(terrainLabels[row.terrain] || row.terrain)} · Tur ${number(row.round_number)}${row.defender_settlement_name ? ` · ${escapeHtml(row.defender_settlement_name)}` : ""}</p></div><span class="pill ${["FINISHED", "CANCELLED"].includes(row.status) ? "neutral" : ""}">${escapeHtml(battleStatusLabels[row.status] || row.status)}</span></div><div class="battle-sides"><div><strong>${escapeHtml(row.country_a_name || "A")}</strong><span>${number(row.current_a)} / ${number(row.initial_a)}</span><small>${number(row.losses_a)} kayıp · ${number(row.pressure_a)} baskı</small></div><div><strong>${escapeHtml(row.country_b_name || "B")}</strong><span>${number(row.current_b)} / ${number(row.initial_b)}</span><small>${number(row.losses_b)} kayıp · ${number(row.pressure_b)} baskı</small></div></div>${row.wall_max_hp ? `<div class="battle-structure">Sur ${number(row.wall_current_hp)}/${number(row.wall_max_hp)} · Kapı ${number(row.gate_current_hp)}/${number(row.gate_max_hp)}</div>` : ""}${battleMercenariesMarkup(row.mercenaries)}<div class="row-actions"><button type="button" class="button compact" data-manage-battle-rosters="${row.id}">Kadroları gör / temizle</button></div></article>`).join("") || '<div class="card empty">Savaş kaydı bulunmuyor.</div>'}</section>`;
  document.querySelectorAll("[data-edit-army]").forEach((button) => button.addEventListener("click", () => {
    openArmyEditor(button.dataset.editArmy).catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-manage-siege]").forEach((button) => button.addEventListener("click", () => {
    const siege = sieges.find((item) => item.id === button.dataset.manageSiege);
    openSiegeRosterManager(siege).catch((error) => toast(error.message, "error"));
  }));
  document.querySelectorAll("[data-manage-battle-rosters]").forEach((button) => button.addEventListener("click", () => {
    const battle = rows.find((item) => item.id === button.dataset.manageBattleRosters);
    openBattleRosterManager(battle).catch((error) => toast(error.message, "error"));
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

async function openSiegeRosterManager(siege) {
  if (!siege) return;
  const data = await api(`/api/sieges/${siege.id}/roster-options`);
  const sideName = (side) => side === "A" ? "A · Kuşatan" : "B · Savunan";
  const participants = data.countries.filter((country) => country.side_key);
  const unassignedCountries = data.countries.filter((country) => !country.side_key);
  const assignedArmies = data.armies.filter((army) => army.assigned_side);
  const participantCards = participants.map((country) => {
    const armies = assignedArmies.filter((army) => army.country_id === country.id);
    return `<div class="record-card"><strong>${escapeHtml(country.name)}</strong><span>${sideName(country.side_key)}${country.is_primary ? " · Ana devlet" : ""}</span><small>${armies.map((army) => `${escapeHtml(army.name)} (${number(army.total)})`).join(" · ") || "Bağlı kalıcı ordu yok"}</small>${country.is_primary ? "" : `<button type="button" class="button compact danger" data-siege-remove-country="${country.id}" data-side="${country.side_key}">Devleti çıkar</button>`}</div>`;
  }).join("");
  const armyCards = assignedArmies.map((army) => `<div class="army-unit-line"><div><strong>${escapeHtml(army.country_name)} · ${escapeHtml(army.name)}</strong><small>${sideName(army.assigned_side)} · ${number(army.total)} asker</small></div><button type="button" class="button compact danger" data-siege-remove-army="${army.id}" data-side="${army.assigned_side}">Çıkar</button></div>`).join("");
  openEditor("Kuşatma katılımcılarını yönet", `${siege.settlementName || "Kuşatma"} · ${battleStatusLabels[data.status] || data.status}`, `
    <div class="preview-warning"><strong>Aktif savaşa takviye işlemi</strong><span>Eklenen ordu mevcut ve başlangıç kuvvet havuzuna birlikte yazılır; önceki kayıplar değişmez. Ordu kuşatma aletleriyle birlikte eklenir. Değerlendirme zarı atılmaya başladıysa önce o değerlendirme sonuçlandırılmalıdır.</span></div>
    <div class="section-title"><h2>Mevcut devletler</h2><span>${number(participants.length)} devlet</span></div><div class="compact-grid">${participantCards || '<div class="empty">Katılımcı bulunamadı.</div>'}</div>
    <div class="section-title"><h2>Devlet ekle</h2><span>Önce tarafı seç</span></div><div class="form-grid"><label>Taraf<select id="siege-country-side"><option value="A">A · Kuşatan</option><option value="B">B · Savunan</option></select></label><label>Devlet<select id="siege-country-id">${unassignedCountries.map((country) => `<option value="${country.id}">${escapeHtml(country.name)}</option>`).join("")}</select></label></div><button type="button" class="button primary" id="siege-add-country" ${unassignedCountries.length ? "" : "disabled"}>Devleti kuşatmaya ekle</button>
    <div class="section-title"><h2>Ordu ekle</h2><span>Yalnız uygun ordular</span></div><div class="form-grid"><label>Taraf<select id="siege-army-side"><option value="A">A · Kuşatan</option><option value="B">B · Savunan</option></select></label><label>Devlet<select id="siege-army-country"></select></label><label>Ordu<select id="siege-army-id"></select></label></div><button type="button" class="button primary" id="siege-add-army">Orduyu kuşatmaya sok</button>
    <div class="section-title"><h2>Bağlı ordular</h2><span>${number(assignedArmies.length)} ordu</span></div><div class="army-unit-editor">${armyCards || '<div class="empty">Bağlı kalıcı ordu yok.</div>'}</div>
  `, null);

  const armySide = document.getElementById("siege-army-side");
  const armyCountry = document.getElementById("siege-army-country");
  const armySelect = document.getElementById("siege-army-id");
  const addArmyButton = document.getElementById("siege-add-army");
  const refreshArmyCountries = () => {
    const countries = participants.filter((country) => country.side_key === armySide.value);
    armyCountry.innerHTML = countries.map((country) => `<option value="${country.id}">${escapeHtml(country.name)}</option>`).join("");
    refreshArmyChoices();
  };
  const refreshArmyChoices = () => {
    const armies = data.armies.filter((army) => army.country_id === armyCountry.value && !army.assigned_side);
    armySelect.innerHTML = armies.map((army) => `<option value="${army.id}" ${army.blocking_reason ? "disabled" : ""}>${escapeHtml(army.name)} · ${number(army.total)} asker${army.blocking_reason ? ` · ${escapeHtml(army.blocking_reason)}` : ""}</option>`).join("");
    const selectable = armies.some((army) => !army.blocking_reason && Number(army.total) > 0);
    addArmyButton.disabled = !selectable;
    if (selectable) armySelect.value = armies.find((army) => !army.blocking_reason && Number(army.total) > 0)?.id || "";
  };
  armySide.addEventListener("change", refreshArmyCountries);
  armyCountry.addEventListener("change", refreshArmyChoices);
  refreshArmyCountries();

  document.getElementById("siege-add-country").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api(`/api/admin/sieges/${siege.id}/participants`, { method:"POST",body:JSON.stringify({
        countryId:document.getElementById("siege-country-id").value,side:document.getElementById("siege-country-side").value,action:"ADD"
      }) });
      closeEditor(); toast("Devlet aktif kuşatmaya eklendi."); await battlesPage();
    } catch (error) { toast(error.message,"error"); event.currentTarget.disabled = false; }
  });
  addArmyButton.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await api(`/api/admin/sieges/${siege.id}/armies`, { method:"POST",body:JSON.stringify({
        armyId:armySelect.value,side:armySide.value,action:"ADD"
      }) });
      closeEditor(); toast("Ordu aktif kuşatmaya takviye olarak eklendi."); await battlesPage();
    } catch (error) { toast(error.message,"error"); event.currentTarget.disabled = false; }
  });
  document.querySelectorAll("[data-siege-remove-army]").forEach((button) => button.addEventListener("click", async () => {
    const army = assignedArmies.find((item) => item.id === button.dataset.siegeRemoveArmy);
    if (!army || !window.confirm(`${army.name} ordusunu aktif kuşatmadan çıkarmak istediğine emin misin? Savaşa katıldıktan sonra zar atıldıysa işlem engellenecek.`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/sieges/${siege.id}/armies`, { method:"POST",body:JSON.stringify({ armyId:army.id,side:button.dataset.side,action:"REMOVE" }) });
      closeEditor(); toast("Ordu kuşatmadan çıkarıldı."); await battlesPage();
    } catch (error) { toast(error.message,"error"); button.disabled = false; }
  }));
  document.querySelectorAll("[data-siege-remove-country]").forEach((button) => button.addEventListener("click", async () => {
    const country = participants.find((item) => item.id === button.dataset.siegeRemoveCountry);
    if (!country || !window.confirm(`${country.name} devletini aktif kuşatmadan çıkarmak istediğine emin misin?`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/sieges/${siege.id}/participants`, { method:"POST",body:JSON.stringify({ countryId:country.id,side:button.dataset.side,action:"REMOVE" }) });
      closeEditor(); toast("Devlet kuşatmadan çıkarıldı."); await battlesPage();
    } catch (error) { toast(error.message,"error"); button.disabled = false; }
  }));
}

async function aiGovernancePage() {
  setActiveRoute("ai-governance"); loading();
  const data = await api("/api/ai-governance");
  const playerless = data.countries.filter((country) => Number(country.player_count) === 0).length;
  const candidates = data.countries.filter((country) => country.profile_enabled).length;
  const testModeEnabled = data.settings.enabled === true;
  page.innerHTML = `<div class="page-head"><div><h1>Yapay Zekâ Devletleri</h1><p>Hex rotası, savaş harekâtı, bütçe, bina ve kesin asker alımı hazırlayan denetlenebilir devlet kurmayı</p></div><div class="actions"><span class="pill ${testModeEnabled ? "" : "warning"}">${testModeEnabled ? "Test modu açık" : "Test modu kapalı"}</span><span class="pill neutral">${number(candidates)} aday / ${number(playerless)} oyuncusuz</span><button class="button ${testModeEnabled ? "danger" : "primary"}" data-toggle-ai-global>${testModeEnabled ? "Test modunu kapat" : "Test modunu aç"}</button></div></div>
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
      await aiGovernancePage();
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
      await aiGovernancePage();
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
      await aiGovernancePage();
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
  addReferences(observation.strategicMap?.publicSettlements, "Yerleşke: ");
  (observation.visibleBattles || []).forEach((battle) => references.set(battle.id, `Savaş: ${observation.country?.name || "Yönetilen devlet"} — ${battle.opponent_country_name || "bilinmeyen taraf"}`));
  const refLabel = (value) => value ? (references.get(value) || value) : "—";
  const list = (items, empty) => items?.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`;
  const orders = (plan.orders || []).map((order, index) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(aiOrderCategoryLabels[order.category] || order.category)}</span><strong>${index + 1}. ${escapeHtml(aiOrderKindLabels[order.kind] || order.kind)}</strong></div><span class="ai-priority">Öncelik ${number(order.priority)}/5</span></div><div class="ai-order-route"><span><small>Kaynak</small>${escapeHtml(refLabel(order.sourceRef))}</span><span><small>Hedef</small>${escapeHtml(refLabel(order.targetRef))}</span>${order.amount !== null && order.amount !== undefined ? `<span><small>Miktar</small>${number(order.amount)}</span>` : ""}</div><p><strong>Gerekçe:</strong> ${escapeHtml(order.reason)}</p>${order.condition ? `<p><strong>Koşul:</strong> ${escapeHtml(order.condition)}</p>` : ""}</article>`).join("") || '<div class="empty">AI bu tur için işlem önermedi.</div>';
  const policies = (plan.battlePolicies || []).map((policy) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>Savaş planı</span><strong>${escapeHtml(refLabel(policy.battleId))}</strong></div><span class="ai-priority">${escapeHtml(aiBattlePostureLabels[policy.posture] || policy.posture)}</span></div><p><strong>Geri çekilme ölçütü:</strong> ${escapeHtml(policy.retreatRule)}</p>${policy.preferredNavalOrder ? `<p><strong>Deniz manevrası:</strong> ${escapeHtml(aiNavalOrderLabels[policy.preferredNavalOrder] || policy.preferredNavalOrder)}</p>` : ""}<p><strong>Gerekçe:</strong> ${escapeHtml(policy.reason)}</p></article>`).join("") || '<div class="empty">Aktif savaşa özel öneri yok.</div>';
  const construction = (plan.constructionPlan || []).map((action) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(refLabel(action.settlementRef))}</span><strong>${escapeHtml(action.buildingName)} → Sv${number(action.targetLevel)}</strong></div><span class="ai-priority">Öncelik ${number(action.priority)}/5</span></div><div class="ai-order-route"><span><small>Maliyet</small>${money(action.estimatedCost)}</span><span><small>Süre</small>${number(action.durationTurns)} tur</span></div><p>${escapeHtml(action.reason)}</p></article>`).join("") || '<div class="empty">Bu tur bina yatırımı önerilmedi.</div>';
  const recruitment = (plan.recruitmentPlan || []).map((action) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(refLabel(action.settlementRef))}</span><strong>${number(action.quantity)} ${escapeHtml(action.unitName)}</strong></div><span class="ai-priority">Öncelik ${number(action.priority)}/5</span></div><div class="ai-order-route"><span><small>Maliyet</small>${money(action.estimatedCost)}</span><span><small>Yeni bakım</small>${money(action.addedUpkeep)}</span></div><p>${escapeHtml(action.reason)}</p></article>`).join("") || '<div class="empty">Bu tur asker alımı önerilmedi.</div>';
  const shipbuilding = (plan.shipbuildingPlan || []).map((action) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(refLabel(action.settlementRef))}</span><strong>${number(action.quantity)} ${escapeHtml(action.shipName)}</strong></div><span class="ai-priority">Öncelik ${number(action.priority)}/5</span></div><div class="ai-order-route"><span><small>Maliyet</small>${money(action.estimatedCost)}</span><span><small>Yeni bakım</small>${money(action.addedUpkeep)}</span><span><small>Süre</small>${number(action.completionTurns)} tur</span></div><p>${escapeHtml(action.reason)}</p></article>`).join("") || '<div class="empty">Bu tur gemi üretimi önerilmedi.</div>';
  const movements = (plan.movementPlan || []).map((action) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${action.formationKind === "ARMY" ? "Ordu hareketi" : "Filo hareketi"}</span><strong>${escapeHtml(refLabel(action.formationRef))}</strong></div><span class="ai-priority">${escapeHtml(action.purpose)}</span></div><div class="ai-order-route"><span><small>Başlangıç</small>${escapeHtml(action.startHex)}</span><span><small>Hedef</small>${escapeHtml(action.destinationHex)}</span><span><small>Rota maliyeti</small>${Math.max(0, (action.route || []).length - 1)} Hex</span></div>${action.targetSettlementRef ? `<p><strong>Hedef yerleşke:</strong> ${escapeHtml(refLabel(action.targetSettlementRef))}</p>` : ""}<p><strong>Doğrulanmış rota:</strong> ${escapeHtml((action.route || []).join(" → ") || "Rota doğrulanamadı")}</p><p><strong>Gerekçe:</strong> ${escapeHtml(action.reason)}</p></article>`).join("") || '<div class="empty">Bu tur Hex hareketi önerilmedi.</div>';
  const wars = (plan.warPlans || []).map((war) => `<article class="ai-order-card"><div class="ai-order-head"><div><span>${escapeHtml(war.posture)}</span><strong>${escapeHtml(refLabel(war.opponentCountryRef))}</strong></div><span class="ai-priority">${war.assemblyHex ? `Toplanma ${escapeHtml(war.assemblyHex)}` : "Toplanma yok"}</span></div><p><strong>Hedef:</strong> ${escapeHtml(war.objective)}</p><p><strong>Kuvvetler:</strong> ${escapeHtml([...(war.committedArmyRefs || []), ...(war.committedFleetRefs || [])].map(refLabel).join(", ") || "Belirlenmedi")}</p><ol>${(war.phases || []).map((phase) => `<li>${escapeHtml(phase)}</li>`).join("")}</ol><p><strong>Saldırı şartı:</strong> ${escapeHtml(war.attackCondition)}</p><p><strong>Vazgeçme şartı:</strong> ${escapeHtml(war.abortCondition)}</p><p><strong>Gerekçe:</strong> ${escapeHtml(war.reason)}</p></article>`).join("") || '<div class="empty">Ayrı bir savaş harekâtı önerilmedi.</div>';
  const budget = plan.budgetPlan || {};
  const validationErrors = record.validation?.errors || [];
  const status = aiPlanStatusLabels[record.status] || record.status;
  const reviewable = ["DRAFT", "APPROVED", "REJECTED"].includes(record.status);
  openEditor("AI harekât ve yatırım raporu", `${record.country_name} · Tur ${number(record.game_turn)} · ${status}`, `<div class="preview-warning ai-plan-boundary"><strong>Yalnız öneri — oyun emri değildir</strong><span>Hex rotaları sunucu haritasıyla doğrulanmıştır; buna rağmen bu rapor hiçbir komut oluşturmaz ve oyun verisini değiştirmez.</span></div><div class="detail-grid ai-plan-facts"><div class="detail-cell"><span>Durum</span><strong>${escapeHtml(status)}</strong></div><div class="detail-cell"><span>Tur / Sürüm</span><strong>${number(record.game_turn)} / ${number(record.revision)}</strong></div><div class="detail-cell"><span>Model</span><strong>${escapeHtml(record.model)}</strong></div><div class="detail-cell"><span>Doğrulama</span><strong>${record.validation?.valid ? "Geçti" : "Hatalı"}</strong></div></div><section class="ai-plan-section"><h3>Genel strateji</h3><p>${escapeHtml(plan.summary || "Özet yok.")}</p></section><section class="ai-plan-section"><h3>Stratejik değerlendirme</h3>${list(plan.strategicAssessment, "Değerlendirme yok.")}</section><section class="ai-plan-section"><h3>Tur bütçesi</h3><div class="detail-grid"><div class="detail-cell"><span>Başlangıç</span><strong>${money(budget.startingTreasury)}</strong></div><div class="detail-cell"><span>Korunacak rezerv</span><strong>${money(budget.reserveAmount)}</strong></div><div class="detail-cell"><span>Planlanan harcama</span><strong>${money(budget.plannedSpending)}</strong></div><div class="detail-cell"><span>Tahmini kalan</span><strong>${money(budget.estimatedTreasuryAfter)}</strong></div></div><p>${escapeHtml(budget.reasoning || "Bütçe açıklaması yok.")}</p></section><section class="ai-plan-section"><div class="section-head"><strong>Bina yatırımları</strong><span>${number(plan.constructionPlan?.length)}</span></div><div class="ai-order-list">${construction}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Asker alımı</strong><span>${number(plan.recruitmentPlan?.length)}</span></div><div class="ai-order-list">${recruitment}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Gemi üretimi</strong><span>${number(plan.shipbuildingPlan?.length)}</span></div><div class="ai-order-list">${shipbuilding}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Hex hareket planı</strong><span>${number(plan.movementPlan?.length)}</span></div><div class="ai-order-list">${movements}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Savaş ve harekât planları</strong><span>${number(plan.warPlans?.length)}</span></div><div class="ai-order-list">${wars}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Diğer önerilen hamleler</strong><span>${number(plan.orders?.length)}</span></div><div class="ai-order-list">${orders}</div></section><section class="ai-plan-section"><div class="section-head"><strong>Aktif savaş kararları</strong><span>${number(plan.battlePolicies?.length)}</span></div><div class="ai-order-list">${policies}</div></section><div class="ai-plan-two-columns"><section class="ai-plan-section"><h3>Riskler</h3>${list(plan.risks, "Belirtilen risk yok.")}</section><section class="ai-plan-section"><h3>Sonraki tur hedefleri</h3>${list(plan.nextTurnGoals, "Sonraki tur hedefi yok.")}</section></div>${validationErrors.length ? `<section class="ai-plan-section error"><h3>Doğrulama hataları</h3>${list(validationErrors, "")}</section>` : ""}<label>İnceleme notu<textarea id="ai-review-note" maxlength="2000" rows="3" placeholder="Neden uygun bulduğunu veya reddettiğini yazabilirsin.">${escapeHtml(record.review_note || "")}</textarea></label>${reviewable ? `<div class="ai-review-actions"><button type="button" class="button danger" data-ai-review="REJECT">Reddet</button><button type="button" class="button primary" data-ai-review="APPROVE" ${record.validation?.valid ? "" : "disabled"}>Manuel uygulamaya uygun</button></div>` : ""}`, async () => closeEditor());
  document.getElementById("editor-save").textContent = "Kapat";
  document.querySelectorAll("[data-ai-review]").forEach((button) => button.addEventListener("click", async () => {
    const decision = button.dataset.aiReview;
    button.disabled = true;
    try {
      await api(`/api/admin/ai-governance/plans/${record.id}/review`, { method: "POST", body: JSON.stringify({ decision, note: document.getElementById("ai-review-note").value }) });
      closeEditor();
      toast(decision === "APPROVE" ? "Plan manuel uygulamaya uygun işaretlendi; hiçbir oyun emri uygulanmadı." : "Plan reddedildi; hiçbir oyun emri uygulanmadı.");
      await aiGovernancePage();
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
    closeEditor(); toast(`${country.name} AI profili kaydedildi; otomatik emir yürütme kapalı kaldı.`); await aiGovernancePage();
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
  state.editor = { submit };
  document.getElementById("editor-title").textContent = title;
  document.getElementById("editor-subtitle").textContent = subtitle || "";
  document.getElementById("editor-content").innerHTML = content;
  document.getElementById("editor-error").hidden = true;
  const saveButton = document.getElementById("editor-save");
  saveButton.hidden = typeof submit !== "function";
  saveButton.disabled = false;
  saveButton.textContent = "Değişiklikleri kaydet";
  editorModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  editorModal.hidden = true;
  state.editor = null;
  document.body.style.overflow = "";
}

function openCountryEditor(country) {
  if (!country) return;
  openEditor("Devleti düzenle", country.name, `<div class="form-grid"><label>Devlet adı<input id="edit-country-name" value="${escapeHtml(country.name)}" required minlength="2" maxlength="80"></label><label>Hazine<input id="edit-country-treasury" type="number" min="0" step="1" value="${Number(country.treasury)}" required></label></div><label>Seferberlik<select id="edit-country-mobilization"><option value="PEACE" ${selected("PEACE", country.mobilization)}>Barış</option><option value="PARTIAL" ${selected("PARTIAL", country.mobilization)}>Kısmi</option><option value="GENERAL" ${selected("GENERAL", country.mobilization)}>Genel</option></select></label>`, async () => {
    await api(`/api/admin/countries/${country.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-country-name").value, treasury: Number(document.getElementById("edit-country-treasury").value), mobilization: document.getElementById("edit-country-mobilization").value }) });
    closeEditor(); toast("Devlet bilgileri güncellendi."); await countries();
  });
}

function openSettlementEditor(settlement) {
  if (!settlement) return;
  const religions = state.religionCatalog || [];
  const religionOptions = religions.map((item) => `<option value="${item.value}" ${selected(item.value, settlement.religion_key)}>${escapeHtml(item.label)} — ${escapeHtml(item.secondaryLabel)}</option>`).join("");
  openEditor("Yerleşkeyi düzenle", `${settlement.country_name} · ${settlement.name}`, `<div class="form-grid"><label>Yerleşke adı<input id="edit-settlement-name" value="${escapeHtml(settlement.name)}" required minlength="2" maxlength="80"></label><label>Yerel hazine<input id="edit-settlement-treasury" type="number" min="0" step="1" value="${Number(settlement.local_treasury)}" required></label><label>Özgür nüfus<input id="edit-settlement-population" type="number" min="0" step="1" value="${Number(settlement.population)}" required></label><label>Köle nüfusu<input id="edit-settlement-slaves" type="number" min="0" step="1" value="${Number(settlement.slave_population)}" required></label><label>Vergi oranı (%)<input id="edit-settlement-tax-rate" type="number" min="0" max="100" step="0.001" value="${Number(settlement.tax_rate_percent ?? 3)}" required><small>Alım turunda halk vergisi bu oran × özgür nüfus olarak hesaplanır.</small></label><label>Temel kara ticareti<input id="edit-settlement-land-trade" type="number" min="0" step="1" value="${Number(settlement.base_land_trade_income)}" required></label><label>Ana din<select id="edit-settlement-religion">${religionOptions}</select></label><label>Din bağlılığı (%)<input id="edit-settlement-religion-adherence" type="number" min="0" max="100" step="0.01" value="${Number(settlement.religion_adherence_percent ?? 75)}" required><small>%80+ tam, %50–79 yarım, %50 altı ana dinin yerel etkisini vermez. Kalan oran seçilen dine bağlı ikinci mezhebe otomatik atanır; ikinci mezhep %25’te tam, %10–24’te yarım etki verir.</small></label><label>Haraplık<select id="edit-settlement-ruin"><option value="0" ${selected(0, settlement.ruin_stage)}>Normal</option><option value="1" ${selected(1, settlement.ruin_stage)}>Harap I</option><option value="2" ${selected(2, settlement.ruin_stage)}>Harap II</option></select></label><div class="check-grid"><label class="check"><input id="edit-settlement-coastal" type="checkbox" ${settlement.is_coastal ? "checked" : ""}> Kıyı yerleşkesi</label><label class="check"><input id="edit-settlement-conquered" type="checkbox" ${settlement.is_conquered ? "checked" : ""}> Fethedilmiş</label></div></div>`, async () => {
    await api(`/api/admin/settlements/${settlement.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-settlement-name").value, population: Number(document.getElementById("edit-settlement-population").value), slavePopulation: Number(document.getElementById("edit-settlement-slaves").value), localTreasury: Number(document.getElementById("edit-settlement-treasury").value), taxRatePercent: Number(document.getElementById("edit-settlement-tax-rate").value), baseLandTradeIncome: Number(document.getElementById("edit-settlement-land-trade").value), religionKey: document.getElementById("edit-settlement-religion").value, religionAdherencePercent: Number(document.getElementById("edit-settlement-religion-adherence").value), ruinStage: Number(document.getElementById("edit-settlement-ruin").value), isCoastal: document.getElementById("edit-settlement-coastal").checked, isConquered: document.getElementById("edit-settlement-conquered").checked }) });
    closeEditor(); toast("Yerleşke ekonomisi, dini ve durumu güncellendi."); await settlementsPage();
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
    closeEditor(); toast("Karakter bilgileri güncellendi."); await charactersPage();
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
  openEditor("Orduyu düzenle", `${army.country_name} · ${army.name}`, `<div class="form-grid"><label>Ordu adı<input id="edit-army-name" value="${escapeHtml(army.name)}" required minlength="2" maxlength="60"></label><label>Komutan<select id="edit-army-commander">${commanderOptions}</select></label></div>${active ? `<div class="preview-warning"><strong>Aktif ${escapeHtml(terrainLabels[army.active_battle_terrain] || army.active_battle_terrain)} savaşı</strong><span>Asker azaltmaları savaş formuna da anında işlenir. Aktif savaş bitmeden asker eklenemez.</span></div>` : ""}<div class="section-title"><h2>Birlikler</h2><span>Yeni miktarı yaz</span></div><div class="army-unit-editor">${data.units.map((unit, index) => `<div class="army-unit-line"><div><strong>${escapeHtml(state.catalog.find((item) => item.value === unit.unit_type)?.label || unit.unit_type)}</strong><small>${escapeHtml(unit.settlement_name || "Köken yok")}</small></div><input class="edit-army-unit" type="number" min="0" step="1" value="${Number(unit.quantity)}" data-original="${Number(unit.quantity)}" data-settlement="${unit.settlement_id}" data-unit="${unit.unit_type}" aria-label="Yeni miktar ${index + 1}"></div>`).join("") || '<div class="empty">Bu orduda birlik yok.</div>'}</div>${active ? "" : `<div class="section-title"><h2>Yeni birlik ekle</h2><span>Yönetici eklemesi stok kaydını da tamamlar</span></div><div class="form-grid"><label>Köken yerleşke<select id="edit-army-new-settlement">${settlementOptions}</select></label><label>Birlik türü<select id="edit-army-new-unit">${unitOptions}</select></label><label>Miktar<input id="edit-army-new-quantity" type="number" min="0" step="1" value="0"></label></div>`}`, async () => {
    await api(`/api/admin/armies/${armyId}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-army-name").value, commanderId: document.getElementById("edit-army-commander").value || null }) });
    for (const input of document.querySelectorAll(".edit-army-unit")) {
      const quantity = Number(input.value);
      if (quantity !== Number(input.dataset.original)) await api("/api/admin/army-units", { method: "POST", body: JSON.stringify({ armyId, settlementId: input.dataset.settlement, unitType: input.dataset.unit, quantity }) });
    }
    const newQuantity = Number(document.getElementById("edit-army-new-quantity")?.value || 0);
    if (newQuantity > 0) await api("/api/admin/army-units", { method: "POST", body: JSON.stringify({ armyId, settlementId: document.getElementById("edit-army-new-settlement").value, unitType: document.getElementById("edit-army-new-unit").value, quantity: newQuantity }) });
    closeEditor(); toast(active ? "Ordu ve aktif savaş mevcudu güncellendi." : "Ordu güncellendi.");
    const route = document.querySelector("[data-route].active")?.dataset.route || "armies";
    await navigate(route);
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

async function auditPage() {
  setActiveRoute("audit"); loading();
  const rows = await api("/api/audit?limit=150");
  page.innerHTML = `<div class="page-head"><div><h1>İşlem Geçmişi</h1><p>Discord ve panel üzerinden yapılan son yönetici işlemleri</p></div><button class="button" data-refresh-audit>Yenile</button></div><section class="card">${auditRows(rows)}</section>`;
  document.querySelector("[data-refresh-audit]").addEventListener("click", auditPage);
}

function bindPageActions() {
  document.querySelectorAll("[data-open-army]").forEach((button) => button.addEventListener("click", () => openArmyModal(button.dataset.defaultCountry)));
  document.querySelectorAll("[data-country]").forEach((button) => button.addEventListener("click", () => countryDetail(button.dataset.country)));
  document.querySelectorAll("[data-route-action]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.routeAction)));
}

async function navigate(route) {
  try {
    if (route === "overview") return overview();
    if (route === "countries") return countries();
    if (route === "settlements") return settlementsPage();
    if (route === "armies") return forcesPage();
    if (route === "characters") return charactersPage();
    if (route === "dynasties") return dynastiesPage();
    if (route === "assignments") return assignmentsPage();
    if (route === "ai-governance") return aiGovernancePage();
    if (route === "battles") return battlesPage();
    if (route === "audit") return auditPage();
    return overview();
  } catch (error) { showPageError(error); }
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

let searchTimer;
document.getElementById("global-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  const query = event.target.value.trim();
  const results = document.getElementById("search-results");
  if (query.length < 2) { results.hidden = true; return; }
  searchTimer = setTimeout(async () => {
    try {
      const rows = await api(`/api/search?q=${encodeURIComponent(query)}`);
      results.innerHTML = rows.length ? rows.map((row) => `<button class="search-result" data-search-type="${row.type}" data-search-id="${row.id}"><span><strong>${escapeHtml(row.label)}</strong><br><small>${escapeHtml(row.detail)}</small></span><small>${escapeHtml(row.type)}</small></button>`).join("") : '<div class="empty">Sonuç bulunamadı.</div>';
      results.hidden = false;
      results.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        results.hidden = true; event.target.value = "";
        if (button.dataset.searchType === "COUNTRY") countryDetail(button.dataset.searchId);
        else toast("Bu kayıt türünün ayrıntı ekranı sonraki panel paketinde açılacak.", "error");
      }));
    } catch (error) { toast(error.message, "error"); }
  }, 250);
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
