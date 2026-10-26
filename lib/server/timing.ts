import 'server-only';

/**
 * Times the steps of one request and reports them in a `Server-Timing` header
 * (visible in the browser's network tab and read by `npm run bench`).
 * Durations only: no ids, briefs or other request data.
 */
export class Timing {
  private readonly marks: [name: string, ms: number][] = [];
  private last = performance.now();

  /** Records the time since the previous mark (or since creation) under `name`. */
  mark(name: string): void {
    const now = performance.now();
    this.marks.push([name, now - this.last]);
    this.last = now;
  }

  header(): string {
    return this.marks.map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(', ');
  }
}
