import { gateway } from "@agent-office/domain/services";

/** An Anthropic-shaped error, so the CLI classifies it like one from the real API. */
export const gatewayError = (status: number, type: string, message: string, headers?: HeadersInit): Response =>
  Response.json(gateway.anthropicError(type, message), { status, headers });
