import assert from "node:assert";
import { test } from "node:test";
import type { KeyboardEvent } from "react";
import { useComposerKeyboard, type UseComposerKeyboardInput } from "./use-composer-keyboard";

function useSetup(over: Partial<UseComposerKeyboardInput> = {}) {
  const calls: string[] = [];
  const input: UseComposerKeyboardInput = {
    slashOpen: true,
    setSlashOpen: () => calls.push("closeSlash"),
    slashIdx: 0,
    setSlashIdx: () => calls.push("moveSlash"),
    filteredSlashLength: 1,
    onPickSlash: () => calls.push("pickSlash"),
    onRunSlash: () => calls.push("runSlash"),
    promptsOpen: true,
    setPromptsOpen: () => calls.push("closePrompts"),
    promptsIdx: 0,
    setPromptsIdx: () => calls.push("movePrompts"),
    filteredPromptsLength: 2,
    onPickPrompt: () => calls.push("pickPrompt"),
    onSend: () => calls.push("send"),
    onOpenMissions: () => calls.push("missions"),
    ...over,
  };
  const onKey = useComposerKeyboard(input);
  const press = (key: string, mods: { shiftKey?: boolean } = {}) =>
    onKey({ key, shiftKey: false, ctrlKey: false, metaKey: false, ...mods, preventDefault: () => {} } as unknown as KeyboardEvent<HTMLTextAreaElement>);
  return { calls, press };
}

test("Enter on the visible slash menu runs the highlighted command, not a hidden saved prompt or a send", () => {
  const { calls, press } = useSetup();
  press("Enter");
  assert.deepStrictEqual(calls, ["runSlash"]);
});

test("Tab on the slash menu inserts the command", () => {
  const { calls, press } = useSetup();
  press("Tab");
  assert.deepStrictEqual(calls, ["pickSlash"]);
});

test("with no slash match, Enter picks from the saved-prompts menu", () => {
  const { calls, press } = useSetup({ filteredSlashLength: 0 });
  press("Enter");
  assert.deepStrictEqual(calls, ["pickPrompt"]);
});

test("Shift+Enter never runs a command", () => {
  const { calls, press } = useSetup({ promptsOpen: false });
  press("Enter", { shiftKey: true });
  assert.deepStrictEqual(calls, []);
});

test("with no menu open, Enter sends", () => {
  const { calls, press } = useSetup({ slashOpen: false, promptsOpen: false });
  press("Enter");
  assert.deepStrictEqual(calls, ["send"]);
});
