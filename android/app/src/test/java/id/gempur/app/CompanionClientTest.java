package id.gempur.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class CompanionClientTest {
    @Test public void productionAcceptsHttpsOriginOnly() {
        assertEquals("https://example.org",CompanionClient.validateEndpoint(" https://example.org/ ",false));
        assertEquals("https://example.org:8443",CompanionClient.validateEndpoint("https://example.org:8443",false));
    }
    @Test public void productionRejectsCleartextAndCredentialBearingUrls() {
        for(String url:new String[]{"http://example.org","http://localhost:8080","https://user:secret@example.org","https://example.org/api","https://example.org/?token=secret","https://example.org/#fragment","file:///tmp/data","https://"}){
            try{CompanionClient.validateEndpoint(url,false);fail("Unsafe endpoint accepted");}catch(IllegalArgumentException expected){}
        }
    }
    @Test public void debugCleartextExceptionIsRestrictedToExactDevelopmentHosts() {
        assertEquals("http://10.0.2.2:8080",CompanionClient.validateEndpoint("http://10.0.2.2:8080",true));
        assertEquals("http://localhost:8080",CompanionClient.validateEndpoint("http://localhost:8080",true));
        for(String url:new String[]{"http://localhost.attacker.test","http://127.0.0.1.attacker.test","http://192.168.1.2","http://example.org"}){
            try{CompanionClient.validateEndpoint(url,true);fail("Remote cleartext accepted");}catch(IllegalArgumentException expected){}
        }
    }

    @Test public void stopRequiresAnExplicitDisabledGrantWithANewerVersionAndNoScopes() {
        assertTrue(CompanionClient.confirmsAutomationOff(false, 8, 0, 7));
        assertTrue(CompanionClient.confirmsAutomationOff(false, 9L, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(true, 8, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(false, 7, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(false, 6, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(false, 8, 1, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(null, 8, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff("false", 8, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(false, null, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(false, "8", 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(false, 8.0, 0, 7));
        assertFalse(CompanionClient.confirmsAutomationOff(false, 1L + Integer.MAX_VALUE, 0, 7));
    }

    @Test public void legacyStopWithoutAVersionStillRequiresAValidDisabledGrant() {
        assertTrue(CompanionClient.confirmsAutomationOff(false, 0, 0, -1));
        assertFalse(CompanionClient.confirmsAutomationOff(false, -1, 0, -1));
        assertFalse(CompanionClient.confirmsAutomationOff(false, 0, 0, -2));
        assertFalse(CompanionClient.confirmsAutomationOff(null, null, 0, -1));
    }
    @Test public void httpErrorStatusSurvivesAbsentOrInvalidDiagnosticJson() throws Exception {
        for (int status : new int[]{400, 401, 403, 404, 409, 429, 500}) {
            for (String body : new String[]{"", "<html>proxy error</html>", "not-json"}) {
                try { CompanionClient.decodeResponse(status, body); fail("HTTP error must not return a success object"); }
                catch (CompanionClient.ApiException rejected) { assertEquals(status, rejected.status); }
            }
        }
    }
    @Test public void responseContextRequiresEveryDispatchIdentityValue() {
        String[] dispatched = {"https://example.org", "old-token", "", "pair-a", "device-a", "participant", "4", ""};
        assertTrue(CompanionClient.sameRemoteValues(dispatched, dispatched.clone()));
        for (int i = 0; i < dispatched.length; i++) {
            String[] changed = dispatched.clone(); changed[i] += "changed";
            assertFalse("Changed context field " + i, CompanionClient.sameRemoteValues(dispatched, changed));
        }
    }
    @Test public void responseContextRejectsMissingOrMalformedSnapshots() {
        String[] valid = {"endpoint", "token", "", "pair", "device", "role", "1", ""};
        assertFalse(CompanionClient.sameRemoteValues(valid, null));
        assertFalse(CompanionClient.sameRemoteValues(null, valid));
        assertFalse(CompanionClient.sameRemoteValues(new String[0], new String[0]));
        assertFalse(CompanionClient.sameRemoteValues(valid, new String[7]));
        assertFalse(CompanionClient.sameRemoteValues(new String[8], new String[8]));
    }
}
