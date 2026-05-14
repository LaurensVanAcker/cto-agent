import { DateTime } from 'luxon';
import { CompanyMembership } from '../models';

export const getLastViewedCompanyMembership = (
  memberships: CompanyMembership[]
): CompanyMembership => {
  if (memberships.length === 1) return memberships[0];

  return memberships.toSorted((a, b) => {
    if (a.lastViewedAt === b.lastViewedAt) return 0;
    if (!a.lastViewedAt) return 1;
    if (!b.lastViewedAt) return -1;

    return DateTime.fromISO(b.lastViewedAt).toMillis() - DateTime.fromISO(a.lastViewedAt).toMillis()
  })[0];
};
