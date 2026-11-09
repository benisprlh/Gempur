package id.gempur.engine;

import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import static org.junit.Assert.*;

public final class DetectionPolicyTest {
    private DetectionPolicy.Decision domain(String input, boolean heuristic) {
        return DetectionPolicy.evaluateDomain(input, Arrays.asList("known.example"),
                Arrays.asList("personal.example"), Collections.emptyList(), heuristic);
    }

    @Test public void knownPersonalAndUnknownRemainDistinctWithoutHeuristics() {
        DetectionPolicy.Decision known = domain("sub.KNOWN.example.", false);
        assertTrue(known.blocked); assertEquals("known_rule", known.reason); assertEquals("known", known.verdict);
        DetectionPolicy.Decision personal = domain("personal.example", false);
        assertTrue(personal.blocked); assertEquals("personal_rule", personal.reason); assertEquals("personal", personal.verdict);
        assertFalse(domain("unknown.example", false).blocked);
        assertEquals("unknown", domain("unknown.example", false).verdict);
        assertFalse(domain("known.example.attacker.example", false).blocked);
        assertFalse(domain("https://known.example/path?q=slot-deposit", true).blocked);
    }

    @Test public void defaultOffNeverUsesSuspectedNameQuarantine() {
        assertFalse(domain("slot-gacor.example", false).blocked);
        assertFalse(DetectionPolicy.evaluateApp("id.example.slotgacor", "Slot Gacor", false, false, false).blocked);
    }

    @Test public void strongMultipleTokensAreSuspectedNotKnown() {
        for (String name : Arrays.asList("slot-gacor.example", "slotgacor88.example", "casino-deposit.example", "maxwin-slot.example")) {
            DetectionPolicy.Decision d = domain(name, true);
            assertTrue(name, d.blocked); assertEquals("name_heuristic", d.reason); assertEquals("suspected", d.verdict);
        }
        DetectionPolicy.Decision app = DetectionPolicy.evaluateApp("id.example.game", "Slot Gacor 88", false, false, true);
        assertTrue(app.blocked); assertEquals("suspected", app.verdict);
    }

    @Test public void ordinaryWordsAndEducationalContextsAreNotGamblingVerdicts() {
        for (String name : Arrays.asList("timeslots.example", "slot.example", "casino.example", "jackpot.example", "slot-news-gacor.example",
                "research-slot-deposit.example", "belajar-poker.example", "edukasi-slot-gacor.example",
                "slot-gacor.ojk.go.id", "slot-deposit.school.sch.id", "casino-deposit.bca.co.id")) {
            DetectionPolicy.Decision d = domain(name, true);
            assertFalse(name, d.blocked); assertEquals("unknown", d.verdict);
        }
        for (String label : Arrays.asList("Calendar Time Slots", "Casino Royale", "Research Slot Gacor", "Poker Simulator", "Deposit Manager")) {
            assertFalse(label, DetectionPolicy.evaluateApp("id.example.learning", label, false, false, true).blocked);
        }
        // Do not combine unrelated publisher and label words into an accusation.
        assertFalse(DetectionPolicy.evaluateApp("id.slot.calendar", "Deposit Manager", false, false, true).blocked);
        assertTrue(DetectionPolicy.evaluateDomain("slot-gacor.ojk.go.id", Arrays.asList("slot-gacor.ojk.go.id"),
                Collections.emptyList(), Collections.emptyList(), true).blocked);
    }

    @Test public void exactAllowanceWinsForKnownPersonalAndSuspectedButNotSubdomains() {
        for (String target : Arrays.asList("known.example", "personal.example", "slot-gacor.example")) {
            DetectionPolicy.Decision d = DetectionPolicy.evaluateDomain(target, Arrays.asList("known.example"),
                    Arrays.asList("personal.example"), Arrays.asList(target), true);
            assertFalse(d.blocked); assertEquals("temporary_allowance", d.reason);
            assertTrue(DetectionPolicy.evaluateDomain("sub." + target, Arrays.asList("known.example"),
                    Arrays.asList("personal.example"), Arrays.asList(target), true).blocked);
        }
        assertTrue(domain("_service.known.example", false).blocked);
    }

    @Test public void diagnosticCannotBeExemptedOrConfusedWithSuffixNeighbour() {
        assertTrue(DetectionPolicy.evaluateDomain("gempur-block.test", Collections.emptyList(), Collections.emptyList(),
                Arrays.asList("gempur-block.test"), true).blocked);
        assertTrue(DetectionPolicy.isDiagnosticDomain("sub.gempur-block.test."));
        assertFalse(DetectionPolicy.isDiagnosticDomain("gempur-block.test.attacker.example"));
        assertFalse(DetectionPolicy.isDiagnosticDomain("https://gempur-block.test"));
        assertFalse(domain("gempur-block.test.attacker.example", true).blocked);
    }

    @Test public void criticalAppsAndExactAppAllowancesNeverGetInterrupted() {
        assertFalse(DetectionPolicy.evaluateApp("id.example.slotgacor", "Slot Gacor", true, false, true).blocked);
        assertFalse(DetectionPolicy.evaluateApp("id.example.slotgacor", "Slot Gacor", false, true, true).blocked);
        assertTrue(DetectionPolicy.evaluateApp("id.example.slotgacor2", "Slot Gacor", false, false, true).blocked);
    }

    @Test public void applicationIdsAreBoundExactlyAndRejectUrlsOrInventoryText() {
        assertEquals("id.example.Private_App", DetectionPolicy.normalizePackage("id.example.Private_App"));
        for (String input : Arrays.asList("https://id.example.app", "id.example.app/path", "id.example.app?token=a", "id.example.*", "app", "id.example.app,other")) {
            try { DetectionPolicy.normalizePackage(input); fail(input); } catch (IllegalArgumentException expected) {}
        }
        assertFalse(DetectionPolicy.evaluateApp("https://slot-gacor.example", "Slot Gacor", false, false, true).blocked);
    }
}
