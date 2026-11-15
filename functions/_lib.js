export function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...headers,
        },
    });
}

export async function readBody(request) {
    try {
        const value = await request.json();
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

export function hasFields(body, fields) {
    return fields.every((field) => body[field] !== undefined && body[field] !== null && String(body[field]).trim() !== "");
}

export function positiveInteger(value) {
    if (!["number", "string"].includes(typeof value) || !String(value).trim()) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function positiveNumber(value) {
    if (!["number", "string"].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

export function nonNegativeNumber(value) {
    if (!["number", "string"].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) return NaN;
    return Number(value);
}

// Both values have already been validated to two decimals. Integer arithmetic
// avoids binary floating-point rounding errors (for example, 0.5 × 1.13).
export function lineTotalCents(quantity, price) {
    return (BigInt(Math.round(quantity * 100)) * BigInt(Math.round(price * 100)) + 50n) / 100n;
}

export function makeCode(prefix) {
    return `${prefix}${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

export async function hashToken(token) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getCookie(request, name) {
    const cookieHeader = request.headers.get("Cookie") || "";
    for (const cookie of cookieHeader.split(";")) {
        const separator = cookie.indexOf("=");
        if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
        return cookie.slice(separator + 1).trim();
    }
    return null;
}

function toBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 210_000, hash: "SHA-256" },
        passwordKey,
        256,
    );
    return `pbkdf2_sha256$210000$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, encoded) {
    const [algorithm, iterationsText, saltText, expectedText] = String(encoded).split("$");
    const iterations = Number(iterationsText);
    if (algorithm !== "pbkdf2_sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltText || !expectedText) {
        return false;
    }

    let salt;
    let expected;
    try {
        salt = fromBase64(saltText);
        expected = fromBase64(expectedText);
    } catch {
        return false;
    }

    const passwordKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        passwordKey,
        expected.length * 8,
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;

    let difference = 0;
    for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
    return difference === 0;
}

export function internalError(error, fallback = "Internal server error.") {
    console.error(error);
    return json({ error: fallback }, 500);
}
