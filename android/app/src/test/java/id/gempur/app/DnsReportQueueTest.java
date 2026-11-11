package id.gempur.app;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public final class DnsReportQueueTest {
    @Test(timeout = 5000)
    public void slowWriterCannotMakeDnsCallerRunQueuedReports() throws Exception {
        DnsReportQueue queue = new DnsReportQueue();
        CountDownLatch writing = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(1);
        AtomicInteger additionalWrites = new AtomicInteger();
        try {
            assertTrue(queue.offer(() -> {
                writing.countDown();
                try {
                    release.await();
                } catch (InterruptedException closed) {
                    Thread.currentThread().interrupt();
                } finally {
                    finished.countDown();
                }
            }));
            assertTrue(writing.await(2, TimeUnit.SECONDS));
            for (int i = 0; i < 32; i++) assertTrue(queue.offer(additionalWrites::incrementAndGet));
            assertFalse(queue.offer(additionalWrites::incrementAndGet));
            assertEquals(0, additionalWrites.get());
            queue.close();
            assertTrue(finished.await(2, TimeUnit.SECONDS));
            assertFalse(queue.offer(additionalWrites::incrementAndGet));
            assertEquals(0, additionalWrites.get());
        } finally {
            queue.close();
            release.countDown();
        }
    }
}
