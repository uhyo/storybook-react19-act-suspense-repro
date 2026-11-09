import React, { Suspense, useState } from 'react';
import { configure, expect, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const load = () => wait(30).then(() => 'loaded');

/** Rendered inside <Suspense>. Each variant only differs in how `read` suspends. */
const Content = ({ read }: { read: () => string }) => {
  const value = read();
  return (
    <div role="dialog" aria-label="repro-dialog">
      {value}
    </div>
  );
};

/** Clicking the button creates a promise and mounts <Content> under <Suspense>. */
const Repro = ({ makeRead }: { makeRead: (p: Promise<string>) => () => string }) => {
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
const useDirect = (p: Promise<string>) => () => React.use(p);

/** The promise is kept in an object and read with `use(entry.promise)`. */
const useEntry = (p: Promise<string>) => {
  const entry = { promise: p };
  return () => React.use(entry.promise);
};

/** Suspends by throwing the promise instead of calling `use()` (React 18 style). */
const throwPromise = (p: Promise<string>) => {
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

const meta = {
  title: 'repro/UseSuspense',
  component: Repro,
} satisfies Meta<typeof Repro>;
export default meta;

type Story = StoryObj<typeof meta>;

const findDialog = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'repro-dialog' });

/** EXPECTED TO FAIL: the Suspense boundary stays on its fallback and the dialog is never found. */
export const UseUserEventClick: Story = {
  args: { makeRead: useDirect },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'open' }));
    await expect(await findDialog(canvasElement)).toBeVisible();
  },
};

/** EXPECTED TO FAIL: same as above, with the promise read via `use(entry.promise)`. */
export const UseEntryUserEventClick: Story = {
  args: { makeRead: useEntry },
  play: UseUserEventClick.play,
};

/** Passes: a raw DOM click does not go through testing-library's `eventWrapper`. */
export const UseRawClick: Story = {
  args: { makeRead: useDirect },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    (await canvas.findByRole('button', { name: 'open' })).click();
    await expect(await findDialog(canvasElement)).toBeVisible();
  },
};

/** Passes: `eventWrapper` is replaced with a pass-through, so no `act()` wraps the click. */
export const UsePassThroughEventWrapper: Story = {
  args: { makeRead: useDirect },
  play: async ({ canvasElement }) => {
    configure({ eventWrapper: cb => cb() });
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'open' }));
    await expect(await findDialog(canvasElement)).toBeVisible();
  },
};

/** Passes: suspending by throwing the promise works even through `eventWrapper`. */
export const ThrowPromiseUserEventClick: Story = {
  args: { makeRead: throwPromise },
  play: UseUserEventClick.play,
};
