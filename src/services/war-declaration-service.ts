import { pool, withTransaction, type DbClient } from "../db/pool.js";
import { GameError } from "./game-service.js";

export interface OfficialWarView {
  id: string;
  guild_id: string;
  attacker_country_id: string;
  attacker_country_name: string;
  defender_country_id: string;
  defender_country_name: string;
  reason: string;
  declaration: string;
  status: "ACTIVE" | "ENDED";
  started_turn: number;
  ended_turn: number | null;
  winner_country_id: string | null;
  winner_country_name: string | null;
  end_outcome: WarEndOutcome | null;
  end_description: string | null;
  channel_id: string | null;
  message_id: string | null;
}

export type WarEndOutcome = "ATTACKER_VICTORY" | "DEFENDER_VICTORY" | "WHITE_PEACE";

export interface PeaceOfferView {
  id: string;
  guild_id: string;
  war_id: string;
  proposer_country_id: string;
  proposer_country_name: string;
  receiver_country_id: string;
  receiver_country_name: string;
  terms: string;
  indemnity_amount: number;
  payer_country_id: string | null;
  payer_country_name: string | null;
  recipient_country_id: string | null;
  recipient_country_name: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  offered_turn: number;
  resolved_turn: number | null;
  channel_id: string | null;
  message_id: string | null;
}

export interface TreasuryAllocation {
  id: string;
  name: string;
  amount: number;
}

export interface PeaceResolution {
  offer: PeaceOfferView;
  war: OfficialWarView;
  deductions: TreasuryAllocation[];
  credits: TreasuryAllocation[];
}

interface TreasuryRow {
  id: string;
  name: string;
  local_treasury: number;
  population: number;
}

const warViewSql = `SELECT war.id,war.guild_id,war.attacker_country_id,
  attacker.name AS attacker_country_name,war.defender_country_id,
  defender.name AS defender_country_name,war.reason,war.declaration,
  war.status,war.started_turn,war.ended_turn,war.winner_country_id,
  winner.name AS winner_country_name,war.end_outcome,war.end_description,
  war.channel_id,war.message_id
  FROM state_wars war
  JOIN countries attacker ON attacker.id=war.attacker_country_id
  JOIN countries defender ON defender.id=war.defender_country_id
  LEFT JOIN countries winner ON winner.id=war.winner_country_id`;

const offerViewSql = `SELECT offer.id,offer.guild_id,offer.war_id,
  offer.proposer_country_id,proposer.name AS proposer_country_name,
  offer.receiver_country_id,receiver.name AS receiver_country_name,
  offer.terms,offer.indemnity_amount,offer.payer_country_id,
  payer.name AS payer_country_name,offer.recipient_country_id,
  recipient.name AS recipient_country_name,offer.status,
  offer.offered_turn,offer.resolved_turn,offer.channel_id,offer.message_id
  FROM peace_offers offer
  JOIN countries proposer ON proposer.id=offer.proposer_country_id
  JOIN countries receiver ON receiver.id=offer.receiver_country_id
  LEFT JOIN countries payer ON payer.id=offer.payer_country_id
  LEFT JOIN countries recipient ON recipient.id=offer.recipient_country_id`;

async function audit(client: DbClient, guildId: string, actorId: string, action: string, entityType: string, entityId: string, details: unknown): Promise<void> {
  await client.query(
    "INSERT INTO audit_logs(guild_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [guildId, actorId, action, entityType, entityId, JSON.stringify(details)]
  );
}

async function lockTurnAndCountries(client: DbClient, guildId: string, countryIds: string[]): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`turn:${guildId}`]);
  for (const id of [...new Set(countryIds)].sort()) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`country:${id}`]);
  }
}

async function currentTurn(client: DbClient, guildId: string): Promise<number> {
  const result = await client.query<{ current_turn: number }>("SELECT current_turn FROM guilds WHERE discord_id=$1", [guildId]);
  if (!result.rows[0]) throw new GameError("Sunucunun oyun kaydı bulunamadı.");
  return result.rows[0].current_turn;
}

async function verifyCountries(client: DbClient, guildId: string, countryIds: string[]): Promise<void> {
  for (const id of countryIds) {
    const result = await client.query("SELECT 1 FROM countries WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [id, guildId]);
    if (!result.rowCount) throw new GameError("Belirtilen devletlerden biri bu sunucuda bulunamadı.");
  }
}

async function warById(client: DbClient, id: string): Promise<OfficialWarView | null> {
  return (await client.query<OfficialWarView>(`${warViewSql} WHERE war.id=$1`, [id])).rows[0] ?? null;
}

async function offerById(client: DbClient, id: string): Promise<PeaceOfferView | null> {
  return (await client.query<PeaceOfferView>(`${offerViewSql} WHERE offer.id=$1`, [id])).rows[0] ?? null;
}

export function proportionalTreasuryAllocation(
  amount: number,
  entries: Array<{ id: string; name: string; weight: number }>
): TreasuryAllocation[] {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new GameError("Tazminat tutarı geçerli bir tam sayı olmalıdır.");
  if (!entries.length) throw new GameError("Tazminatın dağıtılabileceği bir yerleşke bulunmuyor.");
  if (entries.some((entry) => !Number.isSafeInteger(entry.weight) || entry.weight < 0)) {
    throw new GameError("Yerleşkelerin tazminat dağıtım ağırlıkları geçersiz.");
  }
  const originalTotal = entries.reduce((sum, entry) => sum + BigInt(entry.weight), 0n);
  const weights = entries.map((entry) => originalTotal === 0n ? 1n : BigInt(entry.weight));
  const total = originalTotal === 0n ? BigInt(entries.length) : originalTotal;
  const portions = entries.map((entry, index) => {
    const numerator = BigInt(amount) * weights[index]!;
    return { index, id: entry.id, name: entry.name, amount: Number(numerator / total), remainder: numerator % total };
  });
  let remainder = amount - portions.reduce((sum, portion) => sum + portion.amount, 0);
  const ranked = [...portions].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  for (const portion of ranked) {
    if (!remainder) break;
    portion.amount += 1;
    remainder -= 1;
  }
  return portions.map(({ id, name, amount: allocated }) => ({ id, name, amount: allocated }));
}

async function synchronizeTreasury(client: DbClient, countryId: string): Promise<void> {
  await client.query(
    "UPDATE countries SET treasury=(SELECT COALESCE(SUM(local_treasury),0)::bigint FROM settlements WHERE country_id=$1) WHERE id=$1",
    [countryId]
  );
}

export const warDeclarationService = {
  async channel(guildId: string): Promise<string | null> {
    const result = await pool.query<{ war_announcement_channel_id: string | null }>(
      "SELECT war_announcement_channel_id FROM guilds WHERE discord_id=$1", [guildId]
    );
    return result.rows[0]?.war_announcement_channel_id ?? null;
  },

  async setChannel(input: { guildId: string; actorId: string; channelId: string | null }): Promise<void> {
    await withTransaction(async (client) => {
      await client.query("INSERT INTO guilds(discord_id) VALUES($1) ON CONFLICT DO NOTHING", [input.guildId]);
      await client.query("UPDATE guilds SET war_announcement_channel_id=$2,updated_at=NOW() WHERE discord_id=$1", [input.guildId, input.channelId]);
      await audit(client, input.guildId, input.actorId, "WAR_ANNOUNCEMENT_CHANNEL_SET", "guild", input.guildId, input);
    });
  },

  async getWar(id: string): Promise<OfficialWarView | null> {
    return (await pool.query<OfficialWarView>(`${warViewSql} WHERE war.id=$1`, [id])).rows[0] ?? null;
  },

  async activeWarBetween(guildId: string, firstCountryId: string, secondCountryId: string): Promise<OfficialWarView | null> {
    return (await pool.query<OfficialWarView>(
      `${warViewSql} WHERE war.guild_id=$1 AND war.status='ACTIVE'
        AND ((war.attacker_country_id=$2 AND war.defender_country_id=$3)
          OR (war.attacker_country_id=$3 AND war.defender_country_id=$2))`,
      [guildId, firstCountryId, secondCountryId]
    )).rows[0] ?? null;
  },

  async activeWars(guildId: string): Promise<OfficialWarView[]> {
    return (await pool.query<OfficialWarView>(
      `${warViewSql} WHERE war.guild_id=$1 AND war.status='ACTIVE' ORDER BY war.started_turn DESC,war.created_at DESC`, [guildId]
    )).rows;
  },

  async declareWar(input: {
    guildId: string; actorId: string; attackerCountryId: string; defenderCountryId: string; reason: string; declaration: string;
  }): Promise<OfficialWarView> {
    if (input.attackerCountryId === input.defenderCountryId) throw new GameError("Bir devlet kendisine savaş ilan edemez.");
    const reason = input.reason.trim();
    const declaration = input.declaration.trim();
    if (reason.length < 2 || reason.length > 1000 || declaration.length < 2 || declaration.length > 2000) {
      throw new GameError("Savaş gerekçesi ve ilan metni geçerli uzunlukta olmalıdır.");
    }
    return withTransaction(async (client) => {
      await lockTurnAndCountries(client, input.guildId, [input.attackerCountryId, input.defenderCountryId]);
      await verifyCountries(client, input.guildId, [input.attackerCountryId, input.defenderCountryId]);
      const existing = await client.query(
        `SELECT 1 FROM state_wars WHERE guild_id=$1 AND status='ACTIVE'
          AND ((attacker_country_id=$2 AND defender_country_id=$3)
            OR (attacker_country_id=$3 AND defender_country_id=$2))`,
        [input.guildId, input.attackerCountryId, input.defenderCountryId]
      );
      if (existing.rowCount) throw new GameError("Bu iki devlet arasında zaten devam eden bir savaş bulunuyor.");
      const turn = await currentTurn(client, input.guildId);
      const created = await client.query<{ id: string }>(
        `INSERT INTO state_wars(guild_id,attacker_country_id,defender_country_id,reason,declaration,started_turn,declared_by)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [input.guildId, input.attackerCountryId, input.defenderCountryId, reason, declaration, turn, input.actorId]
      );
      const id = created.rows[0]!.id;
      await audit(client, input.guildId, input.actorId, "STATE_WAR_DECLARE", "state_war", id, { ...input, reason, declaration, turn });
      return (await warById(client, id))!;
    });
  },

  async attachWarMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await pool.query("UPDATE state_wars SET channel_id=$2,message_id=$3 WHERE id=$1", [id, channelId, messageId]);
  },

  async cancelWarDeclaration(guildId: string, id: string): Promise<void> {
    await pool.query("DELETE FROM state_wars WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'", [id, guildId]);
  },

  async createPeaceOffer(input: {
    guildId: string; actorId: string; warId: string; proposerCountryId: string;
    receiverCountryId: string; terms: string; indemnityAmount: number; payerCountryId: string | null;
  }): Promise<PeaceOfferView> {
    const terms = input.terms.trim();
    if (terms.length < 2 || terms.length > 2000) throw new GameError("Barış şartları 2–2.000 karakter arasında olmalıdır.");
    if (!Number.isSafeInteger(input.indemnityAmount) || input.indemnityAmount < 0) throw new GameError("Tazminat geçerli, pozitif bir tam sayı olmalıdır.");
    if (input.proposerCountryId === input.receiverCountryId) throw new GameError("Bir devlet kendisine barış teklif edemez.");
    if (input.indemnityAmount > 0 && ![input.proposerCountryId, input.receiverCountryId].includes(input.payerCountryId ?? "")) {
      throw new GameError("Tazminatı ödeyecek taraf belirtilmelidir: BEN veya HEDEF.");
    }
    if (input.indemnityAmount === 0 && input.payerCountryId !== null) throw new GameError("Tazminat yoksa ödeme yapacak devlet seçilemez.");
    return withTransaction(async (client) => {
      await lockTurnAndCountries(client, input.guildId, [input.proposerCountryId, input.receiverCountryId]);
      const war = (await client.query<{ attacker_country_id: string; defender_country_id: string; status: string }>(
        "SELECT attacker_country_id,defender_country_id,status FROM state_wars WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.warId, input.guildId]
      )).rows[0];
      if (!war || war.status !== "ACTIVE") throw new GameError("Bu devletler arasında devam eden bir savaş bulunmuyor.");
      if (![war.attacker_country_id, war.defender_country_id].includes(input.proposerCountryId)
        || ![war.attacker_country_id, war.defender_country_id].includes(input.receiverCountryId)) {
        throw new GameError("Barış teklifine yalnızca savaşın tarafları katılabilir.");
      }
      const pending = await client.query("SELECT 1 FROM peace_offers WHERE war_id=$1 AND status='PENDING'", [input.warId]);
      if (pending.rowCount) throw new GameError("Bu savaş için zaten yanıt bekleyen bir barış teklifi bulunuyor.");
      const recipientCountryId = input.indemnityAmount > 0
        ? (input.payerCountryId === input.proposerCountryId ? input.receiverCountryId : input.proposerCountryId)
        : null;
      if (input.indemnityAmount > 0) {
        const payer = await client.query<{ total: number; count: number }>(
          "SELECT COALESCE(SUM(local_treasury),0)::bigint AS total,COUNT(*)::integer AS count FROM settlements WHERE country_id=$1", [input.payerCountryId]
        );
        const recipient = await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM settlements WHERE country_id=$1", [recipientCountryId]);
        if (!payer.rows[0]?.count || !recipient.rows[0]?.count) throw new GameError("Tazminat için her iki devletin de en az bir yerleşkesi bulunmalıdır.");
        if (payer.rows[0].total < input.indemnityAmount) throw new GameError("Tazminatı ödeyecek devletin yerel hazinelerinde yeterli altın bulunmuyor.");
      }
      const turn = await currentTurn(client, input.guildId);
      const created = await client.query<{ id: string }>(
        `INSERT INTO peace_offers(guild_id,war_id,proposer_country_id,receiver_country_id,terms,
          indemnity_amount,payer_country_id,recipient_country_id,offered_turn,offered_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [input.guildId, input.warId, input.proposerCountryId, input.receiverCountryId, terms,
          input.indemnityAmount, input.payerCountryId, recipientCountryId, turn, input.actorId]
      );
      const id = created.rows[0]!.id;
      await audit(client, input.guildId, input.actorId, "PEACE_OFFER_CREATE", "peace_offer", id, { ...input, terms, recipientCountryId, turn });
      return (await offerById(client, id))!;
    });
  },

  async attachPeaceMessage(id: string, channelId: string, messageId: string): Promise<void> {
    await pool.query("UPDATE peace_offers SET channel_id=$2,message_id=$3 WHERE id=$1", [id, channelId, messageId]);
  },

  async cancelPeaceOffer(guildId: string, id: string): Promise<void> {
    await pool.query("UPDATE peace_offers SET status='CANCELLED',resolved_at=NOW() WHERE id=$1 AND guild_id=$2 AND status='PENDING'", [id, guildId]);
  },

  async getPeaceOffer(id: string): Promise<PeaceOfferView | null> {
    return (await pool.query<PeaceOfferView>(`${offerViewSql} WHERE offer.id=$1`, [id])).rows[0] ?? null;
  },

  async respondPeace(input: {
    guildId: string; actorId: string; offerId: string; receiverCountryId: string; accept: boolean;
  }): Promise<PeaceResolution> {
    return withTransaction(async (client) => {
      const preview = (await client.query<{ proposer_country_id: string; receiver_country_id: string }>(
        "SELECT proposer_country_id,receiver_country_id FROM peace_offers WHERE id=$1 AND guild_id=$2", [input.offerId, input.guildId]
      )).rows[0];
      if (!preview) throw new GameError("Barış teklifi bulunamadı.");
      await lockTurnAndCountries(client, input.guildId, [preview.proposer_country_id, preview.receiver_country_id]);
      const locked = (await client.query<{
        war_id: string; receiver_country_id: string; status: string; indemnity_amount: number;
        payer_country_id: string | null; recipient_country_id: string | null;
      }>("SELECT war_id,receiver_country_id,status,indemnity_amount,payer_country_id,recipient_country_id FROM peace_offers WHERE id=$1 AND guild_id=$2 FOR UPDATE",
        [input.offerId, input.guildId])).rows[0];
      if (!locked) throw new GameError("Barış teklifi bulunamadı.");
      if (locked.receiver_country_id !== input.receiverCountryId) throw new GameError("Barış teklifini yalnızca hedef devlet yanıtlayabilir.");
      if (locked.status !== "PENDING") throw new GameError("Bu barış teklifi daha önce sonuçlandırılmış.");
      const activeWar = await client.query("SELECT 1 FROM state_wars WHERE id=$1 AND status='ACTIVE' FOR UPDATE", [locked.war_id]);
      if (!activeWar.rowCount) throw new GameError("Bu savaş artık aktif değil.");
      const turn = await currentTurn(client, input.guildId);
      const deductions: TreasuryAllocation[] = [];
      const credits: TreasuryAllocation[] = [];
      if (input.accept && locked.indemnity_amount > 0) {
        const payer = (await client.query<TreasuryRow>(
          "SELECT id,name,local_treasury,population FROM settlements WHERE country_id=$1 ORDER BY name,id FOR UPDATE", [locked.payer_country_id]
        )).rows;
        const recipient = (await client.query<TreasuryRow>(
          "SELECT id,name,local_treasury,population FROM settlements WHERE country_id=$1 ORDER BY name,id FOR UPDATE", [locked.recipient_country_id]
        )).rows;
        const available = payer.reduce((sum, settlement) => sum + Number(settlement.local_treasury), 0);
        if (available < locked.indemnity_amount) {
          throw new GameError(`Barış kabul edilemedi: tazminatı ödeyecek devletin yerel hazinelerinde yalnızca ${available.toLocaleString("tr-TR")} Altın bulunuyor.`);
        }
        deductions.push(...proportionalTreasuryAllocation(locked.indemnity_amount,
          payer.map((settlement) => ({ id: settlement.id, name: settlement.name, weight: Number(settlement.local_treasury) }))));
        credits.push(...proportionalTreasuryAllocation(locked.indemnity_amount,
          recipient.map((settlement) => ({ id: settlement.id, name: settlement.name, weight: Number(settlement.population) }))));
        for (const allocation of deductions) {
          if (allocation.amount) await client.query("UPDATE settlements SET local_treasury=local_treasury-$1 WHERE id=$2", [allocation.amount, allocation.id]);
        }
        for (const allocation of credits) {
          if (allocation.amount) await client.query("UPDATE settlements SET local_treasury=local_treasury+$1 WHERE id=$2", [allocation.amount, allocation.id]);
        }
        await synchronizeTreasury(client, locked.payer_country_id!);
        await synchronizeTreasury(client, locked.recipient_country_id!);
        await client.query(
          "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'PEACE_INDEMNITY_PAID',$3,$4)",
          [locked.payer_country_id, turn, -locked.indemnity_amount, "Barış antlaşması tazminatı"]
        );
        await client.query(
          "INSERT INTO transactions(country_id,turn,kind,amount,description) VALUES($1,$2,'PEACE_INDEMNITY_RECEIVED',$3,$4)",
          [locked.recipient_country_id, turn, locked.indemnity_amount, "Barış antlaşması tazminatı"]
        );
      }
      await client.query("UPDATE peace_offers SET status=$2,resolved_turn=$3,resolved_by=$4,resolved_at=NOW() WHERE id=$1",
        [input.offerId, input.accept ? "ACCEPTED" : "REJECTED", turn, input.actorId]);
      if (input.accept) {
        await client.query("UPDATE state_wars SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW(),winner_country_id=NULL,end_outcome='WHITE_PEACE',end_description=(SELECT terms FROM peace_offers WHERE id=$4) WHERE id=$1",
          [locked.war_id, turn, input.actorId, input.offerId]);
      }
      await audit(client, input.guildId, input.actorId, input.accept ? "PEACE_OFFER_ACCEPT" : "PEACE_OFFER_REJECT", "peace_offer", input.offerId,
        { ...input, indemnity: locked.indemnity_amount, deductions, credits, turn });
      return { offer: (await offerById(client, input.offerId))!, war: (await warById(client, locked.war_id))!, deductions, credits };
    });
  },

  async forceEnd(input: { guildId: string; actorId: string; warId: string; winnerCountryId: string | null; description: string }): Promise<OfficialWarView> {
    const description = input.description.trim();
    if (description.length < 2 || description.length > 2000) throw new GameError("Savaş bitiş açıklaması 2–2.000 karakter arasında olmalıdır.");
    return withTransaction(async (client) => {
      const preview = (await client.query<{ attacker_country_id: string; defender_country_id: string }>(
        "SELECT attacker_country_id,defender_country_id FROM state_wars WHERE id=$1 AND guild_id=$2 AND status='ACTIVE'",
        [input.warId, input.guildId]
      )).rows[0];
      if (!preview) throw new GameError("Seçilen savaş aktif değil veya bu sunucuya ait değil.");
      await lockTurnAndCountries(client, input.guildId, [preview.attacker_country_id, preview.defender_country_id]);
      const existing = (await client.query<{ id: string; attacker_country_id: string; defender_country_id: string }>(
        "SELECT id,attacker_country_id,defender_country_id FROM state_wars WHERE id=$1 AND guild_id=$2 AND status='ACTIVE' FOR UPDATE",
        [input.warId, input.guildId]
      )).rows[0];
      if (!existing) throw new GameError("Seçilen savaş artık aktif değil.");
      const turn = await currentTurn(client, input.guildId);
      if (input.winnerCountryId !== null && ![existing.attacker_country_id, existing.defender_country_id].includes(input.winnerCountryId)) {
        throw new GameError("Kazanan devlet seçilen savaşın taraflarından biri olmalıdır.");
      }
      const outcome: WarEndOutcome = input.winnerCountryId === null
        ? "WHITE_PEACE"
        : input.winnerCountryId === existing.attacker_country_id ? "ATTACKER_VICTORY" : "DEFENDER_VICTORY";
      await client.query(
        "UPDATE state_wars SET status='ENDED',ended_turn=$2,ended_by=$3,ended_at=NOW(),winner_country_id=$4,end_outcome=$5,end_description=$6 WHERE id=$1",
        [existing.id, turn, input.actorId, input.winnerCountryId, outcome, description]
      );
      await client.query("UPDATE peace_offers SET status='CANCELLED',resolved_turn=$2,resolved_by=$3,resolved_at=NOW() WHERE war_id=$1 AND status='PENDING'", [existing.id, turn, input.actorId]);
      await audit(client, input.guildId, input.actorId, "STATE_WAR_FORCE_END", "state_war", existing.id, { ...input, description, outcome, turn });
      return (await warById(client, existing.id))!;
    });
  }
};
