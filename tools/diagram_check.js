/* Mechanical check of rendered Mermaid diagrams. Not a substitute for looking at them.

   Use: open the built page in a real browser, wait until the diagrams have rendered, then
   evaluate   (<this file's expression>)(document)   (inside an iframe: iframe.contentDocument).
   It returns one record per diagram that has a problem; an empty list means no mechanical problem,
   never "readable". Every diagram is also snapshotted and looked at (references/diagram-quality.md).

   Reports: a diagram that did not render, one wider than its column (it needs a new layout, not a
   scrollbar), labels whose boxes overlap or run together, edge labels lying over a node shape, and an
   edge line crossing a label that is not its own. Wait until every diagram has finished rendering
   before evaluating it. */
(doc => {
  const out = [];
  const R = e => e.getBoundingClientRect();
  // Boxes count as overlapping only when a real share of the smaller one is covered; the stacked
  // lines of one wrapped label touch at their edges and are not an overlap.
  const hit = (a, b, tol = 2) => {
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ix <= tol || iy <= tol) return false;
    return ix * iy >= 0.25 * Math.min(a.width * a.height, b.width * b.height);
  };
  [...doc.querySelectorAll('pre.mermaid, pre.diagram')].forEach((n, i) => {
    const svg = n.querySelector('svg');
    const rec = { index: i, problems: [] };
    if (!svg) { rec.problems.push('not rendered'); out.push(rec); return; }
    const width = R(svg).width, column = n.clientWidth;
    if (width > column + 4) rec.problems.push(`wider than its column (${Math.round(width)} > ${column})`);
    const boxes = [];
    svg.querySelectorAll('text, foreignObject').forEach(t => {
      const text = (t.textContent || '').trim();
      if (!text) return;
      if (t.tagName === 'text' && t.closest('foreignObject')) return;
      const r = R(t);
      if (r.width === 0 || r.height === 0) return;
      boxes.push({ el: t, r, text, owner: t.closest('g.node, g.edgeLabel, g.cluster, g.actor, g.label') });
    });
    const shapes = [...svg.querySelectorAll('g.node rect, g.node polygon, g.node circle, g.node path.label-container, rect.actor, .note rect')]
      .map(s => ({ el: s, r: R(s), owner: s.closest('g.node, g.actor') }));
    const seen = new Set();
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A.owner && A.owner === B.owner) continue;
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (hit(A.r, B.r)) {
        const k = A.text + '|' + B.text;
        if (!seen.has(k)) { seen.add(k); rec.problems.push(`labels overlap: "${A.text.slice(0, 40)}" / "${B.text.slice(0, 40)}"`); }
      }
    }
    for (const A of boxes.filter(x => x.owner && x.owner.matches('g.edgeLabel, g.label'))) for (const S of shapes) {
      if (S.owner && A.owner && S.owner.contains(A.el)) continue;
      if (hit(A.r, S.r, 4)) {
        const k = A.text + '|shape';
        if (!seen.has(k)) { seen.add(k); rec.problems.push(`label over a node shape: "${A.text.slice(0, 40)}"`); }
      }
    }
    // Labels that run together: same row, nearly no gap between their boxes.
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A.owner && A.owner === B.owner) continue;
      const rows = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      const gap = Math.max(A.r.left, B.r.left) - Math.min(A.r.right, B.r.right);
      if (rows > 0.5 * Math.min(A.r.height, B.r.height) && gap < 4 && gap > -2) {
        const k = A.text + '||' + B.text;
        if (!seen.has(k)) { seen.add(k); rec.problems.push(`labels run together: "${A.text.slice(0, 40)}" / "${B.text.slice(0, 40)}"`); }
      }
    }
    // Edge lines crossing a label that is not their own (a line's own label sits near its midpoint).
    const labelBoxes = boxes.filter(x => x.el.closest('g.edgeLabel') || x.el.matches('text.messageText'));
    svg.querySelectorAll('path.flowchart-link, path.transition, path.messageLine0, path.messageLine1, line.messageLine0, line.messageLine1, g.edgePaths path').forEach(path => {
      if (!path.getTotalLength || !path.getScreenCTM) return;
      const len = path.getTotalLength(); if (!len) return;
      const m = path.getScreenCTM();
      const at = d => { const q = path.getPointAtLength(d); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
      const mid = at(len / 2);
      const own = labelBoxes.reduce((best, c) => {
        const dx = (c.r.left + c.r.right) / 2 - mid.x, dy = (c.r.top + c.r.bottom) / 2 - mid.y;
        const d = dx * dx + dy * dy; return !best || d < best.d ? { c, d } : best;
      }, null);
      for (const L of labelBoxes) {
        if (own && L === own.c) continue;
        for (let t = 0; t <= 1; t += 0.02) {
          const q = at(len * t);
          if (q.x > L.r.left + 3 && q.x < L.r.right - 3 && q.y > L.r.top + 3 && q.y < L.r.bottom - 3) {
            const k = 'line|' + L.text;
            if (!seen.has(k)) { seen.add(k); rec.problems.push(`an edge line crosses the label "${L.text.slice(0, 40)}"`); }
            break;
          }
        }
      }
    });
    out.push(rec);
  });
  return out.filter(r => r.problems.length);
})
