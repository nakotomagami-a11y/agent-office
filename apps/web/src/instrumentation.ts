/**
 * Next.js server-lifecycle hook. Next compiles this file for BOTH the
 * nodejs and edge runtimes, so anything fs-touching at the top level
 * breaks the edge build. The official pattern is to keep the file
 * minimal and route to a node-only side file via dynamic import,
 * gated on `NEXT_RUNTIME` so the edge bundle can statically skip it.
 *
 * The node-only side file (`./instrumentation-node`) does the actual
 * starter-kit install.
 */
export async function register() {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    await import("./instrumentation-node");
  }
}
