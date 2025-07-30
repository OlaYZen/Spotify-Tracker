#!/usr/bin/env python3
"""
Spotify Tracker Launcher
Runs both the Flask web server (app.py) and Spotify tracker (tracker.py)
"""

import subprocess
import time
import signal
import sys
import os
import logging
from pathlib import Path
from datetime import datetime
import pytz

# Configure logging
import os
from dotenv import load_dotenv

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

# Configure Werkzeug logger to respect LOG_LEVEL
werkzeug_logger = logging.getLogger('werkzeug')
werkzeug_logger.setLevel(log_level)
werkzeug_logger.handlers = []  # Remove default handlers
werkzeug_logger.addHandler(file_handler)
werkzeug_logger.addHandler(console_handler)
werkzeug_logger.propagate = False  # Prevent duplicate logging

logger = logging.getLogger('launcher')

def signal_handler(sig, frame):
    """Handle Ctrl+C to gracefully shutdown all processes"""
    logger.info("\n🛑 Shutting down Spotify Tracker...")
    sys.exit(0)

def run_app():
    """Run the Flask web server (app.py)"""
    logger.info("🚀 Starting Flask web server with WebSocket support...")
    try:
        # Add environment variable to disable Flask debug mode reloader when running via launcher
        env = os.environ.copy()
        env['FLASK_ENV'] = 'production'
        app_process = subprocess.Popen([sys.executable, "app.py"], 
                                     stdout=subprocess.PIPE, 
                                     stderr=subprocess.PIPE,
                                     text=True,
                                     env=env)
        
        # Wait a moment for the server to start
        time.sleep(3)
        
        if app_process.poll() is None:
            # Get port from environment variable, default to 5000
            port = int(os.getenv('PORT', 5000))
            logger.info(f"✅ Flask web server with WebSocket support is running on http://localhost:{port}")
            return app_process
        else:
            stdout, stderr = app_process.communicate()
            logger.error("❌ Failed to start Flask web server:")
            logger.error(f"Error: {stderr}")
            return None
            
    except Exception as e:
        logger.error(f"❌ Error starting Flask web server: {e}")
        return None

def run_tracker():
    """Run the Spotify tracker (tracker.py)"""
    logger.info("🎵 Starting Spotify tracker...")
    try:
        tracker_process = subprocess.Popen([sys.executable, "tracker.py"],
                                         stdout=subprocess.PIPE,
                                         stderr=subprocess.PIPE,
                                         text=True)
        
        # Wait a moment for the tracker to start
        time.sleep(2)
        
        if tracker_process.poll() is None:
            logger.info("✅ Spotify tracker is running")
            return tracker_process
        else:
            stdout, stderr = tracker_process.communicate()
            logger.error("❌ Failed to start Spotify tracker:")
            logger.error(f"Error: {stderr}")
            return None
            
    except Exception as e:
        logger.error(f"❌ Error starting Spotify tracker: {e}")
        return None

def main():
    """Main function to run both processes"""
    # Set up signal handler for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    
    logger.info("🎧 Starting Spotify Tracker...")
    logger.info("=" * 50)
    
    # Check if required files exist
    if not Path("app.py").exists():
        logger.error("❌ app.py not found!")
        sys.exit(1)
    
    if not Path("tracker.py").exists():
        logger.error("❌ tracker.py not found!")
        sys.exit(1)
    
    # Check if .env file exists
    if not Path(".env").exists():
        logger.warning("⚠️  Warning: .env file not found!")
        logger.warning("   Make sure you have set up your Spotify API credentials.")
        logger.warning("   See README.md for setup instructions.")
        logger.warning("")
    
    # Start Flask web server first
    app_process = run_app()
    if app_process is None:
        logger.error("❌ Failed to start Flask web server. Exiting...")
        sys.exit(1)
    
    # Start Spotify tracker
    tracker_process = run_tracker()
    if tracker_process is None:
        logger.error("❌ Failed to start Spotify tracker. Shutting down...")
        app_process.terminate()
        sys.exit(1)
    
    # Get port from environment variable, default to 5000
    port = int(os.getenv('PORT', 5000))
    logger.info("=" * 50)
    logger.info("🎉 Spotify Tracker is now running with real-time updates!")
    logger.info(f"📱 Open http://localhost:{port} in your browser")
    logger.info("⚡ WebSocket enabled for instant song updates")
    logger.info("🛑 Press Ctrl+C to stop all services")
    logger.info("=" * 50)
    
    try:
        # Monitor both processes
        while True:
            # Check if app process is still running
            if app_process.poll() is not None:
                logger.error("❌ Flask web server stopped unexpectedly")
                tracker_process.terminate()
                break
            
            # Check if tracker process is still running
            if tracker_process.poll() is not None:
                logger.error("❌ Spotify tracker stopped unexpectedly")
                app_process.terminate()
                break
            
            time.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("\n🛑 Received shutdown signal...")
    finally:
        # Cleanup
        logger.info("🧹 Cleaning up processes...")
        if app_process and app_process.poll() is None:
            app_process.terminate()
            app_process.wait()
        
        if tracker_process and tracker_process.poll() is None:
            tracker_process.terminate()
            tracker_process.wait()
        
        logger.info("✅ Spotify Tracker stopped successfully")

if __name__ == "__main__":
    main() 