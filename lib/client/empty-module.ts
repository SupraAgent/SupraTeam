// Empty module stub for Node.js modules that don't exist in browser.
// GramJS imports net/tls but auto-detects browser and uses WebSocket instead.
// The `os` stub provides type()/release() because GramJS reads them for InitConnection.
//
// Named exports are required: GramJS os.js uses __importStar(require("os")),
// which copies named properties to the namespace. A default-only export puts
// type/release on namespace.default, but telegramBaseClient accesses
// os_1.default.type() — one level up.
export const type = () => "Browser";
export const release = () => "1.0";
export default Object.freeze({ type, release });
