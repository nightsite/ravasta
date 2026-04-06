import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, deleteDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCoWq13MkkVdOY_tjPhHOewIbYTs_Y-Rfk",
  authDomain: "ravasta-bcdd9.firebaseapp.com",
  projectId: "ravasta-bcdd9",
  storageBucket: "ravasta-bcdd9.firebasestorage.app",
  messagingSenderId: "525492093942",
  appId: "1:525492093942:web:17447a5880c7aa13e83dd7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUser = null;
let editId = null; 
let deleteId = null; 
let allEntries = []; 
let activeDateFilter = null; 

let currentPage = 1;
const ENTRIES_PER_PAGE = 4;
let totalPagesGlobal = 1;

// --- DOM ELEMENTE ---
const loginOverlay = document.getElementById('login-overlay');
const entryModal = document.getElementById('entry-modal');
const deleteModal = document.getElementById('delete-modal');
const earwormModal = document.getElementById('earworm-modal');
const diaryFeed = document.getElementById('diary-feed');

const searchToggleBtn = document.getElementById('search-toggle-btn');
const dateDropdown = document.getElementById('date-dropdown');
const filterDD = document.getElementById('filter-dd');
const filterMM = document.getElementById('filter-mm');
const filterYYYY = document.getElementById('filter-yyyy');

// --- LOGIN & ONLINE STATUS ---
function loginUser(name) {
    currentUser = name;
    loginOverlay.style.opacity = '0';
    setTimeout(() => loginOverlay.style.display = 'none', 500);
    updateOnlineStatus();
}

document.getElementById('btn-asta').onclick = () => loginUser('Asta');
document.getElementById('btn-raven').onclick = () => loginUser('Raven');

async function updateOnlineStatus() {
    if (!currentUser) return;
    await setDoc(doc(db, "presence", currentUser), { lastSeen: serverTimestamp() });
}

setInterval(updateOnlineStatus, 60000); 

onSnapshot(collection(db, "presence"), (snapshot) => {
    snapshot.forEach(doc => {
        const data = doc.data();
        const isOnline = data.lastSeen && (Date.now() - data.lastSeen.toDate().getTime() < 120000); 
        const dot = document.getElementById(`status-${doc.id.toLowerCase()}`);
        if (dot) dot.className = isOnline ? 'status-dot status-online' : 'status-dot';
    });
});


// --- SPOTIFY OHRWURM LOGIK ---
function extractSpotifyTrackId(url) {
    const match = url.match(/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

function renderSpotifyPlayer(containerId, trackId) {
    const container = document.getElementById(containerId);
    if (trackId) {
        container.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${trackId}?theme=0" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style="width: 100%; height: 152px; border-radius:12px; border:none; display:block;"></iframe>`;
    } else {
        container.innerHTML = `<div class="spotify-empty">Wählt noch...</div>`;
    }
}

onSnapshot(doc(db, "settings", "earworms"), (docSnap) => {
    if (docSnap.exists()) {
        const data = docSnap.data();
        renderSpotifyPlayer('spotify-asta', data.Asta);
        renderSpotifyPlayer('spotify-raven', data.Raven);
    }
});

document.getElementById('edit-earworm-btn').onclick = () => {
    document.getElementById('earworm-input').value = '';
    earwormModal.style.display = "block";
};
document.getElementById('close-earworm').onclick = () => earwormModal.style.display = "none";

document.getElementById('save-earworm-btn').onclick = async () => {
    const url = document.getElementById('earworm-input').value.trim();
    const trackId = extractSpotifyTrackId(url);

    if(!trackId) {
        alert("Das sieht nicht wie ein gültiger Spotify Track-Link aus 🤔");
        return;
    }

    await setDoc(doc(db, "settings", "earworms"), {
        [currentUser]: trackId
    }, { merge: true });

    earwormModal.style.display = "none";
};


// --- DATUMS-DROPDOWN ---
searchToggleBtn.onclick = () => dateDropdown.classList.toggle('show');

document.addEventListener('click', (e) => {
    if (!searchToggleBtn.contains(e.target) && !dateDropdown.contains(e.target)) {
        dateDropdown.classList.remove('show');
    }
});

filterDD.addEventListener('input', () => { if (filterDD.value.length === 2) filterMM.focus(); });
filterMM.addEventListener('input', () => { if (filterMM.value.length === 2) filterYYYY.focus(); });
filterMM.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && filterMM.value.length === 0) filterDD.focus(); });
filterYYYY.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && filterYYYY.value.length === 0) filterMM.focus(); });

document.getElementById('apply-date-btn').onclick = () => {
    let dd = filterDD.value.trim();
    let mm = filterMM.value.trim();
    let yyyy = filterYYYY.value.trim();

    if(dd && mm && yyyy) {
        activeDateFilter = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        currentPage = 1; 
        renderFeed();
        dateDropdown.classList.remove('show');
    } else {
        alert("Bitte fülle TT, MM und YYYY aus ✨");
    }
};

document.getElementById('clear-date-btn').onclick = () => {
    filterDD.value = ''; filterMM.value = ''; filterYYYY.value = '';
    activeDateFilter = null;
    currentPage = 1; 
    renderFeed();
    dateDropdown.classList.remove('show');
};


// --- TAGEBUCH DATEN LADEN & PAGINATION ---
const entriesQuery = query(collection(db, "diary_entries"), orderBy("timestamp", "desc"));

onSnapshot(entriesQuery, (snapshot) => {
    allEntries = [];
    snapshot.forEach(doc => allEntries.push({ id: doc.id, data: doc.data() }));
    renderFeed(); 
});

function renderFeed() {
    diaryFeed.innerHTML = ''; 
    let filteredEntries = allEntries;

    if (activeDateFilter) {
        filteredEntries = allEntries.filter(entry => {
            if (!entry.data.timestamp) return false;
            const dateObj = entry.data.timestamp.toDate();
            const localDate = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            return localDate === activeDateFilter;
        });
    }

    const paginationControls = document.getElementById('pagination-controls');

    if (filteredEntries.length === 0) {
        diaryFeed.innerHTML = '<p style="text-align: center; color: #8a8296; margin-top: 50px;">Keine Einträge gefunden. ✨</p>';
        paginationControls.style.display = 'none';
        return;
    }

    totalPagesGlobal = Math.ceil(filteredEntries.length / ENTRIES_PER_PAGE) || 1;
    if (currentPage > totalPagesGlobal) currentPage = totalPagesGlobal;

    const startIndex = (currentPage - 1) * ENTRIES_PER_PAGE;
    const endIndex = startIndex + ENTRIES_PER_PAGE;
    const entriesToShow = filteredEntries.slice(startIndex, endIndex);

    entriesToShow.forEach(entry => renderEntryCard(entry.id, entry.data));

    if (totalPagesGlobal > 1) {
        paginationControls.style.display = 'flex';
        document.getElementById('page-info').innerText = `Seite ${currentPage} von ${totalPagesGlobal}`;
        document.getElementById('prev-page-btn').disabled = currentPage === 1;
        document.getElementById('next-page-btn').disabled = currentPage === totalPagesGlobal;
    } else {
        paginationControls.style.display = 'none';
    }
}

document.getElementById('prev-page-btn').onclick = () => {
    if (currentPage > 1) {
        currentPage--;
        renderFeed();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

document.getElementById('next-page-btn').onclick = () => {
    if (currentPage < totalPagesGlobal) {
        currentPage++;
        renderFeed();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};


// --- KARTEN ZEICHNEN ---
function renderEntryCard(id, data) {
    const card = document.createElement('div');
    card.className = `entry-card entry-${data.author.toLowerCase()}`;
    
    let dateStr = 'Gerade eben';
    if (data.timestamp) {
        const d = data.timestamp.toDate();
        dateStr = d.toLocaleDateString('de-DE') + ' - ' + d.toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'});
    }

    const specialHtml = data.special ? `<div class="special-box">✨ ${escapeHTML(data.special)}</div>` : '';
    
    const authorHtml = data.author === 'Asta' 
        ? `<span class="white-owl">🦉</span> Asta` 
        : `<img src="raven.png" class="custom-avatar" alt="Raven"> Raven`;

    const reactions = data.reactions || {};
    const heartCount = reactions['🤍'] || 0;
    const sparkleCount = reactions['✨'] || 0;
    const softCount = reactions['🥺'] || 0;

    let existingReactionsHtml = '';
    if (heartCount > 0) existingReactionsHtml += `<button class="react-btn heart-btn">🤍 <span>${heartCount}</span></button>`;
    if (sparkleCount > 0) existingReactionsHtml += `<button class="react-btn sparkle-btn">✨ <span>${sparkleCount}</span></button>`;
    if (softCount > 0) existingReactionsHtml += `<button class="react-btn soft-btn">🥺 <span>${softCount}</span></button>`;

    card.innerHTML = `
        <div class="card-header">
            <span class="author-tag">${authorHtml}</span>
            <span class="mood-badge">Vibe: ${data.mood}% | ${dateStr}</span>
        </div>
        
        <p class="entry-text">${escapeHTML(data.text)}</p>
        ${specialHtml}
        
        <div class="reaction-bar">
            ${existingReactionsHtml}
            
            <div class="reaction-picker-wrapper">
                <button class="react-btn add-reaction-btn" title="Reagieren">➕</button>
                <div class="reaction-popup">
                    <button class="popup-emoji" data-emoji="🤍">🤍</button>
                    <button class="popup-emoji" data-emoji="✨">✨</button>
                    <button class="popup-emoji" data-emoji="🥺">🥺</button>
                </div>
            </div>
        </div>
        
        <div class="card-actions">
            <button class="icon-btn edit-btn" title="Bearbeiten">✏️</button>
            <button class="icon-btn delete-btn" title="Löschen">🗑️</button>
        </div>
    `;

    card.querySelector('.delete-btn').onclick = () => {
        deleteId = id;
        deleteModal.style.display = "block";
    };

    card.querySelector('.edit-btn').onclick = () => {
        editId = id;
        document.getElementById('modal-title').innerText = "Eintrag bearbeiten ✏️";
        document.getElementById('entry-input').value = data.text;
        document.getElementById('special-input').value = data.special || '';
        document.getElementById('mood-slider').value = data.mood;
        document.getElementById('mood-value').innerText = `${data.mood}%`;
        entryModal.style.display = "block";
    };

    const updateReaction = async (emoji) => {
        const currentCount = (data.reactions && data.reactions[emoji]) ? data.reactions[emoji] : 0;
        await setDoc(doc(db, "diary_entries", id), {
            reactions: { ...data.reactions, [emoji]: currentCount + 1 }
        }, { merge: true });
    };

    const popup = card.querySelector('.reaction-popup');
    card.querySelector('.add-reaction-btn').onclick = () => popup.classList.toggle('show');

    card.querySelectorAll('.popup-emoji').forEach(btn => {
        btn.onclick = () => {
            updateReaction(btn.dataset.emoji);
            popup.classList.remove('show');
        };
    });

    const heartBtn = card.querySelector('.heart-btn');
    if (heartBtn) heartBtn.onclick = () => updateReaction('🤍');
    
    const sparkleBtn = card.querySelector('.sparkle-btn');
    if (sparkleBtn) sparkleBtn.onclick = () => updateReaction('✨');
    
    const softBtn = card.querySelector('.soft-btn');
    if (softBtn) softBtn.onclick = () => updateReaction('🥺');

    diaryFeed.appendChild(card);
}


// --- EINTRAG SPEICHERN ---
document.getElementById('open-modal-btn').onclick = () => { 
    editId = null; 
    document.getElementById('modal-title').innerText = "Neuer Tagebucheintrag 🌸";
    document.getElementById('entry-input').value = '';
    document.getElementById('special-input').value = '';
    document.getElementById('mood-slider').value = 50;
    document.getElementById('mood-value').innerText = '50%';
    entryModal.style.display = "block"; 
};

document.getElementById('close-entry').onclick = () => entryModal.style.display = "none";
document.getElementById('mood-slider').addEventListener('input', (e) => document.getElementById('mood-value').innerText = `${e.target.value}%`);

document.getElementById('save-btn').onclick = async () => {
    const textVal = document.getElementById('entry-input').value.trim();
    if (!textVal) return alert("Bitte schreibe zumindest einen kurzen Text! 💌");

    const data = {
        text: textVal,
        special: document.getElementById('special-input').value.trim(),
        mood: document.getElementById('mood-slider').value,
        author: currentUser,
        timestamp: serverTimestamp()
    };

    try {
        if (editId) await updateDoc(doc(db, "diary_entries", editId), data);
        else await addDoc(collection(db, "diary_entries"), data);
        
        if (!editId) {
            currentPage = 1;
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        entryModal.style.display = "none";
    } catch (error) {
        console.error("Fehler: ", error);
        alert("Speichern fehlgeschlagen.");
    }
};

document.getElementById('cancel-delete-btn').onclick = () => {
    deleteId = null;
    deleteModal.style.display = "none";
};

document.getElementById('confirm-delete-btn').onclick = async () => {
    if (deleteId) {
        await deleteDoc(doc(db, "diary_entries", deleteId));
        deleteId = null;
        deleteModal.style.display = "none";
    }
};

// Der reparierte Escape-Block (kein Syntax-Fehler mehr!)
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
}