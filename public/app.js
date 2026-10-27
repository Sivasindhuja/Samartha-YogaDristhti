const state = {
  asanas: [],
  analysis: null,
  busy: false,
  chatBusy: false,
};

const $ = (id) => document.getElementById(id);

// Vercel Functions reject bodies over 4.5 MB, so resize in the browser first.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_UPLOAD_DIMENSION = 1600;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);

function errorMessage(data, status) {
  const detail = data && data.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join("; ");
  }
  if (data && typeof data.error === "string" && data.error.trim()) return data.error;
  return `Request failed (${status}).`;
}

function setStatus(message, kind) {
  const node = $("status");
  node.textContent = message || "";
  node.className = kind ? `status ${kind}` : "status";
}

/* -------------------------------------------------------------------------- */
/* Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

async function init() {
  try {
    const response = await fetch("/api/asanas");
    if (!response.ok) throw new Error(`Rubric request failed (${response.status}).`);
    const data = await response.json();
    state.asanas = Array.isArray(data.asanas) ? data.asanas : [];
    renderMeta(data.meta);
    populateSelect(state.asanas);
  } catch (error) {
    $("rubric-badge").textContent = "rubric unavailable";
    setStatus(`Could not load the asana rubric: ${error.message}`, "error");
  }
}

function renderMeta(meta) {
  const badge = $("rubric-badge");
  if (!meta) {
    badge.textContent = "rubric unknown";
    return;
  }

  const verified = Number(meta.verified_angles || 0);
  const total = Number(meta.total_angles || 0);
  const issues = Array.isArray(meta.issues) ? meta.issues : [];

  const parts = [`Rubric ${meta.status || "draft"}`, `${verified}/${total} angles verified`];
  if (issues.length) parts.push(`${issues.length} issue${issues.length === 1 ? "" : "s"}`);
  badge.textContent = parts.join(" · ");
  badge.className = `badge ${
    issues.length ? "badge-bad" : meta.status === "draft" ? "badge-draft" : "badge-ok"
  }`;

  const notes = Array.isArray(meta.notes) ? meta.notes : [];
  const title = [...notes];
  if (issues.length) title.push(`Rubric issues:\n- ${issues.join("\n- ")}`);
  badge.title = title.join("\n\n");
}

function populateSelect(asanas) {
  const select = $("asana-select");
  const auto = select.querySelector('option[value="auto"]');
  select.innerHTML = "";
  select.appendChild(auto);

  asanas.forEach((asana) => {
    const option = document.createElement("option");
    option.value = asana.id;
    const english = asana.english_name ? ` — ${asana.english_name}` : "";
    const level = asana.level ? ` (${asana.level})` : "";
    option.textContent = `${asana.name || asana.id}${english}${level}`;
    if (asana.camera_hint) option.title = asana.camera_hint;
    select.appendChild(option);
  });
}

/* -------------------------------------------------------------------------- */
/* Analyse                                                                    */
/* -------------------------------------------------------------------------- */

const analyzeForm = $("analyze-form");

analyzeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;

  const fileInput = $("file");
  if (!fileInput.files || !fileInput.files.length) {
    setStatus("Choose a photo first.", "error");
    return;
  }

  setBusy(true);
  setStatus("Preparing the photo…");

  let upload = fileInput.files[0];
  try {
    upload = await prepareImageForUpload(upload);
  } catch {
    upload = fileInput.files[0];
  }

  if (upload.size > MAX_UPLOAD_BYTES) {
    setBusy(false);
    setStatus("That photo is still larger than 4 MB after resizing. Try a smaller image.", "error");
    return;
  }

  const body = new FormData();
  body.append("file", upload);
  body.append("asana_id", $("asana-select").value);
  body.append("age", $("age").value || "30");
  body.append("flexibility", $("flexibility").value);
  body.append("goal", $("goal").value || "alignment");
  body.append("notes", $("notes").value || "");

  setStatus(
    `Estimating alignment… (${Math.max(1, Math.round(upload.size / 1024))} KB uploaded, a few seconds)`
  );

  try {
    const response = await fetch("/api/analyze", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(data, response.status));

    state.analysis = data.analysis;
    renderAnalysis(data.analysis, data.rubric);
    setStatus(`Reviewed with ${data.analysis.model}. Angles are estimates, not measurements.`);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

function setBusy(busy) {
  state.busy = busy;
  const button = $("submit-button");
  button.disabled = busy;
  button.textContent = busy ? "Analysing…" : "Analyse pose";
}

/**
 * Downscales and re-encodes in the browser. This keeps uploads well under
 * Vercel's 4.5 MB function body limit and cuts latency/cost.
 */
async function prepareImageForUpload(file) {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return file;
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / longest);
    if (scale === 1 && file.size <= 1200 * 1024) return file;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;

    return new File([blob], "pose.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}

const unitSuffix = (unit) => (unit === "ratio" ? "" : "°");

function renderAnalysis(analysis, rubric) {
  if (!analysis) return;

  const asana = analysis.asana;
  const name = asana ? asana.name : "Unidentified pose";
  const english = asana && asana.english_name ? ` — ${asana.english_name}` : "";

  const badges = [`<span class="badge badge-neutral">match: ${esc(analysis.match_confidence)}</span>`];
  if (analysis.pose_mismatch) {
    badges.push('<span class="badge badge-bad">photo may not match this pose</span>');
  }
  if (asana) {
    badges.push(
      asana.verified
        ? '<span class="badge badge-ok">rubric verified</span>'
        : '<span class="badge badge-draft">rubric draft</span>'
    );
  }

  const score = analysis.score;
  const scoreHtml =
    score === null || score === undefined
      ? `<p class="muted">${esc(analysis.score_basis)}</p>`
      : `
        <div class="score-row">
          <div>
            <div class="score-value">${esc(score)}<span class="muted">/100</span></div>
            <div class="muted">angle match (estimate)</div>
          </div>
          <div class="score-bar"><span style="width:${Math.max(0, Math.min(100, Number(score)))}%"></span></div>
        </div>
        <p class="muted">${esc(analysis.score_basis)}</p>
        <p class="muted">This number reflects only the estimated angles. Qualitative corrections are
        listed separately and are not part of it.</p>
      `;

  const rows = (analysis.angle_checks || []).map(angleRow).join("");
  const anglesHtml = rows
    ? `
      <h4>Estimated angles vs expert range</h4>
      <p class="muted">Confidence is the model's self-report, not a statistical measure.</p>
      <table>
        <thead>
          <tr>
            <th>Angle</th>
            <th>Estimate</th>
            <th>Expert range</th>
            <th>Status</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `
    : "";

  const corrections = (analysis.corrections || []).map((item) => {
    const issue = item.issue ? `<div>${esc(item.issue)}</div>` : "";
    const fix = item.fix ? `<div><strong>Try:</strong> ${esc(item.fix)}</div>` : "";
    const joint = item.joint ? `<span class="muted"> · ${esc(item.joint)}</span>` : "";
    const cue =
      item.angle_status === "in_range"
        ? ' <span class="badge badge-neutral">cue · angle in range</span>'
        : "";
    return `<li><strong>${esc(item.area)}</strong>${joint}${cue}${issue}${fix}</li>`;
  });

  const correctionsHtml = corrections.length
    ? `<h4>What to adjust</h4><ul>${corrections.join("")}</ul>`
    : '<h4>What to adjust</h4><p class="muted">No corrections were flagged.</p>';

  const caveats = (analysis.caveats || []).filter(Boolean);
  const caveatsHtml = caveats.length
    ? `<div class="callout callout-info"><strong>Limits of this review</strong><ul>${caveats
        .map((item) => `<li>${esc(item)}</li>`)
        .join("")}</ul></div>`
    : "";

  const draftNote = rubric && rubric.status === "draft"
    ? `<div class="callout callout-warn"><strong>Draft rubric.</strong> The numeric ranges in
       <code>backend/asanas.json</code> are placeholders. ${esc(
         `${Number(rubric.verified_angles || 0)} of ${Number(rubric.total_angles || 0)}`
       )} angles have been signed off by a reviewer.</div>`
    : "";

  $("result").innerHTML = `
    <div class="result-head">
      <h2>${esc(name)}${esc(english)}</h2>
      ${badges.join("")}
    </div>
    <p>${esc(analysis.summary || "No summary returned.")}</p>
    ${
      analysis.used_fallback
        ? `<p class="muted">Primary model ${esc(analysis.requested_model)} was unavailable, so this
           review came from <strong>${esc(analysis.model)}</strong>.${
             analysis.fallback_reason
               ? " " + esc(String(analysis.fallback_reason).slice(0, 240))
               : ""
           }</p>`
        : ""
    }
    ${scoreHtml}
    <div class="callout callout-warn">${esc(analysis.disclaimer)}</div>
    ${anglesHtml}
    ${correctionsHtml}
    <div class="grid-2">
      <div>${textBlock("Working well", analysis.working_well, "Nothing positive was reported.")}</div>
      <div>${textBlock("Safety notes", analysis.safety, "No safety issues were reported.")}</div>
    </div>
    ${caveatsHtml}
    ${draftNote}
    <details>
      <summary>Raw response</summary>
      <pre>${esc(JSON.stringify(analysis, null, 2))}</pre>
    </details>
  `;

  $("result-card").hidden = false;
  $("chat-hint").textContent = asana
    ? `Ask about ${name}: benefits, precautions, alignment cues, what to fix next.`
    : "Ask about this pose: benefits, precautions, alignment cues, what to fix next.";
  $("result-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function angleRow(check) {
  const unit = unitSuffix(check.unit);
  const hasEstimate = check.estimate !== null && check.estimate !== undefined;
  const estimate = hasEstimate ? `${check.estimate}${unit}` : "—";
  const hasRange =
    check.ideal_min !== null &&
    check.ideal_min !== undefined &&
    check.ideal_max !== null &&
    check.ideal_max !== undefined;
  const range = hasRange ? `${check.ideal_min}–${check.ideal_max}${unit}` : "not set";
  const state = check.verified ? "verified" : "draft";

  let status = '<span class="badge badge-neutral">not estimated</span>';
  if (check.within_range === true) {
    status = '<span class="badge badge-ok">in range</span>';
  } else if (check.within_range === false) {
    status = `<span class="badge badge-bad">off by ${esc(check.delta)}${unit}</span>`;
  }

  const confidence = check.confidence ? esc(check.confidence) : '<span class="muted">—</span>';
  const landmarks = Array.isArray(check.landmarks) && check.landmarks.length
    ? `<div class="muted">${esc(check.joint)} · ${esc(check.landmarks.join(" → "))}</div>`
    : `<div class="muted">${esc(check.joint)}</div>`;

  return `
    <tr>
      <td><div>${esc(check.label)}</div>${landmarks}</td>
      <td>${esc(estimate)}</td>
      <td>${esc(range)}<div class="muted">${esc(state)}</div></td>
      <td>${status}</td>
      <td>${confidence}</td>
    </tr>
  `;
}

function textBlock(title, items, emptyText) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  const body = values.length
    ? `<ul>${values.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    : `<p class="muted">${esc(emptyText)}</p>`;
  return `<h4>${esc(title)}</h4>${body}`;
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                       */
/* -------------------------------------------------------------------------- */

const chatForm = $("chat-form");

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.chatBusy) return;

  const input = $("chat-input");
  const question = input.value.trim();
  if (!question) return;

  input.value = "";
  appendChat("user", question);
  setChatBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        asana_id: state.analysis?.asana?.id ?? null,
        analysis: state.analysis,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(data, response.status));
    appendChat("assistant", data.message || "No answer returned.");
  } catch (error) {
    appendChat("error", error.message);
  } finally {
    setChatBusy(false);
  }
});

$("chat-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

function appendChat(role, text) {
  const log = $("chat-log");
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;
  message.textContent = text;
  log.appendChild(message);
  log.scrollTop = log.scrollHeight;
}

function setChatBusy(busy) {
  state.chatBusy = busy;
  const button = $("chat-button");
  button.disabled = busy;
  button.textContent = busy ? "Thinking…" : "Send";
}

init();
