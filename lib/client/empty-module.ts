// Empty module stub for Node.js modules that don't exist in browser.
// GramJS imports net/tls but auto-detects browser and uses WebSocket instead.
// The `os` stub provides type()/release() because GramJS reads them for InitConnection.
export default Object.freeze({
  type: () => "Browser",
  release: () => "1.0",
});
