export function mercenaryCompanyAutocompleteAllowed(commandName: string, subcommand: string, gameMaster: boolean): boolean {
  return gameMaster || (commandName === "parali-asker" && subcommand === "kirala");
}

export function mercenarySubcommandRequiresGameMaster(subcommand: string): boolean {
  return subcommand !== "kirala";
}
