

/**
 * Compliance domain contracts.
 *
 * These are deliberately written as the contract the Spring COMPLY API should
 * eventually implement, not as a shape convenient for the fixture engine.
 * When Spring grows these endpoints, UpstreamComplianceEngine forwards to them
 * and only `mode` changes from 'fixture' to 'live'.
 */

export type CountryCode = string;

export type PiiCategory =
    'EMAIL' | 'NAME' | 'GOVERNMENT_ID' | 'HEALTH' | 'FINANCIAL' | 'LOCATION';

export type PiiTreatment = 'RAW' | 'PSEUDONYMIZED' | 'ENCRYPTED' | 'ANONYMIZED';

/**
 * PII is modelled per element rather than as a flat category list so that a
 * change such as "raw email -> pseudonymized email" is a typed field edit.
 */
export interface PiiElement {
    category: PiiCategory;
    treatment: PiiTreatment;
}

export type TransferMechanism = 'NONE' | 'SCC' | 'ADEQUACY' | 'BCR';

export type LawfulBasis =
    'CONSENT' | 'CONTRACT' | 'LEGITIMATE_INTEREST' | 'LEGAL_OBLIGATION';

export type ProcessingPurpose =
    'MARKETING' | 'ANALYTICS' | 'SERVICE_DELIVERY' | 'FINANCIAL_RECORDS' | 'HR' | 'SECURITY';

/**
 * The evaluated subject. The optional fields at the bottom are the facts whose
 * ABSENCE holds a finding at LIKELY instead of CONFIRMED - see deriveApplicability.
 */
export interface ProcessingProfile {
    companyId: number;
    retentionDays: number;
    dataResidency: CountryCode;
    piiElements: PiiElement[];
    transferMechanism: TransferMechanism;
    lawfulBasis: LawfulBasis;
    processingPurpose: ProcessingPurpose;
    subprocessors: string[];

    dataSubjectLocation?: CountryCode;
    dpaExecuted?: boolean;
    legitimateInterestAssessment?: boolean;
}

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Applicability = 'NOT_APPLICABLE' | 'POSSIBLE' | 'LIKELY' | 'CONFIRMED';

export type ProvenanceSource = 'engine' | 'analyst' | 'ai';

export type ProvenanceMode = 'fixture' | 'live';

/**
 * Provenance is embedded in each object rather than wrapping it: an envelope's
 * provenance is lost the moment a component destructures the payload, and a
 * compliance UI destructures constantly.
 */
export interface Provenance {
    source: ProvenanceSource;
    mode: ProvenanceMode;
    producedAt: string;
    engineVersion?: string;
    ruleSetVersion?: string;
}

/** The specific profile fact that caused a rule to fire. */
export interface TriggeringFact {
    path: string;
    value: any;
    operator: string;
    threshold?: any;
}

export interface LawMapping {
    framework: string;
    citation: string;
    title: string;
    url?: string;
}

export interface Finding {
    id: string;
    ruleId: string;
    severity: Severity;
    applicability: Applicability;
    title: string;
    rationale: string;
    lawMappings: LawMapping[];
    triggeringFacts: TriggeringFact[];
    recommendedControls: string[];
    missingInformation: string[];
    assumptions: string[];
    provenance: Provenance;
}

export interface EvaluationResult {
    companyId: number;
    profile: ProcessingProfile;
    findings: Finding[];
    provenance: Provenance;
}

export interface RuleDescriptor {
    id: string;
    title: string;
    severity: Severity;
    description: string;
    lawMappings: LawMapping[];
    requiredFacts: string[];
}

export type DeltaKind =
    'INTRODUCED' | 'RESOLVED' | 'SEVERITY_CHANGED' | 'APPLICABILITY_CHANGED' | 'UNCHANGED';

export interface FindingDelta {
    ruleId: string;
    title: string;
    kind: DeltaKind;
    beforeSeverity?: Severity;
    afterSeverity?: Severity;
    beforeApplicability?: Applicability;
    afterApplicability?: Applicability;
}

export interface ProfileModification {
    path: string;
    from: any;
    to: any;
}

export interface ScenarioResult {
    baseline: EvaluationResult;
    modified: EvaluationResult;
    modifications: ProfileModification[];
    delta: FindingDelta[];
    provenance: Provenance;
}

/**
 * The seam. Two implementations, selected by COMPLY_ENGINE_MODE.
 */
export interface ComplianceEngine {
    mode: ProvenanceMode;
    evaluate(profile: ProcessingProfile): Promise<EvaluationResult>;
    describeRules(): Promise<RuleDescriptor[]>;
}
