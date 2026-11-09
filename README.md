# `userEvent.click` in a play function leaves a `use()` Suspense boundary stuck on its fallback (React 19 + Storybook)

Minimal reproduction for the following problem.

On React 19, clicking a button with `userEvent.click` inside a story's `play` function, where the click mounts a component that suspends through `React.use(promise)`, leaves the `<Suspense>` boundary on its fallback forever. The promise resolves, but the boundary never retries.

The same story passes when:

- the click is a raw DOM `element.click()` (no testing-library event wrapper), or
- testing-library's `eventWrapper` is replaced with a pass-through (`cb => cb()`), or
- the component suspends by throwing the promise instead of calling `use()`.

During a failing run, React logs `A component suspended inside an act scope, but the act call was not awaited.` It appears in the browser console (Storybook UI) and in the `stderr` block of the `npm test` output. In `npm test` it is near the top, followed by a long DOM snapshot from the failed `findByRole` assertion, so it is easy to miss.

## Versions

| Package | Version |
|---|---|
| react / react-dom | 19.3.1 |
| storybook / @storybook/react-vite / @storybook/addon-vitest | 10.6.6 |
| vitest / @vitest/browser / @vitest/browser-playwright | 5.1.0 |
| @testing-library/dom | 10.4.2 |
| @testing-library/user-event | 14.6.8 |
| vite | 8.3.6 |
| Node | 24 |

All versions are pinned exactly in `package.json`.

## Reproduce

```bash
npm install
npx playwright install chromium   # first time only

npm test                          # run every story once through the Storybook Vitest addon
npm run test:repeat               # run every story 30 times (--repeats 29)
npm run storybook                 # or open the stories in the Storybook UI
```

## Stories

The component and the three ways of suspending are in `src/repro.tsx`. The reproduction stories are in `src/stories/UseSuspense.stories.tsx`. The component is a button that, when clicked, mounts a component under `<Suspense fallback={null}>`. That component suspends for 30 ms and then renders `role="dialog"`. Each `play` function clicks the button and waits for the dialog.

| Story | What it does | Result with `npm run test:repeat` (30 runs) |
|---|---|---|
| `UseUserEventClick` | `use(promise)` + `userEvent.click` | **0 / 30 pass** |
| `UseEntryUserEventClick` | `use(entry.promise)` + `userEvent.click` | **0 / 30 pass** |
| `UseRawClick` | `use(promise)` + raw DOM `button.click()` | 30 / 30 pass |
| `UsePassThroughEventWrapper` | `use(promise)` + `userEvent.click` after `configure({ eventWrapper: cb => cb() })` | 30 / 30 pass |
| `ThrowPromiseUserEventClick` | `throw promise` instead of `use()` + `userEvent.click` | 30 / 30 pass |

The first two failing stories are the reproduction. They fail with `Unable to find role="dialog" and name "repro-dialog"`.

Workarounds that await `act()` (`src/stories/UseSuspenseAwaitedAct.stories.tsx`):

| Story | What it does | Result (30 runs) |
|---|---|---|
| `AwaitedActAroundClick` | `eventWrapper` set to a pass-through, and the whole `userEvent.click` wrapped in `await React.act(async () => { ... })` | 30 / 30 pass |
| `AwaitedActAroundClickDefaultWrapper` | Storybook's own synchronous `eventWrapper` kept, and the `userEvent.click` wrapped in `await React.act(async () => { ... })` | 30 / 30 pass, and the `act` warning is gone |

Note that `eventWrapper` itself cannot be made to await: testing-library and user-event call it synchronously and use its return value directly. Starting an async `act()` inside it and discarding the promise opens overlapping `act()` scopes (`You seem to have overlapping act() calls`) and breaks the stories that run afterwards on the same page (in one full run it also made the test run hang), so that variant is not included.

## Suspected cause

`@storybook/react` configures testing-library with a synchronous `act` wrapper:

```js
eventWrapper: (cb) => {
  let result;
  act(() => (result = cb(), result));
  return result;
}
```

`userEvent.click` goes through that wrapper. The click handler sets state, the new component calls `use()` and suspends, and this happens inside a synchronous `act()` whose callback does not return a thenable, which is the situation React warns about. The retry appears not to be flushed afterwards, so the boundary stays on its fallback.

This has not been confirmed. It is also unclear whether it should be fixed in Storybook (for example by awaiting `act` in `eventWrapper`), in React, or documented as expected behavior of synchronous `act`.

## Not tested

- `fireEvent` and other testing-library event helpers.
- React versions other than 19.3.1, and Storybook versions other than 10.6.6.
