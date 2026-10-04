// A number that changes every frame (the rocket's live altitude), fanned out to DOM readouts
// without React re-renders.
type Listener = (v: number) => void;

export class LiveValue {
  value: number;
  private listeners = new Set<Listener>();

  constructor(value = 0) {
    this.value = value;
  }

  set(v: number) {
    if (Math.abs(v - this.value) < 0.01) return;
    this.value = v;
    for (const l of this.listeners) l(v);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.value);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
