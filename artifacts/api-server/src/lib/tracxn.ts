/**
 * Tracxn integration stub.
 *
 * Reads TRACXN_API_KEY from env. Returns null when the key is absent so
 * callers can render a "not connected" notice. When the key is present the
 * adapter is a TODO — throw with a clear message so it is never silently
 * skipped once someone adds the key.
 *
 * To wire up later: set TRACXN_API_KEY and implement the body of
 * getTracxnData below. No structural changes elsewhere are needed.
 */

export interface TracxnData {
  fundingTotal?: string;
  lastRoundType?: string;
  lastRoundDate?: string;
  investors?: string[];
  headcount?: string;
  hq?: string;
  founded?: string;
  description?: string;
}

const TRACXN_API_KEY = process.env["TRACXN_API_KEY"];

/**
 * Fetch Tracxn data for the named company.
 * Returns null when TRACXN_API_KEY is not set (caller renders "not connected").
 * Throws when the key is present but the adapter is not yet implemented.
 */
export async function getTracxnData(_companyName: string): Promise<TracxnData | null> {
  if (!TRACXN_API_KEY) {
    return null;
  }

  // TODO: implement Tracxn adapter once subscription is active.
  // The key is present but the adapter body has not been built yet.
  throw new Error("Tracxn adapter not yet implemented — add implementation here once subscription is active.");
}
