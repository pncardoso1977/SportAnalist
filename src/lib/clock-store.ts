let currentSnapshot = 0;
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  currentSnapshot = Date.now();
  subscribers.forEach((subscriber) => subscriber());
}

export function subscribeToClock(subscriber: () => void) {
  subscribers.add(subscriber);
  if (timer === null) {
    currentSnapshot = Date.now();
    timer = setInterval(tick, 1000);
  }

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function getClockSnapshot() {
  return currentSnapshot;
}

export function getServerClockSnapshot() {
  return 0;
}
