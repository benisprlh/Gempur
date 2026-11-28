package id.gempur.app;

/** Process-local consent/teardown gate. No network or framework work runs in this class. */
final class PrivateSessionCoordinator {
    static final PrivateSessionCoordinator INSTANCE = new PrivateSessionCoordinator();
    final Object lock = new Object();
    private long generation;
    private Object stopOwner;
    private boolean effectsFinished, teardownFinished;

    long generation() { synchronized (lock) { return generation; } }
    void requireActivationAllowed() {
        synchronized (lock) {
            if (stopOwner != null) throw new IllegalStateException("Layanan privat sedang dihentikan. Coba aktifkan kembali setelah proses berhenti.");
        }
    }
    void activationCommitted() {
        synchronized (lock) { requireActivationAllowed(); generation++; }
    }
    boolean canStop(long expectedGeneration) {
        synchronized (lock) { return stopOwner == null && expectedGeneration >= 0 && generation == expectedGeneration; }
    }
    boolean beginStop(Object owner, long expectedGeneration) {
        synchronized (lock) {
            if (owner == null || !canStop(expectedGeneration)) return false;
            stopOwner = owner; effectsFinished = false; teardownFinished = false;
            return true;
        }
    }
    void effectsFinished(Object owner) {
        synchronized (lock) { if (stopOwner == owner && owner != null) { effectsFinished = true; releaseIfFinished(); } }
    }
    void teardownFinished(Object owner) {
        synchronized (lock) { if (stopOwner == owner && owner != null) { teardownFinished = true; releaseIfFinished(); } }
    }
    private void releaseIfFinished() {
        if (effectsFinished && teardownFinished) { stopOwner = null; generation++; }
    }
}
