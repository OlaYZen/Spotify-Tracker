import os
import time
import logging
from datetime import datetime
import pytz
from dotenv import load_dotenv
from spotipy import Spotify
from spotipy.oauth2 import SpotifyOAuth
from models import SongPlay, Session

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
logger = logging.getLogger('tracker')

# Initialize Spotify client with configurable timeout
spotify_timeout = int(os.getenv('SPOTIFY_TIMEOUT', 30))  # Default 30 seconds
sp = Spotify(auth_manager=SpotifyOAuth(
    client_id=os.getenv('SPOTIPY_CLIENT_ID'),
    client_secret=os.getenv('SPOTIPY_CLIENT_SECRET'),
    redirect_uri=os.getenv('SPOTIPY_REDIRECT_URI'),
    scope='user-read-playback-state user-read-currently-playing user-modify-playback-state'
), requests_timeout=spotify_timeout)

def get_album_cover_url(track):
    """Get album cover URL from track data"""
    try:
        if track['album']['images']:
            # Use the medium size image (300x300) - index 1
            # If not available, use the first available image
            return track['album']['images'][1]['url'] if len(track['album']['images']) > 1 else track['album']['images'][0]['url']
    except Exception as e:
        logger.error(f"Error getting album cover: {e}")
    return None

def track_loop():
    last_track_id = None
    current_session = None
    
    # Get port from environment variable, default to 5000
    port = int(os.getenv('PORT', 5000))
    logger.info("🎵 Starting Spotify tracking loop...")
    logger.info("📊 Songs will be saved to the database automatically")
    logger.info("⏱️  Listening duration will be tracked")
    logger.info("🖼️  Album covers will be fetched and stored")
    logger.info(f"🌐 Open http://localhost:{port} in your browser to view the data")
    logger.info("=" * 50)
    
    while True:
        try:
            playback = sp.current_playback()
            
            # Handle song start
            if playback and playback.get('item') and playback.get('is_playing'):
                track = playback['item']
                track_id = track['id']
                current_progress = playback.get('progress_ms', 0)
                track_duration = track.get('duration_ms', 0)

                if track_id != last_track_id:
                    # If there was a previous song playing, mark it as stopped (song was skipped)
                    if last_track_id and current_session:
                        try:
                            session = Session()
                            play = session.query(SongPlay).filter_by(id=current_session).first()
                            if play:
                                # Get local timezone
                                local_tz = pytz.timezone('Europe/Berlin')  # Adjust to your timezone
                                local_time = datetime.now(local_tz)
                                play.end_time = local_time
                                
                                # Calculate final listening duration
                                if play.start_time:
                                    # Ensure start_time is timezone-aware
                                    if play.start_time.tzinfo is None:
                                        play.start_time = local_tz.localize(play.start_time)
                                    
                                    total_listened = (play.end_time - play.start_time).total_seconds() * 1000
                                    play.played_duration_ms = min(total_listened, play.track_duration_ms or total_listened)
                                    
                                    # Mark as completed if listened to 90% or more of the song
                                    if play.track_duration_ms and play.played_duration_ms >= (play.track_duration_ms * 0.9):
                                        play.is_completed = True
                                
                                session.commit()
                                logger.info(f"⏭️ Song skipped: {play.track_name} - Listened for {play.played_duration_ms/1000:.1f}s")
                        except Exception as db_error:
                            logger.error(f"Database error stopping skipped song: {db_error}")
                            if session:
                                session.rollback()
                        finally:
                            if session:
                                session.close()
                    
                    # Reset session for new song
                    current_session = None
                    
                    # New song started
                    last_track_id = track_id
                    
                    # Get album cover URL
                    album_cover_url = get_album_cover_url(track)

                    session = None
                    try:
                        session = Session()
                        # Get local timezone
                        local_tz = pytz.timezone('Europe/Berlin')  # Adjust to your timezone
                        local_time = datetime.now(local_tz)
                        
                        play = SongPlay(
                            track_name=track['name'],
                            artist_name=', '.join([a['name'] for a in track['artists']]),
                            album_name=track['album']['name'],
                            device_name=playback['device']['name'],
                            device_type=playback['device']['type'],
                            album_cover_url=album_cover_url,
                            track_uri=track.get('uri'),
                            track_duration_ms=track_duration,
                            start_time=local_time,
                            played_duration_ms=0
                        )
                        session.add(play)
                        session.commit()
                        current_session = play.id
                        
                        cover_status = "with album cover" if album_cover_url else "without album cover"
                        logger.info(f"🎵 New song started: {track['name']} by {', '.join([a['name'] for a in track['artists']])} ({cover_status})")
                    except Exception as db_error:
                        logger.error(f"Database error: {db_error}")
                        if session:
                            session.rollback()
                    finally:
                        if session:
                            session.close()
                else:
                    # Same song, update progress
                    if current_session:
                        try:
                            session = Session()
                            play = session.query(SongPlay).filter_by(id=current_session).first()
                            if play:
                                # Calculate how much time has passed since last update
                                local_tz = pytz.timezone('Europe/Berlin')  # Adjust to your timezone
                                current_time = datetime.now(local_tz)
                                
                                # Ensure start_time is timezone-aware
                                if play.start_time and play.start_time.tzinfo is None:
                                    play.start_time = local_tz.localize(play.start_time)
                                
                                time_diff = (current_time - play.start_time).total_seconds() * 1000
                                play.played_duration_ms = min(time_diff, track_duration)
                                session.commit()
                        except Exception as db_error:
                            logger.error(f"Database error updating progress: {db_error}")
                            if session:
                                session.rollback()
                        finally:
                            if session:
                                session.close()
            
            # Handle song stop/pause or skip (when no playback or not playing)
            elif last_track_id and (not playback or not playback.get('is_playing')):
                if current_session:
                    try:
                        session = Session()
                        play = session.query(SongPlay).filter_by(id=current_session).first()
                        if play:
                            # Get local timezone
                            local_tz = pytz.timezone('Europe/Berlin')  # Adjust to your timezone
                            local_time = datetime.now(local_tz)
                            play.end_time = local_time
                            
                            # Calculate final listening duration
                            if play.start_time:
                                # Ensure start_time is timezone-aware
                                if play.start_time.tzinfo is None:
                                    play.start_time = local_tz.localize(play.start_time)
                                
                                total_listened = (play.end_time - play.start_time).total_seconds() * 1000
                                play.played_duration_ms = min(total_listened, play.track_duration_ms or total_listened)
                                
                                # Mark as completed if listened to 90% or more of the song
                                if play.track_duration_ms and play.played_duration_ms >= (play.track_duration_ms * 0.9):
                                    play.is_completed = True
                            
                            session.commit()
                            logger.info(f"⏸️ Song stopped/paused: {play.track_name} - Listened for {play.played_duration_ms/1000:.1f}s")
                    except Exception as db_error:
                        logger.error(f"Database error stopping song: {db_error}")
                        if session:
                            session.rollback()
                    finally:
                        if session:
                            session.close()
                
                last_track_id = None
                current_session = None

        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Error in track loop: {error_msg}")
            
            # Handle specific Spotify API errors
            if "Read timed out" in error_msg or "timeout" in error_msg.lower():
                logger.warning("⏰ Spotify API timeout - waiting longer before retry")
                time.sleep(10)  # Wait longer on timeout
                continue
            elif "429" in error_msg or "rate limit" in error_msg.lower():
                logger.warning("🚫 Spotify API rate limit - waiting before retry")
                time.sleep(30)  # Wait longer on rate limit
                continue
            elif "401" in error_msg or "unauthorized" in error_msg.lower():
                logger.error("🔐 Spotify authentication error - check your credentials")
                time.sleep(60)  # Wait longer on auth error
                continue

        time.sleep(5)

if __name__ == "__main__":
    logger.info("🚀 Starting Spotify Tracker...")
    track_loop()
