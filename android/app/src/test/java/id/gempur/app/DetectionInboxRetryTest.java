package id.gempur.app;

import org.junit.Test;
import static org.junit.Assert.*;

public final class DetectionInboxRetryTest {
    @Test public void transientFailuresBackOffAndCapWithoutSlidingOnSkippedPolls() {
        DetectionInboxRetry retry = new DetectionInboxRetry();
        long now = 100;
        assertTrue(retry.canAttempt(now));
        for (long delay : new long[]{30_000, 60_000, 120_000, 240_000, 300_000, 300_000}) {
            retry.failed(now, 503);
            assertFalse(retry.canAttempt(now + delay - 1));
            assertFalse(retry.canAttempt(now));
            now += delay;
            assertTrue(retry.canAttempt(now));
        }
    }
    @Test public void clientRejectionAndRateLimitWaitFiveMinutes() {
        for (int status : new int[]{400, 403, 404, 409, 429}) {
            DetectionInboxRetry retry = new DetectionInboxRetry();
            retry.failed(70_000, status);
            assertFalse(retry.canAttempt(369_999));
            assertTrue(retry.canAttempt(370_000));
        }
    }
    @Test public void SuccessfulInboxResetsFailureCountButDashboardPollsDoNot() {
        DetectionInboxRetry retry = new DetectionInboxRetry();
        retry.failed(0, 0);
        assertTrue(retry.canAttempt(30_000));
        // Dashboard success/skipped inbox polls never call succeeded().
        retry.failed(30_000, 0);
        assertFalse(retry.canAttempt(89_999));
        retry.succeeded();
        assertTrue(retry.canAttempt(90_000));
        retry.failed(90_000, 0);
        assertTrue(retry.canAttempt(120_000));
    }
    @Test public void RetryAndNotificationCooldownRemainIndependentPerService() {
        DetectionInboxRetry retry = new DetectionInboxRetry();
        DetectionAlertCooldown alerts = new DetectionAlertCooldown();
        retry.failed(0, 429);
        assertTrue(alerts.canPost(60_000));
        assertFalse(retry.canAttempt(60_000));
        DetectionInboxRetry freshService = new DetectionInboxRetry();
        assertTrue(freshService.canAttempt(60_000));
        alerts.posted(60_000);
        assertFalse(alerts.canPost(90_000));
        assertTrue(retry.canAttempt(300_000));
    }
}
