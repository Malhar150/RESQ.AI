/** Stands in for ./server in normal builds so no demo code ships to real users. */
export function demoFetch(): Promise<Response> {
  throw new Error("demo backend is not part of this build");
}
export function resetDemo() {}
