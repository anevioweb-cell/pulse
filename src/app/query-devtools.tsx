import { lazy, Suspense } from 'react';

/**
 * TanStack Query devtools, development builds only. `import.meta.env.DEV` is a compile-time
 * constant: in a production build the branch is `false`, so the dynamic import is dead code and
 * Rollup emits neither the devtools chunk nor a reference to the package (proof in
 * docs/performance.md). The package is a devDependency for the same reason.
 */
const LazyDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools,
      })),
    )
  : null;

export function QueryDevtools() {
  if (!LazyDevtools) return null;
  return (
    <Suspense fallback={null}>
      <LazyDevtools initialIsOpen={false} />
    </Suspense>
  );
}
