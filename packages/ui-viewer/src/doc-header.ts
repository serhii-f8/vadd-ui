/**
 * §4.1 (`GET /api/docs`). `id` is the file stem and everything else comes from VD-112.
 * Imports nothing, so the Node server and the browser app compile the same type.
 */
export interface DocHeader {
  seq: number
  id: string
  title: string | null
  createdAt: string
  cwd: string | null
  branch: string | null
}
