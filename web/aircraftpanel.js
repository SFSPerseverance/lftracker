// Aircraft Details Panel
// Shows a sliding panel from the left when an aircraft is clicked

// Global variable to track selected aircraft
window.selectedAircraft = null;

const usernameCache = new Map();

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

// Function to extract userId from aircraft.id
function extractUserId(aircraftId) {
  if (!aircraftId) return null;
  const parts = aircraftId.split('&@');
  return parts[0] || null;
}

// Show aircraft details in the panel
window.showAircraftDetails = async function(aircraft) {
  closeAircraftPanel();
  console.log('aircraft payload:', aircraft);
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
  
  // Update image (placeholder for now)
  const imageContainer = document.getElementById('aircraft-image-container');
  imageContainer.innerHTML = '';
  
  // If aircraft has an image URL, display it
  if (aircraft.imageUrl) {
    const img = document.createElement('img');
    img.src = aircraft.imageUrl;
    imageContainer.appendChild(img);
  } else {
    // Show placeholder
    const placeholderText = document.createElement('div');
    placeholderText.textContent = 'No Image';
    imageContainer.appendChild(placeholderText);
  }
  
  // Update aircraft type
  const typeEl = document.getElementById('aircraft-type');
  const icao = aircraft.icao || 'UNKN';
  const rest = (aircraft.airframe || '') + (aircraft.subtype || '');

  typeEl.innerHTML = `
    <span class="icao-badge">${icao}</span>
    <span class="airframe-text"> | ${rest}</span>
  `;
  
  // Slide panel in
  panel.style.left = '0';
};

// Close the aircraft panel
window.closeAircraftPanel = function() {
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
  window.selectedAircraft = null;
};

// Close panel on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAircraftPanel();
  }
});