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
        unitToggle.nextElementSibling.nextElementSibling.textContent = 'MI/°F';
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

        // Fit the map to show both cities
        const bounds = L.latLngBounds(
            [city1Info.coordinates.lat, city1Info.coordinates.lon],
            [city2Info.coordinates.lat, city2Info.coordinates.lon]
        );
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    function updateVisualComparison(city1Data, city2Data) {
        // Get or create the visual comparison container
        let visualContainer = document.querySelector('.visual-comparison');
        if (!visualContainer) {
            visualContainer = document.createElement('div');
            visualContainer.className = 'visual-comparison';
            document.getElementById('population-comparison').appendChild(visualContainer);
        }

        // Get or create circle elements
        let circle1 = document.getElementById('city1-circle');
        let circle2 = document.getElementById('city2-circle');

        if (!circle1) {
            circle1 = document.createElement('div');
            circle1.id = 'city1-circle';
            circle1.className = 'city-circle';
            visualContainer.appendChild(circle1);
        }

        if (!circle2) {
            circle2 = document.createElement('div');
            circle2.id = 'city2-circle';
            circle2.className = 'city-circle';
            visualContainer.appendChild(circle2);
        }
        
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

        const maxPop = Math.max(pop1, pop2);
        const percentDiff = ((Math.max(pop1, pop2) / Math.min(pop1, pop2) - 1) * 100).toFixed(1);
        const largerCity = pop1 > pop2 ? city1Data.name : city2Data.name;

        comparisonDiv.innerHTML = `
            <p>${largerCity} is ${percentDiff}% larger</p>
            <div class="stat-bars">
                <div class="stat-bar-container">
                    <div class="stat-bar">
                        <div class="stat-bar-fill" style="width: ${(pop1 / maxPop * 100)}%"></div>
                    </div>
                    <div class="stat-label">
                        ${city1Data.name}
                        <div class="stat-value">${pop1.toLocaleString()} people</div>
                    </div>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar">
                        <div class="stat-bar-fill" style="width: ${(pop2 / maxPop * 100)}%"></div>
                    </div>
                    <div class="stat-label">
                        ${city2Data.name}
                        <div class="stat-value">${pop2.toLocaleString()} people</div>
                    </div>
                </div>
            </div>
        `;
    }

    function updateStatisticsComparison(city1Data, city2Data) {
        const statisticsDiv = document.getElementById('statistics-comparison');
        const area1 = parseFloat(city1Data.area.replace(/[^0-9.]/g, '')) || 0;
        const area2 = parseFloat(city2Data.area.replace(/[^0-9.]/g, '')) || 0;
        
        if (area1 === 0 || area2 === 0) {
            statisticsDiv.innerHTML = '<p>Area data not available for detailed comparison</p>';
            return;
        }

        // Convert areas if using imperial units
        const convertedArea1 = useImperial ? sqKmToSqMiles(area1) : area1;
        const convertedArea2 = useImperial ? sqKmToSqMiles(area2) : area2;
        const unit = useImperial ? 'square miles' : 'square kilometers';
        const maxArea = Math.max(convertedArea1, convertedArea2);

        const largerCity = convertedArea1 > convertedArea2 ? city1Data.name : city2Data.name;
        const percentDiff = ((Math.max(convertedArea1, convertedArea2) / Math.min(convertedArea1, convertedArea2) - 1) * 100).toFixed(1);
        
        statisticsDiv.innerHTML = `
            <p>${largerCity} is ${percentDiff}% larger in area</p>
            <div class="stat-bars">
                <div class="stat-bar-container">
                    <div class="stat-bar">
                        <div class="stat-bar-fill" style="width: ${(convertedArea1 / maxArea * 100)}%"></div>
                    </div>
                    <div class="stat-label">
                        ${city1Data.name}
                        <div class="stat-value">${Math.round(convertedArea1).toLocaleString()} ${unit}</div>
                    </div>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar">
                        <div class="stat-bar-fill" style="width: ${(convertedArea2 / maxArea * 100)}%"></div>
                    </div>
                    <div class="stat-label">
                        ${city2Data.name}
                        <div class="stat-value">${Math.round(convertedArea2).toLocaleString()} ${unit}</div>
                    </div>
                </div>
            </div>
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
        console.log('Displaying city data:', cityData);
        if (!cityData || !element) {
            console.error('Missing city data or element');
            return;
        }

        // Convert area if needed
        let areaDisplay = cityData.area;
        if (areaDisplay !== 'Not available') {
            const areaNum = parseFloat(cityData.area.replace(/[^0-9.]/g, ''));
            const unit = useImperial ? 'mi²' : 'km²';
            const convertedArea = useImperial ? sqKmToSqMiles(areaNum) : areaNum;
            areaDisplay = `${Math.round(convertedArea).toLocaleString()} ${unit}`;
        }

        element.innerHTML = `
            <h3>${cityData.name || 'City Name Not Available'}</h3>
            <div class="city-details">
                <p><strong>Country:</strong> ${cityData.country || 'Not available'}</p>
                <p><strong>Population:</strong> ${cityData.population || 'Not available'}</p>
                <p><strong>Area:</strong> ${areaDisplay}</p>
                <p><strong>Coordinates:</strong> ${cityData.coordinates ? `${cityData.coordinates.lat.toFixed(4)}, ${cityData.coordinates.lon.toFixed(4)}` : 'Not available'}</p>
            </div>
        `;
    }

    async function getHistoricalGrowth(cityName, country) {
        try {
            // Convert country name to ISO 3166-1 alpha-2 code
            const countryCode = getCountryCode(country);
            if (!countryCode) {
                console.error('Could not determine country code for:', country);
                return null;
            }

            // World Bank API endpoint for urban population data
            const currentYear = new Date().getFullYear();
            const startYear = currentYear - 20; // Get 20 years of data
            const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/SP.URB.GROW?date=${startYear}:${currentYear}&format=json`;
            
            console.log('Fetching historical growth data from:', url);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch historical data');
            }
            const data = await response.json();
            console.log('Historical growth data:', data);
            return data[1] || [];
        } catch (error) {
            console.error('Error fetching historical growth:', error);
            return null;
        }
    }

    // Function to convert country names to ISO codes
    function getCountryCode(countryName) {
        const countryCodes = {
            'United States': 'US',
            'United Kingdom': 'GB',
            'France': 'FR',
            'Germany': 'DE',
            'Italy': 'IT',
            'Spain': 'ES',
            'Canada': 'CA',
            'Australia': 'AU',
            'Japan': 'JP',
            'China': 'CN',
            'India': 'IN',
            'Brazil': 'BR',
            'Russia': 'RU',
            'South Africa': 'ZA',
            'Mexico': 'MX',
            'South Korea': 'KR',
            'Indonesia': 'ID',
            'Turkey': 'TR',
            'Saudi Arabia': 'SA',
            'Argentina': 'AR',
            // Add more country mappings as needed
        };
        
        // Clean up country name for matching
        const cleanCountryName = countryName.trim();
        return countryCodes[cleanCountryName] || null;
    }

    function updateHistoricalGrowthComparison(city1Data, city2Data) {
        const growthDiv = document.createElement('div');
        growthDiv.className = 'comparison-card growth-comparison';
        
        // Create the growth chart using a simple bar graph
        const createGrowthChart = (data, cityName) => {
            if (!data || !data.length) {
                return `<p>Historical growth data not available for ${cityName}</p>`;
            }

            // Sort data by year in ascending order
            const sortedData = [...data].sort((a, b) => a.date - b.date);
            const years = sortedData.map(d => d.date);
            const values = sortedData.map(d => d.value);
            const maxValue = Math.max(...values);
            const minValue = Math.min(...values);

            return `
                <div class="growth-chart">
                    <h4>${cityName}</h4>
                    <div class="chart-container">
                        ${values.map((value, index) => `
                            <div class="chart-bar">
                                <div class="bar-fill" style="height: ${((value - minValue) / (maxValue - minValue) * 100)}%"></div>
                                <span class="year-label">${years[index]}</span>
                                <span class="value-label">${value.toFixed(1)}%</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="chart-legend">
                        <p>Min: ${minValue.toFixed(1)}% | Max: ${maxValue.toFixed(1)}%</p>
                        <p>Average: ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)}%</p>
                    </div>
                </div>
            `;
        };

        growthDiv.innerHTML = `
            <h3>Urban Population Growth Rate (20 Years)</h3>
            <div class="growth-grid">
                ${createGrowthChart(city1Data.historicalGrowth, city1Data.name)}
                ${createGrowthChart(city2Data.historicalGrowth, city2Data.name)}
            </div>
        `;

        document.querySelector('.comparison-results').appendChild(growthDiv);
    }

    async function updateTimeZoneComparison(city1Info, city2Info) {
        const timezoneDiv = document.getElementById('timezone-comparison');
        
        try {
            // Get timezone data for both cities using TimeZoneDB API
            const [timezone1, timezone2] = await Promise.all([
                fetch(`https://api.timezonedb.com/v2.1/get-time-zone?key=AORHIIKFW6WA&format=json&by=position&lat=${city1Info.coordinates.lat}&lng=${city1Info.coordinates.lon}`),
                fetch(`https://api.timezonedb.com/v2.1/get-time-zone?key=AORHIIKFW6WA&format=json&by=position&lat=${city2Info.coordinates.lat}&lng=${city2Info.coordinates.lon}`)
            ]);

            const data1 = await timezone1.json();
            const data2 = await timezone2.json();

            if (data1.status === 'OK' && data2.status === 'OK') {
                // Format times
                const time1 = new Date(data1.timestamp * 1000).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                const time2 = new Date(data2.timestamp * 1000).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });

                // Calculate time difference in hours
                const timeDiff = (data2.gmtOffset - data1.gmtOffset) / 3600;

                timezoneDiv.innerHTML = `
                    <div class="timezone-info">
                        <div>
                            <h4>${city1Info.name}</h4>
                            <p class="current-time">${time1}</p>
                            <p>${data1.zoneName}</p>
                        </div>
                        <div>
                            <h4>${city2Info.name}</h4>
                            <p class="current-time">${time2}</p>
                            <p>${data2.zoneName}</p>
                        </div>
                    </div>
                    <p class="time-difference">Time difference: ${Math.abs(timeDiff).toFixed(1)} hours</p>
                `;
            } else {
                throw new Error('Failed to fetch timezone data');
            }
        } catch (error) {
            console.error('Error updating timezone comparison:', error);
            timezoneDiv.innerHTML = '<p>Unable to load timezone information</p>';
        }
    }

    async function compareCities(city1Info, city2Info) {
        console.log('Starting city comparison with:', { city1Info, city2Info });
        
        // Store city data for unit toggle updates
        window.lastCity1Data = city1Info;
        window.lastCity2Data = city2Info;

        // Clear previous results
        const comparisonResults = document.querySelector('.comparison-results');
        comparisonResults.innerHTML = `
            <!-- Population and Statistics -->
            <div class="comparison-card">
                <h3>Population Comparison</h3>
                <div id="population-comparison" class="comparison-content"></div>
            </div>

            <div class="comparison-card">
                <h3>City Statistics</h3>
                <div id="statistics-comparison" class="comparison-content"></div>
            </div>

            <!-- Time Zone -->
            <div class="comparison-card large-card">
                <h3>Time Zone</h3>
                <div id="timezone-comparison" class="comparison-content"></div>
            </div>
        `;
        
        const distanceContainer = document.getElementById('distance-info-container');
        distanceContainer.innerHTML = '';

        // Display the basic city data first
        displayCityData(city1Info, document.getElementById('city1-data'));
        displayCityData(city2Info, document.getElementById('city2-data'));
        
        // Update the map first
        updateMap(city1Info, city2Info);

        // Add distance information
        const distanceInfo = document.createElement('div');
        distanceInfo.className = 'distance-info';
        const calculatedDistance = calculateDistance(
            city1Info.coordinates.lat,
            city1Info.coordinates.lon,
            city2Info.coordinates.lat,
            city2Info.coordinates.lon
        );
        const displayDistance = useImperial ? kmToMiles(Math.round(calculatedDistance)) : Math.round(calculatedDistance);
        const unit = useImperial ? 'miles' : 'kilometers';
        distanceInfo.innerHTML = `<strong>Distance between cities:</strong> ${Math.round(displayDistance).toLocaleString()} ${unit}`;
        distanceContainer.appendChild(distanceInfo);

        // Fetch additional data
        console.log('Fetching additional data...');
        const [city1Weather, city2Weather] = await Promise.all([
            getWeatherData(city1Info.coordinates.lat, city1Info.coordinates.lon),
            getWeatherData(city2Info.coordinates.lat, city2Info.coordinates.lon)
        ]);

        // Add the weather data to our city objects
        city1Info.weather = city1Weather;
        city2Info.weather = city2Weather;

        // Update comparisons in the specified order
        updatePopulationComparison(city1Info, city2Info);
        updateStatisticsComparison(city1Info, city2Info);
        updateWeatherComparison(city1Info, city2Info);
        await updateTimeZoneComparison(city1Info, city2Info);
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

            // Update all comparisons
            await compareCities(city1Info, city2Info);

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
        unitToggle.nextElementSibling.nextElementSibling.textContent = useImperial ? 'MI/°F' : 'KM/°C';
        localStorage.setItem('useImperial', useImperial);

        // Update any displayed distances and temperatures if they exist
        updateDisplayedDistances();
        
        // Update city data displays if they exist
        const city1Data = window.lastCity1Data;
        const city2Data = window.lastCity2Data;
        if (city1Data && city2Data) {
            displayCityData(city1Data, document.getElementById('city1-data'));
            displayCityData(city2Data, document.getElementById('city2-data'));
            updateStatisticsComparison(city1Data, city2Data);
            
            // Update weather comparison if it exists
            const weatherComparison = document.querySelector('.weather-comparison');
            if (weatherComparison) {
                updateWeatherComparison(city1Data, city2Data);
            }
        }
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

    function sqKmToSqMiles(sqKm) {
        return sqKm * 0.386102;
    }

    function milesToKm(miles) {
        return miles / 0.621371;
    }

    async function getWeatherData(lat, lon) {
        const API_KEY = 'b5af4a15230630dddb25cc49ec8a6355';
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
        
        try {
            console.log('Fetching weather data from:', url);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch weather data: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            console.log('Weather data received:', data);
            return data;
        } catch (error) {
            console.error('Error fetching weather data:', error);
            return null;
        }
    }

    function celsiusToFahrenheit(celsius) {
        return (celsius * 9/5) + 32;
    }

    function updateWeatherComparison(city1Data, city2Data) {
        console.log('Updating weather comparison with data:', { city1Data, city2Data });
        const weatherDiv = document.createElement('div');
        weatherDiv.className = 'comparison-card large-card';
        
        // Get temperature values and handle potential undefined values
        const temp1 = city1Data.weather?.main?.temp ? Math.round(city1Data.weather.main.temp) : null;
        const temp2 = city2Data.weather?.main?.temp ? Math.round(city2Data.weather.main.temp) : null;
        
        console.log('Temperature values:', { temp1, temp2, useImperial });
        
        // Convert to Fahrenheit if using imperial units
        const displayTemp1 = useImperial && temp1 !== null ? Math.round(celsiusToFahrenheit(temp1)) : temp1;
        const displayTemp2 = useImperial && temp2 !== null ? Math.round(celsiusToFahrenheit(temp2)) : temp2;
        
        // Determine temperature unit
        const tempUnit = useImperial ? '°F' : '°C';
        
        weatherDiv.innerHTML = `
            <h3>Current Temperature</h3>
            <div class="weather-grid">
                <div class="city-weather">
                    <h4>${city1Data.name}</h4>
                    ${temp1 !== null ? `
                        <div class="weather-data">
                            <div class="weather-details">
                                <p class="temperature">${displayTemp1}${tempUnit}</p>
                            </div>
                        </div>
                    ` : '<p>Temperature data not available</p>'}
                </div>
                <div class="city-weather">
                    <h4>${city2Data.name}</h4>
                    ${temp2 !== null ? `
                        <div class="weather-data">
                            <div class="weather-details">
                                <p class="temperature">${displayTemp2}${tempUnit}</p>
                            </div>
                        </div>
                    ` : '<p>Temperature data not available</p>'}
                </div>
            </div>
        `;

        // Insert the weather comparison after the statistics card
        const statisticsCard = document.querySelector('.comparison-card:nth-child(2)');
        if (statisticsCard) {
            statisticsCard.insertAdjacentElement('afterend', weatherDiv);
        } else {
            document.querySelector('.comparison-results').appendChild(weatherDiv);
        }
    }

    // List of major cities for random selection
    const majorCities = [
        // United States
        'New York City', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 
        'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'San Francisco', 'Columbus', 'Indianapolis', 'Seattle', 
        'Denver', 'Washington, D.C.', 'Boston', 'Nashville', 'Detroit', 'Portland', 'Las Vegas', 'Memphis', 
        'Baltimore', 'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Sacramento', 'Kansas City', 'Atlanta', 
        'Miami', 'Orlando', 'Tampa', 'New Orleans', 'St. Louis', 'Pittsburgh', 'Cincinnati', 'Charlotte', 
        'Raleigh', 'Minneapolis', 'Oklahoma City', 'Tulsa', 'Cleveland', 'Wichita', 'Arlington', 'Bakersfield', 
        'Aurora', 'Honolulu', 'Anchorage', 'Boise', 'Salt Lake City', 'Omaha', 'Des Moines', 'Madison', 
        'Buffalo', 'Rochester', 'Richmond', 'Baton Rouge',
        
        // Mexico
        'Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Juárez', 'Mérida', 
        'Querétaro', 'Cancún', 'Acapulco', 'Veracruz', 'San Pedro Sula', 'Chihuahua', 'Saltillo', 
        'Aguascalientes', 'Hermosillo', 'Morelia', 'Culiacán', 'Toluca',
        
        // Canada
        'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 
        'Hamilton', 'Halifax', 'Victoria', 'Saskatoon',
        
        // Caribbean
        'San Juan', 'Havana', 'Santo Domingo', 'Port-au-Prince', 'Kingston', 'Guatemala City', 'San Salvador', 
        'Tegucigalpa', 'Managua', 'San José', 'Panama City', 'Nassau', 'Bridgetown', 'Port of Spain', 
        'Belmopan', 'St. John\'s', 'Basseterre', 'Roseau', 'Castries', 'Kingstown', 'St. George\'s', 
        'Nuuk', 'Charlotte Amalie', 'George Town', 'Oranjestad', 'Willemstad', 'Road Town', 'Hamilton',
        
        // South America
        'São Paulo', 'Rio de Janeiro', 'Buenos Aires', 'Bogotá', 'Lima', 'Santiago', 'Caracas', 'Medellín', 
        'Quito', 'Guayaquil', 'Brasília', 'Salvador', 'Montevideo', 'Asunción', 'La Paz', 'Santa Cruz de la Sierra', 
        'Córdoba', 'Belo Horizonte', 'Cali', 'Recife',
        
        // Europe
        'London', 'Paris', 'Berlin', 'Madrid', 'Rome', 'Moscow', 'Kyiv', 'Istanbul', 'Athens', 'Vienna', 
        'Warsaw', 'Budapest', 'Prague', 'Amsterdam', 'Stockholm', 'Oslo', 'Copenhagen', 'Helsinki', 
        'Lisbon', 'Brussels', 'Munich', 'Barcelona', 'Milan', 'Dublin', 'Zurich', 'Cairo',
        
        // Africa
        'Lagos', 'Johannesburg', 'Nairobi', 'Algiers', 'Accra', 'Cape Town', 'Casablanca', 'Kinshasa', 
        'Addis Ababa', 'Tunis', 'Luanda', 'Dakar', 'Abidjan', 'Dar es Salaam',
        
        // Asia
        'Tokyo', 'Beijing', 'Shanghai', 'Delhi', 'Mumbai', 'Seoul', 'Bangkok', 'Jakarta', 'Manila', 
        'Singapore', 'Hong Kong', 'Dubai', 'Riyadh', 'Tehran', 'Ho Chi Minh City',
        
        // Oceania
        'Sydney', 'Melbourne', 'Auckland', 'Brisbane', 'Perth'
    ];

    // Function to get a random city from the list
    function getRandomCity() {
        const randomIndex = Math.floor(Math.random() * majorCities.length);
        return majorCities[randomIndex];
    }

    // Function to get two different random cities
    function getTwoRandomCities() {
        let city1 = getRandomCity();
        let city2 = getRandomCity();
        
        // Make sure we don't get the same city twice
        while (city2 === city1) {
            city2 = getRandomCity();
        }
        
        return [city1, city2];
    }

    // Lock functionality
    let lockedCity1 = false;
    let lockedCity2 = false;
    
    // Add event listeners for lock buttons
    document.getElementById('lock-city1').addEventListener('click', function() {
        lockedCity1 = !lockedCity1;
        this.classList.toggle('locked');
        if (lockedCity1) {
            this.setAttribute('aria-label', 'Unlock first city');
        } else {
            this.setAttribute('aria-label', 'Lock first city');
        }
    });
    
    document.getElementById('lock-city2').addEventListener('click', function() {
        lockedCity2 = !lockedCity2;
        this.classList.toggle('locked');
        if (lockedCity2) {
            this.setAttribute('aria-label', 'Unlock second city');
        } else {
            this.setAttribute('aria-label', 'Lock second city');
        }
    });
    
    // Update the randomize button event listener
    document.getElementById('randomize-btn').addEventListener('click', async () => {
        let randomCity1, randomCity2;
        
        // If city1 is locked, keep its value
        if (lockedCity1) {
            randomCity1 = document.getElementById('city1').value;
        } else {
            randomCity1 = getRandomCity();
        }
        
        // If city2 is locked, keep its value
        if (lockedCity2) {
            randomCity2 = document.getElementById('city2').value;
        } else {
            randomCity2 = getRandomCity();
        }
        
        // Make sure we don't get the same city twice if neither is locked
        if (!lockedCity1 && !lockedCity2) {
            while (randomCity2 === randomCity1) {
                randomCity2 = getRandomCity();
            }
        }
        
        // Set the input values
        document.getElementById('city1').value = randomCity1;
        document.getElementById('city2').value = randomCity2;
        
        // Trigger the compare button click
        document.getElementById('compare-btn').click();
    });
}); 