

import {Request, Response} from 'express';
import {URLSearchParams} from 'url';
import {config} from './config';

/**
 * Node 18+ exposes fetch globally. It is read off globalThis rather than
 * imported so that no extra HTTP dependency is added, and so the ambient
 * @types/node version in this project (which predates fetch) does not need
 * to be upgraded just to type it.
 */
const fetchFn: any = (globalThis as any).fetch;

/**
 * Read off globalThis for the same reason as fetch: the ambient @types/node
 * version in this project predates AbortSignal and does not declare it.
 */
const AbortSignalRef: any = (globalThis as any).AbortSignal;

if (!fetchFn) {
    throw new Error(
        'global fetch is unavailable - this BFF requires Node 18 or newer ' +
        '(see the engines field in package.json)');
}

/**
 * Builds the upstream URL, carrying over any query string the caller sent.
 * Query params are forwarded verbatim so that endpoints such as
 * /api/comply/external-api/concurrent?apiEndpoint=... keep working.
 */
function buildUpstreamUrl(path: string, query: any): string {

    const url = config.complyApiBaseUrl + path;

    if (!query) {
        return url;
    }

    const params = new URLSearchParams();

    Object.keys(query).forEach(key => {
        const value = query[key];
        if (Array.isArray(value)) {
            value.forEach(entry => params.append(key, String(entry)));
        } else if (value !== undefined && value !== null) {
            params.append(key, String(value));
        }
    });

    const queryString = params.toString();

    return queryString ? url + '?' + queryString : url;
}

function hasBody(method: string): boolean {
    return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

/**
 * Translates a failure to reach the upstream service into a gateway status
 * the frontend can act on, instead of surfacing a bare 500.
 *
 * On Render a free app service spins down when idle, so the first request
 * after a quiet period can legitimately time out. The frontend should be
 * able to tell that apart from an application error.
 */
function describeUpstreamFailure(error: any): { status: number, error: string, detail: string } {

    const name = error && error.name;
    const code = (error && error.cause && error.cause.code) || (error && error.code);

    if (name === 'TimeoutError' || name === 'AbortError') {
        return {
            status: 504,
            error: 'Gateway Timeout',
            detail: 'The COMPLY API did not respond within ' + config.upstreamTimeoutMs +
                    'ms. If the app service is idle it may still be starting up.'
        };
    }

    return {
        status: 502,
        error: 'Bad Gateway',
        detail: 'Could not reach the COMPLY API at ' + config.complyApiBaseUrl +
                (code ? ' (' + code + ')' : '')
    };
}

/**
 * Performs the upstream call and relays the result to the caller unchanged.
 *
 * The upstream status code is preserved deliberately: the Spring API answers
 * 404 for an unknown company id, and collapsing that into a 200 or a 500
 * would hide real API semantics from the Angular client.
 */
export async function forward(req: Request, res: Response, upstreamPath: string): Promise<void> {

    const method = req.method.toUpperCase();
    const url = buildUpstreamUrl(upstreamPath, req.query);

    const init: any = {
        method: method,
        headers: {'Accept': 'application/json'},
        signal: AbortSignalRef.timeout(config.upstreamTimeoutMs)
    };

    if (hasBody(method)) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(req.body === undefined ? null : req.body);
    }

    let upstreamResponse: any;

    try {
        upstreamResponse = await fetchFn(url, init);
    } catch (error) {
        const failure = describeUpstreamFailure(error);
        console.error('[bff] ' + method + ' ' + url + ' -> ' + failure.status + ' ' + failure.detail);
        res.status(failure.status).json({
            status: failure.status,
            error: failure.error,
            message: failure.detail,
            path: req.originalUrl
        });
        return;
    }

    const payload = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('content-type');

    console.log('[bff] ' + method + ' ' + url + ' -> ' + upstreamResponse.status);

    res.status(upstreamResponse.status);

    if (contentType) {
        res.set('Content-Type', contentType);
    }

    // An empty body (for example from DELETE /companies/{id}) must stay empty
    // rather than becoming the string "undefined".
    res.send(payload === undefined ? '' : payload);
}

/**
 * Convenience wrapper for routes whose upstream path is derived from the
 * incoming request, keeping the route table declarative.
 */
export function forwardTo(buildPath: (req: Request) => string) {
    return function (req: Request, res: Response) {
        return forward(req, res, buildPath(req));
    };
}

/**
 * Lightweight upstream reachability probe used by the health endpoint.
 */
export async function probeUpstream(): Promise<{ reachable: boolean, status?: number, detail?: string }> {
    try {
        const response = await fetchFn(config.complyApiBaseUrl + '/companies', {
            method: 'GET',
            headers: {'Accept': 'application/json'},
            signal: AbortSignalRef.timeout(config.upstreamTimeoutMs)
        });
        return {reachable: true, status: response.status};
    } catch (error) {
        const failure = describeUpstreamFailure(error);
        return {reachable: false, detail: failure.detail};
    }
}

/**
 * Fetches JSON from the COMPLY API for internal use, rather than relaying it
 * to a caller. Used by the compliance routes to confirm a company genuinely
 * exists in Spring before the engine evaluates a profile for it, so the two
 * halves of the app cannot drift apart.
 */
export async function fetchUpstreamJson(path: string): Promise<{ status: number, body: any }> {
    try {
        const response = await fetchFn(config.complyApiBaseUrl + path, {
            method: 'GET',
            headers: {'Accept': 'application/json'},
            signal: AbortSignalRef.timeout(config.upstreamTimeoutMs)
        });
        const text = await response.text();
        let body: any = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch (e) {
            body = text;
        }
        return {status: response.status, body: body};
    } catch (error) {
        return {status: 0, body: null};
    }
}
