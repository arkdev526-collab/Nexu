const relative = /^\.{1,2}\//;
const hasExtension = /\.[A-Za-z0-9]+$/;

/** Resolve the app's extensionless relative TypeScript imports for Node's test runner. */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (relative.test(specifier) && !hasExtension.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}

/** Force TypeScript domain modules to ESM; Node 22 transforms TS-only syntax. */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) return nextLoad(url, { ...context, format: "module" });
  return nextLoad(url, context);
}
