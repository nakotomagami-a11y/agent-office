# Tiny-Swords Weapon Generator — Replication Plan

Goal: make `@agent-office/pixel-icons` procedurally generate weapons that read as if
they belong to the **Tiny Swords** pack (Pixel Frog). Crafted in phases so context
survives across sessions. **Work top-to-bottom; check boxes as you finish; render &
eyeball after every phase.**

## Reference (measured from the real assets)

Authentic pack sprites live in `apps/web/public/units/<color>/` (animation sheets):
`warrior-idle` (sword), `lancer-idle` (spear), `pawn-axe/hammer/knife`, `archer-idle` (bow).
Frame = square (height). Native scale: **block 2–3 → a whole character+weapon is ~40–48
native px**; a weapon alone ~25–32 native px. (The 256px `avatars/*.png` are 4× promo art —
NOT the pixel reference; use the unit sprites.)

Extract/compare with the harness: `bun scripts/compare.mjs` (see Phase 0).

### Art rules (what makes it read "tiny swords")
1. **Bold outline around everything**, warm near-black `#161c2e`, ~1 native px, consistent —
   including internal separations (blade↔guard). Slightly lighter where it meets a top-left
   highlight (selective/AA outline).
2. **Tight limited palette** — ~11–14 colors total per sprite. Each material = a **3–4 tone
   ramp** (shadow / mid / light / spec) drawn from fixed families, NOT random hues.
3. **Directional light, top-left.** Highlight on upper-left faces/edges, hard shadow band on
   lower-right. Chunky highlight blob, not a smooth gradient.
4. **Chunky shapes.** Blades are wide (~1/4 of length), hafts/shafts 2px+, heads bold. Nothing
   tapers to a 1px spindle.
5. **Hard alpha, no AA.** Clean deliberate silhouette; cleanup removes stray pixels.

### Target palette (sampled from pack, hex)
- **Outline:**  `#161c2e`
- **Steel/silver:**  shadow `#5a6366` · mid `#8c9695` · light `#b8c1c3` · spec `#eef2f4`/`#ffffff`
- **Cool steel (blued):**  `#434055` · `#5e6f86` · `#8c9695`
- **Gold/brass:**  shadow `#8a6a3c` · mid `#c8a876` · light `#efe1ab`
- **Wood:**  shadow `#5e4a3a` · mid `#977b6b` · light `#ada081`
- **Leather/dark cloth:**  `#2e2c3e` · `#434055` · `#5e5455`

---

## Phases

### Phase 0 — Tooling & reference  ✅ done
- [x] Extract pack weapon frames → `/tmp/pack-weapons.png`
- [x] Sample pack palette (above)
- [x] `scripts/compare.mjs` — our weapons beside pack crops, both bgs → `/tmp/compare-{dark,light}.png`.
  Run `bun scripts/compare.mjs [nativeDim] [celSteps]` after every phase.

### Phase 1 — Density / native scale  ✅ done
- [x] `WeaponIcon` default nativeDim → `clamp(round(size*0.7), 40, 60)` (was 28–44). ~56 at size 80.
- [x] `scripts/preview.mjs` default → 56.

### Phase 2 — Constrained palette  ✅ done  ← biggest visual lever, landed
- [x] `src/palette.ts` — STEEL/BLUED/GOLD/WOOD/DARK/BONE ramps + GEMS + `pick*` seed pickers + `OUTLINE`.
- [x] Replaced every random-`hsvToRgb({h:0..360})` in pen helpers (blade/crossguard/grip/haft/ornament)
  and weapons (axe/spear/trident/staff). Outline default → `#161c2e`.
- [x] Verified: distinct colors dropped 29–45 → 7–27 (staffs 46 = gem glow, addressed in Phase 4).
  Visually cohesive & pack-like on light bg; outline merges on dark bg (Phase 3).

### Phase 3 — Bold outline + selective outlining  ✅ done
- [x] `addBorder` is now 2-tone: near-black `#161c2e` on bottom-right shadow edges, a lifted navy
  (`lift 0.16`) on top-left lit edges (`litSide` = down-right opaque neighbours). Adds pack depth
  and the lit edge is the only thing that reads on the `#1a1a1a` card. Dark-bg thin dark shafts
  still faint (inherent; bright fills carry legibility — did NOT add a non-pack glow).

### Phase 4 — Cel-band snap to ramp tones  ✅ done
- [x] `Pen.snapToPalette()` (called in `addBorder` after cleanup): snaps each opaque pixel to the
  nearest `allTones()` colour. Collapses continuous gradients → hard bands; exact colours now
  **8–15** (staffs 19 w/ gem glow), matching the pack. Translucent FX (glow/sparkle, alpha<250)
  left alone. NOTE: this superseded the "directional light rework" idea — snapping the existing
  shaders was far lazier and hit the goal. A dedicated top-left light vector is still a possible
  future refinement if shading direction reads inconsistent, but current result is good.

### Phase 5 — Chunky / straighter shape language  ✅ done (first pass)
- [x] Tamed blade noise: `bladeWiggleAmp` amp ÷2 & rarer (`*8-7.2 /8`), `bladeWidthCosineAmp`
  reduced (`*0.8-0.3`), `bladeJogAmount` PI/4→PI/6. Noodle/lumpy blades → clean straight swords +
  gentle sabers. Blade `startRadius` (2–4·dscale) already chunky at native 56; left as-is.
- [ ] (future) spears/tridents still a touch thin — bump haft radius if desired.

### Phase 6 — Silhouette cleanup at new scale  ✅ verified adequate
- [x] `cleanSilhouette` thresholds (≤1 / ≥5) still correct at native 56 — renders show clean edges,
  no stray pixels, thin shafts preserved. No change needed. Revisit only if higher native res used.

### Phase 7 — Integration & in-app verification  ✅ done
- [x] Verified via `scripts/compare.mjs` on both theme bgs — runs the **exact** `IconGenerator` path.
- [x] **Live Playwright verified.** Installed `playwright` (root devDep) + chromium; wrote
  `<repo>/scripts/shot.mjs` (`node scripts/shot.mjs <url> <light|dark> <out.png> [waitSel]`).
  Screenshotted the running `/skills` (dev server :3001, 210 WeaponIcon canvases) in both themes →
  `/tmp/skills-{dark,light}.png`. Icons render pack-like in-app (steel axe, gem staff, trident);
  outline reads crisp on light. **Theme gotcha:** the app's `hydrate()` re-applies the stored theme
  async, so `shot.mjs` sets `data-theme` AFTER a 1.5s wait, right before the shot.
- [ ] (future) fold `compare`/`preview` under `pnpm` scripts; top-left light-vector pass (Phase-4
  note); spear/haft thickening; single-edge spine (Phase-8 note).

---

### Phase 8 — Sword variety: mix-and-match blades × handles  ✅ done (first pass)
- [x] `drawBladeHelper` now takes an optional `BladeStyle` (curve / curveDir / wave / waveLen /
  widthAmp). Absent → original random meander (spears unaffected). Styled blades carry constant
  curvature (saber arc) and skip the random jog/omega.
- [x] `blade.ts` rewritten as a component system: 7 blade PROFILES (knight/broad/saber/falchion/
  cleaver/rapier/flamberge) × GUARDS (bar/swept/wings/disc/none) × grip (1-hand / 2-hand) × POMMELS
  (round/gem/none), each picked mostly independently → combinatorial variety. Verified 48-seed sheet
  `/tmp/blades-{light,dark}.png`: clear sabers, cleavers, rapiers, wavy flamberges, wrapped grips,
  gem/round pommels, disc/swept/winged guards.
- **Inspiration only** — reference sheet pixels NOT copied; procedural archetypes derived from the
  visible vocabulary.
- [x] **Single-edged blades:** `BladeStyle.singleEdge` shades by lateral position — bright cutting
  edge (dp<0 side), dark flat spine (dp>0 side), mid body. Enabled on saber/falchion/cleaver; knight/
  broad/rapier/flamberge stay symmetric. `/tmp/blades2-light.png` shows the two-tone edge/spine on
  curved blades. tsc exit 0.
- [ ] (future) serrated & clip-point tips; wider cleaver profile shaping; per-guard gold/steel choice;
  coordinate edge side with saber curve direction (outer curve = edge).

### Phase 8c — degenerate-case cleanup  ✅ done
Audited 64 blades (`/tmp/blades-audit5.png`) after user flagged a "wide slab on a round pommel ball".
Root causes + fixes in `blade.ts`:
- **Plank cleavers** (`taper 0.07` = full-width to a blunt tip): cleaver taper →0.26, broad →0.2 → shaped tips.
- **Slab-on-ball** (wide blade base overlaps grip, sits on pommel): added `Profile.wide` (broad+cleaver);
  wide blades force a guard (`none`/`disc` → `bar`) so the base has a real transition.
- **Fishhook sabers** (random `curveDir` curved backward on long blades): saber `curveDir` fixed to 1
  (forward scimitar) and curve softened `π/64 → π/108`.
- **Broken noodle knight/rapier** (no style → random jog/omega meander thinned them): gave knight &
  rapier `makeStyle: ()=>({widthAmp:0})` so they use the clean straight styled path.
- Pommel size capped (`0.6+1.4·low → 0.5+0.9·low`) so the round ball never dominates a thin blade.
- flamberge wave `0.32→0.22`. tsc exit 0. Result: 64/64 read as clean varied swords, no degenerates.

### Phase 8d — guard scales with blade width  ✅ done
User flagged a wide broadsword whose crossguard was narrower than the blade (blade overhangs guard →
reads broken). In `blade.ts` the guard is now sized off `w = blade.startRadius` (base half-width) so it
ALWAYS overhangs: bar `halfLength = w*(1.5+0.9·low)+2`, swept `w*(1.9+1.0·low)+2` (extra to offset the
curl-back), wings `w*(2.3+1.2·low)+2`; disc radius `w*1.2+1`. Guard `thickness` also scales with `w`
(`max(1.4, w*0.34)`, wings `max(1.8, w*0.45)`) so wide blades get chunky guards, not wire. `/tmp/
blades-guard.png` — crossguards now extend past the blade on every profile. tsc exit 0.

### Phase 8d — more blade archetypes (big variety)  ✅ done
Studied a 100-sword reference sheet (design vocabulary only, NOT pixel-copied). Added a blade
shape-profile layer to `drawBladeHelper` via 3 new `BladeStyle` fields:
- **`bulge`** — width swells mid-blade (`1 + bulge·sin(π·nd)`) → leaf blades.
- **`clip`** — spine side (widthR) angles to the tip over the last `clip` fraction → clip-point/bowie
  + katana kissaki.
- **`fuller`** — darkens a thin central band in the fill loop → blood-groove on wide blades.
New PROFILES (7 → 11): **leaf** (bulge), **bowie** (clip+singleEdge), **katana** (gentle curve +
singleEdge + clip tip, long two-hand hilt), **greatsword** (long/wide + fuller); `broad` gained a
fuller. Verified `/tmp/blades-new{,-dark}.png` both themes — leaf/katana/bowie/greatsword read
distinctly, fuller shows as a centre groove. tsc exit 0. Future: serrated edge (may not read at 56px),
tanto/dagger (short — layout fills the diagonal so short weapons float), forked/twin tips.

### Phase 8e — metals + more blades + disc-guard fix  ✅ done
User: "still weird handles" (a big ball again) + "feels very limited, want bigger variety".
- **Disc-guard ball (again):** the fix was *relative* (`w*0.7`) so WIDE blades (broad `w≈8`) still made a
  ~6px sphere. Now absolutely capped: `min(gripRadius+2, max(gripRadius+1, w*0.5))` ≈ 4–5px. Verified
  via DBG log on the flagged seed `0UhhVlau19mrsLus` (was disc, w=8 → discR 5.6→4).
- **Blade metal variety (biggest felt-variety lever):** every blade was silvery. Added `BRONZE` (copper)
  + `DARKIRON` (near-black steel) ramps to `palette.ts`, into `BLADE_METALS` and `allTones()` (so snap
  keeps them). Dark-iron still reads on the `#1a1a1a` card via highlight/lit-edge.
- **New blade profiles (11 → 14):** `estoc` (thin + fuller), `sawblade` (`BladeStyle.serrate` = triangular
  teeth on the cutting edge, mid-blade only), `dagger` (short clip single-edge).
- Verified `/tmp/blades-var{,-dark}.png` both themes — bronze/iron/steel × leaf/katana/greatsword/estoc/
  saw/dagger/saber/etc, serration reads as teeth, no ball handles. tsc exit 0.
- [ ] (future) forked/twin tips; ring & knuckle guards; more pommel shapes (wheel/crescent); tanto short
  layout; per-blade guard-material coordination (bronze blade → bronze guard).

### Phase 8f — worked the whole 100-sword gallery  ✅ done
User: "go through ALL of them, implement most — you keep doing very little." Studied the full sheet in
upscaled bands (`/tmp/ref-band{0,1,2}.png`) and derived the still-missing distinct archetypes (procedural,
NOT pixel-copied). New `BladeStyle` controls in `pen.ts`: `maxTurn` (curve-cap override),
`serrateSide` ("edge"|"spine"|"both"), `serratePeriod`. New PROFILES (14 → 19):
- **scimitar** (strong curve, maxTurn π/2.1), **sickle** (khopesh hook, maxTurn π/1.35),
  **bigsaw** (chunky teeth), **spinesaw** (teeth on the back), **barbed** (thorn spikes down both
  sides — post-draw `fillCone` in the blade's own metal; made stubby so `cleanSilhouette` keeps them,
  verified `/tmp/barb-forced.png`).
- 19 profiles × 3 metals (steel/bronze/dark-iron) × guards × grips × pommels → large variety.
  Final sheets `/tmp/blades-final-{light,dark}.png`. tsc exit 0, no debug leftovers.
- [ ] (future, still in gallery) twin/parallel blades; beaded/segmented blade; ring & hook guards/
  pommels; flanged medallion guards; cleaver base-notch; per-blade guard-material match.

### Phase 9 — Axe overhaul (was the weakest weapon)  ✅ done
`axe.ts` rewritten from a single fan bit into a mix-and-match component system (derived from axe
reference art, not pixel-copied):
- **Head shapes:** `fan` (single bit), `bearded` (edge hangs toward the hilt), `broad` (wide fan),
  `double` (symmetric two-bit), `crescent` (radial-band moon blade with tapered horns). Parametric
  `drawFan` (asymmetric top/bottom half-widths in the s-along-haft / d-outward frame) + polar
  `drawCrescent`.
- **Features:** top spike/finial, back pick/spike, notched edge (`notch` carves teeth), gem inset
  (+bloom over the outline).
- **Haft:** wood or dark shaft, leather wrap bands (`drawHaftWrap`), and a butt of either a metal
  end-ring (`drawEndRing`) or a capped pommel; metal head from STEEL/BLUED/BRONZE/DARKIRON + GOLD accent.
- Verified `/tmp/axes-{light,dark}.png` both themes — bearded/broad/double/crescent all read, spikes/
  gems/rings/wraps present, three metals. tsc exit 0.
- [ ] (future) halberd (axe + long top blade), skull/ornate head decos, twin-ring haft butt,
  `drawHaftWrap` uses per-pixel getImageData (fine at 56px, optimise if ever slow).

### Phase 10 — Spear overhaul + blade pommel shrink  ✅ done
- **Blade pommel (recurring "ball too big"):** `pommelRadius` was `pommelLength`-based, ~2–3× the thin
  grip. Now `gripRadius * 0.55` — a knob flush with the handle. Verified user's 4 seeds
  (`l6d0wmZpiGZk9UdJ`, `3nsFj0gDOw0ePet9`, `CdvkbYBgtZzXOHfF`, `ZA7nVI33aTQTze09`) → `/tmp/pommel-fix.png`.
- **Spears rewritten** (`spear.ts`) as a component system from the reference vocabulary:
  - **Head types:** leaf, broadleaf (bulge), winged (boar-spear lugs), glaive (curved single-edge
    naginata), harpoon (backward barbs), needle (thin + fuller). Built on `drawBladeHelper` styles.
  - **Details:** metal ferrule collar at the socket, leather wrap bands down the shaft, butt cap
    (flush-with-shaft, small)/downward spike. Wood or dark haft; gold/steel accents.
  - Verified `/tmp/spears-{light,dark}.png` both themes — clear leaf/winged/glaive/harpoon/needle
    variety, collars + wraps + butts present. tsc exit 0.
- [ ] (future) flaming/crystal fantasy heads; ribbon streamers; ranseur (side prongs) head.

### Phase 11 — Staff overhaul (real "staff feeling")  ✅ done
`staff.ts` rewritten into a head-setting × shaft component system (kept the orb/facet gem renderers):
- **Head settings:** `bare`, `claws` (2–3 gripping prongs), `crescent` (metal moon cradling the gem),
  `halo` (metal ring behind the gem), `wings` (flanking metal wings), `cluster` (central facet + 2
  smaller shards), `collar`. Behind-gem parts drawn first, claw tips over the gem.
- **Shafts:** `straight`, `twisted` (helical light/shadow overlay), `wrapped` (cord grip), `segmented`
  (bead rings). Wood/dark/bone/lacquer materials; gold or steel accents.
- **Extras:** base finial, nature leaves (green cones) on wooden staves, gem glow + sparkles, full gem
  palette (ruby/sapphire/emerald/amethyst/topaz).
- Verified `/tmp/staffs-{light,dark}.png` both themes — halo/claws/crescent/wings/cluster settings,
  twisted + beaded shafts all read; gems glow on dark. tsc exit 0.
- [ ] (future) shepherd's-crook curled top, skull/animal-head finials, ribbon streamers, ankh loop.

### Phase 12 — Hardening pass (reroll→fix, no half-assed designs)  ◑ in progress
Reusable audit harness: `bun scripts/audit.mjs <class> [count]` → labeled `/tmp/audit-<class>.png`
(seeds are the labels, so degenerate rolls are reproducible). Fixes so far:
- **Axes:** floating polar crescents → **concave-edged fans** (horned bits solidly socketed, no gap);
  boosted fan edge contrast (dark neck → bright/spec cutting edge); haft no longer pokes past the head.
- **Spears:** heads were reading as **shovels** — narrowed every head radius + higher taper → sharp
  points; added **partisan** head (two forward side prongs, ranseur-style). Kept pike/leaf/winged/
  glaive/harpoon/needle/broadleaf.
- **Blades:** removed the **sickle** profile (its fast curve made C-hook "bananas" even at a 60° cap);
  scimitar softened to a gradual arc (curve π/95, cap π/3.2). No more bananas in a 40-roll audit.
- **Staffs:** audited 50 — halo/claws/wings/crescent/cluster settings + twisted/beaded shafts all read;
  no slop found. tsc exit 0 throughout.
- **Colour variety (blades):** added `CRYSTALS` ramps (emerald/sapphire/ruby/amethyst) to `palette.ts`
  + `allTones()`; new `BladeStyle.metal` override used by `drawBladeHelper`; `blade.ts` makes ~12% of
  blades a crystal. Verified 60-roll — vivid enchanted blades, snap keeps them saturated, no slop.
- **Axe crescents chunkier:** shorter horns (6–8.5), shallower valley (concave 0.3–0.45), less hollow
  (dInner 0.3) → solid horned bits, no thin scythe slivers.
- [ ] STILL TODO: more axe decos (skull/ornate, halberd top-blade); more spear heads (flame/crystal
  fantasy, forked); more blade types from the 100-sheet (twin/parallel, beaded, flanged); broadleaf
  spears still a touch wide; extend crystal/colour variety to axe/spear/staff metals; keep rerolling
  each class ~80 and fixing outliers.
- **WEARNESS / weathering (user request) — swords + axes:** ✅ done (first pass). `Pen.weather(amount)`
  draws short darker scratch strokes on INTERIOR metal (all-4-neighbours-opaque so it never nibbles the
  silhouette); they snap to the material's shadow tone in `snapToPalette`. Called before `addBorder` in
  blade.ts (`r.floatLow()`) + axe.ts (`r.floatLow()*0.9`) → most lightly worn, a few battered. Reads as
  subtle used-metal without noise. [ ] Future: edge nicks/chips (need ≥2–3px carve or post-outline),
  rust ramp for iron, extend to spears/tridents.

### Phase 12b — Trident hardening  ✅ done
Audit (`/tmp/audit-tridents.png`) showed: 2-prong **bidents** (tuning forks), 5-thin-tine **combs/rakes**,
and **blob heads**. Fixes in `trident.ts`: trident now ALWAYS 3 prongs (no bident); pitchfork 3–4 tines
only; prongs thicker (trident half 1.2–1.7, pitchfork 0.9–1.2) and longer (min 11); ferrule ball shrunk
(`+0.9→+0.3·dscale`) so the head stops blobbing; less pitchfork frequency (0.4→0.3). Re-roll: clean
3-prong tridents + chunky pitchforks; a couple pitchforks still slightly comb-like (acceptable rake).
tsc exit 0.

### Phase 12m — Pennant flag + mid-haft ferrule  ✅ done
- **Spears:** pennant flag — a broad (3–4px) triangular banner via `drawRibbon` pointing OUT from the
  upper shaft (lance decoration), as an alternative to the thin hanging ribbons (~40% when no ribbons).
  sp7 blue, sp8 red.
- **Axes:** mid-haft accent ferrule — a bright metal band (accent colour) girdling the shaft middle
  (~35%). ax13/ax14 gold. Painted only over the haft.
- tsc exit 0.

### Phase 12l — More decoration variety (axes + spears)  ✅ done
User: "not much going on" decoration-wise. Added:
- **Axes:** hanging leather thongs from the socket (short/stubby, NOT the cloth ribbons — WOOD/DARK);
  enamel inlay band (a GOLD/crystal accent stripe across the bit face, painted only over the bit).
- **Spears:** langets (two thin metal reinforcing straps down the shaft from the socket); a gem set
  into the spearhead base.
- Verified `/tmp/audit-{axes,spears}.png` — ax16/ax30/ax39 inlay stripes, ax13/ax23 thongs; sp2/sp16/
  sp39 langets, sp1/sp30/sp34 head gems. tsc exit 0.

### Phase 12k — Forked spear head  ✅ done
New `forked` spear head: the single head + a second tine drawn parallel and offset perpendicular
(diverging slightly) → reads as a two-pronged fork (sp21/sp23/sp33). Added to HEAD_KEYS. tsc exit 0.

### Phase 12j — Staff loop finial + wear on spears/tridents  ✅ done
- Staff `loop` head: an ankh-style metal ring topping the shaft (reuses `drawRingShape`) with a small
  gem (or hollow) inside — no big orb. Weighted 2/11. st10/st11/st16/st27/st35/st39 show it.
- `pen.weather(r.floatLow()*0.8)` added before `addBorder` in spear.ts + trident.ts (subtle on the
  wider metal). tsc exit 0.

### Phase 12i — Axe fuller groove (unique axe flair)  ✅ done
Ribbons stay unique to spears/tridents (user call). Gave axes their own detail: `FanParams.fuller` draws
a dark engraved groove down the centre of the bit (neck → toward edge, not into the bright edge). Enabled
~35% on fan/bearded/broad heads (not with a notched edge). ax1/ax10/ax20/ax24 show it. tsc exit 0.

### Phase 12h — Ribbon quality + variations (user liked ribbons)  ✅ done
Ribbons were flat straight `fillCone` triangles ("child-painted"). New `Pen.drawRibbon()` draws a
FLUTTERING cloth strip: lateral sine wave (grows toward the tip), taper, cross-width shading (one edge
lit → fold shadowed via a twist term), and optional **swallowtail** fork. Shared `ribbonStyle(r,dscale)`
(in spear.ts, imported by trident.ts) picks per-weapon: near-straight-folded / fluttering / swallowtail
banner / strong-flutter. Wired into spear + trident (wider 1.7px so shading reads). `/tmp/audit-{spears,
tridents}.png` — banners now catch light + wave + fork, read as cloth. tsc exit 0.

### Phase 12g — Trident crossbar finials  ✅ done
Ball finials on the crossbar tips (~50%, non-pitchfork) — a classic trident detail. With the crossbar
gem + ribbons from 12f, tridents now read properly decorated. tsc exit 0.

### Phase 12f — Decorations for axes / spears / tridents  ✅ done
- New `RIBBONS` cloth ramps (crimson/blue/leather/tan) in `palette.ts` + `allTones()` → banner streamers
  stay their colour through the snap.
- **Spears:** ribbon streamers hanging from the socket (fan back toward the hilt, ~40%).
- **Tridents:** gem set into the crossbar centre (~30%, non-pitchfork) + ribbon streamers (~35%).
- **Axes:** rivet/bolt studs on the head (2–3 dark `DARK` dots, when no gem, ~40%).
- Verified `/tmp/audit-{spears,tridents,axes}.png` — banners read red/blue, crossbar gems + rivets add
  detail without clutter. tsc exit 0.
- [ ] More still to come (user noted): axe skull/engraving decos, spear flame/forked heads, trident
  barb polish, staff crook/ankh tops, feather fletching.

### Phase 12e — Staff shaft decoration fix  ✅ done
User: the staff "rings" (segmented shaft) were scattered gold bead-blobs down the shaft — cheap vs the
ornate reference staves. Replaced `segmented` with a **bound grip**: a cord wrap framed by a metal
ferrule at each end (st6/st23). Straight shafts now get ≤1 tidy ferrule near the neck (was a 3-ring
ladder). Twisted shafts + gem settings (halo/claws/crescent/wings/cluster) already read well. tsc exit 0.

### Phase 12d — Rust weathering  ✅ done
`RUST` ramp added to `palette.ts` + `allTones()`. `Pen.weather()` now tints a fraction of wear strokes
toward rust (chance = `amount·0.6`) instead of only darkening → heavily-worn weapons corrode, lightly
worn ones just scratch. Rust pixels snap to the RUST tone. Subtle, rare (floatLow), reads as patina.

### Phase 12c — Halberd axe head  ✅ done
Added `halberd` to axe HEADS: a smaller bit (halfTop 3.5–5) + a LONG bladed top spike that reaches the
frame corner (its signature). Halberd heads sit lower (`headDiag` −12..16·dscale) so the top blade has
room. Verified `/tmp/audit-axes.png` (ax4/ax24/ax30/ax40) — clear poleaxe silhouettes distinct from
plain axes. tsc exit 0.

### Phase 13 — Particle FX (10 types)  ✅ done
`src/particles.ts`: 10 seeded particle types — sparkle / ember / frost / spark / mote / leaf / bubble /
blood / holy / ash. Each samples the drawn weapon's opaque pixels and scatters small glowing pixels
NEAR the silhouette (so they belong to it), in the type's own palette + alpha; drawn AFTER the outline
as a light layer (not snapped). Wired: `IconOptions.particles` (`ParticleType`|"random"|"none") → stored
on `Pen` → generator draws them after the weapon (fresh `rng.checkpoint()`); `WeaponIcon` gains a
`particles` prop; types exported from the package index. Verified `/tmp/particles-{dark,light}.png` all
10 read as distinct auras hugging the weapon (best on dark; colored ones read on light too). pkg + web
tsc exit 0.
- **"themed" mode ✅** (`particles: "themed"`): `pickThemedParticle(pen)` samples the weapon's most
  saturated/bright pixel and matches the element — red→ember/blood, green→leaf, blue→frost/bubble,
  gold→holy/ember, grey steel→spark/frost, dark→ash, else sparkle. `/tmp/particles-themed.png`: auras
  auto-match (gold staff→fire, emerald→leaf, ruby→blood, sapphire orb→frost, steel→spark). Wired into
  IconOptions/Pen/generator/WeaponIcon union. pkg + web tsc exit 0.
- [ ] Future: animated variant (raf loop) for a lively preview; UI selector in the icon modal; persist
  a chosen particle on IconConfig if per-skill selection is wanted.

## Log (append per phase: what changed, what the render showed)
- Phase 0: refs + palette extracted. Pack density = ~40–48px char (unit sprites), outline `#161c2e`,
  ~12 colors, cool-grey metal + gold + wood + dark leather. Avatars are promo 4× art, not the ref.
- Phase 1: nativeDim → 40–60. Density now matches pack.
- Phase 2: palette landed. `/tmp/compare-light.png` reads clearly tiny-swords (steel blades, gold
  guards, wood/dark hafts, constrained gems); col-2 sword ≈ warrior reference. Colors 7–27 (was 29–45).
  **Next levers observed:** (a) on dark card `#202020` the `#161c2e` outline vanishes → Phase 3 needs a
  rim/contact-shadow for dark-bg legibility; (b) shading still generates intermediate tones via
  colorLighten/Darken + continuous cone lerp → Phase 4 should snap shading to the ramp's 4 discrete
  tones (also fixes staff's 46-colour glow); (c) some blades are wavy & spears thin → Phase 5 chunkier/
  straighter shapes.
- Phase 3: 2-tone selective outline (lit navy top-left / near-black bottom-right). Depth on light,
  lit-edge rim on dark.
- Phase 4: `snapToPalette()` → exact colours 8–15 (staffs 19), hard cel bands. Matches pack budget.
- Phase 5: blade noise tamed → straight swords + gentle sabers, no noodles.
- **State after this session:** looks strongly tiny-swords on both themes. Remaining polish = live
  Playwright check, optional top-left light vector, optional spear/haft thickening.
- **Verify in main:** `cd packages/pixel-icons && npx tsc --noEmit` (exit 0), then
  `bun scripts/compare.mjs 56` and Read `/tmp/compare-{light,dark}.png`.
