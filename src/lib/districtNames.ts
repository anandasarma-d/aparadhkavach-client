/**
 * Display label for a district ROWID or API-provided name.
 * Prefer {@link HotspotRow.districtName} from the Gateway — do not hard-code ROWID maps
 * (D-072; breaks when DataStore ROWIDs change across Catalyst projects / states).
 */
export function districtLabel(
  districtId: string,
  districtName?: string | null,
): string {
  if (districtName && districtName.trim()) {
    return districtName.trim();
  }
  return districtId;
}
