package id.gempur.app;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import id.gempur.engine.DetectionPolicy;

/** Private-variant opt-in: package events only; never retrieves windows, nodes, text, or screenshots. */
public final class PrivateAppGuardService extends AccessibilityService {
    private String lastTarget = "";
    private long lastActionElapsed;

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!BuildConfig.PRIVATE_BUILD || !PrivateMonitoring.localEnabled(this) || event == null
                || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        long age = SystemClock.uptimeMillis() - event.getEventTime();
        if (age < 0 || age > 2000) return; // Never send HOME for an old foreground transition.
        CharSequence source = event.getPackageName();
        if (source == null) return;
        String target = source.toString();
        DetectionPolicy.Decision decision = AppRiskRepository.evaluate(this, target);
        if (!decision.blocked) return;
        long now = SystemClock.elapsedRealtime();
        if (target.equals(lastTarget) && now >= lastActionElapsed && now - lastActionElapsed < 2000) return;
        if (!PrivateMonitoring.localEnabled(this)) return;
        lastTarget = target; lastActionElapsed = now;
        // HOME changes foreground only; it does not suspend/uninstall or block network traffic.
        boolean interrupted;
        try { interrupted = performGlobalAction(GLOBAL_ACTION_HOME); }
        catch (RuntimeException unavailable) { interrupted = false; }
        PrivateMonitoring.record(this, "app", target, decision.reason, decision.verdict, interrupted ? "blocked" : "flagged");
    }

    @Override public void onInterrupt() { lastTarget = ""; lastActionElapsed = 0; }
}
