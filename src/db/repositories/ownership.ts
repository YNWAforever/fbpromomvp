/**
 * Keep repository writes scoped to one venue. Database composite foreign keys
 * enforce the same rule after this guard, but this gives callers a clear error.
 */
export function assertSameVenue(record: string, expectedVenueId: string, actualVenueId: string): void {
  if (expectedVenueId !== actualVenueId) {
    throw new Error(`${record} must belong to venue ${expectedVenueId}`);
  }
}