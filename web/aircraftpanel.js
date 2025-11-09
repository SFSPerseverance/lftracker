// Aircraft Details Panel
// Shows a sliding panel from the left when an aircraft is clicked

// Global variable to track selected aircraft
window.selectedAircraft = null;

const usernameCache = new Map();

// Initialize Supabase client
const SUPABASE_URL = 'https://qhffydtxzlwoxgllvtif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZmZ5ZHR4emx3b3hnbGx2dGlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NzkwNjAsImV4cCI6MjA3ODE1NTA2MH0.CAacFj8c14KlGu0HJ_1Zjf6hVadaGd5hPJleH8zftIQ';

// Load Supabase if not already loaded
if (typeof supabase === 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js';
  document.head.appendChild(script);
}

let supabaseClient;
function getSupabaseClient() {
  if (!supabaseClient && typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// Create the panel element
function createAircraftPanel() {
  // Check if panel already exists
  let panel = document.getElementById('aircraft-panel');
  if (panel) return panel;

  // Create panel container
  panel = document.createElement('div');
  panel.id = 'aircraft-panel';

  // Callsign header
  const callsignHeader = document.createElement('div');
  callsignHeader.id = 'aircraft-callsign';
  panel.appendChild(callsignHeader);

  const pilotHeader = document.createElement('div');
  pilotHeader.id = 'aircraft-pilot';
  panel.appendChild(pilotHeader);

  // Image container (16:9 aspect ratio)
  const imageContainer = document.createElement('div');
  imageContainer.id = 'aircraft-image-container';

  const placeholderText = document.createElement('div');
  placeholderText.textContent = 'No Image';
  imageContainer.appendChild(placeholderText);

  panel.appendChild(imageContainer);

  // Aircraft type
  const aircraftType = document.createElement('div');
  aircraftType.id = 'aircraft-type';
  panel.appendChild(aircraftType);

  const aircraftAirline = document.createElement('div');
  aircraftAirline.id = 'aircraft-airline';
  panel.appendChild(aircraftAirline);

  // Close button (X in top right of panel)
  const closeButton = document.createElement('button');
  closeButton.id = 'aircraft-panel-close';
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', closeAircraftPanel);
  panel.appendChild(closeButton);

  document.body.appendChild(panel);

  // Load Press Start 2P font
  if (!document.getElementById('press-start-2p-font')) {
    const link = document.createElement('link');
    link.id = 'press-start-2p-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    document.head.appendChild(link);
  }

  return panel;
}

async function getRobloxUsername(userId) {
  // Check cache first
  if (usernameCache.has(userId)) {
    return usernameCache.get(userId);
  }

  try {
    const response = await fetch(`https://users.roproxy.com/v1/users/${userId}`);
    if (!response.ok) {
      throw new Error('User not found');
    }
    const data = await response.json();
    const username = data.name;

    // Cache the result
    usernameCache.set(userId, username);
    return username;
  } catch (error) {
    console.error('Error fetching Roblox username:', error);
    return null;
  }
}

const callsignToAirline = {
  "HONG KONG DRAGON": "Dragonair",
  "MALÉV": "Malév",
  "RCAF": "Royal Canadian Air Force",
  "DEV": "Developer",
  "HAPAG LLOYD": "Hapag-Lloyd",
  "BRANIFF": "Braniff International",
  "SPEEDBIRD": "British Airways",
  "KLM": "KLM Royal Dutch Airlines",
  "FLA PALM": "Air Florida x Singapore Airlines",
  "MAERSKAIR": "Malaysian Airlines",
  "SAUDIA": "Saudia",
  "ROY": "Royal Canada",
  "BAHAMAS": "Bahamasair",
  "PEOPLE": "People Express",
  "DELTA": "Delta Air Lines",
  "EASTERN": "Eastern Air Lines",
  "HAWAIIAN": "Hawaiian Airlines",
  "SUN": "Sun International",
  "INDAIR": "Indian Airlines",
  "CLIPPER": "Pan Am",
  "OCEANIC": "Oceanic Airlines",
  "SHAMROCK": "Aer Lingus",
  "CSN": "China Southern",
  "THAI": "Thai Airways",
  "ANSETT": "Ansett Australia",
  "PIEDMONT": "Piedmont Airlines",
  "MOZAMBIQUE": "LAM Mozambique Airlines",
  "AIR TRANSAT": "Air Transat",
  "JORDANIAN": "Royal Jordanian",
  "CONDOR": "Condor",
  "BAC": "Home Delivery",
  "ALL NIPPON": "CP (All Nippon Airways)",
  "CATHAY": "Cathay Pacific",
  "RYANAIR": "Ryanair",
  "CACTUS": "America West",
  "TAG AVIATION": "TAG Aviation",
  "WORLDWAYS": "Worldways Canada",
  "LEGACY": "Legacy",
  "AVIANCA": "Avianca",
  "POKO": "Poko",
  "CONTINENTAL": "Continental Airlines",
  "AIRFRANS": "Air France",
  "FLEXAIR": "Florida Express",
  "AERO ASIA": "Aero Asia",
  "SAS": "Scandinavian Airlines",
  "SCANDINAVIAN": "Scandinavian Airlines",
  "AEROPERÚ": "Aeroperú",
  "LUFTHANSA": "Lufthansa",
  "AIR PORTUGAL": "TAP Air Portugal",
  "AIRCAL": "Air California",
  "ANA": "All Nippon Airways",
  "EMPRESS": "ANA Cargo",
  "BOEING": "Boeing",
  "CANADAIR": "Canadair",
  "ALOHA": "Aloha Airlines",
  "QUEBECAIR": "Quebecair",
  "CYPRUS": "Cyprus Airways",
  "LTU": "LTU International",
  "DUB": "Emirates (Dubai)",
  "USAIR": "USAir",
  "QANTAS": "Qantas",
  "NASA": "NASA",
  "TWA": "Trans World Airlines",
  "SOUTHWEST": "Southwest Airlines",
  "THAI AIR": "Thai Airways",
  "AMERICAN": "American Airlines",
  "BEATOURS": "British Airtours",
  "WEST INDIAN": "BWIA West Indies Airways",
  "AIR CANADA": "Air Canada",
  "TRANSAERO": "Transaero Airlines",
  "UNITED": "United Airlines",
  "ALPHA USER": "Alpha User",
  "SWISSAIR": "Swissair",
  "DTA": "Angola Airlines"
};

// Fetch aircraft image from Supabase
async function getAircraftImage(icao, livery) {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('Supabase client not initialized yet');
    return null;
  }

  try {
    // Query the images table for matching ICAO and livery
    const { data, error } = await client
      .from('images')
      .select('public_url, crop_json, created_at')
      .eq('icao', icao)
      .eq('livery', livery)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching aircraft image:', error);
      return null;
    }

    if (data && data.length > 0) {
      return {
        url: data[0].public_url,
        cropJson: data[0].crop_json
      };
    }

    return null;
  } catch (error) {
    console.error('Error querying Supabase:', error);
    return null;
  }
}

// Function to extract userId from aircraft.id
function extractUserId(aircraftId) {
  if (!aircraftId) return null;
  const parts = aircraftId.split('&@');
  return parts[0] || null;
}

// Show aircraft details in the panel
window.showAircraftDetails = async function (aircraft) {
  closeAircraftPanel();
  const url = new URL(location.href);
  url.searchParams.set('aircraft', aircraft.id);
  history.pushState({ aircraft: aircraft.id }, '', url.toString());
  window.selectedAircraft = aircraft;

  const aircraftId = aircraft.id || aircraft.callsign;
  const marker = document.querySelector(`[data-aircraft-id="${aircraftId}"]`);
  if (marker) {
    const icon = marker.querySelector('path');
    if (icon) {
      icon.setAttribute('fill', 'rgb(230, 77, 46)');
    }
  }

  const panel = createAircraftPanel();

  // Update callsign
  const callsignEl = document.getElementById('aircraft-callsign');
  callsignEl.textContent = aircraft.callsign || 'Unknown';

  const userId = aircraft.pilot;
  let username = 'Unknown Player';

  if (userId) {
    // Fetch username
    const fetchedUsername = await getRobloxUsername(userId);
    if (fetchedUsername) {
      username = fetchedUsername;
    }
  }

  const pilotEl = document.getElementById('aircraft-pilot');
  pilotEl.textContent = username || 'Unknown';

  // Update image container with loading state
  const imageContainer = document.getElementById('aircraft-image-container');
  imageContainer.innerHTML = '<div style="color: rgba(255,255,255,0.5);">Loading image...</div>';

  // Fetch aircraft image from Supabase
  const icao = aircraft.icao || 'UNKN';
  const livery = aircraft.airline || 'Default'; // Use airline as livery, or adjust based on your data structure

  const imageData = await getAircraftImage(icao, livery);

  // Clear loading state
  imageContainer.innerHTML = '';

  if (imageData && imageData.url) {
    const img = document.createElement('img');
    img.src = imageData.url;
    img.alt = `${icao} - ${livery}`;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    
    // Handle image load error
    img.onerror = () => {
      imageContainer.innerHTML = '<div>Image failed to load</div>';
    };
    
    imageContainer.appendChild(img);
  } else {
    // Show placeholder if no image found
    const placeholderText = document.createElement('div');
    placeholderText.textContent = 'No Image Available';
    placeholderText.style.color = 'rgba(255,255,255,0.3)';
    imageContainer.appendChild(placeholderText);
  }

  // Update aircraft type
  const typeEl = document.getElementById('aircraft-type');
  const rest = (aircraft.airframe || '') + (aircraft.subtype || '');

  const airlineEl = document.getElementById('aircraft-airline');
  const baseCallsign = aircraft.callsign.split('-')[0].toUpperCase();
  const airline = callsignToAirline[baseCallsign] || 'Unknown Airline';
  const prefix = 'Operated by: ';

  typeEl.innerHTML = `
    <span class="icao-badge">${icao}</span>
    <span class="airframe-text"> | ${rest}</span>
  `;

  airlineEl.innerHTML = `
    <span class="airframe-text">${prefix}</span>
    <span class="icao-badge">${airline}</span>
  `;

  // Slide panel in
  panel.style.left = '0';
};

// Close the aircraft panel
window.closeAircraftPanel = function () {
  const panel = document.getElementById('aircraft-panel');
  if (panel) {
    panel.style.left = '-20%';
  }
  if (window.selectedAircraft) {
    const aircraftId = window.selectedAircraft.id || window.selectedAircraft.callsign;
    const marker = document.querySelector(`[data-aircraft-id="${aircraftId}"]`);
    if (marker) {
      const icon = marker.querySelector('path');
      if (icon) {
        icon.setAttribute('fill', 'rgb(255, 170, 0)');
      }
    }
  }
  const url = new URL(location.href);
  url.searchParams.delete('aircraft');  
  history.pushState({}, '', url.toString());
  window.selectedAircraft = null;
};

// Close panel on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAircraftPanel();
  }
});