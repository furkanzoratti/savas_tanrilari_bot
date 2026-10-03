export function playerMentionPayload(playerIds:readonly string[],fallback:string):{
  content:string;allowedMentions:{users:string[]};
}{
  const users=[...new Set(playerIds.map((id)=>id.trim()).filter(Boolean))];
  return{
    content:users.length?users.map((id)=>`<@${id}>`).join(" "):fallback,
    allowedMentions:{users}
  };
}
