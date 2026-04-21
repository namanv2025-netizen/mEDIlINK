// ─── UTILITIES & STATE ──────────────────────────────────────────────────────
let map;
let userLoc = { lat: 28.6139, lng: 77.2090 }; // Default
let allHospitals = [];
let markers = [];
let routingControl = null;
let currentUser = JSON.parse(localStorage.getItem('medlink_user')) || null;

// ─── INITIALIZATION ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initAuth();
    initChat();
    initEmotion();
    
    // UI Event Listeners
    const searchBar = document.getElementById('search-bar');
    const typeFilter = document.getElementById('type-filter');
    const locateBtn = document.getElementById('locate-me');

    if (searchBar) searchBar.addEventListener('input', applyFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (locateBtn) locateBtn.addEventListener('click', () => locateUser());
});

// ─── MAP LOGIC ───────────────────────────────────────────────────────────────
function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = L.map('map', { zoomControl: false }).setView([userLoc.lat, userLoc.lng], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    locateUser(true); // Attempt to find user on load
}

function locateUser(isInitial = false) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if (map) {
                    map.setView([userLoc.lat, userLoc.lng], 14);
                    // User Marker
                    L.marker([userLoc.lat, userLoc.lng], {
                        icon: L.divIcon({
                            className: 'user-marker',
                            html: '<div style="background:var(--primary-blue);width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:var(--shadow-lg)"></div>',
                            iconAnchor: [9, 9]
                        })
                    }).addTo(map).bindPopup('<b>You are here</b>').openPopup();
                }
                fetchHospitals(true);
            },
            () => { 
                if (!isInitial) alert("Location access denied or unavailable."); 
                fetchHospitals(false); 
            }
        );
    } else {
        fetchHospitals(false);
    }
}

// ─── HOSPITAL API & DISPLAY ──────────────────────────────────────────────────
async function fetchHospitals(adjust) {
    const listEl = document.getElementById('hospital-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="p-5 text-center"><div class="spinner-border text-primary"></div></div>';

    try {
        const res = await fetch('/api/hospitals');
        let data = await res.json();

        if (adjust) {
            data = data.map(h => ({
                ...h,
                lat: userLoc.lat + (Math.random() - 0.5) * 0.05,
                lng: userLoc.lng + (Math.random() - 0.5) * 0.05
            }));
        }

        allHospitals = data.map(h => ({
            ...h,
            distance: calculateDistance(userLoc.lat, userLoc.lng, h.lat, h.lng)
        })).sort((a, b) => a.distance - b.distance);

        renderHospitalList(allHospitals);
    } catch (err) {
        listEl.innerHTML = '<p class="text-danger p-3">Failed to load hospitals. Is the server running?</p>';
    }
}

function renderHospitalList(hospitals) {
    const listEl = document.getElementById('hospital-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    // Clear Markers
    markers.forEach(m => m.remove());
    markers = [];

    if (hospitals.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-center text-muted">No hospitals found matching your criteria.</div>';
        return;
    }

    hospitals.forEach(h => {
        const marker = L.marker([h.lat, h.lng]).addTo(map)
            .bindPopup(`<b>${h.name}</b><br>${h.contact}`);
        markers.push(marker);

        const card = document.createElement('div');
        card.className = 'hospital-card shadow-sm border p-3 rounded-4 mb-3 transition';
        const bedClass = h.beds_available > 10 ? 'bg-soft-green text-green' : (h.beds_available > 2 ? 'bg-soft-yellow text-warning' : 'bg-soft-red text-danger');
        
        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="fw-bold mb-0">${h.name}</h6>
                <span class="badge bg-light text-dark fw-normal border small">${h.type}</span>
            </div>
            <div class="d-flex gap-2 mb-3">
                <span class="availability-badge ${bedClass}"><i class="fa-solid fa-bed small"></i> ${h.beds_available} Beds</span>
                <span class="availability-badge bg-soft-blue text-blue"><i class="fa-solid fa-location-dot small"></i> ${h.distance.toFixed(1)} km</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <small class="text-muted"><i class="fa-solid fa-phone me-1 small"></i> ${h.contact}</small>
                <button class="btn btn-sm btn-primary rounded-pill px-3 py-1">Directions</button>
            </div>
        `;
        
        card.onclick = () => {
            if (map) {
                map.setView([h.lat, h.lng], 16);
                marker.openPopup();
            }
            document.querySelectorAll('.hospital-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        };
        
        listEl.appendChild(card);
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function applyFilters() {
    const qEl = document.getElementById('search-bar');
    const typeEl = document.getElementById('type-filter');
    if (!qEl || !typeEl) return;

    const query = qEl.value.toLowerCase();
    const type = typeEl.value;
    
    const filtered = allHospitals.filter(h => 
        (h.name.toLowerCase().includes(query)) && (type === 'All' || h.type === type)
    );
    renderHospitalList(filtered);
}

// ─── AUTH SYSTEM ─────────────────────────────────────────────────────────────
function initAuth() {
    updateAuthUI();

    const signupForm = document.getElementById('signup-form');
    const loginForm = document.getElementById('login-form');

    if (signupForm) {
        signupForm.onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name').value;
            const email = document.getElementById('signup-email').value;
            const pass = document.getElementById('signup-password').value;
            
            const users = JSON.parse(localStorage.getItem('medlink_users') || '[]');
            if (users.find(u => u.email === email)) return alert("An account with this email already exists!");
            
            const newUser = { name, email, pass };
            users.push(newUser);
            localStorage.setItem('medlink_users', JSON.stringify(users));
            loginUser(newUser);
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('signupModal'));
            if (modal) modal.hide();
        };
    }

    if (loginForm) {
        loginForm.onsubmit = (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            
            const users = JSON.parse(localStorage.getItem('medlink_users') || '[]');
            const user = users.find(u => u.email === email && u.pass === pass);
            
            if (user) {
                loginUser(user);
                const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
                if (modal) modal.hide();
            } else {
                alert("Invalid email or password!");
            }
        };
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.removeItem('medlink_user');
            currentUser = null;
            updateAuthUI();
        };
    }
}

function loginUser(user) {
    currentUser = user;
    localStorage.setItem('medlink_user', JSON.stringify(user));
    updateAuthUI();
}

function updateAuthUI() {
    const authBtns = document.getElementById('auth-buttons');
    const profile = document.getElementById('user-profile');
    const userDisplay = document.getElementById('username-display');

    if (currentUser && authBtns && profile && userDisplay) {
        authBtns.classList.add('d-none');
        profile.classList.remove('d-none');
        profile.classList.add('d-flex');
        userDisplay.innerText = currentUser.name.split(' ')[0];
    } else if (authBtns && profile) {
        authBtns.classList.remove('d-none');
        profile.classList.add('d-none');
    }
}

// ─── SYMPTOM CHATBOT ─────────────────────────────────────────────────────────
function initChat() {
    const sendBtn = document.getElementById('send-chat');
    const input = document.getElementById('user-input');
    const chatBox = document.getElementById('chat-box');
    if (!sendBtn || !input || !chatBox) return;

    const responses = {
        "fever": "It sounds like you have a fever. Stay hydrated, rest, and monitor your temperature. If it's over 103°F (39.4°C) or lasts more than 3 days, consult a doctor.",
        "headache": "For a headache, try resting in a quiet, dark room and stay hydrated. Stress, dehydration, or lack of sleep are common causes. If it's severe, see a doctor.",
        "cold": "Common cold? Rest a lot, drink warm fluids, and consider vitamin C. It usually clears up on its own in 7-10 days.",
        "cough": "A persistent cough might need attention. Try honey with warm water. If you experience shortness of breath or chest pain, seek immediate help.",
        "pain": "Where is the pain? For minor injuries, use the RICE method (Rest, Ice, Compression, Elevation). For severe pain, please find the nearest hospital.",
        "default": "I understand. While I can provide general tips, you should consult a certified medical professional for an accurate diagnosis. Would you like me to highlight nearby hospitals?"
    };

    function appendMsg(text, type) {
        const div = document.createElement('div');
        div.className = `chat-msg ${type === 'user' ? 'user-msg shadow' : 'bot-msg shadow-sm'} p-3 rounded-4 mb-3`;
        div.innerHTML = `<p class="mb-0 small fw-bold">${text}</p><small class="opacity-50 d-block mt-1">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>`;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function handleSend() {
        const msg = input.value.trim().toLowerCase();
        if (!msg) return;
        appendMsg(input.value, 'user');
        input.value = '';

        setTimeout(() => {
            let reply = responses.default;
            for (let key in responses) {
                if (msg.includes(key)) {
                    reply = responses[key];
                    break;
                }
            }
            appendMsg(reply, 'bot');
        }, 800);
    }

    sendBtn.onclick = handleSend;
    input.onkeypress = (e) => { if(e.key === 'Enter') handleSend(); };
}

// ─── EMOTION DETECTION (SIMULATED FOR CLIENT-SIDE STABILITY) ───────────────────────────
function initEmotion() {
    const video = document.getElementById('video');
    const startBtn = document.getElementById('start-camera');
    const overlay = document.getElementById('detection-msg');
    const resultLabel = document.getElementById('emotion-label');
    if (!video || !startBtn || !overlay || !resultLabel) return;

    startBtn.onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            overlay.classList.add('hidden');
            startDetection();
        } catch (err) {
            console.error(err);
            alert("Camera access denied. Please allow camera permissions to use this feature.");
        }
    };

    function startDetection() {
        const emotions = [
            { label: "Happy", icon: "fa-face-grin-beam", advice: "You seem happy! Keep spreading those positive vibes today." },
            { label: "Sad", icon: "fa-face-sad-tear", advice: "It's okay to feel low. Maybe try listening to your favorite music or talking to a friend?" },
            { label: "Stressed", icon: "fa-face-grimace", advice: "You look a bit stressed. Take 5 minutes to practice deep breathing or a short meditation." },
            { label: "Calm", icon: "fa-face-smile", advice: "You look peaceful. A great time for some productive work or a relaxing read!" }
        ];

        // Simulate real-time analysis
        setInterval(() => {
            const random = emotions[Math.floor(Math.random() * emotions.length)];
            resultLabel.innerHTML = `<i class="fa-solid ${random.icon} fs-4 text-blue"></i> <span class="fw-bold text-dark">${random.label}</span>`;
            const adviceEl = document.getElementById('emotion-advice');
            if (adviceEl) adviceEl.innerText = random.advice;
        }, 4000);
    }
}
