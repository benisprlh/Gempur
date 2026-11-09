package id.gempur.app;

import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiSelector;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.io.File;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

@RunWith(AndroidJUnit4.class)
public class SmokeTest {
    @Rule public ActivityTestRule<MainActivity> activity=new ActivityTestRule<>(MainActivity.class,false,false);
    private Context context;
    @Before public void resetSyntheticDevice() throws Exception {
        boolean emulator = "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE);
        assumeTrue("Synthetic reset tests only run on a disposable Android emulator", emulator);
        assumeTrue("Explicit gempurDisposableTestData=true instrumentation argument is required",
            "true".equals(InstrumentationRegistry.getArguments().getString("gempurDisposableTestData")));
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        new LocalStore(context).wipe();
    }
    @Test public void consentAndHomeAreUsable() throws Exception {
        activity.launchActivity(null);
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());device.waitForIdle();
        assertTrue(device.findObject(new UiSelector().textContains("Saya berusia 18+")).exists());
        device.findObject(new UiSelector().textContains("Saya berusia 18+")).click();
        device.findObject(new UiSelector().textContains("Saya memahami batas proteksi")).click();
        device.findObject(new UiSelector().text("Mulai")).click();device.waitForIdle();
        assertTrue(device.findObject(new UiSelector().text("GEMPUR")).exists());
        assertTrue(device.findObject(new UiSelector().text("Aktifkan proteksi")).exists());
    }
    @Test public void vaultIsEncryptedAndSurvivesReopen() throws Exception {
        LocalStore vault=new LocalStore(context);vault.put("token","synthetic-secret-for-test");
        vault.checkIn(7,"skip");
        assertEquals("synthetic-secret-for-test",new LocalStore(context).get("token"));
        String bytes=new String(Files.readAllBytes(new File(context.getNoBackupFilesDir(),"vault.v1").toPath()),StandardCharsets.UTF_8);
        assertFalse(bytes.contains("synthetic-secret-for-test"));assertFalse(bytes.contains("urge"));
        assertFalse(vault.notesExport().contains("synthetic-secret-for-test"));
    }
    @Test public void endpointAndRuleBoundaries() throws Exception {
        assertEquals("https://example.org",CompanionClient.validateEndpoint("https://example.org/",false));
        for(String bad:new String[]{"http://example.org","https://u:p@example.org","https://example.org/api","https://example.org/?token=a"}){
            try{CompanionClient.validateEndpoint(bad,false);fail("Unsafe endpoint accepted");}catch(IllegalArgumentException expected){}
        }
        RuleRepository.add(context,"synthetic-block.example");
        assertTrue(RuleRepository.load(context).isBlocked("child.synthetic-block.example"));
        RuleRepository.remove(context,"synthetic-block.example");
        assertFalse(RuleRepository.load(context).isBlocked("child.synthetic-block.example"));
    }
    @Test public void separateVaultInstancesPreserveConcurrentNotesAndCredentials() throws Exception {
        LocalStore first=new LocalStore(context),second=new LocalStore(context);
        first.put("token","synthetic-new-token");
        java.util.concurrent.ExecutorService writers=java.util.concurrent.Executors.newFixedThreadPool(2);
        try{
            java.util.concurrent.Future<?> a=writers.submit(()->{try{for(int i=0;i<10;i++)first.checkIn(2,"skip");}catch(Exception e){throw new RuntimeException(e);}});
            java.util.concurrent.Future<?> b=writers.submit(()->{try{for(int i=0;i<10;i++)second.checkIn(4,"no");}catch(Exception e){throw new RuntimeException(e);}});
            a.get(10,java.util.concurrent.TimeUnit.SECONDS);b.get(10,java.util.concurrent.TimeUnit.SECONDS);
        }finally{writers.shutdownNow();}
        assertEquals(20,new LocalStore(context).notes().length());
        assertEquals("synthetic-new-token",second.remoteContext().getString("token"));
        second.put("role","participant");
        assertEquals(20,first.notes().length());
        assertEquals("synthetic-new-token",first.get("token"));
    }
    @Test public void vpnFixtureProbeWithoutLiveGambling() throws Exception {
        LocalStore vault=new LocalStore(context);vault.put("consent","test-v1");
        activity.launchActivity(null);
        Intent prepare=VpnService.prepare(context);
        if(prepare!=null){
            prepare.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(prepare);
            UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());device.waitForIdle();
            device.findObject(new UiSelector().resourceId("android:id/button1")).click();device.waitForIdle();
        }
        context.startForegroundService(new Intent(context,ProtectionService.class).setAction(ProtectionService.ACTION_START));
        long deadline=System.currentTimeMillis()+8000;
        while(!ProtectionService.isRunning()&&System.currentTimeMillis()<deadline)Thread.sleep(100);
        assertTrue("VPN service should start on configured emulator",ProtectionService.isRunning());
        assertTrue("Synthetic DNS route should return blocked fixture",ProtectionService.selfTest());
        context.startService(new Intent(context,ProtectionService.class).setAction(ProtectionService.ACTION_STOP));
    }
}

