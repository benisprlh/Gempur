package id.gempur.app;

import org.junit.Test;
import static org.junit.Assert.*;

public final class PrivateResponsePolicyTest {
    @Test public void currentAuthenticationFailureRemainsApplicable() {
        assertTrue(PrivateResponsePolicy.authenticationFailureIsCurrent(true, 0, 0, true));
        assertTrue(PrivateResponsePolicy.authenticationFailureIsCurrent(true, 42, 42, true));
    }
    @Test public void consentChangesAndUnavailableEpochsRejectOldFailures() {
        assertFalse(PrivateResponsePolicy.authenticationFailureIsCurrent(true, 41, 42, true));
        assertFalse(PrivateResponsePolicy.authenticationFailureIsCurrent(true, -1, -1, true));
        assertFalse(PrivateResponsePolicy.authenticationFailureIsCurrent(true, 42, -1, true));
    }
    @Test public void replacedAccountAndStoppedInstanceRejectOldFailures() {
        assertFalse(PrivateResponsePolicy.authenticationFailureIsCurrent(true, 42, 42, false));
        assertFalse(PrivateResponsePolicy.authenticationFailureIsCurrent(false, 42, 42, true));
    }
}
