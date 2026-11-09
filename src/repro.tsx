import React, { Suspense, useState } from 'react';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const load = () => wait(30).then(() => 'loaded');

/** Rendered inside <Suspense>. Each variant only differs in how `read` suspends. */
export const Content = ({ read }: { read: () => string }) => {
  const value = read();
  return (
    <div role="dialog" aria-label="repro-dialog">
      {value}
    </div>
  );
};

/** Clicking the button creates a promise and mounts <Content> under <Suspense>. */
export const Repro = ({ makeRead }: { makeRead: (p: Promise<string>) => () => string }) => {
  const [read, setRead] = useState<(() => string) | null>(null);
  return (
    <>
      <button onClick={() => setRead(() => makeRead(load()))}>open</button>
      {read !== null && (
        <Suspense fallback={null}>
          <Content read={read} />
        </Suspense>
      )}
    </>
  );
};

/** `React.use(promise)` */
export const useDirect = (p: Promise<string>) => () => React.use(p);

/** The promise is kept in an object and read with `use(entry.promise)`. */
export const useEntry = (p: Promise<string>) => {
  const entry = { promise: p };
  return () => React.use(entry.promise);
};

/** Suspends by throwing the promise instead of calling `use()` (React 18 style). */
export const throwPromise = (p: Promise<string>) => {
  let state: { status: 'pending' } | { status: 'done'; value: string } = { status: 'pending' };
  void p.then(value => {
    state = { status: 'done', value };
  });
  return () => {
    if (state.status === 'pending') {
      throw p;
    }
    return state.value;
  };
};

