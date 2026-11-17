# Inspector specimen evidence

This receipt distinguishes the isolated source from the published Atlas application. The specimen is not merged, deployed or integrated with Hardware, filters or the reserved adapter.

## Source and review

- Initial inspected main and fixture revision: `a8da234e976142647277d799d84bae792d47bf98`.
- Branch: `specimen/fluid-inspector-continuity`.
- Current source/review commit and PR: recorded after publication of the reviewed draft.
- Independent source review found and prompted fixes for desktop focus retention, stale opener reuse, consumed Escape handling and authored easing restoration. Closed-state environment changes were also corrected to avoid unsolicited focus movement.
- The deterministic suite uses actual vendored Fluid 0.1.2 with explicitly labelled jsdom dialog, geometry, media and frame doubles. It is source-level evidence.

## Browser execution limits observed locally

The connected Browser tool timed out during initialization. The cloud browser opened the sibling chat URL but reached signed-out ChatGPT, so the private filter conversation was not read or messaged. No login, credential or permission change was attempted. Coordination was posted through the existing canonical Space connection.

The local command `chromium --headless=new --disable-gpu --dump-dom about:blank`, retaining the browser sandbox, exited 134 with `socket() failed: Operation not permitted (1)` in `process_singleton_posix.cc`. The cloud browser's attempt to open the local source preview returned `net::ERR_CONNECTION_REFUSED`. These are environment access limits, not application failures. No sandbox flag, network policy or security setting was altered.

The additive test entry uses the existing repository PR workflow for isolated Chrome execution and its existing `graph-review` artifact destination. Until that report is observed, all native focus, rendered layout, actual visibility and live media-preference browser gates remain pending. The passing controller fixtures must not be described as browser acceptance.

## Acceptance result

Pending the reviewed draft's existing CI run and independent screenshot review. The final receipt must include exact head/tested merge revisions, command outcomes, the browser report/artifact link, inspected screenshots and any remaining gaps.
