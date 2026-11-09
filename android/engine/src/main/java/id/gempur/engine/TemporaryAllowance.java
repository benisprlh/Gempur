package id.gempur.engine;

/** Exact-domain exception bound to one boot and both monotonic/wall-clock deadlines. */
public final class TemporaryAllowance {
    public final String domain;
    public final long createdWall, createdElapsed, expiresWall, expiresElapsed;
    public final int bootId;

    public TemporaryAllowance(String domain, long createdWall, long createdElapsed, long expiresWall, int bootId) {
        this.domain = DomainRules.normalize(domain);
        long duration = expiresWall - createdWall;
        if (duration <= 0 || duration > 30 * 60 * 1000L || createdElapsed < 0 || bootId < 0) {
            throw new IllegalArgumentException("Pengecualian harus berakhir dalam 30 menit");
        }
        this.createdWall = createdWall; this.createdElapsed = createdElapsed;
        this.expiresWall = expiresWall; this.expiresElapsed = createdElapsed + duration; this.bootId = bootId;
    }

    public boolean isActive(long nowWall, long nowElapsed, int currentBootId) {
        return currentBootId == bootId && nowWall >= createdWall && nowWall < expiresWall
                && nowElapsed >= createdElapsed && nowElapsed < expiresElapsed;
    }
}
