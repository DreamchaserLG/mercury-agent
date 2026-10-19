import { basename } from 'node:path';
import { StreamableHTTPClientTransport, type Transport } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { createGuardedFetch } from '../../utils/ssrf.js';
import { redactSecrets } from '../../utils/redact.js';
import type { ResolvedSecrets } from './config.js';
import type { McpServerConfig } from './types.js';

export const STDERR_TAIL_CHARS = 8 * 1024;

export interface CreatedTransport {
  transport: Transport;
  stderrTail: () => string;
}

export function describeTarget(server: McpServerConfig): string {
  if (server.transport === 'stdio') return basename(server.command ?? '');
  try {
    return new URL(server.url ?? '').origin;
  } catch {
    return '';
  }
}

function createStdioTransport(server: McpServerConfig, resolved: ResolvedSecrets): CreatedTransport {
  const transport = new StdioClientTransport({
    command: server.command ?? '',
    args: resolved.args,
    cwd: server.cwd,
    env: { ...getDefaultEnvironment(), ...resolved.env },
    stderr: 'pipe',
  });
  let tail = '';
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    tail = (tail + chunk.toString()).slice(-STDERR_TAIL_CHARS);
  });
  return { transport, stderrTail: () => redactSecrets(tail) };
}

function createHttpTransport(server: McpServerConfig, resolved: ResolvedSecrets): CreatedTransport {
  const transport = new StreamableHTTPClientTransport(new URL(server.url ?? ''), {
    fetch: createGuardedFetch({ allowPrivate: server.allowPrivate === true }),
    requestInit: { headers: resolved.headers },
    redirectPolicy: 'same-origin',
  });
  return { transport, stderrTail: () => '' };
}

export function createTransport(server: McpServerConfig, resolved: ResolvedSecrets): CreatedTransport {
  return server.transport === 'stdio' ? createStdioTransport(server, resolved) : createHttpTransport(server, resolved);
}
