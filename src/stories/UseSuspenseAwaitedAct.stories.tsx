import React from 'react';
import { configure, expect, getConfig, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Repro, useDirect } from '../repro';

// Workarounds: await `act()` around the click instead of relying on the synchronous `eventWrapper`.

const meta = {
  title: 'repro/AwaitedAct',
  component: Repro,
  args: { makeRead: useDirect },
} satisfies Meta<typeof Repro>;
export default meta;

type Story = StoryObj<typeof meta>;

const findDialog = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'repro-dialog' });

const findOpenButton = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole('button', { name: 'open' });

/**
 * `eventWrapper` is a pass-through and the whole click is wrapped in one awaited `act()`.
 * This is the "await act" shape recommended by React for async work in tests.
 */
export const AwaitedActAroundClick: Story = {
  play: async ({ canvasElement }) => {
    const original = getConfig().eventWrapper;
    configure({ eventWrapper: cb => cb() });
    try {
      const button = await findOpenButton(canvasElement);
      await React.act(async () => {
        await userEvent.click(button);
      });
      await expect(await findDialog(canvasElement)).toBeVisible();
    } finally {
      configure({ eventWrapper: original });
    }
  },
};

/** Same, but keeps Storybook's own synchronous `eventWrapper` and only awaits `act()` outside. */
export const AwaitedActAroundClickDefaultWrapper: Story = {
  play: async ({ canvasElement }) => {
    const button = await findOpenButton(canvasElement);
    await React.act(async () => {
      await userEvent.click(button);
    });
    await expect(await findDialog(canvasElement)).toBeVisible();
  },
};
