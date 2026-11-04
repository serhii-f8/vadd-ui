export function bad(frame: HTMLIFrameElement, value: string) {
  frame.srcdoc = value
}
