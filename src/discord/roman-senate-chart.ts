import {deflateSync} from "node:zlib";
import type {RomanFamilyView} from "../services/roman-republic-service.js";

export const ROMAN_FAMILY_COLORS:Record<string,{hex:string;label:string}>={
  "scipio ailesi":{hex:"#d4af37",label:"Altın"},
  "magnus ailesi":{hex:"#b91c1c",label:"Kızıl"},
  "cato ailesi":{hex:"#f3f0df",label:"Fildişi"},
  "nero ailesi":{hex:"#312e81",label:"Lacivert"},
  "julius ailesi":{hex:"#7c3aed",label:"Mor"},
  "aemilius ailesi":{hex:"#2563eb",label:"Mavi"},
  "fabius ailesi":{hex:"#16a34a",label:"Yeşil"},
  "valerius ailesi":{hex:"#ea580c",label:"Turuncu"},
  "licinius ailesi":{hex:"#06b6d4",label:"Turkuaz"},
  "junius ailesi":{hex:"#db2777",label:"Pembe"},
  "servilius ailesi":{hex:"#92400e",label:"Kahverengi"},
  "caecilius ailesi":{hex:"#64748b",label:"Gri"}
};

const FALLBACK_COLORS=["#eab308","#ef4444","#22c55e","#3b82f6","#a855f7","#f97316","#14b8a6","#ec4899"];

export function romanFamilyColor(name:string,index=0):{hex:string;label:string}{
  return ROMAN_FAMILY_COLORS[name.toLocaleLowerCase("tr-TR")]??{hex:FALLBACK_COLORS[index%FALLBACK_COLORS.length]!,label:"Özel"};
}

function crcTable():Uint32Array{
  const table=new Uint32Array(256);
  for(let index=0;index<256;index+=1){
    let value=index;
    for(let bit=0;bit<8;bit+=1)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
    table[index]=value>>>0;
  }
  return table;
}
const CRC_TABLE=crcTable();

function crc32(buffer:Buffer):number{
  let value=0xffffffff;
  for(const byte of buffer)value=CRC_TABLE[(value^byte)&0xff]!^(value>>>8);
  return(value^0xffffffff)>>>0;
}

function chunk(type:string,data:Buffer):Buffer{
  const name=Buffer.from(type,"ascii");
  const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,checksum]);
}

function rgb(hex:string):[number,number,number]{
  const value=Number.parseInt(hex.slice(1),16);
  return[(value>>16)&255,(value>>8)&255,value&255];
}

export function renderRomanSenateChart(families:Pick<RomanFamilyView,"name"|"senateSeats">[]):Buffer{
  const width=1200,height=720,pixels=Buffer.alloc(width*height*4);
  const setPixel=(x:number,y:number,color:[number,number,number],alpha=255)=>{
    if(x<0||y<0||x>=width||y>=height)return;
    const offset=(Math.trunc(y)*width+Math.trunc(x))*4;
    pixels[offset]=color[0];pixels[offset+1]=color[1];pixels[offset+2]=color[2];pixels[offset+3]=alpha;
  };
  const fillRect=(left:number,top:number,right:number,bottom:number,color:[number,number,number])=>{
    for(let y=top;y<bottom;y+=1)for(let x=left;x<right;x+=1)setPixel(x,y,color);
  };
  const circle=(centerX:number,centerY:number,radius:number,color:[number,number,number],border:[number,number,number])=>{
    const outer=radius+3;
    for(let y=-outer;y<=outer;y+=1)for(let x=-outer;x<=outer;x+=1){
      const distance=x*x+y*y;
      if(distance<=outer*outer)setPixel(centerX+x,centerY+y,distance<=radius*radius?color:border);
    }
  };
  fillRect(0,0,width,height,[18,18,23]);
  fillRect(0,0,width,12,[181,139,50]);fillRect(0,height-12,width,height,[181,139,50]);
  fillRect(0,0,12,height,[181,139,50]);fillRect(width-12,0,width,height,[181,139,50]);
  for(let y=40;y<height-40;y+=1){
    const shade=18+Math.floor(18*y/height);
    for(let x=20;x<width-20;x+=1)setPixel(x,y,[shade,Math.max(15,shade-3),Math.max(18,shade+2)]);
  }
  // Curia floor and presiding consul's dais.
  fillRect(430,624,770,672,[82,60,39]);fillRect(480,594,720,624,[130,96,55]);
  fillRect(555,555,645,594,[181,139,50]);

  const seatColors:string[]=[];
  families.forEach((family,index)=>{
    const color=romanFamilyColor(family.name,index).hex;
    for(let seat=0;seat<Math.max(0,Math.trunc(family.senateSeats));seat+=1)seatColors.push(color);
  });
  while(seatColors.length<100)seatColors.push("#3f3f46");
  seatColors.length=100;
  const rows=[8,10,12,14,16,18,22];
  let seatIndex=0;
  rows.forEach((count,row)=>{
    const radius=150+row*66;
    const start=Math.PI+0.34,end=2*Math.PI-0.34;
    for(let position=0;position<count;position+=1){
      const angle=count===1?(start+end)/2:start+(end-start)*(position/(count-1));
      const x=Math.round(width/2+Math.cos(angle)*radius);
      const y=Math.round(670+Math.sin(angle)*radius);
      circle(x,y,12,rgb(seatColors[seatIndex++]!),[235,220,177]);
    }
  });

  const scanline=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y+=1){
    const source=y*width*4,target=y*(width*4+1);scanline[target]=0;
    pixels.copy(scanline,target+1,source,source+width*4);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=6;header[10]=0;header[11]=0;header[12]=0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(scanline,{level:9})),chunk("IEND",Buffer.alloc(0))
  ]);
}

export function romanSenateLegend(families:Pick<RomanFamilyView,"name"|"senateSeats">[]):string{
  return families.map((family,index)=>{
    const color=romanFamilyColor(family.name,index);
    return `• **${family.name}** — ${family.senateSeats} koltuk • ${color.label} \`${color.hex}\``;
  }).join("\n");
}
