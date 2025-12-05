// ---------------- GLOBAL ELEMENTS ----------------
const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const scanBtn = document.getElementById("scanBtn");
const scanResult = document.getElementById("scanResult");
const aiAnalysis = document.getElementById("aiAnalysis");

const cameraBtn = document.getElementById("cameraBtn");
const camera = document.getElementById("camera");
const captureBtn = document.getElementById("captureBtn");

const loadingOverlay = document.getElementById("loadingOverlay");
const historyList = document.getElementById("historyList");

const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");

const searchIngredient = document.getElementById("searchIngredient");
const filterRisk = document.getElementById("filterRisk");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

let capturedImageBlob = null;
let ingredientCards = [];
let scanHistory = JSON.parse(localStorage.getItem("scanHistory") || "[]");
let capturedImageDataUrl = null;
let currentIngredients = [];
let currentStream = null;
let chatHistory = [];

// ---------------- Sidebar ----------------
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("closed");
}

// ---------------- USER PROFILE ----------------
window.addEventListener("DOMContentLoaded", () => {
  const userName = localStorage.getItem("userName") || "User";
  const userPic = localStorage.getItem("userPicture") || "";

  document.getElementById("welcomeName").textContent = `Hello, ${userName}!`;
  if (userPic) {
    const profilePic = document.getElementById("profilePic");
    profilePic.src = userPic;
    profilePic.style.display = "inline-block";
  }

  renderHistory();

  chatInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendChat();
  });
  if(sendBtn) sendBtn.addEventListener("click", sendChat);
  loadingOverlay.style.display = "none";

});

// ---------------- Logout ----------------
function logout() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  localStorage.clear();
  window.location.href = "login.html";
}

// ---------------- File Upload ----------------
if (imageInput) {
  imageInput.addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (file) {
      capturedImageBlob = file;
      const reader = new FileReader();
      reader.onload = function (e) {
        preview.src = e.target.result;
        capturedImageDataUrl = e.target.result;
        preview.style.display = "block";
        activateStep(1);
        if (currentStream) stopCamera();
      };
      reader.readAsDataURL(file);
    }
  });
}

// ---------------- Camera ----------------
if (cameraBtn) {
  cameraBtn.addEventListener("click", async function () {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Camera not supported in this browser. Please use file upload instead.");
        return;
      }
      const constraints = { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } };
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      camera.srcObject = currentStream;
      camera.style.display = "block";
      captureBtn.style.display = "inline-flex";
      cameraBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Camera';
      cameraBtn.onclick = stopCamera;
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Camera access failed. Please check permissions or try another device.");
    }
  });
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  camera.style.display = "none";
  captureBtn.style.display = "none";
  camera.srcObject = null;
  cameraBtn.innerHTML = '<i class="fas fa-camera"></i> Use Camera';
  cameraBtn.onclick = () => cameraBtn.click();
}

// ---------------- Capture ----------------
if (captureBtn) {
  captureBtn.addEventListener("click", function () {
    if (!currentStream || camera.videoWidth === 0) {
      alert("Camera not ready. Please wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    canvas.getContext("2d").drawImage(camera, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => capturedImageBlob = blob, 'image/jpeg', 0.8);
    capturedImageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    preview.src = capturedImageDataUrl;
    preview.style.display = "block";
    activateStep(1);
    stopCamera();
  });
}

// ---------------- Step Indicator ----------------
function activateStep(step) {
  [step1, step2, step3].forEach((el, idx) => el.classList.toggle("active", idx <= step));
}

// ---------------- Optimized Ingredient Risk ----------------
async function getIngredientRiskOFF(ingredients) {
  const userHealth = JSON.parse(localStorage.getItem("selectedConditions") || "[]");
  const MAX_PARALLEL = 5;
  const results = [];

  async function analyzeBatch(batch) {
    return await Promise.all(batch.map(async (ingredient) => {
      const name = ingredient.toLowerCase();
      let status = "moderate";

      try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/search?ingredients_tags=${encodeURIComponent(name)}&fields=product_name,ingredients_text,nutriscore_grade,nova_group,additives_tags&sort_by=popularity&page_size=1`);
        const data = await res.json();
        const product = data.products?.[0];

        if (product) {
          const nova = product.nova_group || 3;
          const additives = product.additives_tags || [];
          const nutri = product.nutriscore_grade || "c";

          if (nova >= 4 || additives.length > 3 || ["e", "d"].includes(nutri)) status = "bad";
          else if (nova <= 2 && ["a", "b"].includes(nutri)) status = "good";

          userHealth.forEach(cond => {
            if (cond.toLowerCase().includes("diabetes") && name.includes("sugar")) status = "bad";
            if (cond.toLowerCase().includes("bp") && name.includes("sodium")) status = "bad";
            if (cond.toLowerCase().includes("cholesterol") && name.includes("trans fat")) status = "bad";
          });
        } else {
          if (/sugar|preservative|artificial/.test(name)) status = "bad";
          if (/fiber|vitamin|protein/.test(name)) status = "good";
        }
      } catch (err) {
        console.error("OpenFoodFacts error:", err);
        if (status === "moderate") {
          if (/sugar|preservative|artificial/.test(name)) status = "bad";
          if (/fiber|vitamin|protein/.test(name)) status = "good";
        }
      }

      return { ingredient, status };
    }));
  }

  for (let i = 0; i < ingredients.length; i += MAX_PARALLEL) {
    const batch = ingredients.slice(i, i + MAX_PARALLEL);
    const batchResults = await analyzeBatch(batch);
    results.push(...batchResults);
  }

  return results;
}


// ---------------- OCR + Spell Correction + Ingredient Analysis ----------------
if (scanBtn) {
  scanBtn.addEventListener("click", async function () {
    if (!capturedImageBlob && !capturedImageDataUrl) {
      alert("Please select or capture an image first!");
      return;
    }

    loadingOverlay.style.display = "flex";
    activateStep(2);

    scanResult.style.display = "block";
    aiAnalysis.innerHTML = "";

    let rawText = "";
    try {
      const formData = new FormData();
      formData.append("apikey", "K82540727488957");
      formData.append("language", "eng");
      formData.append("isOverlayRequired", "false");
      if (capturedImageBlob) formData.append("file", capturedImageBlob);
      else formData.append("base64Image", capturedImageDataUrl);

      const response = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: formData });
      const result = await response.json();
      rawText = result?.ParsedResults?.[0]?.ParsedText || "";
    } catch (err) {
      console.error("OCR failed:", err);
      scanResult.innerHTML += "<br>❌ OCR failed. Try again.";
      loadingOverlay.style.display = "none";
      return;
    }

    if (!rawText || rawText.trim().length < 2) {
      scanResult.innerHTML += "<br>⚠️ No ingredients detected.";
      loadingOverlay.style.display = "none";
      return;
    }

    // ---------------- Remove "Ingredients:" and clean text ----------------
    let cleanedText = rawText.replace(/ingredients?\s*[:\-]\s*/i, "");
    let rawIngredients = cleanedText.split(/[,\n;]/).map(i => i.trim()).filter(i => i.length > 1);

    // ---------------- Spell Correction via Gemini ----------------
    let correctedIngredients = [];
    try {
      const GEMINI_API_KEY = "AIzaSyBEm4YK4MGmE5RmZ8-maI75eCy3a0QLpvs";
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
      const prompt = `Correct the spelling of these ingredients and return them as a comma-separated list:\n${rawIngredients.join(", ")}`;

      const geminiResponse = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await geminiResponse.json();
      const geminiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || rawIngredients.join(", ");
      correctedIngredients = [...new Set(geminiText.split(/[,\n;]/).map(i => i.trim()).filter(i => i.length > 1))];

    } catch (err) {
      console.error("Gemini spell correction failed:", err);
      correctedIngredients = [...new Set(rawIngredients)];
    }

    // ---------------- Filter and limit ingredients ----------------
    const validIngredients = correctedIngredients
      .map(i => i.trim())
      .filter(i => i.length > 2)                       // remove too-short
      .filter(i => !/^contains\s/i.test(i))            // remove "Contains ..." phrases
      .filter(i => !/including$/i.test(i))             // remove phrases ending with "including"
      .slice(0, 15);                                   // limit to 15

    currentIngredients = validIngredients;            // save globally for chat

    scanResult.innerHTML = `<b>Corrected Ingredients:</b><br>${validIngredients.join(", ")}`;
    aiAnalysis.innerHTML = "";

    if (!validIngredients.length) {
      scanResult.innerHTML += "<br>⚠️ No valid ingredients found to analyze.";
      loadingOverlay.style.display = "none";
      return;
    }

    // ---------------- Risk Analysis & Card Creation ----------------
    const aiResults = await getIngredientRiskOFF(validIngredients);
    ingredientCards = [];

    aiResults.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = `ingredient-card ${item.status}`;
      card.innerHTML = `
        ${item.ingredient}
        <div class="tooltip">Click to learn more about this ingredient</div>
      `;
      card.dataset.risk = item.status;
      card.style.animationDelay = `${index * 0.1}s`;
      card.onclick = () => {
        sendChat(`Tell me about ${item.ingredient} and its health effects`);
      };
      aiAnalysis.appendChild(card);
      ingredientCards.push(card);
    });

    saveToHistory(capturedImageDataUrl, validIngredients.slice(0, 3).join(", "));
    activateStep(3);
    loadingOverlay.style.display = "none";
  });
}


// ---------------- Chat Feature ----------------
async function sendChat(msg = null) {
  const text = msg || chatInput.value.trim();
  if (!text) return;

  // ---------------- Ignore casual/common-sense inputs ----------------
  const ignoreList = ["thanks", "thank you", "ok", "okay", "you're welcome", "hi", "hello"];
  if (ignoreList.includes(text.toLowerCase())) return;

  // Add user message
  addChatMessage(text, "user");
  chatInput.value = "";

  // Show loading
  const loadingMsg = document.createElement("div");
  loadingMsg.className = "chat-message ai";
  loadingMsg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
  chatMessages.appendChild(loadingMsg);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const userHealth = localStorage.getItem("userHealth") || "general health";
  const selectedConditions = JSON.parse(localStorage.getItem("selectedConditions") || "[]");

  if (!currentIngredients.length) {
    if (chatMessages.contains(loadingMsg)) chatMessages.removeChild(loadingMsg);
    addChatMessage("⚠️ No ingredients available for analysis.", "ai");
    return;
  }

  const prompt = `
You are FoodGuard AI, a nutrition expert.
User health: ${userHealth}
User selected conditions: ${selectedConditions.join(", ")}
Currently scanned ingredients: ${currentIngredients.join(", ")}

Question: "${text}"

Respond in 3–4 short sentences.
Focus ONLY on health effects of the ingredient related to the user's conditions.
Provide simple, actionable advice.
Avoid long explanations or general dietary tips.
Use bullet points only if necessary.
`;

  try {
    const GEMINI_API_KEY = "AIzaSyAOfHJe1Y-sOy-RV1uxaX53NmYFXQPgTew";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();

    if (chatMessages.contains(loadingMsg)) chatMessages.removeChild(loadingMsg);

    let reply = "⚠️ Couldn't get a response right now.";
    if (data?.candidates?.length > 0 && data.candidates[0]?.content?.parts?.length > 0) {
      reply = data.candidates[0].content.parts[0].text;
    }

    addChatMessage(reply, "ai");

  } catch (err) {
    if (chatMessages.contains(loadingMsg)) chatMessages.removeChild(loadingMsg);
    console.error("Chat API error:", err);
    addChatMessage("⚠️ Sorry, I couldn't process your question. Try again.", "ai");
  }
}


function addChatMessage(msg, type) {
  const div = document.createElement("div");
  div.className = `chat-message ${type}`;
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


// ---------------- Search & Filter ----------------
if (searchIngredient && filterRisk) {
  searchIngredient.addEventListener("input", filterIngredients);
  filterRisk.addEventListener("change", filterIngredients);
}

function filterIngredients() {
  const searchVal = searchIngredient.value.toLowerCase();
  const filterVal = filterRisk.value;
  ingredientCards.forEach(card => {
    const matchesSearch = card.textContent.toLowerCase().includes(searchVal);
    const matchesFilter = filterVal === "all" || card.dataset.risk === filterVal;
    card.style.display = matchesSearch && matchesFilter ? "inline-block" : "none";
  });
}

// ---------------- History ----------------
function saveToHistory(imageUrl, summary) {
  if (!imageUrl) return;
  const item = { image: imageUrl, summary: summary || "Unknown", date: new Date().toLocaleString() };
  scanHistory.unshift(item);
  scanHistory = scanHistory.slice(0, 5);
  localStorage.setItem("scanHistory", JSON.stringify(scanHistory));
  renderHistory();
}

function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = scanHistory.length
    ? scanHistory.map(i => `<div class="history-item" onclick="preview.src='${i.image}';preview.style.display='block';capturedImageDataUrl='${i.image}'">
        <img src="${i.image}" alt="scan"><div><b>${i.summary}</b><br><small>${i.date}</small></div>
      </div>`).join("")
    : '<p style="color:#666;padding:1rem;">No recent scans</p>';
}
