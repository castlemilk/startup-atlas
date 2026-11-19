// Signal is a proposed aesthetic family. Illustrative geometry carries no research data.
export const aestheticReferences = [
  {
    "title": "Granola — Enterprise",
    "url": "https://www.granola.ai/enterprise",
    "note": "A distinct graphic for each feature, paired with a larger navigation preview."
  },
  {
    "title": "Granola — A new look",
    "url": "https://www.granola.ai/blog/a-new-look-for-granola",
    "note": "A consistent product world with a calm interface and expressive brand details."
  },
  {
    "title": "Clay — Behind the new homepage",
    "url": "https://www.clay.com/blog/new-homepage-2026",
    "note": "One connected mechanical illustration family explains different product operations."
  },
  {
    "title": "Vercel — Geist materials",
    "url": "https://vercel.com/geist/materials",
    "note": "Surface roles determine borders, radii and the lowest useful elevation."
  },
  {
    "title": "Vercel — Geist typography",
    "url": "https://vercel.com/geist/typography",
    "note": "Distinct roles for headings, labels, copy and monospaced utility text."
  }
];

export const aestheticDirection = {
  "id": "signal",
  "name": "Signal",
  "title": "A clearer view of the ecosystem.",
  "subtitle": "A technical visual language for finding companies, comparing evidence and following connections.",
  "status": "Proposed aesthetic",
  "date": "2026-11-17",
  "boardId": "signal-system",
  "principles": [
    {
      "title": "Precise interface",
      "detail": "Neutral surfaces, clean sans-serif type, clear labels and one visible focus."
    },
    {
      "title": "A recognisable family",
      "detail": "Coupling, partition, index and junction share the same construction."
    },
    {
      "title": "Meaning at every scale",
      "detail": "Simple symbols for controls; distinctive objects for navigation and headers."
    }
  ],
  "materials": [
    "Satin aluminium",
    "Porcelain white",
    "Graphite recesses",
    "Cobalt selection"
  ],
  "masterPrompt": "Use case: stylized-concept. Create one finished square feature illustration on an entirely opaque pure porcelain-white (#FFFFFF) background for Startup Atlas. Use the supplied Signal direction board as a visual reference for the object design, materials and camera. Deliver ONE individual object at large presentation size, no board, labels, typography or swatches. Premium clean CGI, precise machined geometry, satin aluminium side walls, smooth porcelain-white faces, graphite recesses and one cobalt blue active part. Crisp controlled bevels, realistic soft studio lighting from top-left, orthographic three-quarter view at roughly 30 degrees elevation, generous white space; entire object occupies about 75% of the canvas width. Everything outside the physical object is clean continuous white, including all open spaces between connecting parts. A very subtle neutral contact shadow is permitted, with no broad gradient, reflection, noise, particles or blue stains. Do not copy any lettering or layout from the source board. No transparency, no dark backdrop, no neon, no glows, no bounding card, no frame. This image is a porcelain presentation plate that sits inside an interface with its own border."
};

export const aestheticFeatures = [
  {
    "id": "mcp",
    "title": "MCP",
    "shortLabel": "MCP",
    "description": "Bring Atlas research into your tools and agents.",
    "verb": "Connect",
    "shape": "Coupling",
    "detail": "Two matching interfaces exchange context across a clear boundary.",
    "route": "https://github.com/castlemilk/startup-atlas/blob/main/docs/MCP.md",
    "routeLabel": "Read the MCP guide",
    "motion": "Align the modules, then pass one signal through the coupling.",
    "alt": "Two precise silver and white modules joined by a cobalt connector, an abstract illustration of context exchange.",
    "graphicId": "signal-mcp",
    "image": "./assets/design-lab/signal-mcp.webp",
    "thumb": "./assets/design-lab/signal-mcp-thumb.webp"
  },
  {
    "id": "treemap",
    "title": "Treemap",
    "shortLabel": "Treemap",
    "description": "Compare a measure across a company set.",
    "verb": "Compare",
    "shape": "Partition",
    "detail": "An enclosing plane and fitted blocks make grouping and inspection tangible.",
    "route": "./treemap.html",
    "routeLabel": "Open the treemap",
    "motion": "Raise the selected partition slightly; keep its original place visible.",
    "alt": "A silver square plate partitioned into fitted white blocks with dark recesses, with one cobalt block raised slightly.",
    "graphicId": "signal-treemap",
    "image": "./assets/design-lab/signal-treemap.webp",
    "thumb": "./assets/design-lab/signal-treemap-thumb.webp"
  },
  {
    "id": "search",
    "title": "Search & rankings",
    "shortLabel": "Search",
    "description": "Find a record. Choose what to compare.",
    "verb": "Find",
    "shape": "Index",
    "detail": "Aligned records and one extracted plate express search, order and selection.",
    "route": "./index.html#directory",
    "routeLabel": "Search the directory",
    "motion": "Align the records, then bring the selected result forward.",
    "alt": "Four aligned thin record plates with parallel inset grooves and one cobalt-edged record pulled forward.",
    "graphicId": "signal-search",
    "image": "./assets/design-lab/signal-search.webp",
    "thumb": "./assets/design-lab/signal-search-thumb.webp"
  },
  {
    "id": "graph",
    "title": "Knowledge graph",
    "shortLabel": "Graph",
    "description": "Follow companies, people and their connections.",
    "verb": "Explore",
    "shape": "Junction",
    "detail": "A selected entity reveals a small, readable neighbourhood.",
    "route": "./graph.html",
    "routeLabel": "Explore the graph",
    "motion": "Reveal the immediate connections from the selected node; settle fully.",
    "alt": "A sparse spatial junction of square silver and white nodes connected by thin rigid struts, with one cobalt node.",
    "graphicId": "signal-graph",
    "image": "./assets/design-lab/signal-graph.webp",
    "thumb": "./assets/design-lab/signal-graph-thumb.webp"
  }
];

export const featureGraphics = [
  {
    "id": "signal-mcp",
    "title": "Signal · MCP",
    "kind": "feature",
    "description": "Two matching interfaces exchange context across a clear boundary.",
    "caption": "Signal · proposed feature artwork",
    "alt": "Two precise silver and white modules joined by a cobalt connector, an abstract illustration of context exchange.",
    "usage": [
      "Use the opaque porcelain panel as a framed image in either UI theme; preserve the full silhouette and clear margins.",
      "Use the matching background-free SVG symbol at 16–48px; render panels suit larger menu previews and headers.",
      "Keep titles, actions, evidence and state labels as selectable HTML."
    ],
    "avoid": [
      "Treating the illustrative geometry as measured data, a connection status or research evidence.",
      "Cropping a required node, partition or coupling out of the feature silhouette.",
      "Using a tiny downscaled render in place of an optically drawn utility symbol."
    ],
    "tags": [
      "signal",
      "mcp",
      "feature",
      "technical",
      "proposed aesthetic",
      "porcelain panel"
    ],
    "image": "./assets/design-lab/signal-mcp.webp",
    "thumb": "./assets/design-lab/signal-mcp-thumb.webp",
    "width": 1536,
    "height": 1024,
    "transparent": false,
    "prompt": "Use case: stylized-concept. Create one finished square feature illustration on an entirely opaque pure porcelain-white (#FFFFFF) background for Startup Atlas. Use the supplied Signal direction board as a visual reference for the object design, materials and camera. Deliver ONE individual object at large presentation size, no board, labels, typography or swatches. Premium clean CGI, precise machined geometry, satin aluminium side walls, smooth porcelain-white faces, graphite recesses and one cobalt blue active part. Crisp controlled bevels, realistic soft studio lighting from top-left, orthographic three-quarter view at roughly 30 degrees elevation, generous white space; entire object occupies about 75% of the canvas width. Everything outside the physical object is clean continuous white, including all open spaces between connecting parts. A very subtle neutral contact shadow is permitted, with no broad gradient, reflection, noise, particles or blue stains. Do not copy any lettering or layout from the source board. No transparency, no dark backdrop, no neon, no glows, no bounding card, no frame. This image is a porcelain presentation plate that sits inside an interface with its own border. Feature subject: The MCP coupling: two complementary squared modules connected by a short central bridge. Four aligned recessed interface slots and one cobalt central connector make the direction of joining readable. A compact balanced silhouette, roughly horizontal, with a small open gap showing the interface. No USB plug, cable spaghetti, server rack or official MCP logo.",
    "referenceIds": [
      "signal-system"
    ],
    "status": "Proposed feature graphic",
    "createdAt": "2026-11-17",
    "referenceSources": [
      {
        "title": "Granola — Enterprise",
        "url": "https://www.granola.ai/enterprise"
      },
      {
        "title": "Granola — A new look",
        "url": "https://www.granola.ai/blog/a-new-look-for-granola"
      },
      {
        "title": "Clay — Behind the new homepage",
        "url": "https://www.clay.com/blog/new-homepage-2026"
      },
      {
        "title": "Vercel — Geist materials",
        "url": "https://vercel.com/geist/materials"
      },
      {
        "title": "Vercel — Geist typography",
        "url": "https://vercel.com/geist/typography"
      }
    ],
    "route": null,
    "pattern": null,
    "thumbWidth": 768,
    "thumbHeight": 512
  },
  {
    "id": "signal-treemap",
    "title": "Signal · Treemap",
    "kind": "feature",
    "description": "An enclosing plane and fitted blocks make grouping and inspection tangible.",
    "caption": "Signal · proposed feature artwork",
    "alt": "A silver square plate partitioned into fitted white blocks with dark recesses, with one cobalt block raised slightly.",
    "usage": [
      "Use the opaque porcelain panel as a framed image in either UI theme; preserve the full silhouette and clear margins.",
      "Use the matching background-free SVG symbol at 16–48px; render panels suit larger menu previews and headers.",
      "Keep titles, actions, evidence and state labels as selectable HTML."
    ],
    "avoid": [
      "Treating the illustrative geometry as measured data, a connection status or research evidence.",
      "Cropping a required node, partition or coupling out of the feature silhouette.",
      "Using a tiny downscaled render in place of an optically drawn utility symbol."
    ],
    "tags": [
      "signal",
      "treemap",
      "feature",
      "technical",
      "proposed aesthetic",
      "porcelain panel"
    ],
    "image": "./assets/design-lab/signal-treemap.webp",
    "thumb": "./assets/design-lab/signal-treemap-thumb.webp",
    "width": 1254,
    "height": 1254,
    "transparent": false,
    "prompt": "Use case: stylized-concept. Create one finished square feature illustration on an entirely opaque pure porcelain-white (#FFFFFF) background for Startup Atlas. Use the supplied Signal direction board as a visual reference for the object design, materials and camera. Deliver ONE individual object at large presentation size, no board, labels, typography or swatches. Premium clean CGI, precise machined geometry, satin aluminium side walls, smooth porcelain-white faces, graphite recesses and one cobalt blue active part. Crisp controlled bevels, realistic soft studio lighting from top-left, orthographic three-quarter view at roughly 30 degrees elevation, generous white space; entire object occupies about 75% of the canvas width. Everything outside the physical object is clean continuous white, including all open spaces between connecting parts. A very subtle neutral contact shadow is permitted, with no broad gradient, reflection, noise, particles or blue stains. Do not copy any lettering or layout from the source board. No transparency, no dark backdrop, no neon, no glows, no bounding card, no frame. This image is a porcelain presentation plate that sits inside an interface with its own border. Feature subject: The treemap partition: one shallow square plate precisely partitioned into six differently sized contiguous rectangular blocks. All blocks share one enclosing square boundary and narrow even seams. One cobalt rectangular block is raised by a small deliberate distance, with its footprint still visible. Other blocks are white porcelain, light satin silver and graphite. No bar chart, extruded city skyline, pie chart or numerical labels. The shapes are illustrative and do not encode real measurements.",
    "referenceIds": [
      "signal-system"
    ],
    "status": "Proposed feature graphic",
    "createdAt": "2026-11-17",
    "referenceSources": [
      {
        "title": "Granola — Enterprise",
        "url": "https://www.granola.ai/enterprise"
      },
      {
        "title": "Granola — A new look",
        "url": "https://www.granola.ai/blog/a-new-look-for-granola"
      },
      {
        "title": "Clay — Behind the new homepage",
        "url": "https://www.clay.com/blog/new-homepage-2026"
      },
      {
        "title": "Vercel — Geist materials",
        "url": "https://vercel.com/geist/materials"
      },
      {
        "title": "Vercel — Geist typography",
        "url": "https://vercel.com/geist/typography"
      }
    ],
    "route": null,
    "pattern": null,
    "thumbWidth": 768,
    "thumbHeight": 768
  },
  {
    "id": "signal-search",
    "title": "Signal · Search & rankings",
    "kind": "feature",
    "description": "Aligned records and one extracted plate express search, order and selection.",
    "caption": "Signal · proposed feature artwork",
    "alt": "Four aligned thin record plates with parallel inset grooves and one cobalt-edged record pulled forward.",
    "usage": [
      "Use the opaque porcelain panel as a framed image in either UI theme; preserve the full silhouette and clear margins.",
      "Use the matching background-free SVG symbol at 16–48px; render panels suit larger menu previews and headers.",
      "Keep titles, actions, evidence and state labels as selectable HTML."
    ],
    "avoid": [
      "Treating the illustrative geometry as measured data, a connection status or research evidence.",
      "Cropping a required node, partition or coupling out of the feature silhouette.",
      "Using a tiny downscaled render in place of an optically drawn utility symbol."
    ],
    "tags": [
      "signal",
      "search",
      "feature",
      "technical",
      "proposed aesthetic",
      "porcelain panel"
    ],
    "image": "./assets/design-lab/signal-search.webp",
    "thumb": "./assets/design-lab/signal-search-thumb.webp",
    "width": 1536,
    "height": 1024,
    "transparent": false,
    "prompt": "Use case: stylized-concept. Create one finished square feature illustration on an entirely opaque pure porcelain-white (#FFFFFF) background for Startup Atlas. Use the supplied Signal direction board as a visual reference for the object design, materials and camera. Deliver ONE individual object at large presentation size, no board, labels, typography or swatches. Premium clean CGI, precise machined geometry, satin aluminium side walls, smooth porcelain-white faces, graphite recesses and one cobalt blue active part. Crisp controlled bevels, realistic soft studio lighting from top-left, orthographic three-quarter view at roughly 30 degrees elevation, generous white space; entire object occupies about 75% of the canvas width. Everything outside the physical object is clean continuous white, including all open spaces between connecting parts. A very subtle neutral contact shadow is permitted, with no broad gradient, reflection, noise, particles or blue stains. Do not copy any lettering or layout from the source board. No transparency, no dark backdrop, no neon, no glows, no bounding card, no frame. This image is a porcelain presentation plate that sits inside an interface with its own border. Feature subject: The search index: four thin rectangular record plates stacked with a small consistent separation, like precise index drawers. Their top faces carry three short parallel inset grooves, purely abstract list marks without text. One plate slides forward from the stack and has one cobalt edge or selector strip. The selected record is clearly part of the same ordered set. No magnifying glass, book, rising performance bars or numbered ranks.",
    "referenceIds": [
      "signal-system"
    ],
    "status": "Proposed feature graphic",
    "createdAt": "2026-11-17",
    "referenceSources": [
      {
        "title": "Granola — Enterprise",
        "url": "https://www.granola.ai/enterprise"
      },
      {
        "title": "Granola — A new look",
        "url": "https://www.granola.ai/blog/a-new-look-for-granola"
      },
      {
        "title": "Clay — Behind the new homepage",
        "url": "https://www.clay.com/blog/new-homepage-2026"
      },
      {
        "title": "Vercel — Geist materials",
        "url": "https://vercel.com/geist/materials"
      },
      {
        "title": "Vercel — Geist typography",
        "url": "https://vercel.com/geist/typography"
      }
    ],
    "route": null,
    "pattern": null,
    "thumbWidth": 768,
    "thumbHeight": 512
  },
  {
    "id": "signal-graph",
    "title": "Signal · Knowledge graph",
    "kind": "feature",
    "description": "A selected entity reveals a small, readable neighbourhood.",
    "caption": "Signal · proposed feature artwork",
    "alt": "A sparse spatial junction of square silver and white nodes connected by thin rigid struts, with one cobalt node.",
    "usage": [
      "Use the opaque porcelain panel as a framed image in either UI theme; preserve the full silhouette and clear margins.",
      "Use the matching background-free SVG symbol at 16–48px; render panels suit larger menu previews and headers.",
      "Keep titles, actions, evidence and state labels as selectable HTML."
    ],
    "avoid": [
      "Treating the illustrative geometry as measured data, a connection status or research evidence.",
      "Cropping a required node, partition or coupling out of the feature silhouette.",
      "Using a tiny downscaled render in place of an optically drawn utility symbol."
    ],
    "tags": [
      "signal",
      "graph",
      "feature",
      "technical",
      "proposed aesthetic",
      "porcelain panel"
    ],
    "image": "./assets/design-lab/signal-graph.webp",
    "thumb": "./assets/design-lab/signal-graph-thumb.webp",
    "width": 1254,
    "height": 1254,
    "transparent": false,
    "prompt": "Use case: stylized-concept. Create one finished square feature illustration on an entirely opaque pure porcelain-white (#FFFFFF) background for Startup Atlas. Use the supplied Signal direction board as a visual reference for the object design, materials and camera. Deliver ONE individual object at large presentation size, no board, labels, typography or swatches. Premium clean CGI, precise machined geometry, satin aluminium side walls, smooth porcelain-white faces, graphite recesses and one cobalt blue active part. Crisp controlled bevels, realistic soft studio lighting from top-left, orthographic three-quarter view at roughly 30 degrees elevation, generous white space; entire object occupies about 75% of the canvas width. Everything outside the physical object is clean continuous white, including all open spaces between connecting parts. A very subtle neutral contact shadow is permitted, with no broad gradient, reflection, noise, particles or blue stains. Do not copy any lettering or layout from the source board. No transparency, no dark backdrop, no neon, no glows, no bounding card, no frame. This image is a porcelain presentation plate that sits inside an interface with its own border. Feature subject: The knowledge graph junction: five or six compact square nodes connected by thin rigid aluminium and graphite struts in a sparse asymmetric three-dimensional arrangement. One cobalt selected node is the visual anchor; the other nodes have white porcelain tops and satin silver edges. Open space between branches; every connection easy to follow, a bounded organised silhouette. Struts visibly meet the nodes. No giant sphere, globe, orbit rings, dense tangled network or unrelated floating fragments. It is a decorative metaphor, not an exact topology or real relationship claim.",
    "referenceIds": [
      "signal-system"
    ],
    "status": "Proposed feature graphic",
    "createdAt": "2026-11-17",
    "referenceSources": [
      {
        "title": "Granola — Enterprise",
        "url": "https://www.granola.ai/enterprise"
      },
      {
        "title": "Granola — A new look",
        "url": "https://www.granola.ai/blog/a-new-look-for-granola"
      },
      {
        "title": "Clay — Behind the new homepage",
        "url": "https://www.clay.com/blog/new-homepage-2026"
      },
      {
        "title": "Vercel — Geist materials",
        "url": "https://vercel.com/geist/materials"
      },
      {
        "title": "Vercel — Geist typography",
        "url": "https://vercel.com/geist/typography"
      }
    ],
    "route": null,
    "pattern": null,
    "thumbWidth": 768,
    "thumbHeight": 768
  }
];

export const aestheticAssets = [
{
  "id": "signal-system",
  "title": "Signal · Core aesthetic",
  "kind": "direction",
  "description": "A proposed technical identity for Atlas: clean typography, deliberate surfaces and four feature instruments built from one material family.",
  "caption": "Signal · proposed aesthetic",
  "alt": "Signal art-direction board with four technical feature instruments, a bright neutral palette, cobalt accent and a dark-surface comparison.",
  "usage": [
    "Review the shared material, silhouette, camera and lighting before extending the feature family.",
    "Use the live aesthetic lab to assess the same family in navigation and headers."
  ],
  "avoid": [
    "Taking the board's rendered labels as runtime typography or production colour specifications.",
    "Using decorative partitions or connections as evidence or measurements."
  ],
  "tags": [
    "signal",
    "direction",
    "technical",
    "aesthetic",
    "material"
  ],
  "image": "./assets/design-lab/signal-system.webp",
  "thumb": "./assets/design-lab/signal-system-thumb.webp",
  "width": 1536,
  "height": 1024,
  "transparent": false,
  "prompt": "Use case: stylized-concept.\nAsset type: finished visual identity and feature-illustration direction board for Startup Atlas, an ecosystem research product. This is a new aesthetic exploration called Signal.\nPrimary request: establish a striking, clean, sharp, restrained sci-fi technical aesthetic, with the clarity of an excellent developer-tool website and the coherent, recognisable feature objects of a premium product brand. The previous design was warm editorial green; this direction must feel decisively different.\nCanvas: landscape 1536x1024, precise editorial art-direction board. Bright cool-white background, generous negative space, near-black sans-serif typography. One deep graphite inset demonstrates that the SAME material family also reads on dark. Small cobalt-blue accent, satin silver and porcelain. Never rainbow.\nComposition: top left a restrained custom four-diamond Atlas mark and the small text \"STARTUP ATLAS / AESTHETIC STUDY\". A confident clean neo-grotesk heading \"Signal\". Supporting exact text \"Research, made tangible.\" Across the board arrange FOUR beautifully rendered original abstract feature instruments in a balanced two-by-two composition, each with ample margin and one clear small sans label: \"MCP\", \"Treemap\", \"Search\", \"Knowledge graph\". At the bottom a small elegant strip of grayscale and cobalt colour swatches and a monochrome mini-symbol for each feature. This is a brand direction sheet, not a dashboard or numerical infographic.\nShared graphic construction: precise machined forms, satin aluminium edges, white porcelain broad faces, graphite recessed channels, one cobalt active component. Tight 2mm chamfers rather than inflated soft shapes. Orthographic three-quarter camera, approximately 30 degrees above the surface, consistent scale and soft broad studio light from top-left. Premium tactile detail but no gritty texture, scratches or engraving. Crisp silhouettes, realistic occlusion, controlled highlights, no mirror chrome, no glass.\nMCP instrument: two complementary squared modules coupled by a short central bridge, four neatly aligned ports, one cobalt connector. It visually expresses context crossing an interface. No official MCP logo.\nTreemap instrument: a shallow square plate precisely partitioned into five to seven differently sized contiguous rectangular blocks, with one cobalt block slightly lifted. It expresses partition and inspection, not actual data.\nSearch instrument: three or four aligned thin record plates in a disciplined stack, one cobalt-edged plate slides forward to reveal parallel inset list grooves. It expresses indexing, order and selection, not a magnifying glass.\nKnowledge graph instrument: a sparse spatial junction of five or six small square nodes connected by thin rigid graphite/aluminium struts, one cobalt selected node. Clear bounded asymmetric topology, no ball of threads, no globe.\nTypography: elegant geometric grotesk, very crisp, 90% sans and small utility monospaced annotations only if needed. Short exact labels only. No tiny unreadable paragraph copy. Visual mood: calm precision, engineered curiosity, high-end scientific instrument brand.\nAvoid: forest green, serif display, cream paper, terracotta, neon glow, glassmorphism, space wallpaper, star fields, holographic HUDs, robot mascots, chat bubbles, decorative random orbs, glossy toy plastic, fake metrics, charts, product logos from other companies, repeated numbers, device mockups, watermark.\nThe four objects must obviously belong to ONE coherent asset family. Their silhouettes remain recognisable at navigation scale.",
  "status": "Proposed aesthetic direction",
  "createdAt": "2026-11-17",
  "referenceSources": [
    {
      "title": "Granola — Enterprise",
      "url": "https://www.granola.ai/enterprise"
    },
    {
      "title": "Granola — A new look",
      "url": "https://www.granola.ai/blog/a-new-look-for-granola"
    },
    {
      "title": "Clay — Behind the new homepage",
      "url": "https://www.clay.com/blog/new-homepage-2026"
    },
    {
      "title": "Vercel — Geist materials",
      "url": "https://vercel.com/geist/materials"
    },
    {
      "title": "Vercel — Geist typography",
      "url": "https://vercel.com/geist/typography"
    }
  ],
  "route": null,
  "pattern": null,
  "thumbWidth": 960,
  "thumbHeight": 640
},
...featureGraphics
];
