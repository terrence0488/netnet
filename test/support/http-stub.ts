import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** What a stub origin heard: method, path, headers and the raw body. */
export interface StubRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface StubOrigin {
  url: string;
  requests: StubRequest[];
  close: () => Promise<void>;
}

type Responder = (req: StubRequest, res: ServerResponse<IncomingMessage>) => void | Promise<void>;

/** A local origin for the smoke and probe tests: fixed responses, every request recorded. */
export async function startStubOrigin(respond: Responder): Promise<StubOrigin> {
  const requests: StubRequest[] = [];
  const server: Server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      requests.push({
        method: req.method ?? '',
        path: (req.url ?? '').split('?')[0] ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      await respond(requests[requests.length - 1] as StubRequest, res);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
