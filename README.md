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

Everything is in two files:

- `src/repro.tsx`: the component. It is a button that, when clicked, mounts a component under `<Suspense fallback={null}>`. That component suspends with `use(promise)` for 30 ms and then renders `role="dialog"`.
- `src/stories/UseSuspense.stories.tsx`: the stories. Each `play` function clicks the button and waits for the dialog.

| Story | What it does | Result with `npm run test:repeat` (30 runs) |
|---|---|---|
| `UserEventClick` | `userEvent.click` | **0 / 30 pass** (the reproduction) |
| `RawClick` | raw DOM `button.click()` | 30 / 30 pass |
| `PassThroughEventWrapper` | `userEvent.click` after `configure({ eventWrapper: cb => cb() })` | 30 / 30 pass |
| `ThrowPromise` | `userEvent.click`, but the component throws the promise instead of calling `use()` | 30 / 30 pass |
| `AwaitedAct` (workaround) | `userEvent.click` wrapped in `await act(async () => { ... })` | 30 / 30 pass, and the `act` warning is gone |

`UserEventClick` fails with `Unable to find role="dialog" and name "repro-dialog"`.

Note that `eventWrapper` itself cannot be made to await: testing-library and user-event call it synchronously and use its return value directly. Starting an async `act()` inside it and discarding the promise opens overlapping `act()` scopes (`You seem to have overlapping act() calls`) and breaks the stories that run afterwards on the same page.

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

See the appendix below for a closer look at the React side. It is still unclear whether it should be fixed in Storybook (for example by awaiting `act` in `eventWrapper`), in React, or documented as expected behavior of synchronous `act`.

## Not tested

- `fireEvent` and other testing-library event helpers.
- React versions other than 19.3.1, and Storybook versions other than 10.6.6.

## Appendix: investigation of the React side

I suspect the root cause is in React rather than in Storybook. Storybook's synchronous `act` wrapper triggers it, but React leaves the root in a state that no later update can recover from on its own. The notes below come from reading the React 19.3.1 development builds in `node_modules` and from temporarily adding `console.log` calls to them while running `npx vitest run`.

### What happens, step by step

1. `userEvent.click` runs inside Storybook's synchronous `act(() => cb())`, so `ReactSharedInternals.actQueue` is a non-null array.
2. The click's state update schedules the root. In `scheduleTaskForRootDuringMicrotask` (`react-dom-client.development.js`), because `actQueue !== null`, the render task is pushed into `actQueue` and not into the Scheduler. `root.callbackNode` is set to `fakeActCallbackNode` (a placeholder `{}`).
3. When the synchronous `act` returns, it calls `flushActQueue(queue)` (`react.development.js`). The render reaches `use(promise)`, and `trackUsedThenable` sets `ReactSharedInternals.didUsePromise = true` because an act queue is open.
4. `flushActQueue` sees `didUsePromise` and **bails out**, leaving the rest of the work in the queue (`react.development.js:666`). It expects an awaited `act` to keep flushing it later.
5. The `act` call was not awaited, so React logs `A component suspended inside an act scope, but the act call was not awaited` and sets `actQueue = null` (`react.development.js:970`). **The work left in the queue is dropped**, but `root.callbackNode` still points to `fakeActCallbackNode`.
6. When the promise resolves, the ping handler (`react-dom-client.development.js:19067`) calls `ensureRootIsScheduled(root)`. `scheduleTaskForRootDuringMicrotask` finds that the new priority equals `root.callbackPriority` and that `callbackNode` is set, and **returns early** (`react-dom-client.development.js:20613`). It treats the stale fake node as an already scheduled task, so nothing is scheduled.
7. Every later retry or ping hits the same early return, so the Suspense boundary stays on its fallback forever.

The early-return condition does handle a real Scheduler task left over while an act queue is open (`actQueue !== null && callbackNode !== fakeActCallbackNode`). The reverse case, a fake act node left over after the act queue is gone, is not handled.

### Instrumented run

Log output from `UserEventClick` with `console.log` added at the relevant points (`[DBG]` lines are mine):

```
[DBG] root task pushed to actQueue, lanes=3 prio=32
[DBG] root task pushed to actQueue, lanes=3 prio=4194304
[DBG] flushActQueue bailed out on use(); remaining=2
[DBG] sync act exits, discarding queue length=2
[DBG] early return: stale fakeActCallbackNode, lanes=4194304 prio=4194304
[DBG] early return: stale fakeActCallbackNode, lanes=4194304 prio=4194304
...
```

`4194304` is a Suspense retry lane. Each ping or retry hits the early return in step 6.

### Confirming the hypothesis with a patch

Treating a leftover `fakeActCallbackNode` as stale once no act queue is open fixes the reproduction. In `scheduleTaskForRootDuringMicrotask`:

```diff
         if (
           currentTime !== root.callbackPriority ||
           (null !== ReactSharedInternals.actQueue &&
-            pingedLanes !== fakeActCallbackNode)
+            pingedLanes !== fakeActCallbackNode) ||
+          (null === ReactSharedInternals.actQueue &&
+            pingedLanes === fakeActCallbackNode)
         )
           cancelCallback(pingedLanes);
         else return currentTime;
```

(`pingedLanes` holds `root.callbackNode` at that point; the variable names come from the compiled build.)

With this patch applied in `node_modules`, `npm run test:repeat` passed **5 / 5 stories over 30 repeats**, `UserEventClick` included. After restoring the original files, `UserEventClick` failed again. I only used this patch to test the hypothesis and am not proposing it as the right fix in React. Another option would be for `act` to reset `root.callbackNode` when it drops queued work.

### How this explains the other observations

- **Raw `button.click()` / pass-through `eventWrapper`**: no act scope is open, so the root task goes to the real Scheduler and pings reschedule it normally.
- **`await act(async () => ...)`**: the awaited act keeps flushing the queue (`recursivelyFlushAsyncActWork`) until the promise resolves, so no work is dropped.
- **`throw promise` instead of `use()`**: `didUsePromise` is set only in `trackUsedThenable` (the `use()` path), so `flushActQueue` does not bail out in step 4. The queue finishes inside the synchronous `act` and no fake node is left behind.
- **React 18**: `React.use` does not exist there, so libraries such as jotai fall back to throwing the promise, which is the same as the case above. (React 18 was not tested in this repository.)

### Additional observations from a larger application (not reproduced here)

These come from an earlier investigation in a large existing application's Storybook (dev server, React 19.3.1, Storybook 10.6.2) and match the mechanism above:

- When stuck, `root.pendingLanes` was a Suspense retry lane (12582912, 25165824 or 50331648, changing between runs), `root.callbackNode` was an empty object (the `fakeActCallbackNode`), and `ReactSharedInternals.actQueue` was `null`.
- Dispatching an unrelated update (a Redux action) made the content appear in 8 of 8 stuck runs, and closing and reopening the component did in 4 of 4. Those updates use a different lane or priority, so they get past the early return.
- An empty `await act(async () => {})` afterwards did **not** make it appear (0 of 6). Nothing in it calls `ensureRootIsScheduled` with a different priority, so the stale node stays.
- A real component whose data comes from a jotai async atom (jotai calls `React.use` when it exists) passed only about 25% of the time on React 19 (15 of 60) and 60 / 60 on React 18.3.1. Why it fails only intermittently there was not investigated.
