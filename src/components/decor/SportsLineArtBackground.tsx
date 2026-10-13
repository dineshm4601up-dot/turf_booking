/**
 * Purely decorative sports line-art covering the full page, edge to edge,
 * as a tiled background image -- not a handful of discretely positioned
 * icons. Discrete icons (the previous approach) left most of the page
 * visibly blank no matter how many were added, because a `fixed` layer has
 * no way to know where a given page's content gaps actually fall as it
 * scrolls; a repeating image guarantees there's never a blank patch,
 * since it fills the plane uniformly regardless of what content sits on
 * top of it.
 *
 * `public/sports-pattern.svg` is the repeat unit: a 420x420 tile scattering
 * cricket ball/stumps/helmet/bat, a football, and a field-markings motif at
 * varied sizes and rotations (not a regular grid), drawn as thin outline
 * strokes in the brand green. The tile's own stroke is fully opaque
 * (`stroke="#16a352"`, no opacity baked in) so this component's `opacity`
 * class is the one place controlling how subtle the final result reads --
 * turning it up or down is a one-line change here, no SVG edits needed.
 *
 * `fixed inset-0 -z-10`: the standard "paints above the body background,
 * below every real (non-positioned) page element" pattern -- it can never
 * land on top of or intercept content. `pointer-events-none` and
 * `aria-hidden` mean it can never block a click/tap/keyboard interaction or
 * be announced to screen readers; it carries no information.
 *
 * Reused as-is (not reimplemented per page) on Home, the Book Slot page,
 * and My Bookings -- see each page's own import of this component.
 */
export function SportsLineArtBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 opacity-[0.18]"
      style={{
        backgroundImage: "url(/sports-pattern.svg)",
        backgroundRepeat: "repeat",
        backgroundSize: "210px 210px",
      }}
    />
  );
}
