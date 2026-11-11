package id.gempur.app;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Best-effort metadata writes. DNS workers never wait for capacity or run a rejected write. */
final class DnsReportQueue {
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            1, 1, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32),
            task -> new Thread(task, "gempur-dns-report"), new ThreadPoolExecutor.AbortPolicy());

    DnsReportQueue() {
        executor.allowCoreThreadTimeOut(true);
    }

    boolean offer(Runnable report) {
        try {
            executor.execute(report);
            return true;
        } catch (RejectedExecutionException fullOrClosed) {
            return false;
        }
    }

    void close() {
        executor.shutdownNow();
    }
}
