export function exponentialBackoffMs(retryCount: number, lowerBound = 50, upperBound = 10_000) {
  const baseDelay = lowerBound;
  const maxDelay = upperBound;
  const backoffFactor = 2;

  const delay = Math.min(
    maxDelay,
    baseDelay * Math.pow(backoffFactor, retryCount)
  );

  return delay;
}
