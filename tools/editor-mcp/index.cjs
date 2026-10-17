const path = require('node:path');

const bridgeState = Symbol.for('scrapworks.editor-mcp');

exports.title = 'Scrapworks scene MCP';
exports.main = function main(editor) {
  if (editor[bridgeState]) return;
  // Use the official bridge shipped with this Editor; do not patch its installation.
  const { startMcpServer } = require(path.join(editor.path, 'build/src/mcp/mcp.js'));
  editor[bridgeState] = startMcpServer(editor, { port: 3712 })
    .then((server) => {
      editor.layout.console.log(`Scrapworks scene MCP listening on localhost:${server.port}`);
      window.addEventListener('beforeunload', () => void server.close(), { once: true });
      return server;
    })
    .catch((error) => {
      delete editor[bridgeState];
      editor.layout.console.error(`Scrapworks scene MCP failed: ${error.message}`);
    });
};
