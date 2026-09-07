import { Resolver } from "node:dns";
import type { LookupAddress, LookupAllOptions, LookupOneOptions } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

export type ManagedFetch = Readonly<{
  fetch: typeof fetch;
  close(): Promise<void>;
}>;

function parseServers(value: string): readonly string[] {
  const servers = value.split(",").map((server) => server.trim()).filter(Boolean);
  if (servers.length === 0 || servers.length > 3) throw new TypeError("DNS servers must contain between one and three addresses");
  return Object.freeze(servers);
}

export function createManagedDnsFetch(dnsServers: string): ManagedFetch {
  const resolver = new Resolver();
  resolver.setServers([...parseServers(dnsServers)]);

  const lookup = (
    hostname: string,
    options: LookupOneOptions | LookupAllOptions,
    callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    resolver.resolve4(hostname, (error, addresses) => {
      if (error) {
        callback(error, [], undefined);
        return;
      }
      if (addresses.length === 0) {
        const noData = new Error(`No IPv4 address found for ${hostname}`) as NodeJS.ErrnoException;
        noData.code = "ENODATA";
        callback(noData, [], undefined);
        return;
      }
      if (options.all) {
        callback(null, addresses.map((address) => ({ address, family: 4 })));
        return;
      }
      callback(null, addresses[0]!, 4);
    });
  };

  const dispatcher = new Agent({ connect: { lookup } });
  const managedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
    const body = hasBody ? new Uint8Array(await request.arrayBuffer()) : undefined;
    const response = await undiciFetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      ...(body ? { body } : {}),
      signal: request.signal,
      dispatcher,
    });
    const headers = new Headers();
    for (const [name, value] of response.headers.entries()) headers.append(name, value);
    return new Response(response.body as unknown as BodyInit, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  return Object.freeze({
    fetch: managedFetch,
    close: () => dispatcher.close(),
  });
}
