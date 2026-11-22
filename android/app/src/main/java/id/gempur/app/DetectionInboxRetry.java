package id.gempur.app;

/** One service's inbox retry budget. Does not gate the help/correction dashboard. */
final class DetectionInboxRetry {
    private long nextAttemptAt;
    private int failures;

    boolean canAttempt(long elapsedMs) { return elapsedMs >= nextAttemptAt; }
    void failed(long elapsedMs, int status) {
        failures = Math.min(failures + 1, 5);
        long delay = status == 429 || (status >= 400 && status < 500)
                ? 300_000L : Math.min(300_000L, 30_000L << (failures - 1));
        nextAttemptAt = elapsedMs + delay;
    }
    void succeeded() { failures = 0; nextAttemptAt = 0; }
}
