// Skill weapon-icon class catalog — the procedural icon families a skill can use.
// Runtime const + derived type + guard together (mirrors config/run-errors).
export const SKILL_ICON_CLASSES = ["any", "anyweapon", "blades", "spears", "axes", "staffs", "tridents", "shields"] as const;

export type SkillIconClass = (typeof SKILL_ICON_CLASSES)[number];

export function isSkillIconClass(v: unknown): v is SkillIconClass {
  return typeof v === "string" && (SKILL_ICON_CLASSES as readonly string[]).includes(v);
}
