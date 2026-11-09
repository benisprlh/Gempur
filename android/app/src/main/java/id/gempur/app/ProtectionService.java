package id.gempur.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.system.OsConstants;
import id.gempur.engine.DnsCodec;
import id.gempur.engine.DomainRules;
import id.gempur.engine.Ipv4Udp;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** DNS-only local VPN. It does not tunnel browsing traffic or inspect HTTPS content. */
public final class ProtectionService extends VpnService {
    public static final String ACTION_START = "id.gempur.app.PROTECTION_START";
    public static final String ACTION_STOP = "id.gempur.app.PROTECTION_STOP";
    public static final String ACTION_RELOAD = "id.gempur.app.PROTECTION_RELOAD";
    public static final String PREFS = "gempur-protection";
    private static final String CHANNEL = "gempur_protection";
    private static final String DNS_ADDRESS = "198.18.0.1";
    private static final byte[] DNS_BYTES = {(byte)198, 18, 0, 1};
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    private final Object writeLock = new Object();
    private ParcelFileDescriptor tunnel;
    private FileInputStream input;
    private FileOutputStream output;
    private Thread reader;
    private ThreadPoolExecutor workers;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final AtomicBoolean stopping = new AtomicBoolean(false);

    public static boolean isRunning() { return RUNNING.get(); }

    /** Call off the main thread. Probes the synthetic resolver, not a live gambling site. */
    public static boolean selfTest() {
        if (!RUNNING.get()) return false;
        byte[] query = DnsCodec.query("gempur-block.test", new java.security.SecureRandom().nextInt(65536));
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.connect(InetAddress.getByAddress(DNS_BYTES), 53); socket.setSoTimeout(2500);
            socket.send(new DatagramPacket(query, query.length));
            byte[] buffer = new byte[512]; DatagramPacket response = new DatagramPacket(buffer, buffer.length); socket.receive(response);
            byte[] answer = Arrays.copyOf(response.getData(), response.getLength());
            return DnsCodec.matchesResponse(query, answer) && (answer[3] & 15) == 3;
        } catch (Exception unavailable) { return false; }
    }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Proteksi domain", NotificationManager.IMPORTANCE_LOW));
        // Old persisted status is never evidence that a newly started process is protecting traffic.
        state("unverified", "");
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) { stopProtection("stopped", ""); return START_NOT_STICKY; }
        if (ACTION_RELOAD.equals(action) && RUNNING.get()) return START_NOT_STICKY;
        if (!ACTION_START.equals(action)) { stopSelf(); return START_NOT_STICKY; }
        if (RUNNING.get()) return START_NOT_STICKY;
        startForeground(101, notification());
        try {
            if (VpnService.prepare(this) != null) throw new IllegalStateException("Izin VPN perlu diaktifkan kembali");
            RuleRepository.load(this); // Refuse to claim protection if the bundled rules cannot be loaded.
            if (strictPrivateDnsActive()) {
                stopProtection("private_dns_conflict", "Private DNS kustom aktif. Proteksi belum dimulai agar DNS terenkripsi Anda tidak diam-diam diturunkan. Tinjau pengaturan DNS terlebih dahulu.");
                return START_NOT_STICKY;
            }
            // Only the synthetic resolver is routed. Non-DNS traffic is not forwarded through Gempur.
            tunnel = new Builder().setSession("Gempur · proteksi DNS terbatas")
                    .addAddress("198.18.0.2", 32).addRoute(DNS_ADDRESS, 32).addDnsServer(DNS_ADDRESS)
                    .allowFamily(OsConstants.AF_INET6).setMtu(32767).setBlocking(true).establish();
            if (tunnel == null) throw new IllegalStateException("VPN belum dapat diaktifkan");
            input = new FileInputStream(tunnel.getFileDescriptor());
            output = new FileOutputStream(tunnel.getFileDescriptor());
            stopping.set(false);
            workers = new ThreadPoolExecutor(2, 4, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(64),
                    new ThreadPoolExecutor.AbortPolicy());
            RUNNING.set(true); state("active_dns_only", "");
            reader = new Thread(this::readLoop, "gempur-dns-reader"); reader.start();
            observeNetworks();
        } catch (Exception failed) {
            stopProtection("error", "Proteksi DNS gagal dimulai. Periksa izin VPN dan koneksi.");
        }
        return START_NOT_STICKY;
    }

    private Notification notification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, ProtectionService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle("Gempur · proteksi DNS terbatas")
                .setContentText("Domain dikenal dibatasi. DoH/DoT dan VPN lain dapat melewati filter.")
                .setContentIntent(content).setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Hentikan", stop).build()).build();
    }

    private void readLoop() {
        byte[] buffer = new byte[65535];
        try {
            while (RUNNING.get() && !Thread.currentThread().isInterrupted()) {
                int length = input.read(buffer);
                if (length < 0) break;
                if (length == 0) continue;
                final Ipv4Udp.Packet packet;
                try {
                    packet = Ipv4Udp.parse(buffer, length);
                    if (packet.destinationPort != 53 || !Arrays.equals(packet.destination, DNS_BYTES)) continue;
                    DnsCodec.parseQuery(packet.payload);
                } catch (IllegalArgumentException unsupported) { continue; }
                try { workers.execute(() -> resolve(packet)); }
                catch (java.util.concurrent.RejectedExecutionException busy) { send(packet, DnsCodec.servfail(packet.payload)); }
            }
            if (!stopping.get()) stopProtection("unverified", "Layanan proteksi berhenti; periksa dan aktifkan kembali.");
        } catch (Exception disconnected) {
            if (!stopping.get()) stopProtection("unverified", "Layanan proteksi terputus; kondisi saat ini belum terverifikasi.");
        }
    }

    private void resolve(Ipv4Udp.Packet packet) {
        if (!RUNNING.get()) return;
        try {
            DnsCodec.Query query = DnsCodec.parseQuery(packet.payload);
            DomainRules rules = RuleRepository.load(this);
            if (rules.isBlocked(query.domain)) {
                countBlock(); send(packet, DnsCodec.nxdomain(packet.payload)); return;
            }
            if (packet.payload.length > 4096) { send(packet, DnsCodec.servfail(packet.payload)); return; }
            for (Resolver resolver : resolvers()) {
                try (DatagramSocket socket = new DatagramSocket()) {
                    if (!protect(socket)) continue;
                    resolver.network.bindSocket(socket);
                    socket.connect(resolver.address, 53); socket.setSoTimeout(1500);
                    socket.send(new DatagramPacket(packet.payload, packet.payload.length));
                    byte[] buffer = new byte[32739];
                    DatagramPacket reply = new DatagramPacket(buffer, buffer.length);
                    socket.receive(reply);
                    if (reply.getLength() == buffer.length) continue; // Do not relay a possibly truncated datagram.
                    byte[] payload = Arrays.copyOf(reply.getData(), reply.getLength());
                    if (DnsCodec.matchesResponse(packet.payload, payload)) { send(packet, payload); return; }
                } catch (Exception unavailable) { /* Try the next system resolver, never upload diagnostics containing a domain. */ }
            }
            send(packet, DnsCodec.servfail(packet.payload));
        } catch (Exception failed) { send(packet, DnsCodec.servfail(packet.payload)); }
    }

    private List<Resolver> resolvers() {
        ConnectivityManager connectivity = getSystemService(ConnectivityManager.class);
        List<Resolver> result = new ArrayList<>();
        Network active = connectivity.getActiveNetwork();
        List<Network> networks = new ArrayList<>();
        if (active != null) networks.add(active);
        for (Network network : connectivity.getAllNetworks()) if (!network.equals(active)) networks.add(network);
        for (Network network : networks) {
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(network);
            if (capabilities == null || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
                    || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
            LinkProperties properties = connectivity.getLinkProperties(network);
            if (properties == null) continue;
            for (InetAddress address : properties.getDnsServers()) {
                if (!Arrays.equals(address.getAddress(), DNS_BYTES)) result.add(new Resolver(network, address));
                if (result.size() >= 4) return result;
            }
        }
        // No hard-coded third-party DNS fallback: use only the device's underlying configured resolvers.
        return result;
    }

    private boolean strictPrivateDnsActive() {
        ConnectivityManager connectivity = getSystemService(ConnectivityManager.class);
        for (Network network : connectivity.getAllNetworks()) {
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(network);
            if (capabilities == null || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
                    || !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
            LinkProperties properties = connectivity.getLinkProperties(network);
            if (properties != null && properties.getPrivateDnsServerName() != null) return true;
        }
        return false;
    }

    private void observeNetworks() {
        ConnectivityManager connectivity = getSystemService(ConnectivityManager.class);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onLinkPropertiesChanged(Network network, LinkProperties properties) {
                if (RUNNING.get() && properties.getPrivateDnsServerName() != null) {
                    stopProtection("private_dns_conflict", "Private DNS kustom aktif. Proteksi DNS Gempur dihentikan; tinjau konfigurasi sebelum melanjutkan.");
                }
            }
        };
        connectivity.registerNetworkCallback(new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(), networkCallback);
    }

    private void send(Ipv4Udp.Packet packet, byte[] dns) {
        if (!RUNNING.get()) return;
        try {
            byte[] bytes = Ipv4Udp.response(packet, dns);
            synchronized (writeLock) { if (output != null && RUNNING.get()) output.write(bytes); }
        } catch (Exception failed) { /* Tunnel closure is reflected in service status, never log private DNS data. */ }
    }

    private synchronized void countBlock() {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putLong("blocked_count", prefs.getLong("blocked_count", 0) + 1)
                .putLong("last_event", System.currentTimeMillis()).apply();
    }

    private void state(String status, String error) {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("status", status)
                .putString("last_error", error).putLong("status_at", System.currentTimeMillis()).apply();
    }

    private synchronized void stopProtection(String status, String error) {
        if (!stopping.compareAndSet(false, true)) return;
        RUNNING.set(false); state(status, error);
        if (networkCallback != null) {
            try { getSystemService(ConnectivityManager.class).unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
            networkCallback = null;
        }
        if (workers != null) workers.shutdownNow();
        try { if (tunnel != null) tunnel.close(); } catch (Exception ignored) {}
        try { if (input != null) input.close(); } catch (Exception ignored) {}
        synchronized (writeLock) { try { if (output != null) output.close(); } catch (Exception ignored) {} output = null; }
        input = null; tunnel = null;
        if (reader != null) reader.interrupt();
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
    }

    @Override public void onRevoke() { stopProtection("permission_revoked", "Izin VPN berubah atau VPN lain aktif."); super.onRevoke(); }
    @Override public void onDestroy() { stopProtection("stopped", ""); super.onDestroy(); }

    private static final class Resolver {
        final Network network; final InetAddress address;
        Resolver(Network network, InetAddress address) { this.network = network; this.address = address; }
    }
}
