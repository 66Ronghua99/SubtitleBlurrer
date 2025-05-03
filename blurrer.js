let blurOverlay = null;
let activeVideo = null; // Track the video currently intended to have the blur
let resizeObserver = null; // Keep observer reference for cleanup/re-observing
let isBlurEnabled = false; // New state variable to track if blur is enabled

previousWidthPercentage = 0;
previousHeightPercentage = 0;
previousLeftPercentage = 0;
previousTopPercentage = 0;

// --- New Drag/Resize State ---
let isDragging = false;
let isResizing = false;
let resizeHandle = null; // Tracks which handle is being used ('se', 's', 'e', etc.)
let manualPositioning = true; // Flag: true if user has manually moved/resized the overlay

// Variables to store initial state for drag/resize calculations
let startClientX, startClientY; // Mouse/touch coordinates when drag/resize starts
let startOffsetLeft, startOffsetTop, startOffsetWidth, startOffsetHeight; // Element position/size when drag/resize starts

// --- Function to Find Video Parent for Positioning ---
// Helper to find a suitable parent for the overlay when not in fullscreen
function findPositionedParent(element) {
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (style.position !== 'static') {
            // Found a positioned ancestor (relative, absolute, fixed, sticky)
            return parent;
        }
        parent = parent.parentElement;
    }
    // If no positioned parent found, make the direct parent relative
    parent = element.parentElement;
    if (parent && window.getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative'; // Make it a positioning context
        parent.dataset.madeRelative = 'true'; // Mark it for potential cleanup
    } else if (!parent) {
        // Should not happen often, but handle missing parent
        parent = document.body;
    }
    return parent;
}

// --- Clean up parent position if we set it ---
function cleanupRelativePosition(element) {
    let parent = element.parentElement;
    // Check only the direct parent we might have modified
    if (parent && parent.dataset.madeRelative === 'true') {
        // Check if any other children require it to stay relative?
        // For simplicity now, we just remove it. A more robust check might be needed.
        parent.style.position = ''; // Reset to default (usually static)
        delete parent.dataset.madeRelative;
    }
}

// --- Modified Toggle UI Creation ---
function createToggleButton() {
    // Remove any existing toggle button first
    const existingToggle = document.getElementById('blurscript-toggle');
    if (existingToggle) {
        existingToggle.remove();
    }
    
    const toggleContainer = document.createElement('div');
    toggleContainer.id = 'blurscript-toggle';
    toggleContainer.style.cssText = `
        position: fixed;
        right: 20px;
        top: 20px;
        z-index: 10000;
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 8px 12px;
        border-radius: 25px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        transition: opacity 0.3s;
        opacity: 0.8;
    `;
    toggleContainer.innerHTML = `
        <span style="margin-right: 8px;">BlurScript</span>
        <div class="toggle-switch" style="
            width: 36px;
            height: 20px;
            background-color: ${isBlurEnabled ? '#4cd964' : '#ccc'};
            border-radius: 10px;
            position: relative;
            transition: background-color 0.3s;
        ">
            <div class="toggle-knob" style="
                width: 16px;
                height: 16px;
                background-color: white;
                border-radius: 50%;
                position: absolute;
                top: 2px;
                left: ${isBlurEnabled ? '18px' : '2px'};
                transition: left 0.3s;
            "></div>
        </div>
    `;

    // Add hover effect
    toggleContainer.addEventListener('mouseenter', () => {
        toggleContainer.style.opacity = '1';
    });

    toggleContainer.addEventListener('mouseleave', () => {
        toggleContainer.style.opacity = '0.8';
    });

    // Add toggle functionality
    toggleContainer.addEventListener('click', toggleBlurFeature);

    // Auto-hide the toggle after 5 seconds
    setTimeout(() => {
        if (toggleContainer && toggleContainer.parentNode) {
            toggleContainer.style.opacity = '0';
            setTimeout(() => {
                if (toggleContainer && toggleContainer.parentNode) {
                    toggleContainer.remove();
                }
            }, 300); // Remove after fade animation
        }
    }, 5000);
    
    // Add to document
    document.body.appendChild(toggleContainer);
    
    console.log('BlurScript toggle button created');
    return toggleContainer;
}

// --- Toggle Blur Feature ---
function toggleBlurFeature() {
    isBlurEnabled = !isBlurEnabled;
    console.log('BlurScript toggled:', isBlurEnabled ? 'enabled' : 'disabled');

    // Update toggle UI
    const toggleContainer = document.getElementById('blurscript-toggle');
    if (toggleContainer) {
        const toggleSwitch = toggleContainer.querySelector('.toggle-switch');
        const toggleKnob = toggleContainer.querySelector('.toggle-knob');

        if (toggleSwitch && toggleKnob) {
            toggleSwitch.style.backgroundColor = isBlurEnabled ? '#4cd964' : '#ccc';
            toggleKnob.style.left = isBlurEnabled ? '18px' : '2px';
        }
    }

    // Handle overlay visibility based on new toggle state
    if (isBlurEnabled) {
        // Re-enable blur if a video is active
        if (activeVideo && !activeVideo.paused) {
            createOrUpdateBlurOverlay();
        }
    } else {
        // Hide overlay when disabled
        if (blurOverlay) {
            blurOverlay.style.display = 'none';
        }
    }
}

// --- Create/Update Overlay ---
function createOrUpdateBlurOverlay() {
    // Don't create/update if blur is disabled
    if (!isBlurEnabled) {
        return;
    }

    // console.log('createOrUpdateBlurOverlay called for video:', activeVideo, 'Manual mode:', manualPositioning);
    if (!activeVideo) {
        removeBlurOverlay(); // Remove if no active video
        return;
    }

    const isFullscreen = !!document.fullscreenElement;
    // Determine the correct parent for the overlay
    let overlayParent = isFullscreen ? document.fullscreenElement : findPositionedParent(activeVideo);

    // Ensure parent exists (robustness)
    if (!overlayParent) {
        console.warn("Could not determine a parent for the blur overlay. Falling back to body.");
        overlayParent = document.body; // Fallback, might have issues
    }

    if (!blurOverlay) {
        console.log('Creating new blur overlay');
        blurOverlay = document.createElement('div');
        blurOverlay.style.position = 'absolute'; // Position relative to the determined parent
        blurOverlay.style.zIndex = '9999'; // High z-index within its context
        // pointerEvents initially 'none' if not in manual mode, 'auto' if manual
        blurOverlay.style.pointerEvents = 'auto';
        blurOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)'; // Subtle dark overlay
        blurOverlay.style.backdropFilter = 'blur(8px)'; // More noticeable blur
        blurOverlay.style.boxSizing = 'border-box'; // Include border in element's total width/height
        blurOverlay.style.cursor = 'move'; // Default cursor for dragging

        // Add drag listener to the overlay itself
        blurOverlay.addEventListener('mousedown', function(event) {
            event.stopPropagation();
            startDrag(event)
        });
        blurOverlay.addEventListener('touchstart', function(event) {
            event.stopPropagation();
            startDrag(event)
        }, { passive: false });
        blurOverlay.addEventListener('touchend', function(event) {
            event.stopPropagation();
            stopDragOrResize();
        });
        blurOverlay.addEventListener('touchcancel', function(event) {
            event.stopPropagation();
        });
        blurOverlay.addEventListener('click', function(event) {
            event.stopPropagation(); // Prevent click from bubbling up
        });
        blurOverlay.addEventListener('mouseup', function(event) {
            event.stopPropagation(); // Prevent click from bubbling up
            stopDragOrResize();
        });


        // Add resize handles
        addResizeHandles(blurOverlay);

        overlayParent.appendChild(blurOverlay); // Append to correct parent
    } else if (blurOverlay.parentNode !== overlayParent) {
        console.log('Re-parenting overlay to:', overlayParent.tagName);
        // If the overlay exists but its parent is wrong (e.g., transitioning fullscreen)
        overlayParent.appendChild(blurOverlay); // Move it
        // Note: Re-parenting might affect the manual position coordinates if not handled carefully,
        // but for absolute positioning within the new parent, it often works ok if coordinates are relative to offsetParent.
    }

    updateOverlayPosition();
    blurOverlay.style.display = 'block';
    blurOverlay.style.pointerEvents = 'auto';
}

// --- Add Resize Handles ---
function addResizeHandles(overlay) {
    // Remove existing handles first if any
    removeResizeHandles(overlay);

    const handleSize = '6px';
    const handleColor = 'rgba(255, 255, 255, 0.8)';
    const opacity = "0.1"

    const handleStyle = `
        position: absolute;
        width: ${handleSize};
        height: ${handleSize};
        background: ${handleColor};
        opacity: ${opacity};
        z-index: 10001; /* Ensure handles are above the blur overlay (9999) */
        box-sizing: border-box;
    `;

    // Define handle positions and cursors
    const handles = [
        { edge: 'se', cursor: 'se-resize', style: `bottom: 0; right: 0; transform: translateX(-50%), translateY(-50%)` },
        { edge: 'nw', cursor: 'nw-resize', style: `top: 0; left: 0;` },
        { edge: 'ne', cursor: 'ne-resize', style: `top: 0; right: 0;` },
        { edge: 'sw', cursor: 'sw-resize', style: `bottom: 0; left: 0; transform: translateX(50%), translateY(-50%)` },
    ];

    handles.forEach(handleInfo => {
        const handle = document.createElement('div');
        handle.style.cssText = handleStyle + handleInfo.style;
        handle.style.cursor = handleInfo.cursor;
        handle.dataset.handle = handleInfo.edge; // Mark the handle type

        handle.addEventListener('mousedown', function(event) {
            event.stopPropagation();
            startResize(event);
        });
        handle.addEventListener('touchstart', function(event) {
            event.stopPropagation();
            startResize(event);
        }, { passive: false });
        handle.addEventListener('touchend', function(event) {
            event.stopPropagation();
            stopDragOrResize();
        });
        handle.addEventListener('touchcancel', function(event) {
            event.stopPropagation();
        });
        handle.addEventListener('click', function(event) {
            event.stopPropagation(); // Prevent click from bubbling up
        });
        handle.addEventListener('mouseup', function(event) {
            event.stopPropagation(); // Prevent click from bubbling up
            stopDragOrResize();
        });

        overlay.appendChild(handle);
        console.log('Adding handle:', handleInfo);
    });
}

// --- Remove Resize Handles ---
function removeResizeHandles(overlay) {
    if (!overlay) return;
    const handles = overlay.querySelectorAll('[data-handle]');
    handles.forEach(handle => {
        // Remove listeners first
        handle.removeEventListener('mousedown', startResize);
        handle.removeEventListener('touchstart', startResize);
        handle.parentNode.removeChild(handle);
    });
}

// --- Update Overlay Position (Automatic Mode) ---
function updateOverlayPosition() {
    // Only update automatically if not in manual positioning mode

    if (!blurOverlay || !activeVideo) {
        // console.log('Update skipped: no overlay or active video');
        return;
    }

    if (previousHeightPercentage > 0 && previousWidthPercentage > 0 && previousLeftPercentage > 0 && previousTopPercentage > 0 && previousLeftPercentage < 100 && previousTopPercentage < 100) {
        // If manual positioning was used, set the overlay to the last known position
        blurOverlay.style.left = `${activeVideo.offsetLeft + (activeVideo.offsetWidth * previousLeftPercentage / 100)}px`;
        blurOverlay.style.top = `${activeVideo.offsetTop + (activeVideo.offsetHeight * previousTopPercentage / 100)}px`;
        blurOverlay.style.width = `${activeVideo.offsetWidth * previousWidthPercentage / 100}px`;
        blurOverlay.style.height = `${activeVideo.offsetHeight * previousHeightPercentage / 100}px`;
        return;
    }

    const videoRect = activeVideo.getBoundingClientRect();

    // If the video isn't visible (e.g., display:none, or zero size), hide overlay
    if (videoRect.width === 0 || videoRect.height === 0 || videoRect.top > window.innerHeight || videoRect.bottom < 0 || videoRect.right < 0 || videoRect.left > window.innerWidth) {
        blurOverlay.style.display = 'none';
        // console.log('Video not visible, hiding overlay');
        return;
    } else {
        blurOverlay.style.display = 'block'; // Ensure it's visible if video is
    }

    const blurHeight = videoRect.height / 5; // Adjust fraction as needed
    // Calculate Y relative to the viewport first
    const videoBottomViewportY = videoRect.top + videoRect.height;
    // Position the overlay relative to the parent's origin
    // We need the video's position relative to its *positioned parent*
    const parentRect = blurOverlay.parentNode.getBoundingClientRect();

    const overlayTop = (videoBottomViewportY - blurHeight - (videoRect.height / 15)) - parentRect.top; // Small gap from bottom
    const overlayLeft = videoRect.left - parentRect.left + (videoRect.width * 0.1); // Small gap from left

    // Basic sanity check for position
    if (overlayTop < 0) console.warn("Calculated overlayTop is negative, setting to 0."); // Should not happen with correct parent
    if (overlayLeft < 0) console.warn("Calculated overlayLeft is negative, setting to 0."); // Should not happen with correct parent

    // Ensure we don't go negative, though with correct parent it's less likely
    blurOverlay.style.top = `${Math.max(0, overlayTop)}px`;
    blurOverlay.style.left = `${Math.max(0, overlayLeft)}px`;
    blurOverlay.style.width = `${videoRect.width * 0.8}px`;
    blurOverlay.style.height = `${blurHeight}px`;

}

// --- Remove Overlay ---
function removeBlurOverlay() {
    console.log('Removing blur overlay');
    if (blurOverlay) {
        // Remove listeners and handles before removing the element
        blurOverlay.removeEventListener('mousedown', startDrag);
        blurOverlay.removeEventListener('touchstart', startDrag);
        removeResizeHandles(blurOverlay);

        if (blurOverlay.parentNode) {
            blurOverlay.parentNode.removeChild(blurOverlay);
        }
    }
    blurOverlay = null;

    if (activeVideo) {
        cleanupRelativePosition(activeVideo); // Clean up parent style if we added it
    }

    activeVideo = null; // Clear active video reference

    // Reset drag/resize state
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
    console.log('Blur overlay removed, manual positioning reset.');
}

// --- Drag & Resize Functions ---

function startDrag(event) {
    // Only left mouse button or touch start
    if (event.button > 0 && !event.touches) return;
    // Don't start drag if resizing
    if (isResizing) return;

    // If clicking a handle, let startResize handle it
    if (event.target.dataset.handle) return;

    if (!blurOverlay) return;

    event.preventDefault(); // Prevent default browser drag behavior

    isDragging = true;
    blurOverlay.style.pointerEvents = 'auto'; // Make interactive

    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;

    startClientX = clientX;
    startClientY = clientY;
    
    // Store the current position relative to the offsetParent
    startOffsetLeft = blurOverlay.offsetLeft;
    startOffsetTop = blurOverlay.offsetTop;

    console.log('Drag started');
}

function startResize(event) {
    // Only left mouse button or touch start
    if (event.button > 0 && !event.touches) return;
    // Don't start resize if dragging
    if (isDragging) return;

    if (!blurOverlay || !event.target.dataset.handle) return;

    event.preventDefault(); // Prevent text selection, etc.

    isResizing = true;
    blurOverlay.style.pointerEvents = 'auto'; // Make interactive

    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;

    startClientX = clientX;
    startClientY = clientY;

    // Store the current position and size relative to the offsetParent
    startOffsetLeft = blurOverlay.offsetLeft;
    startOffsetTop = blurOverlay.offsetTop;
    startOffsetWidth = blurOverlay.offsetWidth;
    startOffsetHeight = blurOverlay.offsetHeight;

    resizeHandle = event.target.dataset.handle; // Get handle type

    console.log('Resize started:', resizeHandle);
}

function doDragOrResize(event) {
    if (!isDragging && !isResizing) return;

    const clientX = event.clientX || (event.touches ? event.touches[0].clientX : null);
    const clientY = event.clientY || (event.touches ? event.touches[0].clientY : null);

    if (clientX === null || clientY === null) return; // Handle missing touch data

    // Calculate the difference from the starting point
    const deltaX = clientX - startClientX;
    const deltaY = clientY - startClientY;

    const minSize = 20; // Minimum width/height for the overlay

    if (isDragging) {
        let newLeft = startOffsetLeft + deltaX;
        let newTop = startOffsetTop + deltaY;

        blurOverlay.style.left = `${newLeft}px`;
        blurOverlay.style.top = `${newTop}px`;

    } else if (isResizing && resizeHandle) {
        let newWidth = startOffsetWidth;
        let newHeight = startOffsetHeight;
        let newLeft = startOffsetLeft;
        let newTop = startOffsetTop;

        switch (resizeHandle) {
            case 'se':
                newWidth = startOffsetWidth + deltaX;
                newHeight = startOffsetHeight + deltaY;
                break;
            case 'nw':
                newWidth = startOffsetWidth - deltaX;
                newHeight = startOffsetHeight - deltaY;
                newLeft = startOffsetLeft + deltaX;
                newTop = startOffsetTop + deltaY;
                break;
            case 'ne':
                newWidth = startOffsetWidth + deltaX;
                newHeight = startOffsetHeight - deltaY; // Height decreases, top increases
                newTop = startOffsetTop + deltaY;
                break;
            case 'sw':
                newWidth = startOffsetWidth - deltaX; // Width decreases, left increases
                newHeight = startOffsetHeight + deltaY;
                newLeft = startOffsetLeft + deltaX;
                break;
        }

        // Apply minimum size constraints and adjust position if needed for top/left handles
        if (newWidth < minSize) {
            // If resizing from left/NW/SW, need to adjust left position to keep right edge stable
            if (resizeHandle.includes('w')) {
                newLeft = startOffsetLeft + (startOffsetWidth - minSize);
            }
            newWidth = minSize;
        }
        if (newHeight < minSize) {
            // If resizing from top/NW/NE, need to adjust top position to keep bottom edge stable
            if (resizeHandle.includes('n')) {
                newTop = startOffsetTop + (startOffsetHeight - minSize);
            }
            newHeight = minSize;
        }

        blurOverlay.style.width = `${newWidth}px`;
        blurOverlay.style.height = `${newHeight}px`;
        // Only update left/top if the handle type requires it
        if (resizeHandle.includes('n') || resizeHandle.includes('w')) {
            blurOverlay.style.left = `${newLeft}px`;
            blurOverlay.style.top = `${newTop}px`;
        }
    }
    const videoRect = activeVideo.getBoundingClientRect();
    previousLeftPercentage = ((parseFloat(blurOverlay.style.left) - videoRect.left) / videoRect.width) * 100;
    previousHeightPercentage = (parseFloat(blurOverlay.style.height) / videoRect.height) * 100;
    previousTopPercentage = ((parseFloat(blurOverlay.style.top) - videoRect.top) / videoRect.height) * 100;
    previousWidthPercentage = (parseFloat(blurOverlay.style.width) / videoRect.width) * 100;
}

function stopDragOrResize() {
    if (!isDragging && !isResizing) return;

    console.log('Drag or resize stopped');

    isDragging = false;
    isResizing = false;
    resizeHandle = null;
}

// --- Event Handlers ---

function handleVideoPlay(event) {
    console.log('Video play detected:', event.target);
    const previouslyActive = activeVideo;

    // If a *different* video started playing, reset manual positioning
    if (previouslyActive && previouslyActive !== event.target) {
        console.log('New video playing, resetting manual position.');
        cleanupRelativePosition(previouslyActive); // Clean up old video's parent
    }
    activeVideo = event.target; // Set the playing video as active

    // Only create/update overlay if blur is enabled
    if (isBlurEnabled) {
        createOrUpdateBlurOverlay();
    }
}

function handleVideoPauseOrEnd(event) {
    if (event.target !== activeVideo) {
        return;
    }

    // More robust check: If the video is *actually* paused or ended
    if (activeVideo.paused || activeVideo.ended) {
        console.log('Active video paused or ended, removing overlay.');
        removeBlurOverlay();
    }
}

function handleFullscreenChange() {
    console.log('Fullscreen change detected. Fullscreen element:', document.fullscreenElement);
    if (activeVideo) {
        createOrUpdateBlurOverlay();
        if (manualPositioning && blurOverlay) {
            blurOverlay.style.display = 'block';
            blurOverlay.style.pointerEvents = 'auto';
            // No need to call updateOverlayPosition here if manualPositioning is true.
        } else if (blurOverlay) {
            updateOverlayPosition(); // This will re-calculate based on the non-fullscreen video size/pos
        }
    } else if (!document.fullscreenElement && blurOverlay) {
        // Exited fullscreen, but no active video was tracked (shouldn't happen if logic is correct)
        console.log('Exited fullscreen with no active video, removing overlay.');
        removeBlurOverlay();
    }
}

// --- Initialization ---

// Debounce function to limit rapid calls (like during resize/scroll)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounced function for automatic position updates
const debouncedUpdateOverlayPosition = () => {
    if (blurOverlay && activeVideo && isBlurEnabled) {
        debounce(updateOverlayPosition, 50); // 50ms delay
    }
}

// Set up ResizeObserver
// This observes elements and calls the callback when their size changes
resizeObserver = new ResizeObserver(entries => {
    // We only care if the *activeVideo* resizes, and only if not in manual mode
    if (!manualPositioning) {
        for (const entry of entries) {
            if (entry.target === activeVideo && blurOverlay) {
                console.log('ResizeObserver triggered for active video');
                debouncedUpdateOverlayPosition(); // Use debounced version
            }
        }
    }
});

const videos = document.querySelectorAll('video');
if (videos.length === 0) {
    console.warn('No video elements found on the page.');
} else {
    console.log('Setting up video listeners...');
    videos.forEach(video => {
        // Check if listeners are already added using a data attribute
        resizeObserver.observe(video);
        if (!video.dataset.blurSetup) {
            // console.log('Adding listeners to video:', video);
            video.addEventListener('play', handleVideoPlay);
            // Add listeners for pause and ended to remove the blur
            video.addEventListener('pause', handleVideoPauseOrEnd);
            video.addEventListener('ended', handleVideoPauseOrEnd);
            video.dataset.blurSetup = true; // Mark as set up
            
            // Optional: If a video is already playing when the script loads, handle it
            // if (!video.paused) {
                //     handleVideoPlay({ target: video });
                // }
            } else {
                // console.log('Video already has blur setup:', video);
            }
        });
        console.log(`Added listeners to ${videos.length} video(s).`);
    createToggleButton();
}

// Global listeners for window resize, scroll, and mouse/touch events for dragging/resizing
window.addEventListener('resize', debouncedUpdateOverlayPosition);
window.addEventListener('scroll', debouncedUpdateOverlayPosition, true); // Use capture phase for scroll
document.addEventListener('fullscreenchange', handleFullscreenChange);

// Add global mouse/touch move/up listeners ONCE for drag/resize
// These will check the isDragging/isResizing flags inside their handlers
window.addEventListener('mousemove', doDragOrResize);
window.addEventListener('touchmove', doDragOrResize, { passive: false }); // passive: false allows preventDefault
// --- Listen for Chrome Extension Messages ---
function setupChromeExtensionMessaging() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'toggleBlurScriptUI') {
                console.log('Received message to show BlurScript UI');
                createToggleButton();
                sendResponse({ success: true });
                return true;
            }
        });
        console.log('BlurScript extension messaging listener set up');
    } else {
        console.warn('Chrome extension APIs not available');
    }
}

// Set up message listener for the extension icon click instead of creating the button immediately
setupChromeExtensionMessaging();
console.log('Blur overlay initialized. Toggle button will appear when extension icon is clicked.');