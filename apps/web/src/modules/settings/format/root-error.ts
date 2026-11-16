import { PROJECTS_ROOT_PROBLEMS, type ProjectsRootProblem } from "@agent-office/domain/config/projects-root";
import { ApiError } from "@/lib/api/fetch";

/** The server's reason a projects root was refused, so the page can say it instead of "nothing under that root". */
export function rootErrorCode(e: unknown): ProjectsRootProblem | null {
  const code = e instanceof ApiError ? e.data?.error : undefined;
  return (PROJECTS_ROOT_PROBLEMS as readonly unknown[]).includes(code) ? (code as ProjectsRootProblem) : null;
}

/** A refused root won't pass on retry; only a server failure is worth one more try. */
export function retryUnlessRefused(failures: number, e: unknown): boolean {
  return !(e instanceof ApiError && e.status < 500) && failures < 1;
}
