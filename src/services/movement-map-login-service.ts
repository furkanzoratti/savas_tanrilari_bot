import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { signValue } from "../security/signed-value.js";
import { GameError } from "./game-service.js";

export interface MovementMapLoginToken {
  sub:string; username:string; avatar:string|null; guildId:string; countryId:string; nonce:string; exp:number;
}

export const movementMapTokenHash=(token:string):string=>createHash("sha256").update(token).digest("hex");

export const movementMapLoginService={
  async issue(input:{guildId:string;userId:string;username:string;avatar:string|null}):Promise<{url:string;expiresAt:Date;countryName:string}>{
    if(!config.ADMIN_PANEL_BASE_URL||!config.ADMIN_SESSION_SECRET)throw new GameError("Hareket haritası bağlantısı henüz yapılandırılmadı.");
    const country=(await pool.query<{id:string;name:string}>(
      `SELECT country.id,country.name FROM country_members member
       JOIN countries country ON country.id=member.country_id
       WHERE member.discord_user_id=$1 AND country.guild_id=$2 AND country.status='ACTIVE'
       ORDER BY country.name LIMIT 1`,[input.userId,input.guildId]
    )).rows[0];
    if(!country)throw new GameError("Aktif bir devlete bağlı olmadığın için hareket haritasına erişemezsin.");
    const expiresAt=new Date(Date.now()+5*60_000);
    const payload:MovementMapLoginToken={
      sub:input.userId,username:input.username,avatar:input.avatar,guildId:input.guildId,countryId:country.id,
      nonce:randomBytes(24).toString("base64url"),exp:expiresAt.getTime()
    };
    const token=signValue(payload,config.ADMIN_SESSION_SECRET);
    await pool.query("DELETE FROM movement_map_login_tokens WHERE expires_at<NOW() OR used_at IS NOT NULL");
    await pool.query(
      `INSERT INTO movement_map_login_tokens(token_hash,guild_id,user_id,country_id,username,avatar,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [movementMapTokenHash(token),input.guildId,input.userId,country.id,input.username,input.avatar,expiresAt]
    );
    return {url:`${config.ADMIN_PANEL_BASE_URL.replace(/\/+$/u,"")}/auth/movement-map?token=${encodeURIComponent(token)}`,expiresAt,countryName:country.name};
  }
};
