/**
 * Curated demo FIRs for the Similar Cases search control. There is no FIR
 * list/search endpoint — typing any FIR-* id still calls the live similarCases
 * endpoint. These seeds were probed against Supabase (25 Jul): each returns a
 * tight cluster of the same crime type spread across ~5 districts, which is the
 * honest "same MO surfacing across districts" story (not gang detection).
 */
export type FirOption = {
  firId: string;
  crimeHint: string;
  districtHint: string;
};

export const DEMO_FIRS: FirOption[] = [
  { firId: "FIR-002683", crimeHint: "Vehicle theft / snatching", districtHint: "Mandya" },
  { firId: "FIR-003276", crimeHint: "Cybercrime", districtHint: "Tumakuru" },
  { firId: "FIR-002729", crimeHint: "Domestic violence / 498A", districtHint: "Mysuru" },
  { firId: "FIR-001676", crimeHint: "Burglary / housebreaking", districtHint: "Davanagere" },
  { firId: "FIR-001018", crimeHint: "Assault / hurt", districtHint: "—" },
];
