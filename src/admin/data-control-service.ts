import { z } from "zod";
import { adminConfig } from "./config.js";
import { adminPool, withAdminTransaction, type AdminDbClient } from "./db.js";

const HIDDEN_TABLES = new Set(["schema_migrations", "admin_panel_login_tokens", "admin_panel_operations"]);
const IMMUTABLE_TABLES = new Set(["audit_logs"]);
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;

interface ColumnMeta {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  defaultValue: string | null;
  generated: boolean;
  primary: boolean;
}

interface ForeignKeyMeta {
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

interface TableMeta {
  name: string;
  columns: ColumnMeta[];
  primaryKey: string[];
  foreignKeys: ForeignKeyMeta[];
  mutable: boolean;
}

interface SchemaMeta {
  tables: Map<string, TableMeta>;
  loadedAt: number;
}

let schemaCache: SchemaMeta | null = null;

const mutationSchema = z.object({
  table: z.string().regex(IDENTIFIER),
  action: z.enum(["INSERT", "UPDATE", "DELETE"]),
  key: z.record(z.string(), z.unknown()).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().min(3).max(500),
  confirmation: z.string().optional()
});

function quoteIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error("Geçersiz veri alanı.");
  return `"${value}"`;
}

function tableCategory(name: string): string {
  if (/^(guilds|countries|country_members|settlements|settlement_ownership_history)$/u.test(name)) return "Devlet ve Dünya";
  if (/^(buildings|recruitment_|naval_orders|siege_|garrison_|settlement_policies|settlement_events|settlement_income|pantheon_)/u.test(name)) return "Şehir, Üretim ve Ekonomi";
  if (/^(unit_stacks|armies|army_|fleets|fleet_|naval_units|naval_ship|mercenary_)/u.test(name)) return "Ordu, Filo ve Paralı Asker";
  if (/^(battle|state_war|peace_|land_raids|naval_raids|naval_blockades)/u.test(name)) return "Savaş ve Harekât";
  if (/^(country_alliances|country_vassalages|country_port_access|diplomatic_|pact_|trade_agreements|raw_material_)/u.test(name)) return "Diplomasi ve Ticaret";
  if (/^(country_characters|academy_|merchant_|diplomat_|missionary_|espionage_|spy_|commander_)/u.test(name)) return "Karakter ve Görevler";
  if (/^(dynast|roman_)/u.test(name)) return "Hanedan ve Roma";
  if (/^steppe_/u.test(name)) return "Bozkır Siyaseti";
  if (/^(rebel_|settlement_stability|country_war_exhaustion|rebellion_)/u.test(name)) return "İsyan ve İstikrar";
  if (/^(great_games|great_power)/u.test(name)) return "Büyük Oyunlar ve Büyük Güçler";
  if (/^(npc_|ai_)/u.test(name)) return "NPC ve Yapay Zekâ";
  if (/^(transactions|treasury_|role_|player_|processed_|character_turn|.*_runs$|.*_logs?$)/u.test(name)) return "Kayıtlar ve Otomasyon";
  return "Diğer Oyun Verileri";
}

function tableLabel(name: string): string {
  const labels: Record<string, string> = {
    countries: "Devletler",
    settlements: "Yerleşkeler",
    country_alliances: "İttifaklar",
    country_vassalages: "Vassallıklar",
    country_port_access: "Liman Erişimleri",
    trade_agreements: "Ticaret Anlaşmaları",
    diplomatic_pacts: "Diplomatik Paktlar",
    pact_memberships: "Pakt Üyelikleri",
    pact_invitations: "Pakt Davetleri",
    armies: "Ordular",
    army_units: "Ordu Birlikleri",
    fleets: "Filolar",
    fleet_units: "Filo Gemileri",
    unit_stacks: "Yerleşke Asker Havuzları",
    buildings: "Binalar",
    country_characters: "Karakterler",
    dynasties: "Hanedanlar",
    dynasty_members: "Hanedan Üyeleri",
    roman_families: "Roma Aileleri",
    roman_family_members: "Roma Aile Üyeleri",
    state_wars: "Devlet Savaşları",
    battles: "Savaş Formları",
    rebellions: "İsyanlar",
    recruitment_orders: "Asker Alım Emirleri",
    naval_orders: "Gemi Üretim Emirleri",
    academy_characters: "Akademi Karakterleri",
    missionary_assignments: "Misyoner Görevleri",
    diplomat_assignments: "Diplomat Görevleri",
    espionage_operations: "Casusluk Operasyonları",
    merchant_operations: "Tüccar Görevleri",
    audit_logs: "İşlem Geçmişi"
  };
  if (labels[name]) return labels[name]!;
  const words: Record<string, string> = {
    academy: "Akademi", actions: "İşlemleri", ai: "Yapay Zekâ", alliances: "İttifakları", army: "Ordu", armies: "Ordular",
    assignments: "Atamaları", assimilation: "Asimilasyon", auction: "Müzayede", auctions: "Müzayedeleri", ballots: "Oyları",
    battle: "Savaş", battles: "Savaşlar", bets: "Bahisleri", bids: "Teklifleri", birth: "Doğum", blockades: "Ablukaları",
    bombardments: "Bombardımanları", border: "Sınır", buildings: "Binalar", captivities: "Esaretleri", casualty: "Kayıp",
    character: "Karakter", characters: "Karakterleri", christian: "Hristiyan", commander: "Komutan", confederations: "Konfederasyonları",
    conscriptions: "Zorunlu Alımları", contracts: "Sözleşmeleri", country: "Devlet", countries: "Devletler", couple: "Çift",
    coupon: "Kupon", coupons: "Kuponları", culture: "Kültür", damage: "Hasarları", diplomat: "Diplomat", diplomatic: "Diplomatik",
    disembark: "Tahliye", dynasty: "Hanedan", elections: "Seçimleri", entries: "Katılımları", espionage: "Casusluk",
    events: "Olayları", family: "Aile", fleet: "Filo", fleets: "Filolar", formations: "Kuruluşları", games: "Oyunlar",
    garrison: "Garnizon", gladiator: "Gladyatör", gladiators: "Gladyatörleri", governance: "Yönetimi", governorships: "Valilikleri",
    great: "Büyük", hegemony: "Hanlar Hanlığı", holdings: "Mülkleri", income: "Gelir", intelligence: "İstihbarat",
    internal: "İç", invitations: "Davetleri", kurultay: "Kurultay", land: "Kara", law: "Yasa", laws: "Yasaları",
    ledger: "Defteri", loans: "Borçları", logs: "Kayıtları", marriage: "Evlilik", matches: "Karşılaşmaları", members: "Üyeleri",
    memberships: "Üyelikleri", mercenary: "Paralı Asker", merchant: "Tüccar", missionary: "Misyoner", money: "Parası",
    naval: "Deniz", npc: "NPC", office: "Makam", operations: "Operasyonları", orders: "Emirleri", ownership: "Mülkiyet",
    pact: "Pakt", pacts: "Paktları", pantheon: "Panteon", participants: "Katılımcıları", peace: "Barış", player: "Oyuncu",
    points: "Puanları", policies: "Politikaları", political: "Siyasi", positions: "Konumları", power: "Güç", profiles: "Profilleri",
    progress: "İlerlemesi", proposals: "Teklifleri", raids: "Yağmaları", recruitment: "Asker Alımı", religion: "Din",
    repair: "Tamir", reports: "Raporları", republic: "Cumhuriyet", resolutions: "Sonuçları", responses: "Yanıtları",
    rolls: "Zarları", roman: "Roma", rounds: "Turları", senate: "Senato", settlement: "Yerleşke", settlements: "Yerleşkeler",
    ships: "Gemileri", siege: "Kuşatma", sides: "Tarafları", snapshots: "Anlık Görüntüleri", special: "Özel", stability: "İstikrar",
    state: "Devlet", steppe: "Bozkır", title: "Unvan", titles: "Unvanları", trade: "Ticaret", training: "Eğitim",
    transactions: "İşlemler", transfer: "Aktarım", transfers: "Aktarımları", treasury: "Hazine", tribute: "Haraç",
    units: "Birlikleri", unlocks: "Yetkileri", usage: "Kullanımı", vassalages: "Vassallıkları", victories: "Zaferleri",
    votes: "Oyları", wallet: "Cüzdan", wallets: "Cüzdanları", war: "Savaş", wars: "Savaşları"
  };
  return name.split("_").map((part) => words[part] ?? (part ? `${part[0]!.toLocaleUpperCase("tr-TR")}${part.slice(1)}` : part)).join(" ");
}

function referenceForColumn(table: TableMeta, columnName: string): ForeignKeyMeta | null {
  return table.foreignKeys.find((foreignKey) => foreignKey.column === columnName) ?? null;
}

function labelColumns(table: TableMeta): string[] {
  const preferred = ["name", "display_name", "title", "full_name", "label", "unit_type", "code", "status"];
  const available = preferred.filter((name) => table.columns.some((column) => column.name === name));
  return available.length ? available.slice(0, 2) : table.primaryKey.slice(0, 1);
}

function referenceLabelSql(table: TableMeta, alias: string): string {
  const columns = labelColumns(table);
  if (!columns.length) return `'Kayıt'`;
  if (columns.length === 1) return `COALESCE(NULLIF(${alias}.${quoteIdentifier(columns[0]!)}::text,''),'Kayıt')`;
  return `concat_ws(' · ',NULLIF(${alias}.${quoteIdentifier(columns[0]!)}::text,''),NULLIF(${alias}.${quoteIdentifier(columns[1]!)}::text,''))`;
}

async function schema(force = false): Promise<SchemaMeta> {
  if (!force && schemaCache && Date.now() - schemaCache.loadedAt < 60_000) return schemaCache;
  const [columnsResult, primaryResult, foreignResult] = await Promise.all([
    adminPool.query<{
      table_name: string; column_name: string; data_type: string; udt_name: string; is_nullable: "YES" | "NO";
      column_default: string | null; is_identity: "YES" | "NO"; is_generated: string;
    }>(`SELECT column_info.table_name,column_info.column_name,column_info.data_type,column_info.udt_name,column_info.is_nullable,
               column_info.column_default,column_info.is_identity,column_info.is_generated
          FROM information_schema.columns column_info
          JOIN information_schema.tables table_info ON table_info.table_schema=column_info.table_schema AND table_info.table_name=column_info.table_name
         WHERE column_info.table_schema='public' AND table_info.table_type='BASE TABLE'
         ORDER BY column_info.table_name,column_info.ordinal_position`),
    adminPool.query<{ table_name: string; column_name: string; ordinal_position: number }>(
      `SELECT constraint_info.table_name,key_column.column_name,key_column.ordinal_position
         FROM information_schema.table_constraints constraint_info
         JOIN information_schema.key_column_usage key_column
           ON key_column.constraint_schema=constraint_info.constraint_schema AND key_column.constraint_name=constraint_info.constraint_name
        WHERE constraint_info.table_schema='public' AND constraint_info.constraint_type='PRIMARY KEY'
        ORDER BY constraint_info.table_name,key_column.ordinal_position`
    ),
    adminPool.query<{ table_name: string; column_name: string; foreign_table_name: string; foreign_column_name: string }>(
      `SELECT constraint_info.table_name,key_column.column_name,
              foreign_column.table_name AS foreign_table_name,foreign_column.column_name AS foreign_column_name
         FROM information_schema.table_constraints constraint_info
         JOIN information_schema.key_column_usage key_column
           ON key_column.constraint_schema=constraint_info.constraint_schema AND key_column.constraint_name=constraint_info.constraint_name
         JOIN information_schema.constraint_column_usage foreign_column
           ON foreign_column.constraint_schema=constraint_info.constraint_schema AND foreign_column.constraint_name=constraint_info.constraint_name
        WHERE constraint_info.table_schema='public' AND constraint_info.constraint_type='FOREIGN KEY'`
    )
  ]);

  const primaryByTable = new Map<string, string[]>();
  for (const row of primaryResult.rows) {
    const columns = primaryByTable.get(row.table_name) ?? [];
    columns.push(row.column_name);
    primaryByTable.set(row.table_name, columns);
  }
  const foreignByTable = new Map<string, ForeignKeyMeta[]>();
  for (const row of foreignResult.rows) {
    const keys = foreignByTable.get(row.table_name) ?? [];
    keys.push({ column: row.column_name, foreignTable: row.foreign_table_name, foreignColumn: row.foreign_column_name });
    foreignByTable.set(row.table_name, keys);
  }
  const tables = new Map<string, TableMeta>();
  for (const row of columnsResult.rows) {
    if (HIDDEN_TABLES.has(row.table_name)) continue;
    let table = tables.get(row.table_name);
    if (!table) {
      table = {
        name: row.table_name,
        columns: [],
        primaryKey: primaryByTable.get(row.table_name) ?? [],
        foreignKeys: foreignByTable.get(row.table_name) ?? [],
        mutable: !IMMUTABLE_TABLES.has(row.table_name)
      };
      tables.set(row.table_name, table);
    }
    table.columns.push({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === "YES",
      defaultValue: row.column_default,
      generated: row.is_identity === "YES" || row.is_generated !== "NEVER",
      primary: table.primaryKey.includes(row.column_name)
    });
  }
  schemaCache = { tables, loadedAt: Date.now() };
  return schemaCache;
}

function findScopePath(meta: SchemaMeta, tableName: string): ForeignKeyMeta[] | null {
  const queue: Array<{ tableName: string; path: ForeignKeyMeta[] }> = [{ tableName, path: [] }];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.tableName)) continue;
    visited.add(current.tableName);
    const table = meta.tables.get(current.tableName);
    if (!table) continue;
    if (table.columns.some((column) => column.name === "guild_id") || current.tableName === "guilds") return current.path;
    for (const foreignKey of table.foreignKeys) {
      if (!visited.has(foreignKey.foreignTable)) queue.push({ tableName: foreignKey.foreignTable, path: [...current.path, foreignKey] });
    }
  }
  return null;
}

function scopeExpression(meta: SchemaMeta, tableName: string, alias: string, parameter: number): string | null {
  const table = meta.tables.get(tableName);
  if (!table) return null;
  if (tableName === "guilds") return `${alias}."discord_id"=$${parameter}`;
  if (table.columns.some((column) => column.name === "guild_id")) return `${alias}."guild_id"=$${parameter}`;
  const path = findScopePath(meta, tableName);
  if (!path?.length) return null;
  const nested = (index: number, parentAlias: string): string => {
    const edge = path[index]!;
    const childAlias = `scope_${index}`;
    const targetTable = meta.tables.get(edge.foreignTable)!;
    const relation = `${childAlias}.${quoteIdentifier(edge.foreignColumn)}=${parentAlias}.${quoteIdentifier(edge.column)}`;
    let target: string;
    if (edge.foreignTable === "guilds") target = `${childAlias}."discord_id"=$${parameter}`;
    else if (targetTable.columns.some((column) => column.name === "guild_id")) target = `${childAlias}."guild_id"=$${parameter}`;
    else target = nested(index + 1, childAlias);
    return `EXISTS(SELECT 1 FROM ${quoteIdentifier(edge.foreignTable)} ${childAlias} WHERE ${relation} AND ${target})`;
  };
  return nested(0, alias);
}

function assertTable(meta: SchemaMeta, tableName: string): TableMeta {
  const table = meta.tables.get(tableName);
  if (!table) throw new Error("Bu oyun veri tablosu bulunamadı veya panel erişimine kapalı.");
  return table;
}

function normalizeValues(table: TableMeta, rawValues: Record<string, unknown>, insert: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, rawValue] of Object.entries(rawValues)) {
    const column = table.columns.find((item) => item.name === name);
    if (!column || column.generated || (!insert && column.primary)) continue;
    if (rawValue === null) {
      if (!column.nullable) throw new Error(`${name} alanı boş bırakılamaz.`);
      result[name] = null;
      continue;
    }
    if (column.dataType === "json" || column.dataType === "jsonb") {
      result[name] = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    } else if (column.dataType === "boolean") {
      result[name] = rawValue === true || rawValue === "true";
    } else if (["smallint", "integer", "real", "double precision", "numeric", "decimal"].includes(column.dataType)) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) throw new Error(`${name} sayısal bir değer olmalıdır.`);
      result[name] = value;
    } else if (column.dataType === "bigint") {
      if (!/^-?\d+$/u.test(String(rawValue))) throw new Error(`${name} tam sayı olmalıdır.`);
      result[name] = String(rawValue);
    } else {
      result[name] = rawValue;
    }
  }
  return result;
}

function rowKey(table: TableMeta, row: Record<string, unknown>): Record<string, unknown> {
  if (table.primaryKey.length) return Object.fromEntries(table.primaryKey.map((column) => [column, row[column]]));
  return { __ctid: row.__ctid };
}

function keyWhere(table: TableMeta, rawKey: Record<string, unknown>, startParameter: number): { sql: string; params: unknown[] } {
  if (!table.primaryKey.length) {
    if (typeof rawKey.__ctid !== "string") throw new Error("Kayıt anahtarı eksik.");
    return { sql: `target.ctid=$${startParameter}::tid`, params: [rawKey.__ctid] };
  }
  const params: unknown[] = [];
  const parts = table.primaryKey.map((column, index) => {
    if (!(column in rawKey)) throw new Error(`Kayıt anahtarı eksik: ${column}`);
    params.push(rawKey[column]);
    return `target.${quoteIdentifier(column)}=$${startParameter + index}`;
  });
  return { sql: parts.join(" AND "), params };
}

async function audit(client: AdminDbClient, actorId: string, action: string, table: string, key: unknown, reason: string, before: unknown, after: unknown) {
  await client.query(
    `INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,$3,'ADMIN_DATA',$4,$5::jsonb)`,
    [adminConfig.guildId, actorId, action, table, JSON.stringify({ table, key, reason, before, after })]
  );
}

async function referenceLabels(meta: SchemaMeta, table: TableMeta, rows: Record<string, unknown>[]): Promise<Map<string, Map<string, string>>> {
  const resolved = new Map<string, Map<string, string>>();
  for (const foreignKey of table.foreignKeys) {
    const foreignTable = meta.tables.get(foreignKey.foreignTable);
    if (!foreignTable) continue;
    const values = [...new Set(rows.map((row) => row[foreignKey.column]).filter((value) => value !== null && value !== undefined).map(String))];
    if (!values.length) continue;
    const params: unknown[] = [...values];
    const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
    const scope = scopeExpression(meta, foreignTable.name, "ref_row", params.length + 1);
    if (scope) params.push(adminConfig.guildId);
    const result = await adminPool.query<{ value: string; label: string }>(
      `SELECT ref_row.${quoteIdentifier(foreignKey.foreignColumn)}::text AS value,
              ${referenceLabelSql(foreignTable, "ref_row")} AS label
         FROM ${quoteIdentifier(foreignTable.name)} ref_row
        WHERE ref_row.${quoteIdentifier(foreignKey.foreignColumn)} IN (${placeholders})${scope ? ` AND ${scope}` : ""}`,
      params
    );
    resolved.set(foreignKey.column, new Map(result.rows.map((row) => [String(row.value), row.label])));
  }

  const actorColumns = table.columns.filter((column) => /(^|_)(offered|responded|created|updated|ended|destroyed)_by$/u.test(column.name) || column.name === "actor_user_id");
  const actorIds = [...new Set(actorColumns.flatMap((column) => rows.map((row) => row[column.name])).filter((value) => typeof value === "string" && value).map(String))];
  if (actorIds.length && meta.tables.has("country_members") && meta.tables.has("countries")) {
    const placeholders = actorIds.map((_, index) => `$${index + 1}`).join(",");
    const result = await adminPool.query<{ value: string; label: string }>(
      `SELECT member.discord_user_id AS value,string_agg(DISTINCT country.name,', ' ORDER BY country.name) AS label
         FROM country_members member JOIN countries country ON country.id=member.country_id
        WHERE member.discord_user_id IN (${placeholders}) AND country.guild_id=$${actorIds.length + 1}
        GROUP BY member.discord_user_id`, [...actorIds, adminConfig.guildId]
    );
    const labels = new Map(result.rows.map((row) => [String(row.value), `${row.label} oyuncusu`]));
    for (const column of actorColumns) resolved.set(column.name, labels);
  }
  return resolved;
}

async function relationOptions(meta: SchemaMeta, table: TableMeta, columnName: string, search: string, current?: string) {
  const relation = referenceForColumn(table, columnName);
  if (!relation) throw new Error("Bu alan seçim listesiyle yönetilemiyor.");
  const foreignTable = assertTable(meta, relation.foreignTable);
  const params: unknown[] = [];
  const filters: string[] = [];
  const scope = scopeExpression(meta, foreignTable.name, "ref_row", params.length + 1);
  if (scope) { params.push(adminConfig.guildId); filters.push(scope); }
  if (search.trim()) {
    params.push(`%${search.trim()}%`);
    filters.push(`${referenceLabelSql(foreignTable, "ref_row")} ILIKE $${params.length}`);
  }
  if (current) {
    params.push(current);
    const normalFilter = filters.length ? `(${filters.join(" AND ")})` : "TRUE";
    filters.length = 0;
    filters.push(`(${normalFilter} OR ref_row.${quoteIdentifier(relation.foreignColumn)}::text=$${params.length})`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await adminPool.query<{ value: string; label: string }>(
    `SELECT ref_row.${quoteIdentifier(relation.foreignColumn)}::text AS value,
            ${referenceLabelSql(foreignTable, "ref_row")} AS label
       FROM ${quoteIdentifier(foreignTable.name)} ref_row ${where}
      ORDER BY label LIMIT 1000`, params
  );
  return result.rows;
}

export const adminDataControlService = {
  async catalog() {
    const meta = await schema();
    return Array.from(meta.tables.values())
      .map((table) => ({
        name: table.name,
        label: tableLabel(table.name),
        category: tableCategory(table.name),
        mutable: table.mutable,
        primaryKey: table.primaryKey,
        scoped: findScopePath(meta, table.name) !== null,
        columns: table.columns.map((column) => {
          const relation = referenceForColumn(table, column.name);
          return {
            ...column,
            editable: table.mutable && !column.generated && !column.primary,
            reference: relation ? { table: relation.foreignTable, column: relation.foreignColumn } : null
          };
        })
      }))
      .sort((left, right) => left.category.localeCompare(right.category, "tr") || left.label.localeCompare(right.label, "tr"));
  },

  async rows(tableName: string, search: string, offset: number, limit: number) {
    const meta = await schema();
    const table = assertTable(meta, tableName);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safeOffset = Math.max(0, offset);
    const params: unknown[] = [];
    const filters: string[] = [];
    const scope = scopeExpression(meta, tableName, "target", params.length + 1);
    if (scope) { params.push(adminConfig.guildId); filters.push(scope); }
    if (search.trim()) { params.push(`%${search.trim()}%`); filters.push(`row_to_json(target)::text ILIKE $${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const orderColumn = table.columns.some((column) => column.name === "updated_at") ? "updated_at"
      : table.columns.some((column) => column.name === "created_at") ? "created_at"
        : table.primaryKey[0] ?? table.columns[0]!.name;
    const count = await adminPool.query<{ count: number }>(`SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(tableName)} target ${where}`, params);
    const rowParams = [...params, safeLimit, safeOffset];
    const result = await adminPool.query<Record<string, unknown>>(
      `SELECT target.ctid::text AS "__ctid",target.* FROM ${quoteIdentifier(tableName)} target ${where}
       ORDER BY target.${quoteIdentifier(orderColumn)} DESC NULLS LAST LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
      rowParams
    );
    const labels = await referenceLabels(meta, table, result.rows);
    return {
      table: tableName,
      offset: safeOffset,
      limit: safeLimit,
      total: Number(count.rows[0]?.count ?? 0),
      rows: result.rows.map((row) => {
        const values = { ...row };
        delete values.__ctid;
        const displayValues = Object.fromEntries(Object.entries(values).map(([name, value]) => {
          const label = value === null || value === undefined ? null : labels.get(name)?.get(String(value));
          return [name, label ?? value];
        }));
        return { key: rowKey(table, row), values, displayValues };
      })
    };
  },

  async options(tableName: string, columnName: string, search: string, current?: string) {
    const meta = await schema();
    const table = assertTable(meta, tableName);
    if (!table.columns.some((column) => column.name === columnName)) throw new Error("Alan bulunamadı.");
    return relationOptions(meta, table, columnName, search, current);
  },

  async mutate(actorId: string, rawInput: unknown) {
    const input = mutationSchema.parse(rawInput);
    const meta = await schema();
    const table = assertTable(meta, input.table);
    if (!table.mutable) throw new Error("Bu kayıt tablosu denetim bütünlüğü nedeniyle salt okunurdur.");
    if (input.action === "DELETE" && input.confirmation !== "SIL") throw new Error("Silme işlemi için SIL onayı gereklidir.");

    return withAdminTransaction(async (client) => {
      if (input.action === "INSERT") {
        const values = normalizeValues(table, input.values ?? {}, true);
        if (table.columns.some((column) => column.name === "guild_id") && !("guild_id" in values)) values.guild_id = adminConfig.guildId;
        const entries = Object.entries(values);
        const result = entries.length
          ? await client.query<Record<string, unknown>>(
            `INSERT INTO ${quoteIdentifier(table.name)}(${entries.map(([name]) => quoteIdentifier(name)).join(",")})
             VALUES(${entries.map((_, index) => `$${index + 1}`).join(",")}) RETURNING ctid::text AS "__ctid",*`, entries.map(([, value]) => value))
          : await client.query<Record<string, unknown>>(`INSERT INTO ${quoteIdentifier(table.name)} DEFAULT VALUES RETURNING ctid::text AS "__ctid",*`);
        const row = result.rows[0]!;
        const key = rowKey(table, row);
        const insertedScope = scopeExpression(meta, table.name, "target", 2);
        if (insertedScope) {
          const allowed = await client.query(
            `SELECT 1 FROM ${quoteIdentifier(table.name)} target WHERE target.ctid=$1::tid AND ${insertedScope}`,
            [row.__ctid, adminConfig.guildId]
          );
          if (!allowed.rowCount) throw new Error("Yeni kayıt bu panelin yönettiği Discord sunucusuna bağlı değil.");
        }
        await audit(client, actorId, "ADMIN_DATA_INSERT", table.name, key, input.reason, null, row);
        return { ok: true, action: input.action, key };
      }

      const key = keyWhere(table, input.key ?? {}, 1);
      const scopeParams = [...key.params];
      const scope = scopeExpression(meta, table.name, "target", scopeParams.length + 1);
      if (scope) scopeParams.push(adminConfig.guildId);
      const where = `${key.sql}${scope ? ` AND ${scope}` : ""}`;
      const beforeResult = await client.query<Record<string, unknown>>(
        `SELECT target.ctid::text AS "__ctid",target.* FROM ${quoteIdentifier(table.name)} target WHERE ${where} FOR UPDATE`, scopeParams);
      const before = beforeResult.rows[0];
      if (!before) throw new Error("Kayıt bulunamadı veya bu sunucuya ait değil.");

      if (input.action === "DELETE") {
        await client.query(`DELETE FROM ${quoteIdentifier(table.name)} target WHERE ${where}`, scopeParams);
        await audit(client, actorId, "ADMIN_DATA_DELETE", table.name, input.key, input.reason, before, null);
        return { ok: true, action: input.action, key: input.key };
      }

      const values = normalizeValues(table, input.values ?? {}, false);
      const entries = Object.entries(values);
      if (!entries.length) throw new Error("Değiştirilecek alan bulunamadı.");
      const updateParams = entries.map(([, value]) => value);
      const updateKey = keyWhere(table, input.key ?? {}, updateParams.length + 1);
      updateParams.push(...updateKey.params);
      const updateScope = scopeExpression(meta, table.name, "target", updateParams.length + 1);
      if (updateScope) updateParams.push(adminConfig.guildId);
      const updated = await client.query<Record<string, unknown>>(
        `UPDATE ${quoteIdentifier(table.name)} target SET ${entries.map(([name], index) => `${quoteIdentifier(name)}=$${index + 1}`).join(",")}
          WHERE ${updateKey.sql}${updateScope ? ` AND ${updateScope}` : ""} RETURNING target.ctid::text AS "__ctid",target.*`, updateParams);
      if (!updated.rows[0]) throw new Error("Kayıt güncellenemedi.");
      const updatedScope = scopeExpression(meta, table.name, "target", 2);
      if (updatedScope) {
        const allowed = await client.query(
          `SELECT 1 FROM ${quoteIdentifier(table.name)} target WHERE target.ctid=$1::tid AND ${updatedScope}`,
          [updated.rows[0].__ctid, adminConfig.guildId]
        );
        if (!allowed.rowCount) throw new Error("Değişiklik kaydı bu panelin yönettiği Discord sunucusunun dışına taşıyamaz.");
      }
      await audit(client, actorId, "ADMIN_DATA_UPDATE", table.name, input.key, input.reason, before, updated.rows[0]);
      return { ok: true, action: input.action, key: rowKey(table, updated.rows[0]) };
    });
  }
};

export const adminDataControlInternals = { quoteIdentifier, tableCategory, normalizeValues };
