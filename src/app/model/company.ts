

/**
 * Mirrors CompanyDTO from the COMPLY API OpenAPI contract:
 *
 *   record CompanyDTO(Long id, String name, String email)
 *
 * There is no `type` field. An earlier version of this file declared one and
 * the home page filtered on it, which is why both lists rendered empty.
 */
export interface Company {
    id?: number;
    name: string;
    email: string;
}
