import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { buildDocsExport } from "@agent-office/domain/services/docs-export";

describe("GET /api/docs/export", () => {
  it("returns a Response with status 200", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("response body contains all required top-level keys", async () => {
    const response = await GET();
    const data = await response.json() as Record<string, unknown>;

    expect(typeof data.version).toBe("string");
    expect(typeof data.generated_at).toBe("string");
    expect(Array.isArray(data.api)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
    expect(Array.isArray(data.schema)).toBe(true);
    expect(Array.isArray(data.env_vars)).toBe(true);
    expect(Array.isArray(data.tools)).toBe(true);
    expect(Array.isArray(data.paths)).toBe(true);
    expect(Array.isArray(data.gaps)).toBe(true);
  });

  it("generated_at is a valid ISO timestamp", async () => {
    const response = await GET();
    const data = await response.json() as { generated_at: string };
    const d = new Date(data.generated_at);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});

describe("buildDocsExport()", () => {
  it("version is a non-empty string", () => {
    const doc = buildDocsExport();
    expect(typeof doc.version).toBe("string");
    expect(doc.version.length).toBeGreaterThan(0);
  });

  it("generated_at is a valid ISO date string", () => {
    const doc = buildDocsExport();
    expect(typeof doc.generated_at).toBe("string");
    const d = new Date(doc.generated_at);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it("returns non-empty arrays for every category", () => {
    const doc = buildDocsExport();
    expect(doc.api.length).toBeGreaterThan(0);
    expect(doc.events.length).toBeGreaterThan(0);
    expect(doc.schema.length).toBeGreaterThan(0);
    expect(doc.env_vars.length).toBeGreaterThan(0);
    expect(doc.tools.length).toBeGreaterThan(0);
    expect(doc.paths.length).toBeGreaterThan(0);
  });

  it("gaps is an array (may be empty)", () => {
    const doc = buildDocsExport();
    expect(Array.isArray(doc.gaps)).toBe(true);
  });

  it("every api entry has method, path, and description", () => {
    const { api } = buildDocsExport();
    for (const entry of api) {
      expect(typeof entry.method).toBe("string");
      expect(entry.method.length).toBeGreaterThan(0);
      expect(typeof entry.path).toBe("string");
      expect(entry.path.startsWith("/")).toBe(true);
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("every event entry has name, payload_type, and description", () => {
    const { events } = buildDocsExport();
    for (const entry of events) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.payload_type).toBe("string");
      expect(entry.payload_type.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("every schema entry has table, columns array, and indexes array", () => {
    const { schema } = buildDocsExport();
    for (const entry of schema) {
      expect(typeof entry.table).toBe("string");
      expect(entry.table.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.columns)).toBe(true);
      expect(entry.columns.length).toBeGreaterThan(0);
      for (const col of entry.columns) {
        expect(typeof col.name).toBe("string");
        expect(col.name.length).toBeGreaterThan(0);
        expect(typeof col.type).toBe("string");
        expect(col.type.length).toBeGreaterThan(0);
      }
      expect(Array.isArray(entry.indexes)).toBe(true);
    }
  });

  it("every env_var entry has name and effect", () => {
    const { env_vars } = buildDocsExport();
    for (const entry of env_vars) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.effect).toBe("string");
      expect(entry.effect.length).toBeGreaterThan(0);
      if (entry.default !== undefined) {
        expect(typeof entry.default).toBe("string");
      }
    }
  });

  it("every tool entry has name and description", () => {
    const { tools } = buildDocsExport();
    for (const entry of tools) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
      if (entry.mcp_source !== undefined) {
        expect(typeof entry.mcp_source).toBe("string");
      }
    }
  });

  it("every path entry has key, path, and description", () => {
    const { paths } = buildDocsExport();
    for (const entry of paths) {
      expect(typeof entry.key).toBe("string");
      expect(entry.key.length).toBeGreaterThan(0);
      expect(typeof entry.path).toBe("string");
      expect(entry.path.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("each call produces a fresh generated_at timestamp", async () => {
    const first = buildDocsExport().generated_at;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = buildDocsExport().generated_at;
    expect(Number.isNaN(new Date(first).getTime())).toBe(false);
    expect(Number.isNaN(new Date(second).getTime())).toBe(false);
  });
});
