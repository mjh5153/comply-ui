

import {ProcessingProfile, PiiElement} from './types';

/**
 * In-memory store for processing profiles.
 *
 * The Spring COMPLY API has no profile entity, so the BFF owns this for now.
 * Note that Spring itself runs on in-memory H2 (jdbc:h2:mem:complydb), so both
 * tiers are equally ephemeral - there is no persistence asymmetry to design
 * around. A profile absent from the store is SEEDED DETERMINISTICALLY from the
 * company id, so a restart regenerates exactly the same starting point and the
 * engine stays reproducible.
 */

const PURPOSES = ['MARKETING', 'ANALYTICS', 'SERVICE_DELIVERY', 'FINANCIAL_RECORDS', 'HR', 'SECURITY'];
const RESIDENCIES = ['US', 'DE', 'IE', 'SG', 'GB', 'BR'];
const BASES = ['CONSENT', 'CONTRACT', 'LEGITIMATE_INTEREST', 'LEGAL_OBLIGATION'];
const MECHANISMS = ['NONE', 'NONE', 'SCC', 'ADEQUACY'];
const RETENTIONS = [30, 90, 365, 730, 1825, 3650];

const CATEGORY_SETS: PiiElement[][] = [
    [{category: 'EMAIL', treatment: 'RAW'}, {category: 'NAME', treatment: 'RAW'}],
    [{category: 'EMAIL', treatment: 'PSEUDONYMIZED'}, {category: 'LOCATION', treatment: 'RAW'}],
    [{category: 'EMAIL', treatment: 'RAW'}, {category: 'HEALTH', treatment: 'RAW'}],
    [{category: 'NAME', treatment: 'RAW'}, {category: 'GOVERNMENT_ID', treatment: 'RAW'}, {category: 'FINANCIAL', treatment: 'ENCRYPTED'}],
    [{category: 'EMAIL', treatment: 'ENCRYPTED'}, {category: 'NAME', treatment: 'PSEUDONYMIZED'}],
    [{category: 'EMAIL', treatment: 'RAW'}, {category: 'NAME', treatment: 'RAW'}, {category: 'LOCATION', treatment: 'RAW'}]
];

const SUBPROCESSOR_SETS: string[][] = [
    [],
    ['Mailchimp'],
    ['AWS', 'Datadog'],
    ['AWS', 'Segment', 'Twilio']
];

function pick<T>(list: T[], companyId: number, salt: number): T {
    const index = Math.abs((companyId * 7919) + (salt * 104729)) % list.length;
    return list[index];
}

export function seedProfile(companyId: number): ProcessingProfile {

    const profile: ProcessingProfile = {
        companyId: companyId,
        retentionDays: pick(RETENTIONS, companyId, 1),
        dataResidency: pick(RESIDENCIES, companyId, 2),
        piiElements: pick(CATEGORY_SETS, companyId, 3).map(function (e) {
            return {category: e.category, treatment: e.treatment};
        }),
        transferMechanism: pick(MECHANISMS, companyId, 4) as any,
        lawfulBasis: pick(BASES, companyId, 5) as any,
        processingPurpose: pick(PURPOSES, companyId, 6) as any,
        subprocessors: pick(SUBPROCESSOR_SETS, companyId, 7).slice()
    };

    // Deliberately leave the optional facts unset on most seeded profiles, so
    // the LIKELY / POSSIBLE applicability levels are exercised rather than
    // every finding landing on CONFIRMED.
    if (companyId % 3 === 0) {
        profile.dataSubjectLocation = 'DE';
    }
    if (companyId % 4 === 0) {
        profile.dpaExecuted = true;
    }

    return profile;
}

const store: { [companyId: string]: ProcessingProfile } = {};

export function getProfile(companyId: number): ProcessingProfile {
    const key = String(companyId);
    if (!store[key]) {
        store[key] = seedProfile(companyId);
    }
    return store[key];
}

export function putProfile(companyId: number, profile: ProcessingProfile): ProcessingProfile {
    const merged: ProcessingProfile = {
        companyId: companyId,
        retentionDays: profile.retentionDays,
        dataResidency: profile.dataResidency,
        piiElements: profile.piiElements || [],
        transferMechanism: profile.transferMechanism,
        lawfulBasis: profile.lawfulBasis,
        processingPurpose: profile.processingPurpose,
        subprocessors: profile.subprocessors || [],
        dataSubjectLocation: profile.dataSubjectLocation,
        dpaExecuted: profile.dpaExecuted,
        legitimateInterestAssessment: profile.legitimateInterestAssessment
    };
    store[String(companyId)] = merged;
    return merged;
}

export function deleteProfile(companyId: number): void {
    delete store[String(companyId)];
}
