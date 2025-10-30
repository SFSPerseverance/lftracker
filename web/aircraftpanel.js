// Aircraft Details Panel
// Shows a sliding panel from the left when an aircraft is clicked

// Global variable to track selected aircraft
window.selectedAircraft = null;

// Create the panel element
function createAircraftPanel() {
  // Check if panel already exists
  let panel = document.getElementById('aircraft-panel');
  if (panel) return panel;

  // Create panel container
  panel = document.createElement('div');
  panel.id = 'aircraft-panel';
  
  // Panel styles
  Object.assign(panel.style, {
    position: 'fixed',
    left: '-20%',
    top: '0',
    width: '20%',
    height: '100vh',
    backgroundColor: 'rgb(26, 26, 26)',
    border: '3px solid rgb(255, 170, 0)',
    borderLeft: 'none',
    borderTopRightRadius: '12px',
    borderBottomRightRadius: '12px',
    padding: '20px',
    boxSizing: 'border-box',
    zIndex: 10000,
    transition: 'left 0.4s cubic-bezier(0.4, 0.0, 0.2, 1)',
    overflowY: 'auto',
    fontFamily: '"Press Start 2P", cursive',
    color: 'white'
  });

  // Callsign header
  const callsignHeader = document.createElement('div');
  callsignHeader.id = 'aircraft-callsign';
  Object.assign(callsignHeader.style, {
    fontSize: '16px',
    marginBottom: '20px',
    textAlign: 'left',
    wordBreak: 'break-word'
  });
  panel.appendChild(callsignHeader);

  // Image container (16:9 aspect ratio)
  const imageContainer = document.createElement('div');
  imageContainer.id = 'aircraft-image-container';
  Object.assign(imageContainer.style, {
    width: '100%',
    aspectRatio: '16 / 9',
    backgroundColor: 'rgb(40, 40, 40)',
    border: '2px solid rgb(255, 170, 0)',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  });

  const placeholderText = document.createElement('div');
  placeholderText.textContent = 'No Image';
  placeholderText.style.fontSize = '10px';
  placeholderText.style.color = 'rgb(100, 100, 100)';
  imageContainer.appendChild(placeholderText);

  panel.appendChild(imageContainer);

  // Aircraft type
  const aircraftType = document.createElement('div');
  aircraftType.id = 'aircraft-type';
  Object.assign(aircraftType.style, {
    fontSize: '12px',
    textAlign: 'left',
    wordBreak: 'break-word'
  });
  panel.appendChild(aircraftType);

  // Close button (X in top right of panel)
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  Object.assign(closeButton.style, {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    color: 'rgb(255, 170, 0)',
    fontSize: '24px',
    cursor: 'pointer',
    fontFamily: 'Arial, sans-serif',
    padding: '5px 10px',
    lineHeight: '1'
  });
  closeButton.addEventListener('click', closeAircraftPanel);
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.color = 'white';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.color = 'rgb(255, 170, 0)';
  });
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

// Show aircraft details in the panel
window.showAircraftDetails = function(aircraft) {
  window.selectedAircraft = aircraft;
  
  const panel = createAircraftPanel();
  
  // Update callsign
  const callsignEl = document.getElementById('aircraft-callsign');
  callsignEl.textContent = aircraft.callsign || aircraft.id || 'Unknown';
  
  // Update image (placeholder for now)
  const imageContainer = document.getElementById('aircraft-image-container');
  imageContainer.innerHTML = '';
  
  // If aircraft has an image URL, display it
  if (aircraft.imageUrl) {
    const img = document.createElement('img');
    img.src = aircraft.imageUrl;
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    });
    imageContainer.appendChild(img);
  } else {
    // Show placeholder
    const placeholderText = document.createElement('div');
    placeholderText.textContent = 'No Image';
    placeholderText.style.fontSize = '10px';
    placeholderText.style.color = 'rgb(100, 100, 100)';
    imageContainer.appendChild(placeholderText);
  }
  
  // Update aircraft type
  const typeEl = document.getElementById('aircraft-type');
  typeEl.textContent = aircraft.aircraftType || aircraft.type || 'Unknown Type';
  
  // Slide panel in
  panel.style.left = '0';
};

// Close the aircraft panel
window.closeAircraftPanel = function() {
  const panel = document.getElementById('aircraft-panel');
  if (panel) {
    panel.style.left = '-20%';
  }
  window.selectedAircraft = null;
};

// Close panel when clicking outside of it
document.addEventListener('click', (e) => {
  const panel = document.getElementById('aircraft-panel');
  if (panel && panel.style.left === '0px') {
    // Check if click is outside panel
    const rect = panel.getBoundingClientRect();
    if (e.clientX > rect.right || e.clientX < rect.left || 
        e.clientY < rect.top || e.clientY > rect.bottom) {
      // Don't close if clicking on an aircraft marker
      if (!e.target.closest('[data-aircraft-id]')) {
        closeAircraftPanel();
      }
    }
  }
});

// Close panel on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAircraftPanel();
  }
});

console.log('Aircraft panel script loaded');