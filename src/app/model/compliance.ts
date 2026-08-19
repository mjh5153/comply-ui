

/**
 * Frontend mirror of the BFF compliance contract (server/compliance/types.ts).
 *
 * These are served by the Express BFF, not by the Spring COMPLY API - which is
 * why every payload carries provenance.mode. The UI must surface that: findings
 * labelled 'fixture' are generated locally and are NOT COMPLY engine output.
 */

export type PiiCategory =
    'EMAIL' | 'NAME' | 'GOVERNMENT_ID' | 'HEALTH' | 'FINANCIAL' | 'LOCATION';

export type PiiTreatment = 'RAW' | 'PSEUDONYMIZED' | 'ENCRYPTED' | 'ANONYMIZED';

export interface PiiElement {
    category: PiiCategory;
    treatment: PiiTreatment;
}

export type TransferMechanism = 'NONE' | 'SCC' | 'ADEQUACY' | 'BCR';
export type LawfulBasis = 'CONSENT' | 'CONTRACT' | 'LEGITIMATE_INTEREST' | 'LEGAL_OBLIGATION';
export type ProcessingPurpose =
    'MARKETING' | 'ANALYTICS' | 'SERVICE_DELIVERY' | 'FINANCIAL_RECORDS' | 'HR' | 'SECURITY';

export interface ProcessingProfile {
    companyId: number;
    retentionDays: number;
    dataResidency: string;
    piiElements: PiiElement[];
    transferMechanism: TransferMechanism;
    lawfulBasis: LawfulBasis;
    processingPurpose: ProcessingPurpose;
    subprocessors: string[];
    dataSubjectLocation?: string;
    dpaExecuted?: boolean;
    legitimateInterestAssessment?: boolean;
}

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Applicability = 'NOT_APPLICABLE' | 'POSSIBLE' | 'LIKELY' | 'CONFIRMED';
export type ProvenanceSource = 'engine' | 'analyst' | 'ai';
export type ProvenanceMode = 'fixture' | 'live';

export interface Provenance {
    source: ProvenanceSource;
    mode: ProvenanceMode;
    producedAt: string;
    engineVersion?: string;
    ruleSetVersion?: string;
}

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

export interface RuleCatalogue {
    engineMode: ProvenanceMode;
    rules: RuleDescriptor[];
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
    from?: any;
    to: any;
}

export interface ScenarioResult {
    baseline: EvaluationResult;
    modified: EvaluationResult;
    modifications: ProfileModification[];
    rejectedModifications: string[];
    delta: FindingDelta[];
    provenance: Provenance;
}

export type ExplanationQuestion =
    'WHY_PRODUCED' | 'TRIGGERING_FACTS' | 'MISSING_INFORMATION' |
    'WHY_APPLICABILITY' | 'RECOMMENDED_CONTROLS' | 'PLAIN_LANGUAGE';

export interface FindingsExplanation {
    findingId: string;
    question: ExplanationQuestion;
    text: string;
    groundedIn: string[];
    provenance: Provenance;
}
