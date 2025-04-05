document.addEventListener('DOMContentLoaded', () => {
    const city1Input = document.getElementById('city1');
    const city2Input = document.getElementById('city2');
    const compareBtn = document.getElementById('compare-btn');
    const city1Data = document.getElementById('city1-data');
    const city2Data = document.getElementById('city2-data');

    // Settings related elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings');
    const themeToggle = document.getElementById('theme-toggle');
    const unitToggle = document.getElementById('unit-toggle');

    // Initialize settings from localStorage
    let isDarkMode = localStorage.getItem('darkMode') === 'true';
    let useImperial = localStorage.getItem('useImperial') === 'true';

    // Apply initial settings
    if (isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggle.checked = true;
    }
    if (useImperial) {
        unitToggle.checked = true;
        unitToggle.nextElementSibling.nextElementSibling.textContent = 'MI';
    }

    // Initialize the map
    const map = L.map('map-container').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let markers = [];
    let distanceLine;

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    async function getWikidataPopulation(wikidataId) {
        if (!wikidataId) return null;

        try {
            // Updated SPARQL query to get the most recent population
            const query = `
            SELECT ?population ?date WHERE {
                wd:${wikidataId} p:P1082 ?statement.
                ?statement ps:P1082 ?population.
                OPTIONAL { ?statement pq:P585 ?date. }
            }
            ORDER BY DESC(?date)
            LIMIT 1
            `;

            const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
            console.log('Wikidata URL:', url);
            
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'CityComparisonApp/1.0 (educational project)'
                }
            });

            const data = await response.json();
            console.log('Wikidata response:', data);
            
            const results = data.results.bindings;
            if (results.length > 0 && results[0].population) {
                return parseInt(results[0].population.value);
            }
        } catch (error) {
            console.error('Error fetching Wikidata population:', error);
        }
        return null;
    }

    async function fetchCityData(cityName) {
        try {
            const headers = {
                'User-Agent': 'CityComparisonApp/1.0 (educational project)',
                'Accept': 'application/json'
            };

            // Enhanced search query with more parameters
            const searchUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(cityName)}&limit=1&addressdetails=1&extratags=1&namedetails=1&accept-language=en&featuretype=city`;
            console.log('Fetching:', searchUrl);
            
            const response = await fetch(searchUrl, { headers });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Response:', data);
            
            if (data.length === 0) {
                throw new Error(`City "${cityName}" not found. Please try a different search term.`);
            }

            const cityInfo = data[0];
            console.log('City info:', cityInfo);

            // Get address details
            const detailsUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${cityInfo.lat}&lon=${cityInfo.lon}&zoom=10&addressdetails=1&extratags=1`;
            console.log('Fetching details:', detailsUrl);
            
            const detailsResponse = await fetch(detailsUrl, { headers });
            const detailsData = await detailsResponse.json();
            console.log('Details:', detailsData);

            // Extract the data we need
            const name = cityInfo.display_name.split(',')[0];
            const state = cityInfo.display_name.split(',')[1]?.trim() || '';
            const country = detailsData.address?.country || 'Not available';
            
            // Try to get population from multiple sources
            let population = 'Not available';
            let wikidataId = cityInfo.extratags?.wikidata || detailsData.extratags?.wikidata;
            
            if (wikidataId) {
                console.log('Found Wikidata ID:', wikidataId);
                const wikidataPopulation = await getWikidataPopulation(wikidataId);
                if (wikidataPopulation) {
                    population = wikidataPopulation.toLocaleString();
                }
            }

            // Calculate area from bounding box
            let area = 'Not available';
            if (cityInfo.boundingbox) {
                const [south, north, west, east] = cityInfo.boundingbox.map(Number);
                const width = Math.abs(east - west);
                const height = Math.abs(north - south);
                const approxArea = width * height * 111 * 111 * Math.cos(cityInfo.lat * Math.PI / 180);
                area = `${Math.round(approxArea).toLocaleString()} km²`;
            }

            return {
                name: `${name}, ${state}`,
                country: country,
                population: population,
                area: area,
                coordinates: {
                    lat: parseFloat(cityInfo.lat),
                    lon: parseFloat(cityInfo.lon)
                }
            };
        } catch (error) {
            console.error('Error fetching city data:', error);
            throw new Error(`Error: ${error.message}`);
        }
    }

    function updateMap(city1Info, city2Info) {
        // Clear existing markers and lines
        markers.forEach(marker => marker.remove());
        markers = [];
        if (distanceLine) distanceLine.remove();

        // Add markers for both cities
        const marker1 = L.marker([city1Info.coordinates.lat, city1Info.coordinates.lon])
            .bindPopup(city1Info.name)
            .addTo(map);
        const marker2 = L.marker([city2Info.coordinates.lat, city2Info.coordinates.lon])
            .bindPopup(city2Info.name)
            .addTo(map);
        markers.push(marker1, marker2);

        // Draw a line between the cities
        distanceLine = L.polyline([
            [city1Info.coordinates.lat, city1Info.coordinates.lon],
            [city2Info.coordinates.lat, city2Info.coordinates.lon]
        ], {
            color: '#3498db',
            weight: 2,
            opacity: 0.8,
            dashArray: '5, 10'
        }).addTo(map);

        // Calculate and display the distance
        const calculatedDistance = calculateDistance(
            city1Info.coordinates.lat,
            city1Info.coordinates.lon,
            city2Info.coordinates.lat,
            city2Info.coordinates.lon
        );

        // Add distance information
        const distanceInfo = document.createElement('div');
        distanceInfo.className = 'distance-info';
        const displayDistance = useImperial ? kmToMiles(Math.round(calculatedDistance)) : Math.round(calculatedDistance);
        const unit = useImperial ? 'miles' : 'kilometers';
        distanceInfo.innerHTML = `<strong>Distance between cities:</strong> ${Math.round(displayDistance).toLocaleString()} ${unit}`;
        document.querySelector('.comparison-results').insertAdjacentElement('beforebegin', distanceInfo);

        // Fit the map to show both cities
        const bounds = L.latLngBounds(
            [city1Info.coordinates.lat, city1Info.coordinates.lon],
            [city2Info.coordinates.lat, city2Info.coordinates.lon]
        );
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    function updateVisualComparison(city1Data, city2Data) {
        const circle1 = document.getElementById('city1-circle');
        const circle2 = document.getElementById('city2-circle');
        
        // Get population numbers
        const pop1 = parseInt(city1Data.population.replace(/,/g, '')) || 0;
        const pop2 = parseInt(city2Data.population.replace(/,/g, '')) || 0;
        
        // Calculate circle sizes (use square root for more reasonable visual comparison)
        const maxSize = 150; // maximum circle diameter in pixels
        const maxPop = Math.max(pop1, pop2);
        const size1 = Math.sqrt(pop1 / maxPop) * maxSize;
        const size2 = Math.sqrt(pop2 / maxPop) * maxSize;
        
        // Update circles
        circle1.style.width = `${size1}px`;
        circle1.style.height = `${size1}px`;
        circle1.setAttribute('data-info', `${city1Data.name}: ${city1Data.population}`);
        
        circle2.style.width = `${size2}px`;
        circle2.style.height = `${size2}px`;
        circle2.setAttribute('data-info', `${city2Data.name}: ${city2Data.population}`);
    }

    function updatePopulationComparison(city1Data, city2Data) {
        const comparisonDiv = document.getElementById('population-comparison');
        const pop1 = parseInt(city1Data.population.replace(/,/g, '')) || 0;
        const pop2 = parseInt(city2Data.population.replace(/,/g, '')) || 0;
        
        if (pop1 === 0 || pop2 === 0) {
            comparisonDiv.innerHTML = '<p>Population data not available for comparison</p>';
            return;
        }

        const difference = Math.abs(pop1 - pop2);
        const percentDiff = ((Math.max(pop1, pop2) / Math.min(pop1, pop2) - 1) * 100).toFixed(1);
        const largerCity = pop1 > pop2 ? city1Data.name : city2Data.name;

        comparisonDiv.innerHTML = `
            <p>${largerCity} is ${percentDiff}% larger</p>
            <p>Population difference: ${difference.toLocaleString()} people</p>
            <div class="stat-bar">
                <div class="stat-bar-fill" style="width: ${(Math.min(pop1, pop2) / Math.max(pop1, pop2) * 100)}%"></div>
            </div>
        `;
    }

    async function getTimezoneData(lat, lon) {
        const API_KEY = 'AORHIIKFW6WA';
        const url = `https://api.timezonedb.com/v2.1/get-time-zone?key=${API_KEY}&format=json&by=position&lat=${lat}&lng=${lon}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch timezone data');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching timezone data:', error);
            return null;
        }
    }

    async function updateTimeZoneComparison(city1Data, city2Data) {
        const timezoneDiv = document.getElementById('timezone-comparison');
        
        try {
            // Get timezone data for both cities
            const timezone1 = await getTimezoneData(city1Data.coordinates.lat, city1Data.coordinates.lon);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Add delay to avoid rate limiting
            const timezone2 = await getTimezoneData(city2Data.coordinates.lat, city2Data.coordinates.lon);

            if (!timezone1 || !timezone2) {
                throw new Error('Unable to fetch timezone data');
            }

            // Calculate time difference in hours
            const timeDiff = (timezone1.gmtOffset - timezone2.gmtOffset) / 3600;
            const absDiff = Math.abs(timeDiff);
            
            // Format the current time in each timezone
            const time1 = new Date(timezone1.formatted).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const time2 = new Date(timezone2.formatted).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            // Create the time difference text
            let diffText = '';
            if (timeDiff === 0) {
                diffText = 'Both cities are in the same timezone';
            } else {
                const ahead = timeDiff > 0 ? city1Data.name : city2Data.name;
                diffText = `${ahead} is ${absDiff} hour${absDiff !== 1 ? 's' : ''} ahead`;
            }

            timezoneDiv.innerHTML = `
                <div class="timezone-info">
                    <div>
                        <p>${city1Data.name}</p>
                        <p class="current-time">${time1}</p>
                        <p>${timezone1.zoneName}</p>
                    </div>
                    <div>
                        <p>${city2Data.name}</p>
                        <p class="current-time">${time2}</p>
                        <p>${timezone2.zoneName}</p>
                    </div>
                </div>
                <p class="time-difference">${diffText}</p>
            `;
        } catch (error) {
            console.error('Error updating timezone comparison:', error);
            timezoneDiv.innerHTML = '<p>Time zone comparison not available</p>';
        }
    }

    function updateStatisticsComparison(city1Data, city2Data) {
        const statisticsDiv = document.getElementById('statistics-comparison');
        const area1 = parseFloat(city1Data.area.replace(/[^0-9.]/g, '')) || 0;
        const area2 = parseFloat(city2Data.area.replace(/[^0-9.]/g, '')) || 0;
        
        if (area1 === 0 || area2 === 0) {
            statisticsDiv.innerHTML = '<p>Area data not available for detailed comparison</p>';
            return;
        }

        const densityText = calculateDensityComparison(city1Data, city2Data);
        
        statisticsDiv.innerHTML = `
            <p><strong>Area Comparison:</strong></p>
            <div class="stat-bar">
                <div class="stat-bar-fill" style="width: ${(Math.min(area1, area2) / Math.max(area1, area2) * 100)}%"></div>
            </div>
            <p>${densityText}</p>
        `;
    }

    function calculateDensityComparison(city1Data, city2Data) {
        const pop1 = parseInt(city1Data.population.replace(/,/g, '')) || 0;
        const pop2 = parseInt(city2Data.population.replace(/,/g, '')) || 0;
        const area1 = parseFloat(city1Data.area.replace(/[^0-9.]/g, '')) || 0;
        const area2 = parseFloat(city2Data.area.replace(/[^0-9.]/g, '')) || 0;
        
        if (pop1 === 0 || pop2 === 0 || area1 === 0 || area2 === 0) {
            return 'Population density comparison not available';
        }

        const density1 = pop1 / area1;
        const density2 = pop2 / area2;
        const denser = density1 > density2 ? city1Data.name : city2Data.name;
        const percentDenser = ((Math.max(density1, density2) / Math.min(density1, density2) - 1) * 100).toFixed(1);

        return `${denser} is ${percentDenser}% more densely populated`;
    }

    function displayCityData(cityData, element) {
        element.innerHTML = `
            <h3>${cityData.name}</h3>
            <div class="city-details">
                <p><strong>Country:</strong> ${cityData.country}</p>
                <p><strong>Population:</strong> ${cityData.population}</p>
                <p><strong>Area:</strong> ${cityData.area}</p>
                <p><strong>Coordinates:</strong> ${cityData.coordinates.lat.toFixed(4)}, ${cityData.coordinates.lon.toFixed(4)}</p>
            </div>
        `;
    }

    compareBtn.addEventListener('click', async () => {
        const city1 = city1Input.value.trim();
        const city2 = city2Input.value.trim();

        if (!city1 || !city2) {
            alert('Please enter both city names');
            return;
        }

        // Remove existing distance info
        const existingDistanceInfo = document.querySelector('.distance-info');
        if (existingDistanceInfo) {
            existingDistanceInfo.remove();
        }

        // Show loading state
        city1Data.innerHTML = `<h3>${city1}</h3><p>Loading city data...</p>`;
        city2Data.innerHTML = `<h3>${city2}</h3><p>Loading city data...</p>`;

        try {
            // Add a small delay between requests to avoid rate limiting
            const city1Info = await fetchCityData(city1);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            const city2Info = await fetchCityData(city2);

            // Display the results
            displayCityData(city1Info, document.getElementById('city1-data'));
            displayCityData(city2Info, document.getElementById('city2-data'));

            // Update the map
            updateMap(city1Info, city2Info);

            // Update all comparisons
            updateVisualComparison(city1Info, city2Info);
            updatePopulationComparison(city1Info, city2Info);
            updateTimeZoneComparison(city1Info, city2Info);
            updateStatisticsComparison(city1Info, city2Info);

        } catch (error) {
            console.error('Error:', error);
            const errorMessage = error.message || 'Error loading city data. Please try again.';
            city1Data.innerHTML = `<p class="error">${errorMessage}</p>`;
            city2Data.innerHTML = `<p class="error">${errorMessage}</p>`;
        }
    });

    // Settings event listeners
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('show');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('show');
    });

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('show');
        }
    });

    themeToggle.addEventListener('change', () => {
        isDarkMode = themeToggle.checked;
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        localStorage.setItem('darkMode', isDarkMode);
    });

    unitToggle.addEventListener('change', () => {
        useImperial = unitToggle.checked;
        unitToggle.nextElementSibling.nextElementSibling.textContent = useImperial ? 'MI' : 'KM';
        localStorage.setItem('useImperial', useImperial);
        // Update any displayed distances if they exist
        updateDisplayedDistances();
    });

    function updateDisplayedDistances() {
        const distanceInfo = document.querySelector('.distance-info');
        if (distanceInfo) {
            const currentKmDistance = parseFloat(distanceInfo.textContent.match(/\d+/)[0]);
            const convertedDistance = useImperial ? kmToMiles(currentKmDistance) : currentKmDistance;
            const unit = useImperial ? 'miles' : 'kilometers';
            distanceInfo.innerHTML = `<strong>Distance between cities:</strong> ${Math.round(convertedDistance).toLocaleString()} ${unit}`;
        }
    }

    function kmToMiles(km) {
        return km * 0.621371;
    }

    function milesToKm(miles) {
        return miles / 0.621371;
    }
}); 