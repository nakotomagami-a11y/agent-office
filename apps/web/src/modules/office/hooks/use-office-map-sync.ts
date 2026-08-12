import { useCallback, useEffect, useRef, useState } from "react";
import { getUiSettings } from "@/lib/api/ui-settings";
import {
  saveMap,
  flushMapBeacon,
  parseMap,
  readBackup,
  writeBackup,
  clearBackup,
  type OfficeMap,
  type Scope,
} from "../derive/office-map-storage";
import type { DecorationsMap } from "../components/decorations";
import type { AgentPositions } from "../components/office-map";
import type { GrassColor } from "../components/grass-colors";

export type LoadState = "loading" | "loaded" | "error";
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 1000;
const PERIODIC_FLUSH_MS = 15000;

/**
 * Single source of truth = the server. Owns the whole map lifecycle:
 *
 *  - loads once on mount; on failure exposes `loadState === "error"` and keeps
 *    saving DISABLED so a default/empty map can never overwrite good server data
 *  - on every edit: marks a local crash-backup dirty and debounces an atomic
 *    save; also flushes periodically and on tab hide/close (keepalive)
 *  - on save failure: keeps the change dirty and retries; surfaces the state so
 *    the UI can show "Save failed — Retry"
 *  - offers recovery when a local backup is newer than the server (a prior save
 *    never landed) — never applied silently
 */
export function useOfficeMapSync(opts: {
  projectId: string | null;
  custom: boolean;
  grid: boolean[][];
  decorations: DecorationsMap;
  grassColor: GrassColor;
  agentPositions: AgentPositions;
  apply: (map: OfficeMap) => void;
  onLoaded: () => void;
  setCustom: (custom: boolean) => void;
}) {
  const { projectId, custom, grid, decorations, grassColor, agentPositions, apply, onLoaded, setCustom } = opts;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pendingBackup, setPendingBackup] = useState<OfficeMap | null>(null);

  // Live map — assigned every render so periodic/unload flush reads the latest.
  const mapRef = useRef<OfficeMap>({ grid, decorations, grassColor, agentPositions });
  mapRef.current = { grid, decorations, grassColor, agentPositions };

  const scopeRef = useRef<Scope>({ projectId, custom });
  const loadStateRef = useRef<LoadState>("loading");
  loadStateRef.current = loadState;
  const lastRevRef = useRef(0);
  const dirtyRef = useRef(false);
  const justLoadedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const setCustomRef = useRef(setCustom);
  setCustomRef.current = setCustom;

  // Load the given scope from the server and apply it. `deriveCustom` reads the
  // per-project custom flag from the server first (used on mount); the custom
  // toggle instead forces a scope so it doesn't race the flag's own PATCH.
  const hydrate = useCallback(
    async (forced: Scope | null) => {
      setLoadState("loading");
      try {
        const settings = await getUiSettings();
        const scope: Scope =
          forced ??
          { projectId, custom: projectId ? settings[`office-map-custom:${projectId}`] === "true" : false };
        setCustomRef.current(scope.custom);
        scopeRef.current = scope;
        const { map, rev } = parseMap(settings, scope);
        justLoadedRef.current = true;
        applyRef.current(map);
        lastRevRef.current = rev;
        dirtyRef.current = false;
        setSaveState("idle");
        setLoadState("loaded");
        onLoadedRef.current();
        // Recovery: only if a prior save never reached the server.
        const backup = readBackup(scope);
        if (backup && backup.dirty && backup.rev > rev) setPendingBackup(backup.map);
      } catch {
        setLoadState("error");
      }
    },
    [projectId],
  );

  const load = useCallback(() => hydrate(null), [hydrate]);

  useEffect(() => {
    load();
  }, [load]);

  const doSave = useCallback(async () => {
    if (loadStateRef.current !== "loaded" || !dirtyRef.current || savingRef.current) return;
    const scope = scopeRef.current;
    const map = mapRef.current;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const rev = await saveMap(scope, map);
      lastRevRef.current = rev;
      dirtyRef.current = false;
      clearBackup(scope);
      setSaveState("saved");
    } catch {
      // Keep the change dirty + backed up so nothing is lost; UI shows Retry and
      // the periodic flush will keep retrying.
      writeBackup(scope, map, lastRevRef.current + 1, true);
      setSaveState("error");
    } finally {
      savingRef.current = false;
    }
  }, []);

  // Mark dirty + debounce a save whenever the map changes (once loaded).
  useEffect(() => {
    if (loadState !== "loaded") return;
    if (justLoadedRef.current) {
      // The change that just applied the server snapshot — not a user edit.
      justLoadedRef.current = false;
      return;
    }
    dirtyRef.current = true;
    writeBackup(scopeRef.current, mapRef.current, lastRevRef.current + 1, true);
    setSaveState((s) => (s === "saving" ? s : "dirty"));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doSave, SAVE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [grid, decorations, grassColor, agentPositions, loadState, doSave]);

  // Periodic flush — retries failed saves and catches anything the debounce missed.
  useEffect(() => {
    const id = setInterval(() => {
      if (dirtyRef.current) doSave();
    }, PERIODIC_FLUSH_MS);
    return () => clearInterval(id);
  }, [doSave]);

  // Flush on tab hide / close so an in-progress build survives navigation.
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && loadStateRef.current === "loaded") {
        flushMapBeacon(scopeRef.current, mapRef.current);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // React to custom-map toggle: enabling forks the current map into the custom
  // scope (a save under the new keys); disabling reloads the shared scope.
  useEffect(() => {
    if (loadState !== "loaded") return;
    if (scopeRef.current.custom === custom) return;
    if (custom) {
      scopeRef.current = { projectId, custom: true };
      dirtyRef.current = true;
      doSave();
    } else {
      hydrate({ projectId, custom: false });
    }
  }, [custom, projectId, loadState, doSave, hydrate]);

  const applyBackup = useCallback(() => {
    if (!pendingBackup) return;
    applyRef.current(pendingBackup);
    dirtyRef.current = true;
    setPendingBackup(null);
    doSave();
  }, [pendingBackup, doSave]);

  const discardBackup = useCallback(() => {
    clearBackup(scopeRef.current);
    setPendingBackup(null);
  }, []);

  return {
    loadState,
    saveState,
    retryLoad: load,
    retrySave: doSave,
    hasUnsavedBackup: pendingBackup !== null,
    applyBackup,
    discardBackup,
  };
}
