"use client";

import { useState, useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@agent-office/domain/hooks/api";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { exportProject, importState } from "@/lib/api/save";
import type { Project } from "@agent-office/domain/types";
import type { PendingDangerAction } from "../components/project-danger-zone";

/**
 * Bundles the project dashboard's imperative side effects (export, import,
 * reset-roster/delete) behind one hook so `ProjectDetail` stays a thin
 * layout composition instead of a 150-line function body.
 *
 * Takes `project` as possibly-`undefined` and called unconditionally
 * (before `ProjectDetail`'s loading/not-found early returns) so the
 * `useState`/`useRef` calls inside never run conditionally — the handlers
 * just no-op until the project has loaded, which matches every render path
 * that could actually invoke them (the buttons that call these aren't
 * mounted until `project` exists).
 */
export function useProjectDetailActions(
  projectId: string,
  project: Project | undefined,
  onProjectRefetch: () => Promise<unknown>,
) {
  const t = useTranslations();
  const router = useRouter();

  const [includeHistory, setIncludeHistory] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pendingDanger, setPendingDanger] = useState<PendingDangerAction>(null);
  const [dangerWorking, setDangerWorking] = useState(false);

  const handleExport = async () => {
    if (!project) return;
    const blob = await exportProject(projectId, includeHistory).catch(() => null);
    if (!blob) return;
    const slug = project.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${slug}-agent-office.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const data = await importState(json);
      setImportStatus({ ok: true, msg: t("project_detail.import_success", { count: data.agentCount ?? 0 }) });
    } catch (err) {
      const msg = err instanceof ApiError ? ((err.data?.detail as string | undefined) ?? err.message) : String(err);
      setImportStatus({ ok: false, msg });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDangerConfirm = async () => {
    if (!pendingDanger || !project) return;
    setDangerWorking(true);
    try {
      if (pendingDanger === "delete") {
        await apiFetch(API_ROUTES.project(projectId), { method: "DELETE" });
        router.push("/");
        return;
      }
      for (const inst of project.meta.roster) {
        await apiFetch(API_ROUTES.projectRosterItem(projectId, inst.instanceId), { method: "DELETE" });
      }
      await onProjectRefetch();
      setPendingDanger(null);
    } finally {
      setDangerWorking(false);
    }
  };

  return {
    backup: { includeHistory, setIncludeHistory, importing, importStatus, fileRef, onExport: handleExport, onImportFile: handleImport },
    danger: { pendingDanger, dangerWorking, setPendingDanger, onConfirm: handleDangerConfirm },
  };
}
