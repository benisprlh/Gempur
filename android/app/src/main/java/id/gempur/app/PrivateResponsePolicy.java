package id.gempur.app;

/** Completion recheck policy; not a transaction lock spanning account/consent mutations. */
final class PrivateResponsePolicy {
    private PrivateResponsePolicy() {}
    static boolean authenticationFailureIsCurrent(boolean serviceCurrent, long dispatchedEpoch,
            long currentEpoch, boolean accountCurrent) {
        return serviceCurrent && accountCurrent && dispatchedEpoch >= 0 && dispatchedEpoch == currentEpoch;
    }
}
