export function mercenaryCompanyAutocompleteAllowed(commandName: string, subcommand: string, gameMaster: boolean): boolean {
  return gameMaster || (commandName === "parali-asker" && ["kirala", "feshet"].includes(subcommand));
}

export function mercenarySubcommandRequiresGameMaster(subcommand: string): boolean {
  return !["kirala", "feshet"].includes(subcommand);
}
