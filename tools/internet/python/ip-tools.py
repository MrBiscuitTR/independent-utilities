#Individual functions for getting ip addresses, open ports, and other network information. These functions can be used in other scripts or run standalone in the main part to get/print the information.

import socket
import ssl
import sys


HOST = "cloudflare.com"
PATH = "/cdn-cgi/trace"
PORT = 443


def _get_ip(force_ipv6=False, timeout=5):
    family = socket.AF_INET6 if force_ipv6 else socket.AF_INET

    try:
        addr_info = socket.getaddrinfo(HOST, PORT, family, socket.SOCK_STREAM)
    except socket.gaierror:
        return None  # No IPv6 available or DNS failed

    for entry in addr_info:
        af, socktype, proto, canonname, sa = entry
        try:
            sock = socket.socket(af, socktype, proto)
            sock.settimeout(timeout)

            context = ssl.create_default_context()
            tls_sock = context.wrap_socket(sock, server_hostname=HOST)

            tls_sock.connect(sa)

            request = (
                f"GET {PATH} HTTP/1.1\r\n"
                f"Host: {HOST}\r\n"
                "Connection: close\r\n"
                "\r\n"
            )

            tls_sock.sendall(request.encode())

            response = b""
            while True:
                data = tls_sock.recv(4096)
                if not data:
                    break
                response += data

            tls_sock.close()

            if b"\r\n\r\n" not in response:
                return None

            body = response.split(b"\r\n\r\n", 1)[1].decode(errors="ignore")

            for line in body.splitlines():
                if line.startswith("ip="):
                    return line.split("=", 1)[1].strip()

        except Exception:
            continue

    return None


def get_public_ipv4(timeout=5):
    return _get_ip(force_ipv6=False, timeout=timeout)


def get_public_ipv6(timeout=5):
    return _get_ip(force_ipv6=True, timeout=timeout)


if __name__ == "__main__":
    ipv4 = get_public_ipv4()
    ipv6 = get_public_ipv6()

    print(f"Public IPv4: {ipv4 if ipv4 else 'not available'}")
    print(f"Public IPv6: {ipv6 if ipv6 else 'not available'}")

    if not ipv4 and not ipv6:
        sys.exit(1)