import type {DynastyGender} from "./dynasty.js";

const MALE_PRAENOMINA=["Gaius","Marcus","Quintus","Publius","Tiberius","Lucius","Aulus","Sextus","Decimus","Gnaeus","Manius","Kaeso"] as const;
const FEMALE_ORDINALS=["Prima","Secunda","Tertia","Quarta","Quinta","Sexta","Septima","Octavia","Nona","Decima"] as const;

interface RomanFamilyNameStyle{maleSuffix:string;femaleNomen:string;femaleCognomen?:string}

export interface RomanNpcMarriageCandidate{
  id:string;familyId:string;gender:DynastyGender;age:number;position:string;
  birthFamilyId:string|null;motherId:string|null;fatherId:string|null;
}

export interface RomanNpcMarriageMatch{manId:string;womanId:string;manFamilyId:string;womanFamilyId:string}

export function romanFamilyUsesAutomaticPregnancy(activePlayerCount:number):boolean{
  return activePlayerCount===0;
}

export function planRomanNpcMarriages(
  candidates:ReadonlyArray<RomanNpcMarriageCandidate>,randomScore:(maximum:number)=>number
):RomanNpcMarriageMatch[]{
  const possible:Array<{man:RomanNpcMarriageCandidate;woman:RomanNpcMarriageCandidate;score:number}>=[];
  const men=candidates.filter((member)=>member.gender==="MALE");
  const women=candidates.filter((member)=>member.gender==="FEMALE"&&member.position!=="HEAD");
  for(const man of men){
    for(const woman of women){
      if(man.familyId===woman.familyId||Math.abs(man.age-woman.age)>25)continue;
      if(man.birthFamilyId&&woman.birthFamilyId&&man.birthFamilyId===woman.birthFamilyId)continue;
      if(man.motherId&&[woman.motherId,woman.fatherId].includes(man.motherId))continue;
      if(man.fatherId&&[woman.motherId,woman.fatherId].includes(man.fatherId))continue;
      possible.push({man,woman,score:Math.abs(man.age-woman.age)*3+randomScore(31)});
    }
  }
  possible.sort((left,right)=>left.score-right.score||left.man.id.localeCompare(right.man.id)||left.woman.id.localeCompare(right.woman.id));
  const usedFamilies=new Set<string>();
  const usedMembers=new Set<string>();
  const matches:RomanNpcMarriageMatch[]=[];
  for(const match of possible){
    if(usedFamilies.has(match.man.familyId)||usedFamilies.has(match.woman.familyId)||
      usedMembers.has(match.man.id)||usedMembers.has(match.woman.id))continue;
    matches.push({manId:match.man.id,womanId:match.woman.id,manFamilyId:match.man.familyId,womanFamilyId:match.woman.familyId});
    usedFamilies.add(match.man.familyId);usedFamilies.add(match.woman.familyId);
    usedMembers.add(match.man.id);usedMembers.add(match.woman.id);
  }
  return matches;
}

const FAMILY_STYLE:Record<string,RomanFamilyNameStyle>={
  "Scipio ailesi":{maleSuffix:"Cornelius Scipio",femaleNomen:"Cornelia",femaleCognomen:"Scipio"},
  "Magnus ailesi":{maleSuffix:"Cornelius Magnus",femaleNomen:"Cornelia",femaleCognomen:"Magnus"},
  "Cato ailesi":{maleSuffix:"Porcius Cato",femaleNomen:"Porcia",femaleCognomen:"Catonis"},
  "Nero ailesi":{maleSuffix:"Claudius Nero",femaleNomen:"Claudia",femaleCognomen:"Nero"},
  "Julius ailesi":{maleSuffix:"Julius Varro",femaleNomen:"Julia",femaleCognomen:"Varra"},
  "Aemilius ailesi":{maleSuffix:"Aemilius Lepidus",femaleNomen:"Aemilia",femaleCognomen:"Lepida"},
  "Fabius ailesi":{maleSuffix:"Fabius Maximus",femaleNomen:"Fabia",femaleCognomen:"Maxima"},
  "Valerius ailesi":{maleSuffix:"Valerius Messalla",femaleNomen:"Valeria",femaleCognomen:"Messalla"},
  "Licinius ailesi":{maleSuffix:"Licinius Crassus",femaleNomen:"Licinia",femaleCognomen:"Crassa"},
  "Junius ailesi":{maleSuffix:"Junius Silanus",femaleNomen:"Junia",femaleCognomen:"Silana"},
  "Servilius ailesi":{maleSuffix:"Servilius Caepio",femaleNomen:"Servilia",femaleCognomen:"Caepionis"},
  "Caecilius ailesi":{maleSuffix:"Caecilius Metellus",femaleNomen:"Caecilia",femaleCognomen:"Metella"}
};

function fallbackStyle(familyName:string):RomanFamilyNameStyle{
  const root=familyName.replace(/\s+ailesi$/iu,"").trim()||"Romanus";
  return{maleSuffix:root,femaleNomen:root.endsWith("us")?root.slice(0,-2)+"a":root+"a"};
}

export function availableRomanFamilyChildName(
  familyName:string,gender:DynastyGender,usedNames:ReadonlySet<string>,randomIndex:(maximum:number)=>number
):string{
  const style=FAMILY_STYLE[familyName]??fallbackStyle(familyName);
  const candidates=gender==="MALE"
    ?MALE_PRAENOMINA.map((praenomen)=>`${praenomen} ${style.maleSuffix}`)
    :FEMALE_ORDINALS.map((ordinal)=>[style.femaleNomen,ordinal,style.femaleCognomen].filter(Boolean).join(" "));
  const available=candidates.filter((name)=>!usedNames.has(name.toLocaleLowerCase("tr-TR")));
  if(available.length)return available[Math.max(0,Math.min(available.length-1,randomIndex(available.length)))]!;
  const base=gender==="MALE"?`Gaius ${style.maleSuffix}`:[style.femaleNomen,style.femaleCognomen].filter(Boolean).join(" ");
  let sequence=2;
  while(usedNames.has(`${base} ${sequence}`.toLocaleLowerCase("tr-TR")))sequence+=1;
  return`${base} ${sequence}`;
}
