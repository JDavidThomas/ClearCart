import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const {
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: apiToken,
  CLOUDFLARE_TUNNEL_ID: tunnelId,
  EXPO_PACKAGER_PROXY_URL: proxyUrl,
  EXPO_TUNNEL_HOSTNAME: hostname,
  PORT: rawPort,
  API_PORT: rawApiPort = "8080",
} = process.env;

const port = Number(rawPort);
const apiPort = Number(rawApiPort);

for (const [name, value] of Object.entries({
  CLOUDFLARE_ACCOUNT_ID: accountId,
  CLOUDFLARE_API_TOKEN: apiToken,
  CLOUDFLARE_TUNNEL_ID: tunnelId,
  EXPO_PACKAGER_PROXY_URL: proxyUrl,
  EXPO_TUNNEL_HOSTNAME: hostname,
  PORT: rawPort,
})) {
  if (!value) throw new Error(`Missing required development setting: ${name}`);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  throw new Error("API_PORT must be a valid TCP port.");
}

const parsedProxyUrl = new URL(proxyUrl);
if (parsedProxyUrl.hostname !== hostname || parsedProxyUrl.protocol !== "https:") {
  throw new Error("EXPO_PACKAGER_PROXY_URL must be the HTTPS URL for EXPO_TUNNEL_HOSTNAME.");
}

const apiBaseUrl = "https://api.cloudflare.com/client/v4";

async function cloudflareRequest(method, resourcePath, body) {
  const response = await fetch(`${apiBaseUrl}${resourcePath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const details = (payload.errors ?? [])
      .map(({ code, message }) => `${code}: ${message}`)
      .join("; ");
    throw new Error(
      `Cloudflare ${method} ${resourcePath} failed (${response.status})${details ? `: ${details}` : ""}`,
    );
  }
  return payload.result;
}

const tunnelPath = `/accounts/${accountId}/cfd_tunnel/${tunnelId}`;
await cloudflareRequest("PUT", `${tunnelPath}/configurations`, {
  config: {
    ingress: [
      {
        hostname,
        path: "^/api(/.*)?$",
        service: `http://127.0.0.1:${apiPort}`,
        originRequest: {},
      },
      {
        hostname,
        service: `http://127.0.0.1:${port}`,
        originRequest: {},
      },
      { service: "http_status:404" },
    ],
  },
});

const tunnelToken = await cloudflareRequest("GET", `${tunnelPath}/token`);
if (typeof tunnelToken !== "string" || tunnelToken.length === 0) {
  throw new Error("Cloudflare returned no run token for the named tunnel.");
}

const tokenDirectory = await mkdtemp(path.join(tmpdir(), "food-recall-cloudflare-"));
const tokenFile = path.join(tokenDirectory, "tunnel-token");
await writeFile(tokenFile, tunnelToken, { mode: 0o600, flag: "wx" });

const children = [];
let stopping = false;
let remainingChildren = 0;
let exitCode = 0;
let tokenCleaned = false;

async function cleanTokenFile() {
  if (tokenCleaned) return;
  tokenCleaned = true;
  await rm(tokenDirectory, { recursive: true, force: true });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }

  const forceStop = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }, 5000);
  forceStop.unref();
}

async function onChildExit(code) {
  remainingChildren -= 1;
  if (!stopping) stop(code ?? 1);
  if (remainingChildren === 0) {
    await cleanTokenFile();
    process.exitCode = exitCode;
  }
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

const tunnel = spawn("cloudflared", ["tunnel", "run", "--token-file", tokenFile], {
  stdio: "inherit",
});
children.push(tunnel);
remainingChildren += 1;
tunnel.on("error", (error) => {
  console.error(`Could not start cloudflared: ${error.message}`);
  stop(1);
});
tunnel.on("close", (code) => void onChildExit(code));

const expo = spawn(
  "pnpm",
  ["exec", "expo", "start", "--host", "lan", "--clear", "--port", String(port)],
  {
    env: process.env,
    stdio: "inherit",
  },
);
children.push(expo);
remainingChildren += 1;
expo.on("error", (error) => {
  console.error(`Could not start Expo: ${error.message}`);
  stop(1);
});
expo.on("close", (code) => void onChildExit(code));