import * as darwin from "./darwin";
import * as linux from "./linux";
import type { ProcessScanner } from "./probe";
import * as windows from "./windows";

export type { Listener, ProcDetails, ProcessScanner } from "./probe";
export { readProcUid } from "./linux";

const SCANNERS: Partial<Record<NodeJS.Platform, ProcessScanner>> = { linux, darwin, win32: windows };

/** undefined on a platform with no scanner: the Servers list is then empty. */
export const scanner: ProcessScanner | undefined = SCANNERS[process.platform];
