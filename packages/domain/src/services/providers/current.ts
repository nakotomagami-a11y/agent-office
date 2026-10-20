// The provider in force right now, from the store. Runs the legacy migration first, so no reader
// can ever see the "absent" state that only means "not decided yet".

import type { Provider } from "../../types/index";
import { settingsFileState } from "../settings";
import { ensureProviderMigrated } from "./migrate";
import { resolveProvider, type ProviderPresence, type ProviderResolution } from "./resolve";
import { getSelection, keyState, mappedTiers, readProvider } from "./store";
import { keyTargetUrl } from "./urls";

export function presenceFor(provider: Provider): ProviderPresence {
  const stored = readProvider(provider);
  const config = stored ? stored.config : {};
  return {
    configValid: config !== null,
    baseUrlValid: config !== null && keyTargetUrl(provider, config) !== null,
    key: keyState(provider),
    tiersMapped: mappedTiers(config).length,
  };
}

export function currentProvider(): ProviderResolution {
  ensureProviderMigrated();
  return resolveProvider(getSelection(), settingsFileState(), presenceFor);
}
