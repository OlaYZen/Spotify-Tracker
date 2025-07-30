from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import os
import threading
import time
import logging
from datetime import datetime
import pytz
from spotipy import Spotify
from spotipy.oauth2 import SpotifyOAuth
from models import SongPlay, Session
from dotenv import load_dotenv

load_dotenv()

# Configure logging with Berlin timezone
# Get log level from environment variable, default to ERROR
log_level_str = os.getenv('LOG_LEVEL', 'ERROR').upper()
log_level = getattr(logging, log_level_str, logging.ERROR)

# Create a custom formatter that uses Berlin timezone
class BerlinTimeFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        # Convert to Berlin timezone
        berlin_tz = pytz.timezone('Europe/Berlin')
        dt = datetime.fromtimestamp(record.created, berlin_tz)
        if datefmt:
            return dt.strftime(datefmt)
        else:
            return dt.strftime('%Y-%m-%d %H:%M:%S')

# Configure logging with custom formatter
formatter = BerlinTimeFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# Create handlers
file_handler = logging.FileHandler('output.log')
file_handler.setFormatter(formatter)

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)

# Configure root logger
logging.basicConfig(
    level=log_level,
    handlers=[file_handler, console_handler]
)

# Configure Werkzeug logger to respect LOG_LEVEL
werkzeug_logger = logging.getLogger('werkzeug')
werkzeug_logger.setLevel(log_level)
werkzeug_logger.handlers = []  # Remove default handlers
werkzeug_logger.addHandler(file_handler)
werkzeug_logger.addHandler(console_handler)
werkzeug_logger.propagate = False  # Prevent duplicate logging

logger = logging.getLogger('app')

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize Spotify client with configurable timeout
spotify_timeout = int(os.getenv('SPOTIFY_TIMEOUT', 30))  # Default 30 seconds
sp = Spotify(auth_manager=SpotifyOAuth(
    client_id=os.getenv('SPOTIPY_CLIENT_ID'),
    client_secret=os.getenv('SPOTIPY_CLIENT_SECRET'),
    redirect_uri=os.getenv('SPOTIPY_REDIRECT_URI'),
    scope='user-read-playback-state user-read-currently-playing user-modify-playback-state',
    open_browser=False  # Disable automatic browser opening
), requests_timeout=spotify_timeout)

# Global variable to track the last song count
last_song_count = 0
background_task_started = False
background_thread = None
_background_lock = threading.Lock()

def get_song_count():
    """Get the current number of songs in the database"""
    session = None
    try:
        session = Session()
        count = session.query(SongPlay).count()
        logger.info(f"Database song count: {count}")
        return count
    except Exception as e:
        logger.error(f"Error getting song count: {e}")
        return 0
    finally:
        if session:
            session.close()

def check_for_new_songs():
    """Background task to check for new songs and emit WebSocket events"""
    global last_song_count
    logger.info("🔍 Starting background task to monitor database for new songs...")
    consecutive_errors = 0
    max_consecutive_errors = 10
    
    while True:
        try:
            current_count = get_song_count()
            # Only log every 10th check to reduce log spam when no new songs
            if current_count != last_song_count or consecutive_errors > 0:
                logger.info(f"📊 Current song count: {current_count}, Last count: {last_song_count}")
            
            if current_count > last_song_count:
                # New songs detected
                logger.info(f"🎵 New songs detected! Emitting WebSocket event. Count: {current_count}")
                
                # Emit to all connected clients - removed invalid broadcast parameter
                socketio.emit('new_songs_detected', {
                    'message': 'New songs detected in database',
                    'count': current_count,
                    'timestamp': datetime.now().isoformat()
                })
                
                logger.info(f"📡 WebSocket event emitted to all clients. Count: {current_count}")
                last_song_count = current_count
            
            # Reset error counter on successful operation
            consecutive_errors = 0
            
        except Exception as e:
            consecutive_errors += 1
            logger.error(f"❌ Error in check_for_new_songs (attempt {consecutive_errors}): {e}")
            
            # If too many consecutive errors, increase sleep time to avoid spam
            if consecutive_errors >= max_consecutive_errors:
                logger.error(f"🚨 Too many consecutive errors ({consecutive_errors}), sleeping longer...")
                time.sleep(10)  # Sleep longer on repeated failures
                continue
        
        time.sleep(2)  # Check every 2 seconds

def start_background_task():
    """Start the background task if not already started"""
    global background_task_started, background_thread
    with _background_lock:
        if not background_task_started:
            logger.info("🚀 Starting background monitoring task...")
            background_thread = threading.Thread(target=check_for_new_songs, daemon=True)
            background_thread.start()
            background_task_started = True
            logger.info("✅ Background monitoring task started successfully")
        else:
            logger.info("ℹ️ Background monitoring task already running")

@socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection"""
    logger.info('✅ Client connected')
    global last_song_count
    last_song_count = get_song_count()
    logger.info(f"📊 Initial song count set to: {last_song_count}")
    emit('connected', {'message': 'Connected to Spotify Tracker'})
    
    # Start background task when first client connects
    start_background_task()

@socketio.on('disconnect')
def handle_disconnect():
    """Handle WebSocket disconnection"""
    logger.info('❌ Client disconnected')

@socketio.on('ping')
def handle_ping():
    """Handle ping from client to test WebSocket connectivity"""
    logger.info('🏓 Ping received from client')
    emit('pong', {'message': 'pong', 'timestamp': datetime.now().isoformat()})

@app.route('/')
def index():
    logger.info("📄 Index page requested")
    return render_template('index.html')

@app.route('/api/current-song')
def get_current_song():
    logger.info("🎵 Current song API requested")
    try:
        playback = sp.current_playback()
        if playback and playback.get('item'):
            track = playback['item']
            
            # Get album cover URL
            album_cover = None
            if track['album']['images']:
                # Use the medium size image (300x300)
                album_cover = track['album']['images'][1]['url'] if len(track['album']['images']) > 1 else track['album']['images'][0]['url']
            
            # Get playback progress
            progress_ms = playback.get('progress_ms', 0)
            duration_ms = track.get('duration_ms', 0)
            progress_percentage = (progress_ms / duration_ms * 100) if duration_ms > 0 else 0
            
            # Format time strings
            def format_time(ms):
                if ms is None or ms == 0:
                    return "0:00"
                seconds = int(ms / 1000)
                minutes = int(seconds / 60)
                seconds = seconds % 60
                return f"{minutes}:{seconds:02d}"
            
            logger.info(f"🎵 Currently playing: {track['name']} by {', '.join([a['name'] for a in track['artists']])} - Progress: {format_time(progress_ms)}/{format_time(duration_ms)}")
            return jsonify({
                'track': track['name'],
                'artist': ', '.join([a['name'] for a in track['artists']]),
                'album': track['album']['name'],
                'device': playback['device']['name'],
                'type': playback['device']['type'],
                'album_cover': album_cover,
                'progress_ms': progress_ms,
                'duration_ms': duration_ms,
                'progress_percentage': round(progress_percentage, 2),
                'progress_time': format_time(progress_ms),
                'duration_time': format_time(duration_ms),
                'is_playing': playback.get('is_playing', False)
            })
        else:
            logger.info("🎵 No song currently playing")
            return jsonify({'track': None})
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ Error getting current song: {error_msg}")
        
        # Handle specific Spotify API errors
        if "Read timed out" in error_msg or "timeout" in error_msg.lower():
            return jsonify({'error': 'Spotify API timeout - please try again'}), 503
        elif "401" in error_msg or "unauthorized" in error_msg.lower():
            return jsonify({'error': 'Spotify authentication required - please re-authenticate'}), 401
        elif "429" in error_msg or "rate limit" in error_msg.lower():
            return jsonify({'error': 'Spotify API rate limit exceeded - please wait and try again'}), 429
        elif "connection" in error_msg.lower():
            return jsonify({'error': 'Network connection error - please check your internet connection'}), 503
        else:
            return jsonify({'error': f'Spotify API error: {error_msg}'}), 500

@app.route('/api/history')
def get_history():
    logger.info("📜 History API requested")
    session = None
    try:
        session = Session()
        recent_songs = session.query(SongPlay).order_by(SongPlay.timestamp.desc()).limit(200).all()
        
        songs = []
        local_tz = pytz.timezone('Europe/Berlin')  # Adjust to your timezone
        
        for song in recent_songs:
            # Convert UTC timestamp to local timezone
            local_timestamp = None
            local_date_str = None
            
            if song.timestamp:
                # If timestamp is naive (no timezone), assume it's UTC
                if song.timestamp.tzinfo is None:
                    utc_timestamp = pytz.utc.localize(song.timestamp)
                else:
                    utc_timestamp = song.timestamp
                
                local_timestamp = utc_timestamp.astimezone(local_tz)
                local_date_str = local_timestamp.strftime('%Y-%m-%d')
            
            songs.append({
                'track_name': song.track_name,
                'artist_name': song.artist_name,
                'album_name': song.album_name,
                'device_name': song.device_name,
                'device_type': song.device_type,
                'timestamp': local_timestamp.isoformat() if local_timestamp else None,
                'date': local_date_str,
                'album_cover': song.album_cover_url,
                'track_uri': song.track_uri,
                'played_duration_ms': song.played_duration_ms,
                'track_duration_ms': song.track_duration_ms,
                'is_completed': song.is_completed,
                'start_time': song.start_time.isoformat() if song.start_time else None,
                'end_time': song.end_time.isoformat() if song.end_time else None
            })
        
        logger.info(f"📜 Returning {len(songs)} songs from history")
        return jsonify({'songs': songs})
    except Exception as e:
        logger.error(f"❌ Error getting history: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if session:
            session.close()

@app.route('/api/listening-stats')
def get_listening_stats():
    """Get listening time statistics"""
    logger.info("📊 Listening stats API requested")
    session = None
    try:
        session = Session()
        
        # Calculate total listening time (all time)
        total_listened_ms = session.query(SongPlay.played_duration_ms).filter(
            SongPlay.played_duration_ms > 0
        ).all()
        total_listened_ms = sum([row[0] for row in total_listened_ms])
        
        # Calculate today's listening time using local timezone
        local_tz = pytz.timezone('Europe/Berlin')  # Adjust to your timezone
        today = datetime.now(local_tz).date()
        
        # Convert UTC timestamps to local timezone for comparison
        today_songs = []
        all_songs = session.query(SongPlay).all()
        
        for song in all_songs:
            # Convert UTC timestamp to local timezone
            if song.timestamp:
                # If timestamp is naive (no timezone), assume it's UTC
                if song.timestamp.tzinfo is None:
                    utc_timestamp = pytz.utc.localize(song.timestamp)
                else:
                    utc_timestamp = song.timestamp
                
                local_timestamp = utc_timestamp.astimezone(local_tz)
                if local_timestamp.date() == today:
                    today_songs.append(song)
        
        today_listened_ms = sum([song.played_duration_ms for song in today_songs])
        
        # Calculate total songs completed
        completed_songs = session.query(SongPlay).filter(
            SongPlay.is_completed == True
        ).count()
        
        # Calculate total songs started
        total_songs = session.query(SongPlay).count()
        
        def format_duration(ms):
            """Format milliseconds to human readable time"""
            if not ms:
                return "0m"
            # Convert to float first to handle any decimal milliseconds
            total_seconds = float(ms) / 1000
            total_minutes = total_seconds / 60
            total_hours = total_minutes / 60
            total_days = total_hours / 24
            
            if total_days >= 1:
                days = int(total_days)
                hours = int(total_hours % 24)
                minutes = total_minutes % 60
                return f"{days}d {hours}h {minutes:.1f}m"
            elif total_hours >= 1:
                hours = int(total_hours)
                minutes = total_minutes % 60
                return f"{hours}h {minutes:.1f}m"
            else:
                return f"{total_minutes:.1f}m"
        
        stats = {
            'total_listened': format_duration(total_listened_ms),
            'total_listened_ms': total_listened_ms,
            'today_listened': format_duration(today_listened_ms),
            'today_listened_ms': today_listened_ms,
            'completed_songs': completed_songs,
            'total_songs': total_songs,
            'completion_rate': round((completed_songs / total_songs * 100) if total_songs > 0 else 0, 1)
        }
        
        logger.info(f"📊 Returning listening stats: {stats}")
        return jsonify(stats)
    except Exception as e:
        logger.error(f"❌ Error getting listening stats: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if session:
            session.close()

@app.route('/api/play-song', methods=['POST'])
def play_song():
    """Play a song on the current Spotify player"""
    logger.info("🎵 Play song API requested")
    try:
        data = request.get_json()
        track_name = data.get('track_name')
        artist_name = data.get('artist_name')
        track_uri = data.get('track_uri')
        
        if not track_name or not artist_name:
            return jsonify({'error': 'Track name and artist name are required'}), 400
        
        # Use stored track URI if available, otherwise search for the track
        if track_uri and track_uri.startswith('spotify:track:'):
            # We have a direct Spotify URI, use it directly
            logger.info(f"🎵 Using stored track URI: {track_uri}")
            track_info = {'name': track_name, 'artists': [{'name': artist_name}]}
        else:
            # Search for the track
            search_query = f"track:{track_name} artist:{artist_name}"
            search_results = sp.search(q=search_query, type='track', limit=1)
            
            if not search_results['tracks']['items']:
                # Try a broader search without track/artist prefixes
                search_query = f"{track_name} {artist_name}"
                search_results = sp.search(q=search_query, type='track', limit=1)
            
            if not search_results['tracks']['items']:
                logger.warning(f"🎵 No tracks found for: {track_name} by {artist_name}")
                return jsonify({'error': 'Track not found on Spotify'}), 404
            
            track = search_results['tracks']['items'][0]
            track_uri = track['uri']
            track_info = track
        
        # Get current playback to check for active device
        current_playback = sp.current_playback()
        device_id = None
        
        if current_playback and current_playback.get('device'):
            device_id = current_playback['device']['id']
        else:
            # Get available devices if no current playback
            devices = sp.devices()
            available_devices = devices.get('devices', [])
            active_devices = [d for d in available_devices if d['is_active']]
            
            if active_devices:
                device_id = active_devices[0]['id']
            elif available_devices:
                device_id = available_devices[0]['id']
        
        # Play the track
        if device_id:
            sp.start_playback(device_id=device_id, uris=[track_uri])
            logger.info(f"🎵 Playing: {track_info['name']} by {', '.join([a['name'] for a in track_info.get('artists', [{'name': artist_name}])])} on device {device_id}")
        else:
            sp.start_playback(uris=[track_uri])
            logger.info(f"🎵 Playing: {track_info['name']} by {', '.join([a['name'] for a in track_info.get('artists', [{'name': artist_name}])])} on default device")
        
        return jsonify({
            'success': True,
            'message': f"Now playing: {track_info['name']} by {', '.join([a['name'] for a in track_info.get('artists', [{'name': artist_name}])])}"
        })
        
    except Exception as e:
        logger.error(f"❌ Error playing song: {e}")
        error_msg = str(e)
        
        # Handle common Spotify API errors
        if "NO_ACTIVE_DEVICE" in error_msg:
            return jsonify({'error': 'No active Spotify device found. Please open Spotify on a device first.'}), 400
        elif "PREMIUM_REQUIRED" in error_msg:
            return jsonify({'error': 'Spotify Premium is required to control playback.'}), 403
        elif "Insufficient client scope" in error_msg:
            return jsonify({'error': 'App needs additional permissions. Please re-authorize the application.'}), 403
        else:
            return jsonify({'error': f'Failed to play song: {error_msg}'}), 500

@app.route('/api/test-websocket')
def test_websocket():
    """Test endpoint to manually trigger WebSocket event"""
    logger.info("🧪 Manual WebSocket test triggered")
    try:
        socketio.emit('new_songs_detected', {
            'message': 'Manual test - new songs detected in database',
            'count': get_song_count()
        })
        logger.info("🧪 WebSocket test event sent successfully")
        return jsonify({'message': 'WebSocket test event sent'})
    except Exception as e:
        logger.error(f"❌ Error in WebSocket test: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("🚀 Starting Flask app with WebSocket support...")
    # Start the background task for checking new songs
    start_background_task()
    # Get port from environment variable, default to 5000
    port = int(os.getenv('PORT', 5000))
    logger.info(f"🌐 Starting server on port {port}")
    # Disable debug mode in production to prevent auto-restarts
    socketio.run(app, debug=False, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
