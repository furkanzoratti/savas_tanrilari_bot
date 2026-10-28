export function compactUuid(uuid:string):string{
  const hex=uuid.replaceAll("-","");
  if(!/^[0-9a-f]{32}$/iu.test(hex))throw new Error("Etkileşim kimliği geçersiz.");
  return Buffer.from(hex,"hex").toString("base64url");
}

export function expandUuid(value:string):string{
  const hex=Buffer.from(value,"base64url").toString("hex");
  if(!/^[0-9a-f]{32}$/u.test(hex))throw new Error("Etkileşim kimliği geçersiz.");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
