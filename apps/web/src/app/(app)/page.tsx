"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PAGE_ROUTES } from "@/lib/page-routes";
import { useActiveProjectStore } from "@/lib/active-project-store";

/**
 * Root route ("/") has no page of its own: it lands on the active project's
 * dashboard, or the projects list if none is open (same fallback the
 * "Project" nav entry uses). Waits until the stored active project has been
 * read: until then the store says "no project".
 */
export default function RootPage() {
  const router = useRouter();
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const loaded = useActiveProjectStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) return;
    router.replace(activeProjectId ? PAGE_ROUTES.project(activeProjectId) : PAGE_ROUTES.projects);
  }, [loaded, activeProjectId, router]);

  return null;
}
