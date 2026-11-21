// Convert the SA provinces GeoJSON into projected SVG paths keyed by province
// code, so the map renders as plain <path> elements (no runtime geo library).
import fs from "node:fs";
import { geoMercator, geoPath } from "d3-geo";

const NAME2CODE = {
  "Eastern Cape": "EC", "Free State": "FS", "Gauteng": "GP",
  "KwaZulu-Natal": "KZN", "Limpopo": "LP", "Mpumalanga": "MP",
  "North West": "NW", "Nothern Cape": "NC", "Northern Cape": "NC",
  "Western Cape": "WC",
};

const W = 820, H = 720;
const geo = JSON.parse(fs.readFileSync(new URL("./sa_prov.geojson", import.meta.url)));

// SA owns the Prince Edward Islands (~-46°S, 37°E) which blow up the bounds and
// collapse the mainland to a dot. Keep only polygons inside the mainland bbox.
const inBox = ([lon, lat]) => lon >= 14 && lon <= 34 && lat >= -36 && lat <= -21;
for (const f of geo.features) {
  const g = f.geometry;
  if (g.type === "MultiPolygon") {
    const kept = g.coordinates.filter((poly) => inBox(poly[0][0]));
    if (kept.length) g.coordinates = kept;
  }
}

// geoBoundaries rings wind the wrong way for d3-geo's spherical convention,
// which makes each polygon read as "whole globe minus the province". Rewind to
// the GeoJSON right-hand rule: exterior rings CCW (area > 0), holes CW.
const ringArea = (r) => {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return s / 2;
};
const fixRing = (r, wantCCW) => { if ((ringArea(r) > 0) !== wantCCW) r.reverse(); };
// d3-geo wants exterior rings clockwise (area < 0), holes counter-clockwise.
const fixPoly = (poly) => poly.forEach((ring, i) => fixRing(ring, i !== 0));
for (const f of geo.features) {
  const g = f.geometry;
  if (g.type === "Polygon") fixPoly(g.coordinates);
  else if (g.type === "MultiPolygon") g.coordinates.forEach(fixPoly);
}

const projection = geoMercator().fitSize([W, H], geo);
const path = geoPath(projection);

const provinces = geo.features.map((f) => {
  const name = f.properties.shapeName;
  const [cx, cy] = path.centroid(f);
  return { code: NAME2CODE[name] ?? name, name, d: path(f), cx: Math.round(cx), cy: Math.round(cy) };
});

fs.writeFileSync(
  new URL("../src/sa-provinces.json", import.meta.url),
  JSON.stringify({ width: W, height: H, provinces }, null, 0));
console.log(`wrote ${provinces.length} provinces ->`, provinces.map((p) => p.code).join(" "));
