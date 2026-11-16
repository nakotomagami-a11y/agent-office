// Why a projects root was refused (`services/settings.ts` projectsRootProblem). Browser-safe: the UI maps each to a sentence.

export const PROJECTS_ROOT_PROBLEMS = [
  "root_not_absolute",
  "root_not_local",
  "root_is_drive_root",
  "root_contains_home",
  "root_drive_missing",
  "root_not_a_directory",
  "root_unreadable",
] as const;
export type ProjectsRootProblem = (typeof PROJECTS_ROOT_PROBLEMS)[number];
