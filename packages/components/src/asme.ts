// ASME dimensions used by the catalog (ADR-0014), metres. Values as published in common ASME
// B36.10M (pipe) and B16.9 (butt-welding fittings) tables. They must be verified against the
// standard before the SDK is relied on for engineering; the SDK is not a certified design tool.

export interface AsmeSize {
  /** Nominal pipe size, inches. */
  nps: string;
  /** B36.10M outside diameter. */
  outsideDiameter: number;
  /** B36.10M standard (Sch 40) wall thickness. */
  wallSch40: number;
  /** B16.9 long-radius 90° elbow, centre to end (A = 1.5 × NPS). */
  elbowLR90: number;
  /** B16.9 equal tee, centre to end of run and of outlet (C = M). */
  teeCenterToEnd: number;
  /** B16.9 concentric reducer end-to-end length (H), by the larger end. */
  reducerLength: number;
}

export const asme = {
  DN50: { nps: '2', outsideDiameter: 0.0603, wallSch40: 0.00391, elbowLR90: 0.076, teeCenterToEnd: 0.064, reducerLength: 0.076 },
  DN80: { nps: '3', outsideDiameter: 0.0889, wallSch40: 0.00549, elbowLR90: 0.114, teeCenterToEnd: 0.086, reducerLength: 0.089 },
  DN100: { nps: '4', outsideDiameter: 0.1143, wallSch40: 0.00602, elbowLR90: 0.152, teeCenterToEnd: 0.105, reducerLength: 0.102 },
  DN150: { nps: '6', outsideDiameter: 0.1683, wallSch40: 0.00711, elbowLR90: 0.229, teeCenterToEnd: 0.143, reducerLength: 0.14 },
  DN200: { nps: '8', outsideDiameter: 0.2191, wallSch40: 0.00818, elbowLR90: 0.305, teeCenterToEnd: 0.178, reducerLength: 0.152 },
} as const satisfies Record<string, AsmeSize>;
