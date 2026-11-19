# Isolated motion runtime

These two files are unmodified distributions from the pinned `gsap@3.15.1` npm archive. The original copyright and license headers are preserved. GSAP uses its [standard no charge license](https://gsap.com/standard-license/); it is not MIT licensed.

[manifest.json](manifest.json) records the archive URL and npm integrity, file sizes and SHA-256 hashes. It also records local deterministic gzip sizes, which are not measurements of a hosting provider's response compression.

Only the standalone Signal motion study loads this runtime. It makes no CDN request. An initial device preference for reduced motion or a checked still control prevents the vendor load. The root package manifest, lockfile, SDK bundle and operational routes do not import these files.

To reproduce or review an update, download the exact version with `npm pack gsap@3.15.1 --ignore-scripts` into a temporary directory, verify the archive's SHA-512 against `packageIntegrity`, and compare `package/dist/gsap.min.js` and `package/dist/ScrollTrigger.min.js` byte for byte. Copy only those two distributions and keep their notices intact. Update the manifest and loader version together, then rerun the unit, build and browser acceptance checks in [the motion review](../../../../../docs/MOTION-REVIEW.md).

This is an isolated static-app integration, not approval to install a second GSAP runtime into a future React/Hardware host. Such a host should supply its own reviewed runtime through `mountMotionPilot(root, {loadRuntime})` and call the returned cleanup function on unmount.
