import { Suspense } from "react";
import { PlanetGalleryView } from "./planet-gallery-view";

export default function PlanetGalleryPage() {
  // Suspense boundary is required by `useSearchParams()` in PlanetGalleryView,
  // not a real loading window — fallback stays empty.
  return (
    <Suspense fallback={null}>
      <PlanetGalleryView />
    </Suspense>
  );
}
