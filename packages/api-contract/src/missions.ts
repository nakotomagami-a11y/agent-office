// Request bodies for /api/missions/* (docs/missions.md).
import { z } from "zod";
import { MAX_RECIPIENTS, MISSION_ID, SEAT_ID, SEAT_OS, TO_ALL, TO_HUMAN } from "@agent-office/domain/config/missions";

// A NUL byte cannot cross a process boundary (gh, git): refuse it here, not as a 500 later.
const NO_NUL = /^[^\0]*$/;
const seat = z.string().regex(SEAT_ID, "seat_id").refine((s) => s !== TO_HUMAN && s !== TO_ALL, "seat_id");
const usd = z.number().positive().max(1000);
const id = z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/, "project_id");

export const missionIdSchema = z.string().regex(MISSION_ID, "mission_id");
/** A comment id path segment: plain digits only. */
export const commentIdSchema = z.string().regex(/^[1-9]\d{0,15}$/, "comment_id").transform(Number);

export const missionSeatSpecSchema = z.object({
  seat,
  agent: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, "agent_id"),
  os: z.enum(SEAT_OS),
  brief: z.string().max(4000).regex(NO_NUL, "nul_byte"),
});

export const missionStartSchema = z.object({
  projectId: id,
  title: z.string().trim().min(1).max(200).regex(NO_NUL, "nul_byte"),
  goal: z.string().max(8000).regex(NO_NUL, "nul_byte"),
  budgetUsd: usd,
  capUsd: usd,
  seats: z.array(missionSeatSpecSchema).min(1).max(MAX_RECIPIENTS),
});

export const missionClaimSchema = z.object({
  projectId: id,
  pr: z.number().int().positive(),
  seat,
  capUsd: usd,
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/, "manifest_hash"),
});

export const missionClaimDecisionSchema = z.object({ accept: z.boolean() });

export const missionAnswerSchema = z.object({ text: z.string().trim().min(1).max(8000).regex(NO_NUL, "nul_byte") });

export const missionActSchema = z.object({
  act: z.enum(["pause", "resume", "close"]),
  seats: z.array(seat).max(MAX_RECIPIENTS).default([]),
});

export const missionLeaveSchema = z.object({ seat });

export const missionCapSchema = z.object({ seat, byUsd: usd });
