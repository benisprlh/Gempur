package id.gempur.app;

import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;
import id.gempur.engine.DetectionPolicy;

/** Private-variant opt-in: package events only; never retrieves windows, nodes, text, or screenshots. */
public final class PrivateAppGuardService extends AccessibilityService {
    private String lastTarget = "";
    private long lastObservationElapsed;

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        if (!BuildConfig.PRIVATE_BUILD || !PrivateMonitoring.localEnabled(this) || event == null
                || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        long age = SystemClock.uptimeMillis() - event.getEventTime();
        if (age < 0 || age > 2000) return; // Ignore stale foreground observations.
        CharSequence source = event.getPackageName();
        if (source == null) return;
        String target = source.toString();
        DetectionPolicy.Decision decision = AppRiskRepository.evaluate(this, target);
        if (!"suspected".equals(decision.verdict)) return;
        long now = SystemClock.elapsedRealtime();
        if (target.equals(lastTarget) && now >= lastObservationElapsed && now - lastObservationElapsed < 2000) return;
        if (!PrivateMonitoring.localEnabled(this)) return;
        lastTarget = target; lastObservationElapsed = now;
        // Name-only evidence is advisory and never changes the foreground application.
        PrivateMonitoring.record(this, "app", target, decision.reason, decision.verdict, "flagged");
    }

    @Override public void onInterrupt() { lastTarget = ""; lastObservationElapsed = 0; }
}
