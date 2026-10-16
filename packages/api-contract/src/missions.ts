// Request bodies for /api/missions/* (docs/missions.md).
import { z } from "zod";
import { AGENT_ID, MAX_RECIPIENTS, MAX_USD, MISSION_ID, MISSION_LIMITS, SEAT_ID, SEAT_OS, TO_ALL, TO_HUMAN } from "@agent-office/domain/config/missions";

// A NUL byte cannot cross a process boundary (gh, git): refuse it here, not as a 500 later.
const NO_NUL = /^[^\0]*$/;
const seat = z.string().regex(SEAT_ID, "seat_id").refine((s) => s !== TO_HUMAN && s !== TO_ALL, "seat_id");
const usd = z.number().positive().max(MAX_USD);
const id = z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/, "project_id");

export const missionIdSchema = z.string().regex(MISSION_ID, "mission_id");
/** A comment id path segment: plain digits only. */
export const commentIdSchema = z.string().regex(/^[1-9]\d{0,15}$/, "comment_id").transform(Number).refine(Number.isSafeInteger, "comment_id");

export const missionSeatSpecSchema = z.object({
  seat,
  agent: z.string().regex(AGENT_ID, "agent_id"),
  os: z.enum(SEAT_OS),
  brief: z.string().max(MISSION_LIMITS.briefChars).regex(NO_NUL, "nul_byte"),
});

export const missionStartSchema = z.object({
  projectId: id,
  title: z.string().trim().min(1).max(MISSION_LIMITS.titleChars).regex(NO_NUL, "nul_byte"),
  goal: z.string().max(MISSION_LIMITS.goalChars).regex(NO_NUL, "nul_byte"),
  budgetUsd: usd,
  capUsd: usd,
  seats: z.array(missionSeatSpecSchema).min(1).max(MAX_RECIPIENTS),
  /** The human confirmed that a public repo makes every post and this device's name public. */
  allowPublic: z.boolean().default(false),
}).refine((b) => b.capUsd <= b.budgetUsd, { message: "cap_over_budget", path: ["capUsd"] });

export const missionClaimSchema = z.object({
  projectId: id,
  pr: z.number().int().positive(),
  seat,
  capUsd: usd,
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/, "manifest_hash"),
  allowPublic: z.boolean().default(false),
});

export const missionClaimDecisionSchema = z.object({ accept: z.boolean() });

export const missionAnswerSchema = z.object({ text: z.string().trim().min(1).max(MISSION_LIMITS.answerChars).regex(NO_NUL, "nul_byte") });

export const missionActSchema = z.object({
  /** `evict`: the lead frees a seat whose device is gone, so it can be claimed again. */
  act: z.enum(["pause", "resume", "close", "evict"]),
  seats: z.array(seat).max(MAX_RECIPIENTS).default([]),
});

export const missionLeaveSchema = z.object({ seat });

export const missionCapSchema = z.object({ seat, byUsd: usd });
