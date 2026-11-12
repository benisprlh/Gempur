package id.gempur.app;

/** Limits companion detection summaries within one service lifetime. */
final class DetectionAlertCooldown {
    private static final long INTERVAL_MS = 60_000;
    private long lastPostedAt = -1;

    boolean canPost(long elapsedMs) {
        return lastPostedAt < 0 || elapsedMs - lastPostedAt >= INTERVAL_MS;
    }

    void posted(long elapsedMs) {
        lastPostedAt = elapsedMs;
    }
}
