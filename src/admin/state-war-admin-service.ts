import { z } from "zod";
import { adminConfig } from "./config.js";
import { adminPool } from "./db.js";
import { warDeclarationService, type WarSide } from "../services/war-declaration-service.js";

const uuid=z.string().uuid();
const participantActionSchema=z.object({
  action:z.enum(["ADD","REMOVE"]),
  countryId:uuid,
  side:z.enum(["ATTACKER","DEFENDER"]).optional()
});
const leaderSchema=z.object({side:z.enum(["ATTACKER","DEFENDER"]),countryId:uuid});

type ForceRow={country_id:string;country_name:string;side:WarSide;land:number;ships:number};

async function forceRows(warId:string):Promise<ForceRow[]> {
  return (await adminPool.query<ForceRow>(
    `SELECT participant.country_id,country.name AS country_name,participant.side,
            COALESCE((SELECT SUM(stack.quantity) FROM unit_stacks stack
                        JOIN settlements settlement ON settlement.id=stack.settlement_id
                       WHERE settlement.country_id=participant.country_id AND stack.quantity>0),0)::integer AS land,
            COALESCE((SELECT SUM(ship.quantity) FROM naval_units ship
                        JOIN settlements settlement ON settlement.id=ship.settlement_id
                       WHERE settlement.country_id=participant.country_id AND ship.quantity>0),0)::integer AS ships
       FROM state_war_participants participant
       JOIN countries country ON country.id=participant.country_id
      WHERE participant.war_id=$1 ORDER BY participant.side,country.name`,[warId]
  )).rows.map((row)=>({...row,land:Number(row.land),ships:Number(row.ships)}));
}

async function detail(warId:string){
  const parsed=uuid.parse(warId);
  const [record,participants,forces]=await Promise.all([
    warDeclarationService.activeWarDetail(adminConfig.guildId,parsed),
    warDeclarationService.participants(parsed),
    forceRows(parsed)
  ]);
  if(!record)throw new Error("Aktif devlet savaşı bulunamadı.");
  const totals={ATTACKER:{land:0,ships:0},DEFENDER:{land:0,ships:0}};
  for(const force of forces){totals[force.side].land+=force.land;totals[force.side].ships+=force.ships;}
  return {...record,participants,forces,currentForces:totals};
}

export const adminStateWarService={
  async dashboard(){
    const [wars,countries]=await Promise.all([
      warDeclarationService.activeWars(adminConfig.guildId),
      adminPool.query<{id:string;name:string}>(
        "SELECT id,name FROM countries WHERE guild_id=$1 AND status='ACTIVE' ORDER BY name",[adminConfig.guildId]
      )
    ]);
    const records=await Promise.all(wars.map((war)=>detail(war.id)));
    return {wars:records,countries:countries.rows};
  },
  detail,
  async mutateParticipant(actorId:string,warId:string,input:unknown){
    const id=uuid.parse(warId),data=participantActionSchema.parse(input);
    if(data.action==="ADD"){
      if(!data.side)throw new Error("Devlet eklerken cephe seçilmelidir.");
      await warDeclarationService.addWarParticipant({guildId:adminConfig.guildId,actorId,warId:id,side:data.side,countryId:data.countryId});
    }else{
      await warDeclarationService.removeWarParticipant({guildId:adminConfig.guildId,actorId,warId:id,countryId:data.countryId});
    }
    return detail(id);
  },
  async changeLeader(actorId:string,warId:string,input:unknown){
    const id=uuid.parse(warId),data=leaderSchema.parse(input);
    await warDeclarationService.changeWarLeader({guildId:adminConfig.guildId,actorId,warId:id,side:data.side,countryId:data.countryId});
    return detail(id);
  }
};
