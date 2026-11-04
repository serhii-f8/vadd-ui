/**
 * Maps a JSON Pointer into the canonical form to the input as written (§13.2), so task 03
 * can validate the canonical form and still report input paths.
 */
export interface PathMap {
  toInput(canonicalPointer: string): string
}

/**
 * Records only rewrites, as absolute input pointers. An unrecorded pointer resolves
 * through its longest recorded prefix, so an unchanged subtree costs nothing (VD-025).
 */
export class PathMapBuilder {
  private readonly rewrites = new Map<string, string>()

  set(canonicalPointer: string, inputPointer: string): void {
    this.rewrites.set(canonicalPointer, inputPointer)
  }

  build(): PathMap {
    const { rewrites } = this
    return {
      toInput(canonicalPointer) {
        let prefix = canonicalPointer
        for (;;) {
          const input = rewrites.get(prefix)
          if (input !== undefined) return input + canonicalPointer.slice(prefix.length)
          if (prefix === '') return canonicalPointer
          prefix = prefix.slice(0, prefix.lastIndexOf('/'))
        }
      },
    }
  }
}
