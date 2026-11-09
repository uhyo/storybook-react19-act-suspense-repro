import { configure, expect, getConfig, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Repro, throwPromise, useDirect, useEntry } from '../repro';

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

type EventWrapper = ReturnType<typeof getConfig>['eventWrapper'];

/**
 * Runs `fn` with testing-library's `eventWrapper` temporarily replaced.
 * `configure()` is global and the stories share one page, so the original wrapper
 * is restored afterwards to keep the other stories unaffected.
 */
const withEventWrapper = async (eventWrapper: EventWrapper, fn: () => Promise<void>) => {
  const original = getConfig().eventWrapper;
  configure({ eventWrapper });
  try {
    await fn();
  } finally {
    configure({ eventWrapper: original });
  }
};

const clickOpenAndExpectDialog = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'open' }));
  await expect(await findDialog(canvasElement)).toBeVisible();
};

/** Passes: `eventWrapper` is replaced with a pass-through, so no `act()` wraps the click. */
export const UsePassThroughEventWrapper: Story = {
  args: { makeRead: useDirect },
  play: ({ canvasElement }) =>
    withEventWrapper(cb => cb(), () => clickOpenAndExpectDialog(canvasElement)),
};

/** Passes: suspending by throwing the promise works even through `eventWrapper`. */
export const ThrowPromiseUserEventClick: Story = {
  args: { makeRead: throwPromise },
  play: UseUserEventClick.play,
};
