const state = {
  data: null,
  datasetKey: "piven",
  subjectIndex: 0,
};

const els = {
  datasetTabs: document.getElementById("datasetTabs"),
  subjectTrack: document.getElementById("subjectTrack"),
  subjectStatus: document.getElementById("subjectStatus"),
  prevSubject: document.getElementById("prevSubject"),
  nextSubject: document.getElementById("nextSubject"),
  portraitImage: document.getElementById("portraitImage"),
  subjectName: document.getElementById("subjectName"),
  subjectSlug: document.getElementById("subjectSlug"),
  subjectBio: document.getElementById("subjectBio"),
  portraitElementsList: document.getElementById("portraitElementsList"),
  bioElementsList: document.getElementById("bioElementsList"),
  croppedStrip: document.getElementById("croppedStrip"),
  imageMatrix: document.getElementById("imageMatrix"),
  bioTextMatrix: document.getElementById("bioTextMatrix"),
  bioElementsMatrix: document.getElementById("bioElementsMatrix"),
  imageHoverPanel: document.getElementById("imageHoverPanel"),
  bioTextHoverPanel: document.getElementById("bioTextHoverPanel"),
  bioElementsHoverPanel: document.getElementById("bioElementsHoverPanel"),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorForValue(value) {
  const normalized = (value + 1) / 2;
  const hue = 220 - normalized * 160;
  const lightness = 92 - normalized * 46;
  return `hsl(${hue} 72% ${lightness}%)`;
}

function scoreColor(value) {
  return value > 0.35 ? "#0f172a" : "#ffffff";
}

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function setHoverPanelDefault(panel, title, text) {
  panel.innerHTML = "";
  panel.appendChild(createElement("h4", "", title));
  panel.appendChild(createElement("p", "", text));
}

function getCurrentSubjects() {
  return state.data.datasets[state.datasetKey].subjects;
}

function getCurrentSubject() {
  return getCurrentSubjects()[state.subjectIndex];
}

function renderTabs() {
  els.datasetTabs.innerHTML = "";
  Object.entries(state.data.datasets).forEach(([key, dataset]) => {
    const button = createElement("button", `dataset-tab${key === state.datasetKey ? " is-active" : ""}`, dataset.label);
    button.type = "button";
    button.addEventListener("click", () => {
      state.datasetKey = key;
      state.subjectIndex = 0;
      render();
    });
    els.datasetTabs.appendChild(button);
  });
}

function renderSubjectTrack() {
  const subjects = getCurrentSubjects();
  els.subjectTrack.innerHTML = "";
  subjects.forEach((subject, index) => {
    const chip = createElement("button", `subject-chip${index === state.subjectIndex ? " is-active" : ""}`);
    chip.type = "button";
    chip.appendChild(createElement("div", "subject-chip-name", subject.name));
    chip.appendChild(createElement("div", "subject-chip-meta", subject.slug));
    chip.addEventListener("click", () => {
      state.subjectIndex = index;
      render();
      chip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
    els.subjectTrack.appendChild(chip);
  });
  els.subjectStatus.textContent = `${state.subjectIndex + 1} / ${subjects.length}`;
}

function renderOverview(subject) {
  els.portraitImage.src = subject.portraitPath;
  els.portraitImage.alt = `${subject.name} portrait`;
  els.subjectName.textContent = subject.name;
  els.subjectSlug.textContent = subject.slug;
  els.subjectBio.textContent = subject.bio;

  els.portraitElementsList.innerHTML = "";
  subject.portraitElements.forEach((item) => {
    els.portraitElementsList.appendChild(createElement("li", "", item));
  });

  els.bioElementsList.innerHTML = "";
  subject.bioElements.forEach((item) => {
    els.bioElementsList.appendChild(createElement("li", "", item));
  });

  els.croppedStrip.innerHTML = "";
  subject.croppedImages.forEach((item) => {
    const wrapper = createElement("div", "cropped-thumb");
    const img = createElement("img");
    img.src = item.path;
    img.alt = `${subject.name} cropped ${item.index}`;
    img.loading = "lazy";
    wrapper.appendChild(img);
    wrapper.appendChild(createElement("div", "cropped-thumb-label", String(item.index)));
    els.croppedStrip.appendChild(wrapper);
  });
}

function getImagePathForLabel(subject, label) {
  if (label === "portrait") return subject.portraitPath;
  const match = subject.croppedImages.find((item) => String(item.index) === String(label));
  return match ? match.path : null;
}

function renderImageHover(panel, subject, rowLabel, colLabel, score) {
  panel.innerHTML = "";
  panel.appendChild(createElement("h4", "", "Hovered image pair"));
  panel.appendChild(createElement("p", "", "Portrait and cropped-image pairs update as you move across the matrix."));
  panel.appendChild(createElement("p", "hover-score", `score: ${score.toFixed(3)}`));

  const pair = createElement("div", "hover-image-pair");
  [
    { label: rowLabel, path: getImagePathForLabel(subject, rowLabel) },
    { label: colLabel, path: getImagePathForLabel(subject, colLabel) },
  ].forEach((item) => {
    const block = createElement("div");
    const img = createElement("img", "hover-image");
    img.src = item.path || "";
    img.alt = `${item.label} preview`;
    block.appendChild(img);
    block.appendChild(createElement("div", "hover-caption", item.label));
    pair.appendChild(block);
  });
  panel.appendChild(pair);
}

function renderTextHover(panel, title, rowLabel, colLabel, score) {
  panel.innerHTML = "";
  panel.appendChild(createElement("h4", "", title));
  panel.appendChild(createElement("p", "hover-score", `score: ${score.toFixed(3)}`));

  const pair = createElement("div", "text-pair");
  [
    { label: "row", text: rowLabel },
    { label: "column", text: colLabel },
  ].forEach((item) => {
    const block = createElement("div", "text-pair-block");
    block.appendChild(createElement("div", "text-pair-label", item.label));
    block.appendChild(createElement("div", "", item.text));
    pair.appendChild(block);
  });
  panel.appendChild(pair);
}

function renderMatrix(container, rowLabels, colLabels, values, onHover) {
  container.innerHTML = "";
  const table = createElement("table", "matrix-table");
  const thead = createElement("thead");
  const headRow = createElement("tr");
  headRow.appendChild(createElement("th", "label-cell row-header", ""));
  colLabels.forEach((label) => {
    headRow.appendChild(createElement("th", "label-cell", label));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = createElement("tbody");
  values.forEach((row, rowIndex) => {
    const tr = createElement("tr");
    tr.appendChild(createElement("th", "label-cell row-header", rowLabels[rowIndex]));
    row.forEach((value, colIndex) => {
      const td = createElement("td", "", value.toFixed(2));
      td.style.background = colorForValue(value);
      td.style.color = scoreColor(value);
      td.addEventListener("mouseenter", () => onHover(rowIndex, colIndex, value));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderMatrices(subject) {
  const imageMatrix = subject.imageSimilarity.matrixValues || [];
  const imageLabels = subject.imageSimilarity.matrixLabels || [];
  renderMatrix(
    els.imageMatrix,
    imageLabels,
    imageLabels,
    imageMatrix,
    (rowIndex, colIndex, value) => renderImageHover(
      els.imageHoverPanel,
      subject,
      imageLabels[rowIndex],
      imageLabels[colIndex],
      value,
    ),
  );
  setHoverPanelDefault(
    els.imageHoverPanel,
    "Hovered image pair",
    "Move over the image matrix to preview the paired portrait / cropped images.",
  );

  const bioText = subject.textSimilarity.bioVsPortrait;
  renderMatrix(
    els.bioTextMatrix,
    bioText.row_labels,
    bioText.column_labels,
    bioText.values,
    (rowIndex, colIndex, value) => renderTextHover(
      els.bioTextHoverPanel,
      "Bio vs portrait element pair",
      bioText.row_labels[rowIndex],
      bioText.column_labels[colIndex],
      value,
    ),
  );
  setHoverPanelDefault(
    els.bioTextHoverPanel,
    "Bio vs portrait element pair",
    "Hover a cell to inspect the biography text and the portrait element string behind that score.",
  );

  const bioElements = subject.textSimilarity.bioElementsVsPortrait;
  renderMatrix(
    els.bioElementsMatrix,
    bioElements.row_labels,
    bioElements.column_labels,
    bioElements.values,
    (rowIndex, colIndex, value) => renderTextHover(
      els.bioElementsHoverPanel,
      "Bio element vs portrait element pair",
      bioElements.row_labels[rowIndex],
      bioElements.column_labels[colIndex],
      value,
    ),
  );
  setHoverPanelDefault(
    els.bioElementsHoverPanel,
    "Bio element vs portrait element pair",
    "Hover a cell to inspect the two extracted element strings behind that similarity score.",
  );
}

function render() {
  renderTabs();
  renderSubjectTrack();
  const subject = getCurrentSubject();
  renderOverview(subject);
  renderMatrices(subject);
}

async function init() {
  if (window.APP_DATA) {
    state.data = window.APP_DATA;
  } else {
    const response = await fetch("./app-data.json");
    state.data = await response.json();
  }

  els.prevSubject.addEventListener("click", () => {
    const subjects = getCurrentSubjects();
    state.subjectIndex = (state.subjectIndex - 1 + subjects.length) % subjects.length;
    render();
  });

  els.nextSubject.addEventListener("click", () => {
    const subjects = getCurrentSubjects();
    state.subjectIndex = (state.subjectIndex + 1) % subjects.length;
    render();
  });

  render();
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<pre style="padding:2rem;color:#b91c1c;">Failed to load app data.\n${error}</pre>`;
});
