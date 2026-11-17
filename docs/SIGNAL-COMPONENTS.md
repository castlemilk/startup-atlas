# Signal — tactile controls

**Direction specification · 17 November 2026, Melbourne.** This extends the [Signal aesthetic](AESTHETIC-DIRECTION.md) into buttons, lists and everyday controls. Review the native HTML/CSS examples in the [controls workbench](../web/design-aesthetic.html#controls). The workbench explores appearance and local interactions; adopting these patterns across Atlas research routes remains a separate implementation step.

## Material character

Controls feel like shallow instruments set into a clean working surface. Porcelain faces, graphite wells and cobalt actions connect them to the feature artwork. Use a restrained convex gradient, a fine top highlight and a 1–2px lower lip on an actionable button. Pressing moves its face down 1px and replaces the raised shadow with a short inset shadow. Inputs sit slightly inside their surrounding surface. Reading surfaces remain flat.

Geist Sans continues to carry interface text; Geist Mono identifies commands and comparable numbers. Material supports hierarchy without competing with company names, evidence or values. Implement the controls in CSS with live text and native elements. Generated feature images belong in supporting art panels.

The workbench defaults to **Tactile + Soft**, comparing **Flat / Tactile** surface treatment and **Precise / Soft** geometry. Change one dimension at a time when evaluating a direction. Neither appearance should alter information, action priority or keyboard behaviour. The shared radius roles below define the proposed Soft family; Precise compares tighter 4/6/8/10/12px corners in the same roles.

## Geometry and density

| Radius role | Value | Use |
| --- | --- | --- |
| Compact | 6px | Small chips, keycaps and tightly nested elements |
| Control | 10px | Buttons, inputs and segmented-control shells |
| Row | 12px | A selected record or an independently highlighted item |
| Panel | 18px | List trays, cards, menus and future dialogs |
| Feature | 24px | Large feature-art and introductory panels |
| Round primitive | 999px | Avatars, status dots and switch geometry |

Ordinary buttons and filter chips keep visible corners. For nested surfaces, start with **inner radius = outer radius − inset**, clamped at zero, then check the visible gap. An 18px tray with 6px padding naturally contains a 12px selected row. Do not stack unrelated corner radii because each component looks attractive separately.

Use the existing 4px spacing unit. The current specimen uses controls at least 44px high, including icon-only actions. Its record minimums are 76px compact and 100px comfortable, allowing space for summaries. Density changes padding and minimum height; long content can grow. More compressed production tables need a separate density review rather than forced truncation of these examples.

## Buttons and states

Keep one primary action per local task. Use clear verbs and reserve destructive styling for an action with an actual destructive consequence. An icon button inherits its action's priority; its shape does not create another priority level.

| Variant | Rest | Hover | Pressed | Persistent state |
| --- | --- | --- | --- | --- |
| Primary | Cobalt face, white label, restrained top highlight and lower lip | Slightly brighter face or clearer edge | Face depresses 1px; lip contracts; inset shadow | A toggle such as Save selected retains its label and exposes its pressed state; submissions report progress separately |
| Secondary | Neutral porcelain/graphite face with readable boundary | Increase edge definition and surface contrast slightly | Same 1px depression and inset treatment | If it toggles a mode, show a selected marker and expose the pressed state |
| Ghost | Text/icon on the parent surface; no resting lip | Quiet neutral background | Darker inset tint with little or no travel | Selection adds a stable indicator, not a permanent hover treatment |
| Icon | Secondary or ghost material, centred functional symbol | Follow the inherited priority | Follow the inherited priority | Give it a persistent accessible name; toggles also expose their state |
| Destructive | Explicit action label; reserved danger treatment | Strengthen the same semantic treatment | Same pressure behaviour | Never infer success from red disappearing; report the resulting action |

These state rules apply across variants:

- **Focus:** an independent, visible focus ring surrounds the control, including when it is hovered or selected. Keep it outside the decorative bevel and unclipped by trays.
- **Disabled:** remove pressure feedback and reduce prominence while preserving legibility. Explain a non-obvious prerequisite nearby. Use the native disabled state where appropriate; an `aria-disabled` control also needs activation prevented.
- **Loading:** preserve button width, retain a meaningful label such as “Saving…”, prevent duplicate submissions and expose status text. A spinner alone is insufficient feedback.
- **Selected:** retain a check, rail, filled segment or other stable shape alongside colour. For toggle buttons, keep the label stable and use `aria-pressed`.

Use native buttons for actions and links for destinations. Buttons activate with Enter and Space. Name every icon-only action. These semantics follow the [WAI-ARIA button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/); styling does not supply them automatically. The destructive treatment needs a shared semantic danger role before broad adoption; cobalt remains action/selection, not warning or verification.

## Lists as a shared instrument tray

A result list has one 18px outer tray, one surface and shared dividers. Individual records remain flat. Hover adds a quiet surface wash; selection adds a 12px local shape and a cobalt leading rail. Reserve shadows for the tray or floating context. Give selected and keyboard-focused records distinguishable indicators.

| Reading layer | Compact density | Comfortable density |
| --- | --- | --- |
| Identity | Company name and concise identifier on the first line | Name plus a short descriptive line |
| Comparable value | Stable aligned column with units and sort context | Same column; supporting explanation can wrap |
| Context and evidence | Short category, source/date or explicit missing-data label | Additional source or relationship context |
| Actions | Consistent trailing position; reveal optional tools on focus as well as hover | Same placement with more breathing room |

Use 14px UI text as the starting point; metadata may be 12–13px if it remains legible. Keep numeric columns aligned with tabular figures. Do not render unknown funding as zero, promote a decorative rank to evidence, or hide the source needed to interpret a value. If columns collapse on mobile, preserve identity → value → context → action. Prefer a real link to the record and separate action buttons; avoid nested interactive elements or turning a complex row into one oversized button.

## Related components

| Component | Appearance and behaviour |
| --- | --- |
| Input / search | 10px inset well, persistent label, readable boundary and clear focus ring. Search icon is supporting context. Provide a named clear action when populated; placeholder text is not the label. Validation uses explanatory text and a semantic state. |
| Toggle | Small inset track with a raised thumb. Position and accessible checked state identify on/off; cobalt can reinforce on. Keep the label stable and the target generous. |
| Chip | 6px compact marker with flat fill. Interactive filter chips have explicit selected state; removable chips expose a named removal action. Plain metadata is not styled as a raised button. |
| Tabs / segments | Shared quiet track with a lightly raised selected segment or a clear underline. Keep selection stable. Use tabs only for associated panels and implement their keyboard pattern; local preference buttons may use pressed states. |
| Popover / menu | 18px floating surface, fine boundary, one coherent shadow. Align to its trigger, support dismissal and preserve predictable focus. A filter form inside a popover does not acquire menu semantics solely from its appearance. |
| Card | 18px resting surface. Start with an edge and spacing; add elevation only when its relationship to surrounding content requires it. Avoid a second heavy frame around every child. |
| Modal | Future component: 18px dialog, restrained backdrop, clear title and action order. Complete focus entry, containment, dismissal and return before presenting it as a usable modal. |

## Light, dark and depth

Use the [scoped Signal tokens](../web/design-aesthetic-tokens.css). Neutral raised faces use `--signal-face-top` and `--signal-face-bottom`; controls, inset wells and pressed faces use their corresponding shadow roles. The primary button uses `--signal-action-top`, `--signal-action-bottom` and `--signal-on-action`. The lighter dark-theme selection accent is a separate role from that solid action face.

Light mode suggests porcelain with a crisp top edge and small lower shadow. Dark mode suggests graphite with a modest lighter edge; increase surface separation before increasing shadow blur. Do not invert light shadows mechanically. Keep one material per element and choose the lowest useful elevation, adapting the role-based approach in [Geist materials](https://vercel.com/geist/materials). Signal's radius values and tactile treatments are its own proposal.

Decorative highlights do not establish accessibility. Where a boundary or state marker is needed to identify a control, check at least 3:1 against adjacent colours, following [WCAG non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Assess the actual gradient region behind text, selected rows and focus indicators in both themes. Fine decorative dividers need not carry interaction meaning. These are acceptance criteria, not a claim of certification.

## Motion, scope and acceptance

Use the existing 140ms feedback and 240ms contextual timings. Transition only the properties involved in the interaction. Pressure changes must not shift neighbouring content. With reduced motion, remove button travel and animated thumb movement while keeping the final inset, selected and focus states visible. Hover alone must not reveal essential content or actions.

**Demonstrated:** material/edge comparisons, primary and secondary actions, ghost navigation, search/clear, selected rows, compact/comfortable density, local save/filter/reset, summary switch, ID checkbox, selected-record inspection and empty states. A separate labelled strip depicts rest, hover, pressed, focus and disabled primary-button appearances. Saved choices are in memory and clear on reload.

**Future coverage:** production loading, validation, destructive workflows, full tabs/menus and dialogs. A rendered specimen does not establish those workflows. Before adopting a component, check native semantics, keyboard operation, touch targets, long labels, narrow layouts, both themes, reduced motion and the relevant empty/error/disabled states against its actual implementation.
