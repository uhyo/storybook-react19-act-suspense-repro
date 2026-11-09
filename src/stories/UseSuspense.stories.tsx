import { act } from 'react';
import { configure, expect, getConfig, screen, userEvent } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Repro, ReproThrowPromise } from '../repro';

const meta = {
  title: 'repro/UseSuspense',
  component: Repro,
} satisfies Meta<typeof Repro>;
export default meta;

type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Reproduction: fails
// ---------------------------------------------------------------------------

/** FAILS: the Suspense boundary stays on its fallback and the dialog never appears. */
export const UserEventClick: Story = {
  play: async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'open' }));
    await expect(await screen.findByRole('dialog', { name: 'repro-dialog' })).toBeVisible();
  },
};

// ---------------------------------------------------------------------------
// Comparison: passes
// ---------------------------------------------------------------------------

/** PASSES: a raw DOM click (not through testing-library's `eventWrapper`). */
export const RawClick: Story = {
  play: async () => {
    (await screen.findByRole('button', { name: 'open' })).click();
    await expect(await screen.findByRole('dialog', { name: 'repro-dialog' })).toBeVisible();
  },
};

/** PASSES: `userEvent.click` with `eventWrapper` replaced by a pass-through (no `act()`). */
export const PassThroughEventWrapper: Story = {
  play: async () => {
    const original = getConfig().eventWrapper;
    configure({ eventWrapper: cb => cb() });
    try {
      await userEvent.click(await screen.findByRole('button', { name: 'open' }));
      await expect(await screen.findByRole('dialog', { name: 'repro-dialog' })).toBeVisible();
    } finally {
      // configure() is global, so restore the original to keep other stories unaffected
      configure({ eventWrapper: original });
    }
  },
};

/** PASSES: suspending by throwing a promise instead of calling `use()`. */
export const ThrowPromise: Story = {
  render: () => <ReproThrowPromise />,
  play: UserEventClick.play,
};

// ---------------------------------------------------------------------------
// Workaround: passes
// ---------------------------------------------------------------------------

/** PASSES: `userEvent.click` wrapped in an awaited `act()` (Storybook's default `eventWrapper` kept). */
export const AwaitedAct: Story = {
  play: async () => {
    const button = await screen.findByRole('button', { name: 'open' });
    await act(async () => {
      await userEvent.click(button);
    });
    await expect(await screen.findByRole('dialog', { name: 'repro-dialog' })).toBeVisible();
  },
};
