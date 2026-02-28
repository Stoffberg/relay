import alchemy from "alchemy";
import { TanStackStart } from "alchemy/cloudflare";

const API_URL = process.env.API_URL ?? "https://code-api.stoff.dev";
const SPACETIME_URL = process.env.SPACETIME_URL ?? "wss://maincloud.spacetimedb.com";
const SPACETIME_DB_NAME = process.env.SPACETIME_DB_NAME ?? "relay";

const app = await alchemy("relay", {
  stage: process.env.STAGE ?? "production",
});

export const web = await TanStackStart("relay-web", {
  cwd: "../../apps/web",
  domains: ["code.stoff.dev"],
  bindings: {
    VITE_API_URL: API_URL,
    VITE_SPACETIME_URL: SPACETIME_URL,
    VITE_SPACETIME_DB_NAME: SPACETIME_DB_NAME,
    VITE_RELAY_API_KEY: "",
    VITE_ENV: process.env.VITE_ENV ?? "production",
    API_URL: "",
    RELAY_API_KEY: "",
  },
});

console.log(`Web -> ${web.url}`);
console.log(`API -> ${API_URL}`);

await app.finalize();
