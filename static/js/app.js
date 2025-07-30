let allSongs = [];
let socket;

function initializeWebSocket() {
    console.log('🔌 Initializing WebSocket connection...');
    // Initialize Socket.IO connection
    socket = io({
        transports: ['websocket', 'polling'],
        timeout: 20000
    });
    
    socket.on('connect', function() {
        console.log('✅ Connected to Spotify Tracker WebSocket');
        console.log('🔗 Socket ID:', socket.id);
        showNotification('Connected to real-time updates', 'success');
    });
    
    socket.on('disconnect', function() {
        console.log('❌ Disconnected from Spotify Tracker WebSocket');
        showNotification('Disconnected from real-time updates', 'warning');
    });
    
    socket.on('new_songs_detected', function(data) {
        console.log('🎵 New songs detected event received:', data);
        console.log('🔄 Triggering data refresh...');
        // showNotification('New songs detected! Refreshing data...', 'info');
        
        // Force immediate refresh - no delay
        console.log('🔄 Executing refreshData() immediately...');
        refreshData();
        
        // Also force a second refresh after a short delay to ensure data is loaded
        setTimeout(() => {
            console.log('🔄 Executing second refreshData() to ensure data is loaded...');
            refreshData();
        }, 500);
    });
    
    socket.on('connected', function(data) {
        console.log('📡 WebSocket connected:', data.message);
        
        // Test WebSocket connectivity with ping
        console.log('🏓 Sending ping to test WebSocket connectivity...');
        socket.emit('ping');
    });
    
    socket.on('pong', function(data) {
        console.log('🏓 Pong received:', data);
        console.log('✅ WebSocket connectivity confirmed');
    });
    
    // Add error handling
    socket.on('connect_error', function(error) {
        console.error('❌ WebSocket connection error:', error);
        showNotification('WebSocket connection failed', 'error');
    });
    
    socket.on('error', function(error) {
        console.error('❌ WebSocket error:', error);
        showNotification('WebSocket error occurred', 'error');
    });
    
    // Add reconnection handling
    socket.on('reconnect', function(attemptNumber) {
        console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts');
        showNotification('Reconnected to real-time updates', 'success');
    });
    
    socket.on('reconnect_attempt', function(attemptNumber) {
        console.log('🔄 WebSocket reconnection attempt:', attemptNumber);
    });
}

function showNotification(message, type = 'info') {
    console.log('📢 Notification:', message, 'Type:', type);
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
        <button onclick="removeNotificationWithAnimation(this.parentElement)" class="notification-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds with animation
    setTimeout(() => {
        if (notification.parentElement) {
            removeNotificationWithAnimation(notification);
        }
    }, 5000);
}

function removeNotificationWithAnimation(notification) {
    // Add slide-out animation class
    notification.classList.add('slide-out');
    
    // Remove the element after animation completes
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 300); // Match the CSS animation duration
}

function loadCurrentSong() {
    console.log('🎵 Loading current song...');
    fetch('/api/current-song')
        .then(response => response.json())
        .then(data => {
            console.log('🎵 Current song data received:', data);
            const songDiv = document.getElementById('song');
            if (data.track) {
                const albumCover = data.album_cover ? 
                    `<img src="${data.album_cover}" alt="Album Cover" class="album-cover">` :
                    `<div class="album-cover-placeholder"><i class="fas fa-music"></i></div>`;
                
                // Create progress bar HTML
                const progressBar = `
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${data.progress_percentage}%"></div>
                        </div>
                        <div class="progress-time">
                            <span class="current-time">${data.progress_time}</span>
                            <span class="total-time">${data.duration_time}</span>
                        </div>
                    </div>
                `;
                
                // Add play/pause indicator
                const playStatus = data.is_playing ? 
                    '<i class="fas fa-play-circle play-indicator"></i>' : 
                    '<i class="fas fa-pause-circle play-indicator paused"></i>';
                
                songDiv.innerHTML = `
                    ${albumCover}
                    <div class="song-details">
                        <div class="song-title">${playStatus} ${data.track}</div>
                        <div class="song-artist">${data.artist}</div>
                        <div class="song-album">${data.album}</div>
                        <div class="song-device">
                            <i class="fas fa-desktop"></i> ${data.device}
                        </div>
                        ${progressBar}
                    </div>
                `;
                
                // Add click handler to progress bar for seeking (future feature)
                const progressBarElement = songDiv.querySelector('.progress-bar');
                if (progressBarElement) {
                    progressBarElement.addEventListener('click', function(e) {
                        const rect = this.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const percentage = (clickX / rect.width) * 100;
                        console.log('🎯 Progress bar clicked at:', percentage.toFixed(1) + '%');
                        // TODO: Implement seeking when Spotify API permissions are available
                    });
                }
                
                // Store progress data for real-time updates
                songDiv.dataset.progressMs = data.progress_ms;
                songDiv.dataset.durationMs = data.duration_ms;
                songDiv.dataset.isPlaying = data.is_playing;
                songDiv.dataset.lastUpdate = Date.now();
                
                // Update background based on album cover
                if (data.album_cover) {
                    updateBackgroundFromAlbumCover(data.album_cover);
                } else {
                    resetBackgroundToDefault();
                }
                
                console.log('🎵 Current song updated in UI');
            } else {
                songDiv.innerHTML = '<div class="no-data"><i class="fas fa-music"></i><div>No song currently playing</div></div>';
                resetBackgroundToDefault();
                console.log('🎵 No song currently playing');
            }
        })
        .catch(error => {
            console.error('❌ Error loading current song:', error);
            document.getElementById('song').innerHTML = '<div class="no-data"><i class="fas fa-exclamation-triangle"></i><div>Error loading current song</div></div>';
        });
}

// Function to update progress bar in real-time
function updateProgressBar() {
    const songDiv = document.getElementById('song');
    if (!songDiv || !songDiv.dataset.progressMs || !songDiv.dataset.isPlaying) {
        return;
    }
    
    const isPlaying = songDiv.dataset.isPlaying === 'true';
    const progressFill = songDiv.querySelector('.progress-fill');
    
    // Update play/pause visual state
    if (progressFill) {
        if (isPlaying) {
            progressFill.style.animation = 'pulse 2s infinite';
        } else {
            progressFill.style.animation = 'none';
            progressFill.style.opacity = '0.7';
        }
    }
    
    if (!isPlaying) {
        return; // Don't update progress if not playing
    }
    
    const lastUpdate = parseInt(songDiv.dataset.lastUpdate);
    const now = Date.now();
    const elapsed = now - lastUpdate;
    
    // Update progress
    let currentProgress = parseInt(songDiv.dataset.progressMs) + elapsed;
    const duration = parseInt(songDiv.dataset.durationMs);
    
    if (currentProgress >= duration) {
        currentProgress = duration;
        // Song finished, trigger a refresh to get new song
        setTimeout(() => {
            loadCurrentSong();
        }, 1000);
    }
    
    // Update the progress bar
    const currentTimeSpan = songDiv.querySelector('.current-time');
    
    if (progressFill && currentTimeSpan) {
        const percentage = Math.min((currentProgress / duration) * 100, 100);
        progressFill.style.width = `${percentage}%`;
        progressFill.style.opacity = '1';
        
        // Update time display
        const currentTime = formatTime(currentProgress);
        currentTimeSpan.textContent = currentTime;
        
        // Update stored data
        songDiv.dataset.progressMs = currentProgress;
        songDiv.dataset.lastUpdate = now;
    }
}

// Helper function to format time
function formatTime(ms) {
    if (!ms || ms === 0) return "0:00";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Global variables for background transition
let currentBackgroundColors = {
    r: 59, g: 130, b: 246 // Default blue
};
let isTransitioning = false;

// Function to extract dominant color from image
function extractDominantColor(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        // Try with CORS first
        img.crossOrigin = 'anonymous';
        
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Set canvas size to a reasonable size for processing
                canvas.width = 200;
                canvas.height = 200;
                
                // Draw the image on canvas
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Focus on the center area (60% of the image) to avoid edges and borders
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const centerSize = Math.min(canvas.width, canvas.height) * 0.6;
                const startX = Math.floor(centerX - centerSize / 2);
                const startY = Math.floor(centerY - centerSize / 2);
                const endX = Math.floor(centerX + centerSize / 2);
                const endY = Math.floor(centerY + centerSize / 2);
                
                // Get image data for the center area only
                const imageData = ctx.getImageData(startX, startY, centerSize, centerSize);
                const data = imageData.data;
                
                // Analyze colors with better quantization
                const colorCounts = {};
                const totalPixels = data.length / 4;
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];
                    
                    // Skip transparent or nearly transparent pixels
                    if (a < 200) continue;
                    
                    // Skip very light (near white) and very dark (near black) colors
                    const brightness = (r + g + b) / 3;
                    if (brightness < 20 || brightness > 235) continue;
                    
                    // Quantize colors to reduce noise (group similar colors)
                    const quantizedR = Math.floor(r / 15) * 15;
                    const quantizedG = Math.floor(g / 15) * 15;
                    const quantizedB = Math.floor(b / 15) * 15;
                    
                    const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
                    colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
                }
                
                // Find the most common color
                let dominantColor = null;
                let maxCount = 0;
                
                for (const [colorKey, count] of Object.entries(colorCounts)) {
                    if (count > maxCount) {
                        const [r, g, b] = colorKey.split(',').map(Number);
                        
                        // Additional filtering for better color selection
                        const brightness = (r + g + b) / 3;
                        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
                        
                        // Prefer colors with good saturation and brightness
                        if (brightness > 40 && brightness < 200 && saturation > 20) {
                            dominantColor = { r, g, b };
                            maxCount = count;
                        }
                    }
                }
                
                // If no suitable color found, try with less strict filtering
                if (!dominantColor) {
                    for (const [colorKey, count] of Object.entries(colorCounts)) {
                        if (count > maxCount) {
                            const [r, g, b] = colorKey.split(',').map(Number);
                            const brightness = (r + g + b) / 3;
                            
                            if (brightness > 30 && brightness < 220) {
                                dominantColor = { r, g, b };
                                maxCount = count;
                            }
                        }
                    }
                }
                
                // If still no suitable color found, use a fallback
                if (!dominantColor) {
                    dominantColor = { r: 29, g: 185, b: 84 }; // Spotify green
                }
                
                console.log(`🎨 Extracted dominant color: rgb(${dominantColor.r}, ${dominantColor.g}, ${dominantColor.b}) from center area`);
                resolve(dominantColor);
            } catch (error) {
                console.error('Error extracting color:', error);
                reject(error);
            }
        };
        
        img.onerror = function() {
            console.error('Error loading image for color extraction, trying without CORS...');
            
            // Try again without CORS
            const img2 = new Image();
            img2.onload = function() {
                // If we can load the image without CORS, we can't analyze it
                // but we can use a fallback color based on the image URL
                const fallbackColor = getFallbackColorFromUrl(imageUrl);
                resolve(fallbackColor);
            };
            
            img2.onerror = function() {
                console.error('Failed to load image even without CORS');
                reject(new Error('Failed to load image'));
            };
            
            img2.src = imageUrl;
        };
        
        img.src = imageUrl;
    });
}

// Function to get a fallback color based on image URL
function getFallbackColorFromUrl(imageUrl) {
    // Generate a consistent color based on the URL hash
    let hash = 0;
    for (let i = 0; i < imageUrl.length; i++) {
        const char = imageUrl.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Use the hash to generate RGB values
    const r = Math.abs(hash) % 200 + 30; // Avoid too dark colors
    const g = Math.abs(hash >> 8) % 200 + 30;
    const b = Math.abs(hash >> 16) % 200 + 30;
    
    return { r, g, b };
}

// Function to create gradient from color
function createGradientFromColor(r, g, b) {
    const gradient = `linear-gradient(135deg, 
        rgba(${r}, ${g}, ${b}, 0.85) 0%, 
        rgba(${Math.max(0, r - 15)}, ${Math.max(0, g - 15)}, ${Math.max(0, b - 15)}, 0.9) 20%,
        rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 0.92) 40%,
        rgba(${Math.max(0, r - 45)}, ${Math.max(0, g - 45)}, ${Math.max(0, b - 45)}, 0.95) 60%,
        rgba(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 60)}, 0.98) 80%,
        rgba(${Math.max(0, r - 75)}, ${Math.max(0, g - 75)}, ${Math.max(0, b - 75)}, 1) 100%)`;
    
    const radialOverlay = `radial-gradient(circle at 30% 20%, 
        rgba(${r + 20}, ${g + 20}, ${b + 20}, 0.1) 0%, 
        transparent 50%)`;
    
    return `${gradient}, ${radialOverlay}`;
}

// Function to apply background with fixed properties
function applyBackground(gradient) {
    document.body.style.background = gradient;
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
}

// Function to interpolate between two colors
function interpolateColors(color1, color2, progress) {
    return {
        r: Math.round(color1.r + (color2.r - color1.r) * progress),
        g: Math.round(color1.g + (color2.g - color1.g) * progress),
        b: Math.round(color1.b + (color2.b - color1.b) * progress)
    };
}

// Function to animate background transition
function animateBackgroundTransition(targetColor, duration = 2500) {
    if (isTransitioning) {
        // If already transitioning, stop the current transition
        return;
    }
    
    isTransitioning = true;
    const startTime = performance.now();
    const startColor = { ...currentBackgroundColors };
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Use easing function for smooth animation
        const easedProgress = easeInOutCubic(progress);
        
        // Interpolate colors
        const currentColor = interpolateColors(startColor, targetColor, easedProgress);
        
        // Update current colors
        currentBackgroundColors = currentColor;
        
        // Create and apply gradient
        const gradient = createGradientFromColor(currentColor.r, currentColor.g, currentColor.b);
        applyBackground(gradient);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            isTransitioning = false;
            console.log(`🎨 Background transition completed to: rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`);
        }
    }
    
    requestAnimationFrame(animate);
}

// Easing function for smooth animation
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Function to update background based on album cover
function updateBackgroundFromAlbumCover(imageUrl) {
    extractDominantColor(imageUrl)
        .then(color => {
            const { r, g, b } = color;
            
            // Animate to the new color
            animateBackgroundTransition({ r, g, b });
            
            console.log(`🎨 Starting background transition to: rgb(${r}, ${g}, ${b})`);
        })
        .catch(error => {
            console.error('Failed to update background:', error);
            resetBackgroundToDefault();
        });
}

// Function to reset background to default
function resetBackgroundToDefault() {
    const defaultColor = { r: 59, g: 130, b: 246 };
    animateBackgroundTransition(defaultColor);
    console.log('🎨 Starting background transition to default blue');
}

function loadHistory() {
    console.log('📜 Loading history...');
    return fetch('/api/history')
        .then(response => response.json())
        .then(data => {
            console.log('📜 History data received:', data.songs?.length, 'songs');
            allSongs = data.songs || [];
            updateHistoryDisplay();
            updateStats();
            console.log('📜 History updated in UI');
            return data;
        })
        .catch(error => {
            console.error('❌ Error loading history:', error);
            document.getElementById('history').innerHTML = '<div class="no-data"><i class="fas fa-exclamation-triangle"></i><div>Error loading history</div></div>';
            throw error;
        });
}

// Pagination variables
let currentPage = 1;
let itemsPerPage = 25;
let currentSort = { column: 'timestamp', direction: 'desc' };
let filteredSongs = [];

// Chart instances
let topArtistsChart = null;
let listeningActivityChart = null;
let hourlyChart = null;
let dailyChart = null;
let topArtistsAllTimeChart = null;
let deviceUsageChart = null;
let topAlbumsChart = null;
let genreChart = null;
let hourlyListeningChart = null;
let dailyListeningChart = null;
let weeklyListeningChart = null;
let averageDurationChart = null;
let listeningStreakChart = null;
let topGenresChart = null;
let completionRateChart = null;

function updateHistoryDisplay() {
    const historyBody = document.getElementById('history');
    const globalFilter = document.getElementById('globalFilter').value.toLowerCase();
    const artistFilter = document.getElementById('artistFilter').value.toLowerCase();
    const albumFilter = document.getElementById('albumFilter').value.toLowerCase();
    
    // Apply filters
    filteredSongs = allSongs.filter(song => {
        const matchesGlobal = !globalFilter || 
            song.track_name.toLowerCase().includes(globalFilter) ||
            song.artist_name.toLowerCase().includes(globalFilter) ||
            song.album_name.toLowerCase().includes(globalFilter) ||
            song.device_name.toLowerCase().includes(globalFilter) ||
            (song.device_type && song.device_type.toLowerCase().includes(globalFilter)) ||
            (song.date && song.date.toLowerCase().includes(globalFilter));
        
        const matchesArtist = song.artist_name.toLowerCase().includes(artistFilter);
        const matchesAlbum = song.album_name.toLowerCase().includes(albumFilter);
        
        return matchesGlobal && matchesArtist && matchesAlbum;
    });

    // Apply sorting
    filteredSongs.sort((a, b) => {
        let aValue = a[currentSort.column];
        let bValue = b[currentSort.column];
        
        if (currentSort.column === 'timestamp') {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
        } else if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }
        
        if (aValue < bValue) {
            return currentSort.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return currentSort.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    // Calculate pagination
    const totalItems = filteredSongs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filteredSongs.slice(startIndex, endIndex);

    // Update table content
    if (pageItems.length > 0) {
        historyBody.innerHTML = pageItems.map(song => {
            const albumCover = song.album_cover ? 
                `<div class="album-cover-container">
                    <img src="${song.album_cover}" alt="Album Cover" class="history-album-cover">
                    <button class="play-btn-small album-play-btn-small" onclick="playSong('${escapeHtml(song.track_name)}', '${escapeHtml(song.artist_name)}', '${song.track_uri || ''}')" title="Play on Spotify">
                        <i class="fas fa-play"></i>
                    </button>
                </div>` :
                `<div class="album-cover-container">
                    <div class="history-album-cover-placeholder"><i class="fas fa-music"></i></div>
                    <button class="play-btn-small album-play-btn-small" onclick="playSong('${escapeHtml(song.track_name)}', '${escapeHtml(song.artist_name)}', '${song.track_uri || ''}')" title="Play on Spotify">
                        <i class="fas fa-play"></i>
                    </button>
                </div>`;
            
            const deviceType = song.device_type || 'Unknown';
            
            // Format start time
            const startTime = song.start_time ? new Date(song.start_time).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            }) : '-';
            
            // Format end time
            const endTime = song.end_time ? new Date(song.end_time).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            }) : '-';
            
            // Format duration
            const duration = song.played_duration_ms ? formatDuration(song.played_duration_ms) : '-';
            
            // Format date
            const date = song.date || '-';
            
            return `
                <tr>
                    <td class="album-cover-cell">${albumCover}</td>
                    <td class="track-name">${escapeHtml(song.track_name)}</td>
                    <td class="artist-name">${escapeHtml(song.artist_name)}</td>
                    <td class="album-name">${escapeHtml(song.album_name)}</td>
                    <td class="device-name">${escapeHtml(song.device_name)}</td>
                    <td class="device-type">${escapeHtml(deviceType)}</td>
                    <td class="date">${date}</td>
                    <td class="start-time">${startTime}</td>
                    <td class="end-time">${endTime}</td>
                    <td class="duration">${duration}</td>
                </tr>
            `;
        }).join('');
    } else {
        historyBody.innerHTML = `
            <tr>
                <td colspan="11" class="no-data">
                    <i class="fas fa-search"></i>
                    <div>No songs found matching your filters</div>
                </td>
            </tr>
        `;
    }

    // Update pagination info
    updatePaginationInfo(totalItems, startIndex + 1, Math.min(endIndex, totalItems), totalPages);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDuration(ms) {
    // Format milliseconds to human readable duration
    if (!ms || ms === 0) return "0m";
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function updatePaginationInfo(total, start, end, totalPages) {
    // Update top pagination
    document.getElementById('paginationInfo').textContent = 
        `Showing ${start}-${end} of ${total} entries`;
    document.getElementById('pageIndicator').textContent = 
        `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
    
    // Update bottom pagination
    const paginationInfoBottom = document.getElementById('paginationInfoBottom');
    const pageIndicatorBottom = document.getElementById('pageIndicatorBottom');
    const prevPageBottom = document.getElementById('prevPageBottom');
    const nextPageBottom = document.getElementById('nextPageBottom');
    
    if (paginationInfoBottom) {
        paginationInfoBottom.textContent = `Showing ${start}-${end} of ${total} entries`;
    }
    if (pageIndicatorBottom) {
        pageIndicatorBottom.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    if (prevPageBottom) {
        prevPageBottom.disabled = currentPage <= 1;
    }
    if (nextPageBottom) {
        nextPageBottom.disabled = currentPage >= totalPages;
    }
}

function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    
    // Update sort indicators
    document.querySelectorAll('.history-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    const currentTh = document.querySelector(`[data-column="${column}"]`);
    if (currentTh) {
        currentTh.classList.add(`sort-${currentSort.direction}`);
    }
    
    currentPage = 1; // Reset to first page when sorting
    updateHistoryDisplay();
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredSongs.length / itemsPerPage);
    
    if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'next' && currentPage < totalPages) {
        currentPage++;
    }
    
    updateHistoryDisplay();
}

function changeEntriesPerPage(newValue) {
    itemsPerPage = parseInt(newValue);
    currentPage = 1; // Reset to first page when changing entries per page
    updateHistoryDisplay();
}

// Tab switching functionality
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    // Add active class to selected nav tab
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Load tab-specific content
    if (tabName === 'home') {
        loadRecentActivity();
        createSimpleCharts();
    } else if (tabName === 'graphs') {
        createDetailedCharts();
    }
}

// Load recent activity for home tab
function loadRecentActivity() {
    const activityDiv = document.getElementById('recentActivity');
    
    // Filter out the currently playing song (songs without end_time) from recent activity
    // This ensures only completed songs show in the recent activity
    const completedSongs = allSongs.filter(song => song.end_time !== null);
    
    // Show last 10 completed songs
    const recentSongs = completedSongs.slice(0, 10);
    
    if (recentSongs.length > 0) {
        activityDiv.innerHTML = recentSongs.map(song => {
            const albumCover = song.album_cover ? 
                `<div class="album-cover-container">
                    <img src="${song.album_cover}" alt="Album Cover" class="activity-cover">
                    <button class="play-btn album-play-btn" onclick="playSong('${escapeHtml(song.track_name)}', '${escapeHtml(song.artist_name)}', '${song.track_uri || ''}')" title="Play on Spotify">
                        <i class="fas fa-play"></i>
                    </button>
                </div>` :
                `<div class="album-cover-container">
                    <div class="activity-cover-placeholder"><i class="fas fa-music"></i></div>
                    <button class="play-btn album-play-btn" onclick="playSong('${escapeHtml(song.track_name)}', '${escapeHtml(song.artist_name)}', '${song.track_uri || ''}')" title="Play on Spotify">
                        <i class="fas fa-play"></i>
                    </button>
                </div>`;
            
            // Parse timestamp from database format "2025-07-29 09:37:42"
            let songDate;
            try {
                let timestamp = song.timestamp;
                
                // Handle database format: "2025-07-29 09:37:42"
                if (typeof timestamp === 'string') {
                    // Simply replace space with T for ISO format (treats as local time)
                    if (timestamp.includes(' ')) {
                        timestamp = timestamp.replace(' ', 'T');
                    }
                }
                
                songDate = new Date(timestamp);
                
                // Validate the date
                if (isNaN(songDate.getTime())) {
                    console.warn('Invalid timestamp, using current time:', song.timestamp);
                    songDate = new Date();
                }
            } catch (e) {
                console.error('Error parsing timestamp:', song.timestamp, e);
                songDate = new Date();
            }
            
            const timeAgo = getTimeAgo(songDate);
            const deviceIcon = getDeviceIcon(song.device_type);
            
            return `
                <div class="activity-item">
                    ${albumCover}
                    <div class="activity-details">
                        <div class="activity-track">${escapeHtml(song.track_name)}</div>
                        <div class="activity-artist">${escapeHtml(song.artist_name)}</div>
                    </div>
                    <div class="activity-meta">
                        <div class="activity-device">
                            <i class="${deviceIcon}"></i>
                            <span>${escapeHtml(song.device_name || 'Unknown')}</span>
                        </div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        activityDiv.innerHTML = '<div class="no-data"><i class="fas fa-music"></i><div>No recent activity</div></div>';
    }
}

// Helper function to get time ago
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

// Helper function to get device icon based on device type
function getDeviceIcon(deviceType) {
    if (!deviceType) return 'fas fa-question-circle';
    
    const type = deviceType.toLowerCase();
    
    if (type.includes('computer') || type.includes('desktop') || type.includes('pc')) {
        return 'fas fa-desktop';
    } else if (type.includes('smartphone') || type.includes('phone') || type.includes('mobile')) {
        return 'fas fa-mobile-alt';
    } else if (type.includes('tablet') || type.includes('ipad')) {
        return 'fas fa-tablet-alt';
    } else if (type.includes('speaker') || type.includes('echo') || type.includes('alexa') || type.includes('google')) {
        return 'fas fa-volume-up';
    } else if (type.includes('tv') || type.includes('television') || type.includes('chromecast') || type.includes('roku')) {
        return 'fas fa-tv';
    } else if (type.includes('car') || type.includes('automotive')) {
        return 'fas fa-car';
    } else if (type.includes('watch') || type.includes('wearable')) {
        return 'fas fa-clock';
    } else if (type.includes('game') || type.includes('playstation') || type.includes('xbox') || type.includes('nintendo')) {
        return 'fas fa-gamepad';
    } else {
        return 'fas fa-music';
    }
}

// Create simple charts for home tab
function createSimpleCharts() {
    displayTopArtistToday();
    createListeningActivityChart();
}

function displayTopArtistToday() {
    const displayDiv = document.getElementById('topArtistDisplay');
    if (!displayDiv) return;
    
    // Get today's songs using the date field from backend (already timezone-corrected)
    // The backend uses Europe/Berlin timezone, so we need to match that exactly
    const now = new Date();
    
    // Convert to Berlin timezone (UTC+2 for summer time)
    // The issue is that we need to add 2 hours to get Berlin time
    const berlinTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // Add 2 hours for Berlin time
    const today = berlinTime.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log('🎵 Top Artist Today - Current date (Berlin timezone):', today);
    console.log('🎵 Top Artist Today - Total songs in allSongs:', allSongs.length);
    
    // Debug: Show all songs and their dates
    console.log('🎵 Top Artist Today - All songs with dates:');
    allSongs.slice(0, 10).forEach(song => {
        console.log(`  ${song.track_name} by ${song.artist_name} - date: ${song.date}`);
    });
    
    const todaysSongs = allSongs.filter(song => {
        const isToday = song.date === today;
        if (isToday) {
            console.log(`🎵 Today's song: ${song.track_name} by ${song.artist_name} (date: ${song.date})`);
        }
        return isToday;
    });
    
    console.log('🎵 Top Artist Today - Songs found for today:', todaysSongs.length);
    
    if (todaysSongs.length === 0) {
        displayDiv.innerHTML = '<div class="no-artist-today">No songs played today</div>';
        console.log('🎵 Top Artist Today - No songs found for today');
        return;
    }
    
    // Count artists
    const artistCounts = {};
    todaysSongs.forEach(song => {
        artistCounts[song.artist_name] = (artistCounts[song.artist_name] || 0) + 1;
    });
    
    console.log('🎵 Top Artist Today - Artist counts:', artistCounts);
    
    // Get top artist
    const topArtist = Object.entries(artistCounts)
        .sort(([,a], [,b]) => b - a)[0];
    
    if (topArtist) {
        const [artistName, playCount] = topArtist;
        console.log(`🎵 Top Artist Today - Top artist: ${artistName} with ${playCount} plays`);
        displayDiv.innerHTML = `
            <div class="top-artist-name">${escapeHtml(artistName)}</div>
            <div class="top-artist-plays">${playCount} ${playCount === 1 ? 'play' : 'plays'}</div>
        `;
    } else {
        displayDiv.innerHTML = '<div class="no-artist-today">No artists found</div>';
        console.log('🎵 Top Artist Today - No top artist found');
    }
}

// Add a manual refresh function for debugging
function refreshTopArtistToday() {
    console.log('🔄 Manually refreshing Top Artist Today...');
    displayTopArtistToday();
}

// Debug function to test timezone calculations
function debugTimezone() {
    console.log('🔍 Timezone Debug Info:');
    
    const now = new Date();
    console.log('Current browser time:', now.toISOString());
    console.log('Current browser date:', now.toISOString().split('T')[0]);
    
    // Convert to Berlin timezone
    const berlinTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // Add 2 hours for Berlin time
    console.log('Berlin time:', berlinTime.toISOString());
    console.log('Berlin date:', berlinTime.toISOString().split('T')[0]);
    
    // Show all unique dates in the dataset
    const uniqueDates = [...new Set(allSongs.map(song => song.date))].sort();
    console.log('All dates in dataset:', uniqueDates);
    
    // Show songs for each date
    uniqueDates.forEach(date => {
        const songsForDate = allSongs.filter(song => song.date === date);
        console.log(`Date ${date}: ${songsForDate.length} songs`);
        songsForDate.forEach(song => {
            console.log(`  - ${song.track_name} by ${song.artist_name}`);
        });
    });
}

function createListeningActivityChart() {
    const ctx = document.getElementById('listeningActivityChart');
    if (!ctx) return;
    
    // Get current week (Monday to Sunday)
    const currentWeek = [];
    const dayCounts = {};
    
    // Get the current date
    const today = new Date();
    
    // Find the most recent Monday (or today if it's Monday)
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since last Monday
    
    // Generate the 7 days of the current week (Monday to Sunday)
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - daysSinceMonday + i);
        const dayKey = date.toISOString().split('T')[0];
        currentWeek.push(dayKey);
        dayCounts[dayKey] = 0;
    }
    
    // Count songs per day using timezone-corrected dates
    allSongs.forEach(song => {
        const songDay = song.date; // Use the timezone-corrected date from backend
        if (dayCounts.hasOwnProperty(songDay)) {
            dayCounts[songDay]++;
        }
    });
    
    if (listeningActivityChart) {
        listeningActivityChart.destroy();
    }
    
    listeningActivityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: currentWeek.map(day => {
                const date = new Date(day);
                return date.toLocaleDateString('en-US', { weekday: 'short' });
            }),
            datasets: [{
                label: 'Songs Played',
                data: currentWeek.map(day => dayCounts[day]),
                borderColor: '#1db954',
                backgroundColor: 'rgba(29, 185, 84, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            }
        }
    });
}

// Create detailed charts for graphs tab
function createDetailedCharts() {
    createHourlyChart();
    createDailyChart();
    createTopArtistsAllTimeChart();
    createDeviceUsageChart();
    createTopAlbumsChart();
    createGenreChart();
    createHourlyListeningChart();
    createDailyListeningChart();
    createWeeklyListeningChart();
    createAverageDurationChart();
    createListeningStreakChart();
    createTopGenresChart();
    createCompletionRateChart();
}

function createHourlyChart() {
    const ctx = document.getElementById('hourlyChart');
    if (!ctx) return;
    
    const hourCounts = new Array(24).fill(0);
    
    allSongs.forEach(song => {
        const hour = new Date(song.timestamp).getHours();
        hourCounts[hour]++;
    });
    
    if (hourlyChart) {
        hourlyChart.destroy();
    }
    
    hourlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Songs Played',
                data: hourCounts,
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderColor: '#1db954',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            }
        }
    });
}

function createDailyChart() {
    const ctx = document.getElementById('dailyChart');
    if (!ctx) return;
    
    // Get last 30 days
    const last30Days = [];
    const dayCounts = {};
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        last30Days.push(dayKey);
        dayCounts[dayKey] = 0;
    }
    
    allSongs.forEach(song => {
        const songDay = song.date; // Use the timezone-corrected date from backend
        if (dayCounts.hasOwnProperty(songDay)) {
            dayCounts[songDay]++;
        }
    });
    
    if (dailyChart) {
        dailyChart.destroy();
    }
    
    dailyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last30Days.map(day => {
                const date = new Date(day);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Songs Played',
                data: last30Days.map(day => dayCounts[day]),
                borderColor: '#1db954',
                backgroundColor: 'rgba(29, 185, 84, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            }
        }
    });
}

function createTopArtistsAllTimeChart() {
    const ctx = document.getElementById('topArtistsAllTimeChart');
    if (!ctx) return;
    
    const artistCounts = {};
    allSongs.forEach(song => {
        artistCounts[song.artist_name] = (artistCounts[song.artist_name] || 0) + 1;
    });
    
    const topArtists = Object.entries(artistCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    if (topArtistsAllTimeChart) {
        topArtistsAllTimeChart.destroy();
    }
    
    topArtistsAllTimeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topArtists.map(([artist]) => artist),
            datasets: [{
                label: 'Plays',
                data: topArtists.map(([, count]) => count),
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderColor: '#1db954',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            }
        }
    });
}

function createDeviceUsageChart() {
    const ctx = document.getElementById('deviceUsageChart');
    if (!ctx) return;
    
    const deviceCounts = {};
    allSongs.forEach(song => {
        const device = song.device_name || 'Unknown';
        deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    });
    
    const devices = Object.entries(deviceCounts);
    
    if (deviceUsageChart) {
        deviceUsageChart.destroy();
    }
    
    deviceUsageChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: devices.map(([device]) => device),
            datasets: [{
                data: devices.map(([, count]) => count),
                backgroundColor: [
                    '#1db954',
                    '#1ed760',
                    '#17a049',
                    '#14893e',
                    '#0f6b2f',
                    '#0a4a22'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#fff',
                        padding: 15,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

function createTopAlbumsChart() {
    const ctx = document.getElementById('topAlbumsChart');
    if (!ctx) return;
    
    const albumCounts = {};
    allSongs.forEach(song => {
        albumCounts[song.album_name] = (albumCounts[song.album_name] || 0) + 1;
    });
    
    const topAlbums = Object.entries(albumCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8);
    
    if (topAlbumsChart) {
        topAlbumsChart.destroy();
    }
    
    topAlbumsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topAlbums.map(([album]) => album.length > 20 ? album.substring(0, 20) + '...' : album),
            datasets: [{
                label: 'Plays',
                data: topAlbums.map(([, count]) => count),
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderColor: '#1db954',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                }
            }
        }
    });
}

function createGenreChart() {
    const ctx = document.getElementById('genreChart');
    if (!ctx) return;
    
    // Mock genre data since Spotify API doesn't provide genre in track info
    const genres = ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Indie', 'Jazz', 'Classical', 'Other'];
    const genreData = genres.map(() => Math.floor(Math.random() * 50) + 10);
    
    if (genreChart) {
        genreChart.destroy();
    }
    
    genreChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: genres,
            datasets: [{
                data: genreData,
                backgroundColor: [
                    '#1db954',
                    '#1ed760',
                    '#17a049',
                    '#14893e',
                    '#0f6b2f',
                    '#0a4a22',
                    '#064018',
                    '#03330d'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#fff',
                        padding: 15,
                        usePointStyle: true
                    }
                }
            }
        }
    });
}

function createHourlyListeningChart() {
    const ctx = document.getElementById('hourlyListeningChart');
    if (!ctx) return;
    
    const hourlyListening = new Array(24).fill(0);
    
    allSongs.forEach(song => {
        if (song.played_duration_ms && song.played_duration_ms > 0) {
            const hour = new Date(song.timestamp).getHours();
            hourlyListening[hour] += song.played_duration_ms / 1000 / 60; // Convert to minutes
        }
    });
    
    if (hourlyListeningChart) {
        hourlyListeningChart.destroy();
    }
    
    hourlyListeningChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Minutes Listened',
                data: hourlyListening,
                borderColor: '#1ed760',
                backgroundColor: 'rgba(30, 215, 96, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#1ed760',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const minutes = context.parsed.y;
                            const hours = Math.floor(minutes / 60);
                            const remainingMinutes = Math.round(minutes % 60);
                            if (hours > 0) {
                                return `${hours}h ${remainingMinutes}m listened`;
                            } else {
                                return `${Math.round(minutes)}m listened`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3',
                        callback: function(value) {
                            const hours = Math.floor(value / 60);
                            const minutes = Math.round(value % 60);
                            if (hours > 0) {
                                return `${hours}h ${minutes}m`;
                            } else {
                                return `${minutes}m`;
                            }
                        }
                    }
                }
            }
        }
    });
}

function createDailyListeningChart() {
    const ctx = document.getElementById('dailyListeningChart');
    if (!ctx) return;
    
    // Get last 30 days
    const last30Days = [];
    const dailyListening = {};
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        last30Days.push(dayKey);
        dailyListening[dayKey] = 0;
    }
    
    allSongs.forEach(song => {
        if (song.played_duration_ms && song.played_duration_ms > 0) {
            const songDay = song.date; // Use the timezone-corrected date from backend
            if (dailyListening.hasOwnProperty(songDay)) {
                dailyListening[songDay] += song.played_duration_ms / 1000 / 60; // Convert to minutes
            }
        }
    });
    
    if (dailyListeningChart) {
        dailyListeningChart.destroy();
    }
    
    dailyListeningChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last30Days.map(day => {
                const date = new Date(day);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Minutes Listened',
                data: last30Days.map(day => dailyListening[day]),
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderColor: '#1db954',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const minutes = context.parsed.y;
                            const hours = Math.floor(minutes / 60);
                            const remainingMinutes = Math.round(minutes % 60);
                            if (hours > 0) {
                                return `${hours}h ${remainingMinutes}m listened`;
                            } else {
                                return `${Math.round(minutes)}m listened`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3',
                        callback: function(value) {
                            const hours = Math.floor(value / 60);
                            const minutes = Math.round(value % 60);
                            if (hours > 0) {
                                return `${hours}h ${minutes}m`;
                            } else {
                                return `${minutes}m`;
                            }
                        }
                    }
                }
            }
        }
    });
}

function createWeeklyListeningChart() {
    const ctx = document.getElementById('weeklyListeningChart');
    if (!ctx) return;
    
    const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeklyListening = new Array(7).fill(0);
    const weeklySongs = new Array(7).fill(0);
    
    allSongs.forEach(song => {
        const dayOfWeek = new Date(song.date).getDay(); // Use timezone-corrected date
        weeklySongs[dayOfWeek]++;
        if (song.played_duration_ms && song.played_duration_ms > 0) {
            weeklyListening[dayOfWeek] += song.played_duration_ms / 1000 / 60; // Convert to minutes
        }
    });
    
    if (weeklyListeningChart) {
        weeklyListeningChart.destroy();
    }
    
    weeklyListeningChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weekDays,
            datasets: [{
                label: 'Minutes Listened',
                data: weeklyListening,
                backgroundColor: 'rgba(29, 185, 84, 0.8)',
                borderColor: '#1db954',
                borderWidth: 1,
                borderRadius: 4,
                yAxisID: 'y'
            }, {
                label: 'Songs Played',
                data: weeklySongs,
                backgroundColor: 'rgba(30, 215, 96, 0.6)',
                borderColor: '#1ed760',
                borderWidth: 1,
                borderRadius: 4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === 'Minutes Listened') {
                                const minutes = context.parsed.y;
                                const hours = Math.floor(minutes / 60);
                                const remainingMinutes = Math.round(minutes % 60);
                                if (hours > 0) {
                                    return `${hours}h ${remainingMinutes}m listened`;
                                } else {
                                    return `${Math.round(minutes)}m listened`;
                                }
                            } else {
                                return `${context.parsed.y} songs played`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3',
                        callback: function(value) {
                            const hours = Math.floor(value / 60);
                            const minutes = Math.round(value % 60);
                            if (hours > 0) {
                                return `${hours}h ${minutes}m`;
                            } else {
                                return `${minutes}m`;
                            }
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false,
                    },
                    ticks: {
                        color: '#1ed760'
                    }
                }
            }
        }
    });
}

function createAverageDurationChart() {
    const ctx = document.getElementById('averageDurationChart');
    if (!ctx) return;
    
    // Get last 30 days
    const last30Days = [];
    const dailyAverages = {};
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        last30Days.push(dayKey);
        dailyAverages[dayKey] = { total: 0, count: 0 };
    }
    
    allSongs.forEach(song => {
        if (song.track_duration_ms && song.track_duration_ms > 0) {
            const songDay = song.date; // Use the timezone-corrected date from backend
            if (dailyAverages.hasOwnProperty(songDay)) {
                dailyAverages[songDay].total += song.track_duration_ms;
                dailyAverages[songDay].count++;
            }
        }
    });
    
    const averageData = last30Days.map(day => {
        const dayData = dailyAverages[day];
        return dayData.count > 0 ? dayData.total / dayData.count / 1000 / 60 : 0; // Convert to minutes
    });
    
    if (averageDurationChart) {
        averageDurationChart.destroy();
    }
    
    averageDurationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last30Days.map(day => {
                const date = new Date(day);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Average Song Duration (minutes)',
                data: averageData,
                borderColor: '#ff6b6b',
                backgroundColor: 'rgba(255, 107, 107, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ff6b6b',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const minutes = context.parsed.y;
                            const hours = Math.floor(minutes / 60);
                            const remainingMinutes = Math.round(minutes % 60);
                            if (hours > 0) {
                                return `Average: ${hours}h ${remainingMinutes}m`;
                            } else {
                                return `Average: ${Math.round(minutes)}m`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3',
                        callback: function(value) {
                            const hours = Math.floor(value / 60);
                            const minutes = Math.round(value % 60);
                            if (hours > 0) {
                                return `${hours}h ${minutes}m`;
                            } else {
                                return `${minutes}m`;
                            }
                        }
                    }
                }
            }
        }
    });
}

function createListeningStreakChart() {
    const ctx = document.getElementById('listeningStreakChart');
    if (!ctx) return;
    
    // Calculate listening streaks
    const dailyListening = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get last 60 days for streak calculation
    for (let i = 59; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        dailyListening[dayKey] = 0;
    }
    
    allSongs.forEach(song => {
        if (song.played_duration_ms && song.played_duration_ms > 0) {
            const songDay = song.date; // Use the timezone-corrected date from backend
            if (dailyListening.hasOwnProperty(songDay)) {
                dailyListening[songDay] += song.played_duration_ms / 1000 / 60; // Convert to minutes
            }
        }
    });
    
    // Calculate streaks
    const days = Object.keys(dailyListening).sort();
    const streakData = [];
    let currentStreak = 0;
    let maxStreak = 0;
    
    days.forEach(day => {
        const minutes = dailyListening[day];
        if (minutes > 0) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            currentStreak = 0;
        }
        streakData.push(currentStreak);
    });
    
    if (listeningStreakChart) {
        listeningStreakChart.destroy();
    }
    
    listeningStreakChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: days.map(day => {
                const date = new Date(day);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Current Streak (days)',
                data: streakData,
                borderColor: '#ffd93d',
                backgroundColor: 'rgba(255, 217, 61, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.2,
                pointBackgroundColor: '#ffd93d',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        afterBody: function(context) {
                            return `Max streak: ${maxStreak} days`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3',
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function createTopGenresChart() {
    const ctx = document.getElementById('topGenresChart');
    if (!ctx) return;
    
    // For now, we'll use artist names as a proxy for genres since we don't have genre data
    // In a real implementation, you'd want to fetch genre data from Spotify API
    const artistCounts = {};
    
    allSongs.forEach(song => {
        const artist = song.artist_name;
        artistCounts[artist] = (artistCounts[artist] || 0) + 1;
    });
    
    // Get top 10 artists
    const topArtists = Object.entries(artistCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
    
    if (topGenresChart) {
        topGenresChart.destroy();
    }
    
    topGenresChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: topArtists.map(([artist]) => artist),
            datasets: [{
                data: topArtists.map(([,count]) => count),
                backgroundColor: [
                    '#1db954', '#1ed760', '#1fdf64', '#1ed760', '#1db954',
                    '#1ed760', '#1fdf64', '#1ed760', '#1db954', '#1ed760'
                ],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#fff',
                        padding: 10,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} songs (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function createCompletionRateChart() {
    const ctx = document.getElementById('completionRateChart');
    if (!ctx) return;
    
    // Get last 30 days
    const last30Days = [];
    const dailyCompletion = {};
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayKey = date.toISOString().split('T')[0];
        last30Days.push(dayKey);
        dailyCompletion[dayKey] = { completed: 0, total: 0 };
    }
    
    allSongs.forEach(song => {
        const songDay = song.date; // Use the timezone-corrected date from backend
        if (dailyCompletion.hasOwnProperty(songDay)) {
            dailyCompletion[songDay].total++;
            if (song.is_completed) {
                dailyCompletion[songDay].completed++;
            }
        }
    });
    
    const completionData = last30Days.map(day => {
        const dayData = dailyCompletion[day];
        return dayData.total > 0 ? (dayData.completed / dayData.total) * 100 : 0;
    });
    
    if (completionRateChart) {
        completionRateChart.destroy();
    }
    
    completionRateChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last30Days.map(day => {
                const date = new Date(day);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Completion Rate (%)',
                data: completionData,
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Completion rate: ${context.parsed.y.toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b3b3b3',
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });
}

function updateStats() {
    const uniqueArtists = new Set(allSongs.map(song => song.artist_name)).size;
    const uniqueAlbums = new Set(allSongs.map(song => song.album_name)).size;
    
    // Calculate today's songs using the date field from backend (already timezone-corrected)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const todaysSongs = allSongs.filter(song => {
        return song.date === today;
    }).length;
    
    document.getElementById('totalSongs').textContent = allSongs.length;
    document.getElementById('uniqueArtists').textContent = uniqueArtists;
    document.getElementById('uniqueAlbums').textContent = uniqueAlbums;
    
    const todayElement = document.getElementById('todaySongs');
    if (todayElement) {
        todayElement.textContent = todaysSongs;
    }
    
    // Load listening time statistics
    loadListeningStats();
}

function loadListeningStats() {
    fetch('/api/listening-stats')
        .then(response => response.json())
        .then(data => {
            console.log('📊 Listening stats received:', data);
            
            const totalListenedElement = document.getElementById('totalListened');
            const todayListenedElement = document.getElementById('todayListened');
            
            if (totalListenedElement) {
                totalListenedElement.textContent = data.total_listened;
            }
            
            if (todayListenedElement) {
                todayListenedElement.textContent = data.today_listened;
            }
        })
        .catch(error => {
            console.error('❌ Error loading listening stats:', error);
        });
}

function refreshData() {
    console.log('🔄 refreshData() called at:', new Date().toISOString());
    loadCurrentSong();
    
    // Load history data first, then update UI based on active tab
    loadHistory().then(() => {
        // Update content for current active tab after history is loaded
        const activeTab = document.querySelector('.nav-tab.active');
        if (activeTab) {
            const tabName = activeTab.getAttribute('data-tab');
            if (tabName === 'home') {
                loadRecentActivity();
                createSimpleCharts();
            } else if (tabName === 'graphs') {
                createDetailedCharts();
            }
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize WebSocket connection
    initializeWebSocket();
    
    // Filter event listeners
    document.getElementById('globalFilter').addEventListener('input', function() {
        currentPage = 1; // Reset to first page when filtering
        updateHistoryDisplay();
    });
    document.getElementById('artistFilter').addEventListener('input', function() {
        currentPage = 1; // Reset to first page when filtering
        updateHistoryDisplay();
    });
    document.getElementById('albumFilter').addEventListener('input', function() {
        currentPage = 1; // Reset to first page when filtering
        updateHistoryDisplay();
    });

    // Table sorting event listeners
    document.querySelectorAll('.history-table th.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const column = this.getAttribute('data-column');
            if (column !== 'album_cover') { // Skip album cover column
                sortTable(column);
            }
        });
    });

    // Pagination event listeners (top)
    document.getElementById('prevPage').addEventListener('click', function() {
        changePage('prev');
    });
    document.getElementById('nextPage').addEventListener('click', function() {
        changePage('next');
    });

    // Pagination event listeners (bottom)
    const prevPageBottom = document.getElementById('prevPageBottom');
    const nextPageBottom = document.getElementById('nextPageBottom');
    
    if (prevPageBottom) {
        prevPageBottom.addEventListener('click', function() {
            changePage('prev');
        });
    }
    if (nextPageBottom) {
        nextPageBottom.addEventListener('click', function() {
            changePage('next');
        });
    }

    // Navigation tab event listeners
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Entries per page dropdown event listener
    const entriesPerPageSelect = document.getElementById('entriesPerPage');
    if (entriesPerPageSelect) {
        entriesPerPageSelect.addEventListener('change', function() {
            changeEntriesPerPage(this.value);
        });
    }

    // Set initial sort indicator
    setTimeout(() => {
        const initialSortColumn = document.querySelector(`[data-column="${currentSort.column}"]`);
        if (initialSortColumn) {
            initialSortColumn.classList.add(`sort-${currentSort.direction}`);
        }
    }, 100);

    // Initial load
    refreshData();

    // Load initial home tab content
    setTimeout(() => {
        loadRecentActivity();
        createSimpleCharts();
    }, 500);
    
    // Refresh top artist display every minute to ensure it updates at midnight
    setInterval(() => {
        if (document.querySelector('.nav-tab.active').getAttribute('data-tab') === 'home') {
            displayTopArtistToday();
        }
    }, 60000); // Every minute

    // Update progress bar every second
    setInterval(updateProgressBar, 1000);

    // Fallback refresh every 10 seconds (in case WebSocket fails)
    setInterval(refreshData, 10000);
});

// Play song function
function playSong(trackName, artistName, trackUri) {
    console.log('🎵 Attempting to play:', trackName, 'by', artistName);
    
    // Show loading state
    const clickedButton = event.target.closest('.play-btn, .play-btn-small');
    const originalContent = clickedButton.innerHTML;
    clickedButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    clickedButton.disabled = true;
    
    // Prepare request data
    const requestData = {
        track_name: trackName,
        artist_name: artistName
    };
    
    // Add track_uri if available (for more accurate playback)
    if (trackUri && trackUri !== '') {
        requestData.track_uri = trackUri;
    }
    
    fetch('/api/play-song', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('✅ Song played successfully:', data.message);
            showNotification(data.message, 'success');
            
            // Change button to indicate success briefly
            clickedButton.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                clickedButton.innerHTML = originalContent;
                clickedButton.disabled = false;
            }, 2000);
        } else {
            console.error('❌ Error playing song:', data.error);
            showNotification(data.error, 'error');
            
            // Restore button
            clickedButton.innerHTML = originalContent;
            clickedButton.disabled = false;
        }
    })
    .catch(error => {
        console.error('❌ Network error playing song:', error);
        showNotification('Failed to play song. Please check your connection.', 'error');
        
        // Restore button
        clickedButton.innerHTML = originalContent;
        clickedButton.disabled = false;
    });
} 