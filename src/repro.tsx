import { Suspense, use, useState } from 'react';

// A promise that resolves after 30 ms
const load = () => new Promise<string>(resolve => setTimeout(() => resolve('loaded'), 30));

/** Clicking the button creates a promise and mounts a component that suspends with `use(promise)`. */
export const Repro = () => {
  const [promise, setPromise] = useState<Promise<string> | null>(null);
  return (
    <>
      <button onClick={() => setPromise(load())}>open</button>
      {promise && (
        <Suspense fallback={null}>
          <Dialog promise={promise} />
        </Suspense>
      )}
    </>
  );
};

const Dialog = ({ promise }: { promise: Promise<string> }) => {
  const value = use(promise);
  return (
    <div role="dialog" aria-label="repro-dialog">
      {value}
    </div>
  );
};

/** For comparison: suspends by throwing the promise instead of calling `use()` (React 18 style). */
export const ReproThrowPromise = () => {
  const [read, setRead] = useState<(() => string) | null>(null);
  const open = () => {
    let value: string | undefined;
    const promise = load().then(v => {
      value = v;
    });
    setRead(() => () => {
      if (value === undefined) throw promise;
      return value;
    });
  };
  return (
    <>
      <button onClick={open}>open</button>
      {read && (
        <Suspense fallback={null}>
          <ThrowDialog read={read} />
        </Suspense>
      )}
    </>
  );
};

const ThrowDialog = ({ read }: { read: () => string }) => (
  <div role="dialog" aria-label="repro-dialog">
    {read()}
  </div>
);
