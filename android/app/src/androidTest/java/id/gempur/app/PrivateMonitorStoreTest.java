package id.gempur.app;

import android.content.Context;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/** Compiled by the build gate; execution requires an isolated disposable emulator. */
@RunWith(AndroidJUnit4.class)
public final class PrivateMonitorStoreTest {
    private Context context;
    private PrivateMonitorStore store;
    private static final String PAIR_A = "pair_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String PAIR_B = "pair_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final String DEVICE = "device_cccccccccccccccccccccccccccccccc";

    @Before public void disposableEmulatorOnly() throws Exception {
        assumeTrue("Use a recognized emulator, never a personal phone", "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE));
        assumeTrue("Explicit disposable-data opt-in required", "true".equals(InstrumentationRegistry.getArguments().getString("gempurDisposableTestData")));
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        store = new PrivateMonitorStore(context);
        // Reset only synthetic revocation state on the explicitly disposable emulator.
        store.disable(); JSONObject pending = store.pendingServerOff();
        if (!pending.optString("pairingId").isEmpty()) store.acknowledgeServerOff(pending);
        store.clear();
    }
    private void enable(String pair, int version) throws Exception {
        assertTrue(store.enable(store.epoch(), pair, 1, version, new JSONArray().put("domain"), "https://private-fixture.org", DEVICE));
    }
    private static void record(PrivateMonitorStore targetStore, String target) throws Exception {
        targetStore.recordObserved("domain", target, "known_rule", "known", "blocked",
                System.currentTimeMillis(), targetStore.observationEpoch(), () -> true);
    }
    @Test public void queuedObservationCannotBindToLaterGrantOrSurviveClear() throws Exception {
        long observedAt = System.currentTimeMillis();
        PrivateMonitorStore.ObservationEpoch beforeGrant = store.observationEpoch();
        enable(PAIR_A, 1);
        assertFalse(store.recordObserved("domain", "fixture-risk.org", "known_rule", "known", "blocked",
                observedAt, beforeGrant, () -> true));
        assertEquals(0, store.events().length());
        PrivateMonitorStore.ObservationEpoch beforeClear = store.observationEpoch();
        store.clear();
        assertFalse(store.recordObserved("domain", "fixture-risk.org", "known_rule", "known", "blocked",
                observedAt, beforeClear, () -> true));
        assertEquals(0, store.events().length());
        assertEquals(PAIR_A, store.pendingServerOff().getString("pairingId"));
    }
    @Test public void observationTimeAndLocalConsentSurviveAsynchronousDelay() throws Exception {
        PrivateMonitorStore.ObservationEpoch epoch = store.observationEpoch();
        long observedAt = PrivateEventPolicy.bucket(System.currentTimeMillis()) - PrivateEventPolicy.BUCKET_MS + 1_000;
        assertFalse(store.recordObserved("domain", "fixture-risk.org", "known_rule", "known", "blocked",
                observedAt, epoch, () -> false));
        assertFalse(store.recordObserved("domain", "fixture-risk.org", "known_rule", "known", "blocked",
                observedAt - PrivateEventPolicy.TTL_MS, epoch, () -> true));
        assertEquals(0, store.events().length());
        assertTrue(store.recordObserved("domain", "fixture-risk.org", "known_rule", "known", "blocked",
                observedAt, epoch, () -> true));
        assertSame(epoch, new PrivateMonitorStore(context).observationEpoch());
        assertFalse(store.recordObserved("domain", "fixture-risk.org", "known_rule", "known", "blocked",
                observedAt, epoch, () -> true));
        JSONObject event = store.events().getJSONObject(0);
        assertEquals(Instant.ofEpochMilli(PrivateEventPolicy.bucket(observedAt)).toString(), event.getString("occurredAt"));
        assertEquals(2, event.getInt("count"));
    }
    @Test public void sharingDefaultsOffAndOldLocalEventsAreNotUploaded() throws Exception {
        assertFalse(store.sharing().optBoolean("enabled"));
        record(store, "fixture-risk.org");
        enable(PAIR_A, 1);
        assertEquals(0, store.batch(store.sharing()).length());
        record(store, "fixture-risk.org");
        assertEquals(1, store.batch(store.sharing()).length());
        assertEquals(2, store.events().length());
    }
    @Test public void retriesFreezePayloadWhileLocalBurstCountCanGrow() throws Exception {
        enable(PAIR_A, 1); JSONObject grant = store.sharing();
        record(store, "fixture-risk.org");
        record(store, "fixture-risk.org");
        JSONObject first = store.batch(grant).getJSONObject(0);
        assertEquals(2, first.getInt("count"));
        record(store, "fixture-risk.org");
        JSONObject retry = store.batch(grant).getJSONObject(0);
        assertEquals(first.toString(), retry.toString());
        assertEquals(3, store.events().getJSONObject(0).getInt("count"));
        store.accepted(grant, new JSONArray().put(first.getString("eventId")));
        assertEquals(0, store.batch(grant).length());
    }
    @Test public void revocationInvalidatesLateEnableAndNeverReplaysToNewPair() throws Exception {
        long staleEpoch = store.epoch(); store.disable();
        assertFalse(store.enable(staleEpoch, PAIR_A, 1, 1, new JSONArray().put("domain"), "https://private-fixture.org", DEVICE));
        enable(PAIR_A, 1);
        record(store, "fixture-risk.org");
        JSONObject oldGrant = store.sharing(); String oldId = store.batch(oldGrant).getJSONObject(0).getString("eventId");
        store.disable();
        JSONObject pending = store.pendingServerOff();
        assertEquals(PAIR_A, pending.getString("pairingId"));
        try { enable(PAIR_B, 2); fail("Unacknowledged remote stop must block re-enable"); } catch (IllegalStateException expected) {}
        store.acknowledgeServerOff(pending);
        enable(PAIR_B, 2);
        assertEquals(0, store.batch(store.sharing()).length());
        store.accepted(oldGrant, new JSONArray().put(oldId));
        record(store, "fixture-risk.org");
        JSONObject fresh = store.batch(store.sharing()).getJSONObject(0);
        assertNotEquals(oldId, fresh.getString("eventId"));
    }
    @Test(timeout = 15_000) public void separateInstancesSerializeWritesAndDoNotOverwriteAccountVault() throws Exception {
        LocalStore account = new LocalStore(context); String old = account.get("private-test-marker");
        account.put("private-test-marker", "synthetic-marker");
        try {
            CountDownLatch start = new CountDownLatch(1); AtomicReference<Exception> failure = new AtomicReference<>();
            Thread[] threads = new Thread[16];
            for (int i = 0; i < threads.length; i++) {
                final int index = i;
                threads[i] = new Thread(() -> {
                    try { start.await(); record(new PrivateMonitorStore(context), "fixture" + index + ".risk-domain.org"); }
                    catch (Exception error) { failure.compareAndSet(null, error); }
                }); threads[i].start();
            }
            start.countDown(); for (Thread thread : threads) thread.join();
            if (failure.get() != null) throw failure.get();
            JSONArray events = new PrivateMonitorStore(context).events(); Set<String> targets = new HashSet<>();
            for (int i = 0; i < events.length(); i++) targets.add(events.getJSONObject(i).getString("target"));
            assertEquals(16, targets.size());
            assertEquals("synthetic-marker", new LocalStore(context).get("private-test-marker"));
        } finally { new LocalStore(context).put("private-test-marker", old); }
    }
    @Test public void lateStopAcknowledgementCannotEraseNewerPendingStop() throws Exception {
        enable(PAIR_A, 1); store.disable(); JSONObject first = store.pendingServerOff();
        store.acknowledgeServerOff(first); enable(PAIR_A, 2); store.disable();
        JSONObject second = store.pendingServerOff(); assertNotEquals(first.getString("revocationId"), second.getString("revocationId"));
        store.acknowledgeServerOff(first);
        assertEquals(second.getString("revocationId"), store.pendingServerOff().getString("revocationId"));
        store.clear(); store.disable();
        assertEquals(second.getString("revocationId"), store.pendingServerOff().getString("revocationId"));
        store.acknowledgeServerOff(second); assertTrue(store.pendingServerOff().optString("pairingId").isEmpty());
    }
}
