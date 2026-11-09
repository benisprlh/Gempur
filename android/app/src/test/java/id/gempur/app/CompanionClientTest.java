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
}
