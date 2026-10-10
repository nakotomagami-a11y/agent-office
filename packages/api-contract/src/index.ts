// The wire contract between the server and its clients: API paths and the request
// schemas the server validates against. Pure — zod and domain config only — so any
// client can import it.
export * from "./routes";
export * from "./schemas";
export * from "./json-narrow";
export * from "./review";
