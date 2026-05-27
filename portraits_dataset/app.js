const baseImages = ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"];

let portraits = [];

const knownPortraits = [
  { id: "albert_einstein", images: baseImages },
  { id: "barack_obama", images: baseImages },
  { id: "benjamin_netanyahu", images: baseImages },
  { id: "christiano_ronaldo", images: baseImages },
  { id: "david_ben_gurion", images: baseImages },
  { id: "donald_trump", images: baseImages },
  { id: "elvis", images: baseImages },
  { id: "john_lennon", images: baseImages },
  { id: "lionel_messi", images: baseImages },
];

const drawableSelector = "path,circle,ellipse,line,rect,polygon,polyline";
const svgNamespace = "http://www.w3.org/2000/svg";

const elements = {
  componentList: document.querySelector("#componentList"),
  filterTabs: document.querySelectorAll("[data-filter]"),
  imageDrawer: document.querySelector("#imageDrawer"),
  imageDrawerToggle: document.querySelector("#imageDrawerToggle"),
  imageCount: document.querySelector("#imageCount"),
  portraitCount: document.querySelector("#portraitCount"),
  portraitNav: document.querySelector("#portraitNav"),
  portraitTitle: document.querySelector("#portraitTitle"),
  referenceGrid: document.querySelector("#referenceGrid"),
  redoButton: document.querySelector("#redoButton"),
  svgMount: document.querySelector("#svgMount"),
  undoButton: document.querySelector("#undoButton"),
  visibleStatus: document.querySelector("#visibleStatus"),
};

const state = {
  activeId: "",
  components: [],
  filter: "all",
  groups: [],
  imagesRevealed: false,
  loadToken: 0,
  redoStack: [],
  undoStack: [],
};

async function initializeApp() {
  portraits = await discoverPortraits();
  renderPortraitNav();
  bindGlobalControls();
  loadPortrait(window.location.hash.slice(1) || portraits[0].publicId);
}

async function discoverPortraits() {
  const folderIds = await discoverDirectoryFolders("data/");
  if (!folderIds.length) return anonymizePortraits(knownPortraits);

  const discovered = await Promise.all(
    folderIds.map(async (id) => {
      const images = await discoverFolderImages(id);
      return {
        id,
        images: visibleImagesFor(images.length ? images : fallbackImagesFor(id)),
      };
    }),
  );

  return anonymizePortraits(discovered.sort((a, b) => a.id.localeCompare(b.id)));
}

async function discoverDirectoryFolders(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) return [];
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const baseUrl = new URL(response.url);
    const basePath = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;

    return unique(
      [...doc.querySelectorAll("a")]
        .map((anchor) => directChildPath(anchor.getAttribute("href"), response.url, basePath))
        .filter((item) => item.endsWith("/"))
        .map((item) => decodeURIComponent(item.slice(0, -1)))
        .filter((item) => item && !item.startsWith(".")),
    );
  } catch {
    return [];
  }
}

async function discoverFolderImages(id) {
  try {
    const response = await fetch(`data/${id}/`);
    if (!response.ok) return [];
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const baseUrl = new URL(response.url);
    const basePath = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;

    return sortImageNames(
      unique(
        [...doc.querySelectorAll("a")]
          .map((anchor) => directChildPath(anchor.getAttribute("href"), response.url, basePath))
          .filter((item) => /\.jpe?g$/i.test(item))
          .map((item) => decodeURIComponent(item)),
      ),
    );
  } catch {
    return [];
  }
}

function directChildPath(href, responseUrl, basePath) {
  if (!href) return "";

  const url = new URL(href, responseUrl);
  if (url.origin !== window.location.origin) return "";
  if (!url.pathname.startsWith(basePath) || url.pathname === basePath) return "";

  const childPath = url.pathname.slice(basePath.length);
  const parts = childPath.split("/").filter(Boolean);
  if (parts.length !== 1) return "";
  return childPath;
}

function sortImageNames(images) {
  return [...images].sort((a, b) => {
    const aNumber = Number.parseInt(a, 10);
    const bNumber = Number.parseInt(b, 10);
    const aIsNumber = Number.isFinite(aNumber);
    const bIsNumber = Number.isFinite(bNumber);

    if (aIsNumber && bIsNumber) return aNumber - bNumber;
    if (aIsNumber) return -1;
    if (bIsNumber) return 1;
    return a.localeCompare(b);
  });
}

function fallbackImagesFor(id) {
  return visibleImagesFor(knownPortraits.find((portrait) => portrait.id === id)?.images ?? baseImages);
}

function visibleImagesFor(images) {
  return sortImageNames(
    images.filter((imageName) => {
      const normalized = imageName.toLowerCase();
      return normalized !== "reference.jpg" && /^[1-5]\.jpe?g$/i.test(normalized);
    }),
  ).slice(0, 5);
}

function anonymizePortraits(items) {
  return items.map((portrait, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      ...portrait,
      publicId: `subject-${number}`,
      title: `Subject ${number}`,
      images: visibleImagesFor(portrait.images),
    };
  });
}

function unique(items) {
  return [...new Set(items)];
}

function renderPortraitNav() {
  elements.portraitCount.textContent = `${portraits.length} portraits`;
  elements.portraitNav.replaceChildren(
    ...portraits.map((portrait) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = portrait.title;
      button.dataset.portraitId = portrait.publicId;
      button.addEventListener("click", () => {
        if (window.location.hash === `#${portrait.publicId}`) {
          loadPortrait(portrait.publicId);
          return;
        }
        window.location.hash = portrait.publicId;
      });
      return button;
    }),
  );
}

async function loadPortrait(id) {
  const portrait = portraits.find((item) => item.publicId === id || item.id === id) ?? portraits[0];
  const token = ++state.loadToken;

  state.activeId = portrait.publicId;
  state.components = [];
  state.groups = [];
  clearVisibilityHistory();
  updateActiveNav();
  elements.portraitTitle.textContent = portrait.title;
  elements.visibleStatus.textContent = "";
  elements.componentList.replaceChildren();
  elements.svgMount.innerHTML = '<p class="loading-state">Loading sketch</p>';
  updateImageDrawer(portrait);

  try {
    const response = await fetch(`data/${portrait.id}/sketch.svg`);
    if (!response.ok) {
      throw new Error(`Could not load sketch.svg (${response.status})`);
    }

    const svgText = await response.text();
    if (token !== state.loadToken) return;

    const svg = parseSvg(svgText, portrait.title);
    elements.svgMount.replaceChildren(svg);
    registerComponents(svg);
    renderComponentList();
    updateStatus();
    updateHistoryControls();
  } catch (error) {
    if (token !== state.loadToken) return;
    elements.svgMount.innerHTML = `<p class="error-state">${error.message}</p>`;
  }
}

function parseSvg(svgText, title) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("The SVG could not be parsed");
  }

  doc.querySelectorAll("script, foreignObject").forEach((node) => node.remove());

  const svg = doc.documentElement;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${title} sketch`);
  svg.setAttribute("focusable", "false");
  return svg;
}

function registerComponents(svg) {
  const drawables = [...svg.querySelectorAll(drawableSelector)];
  const groupsByElement = new Map();
  const ungrouped = {
    element: null,
    id: "group-ungrouped",
    index: 0,
    label: "Ungrouped",
    components: [],
  };

  state.components = drawables.map((element, index) => {
    const kind = getComponentKind(element);
    const group = groupForElement(element, groupsByElement, ungrouped);
    const component = {
      element,
      id: `component-${index}`,
      groupId: group.id,
      index: index + 1,
      kind,
      tag: element.tagName.toLowerCase(),
      visible: true,
    };

    group.components.push(component);
    element.dataset.componentId = component.id;
    element.dataset.groupId = group.id;
    element.dataset.kind = kind;
    element.setAttribute("tabindex", "0");
    element.setAttribute("role", "button");
    element.setAttribute("aria-pressed", "true");
    element.setAttribute("aria-label", `${componentLabel(component)}, hide`);

    element.addEventListener("click", (event) => {
      event.stopPropagation();
      setComponentVisibility(component.id, !component.visible);
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setComponentVisibility(component.id, !component.visible);
      }
    });
    element.addEventListener("mouseenter", () => setHighlight(component.id, true));
    element.addEventListener("mouseleave", () => setHighlight(component.id, false));

    return component;
  });

  state.groups = [...groupsByElement.values()];
  if (ungrouped.components.length) {
    state.groups.unshift(ungrouped);
  }

  createGroupHitAreas(svg);
}

function groupForElement(element, groupsByElement, ungrouped) {
  const groupElement = element.closest("g");
  if (!groupElement) return ungrouped;

  if (!groupsByElement.has(groupElement)) {
    const index = groupsByElement.size + 1;
    groupsByElement.set(groupElement, {
      element: groupElement,
      id: `group-${index}`,
      index,
      label: `Group ${String(index).padStart(2, "0")}`,
      components: [],
    });
  }

  return groupsByElement.get(groupElement);
}

function createGroupHitAreas(svg) {
  const layer = document.createElementNS(svgNamespace, "g");
  layer.setAttribute("class", "group-hit-layer");
  layer.setAttribute("aria-hidden", "true");
  const hitTargets = [];

  state.groups
    .filter((group) => group.id !== "group-ungrouped")
    .map((group) => {
      const points = group.components.flatMap((component) => sampleComponentPoints(component.element, svg));
      const polygonPoints = hitPolygonPoints(points, 10);

      if (polygonPoints.length < 3) return null;

      const polygon = document.createElementNS(svgNamespace, "polygon");
      polygon.setAttribute("class", "group-hit-area");
      polygon.setAttribute("points", polygonPoints.map((point) => `${roundPoint(point.x)},${roundPoint(point.y)}`).join(" "));
      polygon.dataset.groupId = group.id;

      polygon.addEventListener("mouseenter", () => setGroupHighlight(group.id, true));
      polygon.addEventListener("mouseleave", () => setGroupHighlight(group.id, false));
      polygon.addEventListener("click", (event) => {
        event.stopPropagation();
        const visibleCount = group.components.filter((component) => component.visible).length;
        setGroupVisibility(group.id, visibleCount !== group.components.length);
      });

      group.hitArea = polygon;
      group.hitAreaArea = hullArea(polygonPoints);
      return { area: group.hitAreaArea, polygon };
    })
    .filter(Boolean)
    .forEach((target) => {
      hitTargets.push(target);
    });

  state.components.forEach((component) => {
    const polygonPoints = hitPolygonPoints(sampleComponentPoints(component.element, svg), 6);
    if (polygonPoints.length < 3) return;

    const polygon = document.createElementNS(svgNamespace, "polygon");
    polygon.setAttribute("class", "component-hit-area");
    polygon.setAttribute("points", polygonPoints.map((point) => `${roundPoint(point.x)},${roundPoint(point.y)}`).join(" "));
    polygon.dataset.componentId = component.id;

    polygon.addEventListener("mouseenter", () => setHighlight(component.id, true));
    polygon.addEventListener("mouseleave", () => setHighlight(component.id, false));
    polygon.addEventListener("click", (event) => {
      event.stopPropagation();
      setComponentVisibility(component.id, !component.visible);
    });

    component.hitArea = polygon;
    component.hitAreaArea = hullArea(polygonPoints);
    hitTargets.push({ area: component.hitAreaArea, polygon });
  });

  hitTargets
    .sort((a, b) => b.area - a.area)
    .forEach((target) => {
      layer.append(target.polygon);
    });

  svg.prepend(layer);
  updateGroupHitAreas();
  updateComponentHitAreas();
}

function hitPolygonPoints(points, padding) {
  const hull = convexHull(points);
  return hullArea(hull) > 1 ? expandHull(hull, padding) : paddedBounds(points, padding);
}

function sampleComponentPoints(element, svg) {
  const tag = element.tagName.toLowerCase();

  try {
    if (tag === "path" && typeof element.getTotalLength === "function") {
      const length = element.getTotalLength();
      const sampleCount = Math.max(10, Math.min(90, Math.ceil(length / 18)));
      return Array.from({ length: sampleCount + 1 }, (_, index) => {
        const point = element.getPointAtLength((length * index) / sampleCount);
        return toSvgPoint(point.x, point.y, element, svg);
      });
    }

    if (tag === "circle") {
      const cx = Number(element.getAttribute("cx") ?? 0);
      const cy = Number(element.getAttribute("cy") ?? 0);
      const r = Number(element.getAttribute("r") ?? 0);
      return sampleEllipsePoints(element, svg, cx, cy, r, r);
    }

    if (tag === "ellipse") {
      return sampleEllipsePoints(
        element,
        svg,
        Number(element.getAttribute("cx") ?? 0),
        Number(element.getAttribute("cy") ?? 0),
        Number(element.getAttribute("rx") ?? 0),
        Number(element.getAttribute("ry") ?? 0),
      );
    }

    if (tag === "line") {
      return [
        toSvgPoint(Number(element.getAttribute("x1") ?? 0), Number(element.getAttribute("y1") ?? 0), element, svg),
        toSvgPoint(Number(element.getAttribute("x2") ?? 0), Number(element.getAttribute("y2") ?? 0), element, svg),
      ];
    }

    if (tag === "polygon" || tag === "polyline") {
      return [...element.points].map((point) => toSvgPoint(point.x, point.y, element, svg));
    }

    if (tag === "rect") {
      const x = Number(element.getAttribute("x") ?? 0);
      const y = Number(element.getAttribute("y") ?? 0);
      const width = Number(element.getAttribute("width") ?? 0);
      const height = Number(element.getAttribute("height") ?? 0);
      return [
        toSvgPoint(x, y, element, svg),
        toSvgPoint(x + width, y, element, svg),
        toSvgPoint(x + width, y + height, element, svg),
        toSvgPoint(x, y + height, element, svg),
      ];
    }
  } catch {
    return fallbackBounds(element, svg);
  }

  return fallbackBounds(element, svg);
}

function sampleEllipsePoints(element, svg, cx, cy, rx, ry) {
  return Array.from({ length: 20 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 20;
    return toSvgPoint(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry, element, svg);
  });
}

function fallbackBounds(element, svg) {
  try {
    const bounds = element.getBBox();
    return [
      toSvgPoint(bounds.x, bounds.y, element, svg),
      toSvgPoint(bounds.x + bounds.width, bounds.y, element, svg),
      toSvgPoint(bounds.x + bounds.width, bounds.y + bounds.height, element, svg),
      toSvgPoint(bounds.x, bounds.y + bounds.height, element, svg),
    ];
  } catch {
    return [];
  }
}

function toSvgPoint(x, y, element, svg) {
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;

  const elementMatrix = element.getScreenCTM();
  const svgMatrix = svg.getScreenCTM();
  if (!elementMatrix || !svgMatrix) return { x, y };

  const transformed = point.matrixTransform(elementMatrix).matrixTransform(svgMatrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function convexHull(points) {
  const sorted = uniquePoints(points)
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  if (sorted.length <= 2) return sorted;

  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function uniquePoints(points) {
  const seen = new Set();
  return points.filter((point) => {
    const key = `${roundPoint(point.x)},${roundPoint(point.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function hullArea(points) {
  if (points.length < 3) return 0;

  return Math.abs(
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

function expandHull(points, padding) {
  const center = centroid(points);
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy) || 1;

    return {
      x: point.x + (dx / distance) * padding,
      y: point.y + (dy / distance) * padding,
    };
  });
}

function centroid(points) {
  return points.reduce(
    (center, point) => ({
      x: center.x + point.x / points.length,
      y: center.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );
}

function paddedBounds(points, padding) {
  const validPoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!validPoints.length) return [];

  const xs = validPoints.map((point) => point.x);
  const ys = validPoints.map((point) => point.y);
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function roundPoint(value) {
  return Number(value.toFixed(2));
}

function getComponentKind(element) {
  const tag = element.tagName.toLowerCase();
  const fill = getPaintValue(element, "fill");
  const hasFill =
    tag !== "line" && fill !== "none" && fill !== "transparent" && fill !== "rgba(0,0,0,0)";

  return hasFill ? "fill" : "stroke";
}

function getPaintValue(element, property) {
  const direct = element.getAttribute(property);
  if (direct !== null) return direct.trim().toLowerCase();

  const style = element.getAttribute("style") ?? "";
  const match = style.match(new RegExp(`${property}\\s*:\\s*([^;]+)`, "i"));
  if (match) return match[1].trim().toLowerCase();

  return "";
}

function renderComponentList() {
  const filteredGroups = state.groups
    .map((group) => ({
      ...group,
      filteredComponents: group.components.filter(componentMatchesFilter),
    }))
    .filter((group) => group.filteredComponents.length);

  if (!filteredGroups.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No components in this view";
    elements.componentList.replaceChildren(empty);
    return;
  }

  elements.componentList.replaceChildren(
    ...filteredGroups.flatMap((group) => {
      if (group.id === "group-ungrouped") {
        return group.filteredComponents.map(renderComponentButton);
      }

      return [renderComponentGroup(group)];
    }),
  );
}

function componentMatchesFilter(component) {
  if (state.filter === "hidden") return !component.visible;
  if (state.filter === "all") return true;
  return component.kind === state.filter;
}

function renderComponentGroup(group) {
  const visibleCount = group.components.filter((component) => component.visible).length;
  const section = document.createElement("section");
  section.className = "component-group";

  const header = document.createElement("div");
  header.className = "component-group-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "component-group-title";

  const title = document.createElement("h4");
  title.textContent = group.label;

  const meta = document.createElement("span");
  meta.textContent = `${visibleCount} / ${group.components.length} visible`;

  const groupFullyVisible = visibleCount === group.components.length;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = `component-group-toggle${groupFullyVisible ? " is-off" : ""}`;
  toggle.setAttribute("aria-pressed", String(groupFullyVisible));
  toggle.textContent = groupFullyVisible ? "Hide group" : "Show group";
  toggle.addEventListener("click", () => {
    setGroupVisibility(group.id, !groupFullyVisible);
  });
  toggle.addEventListener("mouseenter", () => setGroupHighlight(group.id, true));
  toggle.addEventListener("mouseleave", () => setGroupHighlight(group.id, false));

  titleWrap.append(title, meta);
  header.append(titleWrap, toggle);

  const componentGrid = document.createElement("div");
  componentGrid.className = "component-group-grid";
  componentGrid.replaceChildren(...group.filteredComponents.map(renderComponentButton));

  section.append(header, componentGrid);
  return section;
}

function renderComponentButton(component) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `component-toggle${component.visible ? "" : " is-off"}`;
  button.dataset.componentButton = component.id;
  button.dataset.kind = component.kind;
  button.setAttribute("aria-pressed", String(component.visible));

  const index = document.createElement("span");
  index.className = "component-index";
  index.textContent = String(component.index).padStart(2, "0");

  const name = document.createElement("span");
  name.className = "component-name";
  name.textContent = componentLabel(component);

  button.append(index, name);
  button.addEventListener("click", () => {
    setComponentVisibility(component.id, !component.visible);
  });
  button.addEventListener("mouseenter", () => setHighlight(component.id, true));
  button.addEventListener("mouseleave", () => setHighlight(component.id, false));
  return button;
}

function componentLabel(component) {
  const kindLabel = component.kind === "fill" ? "Fill" : "Stroke";
  return `${kindLabel} ${component.index} · ${component.tag}`;
}

function setComponentVisibility(id, visible) {
  const component = state.components.find((item) => item.id === id);
  if (!component) return;

  recordVisibilityChange(() => {
    applyComponentVisibility(component, visible);
  });
}

function setKindVisibility(kind, visible) {
  recordVisibilityChange(() => {
    state.components
      .filter((component) => component.kind === kind)
      .forEach((component) => {
        applyComponentVisibility(component, visible);
      });
  });
}

function setGroupVisibility(groupId, visible) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;

  recordVisibilityChange(() => {
    group.components.forEach((component) => {
      applyComponentVisibility(component, visible);
    });
  });
}

function setAllVisibility(visible) {
  recordVisibilityChange(() => {
    state.components.forEach((component) => {
      applyComponentVisibility(component, visible);
    });
  });
}

function applyComponentVisibility(component, visible) {
  component.visible = visible;
  component.element.classList.toggle("is-hidden", !visible);
  component.element.setAttribute("aria-pressed", String(visible));
  component.element.setAttribute("aria-label", `${componentLabel(component)}, ${visible ? "hide" : "show"}`);
}

function snapshotVisibility() {
  return state.components.map((component) => component.visible);
}

function snapshotsMatch(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function recordVisibilityChange(mutator) {
  const before = snapshotVisibility();
  mutator();
  const after = snapshotVisibility();

  if (!snapshotsMatch(before, after)) {
    state.undoStack.push({ before, after });
    state.redoStack = [];
  }

  syncVisibilityUi();
}

function applyVisibilitySnapshot(snapshot) {
  state.components.forEach((component, index) => {
    applyComponentVisibility(component, Boolean(snapshot[index]));
  });
}

function undoVisibilityChange() {
  const action = state.undoStack.pop();
  if (!action) return;

  applyVisibilitySnapshot(action.before);
  state.redoStack.push(action);
  syncVisibilityUi();
}

function redoVisibilityChange() {
  const action = state.redoStack.pop();
  if (!action) return;

  applyVisibilitySnapshot(action.after);
  state.undoStack.push(action);
  syncVisibilityUi();
}

function clearVisibilityHistory() {
  state.undoStack = [];
  state.redoStack = [];
  updateHistoryControls();
}

function syncVisibilityUi() {
  renderComponentList();
  updateStatus();
  updateGroupHitAreas();
  updateComponentHitAreas();
  updateHistoryControls();
}

function updateHistoryControls() {
  elements.undoButton.disabled = state.undoStack.length === 0;
  elements.redoButton.disabled = state.redoStack.length === 0;
}

function updateGroupHitAreas() {
  state.groups.forEach((group) => {
    if (!group.hitArea) return;

    const visibleCount = group.components.filter((component) => component.visible).length;
    const isFullyVisible = visibleCount === group.components.length;
    group.hitArea.classList.toggle("is-hidden-group", visibleCount === 0);
    group.hitArea.setAttribute("aria-pressed", String(isFullyVisible));
  });
}

function updateComponentHitAreas() {
  state.components.forEach((component) => {
    if (!component.hitArea) return;

    component.hitArea.classList.toggle("is-hidden-component", !component.visible);
    component.hitArea.setAttribute("aria-pressed", String(component.visible));
  });
}

function setHighlight(id, highlighted) {
  const component = state.components.find((item) => item.id === id);
  if (!component) return;

  component.hitArea?.classList.toggle("is-active", highlighted);
  if (component.visible) {
    component.element.classList.toggle("is-highlighted", highlighted);
  }
}

function setGroupHighlight(groupId, highlighted) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) return;

  group.hitArea?.classList.toggle("is-active", highlighted);
  group.components.forEach((component) => {
    if (component.visible) {
      component.element.classList.toggle("is-highlighted", highlighted);
    }
  });
}

function updateStatus() {
  const total = state.components.length;
  const visible = state.components.filter((component) => component.visible).length;
  const strokes = state.components.filter((component) => component.kind === "stroke").length;
  const fills = state.components.filter((component) => component.kind === "fill").length;
  const actualGroups = state.groups.filter((group) => group.id !== "group-ungrouped").length;
  elements.visibleStatus.textContent = `${visible} / ${total} visible · ${actualGroups} groups · ${strokes} strokes · ${fills} fills`;
}

function updateActiveNav() {
  elements.portraitNav.querySelectorAll("button").forEach((button) => {
    const isActive = button.dataset.portraitId === state.activeId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function renderReferenceImages(portrait) {
  elements.imageCount.textContent = `${portrait.images.length} images`;
  elements.referenceGrid.replaceChildren(
    ...portrait.images.map((imageName) => {
      const figure = document.createElement("figure");
      figure.className = "reference-card";

      const image = document.createElement("img");
      image.src = `data/${portrait.id}/${imageName}`;
      image.alt = `${portrait.title} ${imageLabel(imageName)}`;
      image.loading = "lazy";

      const caption = document.createElement("figcaption");
      caption.textContent = imageLabel(imageName);

      figure.append(image, caption);
      return figure;
    }),
  );
}

function imageLabel(imageName) {
  return `Image ${imageName.replace(/\.(jpe?g)$/i, "")}`;
}

function updateImageDrawer(portrait = currentPortrait()) {
  elements.imageCount.textContent = `${portrait.images.length} images`;

  if (state.imagesRevealed) {
    renderReferenceImages(portrait);
  } else {
    elements.referenceGrid.replaceChildren();
  }
}

function currentPortrait() {
  return portraits.find((portrait) => portrait.publicId === state.activeId) ?? portraits[0];
}

function setImageDrawerOpen(isOpen) {
  state.imagesRevealed = isOpen;
  elements.imageDrawer.classList.toggle("is-collapsed", !isOpen);
  elements.imageDrawer.classList.toggle("is-open", isOpen);
  elements.imageDrawerToggle.setAttribute("aria-expanded", String(isOpen));
  elements.imageDrawerToggle.textContent = isOpen ? "Hide images" : "Reveal images";
  updateImageDrawer();
}

function bindGlobalControls() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "show-all") setAllVisibility(true);
      if (action === "hide-all") setAllVisibility(false);
      if (action === "show-strokes") setKindVisibility("stroke", true);
      if (action === "hide-strokes") setKindVisibility("stroke", false);
      if (action === "show-fills") setKindVisibility("fill", true);
      if (action === "hide-fills") setKindVisibility("fill", false);
    });
  });

  elements.filterTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      elements.filterTabs.forEach((tab) => {
        tab.classList.toggle("is-active", tab === button);
      });
      renderComponentList();
    });
  });

  elements.undoButton.addEventListener("click", undoVisibilityChange);
  elements.redoButton.addEventListener("click", redoVisibilityChange);

  elements.imageDrawerToggle.addEventListener("click", () => {
    setImageDrawerOpen(!state.imagesRevealed);
  });

  window.addEventListener("hashchange", () => {
    const id = window.location.hash.slice(1);
    loadPortrait(id);
  });
}

initializeApp();
