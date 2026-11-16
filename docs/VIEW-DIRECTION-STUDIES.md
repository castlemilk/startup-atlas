# Next-view direction studies

**Status: proposed design direction · 16 November 2026.** Studies 06–10 extend the five source wireframes: four new research journeys and one elevation refinement. They do not replace the source wireframes' visual authority or establish new working routes. All pictured companies, people, events, amounts and sources are fictional examples. The [concept manifest](../web/design-concepts.js) stores the accepted images and exact generation prompts. Existing capabilities and their owners remain documented in [EXPLORER-VIEWS.md](EXPLORER-VIEWS.md).

The shared composition continues the forest masthead, warm paper, white research surfaces, serif identities, fine sage rules and terracotta inspection state. These studies extend the research task, its reading order and the precision of its surfaces. They do not introduce another theme.

| Study | Research question | Direction to review |
| --- | --- | --- |
| [06 · Founder explorer](../web/design-lab.html?concept=founder&collection=proposed#gallery) | What has this person built, and how is that history evidenced? | Companies and roles before a dated journey and wider connections. |
| [07 · Funding round explorer](../web/design-lab.html?concept=funding-round&collection=proposed#gallery) | What does this particular announcement establish? | One event, its named participants and the evidence for each claim. |
| [08 · Startup comparison](../web/design-lab.html?concept=startup-compare&collection=proposed#gallery) | Where do these recorded company observations differ? | A stable comparison matrix with evidence attached to a selected cell. |
| [09 · Research collections](../web/design-lab.html?concept=research-collections&collection=proposed#gallery) | How do I resume a question without losing its context? | Mixed entity records, personal notes and next questions in one local collection. |
| [10 · List & search, elevated](../web/design-lab.html?concept=list-search-elevated&collection=proposed#gallery) | How can the existing directory gain clearer depth and a more precise hierarchy? | Three surface levels, a compact toolbar and a distinctly raised evidence inspector. |

## 06 · Founder explorer

**Job.** Understand a person through their sourced company and role relationships, then follow an organisation, collaborator or original source. The current generic person profile already supports linked relationships; the study proposes a fuller person dossier and dated role model.

**Journey.** Enter from a founder row, person search result or graph selection. Keep the person identity fixed while inspecting a company relationship. **Open company** follows that company; **Explore connections** deliberately opens the person's network. Return should preserve the originating route's supported scope. A pictured save action depends on the collections work below.

**Composition.** Give the identity a stable initial/avatar footprint, complete name, sourced role summary and compact coverage line. Place **Companies & roles** first in the wide reading column. Each row carries company identity, the actual role, dates where recorded and its evidence. A selected row opens a nearby relation-specific rail. A **Recorded journey** follows, with distinct event dates and publication dates. Related people appear only through explicit relationships. On narrow screens, read identity → companies → selected relationship evidence → journey → wider connections. Inspection focuses the evidence heading; closing returns focus to its originating row.

**States and evidence.** A selected company is not a new profile root. Undated roles stay visibly undated; a missing end date does not establish a current role. If no company relationships have been researched, retain the identity and explain the coverage gap. If role evidence fails to load, keep the role visible with an unavailable-evidence state. Show conflicting sources individually rather than silently choosing a career history. Same-name people must not be merged without identity evidence. Initials are the default when no usable sourced portrait exists.

**Prerequisites.** Extend the entity reader with role-specific provenance and optional valid-from/to dates, while preserving the current `founded` relationships. Define identity reconciliation, source review dates and historical-role labels before rendering a complete-looking chronology. Education, employment, personal websites and social links require their own research; the composition must work when all are absent.

## 07 · Funding round explorer

**Job.** Inspect one recorded funding event and determine exactly what its announcement says about amount, timing, instrument and participants. It is a destination from company funding history, not a replacement for that history.

**Journey.** A funding event row opens its stable event identity. **Open company** returns to the company context; selecting a participant reveals evidence for that participant's role in this event. A participant's organisation profile is a separate link. Previous/next event navigation, if added, must state which company's chronology it follows.

**Composition.** Lead with company, event label and announcement date. Show the recorded amount once, with its currency and measure label. Keep valuation, instrument and date as ordinary facts beside it. Place the **Named participants** table below, followed by the source's scope and limitations. The adjacent rail contains the announcement and the evidence for the selected participant. On small screens, the order becomes event identity → amount and facts → participants → selected evidence → company chronology. Avoid a quantitative chart when the task is interpreting one announcement.

**States and evidence.** Distinguish not disclosed, not recorded, ambiguous currency and failed loading. A portfolio listing cannot establish investment in this round. A lead role requires an explicit event-specific source; otherwise use the supported participation label. Do not estimate individual cheques, ownership or allocations from a round total. A valuation remains attached to its event and date. Separate equity, debt, secondary transfers and mixed instruments when recorded, without adding overlapping amounts into a total. An announcement date and a closing date may differ.

**Prerequisites.** Define stable event routing, company-event ownership and an event-participant relation with its own source, role and date semantics. Retain original amount text beside normalized money fields where necessary. Existing funding records can support a first event detail view; the participant table must await reviewed event-specific evidence. Until then, **Participants have not been researched** is a valid state.

## 08 · Startup comparison

**Job.** Compare the same named fields across a small, deliberate company selection and inspect a difference without losing the table. This is a reading tool, not a scoring or investment-ranking model.

**Journey.** Enter from selected directory records or a future collection. Preserve company order and allow explicit add/remove actions. Selecting a fact opens its evidence, while a company heading opens the full profile. A comparison may be shareable through stable company IDs and supported field choices; private notes must never enter that URL.

**Composition.** Use one matrix with row headings and two to four company columns. Group company identity/facts, funding observations and research coverage with fine rules. Keep complete names and profile links visible. The right inspector names both company and field, then shows value, source and relevant dates. For narrow layouts, display a chosen pair of companies while retaining the full selection; expose a pair selector and keep row labels visible. Horizontal scrolling may belong to the table, not the page. Keyboard selection must reach the same evidence as pointer selection.

**States and evidence.** **Differences only** changes visible rows without redefining values. Missing values are unknown, not equal zeroes. Show an unavailable company as an explicit column state so the reader can retry or remove it. Distinguish headquarters from operating geography and founding from product launch. Financial cells identify one observation, date and currency each. Mixed currencies may be read side by side with an explicit qualification, but must not produce a rank, sum, relative bar or implicit conversion. Newer unplotted observations remain discoverable. Source dates and research-review dates have separate labels.

**Prerequisites.** Agree a field registry with stable keys, compatible definitions, display formatters and source accessors. Reuse existing monetary eligibility rules for any explicitly comparable measure. Define observation selection before adding numeric sorting. Comparison state needs bounded company IDs, deterministic ordering and meaningful reload/Back behavior. **Save comparison** depends on a defined saved-state contract; it is a proposed control in this image.

## 09 · Research collections

**Job.** Keep a research question, selected records, personal notes and next actions together. The existing saved-opportunities list remains a separate browser-local feature until a deliberate migration is designed.

**Journey.** Create or open a named collection, add an entity from a future save action, inspect it in place and follow its live profile. Returning to the collection preserves the selected collection and its supported filters. Export/import provides an explicit way to move local work; it does not imply an account or synchronization service.

**Composition.** Use a compact collection index, a broad mixed-entity list and a selected-record inspector. Put the collection's research question above **Records**, **Notes** and **Open questions**. Rows show identity, kind and saved context. The inspector separates **Published record** from **Your research note** with clear headings and a local-storage label. On mobile, choose the collection first, then show its question and records; inspection enters document flow with a named return action. Do not compress three desktop columns into one tiny workspace.

**States and evidence.** A new collection explains how to add its first record. A search with no matches offers clear/reset without claiming the collection is empty. A record missing from the current snapshot retains its saved identity and note, marked unavailable. Refreshed public facts must not overwrite a personal note. If storage is blocked or full, show unsaved status and offer export; never report a successful save. Removal should provide undo. Research checkboxes describe the user's work, not verification of a company or source.

**Prerequisites.** Define a versioned browser-local schema for collection IDs, entity IDs, notes, saved timestamps, question state and the snapshot revision last seen. Public research remains read-only. Validate imported files and resolve entity references against the current snapshot; show unresolved records for review. Notes stay plain text, and imported URLs cannot become arbitrary application navigation. Establish storage limits, recovery and export semantics before offering save controls. Cloud sync, collaboration and account ownership are separate proposals.

## 10 · List & search, elevated

**Review question.** Refine the existing directory's finish while retaining study 01's search → results → inspector composition. This companion study tests a little more depth, cleaner typography and more deliberate control grouping. It is a proposed visual refinement; publishing its image does not change runtime tokens or the deployed directory.

### References and interpretation

The browser review used three attributed visual references: [Attio Record Overview on Dribbble](https://dribbble.com/shots/26212737-Attio-Record-Overview), [New toolbar on Dribbble](https://dribbble.com/shots/23237138-New-toolbar), and [CRM dashboard — Untitled UI on Dribbble](https://dribbble.com/shots/17219712-CRM-dashboard-Untitled-UI). They inform the review of record hierarchy, toolbar grouping and surface separation. Atlas retains its own composition, identity and assets.

Official product explanations provide additional context. [Attio's record documentation](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) describes a preview beside the current view with its record highlighted and a separate full-page action. [Linear's March 2026 design refresh](https://linear.app/now/behind-the-latest-design-refresh) describes reducing navigation prominence, compacting controls and softening redundant separators. The following Atlas treatment is our design inference from those references, not a measurement of their CSS.

### Proposed Atlas treatment

Use three deliberate surface levels:

1. **Outer paper:** the existing warm page provides a quiet frame.
2. **Research workspace:** a white surface gains a fine keyline and restrained contact shadow.
3. **Evidence inspector:** a slightly higher surface separates the active reading task, with a clear header and a subtle edge/shadow.

Keep rows and individual facts flat. Remove redundant dividers where spacing already communicates grouping, while retaining the rules needed to scan a table. Elevation belongs to the workspace and selected context, not every label/value pair.

Retain serif page titles and entity names. Use compact sans-serif buttons and section labels, with a proposed 14px body/12px metadata rhythm for dense regions. These are study targets for review, not changes to the existing runtime type scale. Align icons and text consistently; let complete names wrap.

Consolidate search, filters, sort and view controls into a predictable toolbar. Selection combines a terracotta wash and edge rule; keyboard focus remains independently visible. Inspector actions preserve the distinction between inspecting a record, opening its profile and exploring its graph.

**Acceptance before implementation.** Compare the refinement directly with study 01, then assess the treatment across studies 06–09. Check long records, small screens, empty and partial states, readable metadata and focus contrast. On mobile, stack the inspector in document flow and reduce decorative elevation where it crowds the reading area. Accept a shared surface primitive only after those checks; retain the five source wireframes and their current implementation contracts throughout.

## Shared implementation gate

For any study chosen for implementation, first name the existing data/component owners and the smallest valid data-backed slice. Then specify URL versus transient state, source/date meaning, narrow reading order and focus return. Review the actual ready, selected, empty, partial and failed states with long names and unavailable storage. Keep proposed actions in the concept layer until their behavior exists. The screenshots establish a direction; release evidence belongs to the implementation and its verified deployment.
