# Multimedia Downloader

A Python script to download MP3 (audio) or MP4 (video) from YouTube and 1000+ other media sites.

**Features interactive Q&A mode by default** - just run the script with no arguments!

## Features

- **Interactive mode** - Guided Q&A interface (runs by default)
- Download videos as MP4 or audio as MP3 (defaults to MP3)
- Quality selection (defaults to worst/smallest for faster downloads)
- Support for YouTube, Vimeo, Facebook, Twitter, Instagram, TikTok, and many more
- Batch download multiple URLs
- **Automatic rate limiting** - 3-second delay between downloads by default (configurable)
- **Proxy support** - Route downloads through SOCKS5 or HTTP proxies
- Path expansion support (~/Downloads, relative paths, etc.)
- Progress tracking
- Downloads saved to script_dir/downloads by default

## Installation

1. **Install Python dependencies:**
   ```bash
   pip install yt-dlp
   ```

2. **Install FFmpeg** (required for MP3 conversion):
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use `winget install ffmpeg`
   - **Mac**: `brew install ffmpeg`
   - **Linux**: `sudo apt install ffmpeg` (Ubuntu/Debian) or `sudo yum install ffmpeg` (RHEL/CentOS)

3. **Make script executable** (optional, Linux/Mac):
   ```bash
   chmod +x mm-downloader.py
   ```

## Usage

### Interactive Mode (Recommended)

Simply run the script without any arguments for guided Q&A:

```bash
python mm-downloader.py
```

Or explicitly use interactive mode:

```bash
python mm-downloader.py --interactive
```

The script will ask you:
- How to provide URLs (direct input or file)
- Format preference (MP3/MP4) - defaults to MP3
- Quality selection (worst/best/specific) - defaults to worst
- Output directory - supports ~/Downloads, relative paths, etc.
- Sleep interval between downloads (for bulk downloads)
- Proxy settings (optional)

### Command Line Mode

**Download a video as MP4:**
```bash
python mm-downloader.py -f mp4 "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Download audio as MP3 (default):**
```bash
python mm-downloader.py -f mp3 "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Download multiple URLs:**
```bash
python mm-downloader.py "URL1" "URL2" "URL3"
```

**Download from a file containing URLs:**
```bash
python mm-downloader.py -i urls.txt
```

### Advanced Options

**Specific quality:**
```bash
python mm-downloader.py -q 720p "URL"
python mm-downloader.py -q 1080p "URL"
```

**Custom output directory:**
```bash
python mm-downloader.py -o my_videos "URL"
```

**Use proxy (SOCKS5 or HTTP):**
```bash
python mm-downloader.py --proxy "socks5://127.0.0.1:1080" "URL"
python mm-downloader.py --proxy "http://proxy.example.com:8080" "URL"
```

**Adjust delay between downloads:**
```bash
# Faster (less safe, 1 second delay)
python mm-downloader.py --sleep 1 -i urls.txt

# Safer for bulk downloads (5 second delay)
python mm-downloader.py --sleep 5 -i urls.txt

# No delay (not recommended, may trigger rate limits)
python mm-downloader.py --sleep 0 -i urls.txt
```

**List available formats:**
```bash
python mm-downloader.py --list-formats "URL"
```

### Command Line Options

```
positional arguments:
  urls                  URL(s) to download

options:
  -h, --help            Show help message
  -i, --input-file      Text file containing URLs (one per line, supports ~ and relative paths)
  -f, --format         Download format: mp3 (audio) or mp4 (video) (default: mp3)
  -q, --quality        Quality: best, worst, or specific (e.g., 720p, 1080p) (default: worst)
  -o, --output         Output directory (supports ~ and relative paths) (default: script_dir/downloads)
  --proxy              Proxy URL (e.g., socks5://127.0.0.1:1080 or http://proxy:port)
  --sleep              Seconds to wait between downloads (default: 3, helps avoid rate limits)
  --interactive        Run in interactive Q&A mode
  --list-formats       List available formats for a URL without downloading
```

## Batch Download with URLs File

Create a text file `urls.txt` with one URL per line:
```
https://www.youtube.com/watch?v=VIDEO_ID1
https://www.youtube.com/watch?v=VIDEO_ID2
https://vimeo.com/12345678
# Lines starting with # are ignored
```

Then run:
```bash
python mm-downloader.py -i urls.txt -f mp3
```

## Rate Limiting & Proxy Usage

**Automatic rate limiting:**
The script includes a 3-second delay between downloads by default to help avoid rate limits from sites like YouTube. This can be adjusted with `--sleep`.

**When to use longer delays:**
- Downloading 10+ videos: Use `--sleep 5` or higher
- Bulk scraping 50+ videos: Use `--sleep 10`
- Getting rate limited: Increase to `--sleep 15` or higher

**When to use a proxy:**
- Bulk downloading large numbers of videos
- Privacy concerns
- IP blocks or rate limiting issues
- Regional restrictions

**Proxy setup:**
```bash
# SOCKS5 (e.g., via SSH tunnel or Tor - not recommended for YouTube)
python mm-downloader.py --proxy "socks5://127.0.0.1:1080" -i urls.txt

# HTTP proxy
python mm-downloader.py --proxy "http://proxy.example.com:8080" -i urls.txt
```

**Note:** Tor is not recommended as YouTube blocks most exit nodes. Use a VPN or paid proxy service instead.

## Supported Sites

yt-dlp supports 1000+ sites including:
- YouTube
- Vimeo
- Facebook
- Twitter/X
- Instagram
- TikTok
- Reddit
- Twitch
- And many more

Full list: [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

## Troubleshooting

**"yt-dlp is not installed" error:**
```bash
pip install yt-dlp
```

**MP3 conversion fails:**
- Install FFmpeg (see Installation section above)

**Download fails with "Video unavailable":**
- The video might be private, deleted, or region-restricted
- Try updating yt-dlp: `pip install -U yt-dlp`

**Slow downloads:**
- Some sites may throttle download speeds
- Network connection and video size affect download time

**Rate limiting / "Too many requests" errors:**
- Increase delay between downloads: `--sleep 5` or higher
- Use a proxy/VPN: `--proxy "socks5://127.0.0.1:1080"`
- Wait a few hours before retrying
- Update yt-dlp: `pip install -U yt-dlp`

**"2 bytes missing" or TransportError:**
- Network issue during download - the script will automatically retry up to 10 times
- If it persists, try:
  - Check your internet connection
  - Update yt-dlp: `pip install -U yt-dlp`
  - Try a different network or use a VPN/proxy
  - Clear yt-dlp cache: `yt-dlp --rm-cache-dir`
  - Some videos may have region restrictions or temporary server issues

## Legal Notice

This tool is for downloading content you have rights to download. Respect copyright laws and terms of service of the platforms you're downloading from. Use responsibly.

## License

Free to use and modify for personal and educational purposes.
