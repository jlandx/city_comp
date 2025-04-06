# City Comparison App

A web application that allows users to compare two cities based on various metrics including:
- Population
- Time zone differences
- Geographic distance
- City statistics
- Weather information
- Historical growth data

## Features
- Interactive city search with autocomplete
- Visual size comparison
- Dark mode support
- Distance units toggle (KM/Miles)
- Responsive design
- Interactive map visualization
- Share functionality with URL sharing
- Top comparisons tracking
- Personal comparison history
- City locking for random comparisons
- Multiple tabs for different views

## Technologies Used
- HTML5
- CSS3
- JavaScript
- Leaflet.js for mapping
- OpenStreetMap for geocoding
- OpenWeatherMap API for weather data
- TimeZoneDB API for timezone data
- Wikidata API for population data
- Local Storage for data persistence

## Getting Started
1. Clone the repository
2. Open `index.html` in your browser
3. Enter two cities to compare
4. Explore the various comparison metrics

## Development
- The application uses relative paths for all assets
- Base URL is configured for GitHub Pages deployment
- CSS and JavaScript files are in the root directory

## Deployment
- The app is deployed to GitHub Pages
- Production URL: https://jlandx.github.io/city_comp/
- Deployment is automated via GitHub Actions
- The `main` branch is automatically deployed

## Settings
- Toggle dark/light mode via the settings icon
- Switch between kilometers/miles and Celsius/Fahrenheit
- Lock cities for random comparison

## Sharing
- Generate shareable links for city comparisons
- Share directly to social media
- Track popular comparisons

## Version History
- v2.0.0 - Added sharing, tabs, top comparisons, and personal history
- v1.0.0 - Initial release with basic comparison functionality

## Release Process
1. Update version number in:
   - `index.html` (version display)
   - `package.json` (version field)
2. Commit changes to `main` branch
3. GitHub Actions will automatically deploy to GitHub Pages
4. Verify deployment at https://jlandx.github.io/city_comp/ 