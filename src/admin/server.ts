import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { ZodError } from "zod";
import { adminConfig } from "./config.js";
import { adminPool } from "./db.js";
import {
  assertMutationRequest,
  clearSession,
  completeDiscordLinkLogin,
  sessionFromRequest,
  type AdminSession
} from "./auth.js";
import { adminPanelService } from "./service.js";
import { adminRebellionService } from "./rebellion-service.js";
import { aiCountryGovernanceService } from "../services/ai-country-governance-service.js";

const logger = pino({ level: adminConfig.logLevel });
const publicFiles = {
  "/": { path: fileURLToPath(new URL("./public/index.html", import.meta.url)), type: "text/html; charset=utf-8" },
  "/app.css": { path: fileURLToPath(new URL("./public/app.css", import.meta.url)), type: "text/css; charset=utf-8" },
  "/app.js": { path: fileURLToPath(new URL("./public/app.js", import.meta.url)), type: "text/javascript; charset=utf-8" }
} as const;

function securityHeaders(response: ServerResponse): void {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("content-security-policy", "default-src 'self'; connect-src 'self'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  securityHeaders(response);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function redirect(response: ServerResponse, location: string): void {
  securityHeaders(response);
  response.writeHead(302, { location, "cache-control": "no-store" }).end();
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("İstek gövdesi çok büyük.");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new Error("Geçersiz JSON isteği."); }
}

function requireSession(request: IncomingMessage, response: ServerResponse): AdminSession | null {
  const session = sessionFromRequest(request);
  if (!session) json(response, 401, { error: "AUTH_REQUIRED" });
  return session;
}

function requireMutation(request: IncomingMessage, response: ServerResponse): AdminSession | null {
  const session = requireSession(request, response);
  if (!session) return null;
  if (!assertMutationRequest(request, session)) {
    json(response, 403, { error: "CSRF_REJECTED", message: "İşlem güvenlik doğrulamasından geçemedi." });
    return null;
  }
  return session;
}

async function serveStatic(pathname: keyof typeof publicFiles, response: ServerResponse): Promise<void> {
  const file = publicFiles[pathname];
  const content = await readFile(file.path);
  securityHeaders(response);
  response.writeHead(200, { "content-type": file.type, "cache-control": "no-store" });
  response.end(content);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", adminConfig.baseUrl);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      await adminPool.query("SELECT 1");
      return json(response, 200, { ok: true, service: "gm-panel" });
    }
    if (request.method === "GET" && url.pathname === "/auth/discord") {
      await completeDiscordLinkLogin(response, url);
      return redirect(response, "/");
    }
    if (request.method === "POST" && url.pathname === "/auth/logout") {
      const session = requireMutation(request, response);
      if (!session) return;
      clearSession(response);
      return json(response, 200, { ok: true });
    }
    if (request.method === "GET" && url.pathname === "/api/session") {
      const session = requireSession(request, response);
      if (!session) return;
      return json(response, 200, { user: { id: session.sub, username: session.username, avatar: session.avatar }, csrf: session.csrf });
    }
    if (request.method === "GET" && url.pathname === "/api/overview") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.overview());
    }
    if (request.method === "GET" && url.pathname === "/api/countries") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.countries());
    }
    if (request.method === "GET" && url.pathname === "/api/settlements") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.settlements());
    }
    if (request.method === "GET" && url.pathname === "/api/forces") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.forces());
    }
    if (request.method === "GET" && url.pathname === "/api/characters") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.characters());
    }
    if (request.method === "GET" && url.pathname === "/api/dynasties") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.dynasties());
    }
    const dynastyMatch = request.method === "GET" ? url.pathname.match(/^\/api\/dynasties\/([0-9a-f-]+)$/iu) : null;
    if (dynastyMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.dynasty(dynastyMatch[1]!));
    }
    if (request.method === "GET" && url.pathname === "/api/character-assignments") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.characterAssignments());
    }
    if (request.method === "GET" && url.pathname === "/api/battles") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.battles());
    }
    if (request.method === "GET" && url.pathname === "/api/rebellions") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminRebellionService.dashboard());
    }
    const rebellionDetailMatch = request.method === "GET" ? url.pathname.match(/^\/api\/rebellions\/([0-9a-f-]+)$/iu) : null;
    if (rebellionDetailMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminRebellionService.detail(rebellionDetailMatch[1]!));
    }
    const battleManualRostersMatch = request.method === "GET" ? url.pathname.match(/^\/api\/battles\/([0-9a-f-]+)\/manual-rosters$/iu) : null;
    if (battleManualRostersMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.battleManualRosters(battleManualRostersMatch[1]!));
    }
    if (request.method === "GET" && (url.pathname === "/api/active-battles" || url.pathname === "/api/sieges")) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.activeBattles());
    }
    const battleRosterOptionsMatch = request.method === "GET"
      ? url.pathname.match(/^\/api\/(?:battles|sieges)\/([0-9a-f-]+)\/roster-options$/iu)
      : null;
    if (battleRosterOptionsMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.activeBattleRosterOptions(battleRosterOptionsMatch[1]!));
    }
    const armyDetailMatch = request.method === "GET" ? url.pathname.match(/^\/api\/armies\/([0-9a-f-]+)$/iu) : null;
    if (armyDetailMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.army(armyDetailMatch[1]!));
    }
    const countryMatch = request.method === "GET" ? url.pathname.match(/^\/api\/countries\/([0-9a-f-]+)$/iu) : null;
    if (countryMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.country(countryMatch[1]!));
    }
    if (request.method === "GET" && url.pathname === "/api/search") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.search(url.searchParams.get("q") ?? ""));
    }
    if (request.method === "GET" && url.pathname === "/api/audit") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await adminPanelService.audit(Number(url.searchParams.get("limit") ?? 60)));
    }
    if (request.method === "GET" && url.pathname === "/api/ai-governance") {
      if (!requireSession(request, response)) return;
      return json(response, 200, await aiCountryGovernanceService.dashboard());
    }
    const aiObservationMatch = request.method === "GET" ? url.pathname.match(/^\/api\/ai-governance\/countries\/([0-9a-f-]+)\/observation$/iu) : null;
    if (aiObservationMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await aiCountryGovernanceService.observation(aiObservationMatch[1]!));
    }
    const aiPlanMatch = request.method === "GET" ? url.pathname.match(/^\/api\/ai-governance\/plans\/([0-9a-f-]+)$/iu) : null;
    if (aiPlanMatch) {
      if (!requireSession(request, response)) return;
      return json(response, 200, await aiCountryGovernanceService.plan(aiPlanMatch[1]!));
    }
    if (request.method === "GET" && url.pathname === "/api/catalog/units") {
      if (!requireSession(request, response)) return;
      return json(response, 200, adminPanelService.unitCatalog());
    }
    if (request.method === "GET" && url.pathname === "/api/catalog/characters") {
      if (!requireSession(request, response)) return;
      return json(response, 200, adminPanelService.characterCatalog());
    }
    if (request.method === "GET" && url.pathname === "/api/catalog/religions") {
      if (!requireSession(request, response)) return;
      return json(response, 200, adminPanelService.religionCatalog());
    }
    const countryUpdateMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/countries\/([0-9a-f-]+)$/iu) : null;
    if (countryUpdateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.updateCountry(session.sub, countryUpdateMatch[1]!, await body(request)));
    }
    const settlementUpdateMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/settlements\/([0-9a-f-]+)$/iu) : null;
    if (settlementUpdateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.updateSettlement(session.sub, settlementUpdateMatch[1]!, await body(request)));
    }
    const rebellionUpdateMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/rebellions\/([0-9a-f-]+)$/iu) : null;
    if (rebellionUpdateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminRebellionService.update(session.sub, rebellionUpdateMatch[1]!, await body(request)));
    }
    const rebellionActionMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/rebellions\/([0-9a-f-]+)\/action$/iu) : null;
    if (rebellionActionMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminRebellionService.action(session.sub, rebellionActionMatch[1]!, await body(request)));
    }
    const characterUpdateMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/characters\/([0-9a-f-]+)$/iu) : null;
    if (characterUpdateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.updateCharacter(session.sub, characterUpdateMatch[1]!, await body(request)));
    }
    const dynastyUpdateMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/dynasties\/([0-9a-f-]+)$/iu) : null;
    if (dynastyUpdateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.updateDynasty(session.sub, dynastyUpdateMatch[1]!, await body(request)));
    }
    const dynastyMemberCreateMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/dynasties\/([0-9a-f-]+)\/members$/iu) : null;
    if (dynastyMemberCreateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.addDynastyMember(session.sub, dynastyMemberCreateMatch[1]!, await body(request)));
    }
    const localNobleMarriageMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/dynasties\/([0-9a-f-]+)\/local-noble-marriages$/iu) : null;
    if (localNobleMarriageMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.marryLocalNoble(session.sub, localNobleMarriageMatch[1]!, await body(request)));
    }
    const dynastyMemberUpdateMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/dynasty-members\/([0-9a-f-]+)$/iu) : null;
    if (dynastyMemberUpdateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.updateDynastyMember(session.sub, dynastyMemberUpdateMatch[1]!, await body(request)));
    }
    const dynastyMemberDeathMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/dynasty-members\/([0-9a-f-]+)\/death$/iu) : null;
    if (dynastyMemberDeathMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.killDynastyMember(session.sub, dynastyMemberDeathMatch[1]!, await body(request)));
    }
    const aiProfileMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/ai-governance\/countries\/([0-9a-f-]+)$/iu) : null;
    if (aiProfileMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await aiCountryGovernanceService.saveProfile(session.sub, aiProfileMatch[1]!, await body(request)));
    }
    if (request.method === "PATCH" && url.pathname === "/api/admin/ai-governance/settings") {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await aiCountryGovernanceService.setTestMode(session.sub, await body(request)));
    }
    const aiDraftMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/ai-governance\/countries\/([0-9a-f-]+)\/generate-draft$/iu) : null;
    if (aiDraftMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await aiCountryGovernanceService.generateDraft(session.sub, aiDraftMatch[1]!));
    }
    const aiReviewMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/ai-governance\/plans\/([0-9a-f-]+)\/review$/iu) : null;
    if (aiReviewMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await aiCountryGovernanceService.reviewPlan(session.sub, aiReviewMatch[1]!, await body(request)));
    }
    const characterCancelMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/characters\/([0-9a-f-]+)\/cancel-assignment$/iu) : null;
    if (characterCancelMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.cancelCharacterAssignment(session.sub, characterCancelMatch[1]!));
    }
    const battleParticipantMatch = request.method === "POST"
      ? url.pathname.match(/^\/api\/admin\/(?:battles|sieges)\/([0-9a-f-]+)\/participants$/iu)
      : null;
    if (battleParticipantMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.mutateActiveBattleParticipant(session.sub, battleParticipantMatch[1]!, await body(request)));
    }
    const battleArmyMatch = request.method === "POST"
      ? url.pathname.match(/^\/api\/admin\/(?:battles|sieges)\/([0-9a-f-]+)\/armies$/iu)
      : null;
    if (battleArmyMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.mutateActiveBattleArmy(session.sub, battleArmyMatch[1]!, await body(request)));
    }
    const battleFleetMatch = request.method === "POST"
      ? url.pathname.match(/^\/api\/admin\/(?:battles|sieges)\/([0-9a-f-]+)\/fleets$/iu)
      : null;
    if (battleFleetMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.mutateActiveBattleFleet(session.sub, battleFleetMatch[1]!, await body(request)));
    }
    const battleMercenaryMatch = request.method === "POST"
      ? url.pathname.match(/^\/api\/admin\/(?:battles|sieges)\/([0-9a-f-]+)\/mercenaries$/iu)
      : null;
    if (battleMercenaryMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.mutateActiveBattleMercenary(session.sub, battleMercenaryMatch[1]!, await body(request)));
    }
    const battleManualRosterRemoveMatch = request.method === "POST" ? url.pathname.match(/^\/api\/admin\/battles\/([0-9a-f-]+)\/manual-rosters\/remove$/iu) : null;
    if (battleManualRosterRemoveMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.removeBattleManualRoster(session.sub, battleManualRosterRemoveMatch[1]!, await body(request)));
    }
    const armyUpdateMatch = request.method === "PATCH" ? url.pathname.match(/^\/api\/admin\/armies\/([0-9a-f-]+)$/iu) : null;
    if (armyUpdateMatch) {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.updateArmy(session.sub, armyUpdateMatch[1]!, await body(request)));
    }
    if (request.method === "POST" && url.pathname === "/api/admin/army-units") {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.updateArmyUnit(session.sub, await body(request)));
    }
    if (request.method === "POST" && url.pathname === "/api/operations/army/preview") {
      const session = requireMutation(request, response);
      if (!session) return;
      return json(response, 200, await adminPanelService.previewArmy(session.sub, await body(request)));
    }
    if (request.method === "POST" && url.pathname === "/api/operations/army/create") {
      const session = requireMutation(request, response);
      if (!session) return;
      const input = await body(request) as { previewToken?: unknown };
      if (typeof input.previewToken !== "string") throw new Error("Önizleme anahtarı eksik.");
      return json(response, 200, await adminPanelService.createArmy(session.sub, input.previewToken));
    }
    if (request.method === "GET" && url.pathname in publicFiles) {
      return serveStatic(url.pathname as keyof typeof publicFiles, response);
    }
    json(response, 404, { error: "NOT_FOUND" });
  } catch (error) {
    const message = error instanceof ZodError
      ? error.issues.map((issue) => issue.message).join(" • ")
      : error instanceof Error ? error.message : "Beklenmeyen hata";
    logger.error({ err: error, method: request.method, path: url.pathname }, "GM paneli isteği başarısız");
    json(response, 400, { error: "REQUEST_FAILED", message });
  }
});

server.listen(adminConfig.port, "0.0.0.0", () => {
  logger.info({ port: adminConfig.port, baseUrl: adminConfig.baseUrl }, "GM Operasyon Masası hazır");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => { void adminPool.end().finally(() => process.exit(0)); });
  });
}
