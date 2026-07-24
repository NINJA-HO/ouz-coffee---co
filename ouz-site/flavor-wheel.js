// ==================== OUZ COFFEE & CO. — FULL FLAVOR WHEEL ====================
// Standalone script for the homepage's "Our Flavor Wheel" section. Renders
// the complete 3-ring Coffee Taster's Flavor Wheel as real SVG, generated
// from the data tree below — every single term (top-level family,
// subcategory, and individual descriptor) gets its own label directly on
// the wheel, matching the full density of the original artwork.
//
// Expects these elements to already exist in the page:
//   <svg id="flavorWheelSvg" viewBox="0 0 640 640">...</svg>
//   #panelTag, #panelTitle, #panelNotes, #panelDesc  (the side panel)
//
// Data transcribed by hand from the Ouz Coffee & Co. flavor wheel graphic.
// If any term or grouping looks wrong, it's all centralized right here in
// FLAVOR_WHEEL_DATA — just fix the entry, nothing else needs to change.

(function () {
  const FLAVOR_WHEEL_DATA = [
    {
      name: "Fruity", color: "#c8202c",
      desc: "Bright, juicy fruit character — berries, stone fruit, dried fruit, and citrus — most common in naturally processed or lighter-roasted beans.",
      children: [
        { name: "Berry", desc: "Blackberry, raspberry, blueberry, strawberry — juicy, jammy fruit notes.", children: ["Blackberry", "Raspberry", "Blueberry", "Strawberry"] },
        { name: "Dried Fruit", desc: "Raisin and prune — concentrated, sweet dried-fruit character.", children: ["Raisin", "Prune"] },
        { name: "Other Fruit", desc: "Stone fruit, pome fruit, and tropical notes.", children: ["Coconut", "Cherry", "Pomegranate", "Pineapple", "Grape", "Apple", "Peach", "Pear"] },
        { name: "Citrus Fruit", desc: "Grapefruit, orange, lemon, and lime — bright, zesty acidity.", children: ["Grapefruit", "Orange", "Lemon", "Lime"] },
      ],
    },
    {
      name: "Sour/Fermented", color: "#c9a227",
      desc: "Sharp, tangy, sometimes winey notes from fermentation and acidity — can read as lively or as a defect depending on intensity.",
      children: [
        { name: "Sour", desc: "Sharp acidic notes, from bright citric acid to more medicinal or cheesy notes.", children: ["Sour Aromatics", "Acetic Acid", "Butyric Acid", "Isovaleric Acid", "Citric Acid", "Malic Acid"] },
        { name: "Alcohol/Fermented", desc: "Winey, whiskey-like, or overripe notes from extended fermentation.", children: ["Winey", "Whiskey", "Fermented", "Overripe"] },
      ],
    },
    {
      name: "Green/Vegetative", color: "#3f7d3a",
      desc: "Grassy, raw, or vegetal notes that usually point to underripe cherries or a very light roast.",
      children: [
        { name: "Olive Oil", desc: "A smooth, savory, slightly oily note." },
        { name: "Raw", desc: "An underdeveloped, grain-like rawness." },
        { name: "Green/Vegetative", desc: "Fresh-cut grass, hay, and herbal notes.", children: ["Under-ripe", "Peapod", "Fresh", "Dark Green", "Vegetative", "Hay-like", "Herb-like"] },
        { name: "Beany", desc: "A raw, starchy, legume-like note." },
      ],
    },
    {
      name: "Other", color: "#7a8a99",
      desc: "Notes cuppers watch for that usually signal aging, storage issues, or off-flavors rather than a flavor to chase.",
      children: [
        { name: "Papery/Musty", desc: "Stale, cardboard-like, or musty notes usually from aging or poor storage.", children: ["Stale", "Cardboard", "Musty/Dusty", "Moldy/Damp", "Musty/Earthy", "Animalic", "Meaty Brothy", "Phenolic", "Bitter"] },
        { name: "Chemical", desc: "Rubber, petroleum, or medicinal notes — usually a defect.", children: ["Rubber", "Skunky", "Petroleum", "Medicinal"] },
      ],
    },
    {
      name: "Roasted", color: "#6b4a34",
      desc: "Deep, dry flavors from the roasting process itself — cocoa, tobacco, and cereal notes that build with a darker roast.",
      children: [
        { name: "Pipe Tobacco", desc: "A dry, aromatic pipe-tobacco character." },
        { name: "Tobacco", desc: "Dry, leafy tobacco note." },
        { name: "Burnt", desc: "Ashy, acrid, smoky notes from a darker roast.", children: ["Acrid", "Ashy", "Smoky", "Brown, Roast"] },
        { name: "Cereal", desc: "Grain and malt notes, like dry cereal or toast.", children: ["Grain", "Malt"] },
      ],
    },
    {
      name: "Spices", color: "#8f2a44",
      desc: "Warm, aromatic spice notes — pepper, brown spice, and pungency — that add complexity to the cup.",
      children: [
        { name: "Pungent", desc: "A sharp, assertive spice-forward note." },
        { name: "Pepper", desc: "A peppery, slightly sharp spice note." },
        { name: "Brown Spice", desc: "Warm baking spices — anise, nutmeg, cinnamon, clove.", children: ["Anise", "Nutmeg", "Cinnamon", "Clove"] },
      ],
    },
    {
      name: "Nutty/Cocoa", color: "#8a5a2e",
      desc: "Rounded, comforting notes of nuts and cocoa, common in medium roasts.",
      children: [
        { name: "Nutty", desc: "Peanuts, hazelnut, almond — roasted nut character.", children: ["Peanuts", "Hazelnut", "Almond"] },
        { name: "Cocoa", desc: "Chocolate and dark chocolate notes.", children: ["Chocolate", "Dark Chocolate"] },
      ],
    },
    {
      name: "Sweet", color: "#c98a9e",
      desc: "Rounded sweetness — brown sugar, vanilla, honey — that becomes more pronounced as a coffee cools in the cup.",
      children: [
        { name: "Brown Sugar", desc: "Molasses, maple syrup, caramelized sugar, and honey.", children: ["Molasses", "Maple Syrup", "Caramelized", "Honey"] },
        { name: "Vanilla", desc: "Soft, creamy vanilla sweetness." },
        { name: "Vanillin", desc: "A sweet, vanilla-like aromatic note." },
        { name: "Overall Sweet", desc: "General perceived sweetness in the cup." },
        { name: "Sweet Aromatics", desc: "Fragrant, sweet-smelling top notes." },
      ],
    },
    {
      name: "Floral", color: "#c23b7c",
      desc: "Delicate, fragrant notes common in washed, high-altitude coffees.",
      children: [
        { name: "Black Tea", desc: "A delicate, tannic, tea-like note." },
        { name: "Floral", desc: "Chamomile and rose — light, fragrant floral notes.", children: ["Chamomile", "Rose"] },
      ],
    },
  ];

  const FALLBACK_DESC = "One of the specific tasting notes we listen for within this family during cupping.";

  // ---- Normalize + compute weights (leaf count) recursively ----
  function normalizeNode(node) {
    if (typeof node === "string") node = { name: node };
    if (node.children && node.children.length) {
      node.children = node.children.map(normalizeNode);
      node._weight = node.children.reduce((sum, c) => sum + c._weight, 0);
    } else {
      node._weight = 1;
    }
    return node;
  }
  FLAVOR_WHEEL_DATA.forEach(normalizeNode);

  // ---- Layout: assign startAngle/endAngle to every node, proportional to weight ----
  function layout(nodes, startAngle, endAngle) {
    const total = nodes.reduce((sum, n) => sum + n._weight, 0);
    let cursor = startAngle;
    nodes.forEach((n) => {
      const span = (endAngle - startAngle) * (n._weight / total);
      n.startAngle = cursor;
      n.endAngle = cursor + span;
      cursor += span;
      if (n.children && n.children.length) {
        layout(n.children, n.startAngle, n.endAngle);
      }
    });
  }
  layout(FLAVOR_WHEEL_DATA, -90, 270);

  // ---- Geometry helpers ----
  // Larger canvas + wider outer band than the compact version, since every
  // leaf term now needs its own legible label.
  const CX = 320, CY = 320;
  const R0 = 58, R1 = 128, R2 = 190, R3 = 300;

  function polarToXY(r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }
  function arcPath(rInner, rOuter, startAngle, endAngle) {
    const a0 = polarToXY(rOuter, endAngle);
    const a1 = polarToXY(rOuter, startAngle);
    const b0 = polarToXY(rInner, endAngle);
    const b1 = polarToXY(rInner, startAngle);
    const large = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M", a0.x, a0.y,
      "A", rOuter, rOuter, 0, large, 0, a1.x, a1.y,
      "L", b1.x, b1.y,
      "A", rInner, rInner, 0, large, 1, b0.x, b0.y,
      "Z",
    ].join(" ");
  }
  function lighten(hex, pct) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + Math.round((255 - (num >> 16)) * pct);
    let g = ((num >> 8) & 0xff) + Math.round((255 - ((num >> 8) & 0xff)) * pct);
    let b = (num & 0xff) + Math.round((255 - (num & 0xff)) * pct);
    r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
    return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }
  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    return el;
  }
  // Places a label at mid-radius/mid-angle, rotated to read radially
  // (flipped upright on the left/bottom half so nothing renders upside down).
  function radialLabel(text, className, rMid, angle, darkFill) {
    const pos = polarToXY(rMid, angle);
    let rotate = angle;
    if (angle > 90 && angle < 270) rotate += 180;
    const el = svgEl("text", {
      class: className,
      x: pos.x, y: pos.y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      fill: darkFill ? "#221a16" : "#fff",
      transform: `rotate(${rotate}, ${pos.x}, ${pos.y})`,
    });
    el.textContent = text;
    return el;
  }

  function init() {
    const svg = document.getElementById("flavorWheelSvg");
    if (!svg) return;
    svg.setAttribute("viewBox", `0 0 ${CX * 2} ${CY * 2}`);

    let selectedEl = null;

    function selectNode(node, breadcrumb, el) {
      if (selectedEl) selectedEl.classList.remove("selected");
      if (el) { el.classList.add("selected"); selectedEl = el; }

      const tagEl = document.getElementById("panelTag");
      const titleEl = document.getElementById("panelTitle");
      const notesEl = document.getElementById("panelNotes");
      const descEl = document.getElementById("panelDesc");
      if (!tagEl) return;

      tagEl.textContent = breadcrumb.length > 1 ? breadcrumb.slice(0, -1).join(" › ") : "Category";
      titleEl.textContent = node.name;
      const childNames = (node.children || []).map((c) => c.name);
      notesEl.textContent = childNames.length
        ? childNames.join(" · ")
        : breadcrumb.slice(0, -1).join(" › ") || node.name;
      descEl.textContent = node.desc || FALLBACK_DESC;
    }

    FLAVOR_WHEEL_DATA.forEach((cat, i) => {
      // ---- Level 1 ----
      const path = svgEl("path", {
        d: arcPath(R0, R1, cat.startAngle, cat.endAngle),
        fill: cat.color,
        class: "flavor-wedge",
      });
      path.addEventListener("click", () => selectNode(cat, [cat.name], path));
      svg.appendChild(path);

      const mid = (cat.startAngle + cat.endAngle) / 2;
      svg.appendChild(radialLabel(cat.name, "flavor-label-l1", (R0 + R1) / 2, mid, false));

      if (i === 0) selectNode(cat, [cat.name], path); // default selection: Fruity

      // ---- Level 2 ----
      (cat.children || []).forEach((sub) => {
        const hasL3 = sub.children && sub.children.length;
        const outerR = hasL3 ? R2 : R3;
        const subPath = svgEl("path", {
          d: arcPath(R1, outerR, sub.startAngle, sub.endAngle),
          fill: lighten(cat.color, 0.2),
          class: "flavor-wedge",
        });
        subPath.addEventListener("click", () => selectNode(sub, [cat.name, sub.name], subPath));
        svg.appendChild(subPath);

        const subMid = (sub.startAngle + sub.endAngle) / 2;
        svg.appendChild(radialLabel(sub.name, "flavor-label-l2", (R1 + outerR) / 2, subMid, false));

        // ---- Level 3 — every leaf gets its own wedge AND label ----
        if (hasL3) {
          sub.children.forEach((leaf) => {
            const leafPath = svgEl("path", {
              d: arcPath(R2, R3, leaf.startAngle, leaf.endAngle),
              fill: lighten(cat.color, 0.55),
              class: "flavor-wedge",
            });
            leafPath.addEventListener("click", () =>
              selectNode(leaf, [cat.name, sub.name, leaf.name], leafPath)
            );
            svg.appendChild(leafPath);

            const leafMid = (leaf.startAngle + leaf.endAngle) / 2;
            svg.appendChild(radialLabel(leaf.name, "flavor-label-l3", (R2 + R3) / 2 + 4, leafMid, true));
          });
        }
      });
    });

    // ---- Magnifier lens (desktop hover AND mobile touch) ----
    // Clones the fully-rendered SVG into a small circular lens that
    // follows the cursor/finger, showing a zoomed-in view of whatever's
    // underneath — makes the dense outer-ring text actually readable
    // without needing to tap each term individually. Click-through still
    // works normally since the lens has pointer-events: none, so tapping
    // a wedge still selects it exactly as before.
    //
    // Every dimension/position here is set via inline style.cssText
    // rather than CSS classes, so it can never be affected by any other
    // rule elsewhere on the page, regardless of specificity.
    const holder = document.getElementById("wheelHolderSvg");
    if (holder) {
      const ZOOM = 2.6;
      const LENS_SIZE = 200;

      const lens = document.createElement("div");
      lens.style.cssText = [
        "position:absolute",
        "width:" + LENS_SIZE + "px",
        "height:" + LENS_SIZE + "px",
        "border-radius:50%",
        "border:4px solid #fff",
        "box-shadow:0 10px 30px rgba(0,0,0,0.4)",
        "overflow:hidden",
        "pointer-events:none",
        "display:none",
        "z-index:10",
        "background:#221a16",
        "top:0",
        "left:0",
      ].join(";");

      const lensInner = document.createElement("div");
      lensInner.style.cssText = "position:absolute;top:0;left:0;";
      lens.appendChild(lensInner);
      holder.appendChild(lens);

      function refreshLensContent() {
        lensInner.innerHTML = "";
        const clone = svg.cloneNode(true);
        clone.removeAttribute("id");
        clone.style.cssText = "display:block;width:100%;height:100%;";
        lensInner.appendChild(clone);
      }

      function positionLensAt(clientX, clientY) {
        const rect = holder.getBoundingClientRect();
        const relX = (clientX - rect.left) / rect.width;
        const relY = (clientY - rect.top) / rect.height;
        if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
          lens.style.display = "none";
          return;
        }
        lens.style.display = "block";

        const cursorX = clientX - rect.left;
        const cursorY = clientY - rect.top;
        const GAP = 18;

        // Sit above the cursor/finger by default; if there isn't room
        // (near the top of the wheel), show below instead.
        let lensTop = cursorY - LENS_SIZE - GAP;
        if (lensTop < 0) lensTop = cursorY + GAP;

        lens.style.left = cursorX - LENS_SIZE / 2 + "px";
        lens.style.top = lensTop + "px";

        const innerSize = Math.round(rect.width * ZOOM);
        lensInner.style.width = innerSize + "px";
        lensInner.style.height = innerSize + "px";
        lensInner.style.left = Math.round(-(relX * innerSize) + LENS_SIZE / 2) + "px";
        lensInner.style.top = Math.round(-(relY * innerSize) + LENS_SIZE / 2) + "px";
      }

      // ---- Desktop: hover with the mouse ----
      holder.addEventListener("mouseenter", function () {
        refreshLensContent();
      });
      holder.addEventListener("mousemove", function (e) {
        positionLensAt(e.clientX, e.clientY);
      });
      holder.addEventListener("mouseleave", function () {
        lens.style.display = "none";
      });

      // ---- Mobile: press and drag a finger to magnify, same as hovering.
      // touchmove specifically calls preventDefault() so the page doesn't
      // scroll underneath while dragging over the wheel — touchstart and
      // touchend stay passive (no scrolling to prevent there), and the
      // normal tap (click) event still fires for a quick tap, so tap-to-
      // select keeps working exactly as before.
      holder.addEventListener(
        "touchstart",
        function (e) {
          refreshLensContent();
          var t = e.touches[0];
          if (t) positionLensAt(t.clientX, t.clientY);
        },
        { passive: true }
      );
      holder.addEventListener(
        "touchmove",
        function (e) {
          e.preventDefault();
          var t = e.touches[0];
          if (t) positionLensAt(t.clientX, t.clientY);
        },
        { passive: false }
      );
      holder.addEventListener(
        "touchend",
        function () {
          lens.style.display = "none";
        },
        { passive: true }
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();