const state = { session: null, csrf: "", countries: [], catalog: [], characterCatalog: null, previewToken: null, selectedCountry: null, editor: null };
const page = document.getElementById("page");
const app = document.getElementById("app");
const login = document.getElementById("login");
const modal = document.getElementById("army-modal");
const editorModal = document.getElementById("editor-modal");

const number = (value) => Number(value || 0).toLocaleString("tr-TR");
const money = (value) => `${number(value)} Altın`;
const date = (value) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
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
  DIPLOMAT_INTEGRATE: "Vassal entegrasyonu"
};
const assignmentLabel = (value) => assignmentLabels[value] || String(value || "Görevsiz").replaceAll("_", " ");
const operationLabels = {
  LOCAL_TRADE: "Yerel ticaret", FOREIGN_CONCESSION: "Yabancı ticaret imtiyazı", PURCHASE_AGENT: "Satın alma görevlisi",
  BLACK_MARKET: "Karaborsa faaliyeti", RECONCILIATION: "Halkla uzlaşma", CULTURE_CHANGE: "Kültür değiştirme",
  VASSALIZE: "Diplomatik vassallaştırma", VASSAL_INTEGRATION: "Vassal entegrasyonu",
  ECONOMIC: "Ekonomik casusluk", MILITARY: "Askerî casusluk", PUBLIC: "Kamu casusluğu",
  NAVAL: "Deniz casusluğu", CONSTRUCTION: "İnşaat casusluğu", DISCREDIT: "İtibarsızlaştırma",
  KIDNAP: "Kaçırma", ASSASSINATE: "Suikast", SUPPLY_COLLAPSE: "İkmal çökertme", DESERTION: "Firar kışkırtma"
};
const operationStatusLabels = {
  PENDING_ACCEPTANCE: "Onay bekliyor", TRAVELING: "İntikal ediyor", ACTIVE: "Aktif",
  CONTROLLED: "Denetimli", PAUSED: "Beklemede"
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
  document.getElementById("turn-badge").textContent = `Tur ${data.guild.current_turn} · ${data.guild.turn_phase === "OPEN" ? "Açık" : data.guild.turn_phase}`;
  page.innerHTML = `<div class="page-head"><div><h1>Genel Bakış</h1><p>Canlı oyun durumu ve sık kullanılan yönetici işlemleri</p></div><div class="actions"><button class="button" data-open-army>＋ Yeni ordu</button><button class="button primary" data-route-action="audit">İşlem geçmişi</button></div></div>
    <section class="kpi-grid"><div class="card kpi"><span>Aktif devlet</span><strong>${number(data.counts.countries)}</strong><small class="muted">${number(data.counts.settlements)} yerleşke</small></div><div class="card kpi"><span>Aktif savaş</span><strong>${number(data.counts.battles)}</strong><small class="muted">Devam eden tüm cepheler</small></div><div class="card kpi"><span>Ordu ve filo</span><strong>${number(data.counts.armies + data.counts.fleets)}</strong><small class="muted">${number(data.counts.armies)} ordu · ${number(data.counts.fleets)} filo</small></div><div class="card kpi"><span>Son 24 saat</span><strong>${number(data.counts.reviews)}</strong><small class="muted">Denetim kaydı</small></div></section>
    <section class="content-grid"><div class="card"><div class="card-head"><div><h2>Devlet durumu</h2><p>Askerî hareketliliğe göre öne çıkan kayıtlar</p></div><button class="button" data-route-action="countries">Tümünü gör</button></div><div class="data-list">${data.countries.map((country) => `<div class="data-row"><div><strong>${escapeHtml(country.name)}</strong><small>${number(country.settlement_count)} yerleşke · ${number(country.army_count)} ordu</small></div><span>${number(country.personnel)} asker</span><span>${money(country.treasury)}</span><button class="button" data-country="${country.id}">Aç</button></div>`).join("")}</div></div>
    <aside class="card"><div class="card-head"><div><h3>Hızlı işlemler</h3><p>Sık kullanılan GM araçları</p></div></div><div class="quick-actions"><button class="button" data-open-army>⚔ Yeni ordu oluştur</button><button class="button" data-route-action="countries">♜ Devlet ve şehirleri aç</button><button class="button" data-route-action="audit">↶ Son değişiklikleri incele</button></div><hr><div class="card-head"><div><h3>Son kayıtlar</h3></div></div>${auditRows(data.audit, 5)}</aside></section>`;
  bindPageActions();
}

async function countries() {
  setActiveRoute("countries"); loading();
  state.countries = await api("/api/countries");
  page.innerHTML = `<div class="page-head"><div><h1>Devletler</h1><p>Aktif ve yok edilmiş bütün devlet kayıtları</p></div><button class="button primary" data-open-army>＋ Yeni ordu</button></div><section class="card table-wrap"><table><thead><tr><th>Devlet</th><th>Durum</th><th>Yerleşke</th><th>Ordu</th><th>Filo</th><th>Hazine</th><th></th></tr></thead><tbody>${state.countries.map((country) => `<tr data-country-id="${country.id}"><td><strong>${escapeHtml(country.name)}</strong></td><td><span class="pill ${country.status === "ACTIVE" ? "" : "neutral"}">${escapeHtml(country.status)}</span></td><td>${number(country.settlement_count)}</td><td>${number(country.army_count)}</td><td>${number(country.fleet_count)}</td><td>${money(country.treasury)}</td><td>${country.status === "ACTIVE" ? `<button class="button compact" data-edit-country="${country.id}">Düzenle</button>` : ""}</td></tr>`).join("")}</tbody></table></section>`;
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
  const data = await api(`/api/countries/${id}`);
  state.selectedCountry = data;
  const totalPopulation = data.settlements.reduce((sum, item) => sum + Number(item.population) + Number(item.slave_population), 0);
  const totalArmy = data.armies.reduce((sum, item) => sum + Number(item.total), 0);
  page.innerHTML = `<div class="page-head"><div><span class="pill">${escapeHtml(data.country.status)}</span><h1 style="margin-top:10px">${escapeHtml(data.country.name)}</h1><p>${number(data.settlements.length)} yerleşke · ${number(data.armies.length)} ordu · ${number(data.fleets.length)} filo</p></div><div class="actions"><button class="button" data-back-countries>← Devletler</button><button class="button primary" data-open-army data-default-country="${data.country.id}">＋ Ordu oluştur</button></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Hazine</span><strong>${money(data.country.treasury)}</strong></div><div class="detail-cell"><span>Toplam nüfus</span><strong>${number(totalPopulation)}</strong></div><div class="detail-cell"><span>Ordu mevcudu</span><strong>${number(totalArmy)}</strong></div><div class="detail-cell"><span>Seferberlik</span><strong>${escapeHtml(data.country.mobilization)}</strong></div></section>
    <div class="section-title"><h2>Yerleşkeler</h2><span>${number(data.settlements.length)} kayıt</span></div>
    <section class="card table-wrap"><table><thead><tr><th>Yerleşke</th><th>Nüfus</th><th>Köle</th><th>Hazine</th><th>Kaynak</th><th>Kara ticareti</th><th>Asker</th><th>Gemi</th></tr></thead><tbody>${data.settlements.map((settlement) => `<tr><td><strong>${escapeHtml(settlement.name)}</strong>${settlement.is_conquered ? '<small class="muted"> · Fethedildi</small>' : ""}</td><td>${number(settlement.population)}</td><td>${number(settlement.slave_population)}</td><td>${money(settlement.local_treasury)}</td><td>${escapeHtml(settlement.resource_type || "—")}</td><td>${money(settlement.base_land_trade_income)}</td><td>${number(settlement.army_stock)}</td><td>${number(settlement.ships)}</td></tr>`).join("") || '<tr><td colspan="8" class="empty">Yerleşke bulunmuyor.</td></tr>'}</tbody></table></section>
    <section class="content-grid"><div class="card"><div class="card-head"><div><h3>Ordular</h3><p>Birlik ve komutan durumu</p></div></div>${data.armies.map((army) => `<div class="data-row"><div><strong>${escapeHtml(army.name)}</strong><small>${escapeHtml(army.commander_name || "Komutan atanmamış")}</small></div><span>${number(army.total)} asker</span><span>Tur ${number(army.created_turn)}</span><span class="pill neutral">Aktif</span></div>`).join("") || '<div class="empty">Henüz ordu yok.</div>'}</div><aside class="card"><div class="card-head"><div><h3>Filolar</h3><p>Gemi ve amiral durumu</p></div></div>${data.fleets.map((fleet) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(fleet.name)}</strong><span>${escapeHtml(fleet.commander_name || "Amiral atanmamış")} · ${number(fleet.total)} gemi</span></div></div>`).join("") || '<div class="empty">Henüz filo yok.</div>'}</aside></section>
    <section class="card section-gap"><div class="card-head"><div><h3>Karakterler</h3><p>Uzmanlık, görev ve durum kayıtları</p></div></div><div class="compact-grid">${data.characters.map((character) => `<div class="record-card"><strong>${escapeHtml(character.name)}</strong><span>${character.is_admiral ? "AMİRAL" : escapeHtml(character.role)} · Sv${number(character.level)} · +${number(character.skill_bonus)}</span><small>${escapeHtml(character.status)} · ${escapeHtml(character.assignment)}${character.assigned_settlement_name ? ` · ${escapeHtml(character.assigned_settlement_name)}` : ""}${character.death_settlement_name ? ` · Ölüm: ${escapeHtml(character.death_settlement_name)}` : ""}</small></div>`).join("") || '<div class="empty">Karakter yok.</div>'}</div></section>`;
  bindPageActions();
  document.querySelector("[data-back-countries]").addEventListener("click", countries);
}

async function settlementsPage() {
  setActiveRoute("settlements"); loading();
  const rows = await api("/api/settlements");
  page.innerHTML = `<div class="page-head"><div><h1>Yerleşkeler</h1><p>Nüfus, ekonomi, vergi oranı, kaynak ve askerî stokların tamamı</p></div><span class="pill neutral">${number(rows.length)} yerleşke</span></div><section class="card table-wrap"><table><thead><tr><th>Yerleşke</th><th>Devlet</th><th>Nüfus / Köle</th><th>Yerel hazine</th><th>Vergi</th><th>Kara ticareti</th><th>Asker / Gemi</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr data-country-id="${row.country_id}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.resource_type)} · ${escapeHtml(row.culture_group)} · ${row.is_coastal ? "Kıyı" : "İç bölge"}</small></td><td>${escapeHtml(row.country_name)}</td><td>${number(row.population)} / ${number(row.slave_population)}</td><td>${money(row.local_treasury)}</td><td>%${number(row.tax_rate_percent)}</td><td>${money(row.base_land_trade_income)}</td><td>${number(row.army_stock)} / ${number(row.ships)}</td><td><span class="pill ${row.ruin_stage > 0 || row.is_conquered ? "warning" : "neutral"}">${row.ruin_stage > 0 ? `Harap ${number(row.ruin_stage)}` : row.is_conquered ? "Fethedildi" : "Normal"}</span></td><td>${row.country_status === "ACTIVE" ? `<button class="button compact" data-edit-settlement="${row.id}">Düzenle</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="9" class="empty">Yerleşke bulunmuyor.</td></tr>'}</tbody></table></section>`;
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
  const rows = await api("/api/characters");
  const alive = rows.filter((row) => row.character_status === "ACTIVE").length;
  page.innerHTML = `<div class="page-head"><div><h1>Karakterler</h1><p>Karakter adları, puanları, uzmanlıkları ve doktrinleri</p></div><div class="actions"><span class="pill">${number(alive)} aktif</span><span class="pill neutral">${number(rows.length - alive)} ölü/görevden alınmış</span></div></div><section class="card table-wrap"><table><thead><tr><th>Karakter</th><th>Devlet</th><th>Rol</th><th>Seviye / Bonus</th><th>Uzmanlık</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr data-country-id="${row.country_id}"><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.trained_settlement_name || "Köken bilinmiyor")}</small></td><td>${escapeHtml(row.country_name)}</td><td>${row.is_admiral ? "AMİRAL" : escapeHtml(row.role)}</td><td>Sv${number(row.specialization_level)} / +${number(row.skill_bonus)}</td><td>${escapeHtml(row.specialization || row.admiral_specialization || "—")}<small>${escapeHtml(row.doctrine || row.admiral_doctrine || "Doktrin yok")}</small></td><td><span class="pill ${row.character_status === "ACTIVE" ? "" : "neutral"}">${escapeHtml(row.character_status)}</span>${row.death_settlement_name ? `<small>Ölüm: ${escapeHtml(row.death_settlement_name)}</small>` : ""}</td><td>${row.character_status === "ACTIVE" ? `<button class="button compact" data-edit-character="${row.id}">Düzenle</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">Karakter bulunmuyor.</td></tr>'}</tbody></table></section>`;
  bindCountryRows();
  document.querySelectorAll("[data-edit-character]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openCharacterEditor(rows.find((item) => item.id === button.dataset.editCharacter)).catch((error) => toast(error.message, "error"));
  }));
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
    return `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.country_name)}</td><td>${row.is_admiral ? "AMİRAL" : escapeHtml(row.role)}</td><td><strong>${escapeHtml(task)}</strong><small>${escapeHtml(assignmentLabel(row.assignment))}</small></td><td>${escapeHtml(assignmentTarget(row))}</td><td><span class="pill ${row.operation_status === "PAUSED" ? "warning" : "neutral"}">${escapeHtml(status)}</span></td><td>${escapeHtml(progress)}</td><td><button class="button compact danger" data-cancel-character="${row.id}">Görevi iptal et</button></td></tr>`;
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

async function battlesPage() {
  setActiveRoute("battles"); loading();
  const [rows, sieges] = await Promise.all([api("/api/battles"), api("/api/sieges")]);
  const active = rows.filter((row) => !["FINISHED", "CANCELLED"].includes(row.status)).length;
  page.innerHTML = `<div class="page-head"><div><h1>Savaşlar</h1><p>Aktif kuşatma ordularına müdahale ve bütün savaş formlarının yönetici özeti</p></div><span class="pill">${number(active)} aktif savaş</span></div>
    <div class="section-title"><h2>Aktif Kuşatmalar ve Ordular</h2><span>${number(sieges.length)} kuşatma</span></div><section class="siege-list">${sieges.map((siege) => `<article class="card"><div class="card-head"><div><h3>${escapeHtml(siege.settlementName || "Yerleşke belirtilmemiş")}</h3><p>${escapeHtml(siege.status)} · Değerlendirme ${number(siege.roundNumber)} · ${escapeHtml(siege.siegePhase || "Hücum")}</p></div></div><div class="compact-grid">${siege.armies.map((army) => `<div class="record-card"><strong>${escapeHtml(army.countryName)} · ${escapeHtml(army.name)}</strong><span>${army.sideKey} Tarafı · ${number(army.total)} asker</span><small>${army.units.map((unit) => `${escapeHtml(unit.originName || "Köken yok")}: ${escapeHtml(unit.unitType)} ${number(unit.quantity)}`).join(" · ") || "Birlik yok"}</small><button class="button" data-edit-army="${army.id}">Askerleri düzenle</button></div>`).join("")}</div></article>`).join("") || '<div class="card empty">Aktif kuşatma bulunmuyor.</div>'}</section>
    <div class="section-title"><h2>Tüm Savaşlar</h2><span>${number(rows.length)} kayıt</span></div><section class="battle-grid">${rows.map((row) => `<article class="card battle-card"><div class="card-head"><div><h3>${escapeHtml(row.country_a_name || "A Tarafı")} — ${escapeHtml(row.country_b_name || "B Tarafı")}</h3><p>${escapeHtml(row.terrain)} · Tur ${number(row.round_number)}${row.defender_settlement_name ? ` · ${escapeHtml(row.defender_settlement_name)}` : ""}</p></div><span class="pill ${["FINISHED", "CANCELLED"].includes(row.status) ? "neutral" : ""}">${escapeHtml(row.status)}</span></div><div class="battle-sides"><div><strong>${escapeHtml(row.country_a_name || "A")}</strong><span>${number(row.current_a)} / ${number(row.initial_a)}</span><small>${number(row.losses_a)} kayıp · ${number(row.pressure_a)} baskı</small></div><div><strong>${escapeHtml(row.country_b_name || "B")}</strong><span>${number(row.current_b)} / ${number(row.initial_b)}</span><small>${number(row.losses_b)} kayıp · ${number(row.pressure_b)} baskı</small></div></div>${row.wall_max_hp ? `<div class="battle-structure">Sur ${number(row.wall_current_hp)}/${number(row.wall_max_hp)} · Kapı ${number(row.gate_current_hp)}/${number(row.gate_max_hp)}</div>` : ""}</article>`).join("") || '<div class="card empty">Savaş kaydı bulunmuyor.</div>'}</section>`;
  document.querySelectorAll("[data-edit-army]").forEach((button) => button.addEventListener("click", () => {
    openArmyEditor(button.dataset.editArmy).catch((error) => toast(error.message, "error"));
  }));
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
  openEditor("Yerleşkeyi düzenle", `${settlement.country_name} · ${settlement.name}`, `<div class="form-grid"><label>Yerleşke adı<input id="edit-settlement-name" value="${escapeHtml(settlement.name)}" required minlength="2" maxlength="80"></label><label>Yerel hazine<input id="edit-settlement-treasury" type="number" min="0" step="1" value="${Number(settlement.local_treasury)}" required></label><label>Özgür nüfus<input id="edit-settlement-population" type="number" min="0" step="1" value="${Number(settlement.population)}" required></label><label>Köle nüfusu<input id="edit-settlement-slaves" type="number" min="0" step="1" value="${Number(settlement.slave_population)}" required></label><label>Vergi oranı (%)<input id="edit-settlement-tax-rate" type="number" min="0" max="100" step="0.001" value="${Number(settlement.tax_rate_percent ?? 3)}" required><small>Alım turunda halk vergisi bu oran × özgür nüfus olarak hesaplanır.</small></label><label>Temel kara ticareti<input id="edit-settlement-land-trade" type="number" min="0" step="1" value="${Number(settlement.base_land_trade_income)}" required></label><label>Haraplık<select id="edit-settlement-ruin"><option value="0" ${selected(0, settlement.ruin_stage)}>Normal</option><option value="1" ${selected(1, settlement.ruin_stage)}>Harap I</option><option value="2" ${selected(2, settlement.ruin_stage)}>Harap II</option></select></label><div class="check-grid"><label class="check"><input id="edit-settlement-coastal" type="checkbox" ${settlement.is_coastal ? "checked" : ""}> Kıyı yerleşkesi</label><label class="check"><input id="edit-settlement-conquered" type="checkbox" ${settlement.is_conquered ? "checked" : ""}> Fethedilmiş</label></div></div>`, async () => {
    await api(`/api/admin/settlements/${settlement.id}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("edit-settlement-name").value, population: Number(document.getElementById("edit-settlement-population").value), slavePopulation: Number(document.getElementById("edit-settlement-slaves").value), localTreasury: Number(document.getElementById("edit-settlement-treasury").value), taxRatePercent: Number(document.getElementById("edit-settlement-tax-rate").value), baseLandTradeIncome: Number(document.getElementById("edit-settlement-land-trade").value), ruinStage: Number(document.getElementById("edit-settlement-ruin").value), isCoastal: document.getElementById("edit-settlement-coastal").checked, isConquered: document.getElementById("edit-settlement-conquered").checked }) });
    closeEditor(); toast("Yerleşke ekonomisi ve durumu güncellendi."); await settlementsPage();
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
  openEditor("Karakteri düzenle", `${character.country_name} · ${character.role}${admiral ? " · Amiral" : ""}`, `<div class="form-grid"><label>Karakter adı<input id="edit-character-name" value="${escapeHtml(character.name)}" required minlength="2" maxlength="80"></label><label>Puan / bonus<input id="edit-character-skill" type="number" min="0" max="100" step="1" value="${Number(character.skill_bonus)}" required></label><label>Uzmanlık<select id="edit-character-specialization">${options(specializations, character.specialization)}</select></label><label>Uzmanlık seviyesi<select id="edit-character-level"><option value="0" ${selected(0, character.specialization_level)}>Sv0</option><option value="1" ${selected(1, character.specialization_level)}>Sv1</option><option value="2" ${selected(2, character.specialization_level)}>Sv2</option><option value="3" ${selected(3, character.specialization_level)}>Sv3</option></select></label>${commander ? `<label>Komutan doktrini<select id="edit-character-doctrine">${options(catalog.commanderDoctrines, character.doctrine)}</select></label><label>Kara zaferi<input id="edit-character-victories" type="number" min="0" max="999" step="1" value="${Number(character.commander_victories || 0)}"></label>` : ""}${admiral ? `<label>Amiral uzmanlığı<select id="edit-admiral-specialization">${options(catalog.admiralSpecializations, character.admiral_specialization)}</select></label><label>Amiral uzmanlık seviyesi<select id="edit-admiral-level"><option value="0" ${selected(0, character.admiral_specialization_level)}>Sv0</option><option value="1" ${selected(1, character.admiral_specialization_level)}>Sv1</option><option value="2" ${selected(2, character.admiral_specialization_level)}>Sv2</option><option value="3" ${selected(3, character.admiral_specialization_level)}>Sv3</option></select></label><label>Amiral doktrini<select id="edit-admiral-doctrine">${options(catalog.admiralDoctrines, character.admiral_doctrine)}</select></label><label>Deniz zaferi<input id="edit-admiral-victories" type="number" min="0" max="9" step="1" value="${Number(character.admiral_victories || 0)}"></label>` : ""}</div><div class="preview-warning"><strong>Görev bağlantısı korunur.</strong><span>Ad, puan, uzmanlık ve doktrin değişir; karakter mevcut görevinden çıkarılmaz.</span></div>`, async () => {
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
  openEditor("Orduyu düzenle", `${army.country_name} · ${army.name}`, `<div class="form-grid"><label>Ordu adı<input id="edit-army-name" value="${escapeHtml(army.name)}" required minlength="2" maxlength="60"></label><label>Komutan<select id="edit-army-commander">${commanderOptions}</select></label></div>${active ? `<div class="preview-warning"><strong>Aktif ${escapeHtml(army.active_battle_terrain)} savaşı</strong><span>Asker azaltmaları savaş formuna da anında işlenir. Aktif savaş bitmeden asker eklenemez.</span></div>` : ""}<div class="section-title"><h2>Birlikler</h2><span>Yeni miktarı yaz</span></div><div class="army-unit-editor">${data.units.map((unit, index) => `<div class="army-unit-line"><div><strong>${escapeHtml(state.catalog.find((item) => item.value === unit.unit_type)?.label || unit.unit_type)}</strong><small>${escapeHtml(unit.settlement_name || "Köken yok")}</small></div><input class="edit-army-unit" type="number" min="0" step="1" value="${Number(unit.quantity)}" data-original="${Number(unit.quantity)}" data-settlement="${unit.settlement_id}" data-unit="${unit.unit_type}" aria-label="Yeni miktar ${index + 1}"></div>`).join("") || '<div class="empty">Bu orduda birlik yok.</div>'}</div>${active ? "" : `<div class="section-title"><h2>Yeni birlik ekle</h2><span>Yönetici eklemesi stok kaydını da tamamlar</span></div><div class="form-grid"><label>Köken yerleşke<select id="edit-army-new-settlement">${settlementOptions}</select></label><label>Birlik türü<select id="edit-army-new-unit">${unitOptions}</select></label><label>Miktar<input id="edit-army-new-quantity" type="number" min="0" step="1" value="0"></label></div>`}`, async () => {
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
    if (route === "assignments") return assignmentsPage();
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
