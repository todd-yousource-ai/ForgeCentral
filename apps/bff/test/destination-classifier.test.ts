import { describe, expect, it } from 'vitest';

import { classifyDestination } from '../src/engine/destination-classifier.js';

describe('classifyDestination', () => {
  it('classifies special and private addresses as private-apps', () => {
    expect(classifyDestination('169.254.169.254')).toEqual({
      category: 'private-apps',
      name: 'Cloud Metadata',
    });
    expect(classifyDestination('127.0.0.1')).toEqual({
      category: 'private-apps',
      name: 'Localhost',
    });
    // RFC1918 with no PTR falls back to the IP, still private.
    expect(classifyDestination('10.0.0.9')).toEqual({ category: 'private-apps', name: '10.0.0.9' });
  });

  it('classifies well-known data-store ports on any address', () => {
    expect(classifyDestination('10.0.0.20:5432')).toEqual({
      category: 'data-stores',
      name: 'Postgres',
    });
    expect(classifyDestination('203.0.113.7:6379')).toEqual({
      category: 'data-stores',
      name: 'Redis',
    });
    expect(classifyDestination('192.168.1.4:27017')).toEqual({
      category: 'data-stores',
      name: 'MongoDB',
    });
    // The store port is the most specific signal: it wins even over the localhost rule.
    expect(classifyDestination('127.0.0.1:5432')).toEqual({
      category: 'data-stores',
      name: 'Postgres',
    });
  });

  it('classifies private-app protocol ports (SSH / RDP / SMB)', () => {
    expect(classifyDestination('10.1.2.3:22')).toEqual({ category: 'private-apps', name: 'SSH' });
    expect(classifyDestination('192.168.0.9:3389')).toEqual({
      category: 'private-apps',
      name: 'RDP',
    });
    expect(classifyDestination('10.4.4.4:445')).toEqual({
      category: 'private-apps',
      name: 'Microsoft SMB',
    });
  });

  it('maps PTR brands to simple names with their category (longest suffix wins)', () => {
    expect(classifyDestination('140.82.112.5:443', 'lb-140-82-112-5-iad.github.com')).toEqual({
      category: 'saas',
      name: 'GitHub',
    });
    expect(classifyDestination('8.8.8.8', 'dns.google')).toEqual({
      category: 'network',
      name: 'Google DNS',
    });
    expect(classifyDestination('1.1.1.1', 'one.one.one.one')).toEqual({
      category: 'network',
      name: 'Cloudflare DNS',
    });
    // s3.amazonaws.com is a data store even though amazonaws.com alone is SaaS (longest suffix).
    expect(classifyDestination('52.216.0.1:443', 'bucket.s3.amazonaws.com')).toEqual({
      category: 'data-stores',
      name: 'Amazon S3',
    });
    expect(classifyDestination('52.10.0.1:443', 'ec2-52-10-0-1.amazonaws.com')).toEqual({
      category: 'saas',
      name: 'AWS',
    });
  });

  it('falls back to the title-cased registrable domain, else the raw address (never fabricated)', () => {
    expect(classifyDestination('208.80.153.224:443', 'text-lb.codfw.wikimedia.org')).toEqual({
      category: 'network',
      name: 'Wikipedia', // brand rule
    });
    expect(classifyDestination('198.51.100.7:443', 'edge-7.someisp.net')).toEqual({
      category: 'network',
      name: 'Someisp',
    });
    expect(classifyDestination('203.0.113.9:443')).toEqual({
      category: 'network',
      name: '203.0.113.9:443',
    });
  });
});
