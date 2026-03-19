#!/usr/bin/env python3
"""
Multimedia Downloader
Downloads MP3/MP4 from YouTube and other media sites using yt-dlp ( run pip install yt-dlp )
"""

import argparse
import sys
import os
import time
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    print("Error: yt-dlp is not installed.")
    print("Install it with: pip install yt-dlp")
    sys.exit(1)


def get_default_download_dir():
    """Get the default download directory (script_dir/downloads)"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, 'downloads')


def ask_user_input():
    """Interactive Q&A to gather download preferences"""
    print("\n" + "="*60)
    print("MULTIMEDIA DOWNLOADER - Interactive Mode")
    print("="*60 + "\n")

    # Get URLs or file path
    print("How would you like to provide URLs?")
    print("  1. Enter URLs directly (one per line, empty line to finish)")
    print("  2. Provide a file path containing URLs")
    choice = input("\nChoice (1/2) [default: 1]: ").strip() or "1"

    urls = []
    if choice == "2":
        file_path = input("\nEnter file path (supports ~, relative, or absolute): ").strip()
        file_path = os.path.expanduser(file_path)  # Expand ~
        if not os.path.isabs(file_path):
            file_path = os.path.abspath(file_path)  # Convert relative to absolute

        if os.path.exists(file_path):
            urls = get_urls_from_file(file_path)
            print(f"✓ Loaded {len(urls)} URL(s) from {file_path}")
        else:
            print(f"✗ Error: File not found: {file_path}")
            sys.exit(1)
    else:
        print("\nEnter URLs (one per line, empty line when done):")
        while True:
            url = input("  URL: ").strip()
            if not url:
                break
            urls.append(url)

        if not urls:
            print("✗ No URLs provided. Exiting.")
            sys.exit(1)

    # Format selection
    print("\nSelect download format:")
    print("  1. MP3 (audio only)")
    print("  2. MP4 (video)")
    format_choice = input("Choice (1/2) [default: 1 - MP3]: ").strip() or "1"
    format_type = "mp3" if format_choice == "1" else "mp4"

    # Quality selection
    print("\nSelect quality:")
    print("  1. Worst (smallest file size)")
    print("  2. Best (highest quality)")
    print("  3. Specific (e.g., 720p, 1080p)")
    quality_choice = input("Choice (1/2/3) [default: 1 - Worst]: ").strip() or "1"

    if quality_choice == "3":
        quality = input("Enter resolution (e.g., 720p, 1080p): ").strip() or "worst"
    elif quality_choice == "2":
        quality = "best"
    else:
        quality = "worst"

    # Output directory
    default_output = get_default_download_dir()
    output_dir = input(f"\nOutput directory [default: {default_output}]: ").strip() or default_output
    output_dir = os.path.expanduser(output_dir)  # Expand ~
    if not os.path.isabs(output_dir):
        output_dir = os.path.abspath(output_dir)  # Convert relative to absolute

    # Sleep interval (only ask if multiple URLs)
    sleep_interval = 3.0
    if len(urls) > 1:
        print(f"\nMultiple URLs detected ({len(urls)} items)")
        print("Recommended delay between downloads: 3-5s (helps avoid rate limits)")
        sleep_input = input("Sleep interval in seconds [default: 3]: ").strip()
        if sleep_input:
            try:
                sleep_interval = float(sleep_input)
            except ValueError:
                print("Invalid input, using default: 3s")
                sleep_interval = 3.0

    # Proxy (optional)
    print("\nProxy settings (optional, press Enter to skip):")
    print("  Examples: socks5://127.0.0.1:1080 or http://proxy:port")
    proxy = input("Proxy URL [default: none]: ").strip() or None

    # Summary
    print("\n" + "="*60)
    print("DOWNLOAD SUMMARY")
    print("="*60)
    print(f"URLs: {len(urls)} item(s)")
    print(f"Format: {format_type.upper()}")
    print(f"Quality: {quality}")
    print(f"Output: {output_dir}")
    if len(urls) > 1:
        print(f"Sleep interval: {sleep_interval}s")
    if proxy:
        print(f"Proxy: {proxy}")
    print("="*60 + "\n")

    confirm = input("Proceed with download? (y/n) [default: y]: ").strip().lower() or "y"
    if confirm != "y":
        print("Download cancelled.")
        sys.exit(0)

    return urls, format_type, quality, output_dir, proxy, sleep_interval


def download_media(urls, format_type='mp4', quality='best', output_dir='downloads', proxy=None, sleep_interval=3):
    """
    Download media from URLs

    Args:
        urls: List of URLs to download
        format_type: 'mp3' for audio, 'mp4' for video
        quality: 'best', 'worst', or specific quality like '720p'
        output_dir: Directory to save downloads
        proxy: Proxy URL (e.g., 'socks5://127.0.0.1:1080' or 'http://proxy:port')
        sleep_interval: Seconds to wait between downloads (default: 3, helps avoid rate limits)
    """
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Base options for yt-dlp
    ydl_opts = {
        'outtmpl': str(output_path / '%(title)s.%(ext)s'),
        'progress_hooks': [progress_hook],
        'quiet': False,
        'no_warnings': False,
        # Network error handling
        'retries': 10,  # Retry up to 10 times on download errors
        'fragment_retries': 10,  # Retry fragments
        'extractor_retries': 3,  # Retry metadata extraction
        'file_access_retries': 3,  # Retry file access
        'ignoreerrors': False,  # Don't ignore errors (we handle them)
        # Connection settings
        'socket_timeout': 30,  # 30 second timeout
        'nocheckcertificate': False,  # Verify SSL certificates
    }

    # Add proxy if provided
    if proxy:
        ydl_opts['proxy'] = proxy

    # Format-specific options
    if format_type == 'mp3':
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        })
    else:  # mp4
        if quality == 'best':
            ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        elif quality == 'worst':
            ydl_opts['format'] = 'worst[ext=mp4]/worst'
        else:
            # Specific quality (e.g., '720p')
            height = quality.replace('p', '')
            ydl_opts['format'] = f'bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height}][ext=mp4]/best'

    # Download
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"\n{'='*60}")
            print(f"Downloading {len(urls)} item(s) as {format_type.upper()}")
            print(f"Quality: {quality}")
            print(f"Output directory: {output_path.absolute()}")
            if proxy:
                print(f"Proxy: {proxy}")
            if len(urls) > 1:
                print(f"Sleep interval: {sleep_interval}s between downloads")
            print(f"{'='*60}\n")

            error_count = 0
            for i, url in enumerate(urls, 1):
                try:
                    print(f"\n[{i}/{len(urls)}] Processing: {url}")
                    ydl.download([url])
                    print(f"✓ Successfully downloaded")

                    # Sleep between downloads to avoid rate limiting (except for last item)
                    if i < len(urls) and sleep_interval > 0:
                        print(f"⏳ Waiting {sleep_interval}s before next download...")
                        time.sleep(sleep_interval)

                except Exception as e:
                    print(f"✗ Error downloading {url}: {e}")
                    error_count += 1
                    # Still sleep after errors to avoid triggering rate limits
                    if i < len(urls) and sleep_interval > 0:
                        time.sleep(sleep_interval)

            print(f"\n{'='*60}")
            print(f"Download complete!")
            print(f"Success: {len(urls) - error_count}/{len(urls)}")
            if error_count > 0:
                print(f"Failed: {error_count}/{len(urls)}")
            print(f"{'='*60}\n")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


def progress_hook(d):
    """Display download progress"""
    if d['status'] == 'downloading':
        try:
            percent = d.get('_percent_str', 'N/A')
            speed = d.get('_speed_str', 'N/A')
            eta = d.get('_eta_str', 'N/A')
            print(f"\rDownloading: {percent} | Speed: {speed} | ETA: {eta}", end='', flush=True)
        except:
            pass
    elif d['status'] == 'finished':
        print(f"\rDownload finished, processing...                          ")


def get_urls_from_file(file_path):
    """Read URLs from a text file (one URL per line)"""
    try:
        with open(file_path, 'r') as f:
            urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        return urls
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Download MP3/MP4 from YouTube and other media sites',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode (default when no args provided)
  python mm-downloader.py
  python mm-downloader.py --interactive

  # Download audio as MP3 (default format)
  python mm-downloader.py "https://www.youtube.com/watch?v=VIDEO_ID"

  # Download video as MP4
  python mm-downloader.py -f mp4 "https://www.youtube.com/watch?v=VIDEO_ID"

  # Download multiple URLs (with automatic 3s delay between)
  python mm-downloader.py "URL1" "URL2" "URL3"

  # Download from file containing URLs
  python mm-downloader.py -i urls.txt
  python mm-downloader.py -i ~/Documents/my-urls.txt

  # Download best quality instead of default worst
  python mm-downloader.py -q best "URL"

  # Use proxy (SOCKS5 or HTTP)
  python mm-downloader.py --proxy "socks5://127.0.0.1:1080" "URL"

  # Bulk download with longer delay (safer)
  python mm-downloader.py -i urls.txt --sleep 5

Defaults: MP3 format, worst quality, 3s sleep interval

Supported sites: YouTube, Vimeo, Facebook, Twitter, Instagram, TikTok, and 1000+ more
        """
    )

    parser.add_argument('urls', nargs='*', help='URL(s) to download')
    parser.add_argument('-i', '--input-file', help='Text file containing URLs (one per line)')
    parser.add_argument('-f', '--format', choices=['mp3', 'mp4'], default='mp3',
                        help='Download format: mp3 (audio) or mp4 (video) (default: mp3)')
    parser.add_argument('-q', '--quality', default='worst',
                        help='Quality: best, worst, or specific (e.g., 720p, 1080p) (default: worst)')
    parser.add_argument('-o', '--output', default=None,
                        help='Output directory (default: script_dir/downloads)')
    parser.add_argument('--proxy', help='Proxy URL (e.g., socks5://127.0.0.1:1080 or http://proxy:port)')
    parser.add_argument('--sleep', type=float, default=3.0,
                        help='Seconds to wait between downloads (default: 3, helps avoid rate limits)')
    parser.add_argument('--list-formats', action='store_true',
                        help='List available formats for a URL without downloading')
    parser.add_argument('--interactive', action='store_true',
                        help='Run in interactive Q&A mode')

    args = parser.parse_args()

    # Interactive mode: if no arguments provided or --interactive flag
    if args.interactive or (not args.urls and not args.input_file):
        urls, format_type, quality, output_dir, proxy, sleep_interval = ask_user_input()
        download_media(urls, format_type, quality, output_dir, proxy, sleep_interval)
        sys.exit(0)

    # Collect URLs
    urls = []
    if args.input_file:
        # Expand ~ and convert to absolute path
        file_path = os.path.expanduser(args.input_file)
        if not os.path.isabs(file_path):
            file_path = os.path.abspath(file_path)
        urls.extend(get_urls_from_file(file_path))
    if args.urls:
        urls.extend(args.urls)

    if not urls:
        parser.print_help()
        print("\nError: No URLs provided. Use positional arguments or -i/--input-file")
        sys.exit(1)

    # Expand output directory path
    output_dir = args.output if args.output else get_default_download_dir()
    output_dir = os.path.expanduser(output_dir)
    if not os.path.isabs(output_dir):
        output_dir = os.path.abspath(output_dir)

    # List formats mode
    if args.list_formats:
        print(f"Listing available formats for: {urls[0]}\n")
        ydl_opts = {'listformats': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([urls[0]])
        sys.exit(0)

    # Download
    download_media(urls, args.format, args.quality, output_dir, args.proxy, args.sleep)


if __name__ == '__main__':
    main()
