/** Wraps a string in bash single quotes, escaping internal single quotes as `'\''`. */
export function quoteBash(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Wraps a string in PowerShell single quotes, doubling internal single quotes.
 *
 * Embedded double quotes are escaped as `\"`. Windows PowerShell 5.1 strips the
 * PowerShell-level quoting and then re-joins native-command arguments into one
 * command line, without re-escaping `"`; the target executable's argv parser
 * then treats a bare `"` as a quote toggle and truncates or splits the argument.
 * `\"` survives that round trip as a literal `"`.
 */
export function quotePowerShell(str: string): string {
  return `'${str.replace(/'/g, "''").replace(/"/g, '\\"')}'`;
}

/** Quotes for the shell that will run the command: PowerShell on win32, bash elsewhere. */
export function quoteForShell(str: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? quotePowerShell(str) : quoteBash(str);
}
