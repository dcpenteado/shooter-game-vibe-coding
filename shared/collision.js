/**
 * Lightweight collision detection: AABB vs convex polygons (SAT)
 * and line-segment intersection for projectiles.
 */

/**
 * SAT test: AABB vs convex polygon
 * Returns { overlapping, mtv: {x,y} } or { overlapping: false }
 */
export function testAABBvsPolygon(aabb, polygon) {
  // aabb: { x, y, w, h } where x,y is center
  // polygon: [{x,y}, ...]
  const aabbVerts = [
    { x: aabb.x - aabb.w / 2, y: aabb.y - aabb.h / 2 },
    { x: aabb.x + aabb.w / 2, y: aabb.y - aabb.h / 2 },
    { x: aabb.x + aabb.w / 2, y: aabb.y + aabb.h / 2 },
    { x: aabb.x - aabb.w / 2, y: aabb.y + aabb.h / 2 },
  ];

  // Collect axes: AABB normals (2) + polygon edge normals
  const axes = [
    { x: 1, y: 0 }, // AABB right
    { x: 0, y: 1 }, // AABB down
  ];

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const edge = { x: polygon[j].x - polygon[i].x, y: polygon[j].y - polygon[i].y };
    const len = Math.sqrt(edge.x * edge.x + edge.y * edge.y);
    if (len < 0.0001) continue;
    axes.push({ x: -edge.y / len, y: edge.x / len }); // perpendicular normal
  }

  let minOverlap = Infinity;
  let mtvAxis = null;

  for (const axis of axes) {
    const projA = projectVerts(aabbVerts, axis);
    const projB = projectVerts(polygon, axis);

    const overlap = Math.min(projA.max - projB.min, projB.max - projA.min);
    if (overlap <= 0) {
      return { overlapping: false };
    }

    if (overlap < minOverlap) {
      minOverlap = overlap;
      mtvAxis = axis;
    }
  }

  // Ensure MTV pushes AABB out of polygon
  const dir = {
    x: aabb.x - polygonCenter(polygon).x,
    y: aabb.y - polygonCenter(polygon).y,
  };
  const dot = dir.x * mtvAxis.x + dir.y * mtvAxis.y;
  const sign = dot < 0 ? -1 : 1;

  return {
    overlapping: true,
    mtv: { x: mtvAxis.x * minOverlap * sign, y: mtvAxis.y * minOverlap * sign },
    normal: { x: mtvAxis.x * sign, y: mtvAxis.y * sign },
  };
}

function projectVerts(verts, axis) {
  let min = Infinity, max = -Infinity;
  for (const v of verts) {
    const p = v.x * axis.x + v.y * axis.y;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

function polygonCenter(poly) {
  let cx = 0, cy = 0;
  for (const v of poly) { cx += v.x; cy += v.y; }
  return { x: cx / poly.length, y: cy / poly.length };
}

/**
 * Line segment intersection (for projectiles)
 * Returns { t, x, y } or null
 */
export function lineSegmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const denom = (dx - cx) * (ay - by) - (ax - bx) * (dy - cy);
  if (Math.abs(denom) < 0.0001) return null;

  const t = ((cx - ax) * (ay - by) - (ax - bx) * (cy - ay)) / denom;
  const u = ((dx - cx) * (cy - ay) - (cx - ax) * (dy - cy)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      t: u,
      x: ax + u * (bx - ax),
      y: ay + u * (by - ay),
    };
  }
  return null;
}

/**
 * Test line segment vs polygon edges
 * Returns closest hit { t, x, y, normal } or null
 */
export function lineVsPolygon(ax, ay, bx, by, polygon) {
  let closest = null;

  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const hit = lineSegmentIntersection(
      ax, ay, bx, by,
      polygon[i].x, polygon[i].y, polygon[j].x, polygon[j].y
    );
    if (hit && (!closest || hit.t < closest.t)) {
      // Compute edge normal
      const ex = polygon[j].x - polygon[i].x;
      const ey = polygon[j].y - polygon[i].y;
      const len = Math.sqrt(ex * ex + ey * ey);
      closest = {
        ...hit,
        normal: { x: -ey / len, y: ex / len },
      };
    }
  }

  return closest;
}

/**
 * Test line segment vs AABB
 * Returns { t, x, y } or null
 */
export function lineVsAABB(ax, ay, bx, by, aabb) {
  const hw = aabb.w / 2;
  const hh = aabb.h / 2;
  const left = aabb.x - hw;
  const right = aabb.x + hw;
  const top = aabb.y - hh;
  const bottom = aabb.y + hh;

  const edges = [
    [left, top, right, top],       // top
    [right, top, right, bottom],   // right
    [right, bottom, left, bottom], // bottom
    [left, bottom, left, top],     // left
  ];

  let closest = null;
  for (const [cx, cy, dx, dy] of edges) {
    const hit = lineSegmentIntersection(ax, ay, bx, by, cx, cy, dx, dy);
    if (hit && (!closest || hit.t < closest.t)) {
      closest = hit;
    }
  }

  return closest;
}

/**
 * Resolve all collisions for a player AABB against map polygons
 */
export function resolveMapCollisions(entity, mapPolygons) {
  const aabb = {
    x: entity.x,
    y: entity.y,
    w: entity.width,
    h: entity.height,
  };

  let grounded = false;
  let hitX = false;
  let hitY = false;

  // Multiple iterations to resolve stacking collisions
  for (let iter = 0; iter < 4; iter++) {
    let deepest = null;
    let deepestOverlap = 0;

    for (const poly of mapPolygons) {
      const result = testAABBvsPolygon(
        { x: entity.x, y: entity.y, w: entity.width, h: entity.height },
        poly.vertices
      );

      if (result.overlapping) {
        const overlap = Math.abs(result.mtv.x) + Math.abs(result.mtv.y);
        if (overlap > deepestOverlap) {
          deepestOverlap = overlap;
          deepest = result;
        }
      }
    }

    if (!deepest) break;

    entity.x += deepest.mtv.x;
    entity.y += deepest.mtv.y;

    // Determine what kind of collision
    if (Math.abs(deepest.normal.y) > 0.5) {
      if (deepest.normal.y < 0) grounded = true; // normal points up = ground
      hitY = true;
    }
    if (Math.abs(deepest.normal.x) > 0.5) {
      hitX = true;
    }
  }

  return { grounded, hitX, hitY };
}
