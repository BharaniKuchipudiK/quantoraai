import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

function ipv4ToNumber(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function inV4Range(value, network, prefix) {
  const networkValue = ipv4ToNumber(network);
  if (value === null || networkValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (networkValue & mask);
}

export function isPrivateOrSpecialIp(address) {
  const family = net.isIP(String(address || ''));
  if (!family) return true;

  if (family === 4) {
    const value = ipv4ToNumber(address);
    const blocked = [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ];
    return blocked.some(([network, prefix]) => inV4Range(value, network, prefix));
  }

  const lower = String(address).toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (/^f[cd]/.test(lower)) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (/^ff/.test(lower)) return true;
  if (lower.startsWith('2001:db8:') || lower === '2001:db8::') return true;

  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrSpecialIp(mapped[1]);
  return false;
}

export function isDisallowedImageHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (net.isIP(host)) return isPrivateOrSpecialIp(host);
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.home.arpa')
    || host === 'metadata.google.internal';
}

export async function resolvePublicImageTarget(value) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(String(value || ''));
  } catch {
    throw new Error('Image URL is invalid.');
  }

  if (url.protocol !== 'https:') throw new Error('Remote images must use HTTPS.');
  if (url.username || url.password) throw new Error('Image URLs may not contain credentials.');
  if (url.port && url.port !== '443') throw new Error('Remote images must use the standard HTTPS port.');
  if (isDisallowedImageHostname(url.hostname)) throw new Error('Image URL points to a private or reserved host.');

  const literalFamily = net.isIP(url.hostname);
  const records = literalFamily
    ? [{ address: url.hostname, family: literalFamily }]
    : await dns.lookup(url.hostname, { all: true, verbatim: true });

  if (!records.length) throw new Error('Image hostname did not resolve.');
  if (records.some((record) => isPrivateOrSpecialIp(record.address))) {
    throw new Error('Image hostname resolves to a private or reserved network.');
  }

  return { url, address: records[0].address, family: records[0].family };
}

function requestResolvedHttps(target, timeoutMs) {
  return new Promise((resolve, reject) => {
    const { url, address, family } = target;
    const req = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: 443,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      // Keep the public hostname for TLS certificate/SNI validation but pin the
      // socket to the exact public IP we already vetted. No second DNS lookup is
      // allowed, closing the DNS-rebinding gap between validation and connect.
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
      headers: {
        Host: url.host,
        Accept: 'image/*',
        'User-Agent': 'Quantora Office Renderer/1.0',
      },
      timeout: timeoutMs,
    }, resolve);
    req.on('timeout', () => req.destroy(new Error('Image download timed out.')));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchPublicHttpsImage(value, { maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let current;
  try {
    current = value instanceof URL ? new URL(value.href) : new URL(String(value || ''));
  } catch {
    throw new Error('Image URL is invalid.');
  }

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const target = await resolvePublicImageTarget(current);
    const response = await requestResolvedHttps(target, timeoutMs);
    const status = Number(response.statusCode || 0);

    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume();
      if (redirect === MAX_REDIRECTS) throw new Error('Image URL redirected too many times.');
      current = new URL(response.headers.location, current);
      continue;
    }

    if (status < 200 || status >= 300) {
      response.resume();
      throw new Error(`Image server returned HTTP ${status || 'error'}.`);
    }

    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      response.resume();
      throw new Error('Remote URL did not return an image.');
    }

    const declared = Number(response.headers['content-length'] || 0);
    if (declared && declared > maxBytes) {
      response.resume();
      throw new Error('Remote image is too large to embed safely.');
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of response) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) {
        response.destroy();
        throw new Error('Remote image exceeded the safe download limit.');
      }
      chunks.push(bytes);
    }

    if (!total) throw new Error('Remote image was empty.');
    return {
      bytes: Buffer.concat(chunks, total),
      contentType,
      finalUrl: current.href,
    };
  }

  throw new Error('Image could not be fetched safely.');
}
