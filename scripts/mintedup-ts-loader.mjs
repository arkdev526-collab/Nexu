const relative = /^\.{1,2}\//;
const hasExtension = /\.[A-Za-z0-9]+$/;

/**
 * Resolve the app's extensionless relative TypeScript imports for Node's test
 * runner. Node itself remains responsible for loading and transforming .ts
 * files via --experimental-transform-types.
 */
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
