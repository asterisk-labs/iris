/**
 * The "next" steps taken in this tab, so that "previous" goes back to the
 * image the user came from. With prioritise_unmarked_images, "next" can jump
 * over images, so the neighbour in the list is not always that image.
 */

const KEY = 'iris-image-trail';
const MAX_STEPS = 200;

interface Step { from: string; to: string }

function read(): Step[] {
  try {
    const steps = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(steps) ? steps : [];
  } catch {
    return [];
  }
}

function write(steps: Step[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(steps.slice(-MAX_STEPS)));
  } catch {
    // No session storage: "previous" falls back to the list order
  }
}

export function recordStep(from: string, to: string): void {
  write([...read(), { from, to }]);
}

/**
 * Remove and return the image the user came to `current` from, or null.
 * Steps that did not end here (a cancelled prompt, an image picked from the
 * list) are dropped on the way.
 */
export function stepBack(current: string): string | null {
  const steps = read();
  let step = steps.pop();
  while (step && step.to !== current) step = steps.pop();
  write(steps);
  return step ? step.from : null;
}
