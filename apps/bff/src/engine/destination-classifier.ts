// apps/bff/src/engine/destination-classifier.ts -- the rich destination classifier (Overview site list).
//
// crdb returns the top destinations as raw endpoints (IP, or IP:port) and the Console reverse-DNS
// resolves them to PTR names -- but PTR names are noisy (`lb-140-82-112-5-iad.github.com`) and a flat
// "network" bucket collapses the Overview's right column to one ring. This classifier maps each
// destination to its CATEGORY (the four destination rings: network / saas / private-apps / data-stores)
// and a SIMPLE display name (`GitHub`, `Google DNS`, `Postgres`), so multiple load-balancer IPs merge
// under one brand and the site list reads like the agreed design.
//
// Classification is presentation-layer enrichment and lives in the BFF (never the engine): it is a
// LAYERED rule set over facts the BFF already holds (the IP, the port, the PTR name) -- no new lookups.
// Every rule is deterministic; an endpoint matching nothing stays `network` named by its PTR-derived
// registrable domain, else its raw IP (INV-CONSOLE-NO-STUB: never a fabricated name).

/** The four destination categories (the Overview's right-column rings, top to bottom). */
export type DestCategory = 'network' | 'saas' | 'private-apps' | 'data-stores';

/** A classified destination: which ring it belongs to + the simple display name. */
export interface ClassifiedDestination {
  readonly category: DestCategory;
  readonly name: string;
}

/** Well-known service ports -> data-store protocol names. TUNE: extend as new stores appear in captures. */
const DATA_STORE_PORTS: Readonly<Record<number, string>> = {
  1433: 'SQL Server',
  1521: 'Oracle DB',
  3306: 'MySQL',
  5432: 'Postgres',
  5984: 'CouchDB',
  6379: 'Redis',
  9042: 'Cassandra',
  9200: 'Elasticsearch',
  11211: 'Memcached',
  27017: 'MongoDB',
};

/** Well-known private-app protocol ports (the prototype's SSH / RDP / SMB rows). */
const PRIVATE_APP_PORTS: Readonly<Record<number, string>> = {
  22: 'SSH',
  445: 'Microsoft SMB',
  3389: 'RDP',
  5900: 'VNC',
};

/**
 * Brand rules: a PTR-name suffix -> the simple brand name + its category. Matched against the full
 * resolved name, longest suffix first, so `s3.amazonaws.com` wins over `amazonaws.com`. TUNE: this is the
 * curated brand map; extend it as real captures surface new services.
 */
const BRAND_RULES: readonly (readonly [suffix: string, name: string, category: DestCategory])[] = [
  // DNS resolvers (network infrastructure).
  ['dns.google', 'Google DNS', 'network'],
  ['one.one.one.one', 'Cloudflare DNS', 'network'],
  ['quad9.net', 'Quad9 DNS', 'network'],
  ['opendns.com', 'OpenDNS', 'network'],
  // CDNs / edges (network).
  ['cloudflare.com', 'Cloudflare', 'network'],
  ['fastly.net', 'Fastly', 'network'],
  ['akamaitechnologies.com', 'Akamai', 'network'],
  ['akamai.net', 'Akamai', 'network'],
  ['cloudfront.net', 'CloudFront', 'network'],
  ['googleusercontent.com', 'Google Cloud', 'network'],
  // Data stores by brand.
  ['s3.amazonaws.com', 'Amazon S3', 'data-stores'],
  // SaaS brands.
  ['github.com', 'GitHub', 'saas'],
  ['github.io', 'GitHub', 'saas'],
  ['slack.com', 'Slack', 'saas'],
  ['salesforce.com', 'Salesforce', 'saas'],
  ['force.com', 'Salesforce', 'saas'],
  ['service-now.com', 'ServiceNow', 'saas'],
  ['zoom.us', 'Zoom', 'saas'],
  ['atlassian.net', 'Atlassian', 'saas'],
  ['atlassian.com', 'Atlassian', 'saas'],
  ['office365.com', 'Microsoft 365', 'saas'],
  ['outlook.com', 'Microsoft 365', 'saas'],
  ['sharepoint.com', 'Microsoft 365', 'saas'],
  ['amazonaws.com', 'AWS', 'saas'],
  ['azure.com', 'Microsoft Azure', 'saas'],
  ['azurewebsites.net', 'Microsoft Azure', 'saas'],
  ['googleapis.com', 'Google APIs', 'saas'],
  ['google.com', 'Google', 'saas'],
  ['1e100.net', 'Google', 'saas'],
  ['anthropic.com', 'Anthropic', 'saas'],
  ['openai.com', 'OpenAI', 'saas'],
  // Well-known web properties (network browsing).
  ['wikimedia.org', 'Wikipedia', 'network'],
  ['wikipedia.org', 'Wikipedia', 'network'],
];

/** Split `IP[:port]` -> the IPv4 and the numeric port (`undefined` when absent/not IPv4:port). */
function splitEndpoint(address: string): { ip: string; port?: number } {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/.exec(address);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { ip: match[1], port: Number(match[2]) };
  }
  return { ip: address };
}

/** True when the IPv4 is in a private/special range (RFC1918, loopback, link-local). */
function isPrivateIp(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  const [a, b] = octets;
  if (octets.length !== 4 || a === undefined || b === undefined) return false;
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** The longest matching brand rule for a resolved name, or `undefined`. */
function brandOf(resolvedName: string): ClassifiedDestination | undefined {
  const lower = resolvedName.toLowerCase();
  let best: (typeof BRAND_RULES)[number] | undefined;
  for (const rule of BRAND_RULES) {
    const [suffix] = rule;
    if (
      (lower === suffix || lower.endsWith(`.${suffix}`)) &&
      (best === undefined || suffix.length > best[0].length)
    ) {
      best = rule;
    }
  }
  return best ? { category: best[2], name: best[1] } : undefined;
}

/** The registrable-domain simple name of a PTR (`text-lb.codfw.wikimedia.org` -> `Wikimedia`), else undefined. */
function domainName(resolvedName: string): string | undefined {
  const labels = resolvedName
    .toLowerCase()
    .split('.')
    .filter((l) => l.length > 0);
  if (labels.length < 2) return undefined;
  // Take the label left of the TLD; step one deeper for two-part public suffixes (co.uk, com.au...).
  const secondLevel = labels[labels.length - 2];
  const core =
    labels.length >= 3 &&
    secondLevel !== undefined &&
    ['co', 'com', 'net', 'org', 'ac', 'gov'].includes(secondLevel)
      ? labels[labels.length - 3]
      : secondLevel;
  if (core === undefined || core.length === 0) return undefined;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

/**
 * Classify one destination endpoint into its Overview category + simple display name.
 *
 * Layered rules, first match wins: (1) special/private IPs (localhost, cloud metadata, RFC1918 -- with
 * well-known store/protocol ports refining the private category); (2) data-store ports on any address;
 * (3) the curated brand map over the PTR name; (4) private-app protocol ports; (5) fallback -- the PTR's
 * registrable domain title-cased, else the raw address, in the `network` category.
 */
export function classifyDestination(address: string, resolvedName?: string): ClassifiedDestination {
  const { ip, port } = splitEndpoint(address);
  const ptr = resolvedName?.trim();

  // A well-known data-store port is the most specific signal and wins even over localhost/private
  // ranges: a connection to 127.0.0.1:5432 is a Postgres session, not generic "Localhost" traffic.
  const storeName = port !== undefined ? DATA_STORE_PORTS[port] : undefined;
  if (storeName !== undefined) return { category: 'data-stores', name: storeName };

  if (ip === '169.254.169.254') return { category: 'private-apps', name: 'Cloud Metadata' };
  if (ip.startsWith('127.')) return { category: 'private-apps', name: 'Localhost' };

  const privateAppName = port !== undefined ? PRIVATE_APP_PORTS[port] : undefined;

  if (isPrivateIp(ip)) {
    if (privateAppName !== undefined) return { category: 'private-apps', name: privateAppName };
    const named = ptr !== undefined && ptr.length > 0 ? (domainName(ptr) ?? ptr) : ip;
    return { category: 'private-apps', name: named };
  }

  if (ptr !== undefined && ptr.length > 0) {
    const brand = brandOf(ptr);
    if (brand !== undefined) return brand;
  }
  if (privateAppName !== undefined) return { category: 'private-apps', name: privateAppName };
  if (ptr !== undefined && ptr.length > 0) {
    const simple = domainName(ptr);
    if (simple !== undefined) return { category: 'network', name: simple };
    return { category: 'network', name: ptr };
  }
  return { category: 'network', name: address };
}
