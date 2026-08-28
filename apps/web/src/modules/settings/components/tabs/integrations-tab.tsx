"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { INTEGRATIONS, getIntegration } from "@agent-office/domain/config/integrations";
import { Icon, type IconName } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { TextInput } from "@/components/ui/text-input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { useSettings, usePatchSettings } from "../../hooks/use-settings";
import {
  useAccounts,
  useRenameAccount,
  type AccountWithStatus,
  type Account,
} from "@/modules/accounts/hooks/use-accounts";
import {
  useGithubAccounts,
  useRenameGithubAccount,
  type GithubAccountWithStatus,
  type GithubAccount,
} from "@/modules/github-accounts/hooks/use-github-accounts";
import { PlanBadge } from "@/modules/accounts/components/plan-badge";
import { AddAccountModal } from "@/modules/accounts/components/add-account-modal";
import { DeleteAccountModal } from "@/modules/accounts/components/delete-account-modal";
import { AccountsStatsPanel } from "@/modules/accounts/components/accounts-stats-panel";
import { AddGithubAccountModal } from "@/modules/github-accounts/components/add-github-account-modal";
import { DeleteGithubAccountModal } from "@/modules/github-accounts/components/delete-github-account-modal";
import { useSignInModalStore } from "@/lib/sign-in-modal-store";

/**
 * Integrations — the single surface for every external system the office
 * talks to: the Claude engine, per-project git identities, and optional
 * capability toggles. Toggle state is the real settings.integrations
 * (persisted via usePatchSettings, defaulting from the INTEGRATIONS
 * registry). Claude is the always-on engine and has no registry entry / no
 * toggle. Flexbox only (house rule) — no grid.
 */

type Category = "engine" | "connections" | "capabilities";
type Kind = "claude" | "github" | "capability";

interface CardDef {
  id: string;
  name: string;
  tagline: string;
  icon: IconName;
  category: Category;
  kind: Kind;
  required?: boolean;
  experimental?: boolean;
}

const CLAUDE_DEF: CardDef = {
  id: "claude",
  name: "Claude",
  tagline: "The model behind every agent · one account per project",
  icon: "sparkle",
  category: "engine",
  kind: "claude",
  required: true,
};

// Registry is the source of truth for the optional integrations; adding an
// entry there adds a card here automatically.
const REGISTRY_CARDS: CardDef[] = INTEGRATIONS.map((def) => ({
  id: def.id,
  name: def.label,
  tagline: def.description,
  icon: def.icon as IconName,
  category: def.id === "github" ? "connections" : "capabilities",
  kind: def.id === "github" ? "github" : "capability",
  experimental: def.status === "experimental",
}));

const ALL_CARDS: CardDef[] = [CLAUDE_DEF, ...REGISTRY_CARDS];

const GROUP_KEYS: Category[] = ["engine", "connections", "capabilities"];

type Health = "connected" | "on" | "attention" | "off";

export function IntegrationsTab() {
  const t = useTranslations("integrations_tab");
  const settingsQ = useSettings();
  const patchMut = usePatchSettings();
  const accountsQ = useAccounts();
  const githubQ = useGithubAccounts();

  const [addClaude, setAddClaude] = useState(false);
  const [delClaude, setDelClaude] = useState<Account | null>(null);
  const [addGithub, setAddGithub] = useState(false);
  const [delGithub, setDelGithub] = useState<GithubAccount | null>(null);

  const stored = settingsQ.data?.integrations ?? {};
  const enabledOf = (id: string) =>
    id === "claude" ? true : (stored[id] ?? getIntegration(id)?.defaultEnabled ?? false);

  const claudeAccounts = accountsQ.data ?? [];
  const githubAccounts = githubQ.data ?? [];

  const healthOf = (def: CardDef): Health => {
    const enabled = enabledOf(def.id);
    if (!enabled && !def.required) return "off";
    if (def.kind === "claude") return claudeAccounts.some((a) => !a.ready) ? "attention" : "connected";
    if (def.kind === "github") return githubAccounts.some((a) => !a.ready) ? "attention" : "connected";
    return "on";
  };

  const stats = useMemo(() => {
    let active = 0;
    let off = 0;
    let attention = 0;
    for (const d of ALL_CARDS) {
      if (enabledOf(d.id)) active++;
      else off++;
      if (healthOf(d) === "attention") attention++;
    }
    return { active, off, attention };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, claudeAccounts, githubAccounts]);

  if (settingsQ.isLoading) return <Skeleton width="100%" height={220} />;

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="relative overflow-hidden rounded-[22px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px]">
        <div
          className="absolute -right-[60px] -top-[90px] w-[280px] h-[220px] pointer-events-none"
          style={{ background: "radial-gradient(circle at 50% 50%, rgba(139,123,255,.16), transparent 66%)" }}
          aria-hidden
        />
        <div className="relative flex items-start gap-[18px]">
          <div className="flex-1 min-w-0">
            <div className="text-[19px] font-extrabold tracking-[-0.025em]">{t("title")}</div>
            <div className="text-[12px] leading-[1.6] text-txt-3 mt-[6px] max-w-[520px] text-pretty">
              {t("hero_sub")}
            </div>
          </div>
          <div className="flex items-center gap-[8px] shrink-0">
            <HeroStat value={stats.active} label={t("stat_active")} dot="bg-green" />
            <HeroStat value={stats.off} label={t("stat_off")} dot="bg-txt-4" />
            {stats.attention > 0 ? <HeroStat value={stats.attention} label={t("stat_attention")} dot="bg-red" /> : null}
          </div>
        </div>
      </div>

      {GROUP_KEYS.map((key) => {
        const items = ALL_CARDS.filter((d) => d.category === key);
        if (items.length === 0) return null;
        return (
          <div key={key} className="flex flex-col gap-[14px]">
            <div className="flex items-center gap-[9px] px-[4px]">
              <span className="text-[9.5px] font-extrabold tracking-[0.1em] uppercase text-txt-4 whitespace-nowrap">
                {t(`group_${key}_label`)}
              </span>
              <span className="text-[10.5px] text-txt-4 whitespace-nowrap">{t(`group_${key}_hint`)}</span>
              <span className="flex-1 h-px bg-edge" aria-hidden />
            </div>

            {key === "capabilities" ? (
              <div className="flex flex-wrap gap-[12px]">
                {items.map((def) => (
                  <CapabilityCard
                    key={def.id}
                    def={def}
                    enabled={enabledOf(def.id)}
                    busy={patchMut.isPending}
                    onToggle={(next) => patchMut.mutate({ integrations: { [def.id]: next } })}
                  />
                ))}
              </div>
            ) : (
              items.map((def) => (
                <div key={def.id} className="rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden">
                  <div className="flex items-center gap-[13px] px-[20px] py-[16px]">
                    <span className="w-[38px] h-[38px] shrink-0 flex items-center justify-center rounded-[13px] bg-acc-soft text-acc shadow-[inset_0_0_0_1px_var(--acc-line)]">
                      <Icon name={def.icon} size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-[9px]">
                        <span className="text-[15px] font-bold whitespace-nowrap">{def.name}</span>
                        {def.required ? <TagChip icon="lock" label={t("required_tag")} /> : null}
                      </div>
                      <span className="text-[11.5px] text-txt-4 whitespace-nowrap">
                        {def.id === "claude" ? t("claude_tagline") : def.tagline}
                      </span>
                    </div>
                    <div className="flex items-center gap-[12px] shrink-0">
                      <HealthPill health={healthOf(def)} />
                      {def.required ? null : (
                        <Switch
                          checked={enabledOf(def.id)}
                          onChange={(next) => patchMut.mutate({ integrations: { [def.id]: next } })}
                          disabled={patchMut.isPending}
                          label={t("enable_aria", { name: def.name })}
                        />
                      )}
                    </div>
                  </div>

                  {(def.required || enabledOf(def.id)) &&
                    (def.kind === "claude" ? (
                      <ClaudeAccountsPanel
                        accounts={claudeAccounts}
                        onAdd={() => setAddClaude(true)}
                        onDelete={setDelClaude}
                      />
                    ) : def.kind === "github" ? (
                      <GithubAccountsPanel
                        accounts={githubAccounts}
                        onAdd={() => setAddGithub(true)}
                        onDelete={setDelGithub}
                      />
                    ) : null)}
                </div>
              ))
            )}
          </div>
        );
      })}

      <AddAccountModal open={addClaude} onClose={() => setAddClaude(false)} />
      <DeleteAccountModal account={delClaude} onClose={() => setDelClaude(null)} />
      <AddGithubAccountModal open={addGithub} onClose={() => setAddGithub(false)} />
      <DeleteGithubAccountModal account={delGithub} onClose={() => setDelGithub(null)} />
    </div>
  );
}

// ── Hero stat pill ──────────────────────────────────────────────────────────

function HeroStat({ value, label, dot }: { value: number; label: string; dot: string }) {
  return (
    <span className="flex items-center gap-[7px] py-[7px] px-[13px] rounded-full bg-card-2 border border-edge shadow-[var(--inset-hi)] whitespace-nowrap">
      <span className={cn("w-[6px] h-[6px] rounded-full", dot)} aria-hidden />
      <span className="font-mono text-[12px] font-bold">{value}</span>
      <span className="text-[10.5px] font-semibold text-txt-4">{label}</span>
    </span>
  );
}

// ── Capability card ─────────────────────────────────────────────────────────

function CapabilityCard({
  def,
  enabled,
  busy,
  onToggle,
}: {
  def: CardDef;
  enabled: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("integrations_tab");
  return (
    <div className="flex-1 basis-[300px] min-w-0 flex items-start gap-[13px] rounded-[22px] surface-sheen shadow-[var(--lift)] px-[18px] py-[16px]">
      <span
        className={cn(
          "w-[38px] h-[38px] shrink-0 flex items-center justify-center rounded-[12px]",
          enabled ? "bg-acc-soft text-acc shadow-[inset_0_0_0_1px_var(--acc-line)]" : "bg-card-2 text-txt-4 shadow-[inset_0_0_0_1px_var(--edge)]",
        )}
      >
        <Icon name={def.icon} size={17} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[8px]">
          <span className="text-[13.5px] font-bold whitespace-nowrap">{def.name}</span>
          {def.experimental ? <TagChip label={t("experimental_tag")} tone="warn" /> : null}
        </div>
        <div className="text-[11.5px] leading-[1.5] text-txt-4 mt-[4px] text-pretty">{def.tagline}</div>
      </div>
      <Switch checked={enabled} onChange={onToggle} disabled={busy} label={t("enable_aria", { name: def.name })} />
    </div>
  );
}

// ── Claude account manager ──────────────────────────────────────────────────

function ClaudeAccountsPanel({
  accounts,
  onAdd,
  onDelete,
}: {
  accounts: AccountWithStatus[];
  onAdd: () => void;
  onDelete: (account: Account) => void;
}) {
  const t = useTranslations("integrations_tab");
  return (
    <>
      <div className="flex items-center gap-[10px] px-[20px] py-[11px] border-t border-edge bg-card-2">
        <span className="text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4 whitespace-nowrap">
          {t("account_count", { count: accounts.length })}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-[6px] py-[6px] px-[13px] rounded-[11px] bg-card border border-edge shadow-[var(--inset-hi)] text-txt-2 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-acc hover:border-acc-line"
        >
          <Icon name="plus" size={11} /> {t("add_account")}
        </button>
      </div>
      {accounts.length === 0 ? (
        <EmptyAccounts icon="sparkle" />
      ) : (
        accounts.map((a) => <ClaudeAccountRow key={a.id} account={a} onDelete={() => onDelete(a)} />)
      )}
      <div className="px-[20px] py-[13px] border-t border-edge">
        <AccountsStatsPanel />
      </div>
    </>
  );
}

function ClaudeAccountRow({ account, onDelete }: { account: AccountWithStatus; onDelete: () => void }) {
  const t = useTranslations("integrations_tab");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.label);
  const rename = useRenameAccount();
  const openSignIn = useSignInModalStore((s) => s.open);
  const isDefault = account.id === "default";

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === account.label) {
      setEditing(false);
      setDraft(account.label);
      return;
    }
    try {
      await rename.mutateAsync({ id: account.id, label: trimmed });
    } finally {
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-[13px] px-[20px] py-[13px] border-t border-edge transition-colors duration-150 hover:bg-card-2">
      <Icon name="users" size={15} className="text-txt-4 shrink-0" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commit(); }
              else if (e.key === "Escape") { setDraft(account.label); setEditing(false); }
            }}
            autoFocus
            className="h-[24px]"
          />
        ) : (
          <div className="flex items-center gap-[9px]">
            <span className="text-[13px] font-bold whitespace-nowrap">{account.label}</span>
            <PlanBadge plan={account.plan} />
            {!account.ready ? (
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-red whitespace-nowrap">
                {t("needs_login")}
              </span>
            ) : null}
          </div>
        )}
        <span className="font-mono text-[10.5px] text-txt-4 mt-[4px] block truncate">
          {isDefault ? t("claude_shared_path") : account.configDir}
          {account.email ? ` · ${account.email}` : ""}
        </span>
      </div>
      {!editing ? (
        <div className="flex items-center gap-[4px] shrink-0">
          {!account.ready ? (
            <button
              type="button"
              onClick={() => openSignIn({ accountId: account.id })}
              className="flex items-center gap-[6px] py-[6px] px-[12px] rounded-[10px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[11.5px] font-bold whitespace-nowrap cursor-pointer"
            >
              <Icon name="external-link" size={11} /> {t("sign_in")}
            </button>
          ) : null}
          <IconBtn icon="pen" label={t("rename_aria", { name: account.label })} onClick={() => setEditing(true)} />
          {!isDefault ? <IconBtn icon="trash" label={t("remove_aria", { name: account.label })} danger onClick={onDelete} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── GitHub account manager ──────────────────────────────────────────────────

function GithubAccountsPanel({
  accounts,
  onAdd,
  onDelete,
}: {
  accounts: GithubAccountWithStatus[];
  onAdd: () => void;
  onDelete: (account: GithubAccount) => void;
}) {
  const t = useTranslations("integrations_tab");
  return (
    <>
      <div className="flex items-center gap-[10px] px-[20px] py-[11px] border-t border-edge bg-card-2">
        <span className="text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4 whitespace-nowrap">
          {t("account_count", { count: accounts.length })}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-[6px] py-[6px] px-[13px] rounded-[11px] bg-card border border-edge shadow-[var(--inset-hi)] text-txt-2 text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-acc hover:border-acc-line"
        >
          <Icon name="plus" size={11} /> {t("add_account")}
        </button>
      </div>
      {accounts.length === 0 ? (
        <EmptyAccounts icon="branch" />
      ) : (
        accounts.map((a) => <GithubAccountRow key={a.id} account={a} onDelete={() => onDelete(a)} />)
      )}
    </>
  );
}

function GithubAccountRow({ account, onDelete }: { account: GithubAccountWithStatus; onDelete: () => void }) {
  const t = useTranslations("integrations_tab");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.label);
  const rename = useRenameGithubAccount();
  const isDefault = account.id === "default";

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === account.label) {
      setEditing(false);
      setDraft(account.label);
      return;
    }
    try {
      await rename.mutateAsync({ id: account.id, label: trimmed });
    } finally {
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-[13px] px-[20px] py-[13px] border-t border-edge transition-colors duration-150 hover:bg-card-2">
      <Icon name="branch" size={15} className="text-txt-4 shrink-0" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commit(); }
              else if (e.key === "Escape") { setDraft(account.label); setEditing(false); }
            }}
            autoFocus
            className="h-[24px]"
          />
        ) : (
          <div className="flex items-center gap-[9px]">
            <span className="text-[13px] font-bold whitespace-nowrap">{account.label}</span>
            {account.username ? <span className="font-mono text-[11px] text-txt-3 whitespace-nowrap">@{account.username}</span> : null}
            {!account.ready ? (
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-red whitespace-nowrap">
                {t("needs_login")}
              </span>
            ) : null}
          </div>
        )}
        <span className="font-mono text-[10.5px] text-txt-4 mt-[4px] block truncate">
          {isDefault ? t("github_system_path") : account.configDir}
        </span>
      </div>
      {!editing ? (
        <div className="flex items-center gap-[4px] shrink-0">
          <IconBtn icon="pen" label={t("rename_aria", { name: account.label })} onClick={() => setEditing(true)} />
          {!isDefault ? <IconBtn icon="trash" label={t("remove_aria", { name: account.label })} danger onClick={onDelete} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Small parts ────────────────────────────────────────────────────────────

function EmptyAccounts({ icon }: { icon: IconName }) {
  const t = useTranslations("integrations_tab");
  return (
    <div className="flex flex-col items-center justify-center gap-[8px] py-[22px] text-center border-t border-edge">
      <Icon name={icon} size={18} className="text-txt-4" />
      <span className="text-[12px] text-txt-3 max-w-[300px]">
        {t("empty_accounts")}
      </span>
    </div>
  );
}

function HealthPill({ health }: { health: Health }) {
  const t = useTranslations("integrations_tab");
  const map = {
    connected: { label: t("health_connected"), dot: "bg-green", text: "text-txt-2" },
    on: { label: t("health_on"), dot: "bg-green", text: "text-txt-2" },
    attention: { label: t("health_attention"), dot: "bg-red", text: "text-red" },
    off: { label: t("health_off"), dot: "bg-txt-4", text: "text-txt-4" },
  } as const;
  const s = map[health];
  return (
    <span className={cn("flex items-center gap-[7px] text-[12px] font-semibold whitespace-nowrap", s.text)}>
      <span className={cn("w-[6px] h-[6px] rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

function TagChip({ label, icon, tone = "neutral" }: { label: string; icon?: IconName; tone?: "neutral" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[4px] py-[1.5px] px-[8px] rounded-full text-[9px] font-extrabold uppercase tracking-[0.06em] whitespace-nowrap",
        tone === "warn" ? "bg-amber-soft text-amber" : "bg-card-3 text-txt-4",
      )}
    >
      {icon ? <Icon name={icon} size={9} /> : null}
      {label}
    </span>
  );
}

function IconBtn({ icon, label, danger, onClick }: { icon: IconName; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center w-[28px] h-[28px] rounded-[9px] bg-card-2 border border-edge cursor-pointer transition-all duration-150",
        danger ? "text-txt-4 hover:text-red hover:border-red" : "text-txt-4 hover:text-txt hover:border-txt-4",
      )}
    >
      <Icon name={icon} size={12} />
    </button>
  );
}
