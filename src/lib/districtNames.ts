/** Catalyst districts.ROWID → Karnataka district name (from FIR police_station prefixes). */
export const DISTRICT_NAMES: Record<string, string> = {
  "42963000000035012": "Bagalkot",
  "42963000000035013": "Ballari",
  "42963000000035014": "Belagavi",
  "42963000000035015": "Bengaluru Rural",
  "42963000000035016": "Bengaluru Urban",
  "42963000000035017": "Bidar",
  "42963000000035018": "Chamarajanagar",
  "42963000000035019": "Chikballapur",
  "42963000000035020": "Chikkamagaluru",
  "42963000000035021": "Chitradurga",
  "42963000000035022": "Dakshina Kannada",
  "42963000000035023": "Davanagere",
  "42963000000035024": "Dharwad",
  "42963000000035025": "Gadag",
  "42963000000035026": "Hassan",
  "42963000000035027": "Haveri",
  "42963000000035028": "Kalaburagi",
  "42963000000035029": "Kodagu",
  "42963000000035030": "Kolar",
  "42963000000035031": "Koppal",
  "42963000000035032": "Mandya",
  "42963000000035033": "Mysuru",
  "42963000000035034": "Raichur",
  "42963000000035035": "Ramanagara",
  "42963000000035036": "Shivamogga",
  "42963000000035037": "Tumakuru",
  "42963000000035038": "Udupi",
  "42963000000035039": "Uttara Kannada",
  "42963000000035042": "Vijayanagara",
  "42963000000035040": "Vijayapura",
  "42963000000035041": "Yadgir",
};

export function districtDisplayName(districtId: string): string {
  return DISTRICT_NAMES[districtId] ?? districtId;
}
