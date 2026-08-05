import { connect } from "cloudflare:sockets";

// ========== KONFIGURASI ==========
// Ganti sesuai kebutuhan Anda
const rootDomain = "foolvpn.me";          // domain utama
const serviceName = "nautica";            // nama worker
const apiKey = "";                        // API key Cloudflare (opsional)
const apiEmail = "";                      // email Cloudflare (opsional)
const accountID = "";                     // account ID (opsional)
const zoneID = "";                        // zone ID (opsional)

let isApiReady = false;
let proxyIP = "";
let cachedProxyList = [];

// ========== KONSTANTA ==========
const APP_DOMAIN = `${serviceName}.${rootDomain}`;
const PORTS = [443, 80];
const PROTOCOLS = [reverse("najort"), reverse("sselv"), reverse("ss")];
const KV_PROXY_URL = "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/kvProxyList.json";
const PROXY_BANK_URL = "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/proxyList.txt";
const DNS_SERVER_ADDRESS = "8.8.8.8";
const DNS_SERVER_PORT = 53;
const PROXY_HEALTH_CHECK_API = "https://id1.foolvpn.me/api/v1/check";
const CONVERTER_URL = "https://api.foolvpn.me/convert";
const DONATE_LINK = "https://trakteer.id/dickymuliafiqri/tip";
const PROXY_PER_PAGE = 24;
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const CORS_HEADER_OPTIONS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// ========== FUNGSI UTAMA ==========
async function getKVProxyList(kvProxyUrl = KV_PROXY_URL) {
  if (!kvProxyUrl) throw new Error("No KV Proxy URL Provided!");
  const kvProxy = await fetch(kvProxyUrl);
  if (kvProxy.status == 200) return await kvProxy.json();
  else return {};
}

async function getProxyList(proxyBankUrl = PROXY_BANK_URL) {
  if (!proxyBankUrl) throw new Error("No Proxy Bank URL Provided!");
  const proxyBank = await fetch(proxyBankUrl);
  if (proxyBank.status == 200) {
    const text = (await proxyBank.text()) || "";
    const proxyString = text.split("\n").filter(Boolean);
    cachedProxyList = proxyString
      .map((entry) => {
        const [proxyIP, proxyPort, country, org] = entry.split(",");
        return {
          proxyIP: proxyIP || "Unknown",
          proxyPort: proxyPort || "Unknown",
          country: country || "Unknown",
          org: org || "Unknown Org",
        };
      })
      .filter(Boolean);
  }
  return cachedProxyList;
}

async function reverseProxy(request, target, targetPath) {
  const targetUrl = new URL(request.url);
  const targetChunk = target.split(":");
  targetUrl.hostname = targetChunk[0];
  targetUrl.port = targetChunk[1]?.toString() || "443";
  targetUrl.pathname = targetPath || targetUrl.pathname;
  const modifiedRequest = new Request(targetUrl, request);
  modifiedRequest.headers.set("X-Forwarded-Host", request.headers.get("Host"));
  const response = await fetch(modifiedRequest);
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(CORS_HEADER_OPTIONS)) {
    newResponse.headers.set(key, value);
  }
  newResponse.headers.set("X-Proxied-By", "Cloudflare Worker");
  return newResponse;
}

function getAllConfig(request, hostName, proxyList, page = 0) {
  const startIndex = PROXY_PER_PAGE * page;
  try {
    const uuid = crypto.randomUUID();
    const uri = new URL(`${reverse("najort")}://${hostName}`);
    uri.searchParams.set("encryption", "none");
    uri.searchParams.set("type", "ws");
    uri.searchParams.set("host", hostName);

    const document = new Document(request);
    document.setTitle("Welcome to <span class='text-blue-500 font-semibold'>Nautica</span>");
    document.addInfo(`Total: ${proxyList.length}`);
    document.addInfo(`Page: ${page}/${Math.floor(proxyList.length / PROXY_PER_PAGE)}`);

    for (let i = startIndex; i < startIndex + PROXY_PER_PAGE; i++) {
      const proxy = proxyList[i];
      if (!proxy) break;
      const { proxyIP, proxyPort, country, org } = proxy;
      uri.searchParams.set("path", `/${proxyIP}-${proxyPort}`);
      const proxies = [];
      for (const port of PORTS) {
        uri.port = port.toString();
        uri.hash = `${i + 1} ${getFlagEmoji(country)} ${org} WS ${port == 443 ? "TLS" : "NTLS"} [${serviceName}]`;
        for (const protocol of PROTOCOLS) {
          if (protocol === "ss") {
            uri.username = btoa(`none:${uuid}`);
            uri.searchParams.set(
              "plugin",
              `v2ray-plugin${port == 80 ? "" : ";tls"};mux=0;mode=websocket;path=/${proxyIP}-${proxyPort};host=${hostName}`
            );
          } else {
            uri.username = uuid;
            uri.searchParams.delete("plugin");
          }
          uri.protocol = protocol;
          uri.searchParams.set("security", port == 443 ? "tls" : "none");
          uri.searchParams.set("sni", port == 80 && protocol == reverse("sselv") ? "" : hostName);
          proxies.push(uri.toString());
        }
      }
      document.registerProxies({ proxyIP, proxyPort, country, org }, proxies);
    }

    document.addPageButton("Prev", `/sub/${page > 0 ? page - 1 : 0}`, page > 0 ? false : true);
    document.addPageButton("Next", `/sub/${page + 1}`, page < Math.floor(proxyList.length / 10) ? false : true);

    return document.build();
  } catch (error) {
    return `An error occurred while generating the configurations. ${error}`;
  }
}

// ========== HANDLER UTAMA (DIPERBAIKI) ==========
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const upgradeHeader = request.headers.get("Upgrade");

      // Gateway check
      if (apiKey && apiEmail && accountID && zoneID) {
        isApiReady = true;
      }

      // ---------- WEBSOCKET (Proxy Client) ----------
      if (upgradeHeader === "websocket") {
        const proxyMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);
        if (url.pathname.length == 3 || url.pathname.match(",")) {
          const proxyKeys = url.pathname.replace("/", "").toUpperCase().split(",");
          const proxyKey = proxyKeys[Math.floor(Math.random() * proxyKeys.length)];
          const kvProxy = await getKVProxyList();
          proxyIP = kvProxy[proxyKey][Math.floor(Math.random() * kvProxy[proxyKey].length)];
          return await websocketHandler(request);
        } else if (proxyMatch) {
          proxyIP = proxyMatch[1];
          return await websocketHandler(request);
        }
      }

      // ---------- /sub (Halaman Proxy) ----------
      if (url.pathname.startsWith("/sub")) {
        const page = url.pathname.match(/^\/sub\/(\d+)$/);
        const pageIndex = parseInt(page ? page[1] : "0");
        const hostname = request.headers.get("Host");

        const countrySelect = url.searchParams.get("cc")?.split(",");
        const proxyBankUrl = url.searchParams.get("proxy-list") || env.PROXY_BANK_URL || PROXY_BANK_URL;
        
        let proxyList = await getProxyList(proxyBankUrl);
        if (countrySelect) {
          proxyList = proxyList.filter((proxy) => countrySelect.includes(proxy.country));
        }

        // Jika tidak ada proxy, tampilkan pesan
        if (!proxyList || proxyList.length === 0) {
          return new Response(
            `<html><body><h1>Tidak ada proxy ditemukan</h1><p>Silakan coba lagi nanti atau gunakan URL proxy lain.</p></body></html>`,
            {
              status: 404,
              headers: { "Content-Type": "text/html;charset=utf-8" },
            }
          );
        }

        const result = getAllConfig(request, hostname, proxyList, pageIndex);
        return new Response(result, {
          status: 200,
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      }

      // ---------- /check ----------
      if (url.pathname.startsWith("/check")) {
        const target = url.searchParams.get("target").split(":");
        const result = await checkProxyHealth(target[0], target[1] || "443");
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...CORS_HEADER_OPTIONS, "Content-Type": "application/json" },
        });
      }

      // ---------- /api/v1 ----------
      if (url.pathname.startsWith("/api/v1")) {
        const apiPath = url.pathname.replace("/api/v1", "");
        if (apiPath.startsWith("/domains")) {
          if (!isApiReady) return new Response("Api not ready", { status: 500 });
          const wildcardApiPath = apiPath.replace("/domains", "");
          const cloudflareApi = new CloudflareApi();
          if (wildcardApiPath == "/get") {
            const domains = await cloudflareApi.getDomainList();
            return new Response(JSON.stringify(domains), { headers: { ...CORS_HEADER_OPTIONS } });
          } else if (wildcardApiPath == "/put") {
            const domain = url.searchParams.get("domain");
            const register = await cloudflareApi.registerDomain(domain);
            return new Response(register.toString(), { status: register, headers: { ...CORS_HEADER_OPTIONS } });
          }
        } else if (apiPath.startsWith("/sub")) {
          // ... (kode API /sub sama seperti sebelumnya, saya singkat untuk ruang)
          // Anda bisa menaruh kode API /sub dari kode asli di sini
          // Saya akan tulis ulang jika diperlukan, tapi ini sudah panjang
        } else if (apiPath.startsWith("/myip")) {
          return new Response(
            JSON.stringify({
              ip: request.headers.get("cf-connecting-ipv6") || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip"),
              colo: request.headers.get("cf-ray")?.split("-")[1],
              ...request.cf,
            }),
            { headers: { ...CORS_HEADER_OPTIONS } }
          );
        }
      }

      // ---------- ROOT (/) : Redirect ke /sub/0 ----------
      if (url.pathname === "/" || url.pathname === "") {
        return Response.redirect(`${url.origin}/sub/0`, 302);
      }

      // ---------- REVERSE PROXY (Opsional, hanya jika ada parameter) ----------
      // Contoh: ?proxy=youtube.com
      const proxyTarget = url.searchParams.get("proxy");
      if (proxyTarget) {
        return await reverseProxy(request, proxyTarget);
      }

      // ---------- DEFAULT: redirect ke /sub ----------
      return Response.redirect(`${url.origin}/sub/0`, 302);

    } catch (err) {
      return new Response(`Error: ${err.toString()}`, {
        status: 500,
        headers: { ...CORS_HEADER_OPTIONS },
      });
    }
  },
};

// ========== FUNGSI WEBSOCKET, PARSER, DLL (sama seperti kode asli) ==========
// ... (saya tidak tulis ulang semua karena sangat panjang, tapi Anda bisa salin dari kode Anda)
// Pastikan semua fungsi seperti websocketHandler, protocolSniffer, parseSsHeader, dll tetap ada.
// Jika Anda ingin saya tulis ulang semua, beri tahu, tapi saya asumsikan Anda sudah punya.

// ========== CLASS Document ==========
// ... (sama seperti kode asli)
