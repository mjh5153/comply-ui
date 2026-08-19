

import {
    ProcessingProfile, TriggeringFact, RuleDescriptor, Severity,
    Applicability, LawMapping, PiiElement
} from './types';

export const RULE_SET_VERSION = '2026.08.1';

/**
 * Countries inside the EEA, for the Chapter V transfer test. Deliberately a
 * plain list rather than a Set so the file stays ES2017-safe under the BFF's
 * commonjs/es2017 tsconfig.
 */
const EEA: string[] = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
    'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
];

/** Countries with a European Commission adequacy decision. */
const ADEQUATE: string[] = ['GB', 'CH', 'CA', 'JP', 'KR', 'NZ', 'IL', 'UY', 'AR'];

function inEea(country: string): boolean {
    return EEA.indexOf(country) >= 0;
}

/** Retention ceiling in days, by processing purpose. */
const RETENTION_CEILING: { [purpose: string]: number } = {
    MARKETING: 90,
    SECURITY: 180,
    ANALYTICS: 365,
    SERVICE_DELIVERY: 1095,
    HR: 2190,
    FINANCIAL_RECORDS: 2555
};

/** Lawful bases that are defensible for a given purpose. */
const PERMITTED_BASES: { [purpose: string]: string[] } = {
    MARKETING: ['CONSENT', 'LEGITIMATE_INTEREST'],
    ANALYTICS: ['CONSENT', 'LEGITIMATE_INTEREST'],
    SERVICE_DELIVERY: ['CONTRACT', 'CONSENT'],
    FINANCIAL_RECORDS: ['LEGAL_OBLIGATION', 'CONTRACT'],
    HR: ['CONTRACT', 'LEGAL_OBLIGATION'],
    SECURITY: ['LEGITIMATE_INTEREST', 'LEGAL_OBLIGATION']
};

const SPECIAL_CATEGORY: string[] = ['HEALTH', 'GOVERNMENT_ID'];

function rawElements(profile: ProcessingProfile, categories: string[]): PiiElement[] {
    return (profile.piiElements || []).filter(function (e) {
        return e.treatment === 'RAW' && categories.indexOf(e.category) >= 0;
    });
}

/** What a rule returns when asked to evaluate a profile. */
export interface RuleOutcome {
    fires: boolean;
    triggeringFacts: TriggeringFact[];
    rationale: string;
    recommendedControls: string[];
    assumptions: string[];
    severity?: Severity;
}

export interface Rule {
    descriptor: RuleDescriptor;
    evaluate(profile: ProcessingProfile): RuleOutcome;
}

const NOT_FIRED: RuleOutcome = {
    fires: false, triggeringFacts: [], rationale: '',
    recommendedControls: [], assumptions: []
};

function gdpr(citation: string, title: string): LawMapping {
    return {
        framework: 'GDPR',
        citation: citation,
        title: title,
        url: 'https://gdpr-info.eu/'
    };
}

// ---------------------------------------------------------------------------
// RET-001 - retention exceeds the ceiling for the stated purpose
// ---------------------------------------------------------------------------

const RET_001: Rule = {
    descriptor: {
        id: 'RET-001',
        title: 'Retention period exceeds what the stated purpose requires',
        severity: 'MEDIUM',
        description:
            'Personal data must be kept no longer than is necessary for the purpose ' +
            'it was collected for. Each purpose carries a ceiling; exceeding it by a ' +
            'wide margin escalates severity.',
        lawMappings: [gdpr('Art. 5(1)(e)', 'Storage limitation')],
        requiredFacts: ['retentionDays', 'processingPurpose']
    },
    evaluate: function (profile) {
        const ceiling = RETENTION_CEILING[profile.processingPurpose];

        if (ceiling === undefined || profile.retentionDays <= ceiling) {
            return NOT_FIRED;
        }

        const overBy = profile.retentionDays - ceiling;
        const ratio = profile.retentionDays / ceiling;

        return {
            fires: true,
            severity: ratio >= 4 ? 'HIGH' : (ratio >= 2 ? 'MEDIUM' : 'LOW'),
            triggeringFacts: [{
                path: 'retentionDays',
                value: profile.retentionDays,
                operator: '>',
                threshold: ceiling
            }, {
                path: 'processingPurpose',
                value: profile.processingPurpose,
                operator: '='
            }],
            rationale:
                'Retention is set to ' + profile.retentionDays + ' days for purpose ' +
                profile.processingPurpose + ', which carries a ceiling of ' + ceiling +
                ' days. The profile exceeds it by ' + overBy + ' days.',
            recommendedControls: [
                'Reduce retention to ' + ceiling + ' days or fewer for this purpose',
                'Implement an automated deletion job at the retention boundary',
                'Record a documented justification if the longer period is required by law'
            ],
            assumptions: []
        };
    }
};

// ---------------------------------------------------------------------------
// XFER-001 - third-country transfer without a Chapter V mechanism
// ---------------------------------------------------------------------------

const XFER_001: Rule = {
    descriptor: {
        id: 'XFER-001',
        title: 'Personal data leaves the EEA without a transfer mechanism',
        severity: 'HIGH',
        description:
            'Transferring personal data outside the EEA requires an Article 46 ' +
            'safeguard unless the destination benefits from an adequacy decision. ' +
            'Without knowing where the data subjects are, this can only ever reach ' +
            'LIKELY - the engine will not assert a transfer it cannot confirm.',
        lawMappings: [
            gdpr('Art. 44', 'General principle for transfers'),
            gdpr('Art. 46', 'Transfers subject to appropriate safeguards')
        ],
        requiredFacts: ['dataResidency', 'transferMechanism', 'dataSubjectLocation']
    },
    evaluate: function (profile) {
        if (inEea(profile.dataResidency)) {
            return NOT_FIRED;
        }

        if (ADEQUATE.indexOf(profile.dataResidency) >= 0) {
            return NOT_FIRED;
        }

        if (profile.transferMechanism !== 'NONE') {
            return NOT_FIRED;
        }

        const assumptions: string[] = [];

        if (profile.dataSubjectLocation === undefined) {
            assumptions.push(
                'Assumes at least some data subjects are located in the EEA. ' +
                'dataSubjectLocation is not recorded on this profile.');
        } else if (!inEea(profile.dataSubjectLocation)) {
            return NOT_FIRED;
        }

        return {
            fires: true,
            triggeringFacts: [{
                path: 'dataResidency',
                value: profile.dataResidency,
                operator: 'outside',
                threshold: 'EEA + adequacy list'
            }, {
                path: 'transferMechanism',
                value: profile.transferMechanism,
                operator: '='
            }],
            rationale:
                'Data is stored in ' + profile.dataResidency + ', which is neither in ' +
                'the EEA nor covered by an adequacy decision, and transferMechanism is ' +
                'NONE. No Article 46 safeguard is recorded for the transfer.',
            recommendedControls: [
                'Execute Standard Contractual Clauses with the receiving entity',
                'Complete a Transfer Impact Assessment for the destination country',
                'Consider relocating storage to an EEA or adequacy-covered region'
            ],
            assumptions: assumptions
        };
    }
};

// ---------------------------------------------------------------------------
// PII-001 - special category data held in raw form
// ---------------------------------------------------------------------------

const PII_001: Rule = {
    descriptor: {
        id: 'PII-001',
        title: 'Special category data held without protective treatment',
        severity: 'CRITICAL',
        description:
            'Health and government identifier data attract Article 9 protection and ' +
            'require safeguards beyond those for ordinary personal data.',
        lawMappings: [
            gdpr('Art. 9', 'Processing of special categories of personal data'),
            gdpr('Art. 32', 'Security of processing')
        ],
        requiredFacts: ['piiElements']
    },
    evaluate: function (profile) {
        const raw = rawElements(profile, SPECIAL_CATEGORY);

        if (raw.length === 0) {
            return NOT_FIRED;
        }

        return {
            fires: true,
            triggeringFacts: raw.map(function (e, i) {
                return {
                    path: 'piiElements[' + i + '].treatment',
                    value: e.category + ':' + e.treatment,
                    operator: '=',
                    threshold: 'RAW'
                };
            }),
            rationale:
                'Special category data (' +
                raw.map(function (e) { return e.category; }).join(', ') +
                ') is held with treatment RAW. Article 9 data requires protective ' +
                'treatment such as encryption or pseudonymisation at rest.',
            recommendedControls: [
                'Encrypt special category fields at rest',
                'Restrict access to special category data by role',
                'Record the Article 9(2) condition relied upon'
            ],
            assumptions: []
        };
    }
};

// ---------------------------------------------------------------------------
// PII-002 - ordinary identifiers held raw where pseudonymisation is expected
// ---------------------------------------------------------------------------

const PII_002: Rule = {
    descriptor: {
        id: 'PII-002',
        title: 'Direct identifiers stored without pseudonymisation',
        severity: 'LOW',
        description:
            'Article 32 names pseudonymisation as an appropriate technical measure. ' +
            'Direct identifiers held raw increase the impact of a breach.',
        lawMappings: [gdpr('Art. 32(1)(a)', 'Pseudonymisation and encryption')],
        requiredFacts: ['piiElements']
    },
    evaluate: function (profile) {
        const raw = rawElements(profile, ['EMAIL', 'NAME', 'LOCATION']);

        if (raw.length === 0) {
            return NOT_FIRED;
        }

        return {
            fires: true,
            severity: raw.length >= 3 ? 'MEDIUM' : 'LOW',
            triggeringFacts: raw.map(function (e, i) {
                return {
                    path: 'piiElements[' + i + '].treatment',
                    value: e.category + ':' + e.treatment,
                    operator: '=',
                    threshold: 'RAW'
                };
            }),
            rationale:
                raw.length + ' direct identifier(s) (' +
                raw.map(function (e) { return e.category; }).join(', ') +
                ') are stored with treatment RAW rather than pseudonymised.',
            recommendedControls: [
                'Pseudonymise direct identifiers at rest',
                'Separate the re-identification key from the processing store'
            ],
            assumptions: []
        };
    }
};

// ---------------------------------------------------------------------------
// BASIS-001 - lawful basis not defensible for the stated purpose
// ---------------------------------------------------------------------------

const BASIS_001: Rule = {
    descriptor: {
        id: 'BASIS-001',
        title: 'Lawful basis is not defensible for the stated purpose',
        severity: 'HIGH',
        description:
            'Each processing purpose admits only certain Article 6 bases. Relying on ' +
            'legitimate interest additionally requires a documented balancing test.',
        lawMappings: [
            gdpr('Art. 6(1)', 'Lawfulness of processing'),
            gdpr('Art. 6(1)(f)', 'Legitimate interests')
        ],
        requiredFacts: ['lawfulBasis', 'processingPurpose', 'legitimateInterestAssessment']
    },
    evaluate: function (profile) {
        const permitted = PERMITTED_BASES[profile.processingPurpose];

        if (!permitted) {
            return NOT_FIRED;
        }

        const basisAllowed = permitted.indexOf(profile.lawfulBasis) >= 0;

        // A permitted legitimate-interest basis still needs a recorded assessment.
        const liaMissing = profile.lawfulBasis === 'LEGITIMATE_INTEREST' &&
                           profile.legitimateInterestAssessment !== true;

        if (basisAllowed && !liaMissing) {
            return NOT_FIRED;
        }

        if (!basisAllowed) {
            return {
                fires: true,
                triggeringFacts: [{
                    path: 'lawfulBasis',
                    value: profile.lawfulBasis,
                    operator: 'not in',
                    threshold: permitted.join(' | ')
                }, {
                    path: 'processingPurpose',
                    value: profile.processingPurpose,
                    operator: '='
                }],
                rationale:
                    'Purpose ' + profile.processingPurpose + ' is normally justified by ' +
                    permitted.join(' or ') + ', but this profile relies on ' +
                    profile.lawfulBasis + '.',
                recommendedControls: [
                    'Re-assess the lawful basis against the actual purpose',
                    'Update the record of processing activities to match'
                ],
                assumptions: []
            };
        }

        return {
            fires: true,
            severity: 'MEDIUM',
            triggeringFacts: [{
                path: 'lawfulBasis',
                value: profile.lawfulBasis,
                operator: '='
            }],
            rationale:
                'Processing relies on legitimate interest, which is permitted for ' +
                profile.processingPurpose + ', but no legitimate interest assessment ' +
                'is recorded on the profile.',
            recommendedControls: [
                'Complete and record a legitimate interest assessment',
                'Publish the balancing test outcome in the privacy notice'
            ],
            assumptions: []
        };
    }
};

// ---------------------------------------------------------------------------
// SUB-001 - subprocessors engaged without a data processing agreement
// ---------------------------------------------------------------------------

const SUB_001: Rule = {
    descriptor: {
        id: 'SUB-001',
        title: 'Subprocessors engaged without a recorded processing agreement',
        severity: 'HIGH',
        description:
            'Article 28 requires a written contract governing any processor. Where ' +
            'dpaExecuted is not recorded the finding is held at LIKELY rather than ' +
            'asserted as CONFIRMED.',
        lawMappings: [gdpr('Art. 28(3)', 'Processor contracts')],
        requiredFacts: ['subprocessors', 'dpaExecuted']
    },
    evaluate: function (profile) {
        const subs = profile.subprocessors || [];

        if (subs.length === 0) {
            return NOT_FIRED;
        }

        if (profile.dpaExecuted === true) {
            return NOT_FIRED;
        }

        const assumptions: string[] = [];

        if (profile.dpaExecuted === undefined) {
            assumptions.push(
                'Assumes no data processing agreement is in place. dpaExecuted is ' +
                'not recorded on this profile.');
        }

        return {
            fires: true,
            severity: subs.length >= 3 ? 'HIGH' : 'MEDIUM',
            triggeringFacts: [{
                path: 'subprocessors',
                value: subs.join(', '),
                operator: 'count >',
                threshold: 0
            }, {
                path: 'dpaExecuted',
                value: profile.dpaExecuted === undefined ? null : profile.dpaExecuted,
                operator: '!=',
                threshold: true
            }],
            rationale:
                subs.length + ' subprocessor(s) are engaged (' + subs.join(', ') +
                ') with no executed data processing agreement recorded.',
            recommendedControls: [
                'Execute an Article 28 data processing agreement with each subprocessor',
                'Maintain a current subprocessor register',
                'Obtain the controller authorisation required for each engagement'
            ],
            assumptions: assumptions
        };
    }
};

export const RULES: Rule[] = [RET_001, XFER_001, PII_001, PII_002, BASIS_001, SUB_001];

/**
 * Applicability is DERIVED from fact completeness, never hand-assigned.
 *
 *   predicate false                              -> NOT_APPLICABLE
 *   predicate holds only under a stated assumption -> POSSIBLE
 *   predicate true, a requiredFact is absent     -> LIKELY
 *   predicate true, every requiredFact present   -> CONFIRMED
 *
 * This is what makes "why is applicability marked likely?" answerable with no
 * model in the loop: the answer is the list of absent facts.
 */
export function deriveApplicability(
    rule: Rule, profile: ProcessingProfile, outcome: RuleOutcome
): { applicability: Applicability, missingInformation: string[] } {

    if (!outcome.fires) {
        return {applicability: 'NOT_APPLICABLE', missingInformation: []};
    }

    const missing: string[] = [];

    rule.descriptor.requiredFacts.forEach(function (path) {
        const value = (profile as any)[path];
        if (value === undefined || value === null) {
            missing.push(path);
        }
    });

    if (outcome.assumptions.length > 0) {
        return {applicability: 'POSSIBLE', missingInformation: missing};
    }

    if (missing.length > 0) {
        return {applicability: 'LIKELY', missingInformation: missing};
    }

    return {applicability: 'CONFIRMED', missingInformation: []};
}
