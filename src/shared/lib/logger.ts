type Context = Record<string, unknown>;

/**
 * Single choke point for diagnostics. Swap the body of `report` for
 * Sentry.captureException once a DSN exists — call sites don't change.
 */
function report(error: unknown, context?: Context) {
  if (__DEV__) console.error('[travyy]', error, context ?? '');
}

export const logger = {
  warn(message: string, context?: Context) {
    if (__DEV__) console.warn('[travyy]', message, context ?? '');
  },
  error(error: unknown, context?: Context) {
    report(error, context);
  },
};
