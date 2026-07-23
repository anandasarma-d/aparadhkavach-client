/**
 * Curated demo roster for the search/select control.
 * Investigation Service has no accused list/search endpoint yet — only
 * `GET /v1/accusedPersons/{id}:riskProfile` — so filtering is client-side against
 * this seed slice. Typing a raw ACC-* id still calls the live endpoint.
 */
export type AccusedOption = {
  accusedId: string;
  name: string;
  districtHint: string;
};

export const DEMO_ACCUSED: AccusedOption[] = [
  { accusedId: "ACC-00044", name: "Imaran Master", districtHint: "Shivamogga" },
  { accusedId: "ACC-00124", name: "Nagaveni Kulkarni", districtHint: "Haveri" },
  { accusedId: "ACC-00006", name: "Gangamma Shetty", districtHint: "—" },
  { accusedId: "ACC-00031", name: "Raghavendra Naik", districtHint: "—" },
  { accusedId: "ACC-00037", name: "Fiyaz Suri", districtHint: "—" },
  { accusedId: "ACC-00040", name: "Praneel Andra", districtHint: "—" },
  { accusedId: "ACC-00043", name: "Yash Ganesh", districtHint: "—" },
  { accusedId: "ACC-00046", name: "Shivakumar Poojary", districtHint: "—" },
];

export function filterAccusedOptions(query: string): AccusedOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEMO_ACCUSED.slice(0, 6);
  return DEMO_ACCUSED.filter(
    (a) =>
      a.accusedId.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.districtHint.toLowerCase().includes(q),
  );
}
