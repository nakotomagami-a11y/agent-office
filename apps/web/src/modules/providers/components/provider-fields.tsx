"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { Provider, ProviderView } from "@agent-office/domain/types";
import { MODEL_TIERS, type ModelTier } from "@agent-office/domain/config/providers";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import { baseUrlProblem, allTiersShare, withModelForAllTiers } from "../format/provider-format";
import { keyWillBeCleared, type ProviderDraft } from "../format/provider-draft";
import { useDeleteProviderKey } from "../hooks/use-providers";

const LOCAL_PRESETS = [
  { id: "ollama", url: "http://localhost:11434/v1" },
  { id: "lmstudio", url: "http://localhost:1234/v1" },
] as const;

const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="text-[11px] font-bold uppercase tracking-[0.06em] text-txt-3">
    {children}
  </label>
);

const Hint = ({ id, children, tone }: { id?: string; children: React.ReactNode; tone?: "warn" | "bad" }) => (
  <p id={id} className={`m-0 text-[11.5px] leading-[1.55] text-pretty ${tone === "bad" ? "text-red" : tone === "warn" ? "text-amber" : "text-txt-3"}`}>
    {children}
  </p>
);

/** Write-only: a saved key shows its last four characters and can only be replaced or removed. */
function KeyField({ provider, draft, view, onEdit, onEnter }: FieldsProps) {
  const t = useTranslations("providers");
  const id = useId();
  const remove = useDeleteProviderKey();
  const [replacing, setReplacing] = useState(false);
  const required = provider !== "local";
  const saved = Boolean(view?.keyHint) && !keyWillBeCleared(draft, view);
  const showInput = !saved || replacing;
  return (
    <div className="flex flex-col gap-[6px]">
      <Label htmlFor={id}>{required ? t("key_label") : t("key_label_optional")}</Label>
      {saved && !replacing ? (
        <div className="flex items-center gap-[10px] rounded-xl border border-edge bg-card-2 px-[12px] py-[8px]">
          <Icon name="lock" size={13} className="shrink-0 text-txt-3" />
          <span className="flex-1 font-mono text-[12px]">{t("key_saved", { hint: view?.keyHint ?? "" })}</span>
          <button type="button" onClick={() => setReplacing(true)} className="text-[11.5px] font-semibold text-acc hover:underline">
            {t("key_replace")}
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate(provider)}
            className="text-[11.5px] font-semibold text-txt-3 hover:text-red hover:underline disabled:opacity-50"
          >
            {t("key_remove")}
          </button>
        </div>
      ) : null}
      {showInput ? (
        <TextInput
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft.apiKey}
          onChange={(e) => onEdit({ apiKey: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onEnter()}
          placeholder={t("key_placeholder")}
          aria-describedby={`${id}-hint`}
          className="font-mono"
        />
      ) : null}
      <Hint id={`${id}-hint`}>{t("key_write_only")}</Hint>
      {keyWillBeCleared(draft, view) ? <Hint tone="warn">{t("key_clears_warning")}</Hint> : null}
    </div>
  );
}

function BaseUrlField({ provider, draft, onEdit, onEnter }: FieldsProps) {
  const t = useTranslations("providers");
  const id = useId();
  const problem = baseUrlProblem(draft.baseUrl);
  const local = provider === "local";
  return (
    <div className="flex flex-col gap-[6px]">
      <Label htmlFor={id}>{t(local ? "url_label_local" : "url_label_openai")}</Label>
      <TextInput
        id={id}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={draft.baseUrl}
        onChange={(e) => onEdit({ baseUrl: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder={t(local ? "url_placeholder_local" : "url_placeholder_openai")}
        invalid={problem !== null}
        aria-describedby={`${id}-hint`}
        className="font-mono"
      />
      {problem ? (
        <Hint id={`${id}-hint`} tone="bad">{t(problem === "credentials" ? "url_credentials" : "url_invalid")}</Hint>
      ) : (
        <Hint id={`${id}-hint`}>{t(local ? "url_hint_local" : "url_hint_openai")}</Hint>
      )}
      {local ? (
        <div className="flex flex-wrap items-center gap-[6px]">
          {LOCAL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onEdit({ baseUrl: p.url })}
              className="rounded-full border border-edge bg-card-2 px-[10px] py-[3px] text-[11px] font-semibold text-txt-2 hover:border-acc-line hover:text-acc"
            >
              {t(`url_preset_${p.id}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModelFields({ provider, draft, onEdit, available }: FieldsProps & { available: string[] }) {
  const t = useTranslations("providers");
  const listId = useId();
  const shared = allTiersShare(draft.models);
  const anyTier = MODEL_TIERS.some((tier) => draft.models[tier]);
  const [perTier, setPerTier] = useState(provider === "openai" || (anyTier && shared === null));
  const setTier = (tier: ModelTier, value: string) => {
    const { [tier]: _dropped, ...rest } = draft.models;
    onEdit({ models: value.trim() === "" ? rest : { ...rest, [tier]: value } });
  };
  return (
    <div className="flex flex-col gap-[8px]">
      <datalist id={listId}>{available.map((m) => <option key={m} value={m} />)}</datalist>
      {perTier ? (
        <>
          <Hint>{t("models_hint")}</Hint>
          {(["haiku", "sonnet", "opus"] as const).map((tier) => {
            const id = `${listId}-${tier}`;
            return (
              <div key={tier} className="flex flex-col gap-[4px]">
                <Label htmlFor={id}>{t(`tier_${tier}`)}</Label>
                <TextInput id={id} list={listId} autoComplete="off" spellCheck={false} value={draft.models[tier] ?? ""} onChange={(e) => setTier(tier, e.target.value)} className="font-mono" />
              </div>
            );
          })}
        </>
      ) : (
        <div className="flex flex-col gap-[4px]">
          <Label htmlFor={`${listId}-one`}>{t("model_one_label")}</Label>
          <TextInput
            id={`${listId}-one`}
            list={listId}
            autoComplete="off"
            spellCheck={false}
            value={shared ?? ""}
            onChange={(e) => onEdit({ models: e.target.value.trim() ? withModelForAllTiers(e.target.value) : {} })}
            placeholder={t("model_placeholder")}
            className="font-mono"
          />
          <Hint>{t("model_one_hint")}</Hint>
        </div>
      )}
      {provider === "local" ? (
        <button type="button" onClick={() => setPerTier((v) => !v)} className="self-start text-[11.5px] font-semibold text-acc hover:underline">
          {t(perTier ? "model_use_one" : "model_use_per_tier")}
        </button>
      ) : null}
    </div>
  );
}

interface FieldsProps {
  provider: Provider;
  draft: ProviderDraft;
  view: ProviderView | undefined;
  onEdit: (patch: Partial<ProviderDraft>) => void;
  /** Enter in a field runs the test, like a form submit would. */
  onEnter: () => void;
}

/** The inputs for the picked provider. The subscription has none: its sign-in lives in the test panel. */
export function ProviderFields(props: FieldsProps & { availableModels: string[] }) {
  const t = useTranslations("providers");
  const [advanced, setAdvanced] = useState(false);
  const { provider } = props;
  if (provider === "subscription") return null;
  const hasAdvanced = provider === "openai" || provider === "local";
  return (
    <div className="flex flex-col gap-[14px]">
      {provider === "local" ? <BaseUrlField {...props} /> : <KeyField {...props} />}
      {hasAdvanced ? <ModelFields {...props} available={props.availableModels} /> : null}
      {hasAdvanced ? (
        <>
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((v) => !v)}
            className="flex items-center gap-[6px] self-start text-[11.5px] font-semibold text-txt-2 hover:text-acc"
          >
            <Icon name="chevron" size={11} className={advanced ? "rotate-90" : undefined} />
            {t("advanced")}
          </button>
          {advanced ? (provider === "local" ? <KeyField {...props} /> : <BaseUrlField {...props} />) : null}
        </>
      ) : null}
    </div>
  );
}
