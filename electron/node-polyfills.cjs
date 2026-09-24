'use strict';

/**
 * Node 16 (Electron 22 main process) polyfills required by the Next.js 14
 * server runtime. Next 14 expects Node 18+ globals: WHATWG fetch/Headers/
 * Request/Response (undici in Node 18) and web streams (ReadableStream etc.).
 * Electron 22 ships Node 16.17 — these shims make the embedded server run on
 * Windows 7-compatible runtimes. No-ops on Node 18+.
 */
const undici = require('undici');

if (!globalThis.Headers) globalThis.Headers = undici.Headers;
if (!globalThis.Request) globalThis.Request = undici.Request;
if (!globalThis.Response) globalThis.Response = undici.Response;
if (!globalThis.fetch) globalThis.fetch = undici.fetch;

const ws = require('web-streams-polyfill/ponyfill');
if (!globalThis.ReadableStream) globalThis.ReadableStream = ws.ReadableStream;
if (!globalThis.WritableStream) globalThis.WritableStream = ws.WritableStream;
if (!globalThis.TransformStream) globalThis.TransformStream = ws.TransformStream;
