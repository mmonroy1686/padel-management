// The screens this tab went through inside the app, so "Volver" knows where back leads (and hides on the first one).
// Going to the screen before the last one counts as going back: it leaves the stack instead of growing it.
export const MAX_HISTORY = 50

export function nextHistory(stack: string[], path: string): string[] {
  if (stack.at(-1) === path) return stack
  if (stack.at(-2) === path) return stack.slice(0, -1)
  return [...stack, path].slice(-MAX_HISTORY)
}

export function canGoBack(stack: string[]): boolean {
  return stack.length > 1
}

// What sessionStorage gave back, or nothing if it is not a list of paths.
export function readHistory(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}
