// Request bodies for /api/projects/:id/reviews/* (the Review Lectern; docs/minecraft-review-lectern.md).
import { z } from "zod";
import { DIFF_SIDES, MAX_REVIEW_COMMENTS, MAX_REVIEW_TEXT, REVIEW_EVENTS } from "@agent-office/domain/config/review";

const sha = z.string().regex(/^[0-9a-f]{40}$/, "head_sha");
// A NUL byte cannot cross a process boundary; refuse it here, not as a 500 later.
const NO_NUL = /^[^\0]*$/;
const text = z.string().max(MAX_REVIEW_TEXT).regex(NO_NUL, "nul_byte");

export const reviewCommentSchema = z.object({
  path: z.string().min(1).max(1000).regex(NO_NUL, "nul_byte"),
  line: z.number().int().positive(),
  side: z.enum(DIFF_SIDES),
  startLine: z.number().int().positive().optional(),
  body: text.min(1),
});

const comments = z.array(reviewCommentSchema).max(MAX_REVIEW_COMMENTS).default([]);

export const reviewSubmitSchema = z.object({
  event: z.enum(REVIEW_EVENTS),
  body: text.default(""),
  comments,
  headRefOid: sha,
}).refine((r) => r.event === "APPROVE" || r.body.trim() || r.comments.length, { message: "review_empty" });

export const reviewMergeSchema = z.object({ headRefOid: sha });

export const reviewRejectSchema = z.object({
  reason: text.trim().min(1),
  comments,
  headRefOid: sha,
});

export const reviewLinkSchema = z.object({
  agentId: z.string().min(1),
  instanceId: z.string().min(1),
});

/** A PR number path segment: plain digits only (no `0x10`, `1e3`, `07`). */
export const prNumberSchema = z.string().regex(/^[1-9][0-9]{0,9}$/).pipe(z.coerce.number().int().max(2_147_483_647));
