// main.ts imports this first, and ESM evaluates imports in order, so env.ts and
// forbidInProd() see the mode before anything reads it. `start` is production
// (dev-only routes 404, as in the packaged app); `dev` passes --dev.
process.env.NODE_ENV = process.argv.includes("--dev") ? "development" : "production";

export {};
