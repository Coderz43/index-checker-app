function showLoader() {
  document.getElementById("loader").style.display = "flex";
}

function hideLoader() {
  document.getElementById("loader").style.display = "none";
}

function checkIndex() {
  const url = document.getElementById("urlInput").value.trim();
  if (!url) return alert("Enter a URL.");

  showLoader();

  setTimeout(() => {
    fetch("http://localhost:5000/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    })
      .then(res => res.json())
      .then(data => {
        hideLoader();
        if (data.status === "Indexed") {
          document.getElementById("result").innerText = "✅ Indexed";
        } else if (data.status === "Not Indexed") {
          document.getElementById("result").innerText = "❌ Not Indexed";
        } else {
          document.getElementById("result").innerText = "⚠️ Unknown status.";
        }
      })
      .catch(() => {
        hideLoader();
        document.getElementById("result").innerText = "Error checking index status.";
      });
  }, 500);
}

function handleCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result
      .split(/\r?\n/)
      .map(line => line.trim().replace(/,+$/, '')) // remove trailing commas
      .filter(Boolean); // remove empty lines

    showLoader();

    setTimeout(() => {
      fetch("http://localhost:5000/bulk-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: lines })
      })
        .then(res => res.json())
        .then(data => {
          hideLoader();
          let output = "Bulk Results:\n";
          data.results.forEach(res => {
            output += `${res.url} => ${res.indexed ? "✅ Indexed" : "❌ Not Indexed"}\n`;

          });
          document.getElementById("result").innerText = output;
        })
        .catch(() => {
          hideLoader();
          document.getElementById("result").innerText = "Error processing CSV.";
        });
    }, 2000);
  };

  reader.readAsText(file);
}