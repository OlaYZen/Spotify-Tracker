from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import logging
import pytz
import os
from dotenv import load_dotenv

# Configure logging with Berlin timezone
load_dotenv()

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
logger = logging.getLogger('models')

Base = declarative_base()

class SongPlay(Base):
    __tablename__ = 'song_plays'
    id = Column(Integer, primary_key=True)
    track_name = Column(String)
    artist_name = Column(String)
    album_name = Column(String)
    device_name = Column(String)
    device_type = Column(String)
    album_cover_url = Column(String, nullable=True)
    track_uri = Column(String, nullable=True)  # Spotify track URI for playback
    timestamp = Column(DateTime, default=datetime.utcnow)
    # New fields for duration tracking
    track_duration_ms = Column(Integer, nullable=True)  # Total track duration in milliseconds
    played_duration_ms = Column(Integer, default=0)  # Actual time listened in milliseconds
    is_completed = Column(Boolean, default=False)  # Whether the song was played to completion
    start_time = Column(DateTime, nullable=True)  # When the song started playing
    end_time = Column(DateTime, nullable=True)  # When the song stopped playing

logger.info("🔧 Initializing database connection...")
engine = create_engine('sqlite:///songs.db')
Base.metadata.create_all(engine)
logger.info("✅ Database tables created/verified")
Session = sessionmaker(bind=engine)
logger.info("✅ Database session factory created")
