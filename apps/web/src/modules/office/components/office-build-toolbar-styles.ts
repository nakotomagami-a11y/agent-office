/* Complex gradients / multi-layer shadows — expressed as constants because
   Tailwind's JIT collapses multi-value shadow arbitraries. Simple token colours
   still use Tailwind classes (text-acc, bg-bg-2, …) in the markup. */
export const ACC_GRAD = "linear-gradient(180deg, color-mix(in srgb, var(--acc) 88%, #fff), var(--acc))";
export const GEN_SHADOW =
  "0 5px 16px -4px color-mix(in srgb, var(--acc) 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.26)";
