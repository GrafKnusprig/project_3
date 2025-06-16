# Adding folders in Music Library
- add and remove 'virtual' folders in the music library
- move files into those folders and out of those folders to be able to build a custom folder structure
- automatically rename files if 2 files with the same name would end up in the same folder

# Save and load Music Library
- music library can be saved
- music library can be loaded
- save library after every change to a auto save file in the app directory
- automatically load auto save library after restart

# Adding complete folders to the Music Library
- add whole folders from the file explorer to the music library

# Export to flash drive
- export the media library with its folder structure to the selected devices root folder
- only update changes to prevent unnecessary rewrites when flashing the music library


# Index file
- folders that contain music files are considered music folders
- the index file contains a list of all music folders
- every music folder entry contains a list of the music files paths in that folder
- the index file also contains a flat list of all music files paths
- the paths are in a format, that the esp32 can play the pcm file by using the path