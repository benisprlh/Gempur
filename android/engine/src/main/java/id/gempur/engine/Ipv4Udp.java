package id.gempur.engine;

import java.util.Arrays;

/** Minimal IPv4/UDP codec for the DNS-only TUN route, not a general TCP/IP stack. */
public final class Ipv4Udp {
    private Ipv4Udp() {}
    public static final class Packet {
        public final byte[] source;
        public final byte[] destination;
        public final int sourcePort;
        public final int destinationPort;
        public final byte[] payload;
        private Packet(byte[] source, byte[] destination, int sourcePort, int destinationPort, byte[] payload) {
            this.source = source; this.destination = destination;
            this.sourcePort = sourcePort; this.destinationPort = destinationPort; this.payload = payload;
        }
    }

    public static Packet parse(byte[] bytes, int length) {
        if (bytes == null || length < 28 || length > bytes.length || length > 65535 || (bytes[0] >>> 4 & 15) != 4) throw invalid();
        int ihl = (bytes[0] & 15) * 4;
        if (ihl < 20 || ihl + 8 > length || (bytes[9] & 255) != 17) throw invalid();
        int total = DnsCodec.u16(bytes, 2);
        if (total < ihl + 8 || total != length || (DnsCodec.u16(bytes, 6) & 0x3fff) != 0) throw invalid();
        if (checksum(bytes, 0, ihl, 0) != 0) throw invalid();
        int udpLength = DnsCodec.u16(bytes, ihl + 4);
        if (udpLength < 8 || udpLength != total - ihl || DnsCodec.u16(bytes, ihl) == 0) throw invalid();
        int udpChecksum = DnsCodec.u16(bytes, ihl + 6);
        if (udpChecksum != 0 && checksum(bytes, ihl, udpLength, pseudoSum(bytes, udpLength)) != 0) throw invalid();
        return new Packet(Arrays.copyOfRange(bytes, 12, 16), Arrays.copyOfRange(bytes, 16, 20),
                DnsCodec.u16(bytes, ihl), DnsCodec.u16(bytes, ihl + 2), Arrays.copyOfRange(bytes, ihl + 8, total));
    }

    public static byte[] response(Packet request, byte[] payload) {
        if (request == null || payload == null || payload.length > 65507) throw invalid();
        return packet(request.destination, request.source, request.destinationPort, request.sourcePort, payload);
    }

    public static byte[] packet(byte[] source, byte[] destination, int sourcePort, int destinationPort, byte[] payload) {
        if (source == null || source.length != 4 || destination == null || destination.length != 4 || payload == null
                || payload.length > 65507 || sourcePort < 1 || sourcePort > 65535 || destinationPort < 1 || destinationPort > 65535) throw invalid();
        byte[] result = new byte[payload.length + 28];
        result[0] = 0x45; result[8] = 64; result[9] = 17;
        DnsCodec.put16(result, 2, result.length);
        System.arraycopy(source, 0, result, 12, 4); System.arraycopy(destination, 0, result, 16, 4);
        DnsCodec.put16(result, 20, sourcePort); DnsCodec.put16(result, 22, destinationPort);
        DnsCodec.put16(result, 24, payload.length + 8);
        System.arraycopy(payload, 0, result, 28, payload.length);
        DnsCodec.put16(result, 10, checksum(result, 0, 20, 0));
        int udpChecksum = checksum(result, 20, payload.length + 8, pseudoSum(result, payload.length + 8));
        DnsCodec.put16(result, 26, udpChecksum == 0 ? 0xffff : udpChecksum);
        return result;
    }

    private static long pseudoSum(byte[] ip, int udpLength) {
        long sum = 17 + udpLength;
        for (int p = 12; p < 20; p += 2) sum += DnsCodec.u16(ip, p);
        return sum;
    }

    private static int checksum(byte[] data, int offset, int length, long initial) {
        long sum = initial;
        int end = offset + length;
        for (int p = offset; p < end; p += 2) sum += (data[p] & 255) * 256 + (p + 1 < end ? data[p + 1] & 255 : 0);
        while ((sum >>> 16) != 0) sum = (sum & 0xffff) + (sum >>> 16);
        return (int)(~sum) & 0xffff;
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Unsupported or invalid IPv4 UDP packet"); }
}
