/** A named zone can opt out of regional rule overrides. This also works with updated runtime tz data. */
export type FamilyZone = string | { zone: string; override: false };
export const PACIFIC_ZONE = "America/Vancouver";

// Boundaries and community rules, audited 2026-11-01. Postal routes are not time-zone boundaries.
const TZ = "https://raw.githubusercontent.com/eggert/tz/main/northamerica";
const FSA = "https://canadapost-postescanada.ca/cpc/doc/en/support/kb/nps/NONLETTERMAIL_FSA_LIST_JULY_2026.pdf";
const AIR = "https://origin-www.canadapost.ca/cpc/en/support/articles/air-stage-offices/find-an-air-stage-office.page";
const ONTARIO = "https://www.ontario.ca/laws/regulation/r26333";
const BC_POSTAL = "https://www2.gov.bc.ca/assets/gov/public-safety-and-emergency-services/public-safety/fire-safety/fire_dept_listing.pdf";
const ON_MAP = "https://www.ontario.ca/files/2022-03/mto-orm-map17-2022-03-16.pdf";
const BC = "https://www2.gov.bc.ca/gov/content/governments/celebrating-british-columbia/daylight-saving-time";

export const PROVINCE_ZONES: Record<string, string> = {
  NL: "America/St_Johns", NS: "America/Halifax", PE: "America/Halifax", NB: "America/Moncton",
  QC: "America/Toronto", ON: "America/Toronto", MB: "America/Winnipeg", SK: "America/Regina",
  AB: "America/Edmonton", BC: PACIFIC_ZONE, NT: "America/Yellowknife", NU: "America/Iqaluit", YT: "America/Whitehorse",
};
const PROVINCE_BY_PREFIX: Record<string, string> = {
  A: "NL", B: "NS", C: "PE", E: "NB", G: "QC", H: "QC", J: "QC", K: "ON", L: "ON", M: "ON", N: "ON", P: "ON",
  R: "MB", S: "SK", T: "AB", V: "BC", X: "NT", Y: "YT",
};
// Winnipeg now has year-round UTC-5. The Ontario regulation covers only west of 90 W.
// Chicago retains seasonal Central time when a newer runtime changes Winnipeg to permanent UTC-5.
const SEASONAL_CENTRAL = { zone: "America/Chicago", override: false } as const;

type Rule = { zone: FamilyZone; sources: readonly string[] };
const rule = (zone: FamilyZone, ...sources: string[]): Rule => ({ zone, sources: [TZ, FSA, ...sources] });
/** FSA exceptions to the province/territory default. No partial rural-delivery-prefix matching. */
export const FSA_ZONES: Record<string, Rule> = {
  A0P: rule("America/Goose_Bay"), A0R: rule("America/Goose_Bay"), A2V: rule("America/Goose_Bay"),
  G4T: rule("America/Halifax"),
  P0V: rule("America/Winnipeg", ONTARIO), P0W: rule("America/Winnipeg", ONTARIO),
  P0X: rule("America/Winnipeg", ONTARIO), P0Y: rule("America/Winnipeg", ONTARIO),
  P8N: rule("America/Winnipeg", ONTARIO), P8T: rule("America/Winnipeg", ONTARIO),
  P9A: rule("America/Winnipeg", ONTARIO), P9N: rule("America/Winnipeg", ONTARIO),
  S9V: rule("America/Edmonton"), // Lloydminster follows Alberta, including the Saskatchewan side.
  V0A: rule("America/Edmonton", "https://www.golden.ca/town-hall/news-notices/no-time-change-weekend-golden"),
  V0B: rule("America/Edmonton", "https://engage.rdek.bc.ca/timechange"),
  V1A: rule("America/Edmonton", "https://engage.rdek.bc.ca/timechange"),
  V1C: rule("America/Edmonton", "https://engage.rdek.bc.ca/timechange"),
  V0C: rule("America/Dawson_Creek", BC, BC_POSTAL), // Most residents are in the Peace region.
  V1G: rule("America/Dawson_Creek", BC), V1J: rule("America/Dawson_Creek", BC),
  X0A: rule("America/Iqaluit", AIR), X0B: rule("America/Cambridge_Bay", AIR),
  X0C: rule("America/Rankin_Inlet", AIR), X0E: rule("America/Inuvik", AIR),
};

/** Each full-code exception has a community/postal source, in addition to the tz boundary source. */
export const POSTAL_ZONES: Record<string, Rule> = {};
function postalRule(zone: FamilyZone, codes: string, ...sources: string[]) {
  for (const code of codes.split(" ")) POSTAL_ZONES[code] = rule(zone, ...sources);
}
postalRule("America/Resolute", "X0A0V0 X0A0A2", AIR); // Resolute
postalRule("Etc/GMT+6", "X0A0G0", AIR); // Eureka: Central without DST (tz northamerica commentary).
postalRule("America/Atikokan", "X0C0C0 X0C0A2", AIR); // Coral Harbour: UTC-5 all year
postalRule("America/Goose_Bay", "A0K1N0 A0K0B5", AIR); // Black Tickle
postalRule("America/Goose_Bay", "A0K1V0", "https://www.gov.nl.ca/fal/department/contact-forestry/"); // Cartwright
postalRule("America/Halifax", "G0C2R0", "https://listuguj.ca/lmg-directory/"); // Listuguj
postalRule("America/Blanc-Sablon", "G0G1C0 G0G1E0 G0G1G0 G0G1M0 G0G1N0 G0G1S0 G0G1T0 G0G1W0 G0G1Z0 G0G2C0 G0G2G0 G0G2P0 G0G2R0 G0G2W0 G0G0B5 G0G0C7 G0G0A6 G0G0B3 G0G0A2 G0G0A3 G0G0C8", AIR);
postalRule("America/Atikokan", "P0T1C0", "https://atikokan.ca/");
postalRule("America/Atikokan", "P0V3A0", "https://picklelake.ca/service-directory/");
postalRule("America/Atikokan", "P0V2H0", "https://www.mishkeegogamang.ca/");
postalRule("America/Winnipeg", "P0T1T0", "https://www.ignace.ca/");
// Big Trout Lake and its eastern neighbours remain seasonal Central. No local permanent-time decision is known.
postalRule(SEASONAL_CENTRAL, "P0V1G0 P0V1B0 P0V0C2 P0V1Y0 P0V0A1 P0V1Z0 P0V2Z0 P0V0C4", AIR, ON_MAP);
postalRule("America/Toronto", "P0V1W0 P0V0B8", AIR); // Fort Severn
// Creighton and Denare Beach follow Manitoba. Other S0P communities use Saskatchewan's UTC-6.
postalRule("America/Winnipeg", "S0P0A0", "https://www.townofcreighton.ca/");
postalRule("America/Winnipeg", "S0P0B0", "https://denarebeach.net/");
// Battle River time-option communities follow Alberta. Most S0M residents use Saskatchewan time.
postalRule("America/Edmonton", "S0M1H0 S0M1M0 S0M1R0 S0M1P0 S0M2C0", "https://www.saskatchewan.ca/government/municipal-administration/municipal-directory", "https://www.saskatchewan.ca/government/municipal-administration/tools-guides-and-resources/saskatchewan-time-system"); // Lashburn, Maidstone, Marshall, Marsden, Neilburg
postalRule("America/Dawson_Creek", "V0C1H0 V0C1J0 V0C1V0 V0C1X0 V0C2C0 V0C2K0 V0C2L0 V0C2W0", BC, BC_POSTAL);
postalRule("America/Fort_Nelson", "V0C1R0", BC, BC_POSTAL);
postalRule(PACIFIC_ZONE, "V0C1L0", BC_POSTAL); // Dease Lake, outside the Peace region
postalRule(PACIFIC_ZONE, "V0B1E0 V0B1S0 V0B1X0 V0B2B0", "https://www.rdck.ca/"); // Kootenay Lake east shore
postalRule("America/Creston", "V0B1A0 V0B1C0 V0B1G0 V0B1G2 V0B1G3 V0B1G4 V0B1G5 V0B1G6 V0B1G7 V0B1G8 V0B1K0 V0B1W0 V0B2C0 V0B2N0 V0B2P0", "https://www.creston.ca/", BC_POSTAL);
postalRule("America/Creston", "V0B1G1 V0B1G9", "https://rdck.ca/wp-content/uploads/2026/03/PRJ25030-2_ITT_ERK-Meter-Pits-ITT2_rev1.pdf");

/** The chosen rule serves most residents. Full-code exceptions above override it when sources identify the place.
 * These FSAs still cannot locate every address. Keep this list visible in the PR and audit record. */
export const KNOWN_AMBIGUOUS_FSAS = {
  A0K: { zone: "America/St_Johns", reason: "Northwest Newfoundland and southeast Labrador; Cartwright and Black Tickle use Atlantic.", sources: [TZ, FSA, AIR] },
  G0C: { zone: "America/Toronto", reason: "Gaspé south coast; Listuguj uses seasonal Atlantic.", sources: [TZ, FSA, "https://listuguj.ca/lmg-directory/"] },
  G0G: { zone: "America/Toronto", reason: "Most residents are west of 63 W; the lower north shore uses Atlantic without DST.", sources: [TZ, FSA, AIR] },
  P0T: { zone: "America/Toronto", reason: "Thunder Bay district; Ignace uses Central and Atikokan keeps UTC-5. Upsala keeps Eastern.", sources: [TZ, FSA, ONTARIO] },
  P0V: { zone: "America/Winnipeg", reason: "Most residents are west of 90 W; eastern Central communities remain seasonal, Fort Severn uses Eastern, Pickle Lake and Mishkeegogamang keep UTC-5.", sources: [TZ, FSA, ONTARIO, AIR] },
  S0M: { zone: "America/Regina", reason: "Most residents keep UTC-6; the Lloydminster border area followed Alberta before 2026 and now shares UTC-6.", sources: [TZ, FSA] },
  S0P: { zone: "America/Regina", reason: "Most residents keep UTC-6; Creighton and Denare Beach follow Manitoba.", sources: [TZ, FSA] },
  V0B: { zone: "America/Edmonton", reason: "Most residents follow East Kootenay; Creston keeps UTC-7 and the Kootenay Lake east shore follows Pacific.", sources: [TZ, FSA, BC] },
  V0C: { zone: "America/Dawson_Creek", reason: "Most residents are in the Peace region and keep UTC-7. Dease Lake follows Pacific; Fort Nelson has distinct history.", sources: [TZ, FSA, BC, BC_POSTAL] },
  X0A: { zone: "America/Iqaluit", reason: "Most residents use Eastern; Resolute uses seasonal Central; Eureka keeps UTC-6.", sources: [TZ, FSA, AIR] },
  X0C: { zone: "America/Rankin_Inlet", reason: "Most residents use seasonal Central; Coral Harbour keeps UTC-5.", sources: [TZ, FSA, AIR] },
} as const;

/** Postal code -> zone and override scope. Missing and malformed codes use BC time. */
export function zoneFor(postal: string | null): FamilyZone {
  const code = (postal ?? "").replace(/\s/g, "").toUpperCase();
  if (!/^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTVWXYZ][0-9][ABCEGHJ-NPRSTVWXYZ][0-9]$/.test(code)) return PACIFIC_ZONE;
  const fsa = code.slice(0, 3);
  return POSTAL_ZONES[code]?.zone ?? FSA_ZONES[fsa]?.zone ?? PROVINCE_ZONES[PROVINCE_BY_PREFIX[code[0]]] ?? PACIFIC_ZONE;
}
