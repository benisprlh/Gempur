package id.gempur.app;

import org.junit.Test;
import static org.junit.Assert.*;

public final class DetectionAlertCooldownTest {
    @Test public void detectionPollsDoNotExtendTheCooldownUnlessTheyPost() {
        DetectionAlertCooldown cooldown = new DetectionAlertCooldown();
        assertTrue(cooldown.canPost(0));
        cooldown.posted(0);
        assertFalse(cooldown.canPost(30_000));
        assertFalse(cooldown.canPost(59_999));
        assertTrue(cooldown.canPost(60_000));
        cooldown.posted(60_000);
        assertFalse(cooldown.canPost(90_000));
        assertTrue(cooldown.canPost(120_000));
    }
}
