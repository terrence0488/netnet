import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

/**
 * `ops/launch/server.json`, the official MCP Registry entry, against a vendored copy of the
 * registry's published schema (`ops/launch/server.schema.json`).
 *
 * Source: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json, read on
 * 26 October 2026 (HTTP 200). The `$schema` in server.json names the same URL. The hash below is
 * the vendored file's, so an accidental edit is caught: replace both together when the registry
 * publishes a newer schema.
 *
 * The registry's publisher guide (github.com/modelcontextprotocol/registry,
 * docs/modelcontextprotocol-io/quickstart.mdx, 26 October 2026) limits `description` to 100
 * characters and requires a remote URL that is publicly reachable. The DNS namespace rule
 * (docs/modelcontextprotocol-io/authentication.mdx) names a server `io.netnetapp/*` only when the
 * publisher proves control of `netnetapp.io` with an apex TXT record.
 */

const LAUNCH = join(import.meta.dirname, '..', '..', 'ops', 'launch');
const SCHEMA_FILE = join(LAUNCH, 'server.schema.json');
const SERVER_FILE = join(LAUNCH, 'server.json');

const SCHEMA_URL = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';
const SCHEMA_SHA256 = '3fba09590c99f61735d234822279f4223fab9e300c0a81e81c91ab62a4114de0';

const schemaText = readFileSync(SCHEMA_FILE, 'utf8');
const schema = JSON.parse(schemaText) as { $id: string; $schema: string };
const server = JSON.parse(readFileSync(SERVER_FILE, 'utf8')) as Record<string, unknown>;

const validate = new Ajv({ allErrors: true, strict: false, logger: false }).compile(schema);

describe('the MCP Registry entry in ops/launch/server.json', () => {
  it('vendors the published 2025-12-11 schema, unchanged', () => {
    expect(schema.$id).toBe(SCHEMA_URL);
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(createHash('sha256').update(schemaText).digest('hex')).toBe(SCHEMA_SHA256);
  });

  it('validates against the registry schema', () => {
    const valid = validate(server);
    expect(validate.errors ?? []).toStrictEqual([]);
    expect(valid).toBe(true);
  });

  it('names a namespace DNS verification can prove, and the connector URL', () => {
    expect(server.name).toBe('io.netnetapp/netnet');
    expect(server.$schema).toBe(SCHEMA_URL);
    expect(server.title).toBe('NetNet');
    expect(server.websiteUrl).toBe('https://netnetapp.io');
    expect(server.remotes).toStrictEqual([
      { type: 'streamable-http', url: 'https://netnetapp.io/mcp' },
    ]);
  });

  it('keeps the description within the registry publisher’s 100 characters', () => {
    expect(typeof server.description).toBe('string');
    expect((server.description as string).length).toBeLessThanOrEqual(100);
  });

  it('points its icon at an HTTPS URL on the same domain', () => {
    const icons = server.icons as { src: string; mimeType?: string; sizes?: string[] }[];
    expect(icons).toHaveLength(1);
    expect(icons[0]?.src).toBe('https://netnetapp.io/app/icons/icon-512.png');
    expect(icons[0]?.mimeType).toBe('image/png');
    expect(icons[0]?.sizes).toStrictEqual(['512x512']);
  });

  it('rejects a name without a namespace, as the registry does', () => {
    expect(validate({ ...server, name: 'netnet' })).toBe(false);
  });

  it('rejects a missing description and version', () => {
    for (const field of ['description', 'version'] as const) {
      const copy: Record<string, unknown> = { ...server };
      delete copy[field];
      expect(validate(copy), field).toBe(false);
    }
  });

  it('rejects a remote that is not Streamable HTTP or not HTTPS', () => {
    expect(
      validate({ ...server, remotes: [{ type: 'stdio', url: 'https://netnetapp.io/mcp' }] }),
    ).toBe(false);
    expect(
      validate({ ...server, remotes: [{ type: 'streamable-http', url: 'netnetapp.io/mcp' }] }),
    ).toBe(false);
  });
});
