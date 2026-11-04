const FLAG_FILES:Record<string,string>={
  "anadolu kralligi":"anadolu-kralligi.webp",
  "bosporos kralligi":"bosporos-kralligi.webp",
  "buyuk kartaca":"buyuk-kartaca.webp",
  "gaut kralligi":"gaut-kralligi.webp",
  "iberya":"iberya.webp",
  "iransahr":"iransahr.webp",
  "nil imparatorlugu":"nil-imparatorlugu.webp",
  "persis":"iransahr.webp",
  "roma":"roma.webp",
  "saketler":"saketler.webp",
  "sarmatya":"sarmatya.webp",
  "satraplar":"satraplar.webp",
  "sebe":"sebe.webp",
  "trakya":"trakya.webp",
  "xianbei konfederasyonu":"xianbei-konfederasyonu.webp"
};

const normalize=(value:string):string=>value.trim().toLocaleLowerCase("tr-TR")
  .replaceAll("ı","i").replaceAll("ğ","g").replaceAll("ü","u")
  .replaceAll("ş","s").replaceAll("ö","o").replaceAll("ç","c")
  .replace(/\s+/gu," ");

export const MOVEMENT_MAP_FLAG_FILENAMES=new Set(Object.values(FLAG_FILES));

export function movementMapFlagFilename(countryName:string):string|null{
  return FLAG_FILES[normalize(countryName)]??null;
}

export function movementMapFlagUrl(countryName:string):string|null{
  const filename=movementMapFlagFilename(countryName);
  return filename?`/movement-map-flags/${filename}`:null;
}
