# Optional public landing analytics: disabled draft

The published configuration remains **no tracking**: `enabled`,
`gaPrivacyReviewed` and `policyReviewed` are false; origin, base path and the
measurement ID are blank. No Google script is requested and no consent storage
is accessed in this state. Saved opportunities remain local. This foundation
does not enable Flaggr, create accounts/properties, connect OpenSEO or deploy.

## Decisions required before activation

- Resolve the canonical deployment: the repository supports both a Vercel root
  and a GitHub Pages project subpath. Do not treat both as one confirmed origin.
  Set the exact HTTPS origin and either `/` or `/startup-atlas/`, never a sibling
  project or entire shared host. This draft does not select a canonical URL.
- Review and update the current no-tracking promise and visitor privacy notice
  before setting `policyReviewed`. Optional consent is not permission to silently
  contradict published promises. Record provider, purposes, retention and choice.
- Use a dedicated, verified GA4 web stream, not another product's ID. Connect that
  property to OpenSEO separately. Do not store private credentials in public JS.
- Verify Enhanced Measurement, Google Signals, user-provided data, ad links and
  cross-domain measurement are disabled in GA4 Admin before setting
  `gaPrivacyReviewed`. This implementation emits only a fixed public page view.
- Verify actual Google behavior in a controlled browser/DebugView before release.
  Mocked tests cannot prove vendor behavior. Do not enable before these gates.

## Boundary

Only the exact configured index path is eligible, with no query/hash at initial
load and with DNT/GPC absent. A visitor must explicitly opt in. Their choice is
per tab (sessionStorage), but cookies can outlive the tab. Declining sends no
Google request, including no consent-mode ping. Browser storage failures fail
closed. The script URL has no referrer and page identity is fixed; search text,
filters, saved opportunities, profile selections and business data are not event
properties. There are no click/form/search collectors. GA can still process IP
and browser/network information after consent, as explained in the control.

Cookies are host-only, prefixed `startup_atlas` and scoped to the configured
base path. Withdrawal sets Google's disable flag and clears the pending queue
before reloading into denied state. Already submitted data cannot be recalled.
Existing cookies may remain until expiry/browser deletion; the UI promises no
delete operation. If a stale choice cannot be cleared because storage fails,
no reload occurs and the visitor is told to close the tab.

Do not transplant this static-page adapter into a shared private-app SPA runtime.
Do not enable automatic URL/history measurement, user IDs or arbitrary payloads.

## Flaggr

Not loaded. It needs a dedicated verified site ID, reviewed cookie/session policy,
and a released pinned stop contract (`skunkworq/flaggr#200`). That contract stops
transmission, not all collectors. Do not use demo/CLI destinations or an unverified
latest CDN bundle. Adding Flaggr requires the same policy and visitor-consent gate.

## Verification

`node --test tests/analytics.test.js` exercises denial, explicit grant, single
initialization, withdrawal including unavailable storage, origin/path scope and
privacy signals. It runs in the normal `npm test` suite. The build explicitly
copies both analytics files. Neither test nor build activates tracking.

Browser contract: `PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test-analytics-browser.cjs`
requires the existing Playwright dependency and a browser. It intercepts every
request against a test origin and sends no vendor data. Before real activation,
verify changing directory search/filters (which use history.replaceState) never
sends a changed URL or filter contents through automatic vendor events.
