package id.gempur.app;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class PrivateSessionCoordinatorTest {
    private static void rejectedActivation(PrivateSessionCoordinator gate) {
        try { gate.requireActivationAllowed(); fail("Activation must wait for old teardown and effects"); }
        catch (IllegalStateException expected) { assertNotNull(expected.getMessage()); }
    }
    @Test public void newerAcceptedChoiceInvalidatesOldGenerationEvenWithSameAccount() {
        PrivateSessionCoordinator gate = new PrivateSessionCoordinator();
        long old = gate.generation();
        synchronized (gate.lock) { gate.requireActivationAllowed(); gate.activationCommitted(); }
        assertFalse(gate.canStop(old));
        assertFalse(gate.beginStop(new Object(), old));
        assertTrue(gate.canStop(gate.generation()));
        assertFalse(gate.canStop(-1));
    }
    @Test public void fenceNeedsBothEffectsAndOwningTeardownInEitherOrder() {
        for (boolean teardownFirst : new boolean[]{false, true}) {
            PrivateSessionCoordinator gate = new PrivateSessionCoordinator(); Object owner = new Object();
            long old = gate.generation(); assertTrue(gate.beginStop(owner, old));
            rejectedActivation(gate);
            if (teardownFirst) gate.teardownFinished(owner); else gate.effectsFinished(owner);
            rejectedActivation(gate);
            if (teardownFirst) gate.effectsFinished(owner); else gate.teardownFinished(owner);
            gate.requireActivationAllowed(); assertFalse(gate.canStop(old));
        }
    }
    @Test public void unrelatedCallbacksCannotReleaseOrReplacePendingStop() {
        PrivateSessionCoordinator gate = new PrivateSessionCoordinator(); Object owner = new Object(), other = new Object();
        assertFalse(gate.beginStop(null, gate.generation()));
        assertTrue(gate.beginStop(owner, gate.generation()));
        assertFalse(gate.beginStop(other, gate.generation()));
        gate.effectsFinished(other); gate.teardownFinished(other); rejectedActivation(gate);
        gate.effectsFinished(owner); gate.teardownFinished(other); rejectedActivation(gate);
        gate.teardownFinished(owner); gate.requireActivationAllowed();
        long current = gate.generation();
        gate.effectsFinished(owner); gate.teardownFinished(owner);
        assertEquals(current, gate.generation());
    }
    @Test public void activationCannotCrossConditionalCommitCriticalSection() throws Exception {
        PrivateSessionCoordinator gate = new PrivateSessionCoordinator(); Object owner = new Object();
        CountDownLatch inside = new CountDownLatch(1), release = new CountDownLatch(1), attempted = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        long dispatched = gate.generation();
        Thread stop = new Thread(() -> {
            try { synchronized (gate.lock) {
                assertTrue(gate.canStop(dispatched)); inside.countDown();
                assertTrue(release.await(5, TimeUnit.SECONDS));
                assertTrue(gate.beginStop(owner, dispatched));
            } } catch (Throwable error) { failure.compareAndSet(null, error); }
        });
        Thread activation = new Thread(() -> {
            try { assertTrue(inside.await(5, TimeUnit.SECONDS)); attempted.countDown();
                synchronized (gate.lock) { rejectedActivation(gate); }
            } catch (Throwable error) { failure.compareAndSet(null, error); }
        });
        stop.start(); activation.start();
        try { assertTrue(attempted.await(5, TimeUnit.SECONDS)); } finally { release.countDown(); }
        stop.join(5000); activation.join(5000);
        assertFalse(stop.isAlive()); assertFalse(activation.isAlive());
        if (failure.get() != null) throw new AssertionError(failure.get());
    }
    @Test public void earlyTeardownStillFencesUntilDeferredEffectsFinish() throws Exception {
        PrivateSessionCoordinator gate = new PrivateSessionCoordinator(); Object owner = new Object();
        assertTrue(gate.beginStop(owner, gate.generation()));
        CountDownLatch destroyed = new CountDownLatch(1); AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread destroy = new Thread(() -> { gate.teardownFinished(owner); destroyed.countDown(); });
        Thread activation = new Thread(() -> {
            try { assertTrue(destroyed.await(5, TimeUnit.SECONDS)); rejectedActivation(gate); }
            catch (Throwable error) { failure.set(error); }
        });
        destroy.start(); activation.start(); destroy.join(5000); activation.join(5000);
        assertFalse(destroy.isAlive()); assertFalse(activation.isAlive());
        if (failure.get() != null) throw new AssertionError(failure.get());
        gate.effectsFinished(owner); gate.requireActivationAllowed();
    }
}
