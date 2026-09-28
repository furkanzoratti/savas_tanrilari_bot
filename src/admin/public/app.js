const state = { session: null, csrf: "", countries: [], catalog: [], previewToken: null, selectedCountry: null };
const page = document.getElementById("page");
const app = document.getElementById("app");
const login = document.getElementById("login");
const modal = document.getElementById("army-modal");

const number = (value) => Number(value || 0).toLocaleString("tr-TR");
const money = (value) => `${number(value)} Altın`;
const date = (value) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

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
  return rows.slice(0, limit).map((row) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(row.action)}</strong><span>${escapeHtml(row.entity_type)} · ${date(row.created_at)} · ${escapeHtml(row.actor_user_id)}</span></div></div>`).join("");
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
  page.innerHTML = `<div class="page-head"><div><h1>Devletler</h1><p>Aktif ve yok edilmiş bütün devlet kayıtları</p></div><button class="button primary" data-open-army>＋ Yeni ordu</button></div><section class="card table-wrap"><table><thead><tr><th>Devlet</th><th>Durum</th><th>Yerleşke</th><th>Ordu</th><th>Filo</th><th>Hazine</th></tr></thead><tbody>${state.countries.map((country) => `<tr data-country-id="${country.id}"><td><strong>${escapeHtml(country.name)}</strong></td><td><span class="pill ${country.status === "ACTIVE" ? "" : "neutral"}">${escapeHtml(country.status)}</span></td><td>${number(country.settlement_count)}</td><td>${number(country.army_count)}</td><td>${number(country.fleet_count)}</td><td>${money(country.treasury)}</td></tr>`).join("")}</tbody></table></section>`;
  bindPageActions();
  document.querySelectorAll("tr[data-country-id]").forEach((row) => row.addEventListener("click", () => countryDetail(row.dataset.countryId)));
}

async function countryDetail(id) {
  loading();
  const data = await api(`/api/countries/${id}`);
  state.selectedCountry = data;
  const totalPopulation = data.settlements.reduce((sum, item) => sum + Number(item.population), 0);
  const totalArmy = data.armies.reduce((sum, item) => sum + Number(item.total), 0);
  page.innerHTML = `<div class="page-head"><div><span class="pill">${escapeHtml(data.country.status)}</span><h1 style="margin-top:10px">${escapeHtml(data.country.name)}</h1><p>${number(data.settlements.length)} yerleşke · ${number(data.armies.length)} ordu · ${number(data.fleets.length)} filo</p></div><div class="actions"><button class="button" data-back-countries>← Devletler</button><button class="button primary" data-open-army data-default-country="${data.country.id}">＋ Ordu oluştur</button></div></div>
    <section class="detail-grid"><div class="detail-cell"><span>Hazine</span><strong>${money(data.country.treasury)}</strong></div><div class="detail-cell"><span>Toplam nüfus</span><strong>${number(totalPopulation)}</strong></div><div class="detail-cell"><span>Ordu mevcudu</span><strong>${number(totalArmy)}</strong></div><div class="detail-cell"><span>Seferberlik</span><strong>${escapeHtml(data.country.mobilization)}</strong></div></section>
    <div class="tabs"><button class="active">Yerleşkeler</button><button>Ordular</button><button>Filolar</button><button>Karakterler</button></div>
    <section class="card table-wrap"><table><thead><tr><th>Yerleşke</th><th>Nüfus</th><th>Hazine</th><th>Kaynak</th><th>Kara ticareti</th><th>Asker stoku</th></tr></thead><tbody>${data.settlements.map((settlement) => `<tr><td><strong>${escapeHtml(settlement.name)}</strong>${settlement.is_conquered ? '<small class="muted"> · Fethedildi</small>' : ""}</td><td>${number(settlement.population)}</td><td>${money(settlement.local_treasury)}</td><td>${escapeHtml(settlement.resource_type || "—")}</td><td>${money(settlement.base_land_trade_income)}</td><td>${number(settlement.army_stock)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Yerleşke bulunmuyor.</td></tr>'}</tbody></table></section>
    <section class="content-grid"><div class="card"><div class="card-head"><div><h3>Ordular</h3><p>Birlik ve köken dağılımı</p></div></div>${data.armies.map((army) => `<div class="data-row"><div><strong>${escapeHtml(army.name)}</strong><small>${escapeHtml(army.commander_name || "Komutan atanmamış")}</small></div><span>${number(army.total)} asker</span><span>Tur ${number(army.created_turn)}</span><span class="pill neutral">Aktif</span></div>`).join("") || '<div class="empty">Henüz ordu yok.</div>'}</div><aside class="card"><div class="card-head"><div><h3>Karakterler</h3><p>Yaşayan ve ölü kayıtlar</p></div></div>${data.characters.slice(0, 7).map((character) => `<div class="audit-item"><span class="audit-dot"></span><div><strong>${escapeHtml(character.name)}</strong><span>${escapeHtml(character.role)} · Sv${number(character.level)} · ${escapeHtml(character.status)}</span></div></div>`).join("") || '<div class="empty">Karakter yok.</div>'}</aside></section>`;
  bindPageActions();
  document.querySelector("[data-back-countries]").addEventListener("click", countries);
}

async function auditPage() {
  setActiveRoute("audit"); loading();
  const rows = await api("/api/audit?limit=150");
  page.innerHTML = `<div class="page-head"><div><h1>İşlem Geçmişi</h1><p>Discord ve panel üzerinden yapılan son yönetici işlemleri</p></div><button class="button" data-refresh-audit>Yenile</button></div><section class="card">${auditRows(rows)}</section>`;
  document.querySelector("[data-refresh-audit]").addEventListener("click", auditPage);
}

function placeholder(route) {
  setActiveRoute(route);
  const labels = { settlements: "Yerleşkeler", armies: "Ordular & Filolar", characters: "Karakterler", battles: "Savaşlar" };
  page.innerHTML = `<div class="page-head"><div><h1>${labels[route]}</h1><p>Bu bölüm bir sonraki panel paketinde ayrıntılı düzenleme araçlarına kavuşacak.</p></div></div><section class="card empty">Veriler şimdilik genel arama ve devlet ayrıntısı üzerinden görüntülenebilir.</section>`;
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
    if (route === "audit") return auditPage();
    return placeholder(route);
  } catch (error) { page.innerHTML = `<div class="card error">${escapeHtml(error.message)}</div>`; }
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
