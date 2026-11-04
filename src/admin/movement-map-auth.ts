import {createHash,randomBytes} from "node:crypto";
import type {IncomingMessage,ServerResponse} from "node:http";
import {verifySignedValue,signValue} from "../security/signed-value.js";
import type {MovementMapLoginToken} from "../services/movement-map-login-service.js";
import {adminConfig} from "./config.js";
import {adminPool} from "./db.js";
import {sessionFromRequest} from "./auth.js";

export type MovementMapSession={sub:string;username:string;avatar:string|null;csrf:string;exp:number;scope:"GM"|"PLAYER";countryId:string|null};
const COOKIE="amrp_movement_map_session";

function cookies(request:IncomingMessage):Record<string,string>{
  const result:Record<string,string>={};
  for(const item of (request.headers.cookie??"").split(";")){
    const separator=item.indexOf("=");if(separator<1)continue;
    result[item.slice(0,separator).trim()]=decodeURIComponent(item.slice(separator+1).trim());
  }
  return result;
}
function cookie(value:string,maxAge:number):string{
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${adminConfig.secureCookies?"; Secure":""}`;
}
export function movementMapSessionFromRequest(request:IncomingMessage):MovementMapSession|null{
  const admin=sessionFromRequest(request);
  if(admin)return {...admin,scope:"GM",countryId:null};
  const session=verifySignedValue<MovementMapSession>(cookies(request)[COOKIE],adminConfig.sessionSecret);
  if(!session||session.exp<=Date.now()||session.scope!=="PLAYER"||!session.countryId)return null;
  return session;
}
export function assertMovementMapMutation(request:IncomingMessage,session:MovementMapSession):boolean{
  return request.headers.origin===adminConfig.baseUrl&&request.headers["x-csrf-token"]===session.csrf;
}
export async function completeMovementMapLogin(response:ServerResponse,url:URL):Promise<void>{
  const token=url.searchParams.get("token")??undefined;
  const signed=verifySignedValue<MovementMapLoginToken>(token,adminConfig.sessionSecret);
  if(!token||!signed||signed.exp<=Date.now()||signed.guildId!==adminConfig.guildId)throw new Error("Hareket haritası bağlantısı geçersiz veya süresi dolmuş.");
  const tokenHash=createHash("sha256").update(token).digest("hex");
  const row=(await adminPool.query<{user_id:string;country_id:string;username:string;avatar:string|null}>(
    `UPDATE movement_map_login_tokens SET used_at=NOW()
     WHERE token_hash=$1 AND guild_id=$2 AND user_id=$3 AND country_id=$4 AND used_at IS NULL AND expires_at>NOW()
     RETURNING user_id,country_id,username,avatar`,[tokenHash,adminConfig.guildId,signed.sub,signed.countryId]
  )).rows[0];
  if(!row)throw new Error("Hareket haritası bağlantısı daha önce kullanılmış veya süresi dolmuş.");
  const session:MovementMapSession={sub:row.user_id,username:row.username,avatar:row.avatar,countryId:row.country_id,scope:"PLAYER",csrf:randomBytes(24).toString("base64url"),exp:Date.now()+12*60*60_000};
  response.setHeader("set-cookie",cookie(signValue(session,adminConfig.sessionSecret),12*60*60));
}
