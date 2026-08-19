

import {ComplianceEngine} from './types';
import {FixtureComplianceEngine} from './fixture-engine';
import {UpstreamComplianceEngine} from './upstream-engine';
import {FindingsExplanationProvider, FixtureExplanationProvider} from './explainer';

/**
 * Seam selection. One env var each, no registry and no DI container - swapping
 * to the real Spring engine should be a config change, not a refactor.
 *
 *   COMPLY_ENGINE_MODE     fixture (default) | live
 *   COMPLY_EXPLAINER_MODE  fixture (default)
 */

const engineMode = (process.env.COMPLY_ENGINE_MODE || 'fixture').toLowerCase();

export const engine: ComplianceEngine =
    engineMode === 'live' ? new UpstreamComplianceEngine() : new FixtureComplianceEngine();

export const explainer: FindingsExplanationProvider = new FixtureExplanationProvider();

export function describeEngineConfig(): string {
    return [
        '  COMPLY_ENGINE_MODE    = ' + engine.mode +
            (engine.mode === 'fixture' ? '  (findings are generated locally, not by the COMPLY API)' : ''),
        '  COMPLY_EXPLAINER_MODE = ' + explainer.mode +
            '  (explanations are non-authoritative)'
    ].join('\n');
}
