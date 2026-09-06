package uk.co.sumerostudio.nexuai3dforge;

/** Numeric IPv4 validation. Deliberately performs no DNS, redirect or hostname resolution. */
public final class PrivateNetwork {
    private PrivateNetwork() { }
    public static boolean isPrivateIpv4(String value) {
        if (value == null || value.length() < 7 || value.length() > 15) return false;
        String[] fields = value.split("\\.", -1);
        if (fields.length != 4) return false;
        int[] octet = new int[4];
        for (int i = 0; i < 4; i++) {
            String field = fields[i];
            if (field.isEmpty() || field.length() > 3 || (field.length() > 1 && field.charAt(0) == '0')) return false;
            for (int j = 0; j < field.length(); j++) {
                char c = field.charAt(j);
                if (c < '0' || c > '9') return false;
                octet[i] = octet[i] * 10 + c - '0';
            }
            if (octet[i] > 255) return false;
        }
        // Link-local cloud metadata addresses are not Forge hosts.
        if (value.equals("169.254.169.254") || value.equals("169.254.170.2")) return false;
        return octet[0] == 127 || octet[0] == 10
            || (octet[0] == 172 && octet[1] >= 16 && octet[1] <= 31)
            || (octet[0] == 192 && octet[1] == 168)
            || (octet[0] == 169 && octet[1] == 254);
    }
    public static void requireEndpoint(String host, int port) {
        if (!isPrivateIpv4(host)) throw new IllegalArgumentException("Use the private IPv4 address shown by Windows Forge. Public addresses, hostnames and IPv6 are not supported.");
        if (port < 1024 || port > 65535) throw new IllegalArgumentException("Companion port must be between 1024 and 65535.");
    }
}
