const BASE_URL = window.location.origin;

function showLoader() {
  document.getElementById("loader").style.display = "flex";
}

function hideLoader() {
  document.getElementById("loader").style.display = "none";
}

function checkIndex() {
  const input = document.getElementById("urlInput").value.trim();
  const resultCard = document.getElementById("resultCard");
  const resultBox = document.getElementById("result");

  if (!input) return alert("Enter one or more URLs.");

  resultCard.style.display = "none";
  resultBox.innerHTML = "";

  const urls = input
    .split(/\s+|\n+/)
    .map((url) => url.trim())
    .filter(Boolean);

  showLoader();

  if (urls.length === 1) {
    // Single URL check
    fetch(`${BASE_URL}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urls[0] }),
    })
      .then((res) => res.json())
      .then((data) => {
        hideLoader();
        const status =
          data.status === "Indexed"
            ? "✅ Indexed"
            : data.status === "Not Indexed"
              ? "❌ Not Indexed"
              : "⚠️ Unknown status";
        resultBox.innerHTML = `
          <div class="bulk-result-box">
            <div class="url-row">
              <div class="url">${urls[0]}</div>
              <div class="status ${data.status === "Indexed" ? "indexed" : "not-indexed"}">${status}</div>
            </div>
          </div>`;
        resultCard.style.display = "block";
      })
      .catch(() => {
        hideLoader();
        resultBox.innerHTML = `<div class="bulk-result-box">❌ Error checking index status.</div>`;
        resultCard.style.display = "block";
      });
  } else {
    // Multiple URL check (manual input)
    fetch(`${BASE_URL}/bulk-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls, isCSV: false }), // 👈 important fix
    })
      .then((res) => res.json())
      .then((data) => {
        hideLoader();
        let output = '<div class="bulk-result-box">';
        output += `<div style="font-weight:bold; font-size:16px; margin-bottom:10px;">Bulk Results:</div>`;
        data.results.forEach((res) => {
          const icon = res.indexed ? "✅" : "❌";
          const label = res.indexed ? "Indexed" : "Not Indexed";
          const className = res.indexed ? "indexed" : "not-indexed";
          output += `
            <div class="url-row">
              <div class="url">${res.url}</div>
              <div class="status ${className}">${icon} ${label}</div>
            </div>`;
        });
        output += "</div>";
        resultBox.innerHTML = output;
        resultCard.style.display = "block";
      })
      .catch(() => {
        hideLoader();
        resultBox.innerHTML = `<div class="bulk-result-box">❌ Error checking multiple URLs.</div>`;
        resultCard.style.display = "block";
      });
  }
}

function handleCSV(event) {
  const file = event.target.files[0];
  const resultCard = document.getElementById("resultCard");
  const resultBox = document.getElementById("result");
  if (!file) return;

  resultCard.style.display = "none";
  resultBox.innerHTML = "";

  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/,+$/, ""))
      .filter(Boolean);

    showLoader();

    fetch(`${BASE_URL}/bulk-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: lines, isCSV: true }), // 👈 important fix
    })
      .then((res) => res.json())
      .then((data) => {
        hideLoader();
        let output = '<div class="bulk-result-box">';
        output += `<div style="font-weight:bold; font-size:16px; margin-bottom:10px;">Bulk Results:</div>`;
        data.results.forEach((res) => {
          const icon = res.indexed ? "✅" : "❌";
          const label = res.indexed ? "Indexed" : "Not Indexed";
          const className = res.indexed ? "indexed" : "not-indexed";
          output += `
            <div class="url-row">
              <div class="url">${res.url}</div>
              <div class="status ${className}">${icon} ${label}</div>
            </div>`;
        });
        output += "</div>";
        resultBox.innerHTML = output;
        resultCard.style.display = "block";
      })
      .catch(() => {
        hideLoader();
        resultBox.innerHTML = `<div class="bulk-result-box">❌ Error processing CSV file.</div>`;
        resultCard.style.display = "block";
      });
  };

  reader.readAsText(file);
}
