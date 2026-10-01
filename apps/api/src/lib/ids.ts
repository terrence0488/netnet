/**
 * Prefixed ULIDs (architecture §6): `hld_01J…`. The ULID's first ten characters are the creation
 * time in milliseconds, so ids sort roughly by age; the other sixteen are random.
 */
export const ID_PREFIXES = ['usr', 'hld', 'val', 'typ', 'tag', 'aud', 'bat', 'con', 'att'] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

/** Crockford's base 32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_TIME = 2 ** 48 - 1;
const RANDOM_BYTES = 10;

const ULID = '[0-7][0-9A-HJKMNP-TV-Z]{25}';
const ID_PATTERN = new RegExp(`^(${ID_PREFIXES.join('|')})_${ULID}$`);

/** Encodes `value` (< 32^length) as `length` base-32 characters, most significant first. */
function encode(value: number, length: number): string {
  let out = '';
  let rest = value;
  for (let i = 0; i < length; i += 1) {
    out = ALPHABET.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/** Ten random bytes as sixteen characters, five bytes (eight characters) at a time. */
function encodeRandom(bytes: Uint8Array): string {
  let out = '';
  for (let offset = 0; offset < RANDOM_BYTES; offset += 5) {
    let chunk = 0;
    for (let i = offset; i < offset + 5; i += 1) chunk = chunk * 256 + (bytes[i] ?? 0);
    out += encode(chunk, 8);
  }
  return out;
}

function randomBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(RANDOM_BYTES));
}

/**
 * A new id such as `hld_01JD3Q5V7W8X9Y0Z1A2B3C4D5E`. `time` and `random` exist for tests and
 * fixtures, which need fixed ids; the app never passes them.
 */
export function newId(
  prefix: IdPrefix,
  time: number = Date.now(),
  random: () => Uint8Array = randomBytes,
): string {
  if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError(`newId(): time must be an integer from 0 to 2^48 - 1, got ${time}`);
  }
  const bytes = random();
  if (bytes.length !== RANDOM_BYTES) {
    throw new RangeError(`newId(): random must give ${RANDOM_BYTES} bytes, got ${bytes.length}`);
  }
  return `${prefix}_${encode(time, 10)}${encodeRandom(bytes)}`;
}

/** Whether `value` is a well-formed id, optionally with the given prefix. */
export function isId(value: unknown, prefix?: IdPrefix): value is string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) return false;
  return prefix === undefined || value.startsWith(`${prefix}_`);
}
