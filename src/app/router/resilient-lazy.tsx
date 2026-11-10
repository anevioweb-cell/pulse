import type { ComponentType } from 'react';

/** A page module as the features export it (React Router `lazy` shape). */
export type RouteModuleLoader = () => Promise<{ Component: ComponentType }>;

/** Thrown while rendering a route whose module failed to load; `retry` imports it again. */
export class RouteModuleError extends Error {
  readonly retry: () => Promise<void>;

  constructor(cause: unknown, retry: () => Promise<void>) {
    super('Route module failed to load', { cause });
    this.name = 'RouteModuleError';
    this.retry = retry;
  }
}

/**
 * Wraps a route module for React Router's `lazy`. When the import rejects (a chunk missing after a
 * deploy, a network error), React Router keeps the route "still loading" and renders nothing for it,
 * so its error boundary never shows. Here the failure becomes a render error instead: the route's
 * boundary catches a RouteModuleError, and its `retry` imports the module again; the next render
 * (a navigation to the same location) shows the page.
 */
export function resilientLazy(load: RouteModuleLoader) {
  let Loaded: ComponentType | null = null;
  let failure: unknown = null;
  const attempt = async () => {
    try {
      Loaded = (await load()).Component;
      failure = null;
    } catch (error) {
      failure = error;
    }
  };
  function RouteModule() {
    if (!Loaded) throw new RouteModuleError(failure, attempt);
    return <Loaded />;
  }
  return async () => {
    await attempt();
    return { Component: RouteModule };
  };
}
