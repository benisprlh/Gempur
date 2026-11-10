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

    @Test public void defaultOffDoesNotCreateNameSuspicions() {
        assertFalse(domain("slot-gacor.example", false).blocked);
        assertEquals("unknown", domain("slot-gacor.example", false).verdict);
        assertFalse(DetectionPolicy.evaluateApp("id.example.slotgacor", "Slot Gacor", false, false, false).blocked);
    }

    @Test public void strongMultipleTokensAreSuspectedNotKnown() {
        for (String name : Arrays.asList("slot-gacor.example", "slotgacor88.example", "casino-deposit.example", "maxwin-slot.example")) {
            DetectionPolicy.Decision d = domain(name, true);
            assertFalse(name, d.blocked); assertEquals("name_heuristic", d.reason); assertEquals("suspected", d.verdict);
        }
        DetectionPolicy.Decision app = DetectionPolicy.evaluateApp("id.example.game", "Slot Gacor 88", false, false, true);
        assertFalse(app.blocked); assertEquals("suspected", app.verdict);
    }

    @Test public void ordinaryWordsAndEducationalContextsAreNotGamblingVerdicts() {
        for (String name : Arrays.asList("timeslots.example", "slot.example", "casino.example", "jackpot.example", "slot-news-gacor.example",
                "research-slot-deposit.example", "belajar-poker.example", "edukasi-slot-gacor.example",
                "pemulihan-slot-gacor.example", "help-casino-deposit.example", "casino-deposit-recovery.example",
                "slot-gacor.ojk.go.id", "slot-deposit.school.sch.id", "casino-deposit.bca.co.id")) {
            DetectionPolicy.Decision d = domain(name, true);
            assertFalse(name, d.blocked); assertEquals("unknown", d.verdict);
        }
        for (String label : Arrays.asList("Calendar Time Slots", "Casino Royale", "Research Slot Gacor", "Poker Simulator", "Deposit Manager", "Casino Deposit Recovery")) {
            assertEquals(label, "unknown", DetectionPolicy.evaluateApp("id.example.utility", label, false, false, true).verdict);
        }
        // Do not combine unrelated publisher and label words into an accusation.
        assertEquals("unknown", DetectionPolicy.evaluateApp("id.slot.calendar", "Deposit Manager", false, false, true).verdict);
        assertTrue(DetectionPolicy.evaluateDomain("slot-gacor.ojk.go.id", Arrays.asList("slot-gacor.ojk.go.id"),
                Collections.emptyList(), Collections.emptyList(), true).blocked);
        assertEquals("unknown", DetectionPolicy.evaluateApp("id.vendor.slotgacor", "Recovery Support", false, false, true).verdict);
        assertEquals("unknown", DetectionPolicy.evaluateApp("id.vendor.education", "Casino Deposit", false, false, true).verdict);
    }

    @Test public void exactAllowanceWinsForKnownPersonalAndSuspectedButNotSubdomains() {
        for (String target : Arrays.asList("known.example", "personal.example", "slot-gacor.example")) {
            DetectionPolicy.Decision d = DetectionPolicy.evaluateDomain(target, Arrays.asList("known.example"),
                    Arrays.asList("personal.example"), Arrays.asList(target), true);
            assertFalse(d.blocked); assertEquals("temporary_allowance", d.reason);
            DetectionPolicy.Decision sub = DetectionPolicy.evaluateDomain("sub." + target, Arrays.asList("known.example"),
                    Arrays.asList("personal.example"), Arrays.asList(target), true);
            assertNotEquals("temporary_allowance", sub.reason);
            assertEquals(!target.startsWith("slot-"), sub.blocked);
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
        DetectionPolicy.Decision critical = DetectionPolicy.evaluateApp("id.example.slotgacor", "Slot Gacor", true, false, true);
        assertFalse(critical.blocked); assertEquals("critical_app", critical.reason); assertEquals("unknown", critical.verdict);
        DetectionPolicy.Decision allowed = DetectionPolicy.evaluateApp("id.example.slotgacor", "Slot Gacor", false, true, true);
        assertFalse(allowed.blocked); assertEquals("temporary_allowance", allowed.reason); assertEquals("allowed", allowed.verdict);
        DetectionPolicy.Decision suspect = DetectionPolicy.evaluateApp("id.example.slotgacor2", "Slot Gacor", false, false, true);
        assertFalse(suspect.blocked); assertEquals("suspected", suspect.verdict);
    }

    @Test public void contextExemptionsNeverOverrideExplicitRules() {
        for (String target : Arrays.asList("help-slot-gacor.example", "casino-deposit.bca.co.id", "news-casino-deposit.example")) {
            DetectionPolicy.Decision known = DetectionPolicy.evaluateDomain(target, Arrays.asList(target), Collections.emptyList(), Collections.emptyList(), true);
            assertTrue(known.blocked); assertEquals("known_rule", known.reason);
            DetectionPolicy.Decision personal = DetectionPolicy.evaluateDomain(target, Collections.emptyList(), Arrays.asList(target), Collections.emptyList(), true);
            assertTrue(personal.blocked); assertEquals("personal_rule", personal.reason);
        }
        DetectionPolicy.Decision ordinaryApp = DetectionPolicy.evaluateApp("id.vendor.tracker", "Casino Deposit Tracker", false, false, true);
        assertFalse(ordinaryApp.blocked); assertEquals("suspected", ordinaryApp.verdict);
    }

    @Test public void applicationIdsAreBoundExactlyAndRejectUrlsOrInventoryText() {
        assertEquals("id.example.Private_App", DetectionPolicy.normalizePackage("id.example.Private_App"));
        for (String input : Arrays.asList("https://id.example.app", "id.example.app/path", "id.example.app?token=a", "id.example.*", "app", "id.example.app,other")) {
            try { DetectionPolicy.normalizePackage(input); fail(input); } catch (IllegalArgumentException expected) {}
        }
        assertFalse(DetectionPolicy.evaluateApp("https://slot-gacor.example", "Slot Gacor", false, false, true).blocked);
    }
}
