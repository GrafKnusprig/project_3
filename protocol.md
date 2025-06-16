# Development Protocol

This file tracks changes made to the ESP32 Music Manager application.

## June 16, 2025

### Changes

#### 11:00 AM - Added and enhanced `.gitignore` file
- Updated the existing `.gitignore` file with more comprehensive patterns for:
  - Dependencies (including PnP-related files)
  - Build artifacts
  - Testing coverage reports
  - Editor configurations
  - Environment files
  - Project-specific patterns

#### 11:15 AM - Created README.md for GitHub
- Added comprehensive README.md file describing the ESP32 Music Manager application
- Included sections for features, tech stack, installation, and usage
- Mentioned that the ground structure was created using bolt.new AI tool

#### 11:30 AM - Updated device detection to only show removable drives
- Modified server-side code to filter device list to only show removable storage devices (USB drives and SD cards)
- Added platform-specific detection for Windows, macOS, and Linux
- Updated the README.md to reflect this change

#### 11:45 AM - Removed auto-reload from device list
- Removed the automatic refresh of the device list that happened every 5 seconds
- Kept the manual refresh button functionality
- Changed in `DeviceManager.tsx` by removing the `setInterval` in the `useEffect` hook

#### 12:00 PM - Fixed user folder access in file tree
- Improved filesystem access in the server to properly handle user folders
- Added defaults to start navigation from user's home directory instead of root
- Enhanced directory scanning to handle permission issues gracefully
- Added parent directory navigation with ".." entries
- Prioritized common user directories (Desktop, Documents, Downloads, etc.)
- Added proper error handling for permission-denied scenarios
- Limited directory listing to 100 items for better performance
- Skip hidden files and directories (starting with dots)

#### 12:15 PM - Fixed permission errors with system folders
- User prompt: Reported numerous permission errors accessing Library and system folders
- Added a comprehensive list of system directories to skip during scanning
- Created specific handling for macOS Library folder to avoid permission errors
- Changed default view on macOS to show common directories (Music, Downloads, Documents, Desktop) directly
- Removed verbose warning logs for expected permission issues
- Improved lazy loading by not pre-scanning subdirectories
- Added special handling to avoid scanning known system directories with permission restrictions

#### 12:30 PM - Fixed file explorer folder navigation
- User prompt: Reported inability to open folders in the file explorer
- Completely rewrote the FileExplorer.tsx component to fix navigation issues
- Simplified the folder navigation logic to ensure proper folder content display
- Added proper breadcrumb navigation for easy traversal of directories
- Improved handling of the current path and folder contents
- Added home button for quick navigation back to root directory
- Added parent folder navigation button
- Fixed content display for both root and subdirectory navigation
- Ensured proper loading and error state handling
