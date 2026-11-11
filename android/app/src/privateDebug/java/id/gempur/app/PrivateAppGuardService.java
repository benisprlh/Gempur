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
        if (!BuildConfig.PRIVATE_BUILD || event == null
                || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        long age = SystemClock.uptimeMillis() - event.getEventTime();
        if (age < 0 || age > 2000) return; // Ignore stale foreground observations.
        CharSequence source = event.getPackageName();
        if (source == null) return;
        String target = source.toString();
        PrivateMonitoring.Observation observation = PrivateMonitoring.observe(this);
        if (observation == null) return;
        DetectionPolicy.Decision decision = AppRiskRepository.evaluate(this, target);
        if (!"suspected".equals(decision.verdict)) return;
        long now = SystemClock.elapsedRealtime();
        if (target.equals(lastTarget) && now >= lastObservationElapsed && now - lastObservationElapsed < 2000) return;
        lastTarget = target; lastObservationElapsed = now;
        // Name-only evidence is advisory and never changes the foreground application.
        PrivateMonitoring.recordObserved(this, "app", target, decision.reason, decision.verdict, "flagged", observation);
    }

    @Override public void onInterrupt() { lastTarget = ""; lastObservationElapsed = 0; }
}
