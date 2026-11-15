export function createVercelConfig(backendUrl) {
    if (!backendUrl) throw new Error("Set BACKEND_URL in Vercel to your Render HTTPS origin, then redeploy.");
    const backend = new URL(backendUrl);
    if (backend.protocol !== "https:" || backend.origin !== backendUrl || backend.username || backend.password) throw new Error("BACKEND_URL must be an HTTPS origin without a path or trailing slash.");
    return {
        framework: null,
        installCommand: "npm ci --include=dev",
        buildCommand: "npm run build",
        outputDirectory: "dist",
        rewrites: [{ source: "/api/:path*", destination: `${backend.origin}/api/:path*` }],
        headers: [
            { source: "/(.*)", headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; upgrade-insecure-requests" },
                { key: "Cache-Control", value: "no-cache" },
            ] },
            { source: "/api/:path*", headers: [
                { key: "Cache-Control", value: "no-store" },
                { key: "CDN-Cache-Control", value: "no-store" },
                { key: "x-vercel-enable-rewrite-caching", value: "0" },
            ] },
        ],
    };
}
