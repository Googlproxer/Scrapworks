import path from 'node:path';
import { createRequire } from 'node:module';
import { errorMessage } from '../shared.ts';

const require = createRequire(import.meta.url);
const bridgeState = Symbol.for('scrapworks.editor-mcp');

interface Bridge {
  port: number;
  close(): void | Promise<void>;
}

interface EditorHost {
  path: string;
  layout: { console: Pick<Console, 'log' | 'error'> };
  [bridgeState]?: Promise<Bridge | void>;
}

interface BridgeModule {
  startMcpServer(editor: EditorHost, options: { port: number }): Promise<Bridge>;
}

export const title = 'Scrapworks scene MCP';

export function main(editor: EditorHost): void {
  if (editor[bridgeState]) return;
  // Use the official bridge shipped with this Editor; do not patch its installation.
  const { startMcpServer } = require(
    path.join(editor.path, 'build/src/mcp/mcp.js'),
  ) as BridgeModule;
  editor[bridgeState] = startMcpServer(editor, { port: 3712 })
    .then((server) => {
      editor.layout.console.log(`Scrapworks scene MCP listening on localhost:${server.port}`);
      window.addEventListener('beforeunload', () => void server.close(), { once: true });
      return server;
    })
    .catch((error: unknown) => {
      delete editor[bridgeState];
      editor.layout.console.error(`Scrapworks scene MCP failed: ${errorMessage(error)}`);
    });
}
