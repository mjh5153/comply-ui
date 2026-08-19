

/**
 * Runtime configuration for the BFF (Backend For Frontend).
 *
 * Every value is environment-driven so that the same build runs unchanged
 * locally and on Render, where the Angular web service and the Spring Boot
 * app service are deployed as two separate services with two different
 * origins. Nothing here may hardcode a localhost URL as a production default.
 */

function readInt(value: string, fallback: number): number {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
}

function stripTrailingSlashes(url: string): string {
    return url.replace(/\/+$/, '');
}

function readOrigins(value: string): string[] {
    if (!value) {
        return [];
    }
    return value.split(',')
        .map(origin => origin.trim())
        .filter(origin => origin.length > 0);
}

/**
 * Base URL of the Spring Boot COMPLY API.
 *
 * Local:  http://localhost:8080
 * Render: set COMPLY_API_BASE_URL to the app service's internal address,
 *         e.g. http://comply-api:8080 (private network) or the public
 *         https://comply-api.onrender.com URL.
 */
const complyApiBaseUrl = stripTrailingSlashes(
    process.env.COMPLY_API_BASE_URL || 'http://localhost:8080');

/**
 * Browser origins permitted to call this BFF directly.
 *
 * Locally the Angular dev server proxies /api through this process, so the
 * request is same-origin and CORS never applies. In production the browser
 * talks to the BFF cross-origin, so the web service's URL must be listed
 * here, e.g. CORS_ALLOWED_ORIGINS=https://comply-ui.onrender.com
 */
const corsAllowedOrigins = readOrigins(
    process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:4200');

export const config = {

    // Render injects PORT; it must be honoured or the deploy is marked unhealthy.
    port: readInt(process.env.PORT, 9000),

    complyApiBaseUrl: complyApiBaseUrl,

    corsAllowedOrigins: corsAllowedOrigins,

    // Fail fast rather than holding a browser connection open indefinitely
    // when the upstream app service is asleep, redeploying, or unreachable.
    upstreamTimeoutMs: readInt(process.env.COMPLY_API_TIMEOUT_MS, 15000),

    isProduction: process.env.NODE_ENV === 'production'
};

export function describeConfig(): string {
    return [
        '  COMPLY_API_BASE_URL   = ' + config.complyApiBaseUrl,
        '  CORS_ALLOWED_ORIGINS  = ' + (config.corsAllowedOrigins.length ? config.corsAllowedOrigins.join(', ') : '(none)'),
        '  COMPLY_API_TIMEOUT_MS = ' + config.upstreamTimeoutMs,
        '  NODE_ENV              = ' + (process.env.NODE_ENV || '(unset)')
    ].join('\n');
}
