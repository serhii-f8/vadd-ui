/** §13.4. VD-032 says how each one counts. */
export const LIMITS = {
  inputBytes: 262_144,
  depth: 12,
  nodes: 400,
  tableRows: 5_000,
  tableColumns: 30,
  chartPoints: 10_000,
  chartSeries: 12,
  longString: 20_000,
  string: 2_000,
  flowNodes: 40,
} as const
