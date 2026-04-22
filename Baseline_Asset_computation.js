// New global variables for district processing
var districtAveragesFC = null;
var allDistrictNames = [];
var processedDistrictCount = 0;
var totalDistrictsToProcess = 0;
var districtFeaturesArray = [];

var pakistanDistricts = ee.FeatureCollection('projects/ee-mustafaasghar66/assets/gadm36_PAK_3');

var era5 = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
  .select(["total_precipitation_sum", "temperature_2m"])
  .filterDate("1984-01-01", "2025-12-31");
  
var rainfallRawData = {}; // eg: rainfallRawData[districtName][year][monthName] = rainfallValue

var TemperatureRawData = {}; // eg: TemperatureRawData[districtName][year][monthName] = TemperatureValue

var rainfallStats = {}; // eg: rainfallStats[districtName] = {monthlyAverages: {}, totalDataPoints: 0, yearsProcessed: []}

var TemperatureStats = {}; // eg: TemperatureStats[districtName] = {monthlyAverages: {}, totalDataPoints: 0, yearsProcessed: []}
var selectedStartYear=2019;
var selectedEndYear=2024;

var isLoadingData = false;

// NEW: Function to load all data for a district (without creating charts)
function loadAllDistrictData(districtName, districtGeometry, callback) {
  print('Loading all rainfall and temperature data for ' + districtName + '...');
  isLoadingData = true;
  
  // Show loading indicator
  // showLoadingIndicator('Loading rainfall data for ' + districtName + '...\nThis may take a few moments.');
  
  // Disable UI elements during loading
  // yearDropdown.setDisabled(true);
  // startYearDropdown.setDisabled(true)
  // districtDropdown.setDisabled(true);
  
  // Initialize data structure for this district
  initializeDistrictData(districtName);
  
  // var years = [1981,1982,1983,1984,1985,1986,1987,1988,1989,1990,1991,1992,1993,1994,1995,1996,1997,1998,1999,2000,2001,2002,2003,2004,2005,2006,2007,2008,2009,2010,2011,2012,2013,2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  var years=[]
  for (var year=parseInt(selectedStartYear);year<=parseInt(selectedEndYear);year++){
    years.push(year)
  }
  var completedYears = 0;
  
  years.forEach(function(year) {
    loadYearData(year, districtName, districtGeometry, function() {
      completedYears++;
      print('Loaded data for year ' + year + ' (' + completedYears + '/' + years.length + ')');
      
      // Update loading indicator with progress
      var progressMessage = 'Loading Rainfall and Temperature data for ' + districtName + '...\n' +
                           'Progress: ' + completedYears + '/' + years.length + ' years completed\n' +
                           'Currently processing: ' + year;
      // updateLoadingIndicator(progressMessage);
      
      if (completedYears === years.length) {
        print('All data loaded for ' + districtName + '!');
        // updateLoadingIndicator('Calculating statistics...');
        
        calculateRainfallStats(districtName,parseInt(selectedStartYear),parseInt(selectedEndYear));
        calculateTemperatureStats(districtName,parseInt(selectedStartYear),parseInt(selectedEndYear))
        isLoadingData = false;
        
        // Hide loading indicator
        // hideLoadingIndicator();
        
        // Re-enable UI elements
        // yearDropdown.setDisabled(false);
        // districtDropdown.setDisabled(false);
        
        // Show success message
        // var successPanel = ui.Panel({
        //   style: {
        //     backgroundColor: '#d5edda',
        //     border: '2px solid #28a745',
        //     margin: '10px 0',
        //     padding: '10px'
        //   }
        // });
        
        var successLabel = ui.Label({
          value: '✅ Data loaded successfully for ' + districtName + '!\nYou can now select a year or generate average chart.',
          style: {
            fontSize: '14px',
            color: '#155724',
            fontWeight: 'bold'
          }
        });
        
        // successPanel.add(successLabel);
        
        // Add success panel and remove it after 5 seconds
        // var insertIndex = 0;
        // var children = panel.widgets();
        // for (var i = 0; i < children.length(); i++) {
        //   if (children.get(i) === endYearDropdown) {
        //     insertIndex = i + 1;
        //     break;
        //   }
        // }
        // panel.insert(insertIndex, successPanel);
        
        // Remove success message after 5 seconds
        // ui.util.setTimeout(function() {
        //   panel.remove(successPanel);
        // }, 5000);
        
        if (callback) callback();
      }
    });
  });
}


// Calculate monthly averages from raw data
// Calculate monthly averages from raw data for a specific year range
function calculateRainfallStats(districtName, startYear, endYear) {
  print('Calculating rainfall statistics for ' + districtName + ' (' + startYear + '-' + endYear + ')...');
  
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  var monthlyAverages = {};
  var totalDataPoints = 0;
  var yearsInRange = [];
  
  // Generate list of years in the specified range
  for (var year = parseInt(startYear); year <= parseInt(endYear); year++) {
    yearsInRange.push(year);
  }
  
  monthNames.forEach(function(monthName) {
    var monthValues = [];
    
    // Only use years within the specified range
    yearsInRange.forEach(function(year) {
      if (rainfallRawData[districtName][year] && 
          rainfallRawData[districtName][year][monthName] !== undefined) {
        monthValues.push(rainfallRawData[districtName][year][monthName]);
        totalDataPoints++;
      }
    });
    
    if (monthValues.length > 0) {
      var sum = monthValues.reduce(function(a, b) { return a + b; }, 0);
      monthlyAverages[monthName] = sum / monthValues.length;
    } else {
      monthlyAverages[monthName] = 0;
    }
  });
  
  // Update stats object with the new range-specific data
  rainfallStats[districtName].monthlyAverages = monthlyAverages;
  rainfallStats[districtName].totalDataPoints = totalDataPoints;
  rainfallStats[districtName].yearsProcessed = yearsInRange.filter(function(year) {
    return rainfallRawData[districtName][year] && 
           Object.keys(rainfallRawData[districtName][year]).length > 0;
  });
  rainfallStats[districtName].yearRange = {
    start: parseInt(startYear),
    end: parseInt(endYear)
  };
  rainfallStats[districtName].lastUpdated = new Date().toISOString();
  
  print('Statistics calculated for ' + districtName + ' (' + startYear + '-' + endYear + '):');
  print('Total data points: ' + totalDataPoints);
  print('Years processed: ' + rainfallStats[districtName].yearsProcessed.join(', '));
  print('Year range: ' + startYear + ' to ' + endYear);
}



// Calculate monthly averages from raw data
function calculateTemperatureStats(districtName,startYear,endYear) {
  print('Calculating Temperature statistics for ' + districtName + '...');
  
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  var monthlyAverages = {};
  var totalDataPoints = 0;
   var yearsInRange = [];
  
  // Generate list of years in the specified range
  for (var year = parseInt(startYear); year <= parseInt(endYear); year++) {
    yearsInRange.push(year);
  }
  
  
  monthNames.forEach(function(monthName) {
    var monthValues = [];
    // var yearsProcessed = TemperatureStats[districtName].yearsProcessed;
    
    yearsInRange.forEach(function(year) {
      if (TemperatureRawData[districtName][year] && 
          TemperatureRawData[districtName][year][monthName] !== undefined) {
        monthValues.push(TemperatureRawData[districtName][year][monthName]);
        totalDataPoints++;
      }
    });
    
    if (monthValues.length > 0) {
      var sum = monthValues.reduce(function(a, b) { return a + b; }, 0);
      monthlyAverages[monthName] = sum / monthValues.length;
    } else {
      monthlyAverages[monthName] = 0;
    }
  });
  
  // Update stats object
  TemperatureStats[districtName].monthlyAverages = monthlyAverages;
  TemperatureStats[districtName].totalDataPoints = totalDataPoints;
  TemperatureStats[districtName].yearsProcessed = yearsInRange.filter(function(year) {
    return TemperatureRawData[districtName][year] && 
           Object.keys(TemperatureRawData[districtName][year]).length > 0;
  });
  TemperatureStats[districtName].yearRange = {
    start: parseInt(startYear),
    end: parseInt(endYear)
  };
  TemperatureStats[districtName].lastUpdated = new Date().toISOString();
  print('Statistics calculated for ' + districtName + ' (' + startYear + '-' + endYear + '):');
  print('Total data points: ' + totalDataPoints);
  print('Years processed: ' + TemperatureStats[districtName].yearsProcessed.join(', '));
  print('Year range: ' + startYear + ' to ' + endYear);
}

// Initialize data structures for a district
function initializeDistrictData(districtName) {
  if (!rainfallRawData[districtName]) {
    rainfallRawData[districtName] = {};
    rainfallStats[districtName] = {
      monthlyAverages: {},
      totalDataPoints: 0,
      yearsProcessed: [],
      yearRange: {start: null, end: null},
      lastUpdated: new Date().toISOString()
    };
  }
  
  if (!TemperatureRawData[districtName]) {
    TemperatureRawData[districtName] = {};
    TemperatureStats[districtName] = {
      monthlyAverages: {},
      totalDataPoints: 0,
      yearsProcessed: [],
      yearRange: {start: null, end: null},
      lastUpdated: new Date().toISOString()
    };
  }
}


// NEW: Function to load data for a specific year (without creating chart)
function loadYearData(year, districtName, districtGeometry, callback) {
  // Initialize year data if not exists
  if (!rainfallRawData[districtName] || !TemperatureRawData[districtName]) {
    initializeDistrictData(districtName);
  }
  if (!rainfallRawData[districtName][year]) {
    rainfallRawData[districtName][year] = {};
  }
  if (!TemperatureRawData[districtName][year]) {
    TemperatureRawData[districtName][year] = {};
  }
  
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate = ee.Date.fromYMD(year, 12, 31);

  if (year === 2025) {
    var currentDate = ee.Date(Date.now());
    endDate = ee.Algorithms.If(
      endDate.millis().lte(currentDate.millis()),
      endDate,
      currentDate
    );
    endDate = ee.Date(endDate);
  }

  var yearData = era5.filterDate(startDate, endDate);
  
  yearData.aggregate_array('system:time_start')
    .map(function(timestamp) {
      return ee.Date(timestamp).get('month');
    }).distinct().sort().evaluate(function(monthsList) {
      var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var monthsToProcess = monthsList.length;
      var monthsProcessed = 0;
      
      if (monthsToProcess === 0) {
        print('No data available for year ' + year);
        if (callback) callback();
        return;
      }
      
      monthsList.forEach(function(monthNum) {
        var monthStart = ee.Date.fromYMD(year, monthNum, 1);
        var monthEnd = monthStart.advance(1, 'month');

        var monthImage = yearData.filterDate(monthStart, monthEnd).first();
        var clippedImage = monthImage.clip(districtGeometry);

        var meanRainfall = clippedImage.reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: districtGeometry,
          scale: 11132,
          maxPixels: 1e8,
          // bestEffort: true,
          tileScale: 4
        });
        
        var meanTemperature = clippedImage.reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: districtGeometry,
          scale: 11132,
          maxPixels: 1e8,
          // bestEffort: true,
          tileScale: 4
        });

        var rainfallValue = ee.Number(meanRainfall.get('total_precipitation_sum')).multiply(1000);
        var temperatureValue = ee.Number(meanTemperature.get('temperature_2m')).subtract(273.15);
        var monthName = monthNames[monthNum - 1];
        
        // Store rainfall data
        rainfallValue.evaluate(function(rainfall) {
          if (rainfall !== null && rainfall !== undefined) {
            rainfallRawData[districtName][year][monthName] = rainfall;
            
            // Add to years processed if not already there
            if (rainfallStats[districtName].yearsProcessed.indexOf(year) === -1) {
              rainfallStats[districtName].yearsProcessed.push(year);
            }
          }
          
          // Store temperature data
          temperatureValue.evaluate(function(temperature) {
            if (temperature !== null && temperature !== undefined) {
              TemperatureRawData[districtName][year][monthName] = temperature;
              
              // Add to years processed if not already there
              if (TemperatureStats[districtName].yearsProcessed.indexOf(year) === -1) {
                TemperatureStats[districtName].yearsProcessed.push(year);
              }
            }
            
            monthsProcessed++;
            if (monthsProcessed === monthsToProcess && callback) {
              callback();
            }
          }, function(error) {
            print('Error getting temperature for ' + monthName + ' ' + year + ':', error);
            monthsProcessed++;
            if (monthsProcessed === monthsToProcess && callback) {
              callback();
            }
          });
          
        }, function(error) {
          print('Error getting rainfall for ' + monthName + ' ' + year + ':', error);
          
          // Still try to get temperature even if rainfall failed
          temperatureValue.evaluate(function(temperature) {
            if (temperature !== null && temperature !== undefined) {
              TemperatureRawData[districtName][year][monthName] = temperature;
              
              if (TemperatureStats[districtName].yearsProcessed.indexOf(year) === -1) {
                TemperatureStats[districtName].yearsProcessed.push(year);
              }
            }
            
            monthsProcessed++;
            if (monthsProcessed === monthsToProcess && callback) {
              callback();
            }
          }, function(tempError) {
            print('Error getting temperature for ' + monthName + ' ' + year + ':', tempError);
            monthsProcessed++;
            if (monthsProcessed === monthsToProcess && callback) {
              callback();
            }
          });
        });
      });
    }, function(error) {
      print('Error getting months for year ' + year + ':', error);
      if (callback) callback();
    });
}



// Function to get all district names from shapefile
function getAllDistrictNames(callback) {
  print('Getting all district names from shapefile...');
  
  var districtNames = pakistanDistricts.distinct('NAME_3').aggregate_array('NAME_3');
  districtNames = districtNames.sort();
  
  districtNames.evaluate(function(names) {
    // Remove any null or undefined values
    var cleanNames = names.filter(function(name) {
      return name !== null && name !== undefined && name !== '';
    });
    
    allDistrictNames = cleanNames;
    totalDistrictsToProcess = cleanNames.length;
    
    print('Found ' + totalDistrictsToProcess + ' districts to process');
    
    if (callback) callback(cleanNames);
  }, function(error) {
    print('Error getting district names:', error);
    if (callback) callback([]);
  });
}

// Function to get district geometry
function getDistrictGeometry(districtName, callback) {
  var selectedDistrictFeature = pakistanDistricts.filter(ee.Filter.eq('NAME_3', districtName));
  
  selectedDistrictFeature.size().evaluate(function(count) {
    if (count === 0) {
      print('District "' + districtName + '" not found in shapefile');
      if (callback) callback(null);
      return;
    }
    
    var districtGeometry = selectedDistrictFeature.geometry();
    var simplifiedGeometry = districtGeometry.simplify({maxError: 100});
    
    if (callback) callback(simplifiedGeometry);
  }, function(error) {
    print('Error getting geometry for ' + districtName + ':', error);
    if (callback) callback(null);
  });
}

// Function to create a feature with averages for one district
function createDistrictFeature(districtName, districtGeometry) {
  // Check if we have data for this district
  if (!rainfallStats[districtName] || !TemperatureStats[districtName]) {
    print('No data available for ' + districtName);
    return null;
  }
  
  // Get monthly averages
  var rainfallAverages = rainfallStats[districtName].monthlyAverages;
  var temperatureAverages = TemperatureStats[districtName].monthlyAverages;
  
  // Calculate annual averages
  var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  var totalRainfall = 0;
  var totalTemperature = 0;
  var monthCount = 0;
  
  // Calculate totals
  monthNames.forEach(function(month) {
    if (rainfallAverages[month] !== undefined && temperatureAverages[month] !== undefined) {
      totalRainfall += rainfallAverages[month];
      totalTemperature += temperatureAverages[month];
      monthCount++;
    }
  });
  
  var annualRainfallAvg = monthCount > 0 ? totalRainfall : 0;
  var annualTemperatureAvg = monthCount > 0 ? totalTemperature / monthCount : 0;
  
  // Create properties object with all monthly and annual data
  var properties = {
    'district_name': districtName,
    'start_year': selectedStartYear,
    'end_year': selectedEndYear,
    'years_processed_rainfall': rainfallStats[districtName].yearsProcessed.length,
    'years_processed_temperature': TemperatureStats[districtName].yearsProcessed.length,
    'annual_rainfall_avg': annualRainfallAvg,
    'annual_temperature_avg': annualTemperatureAvg
  };
  
  // Add monthly rainfall averages
  monthNames.forEach(function(month) {
    properties['rainfall_' + month.toLowerCase()] = rainfallAverages[month] || 0;
  });
  
  // Add monthly temperature averages
  monthNames.forEach(function(month) {
    properties['temperature_' + month.toLowerCase()] = temperatureAverages[month] || 0;
  });
  
  var centroidGeometry = districtGeometry.centroid();
  var feature = ee.Feature(centroidGeometry, properties);
  
  print('Created feature for ' + districtName + 
        ' (Rainfall: ' + annualRainfallAvg.toFixed(1) + 'mm, ' +
        'Temperature: ' + annualTemperatureAvg.toFixed(1) + '°C)');
  
  return feature;
}

// Function to process a single district
function processSingleDistrict(districtName, callback) {
  print('Processing district: ' + districtName + ' (' + (processedDistrictCount + 1) + '/' + totalDistrictsToProcess + ')');
  
  // Get district geometry first
  getDistrictGeometry(districtName, function(geometry) {
    if (!geometry) {
      print('Failed to get geometry for ' + districtName + ', skipping...');
      processedDistrictCount++;
      if (callback) callback();
      return;
    }
    
    // Load all data for this district using your existing function
    loadAllDistrictData(districtName, geometry, function() {
      // Create feature for this district
      var feature = createDistrictFeature(districtName, geometry);
      
      if (feature) {
        districtFeaturesArray.push(feature);
        print('Successfully processed ' + districtName);
      } else {
        print('Failed to create feature for ' + districtName);
      }
      
      processedDistrictCount++;
      
      // Check if all districts are processed
      if (processedDistrictCount >= totalDistrictsToProcess) {
        buildFinalFeatureCollection();
      }
      
      if (callback) callback();
    });
  });
}

// Fixed sequential processing function
function processAllDistricts(startYear, endYear) {
  if (!startYear || !endYear) {
    print('Please provide start and end years');
    return;
  }
  
  // Set global year variables
  selectedStartYear = startYear;
  selectedEndYear = endYear;
  
  // Reset counters and arrays
  processedDistrictCount = 0;
  districtFeaturesArray = [];
  
  print('Starting to process all districts for years ' + startYear + '-' + endYear);
  
  // Get all district names first
  getAllDistrictNames(function(districtNames) {
    if (districtNames.length === 0) {
      print('No districts found to process');
      return;
    }
    
    print('Starting sequential processing of ' + districtNames.length + ' districts...');
    
    var currentIndex = 0;
    
    function processNext() {
      if (currentIndex >= districtNames.length) {
        print('All districts processing initiated!');
        return;
      }
      
      var districtName = districtNames[currentIndex];
      print('Initiating processing for: ' + districtName + ' (' + (currentIndex + 1) + '/' + districtNames.length + ')');
      currentIndex++;
      
      // Process this district with a callback to continue to next
      processSingleDistrict(districtName, function() {
        print('Completed: ' + districtName);
        // Immediately process next district
         ui.util.setTimeout(processNext, 1000)
      });
    }
    
    // Start the sequential processing
    processNext();
  });
}
// Function to build final feature collection
function buildFinalFeatureCollection() {
  print('Building final feature collection...');
  
  if (districtFeaturesArray.length === 0) {
    print('No features to build collection from');
    return;
  }
  
  // Create the feature collection
  districtAveragesFC = ee.FeatureCollection(districtFeaturesArray);
  
  print('Feature collection created with ' + districtFeaturesArray.length + ' districts');
  print('Years: ' + selectedStartYear + '-' + selectedEndYear);
  
  // Print some basic statistics
  districtAveragesFC.size().evaluate(function(count) {
    print('Final feature collection contains ' + count + ' features');
  });
  
  // Example of how to access the data
  print('Feature collection is ready! You can now use it for analysis.');
  print('Example usage:');
  print('- districtAveragesFC.filter(ee.Filter.gt("annual_rainfall_avg", 1000))');
  print('- districtAveragesFC.select(["district_name", "annual_rainfall_avg", "annual_temperature_avg"])');
  
  return districtAveragesFC;
}

// Function to export feature collection (optional)
function exportDistrictAverages(description, assetId) {
  if (!districtAveragesFC) {
    print('No feature collection to export. Run processAllDistricts() first.');
    return;
  }
  
  var exportDescription = description || 'Pakistan_District_Climate_Averages_' + selectedStartYear + '_' + selectedEndYear;
  
  Export.table.toAsset({
    collection: districtAveragesFC,
    description: exportDescription,
    assetId: assetId || 'projects/ee-mustafaasghar66/assets/' + exportDescription
  });
  
  print('Export task created: ' + exportDescription);
}

// Function to get summary statistics
function getDistrictAveragesSummary() {
  if (!districtAveragesFC) {
    print('No feature collection available. Run processAllDistricts() first.');
    return;
  }
  
  // Get basic statistics
  var rainfallStats = districtAveragesFC.aggregate_stats('annual_rainfall_avg');
  var temperatureStats = districtAveragesFC.aggregate_stats('annual_temperature_avg');
  
  rainfallStats.evaluate(function(rainStats) {
    temperatureStats.evaluate(function(tempStats) {
      print('=== DISTRICT AVERAGES SUMMARY ===');
      print('Period: ' + selectedStartYear + '-' + selectedEndYear);
      print('Districts processed: ' + districtFeaturesArray.length);
      print('');
      print('RAINFALL STATISTICS:');
      print('  Min: ' + rainStats.min.toFixed(1) + ' mm');
      print('  Max: ' + rainStats.max.toFixed(1) + ' mm');
      print('  Mean: ' + rainStats.mean.toFixed(1) + ' mm');
      print('');
      print('TEMPERATURE STATISTICS:');
      print('  Min: ' + tempStats.min.toFixed(1) + ' °C');
      print('  Max: ' + tempStats.max.toFixed(1) + ' °C');
      print('  Mean: ' + tempStats.mean.toFixed(1) + ' °C');
    });
  });
}


// processAllDistricts('2014', '2024');


// Step 2: Wait and watch console messages...

// Step 3: After it's done, YOU can optionally call:
// getDistrictAveragesSummary();  // To see statistics

// Step 4: If you want to export, YOU call:
// exportDistrictAverages();  // To save as asset

// UI Panel for buttons
var controlPanel = ui.Panel({
  style: {
    position: 'top-left',
    padding: '10px',
    backgroundColor: '#ffffff',
    border: '1px solid #cccccc',
    width: '300px'
  }
});

// Title label
var titleLabel = ui.Label({
  value: 'Pakistan District Climate Data Processing',
  style: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333333',
    margin: '0 0 10px 0'
  }
});

// Year input fields
var startYearTextbox = ui.Textbox({
  placeholder: 'Start Year (e.g., 2014)',
  value: '2019',
  style: {
    width: '120px',
    margin: '5px 0'
  }
});

var endYearTextbox = ui.Textbox({
  placeholder: 'End Year (e.g., 2024)',
  value: '2024',
  style: {
    width: '120px',
    margin: '5px 0'
  }
});

// Status label for showing current operation
var statusLabel = ui.Label({
  value: 'Ready to process districts',
  style: {
    fontSize: '12px',
    color: '#666666',
    margin: '10px 0',
    fontStyle: 'italic'
  }
});

// Button 1: Process All Districts
var processButton = ui.Button({
  label: '🔄 Start Processing All Districts',
  style: {
    width: '280px',
    margin: '5px 0',
    backgroundColor: '#007bff',
    color: 'black'
  },
  onClick: function() {
    var startYear = startYearTextbox.getValue();
    var endYear = endYearTextbox.getValue();
    
    // Validate inputs
    if (!startYear || !endYear) {
      print('❌ Error: Please enter both start and end years');
      statusLabel.setValue('❌ Error: Please enter both start and end years');
      return;
    }
    
    statusLabel.setValue('🔄 Processing districts for years ' + startYear + '-' + endYear + '...');
    
    // Simply call your function
    processAllDistricts(startYear, endYear);
  }
});

// Button 2: Export Feature Collection
var exportButton = ui.Button({
  label: '📤 Export Feature Collection',
  style: {
    width: '280px',
    margin: '5px 0',
    backgroundColor: '#28a745',
    color: 'black'
  },
  onClick: function() {
    statusLabel.setValue('📤 Exporting feature collection...');
    
    // Simply call your function
    exportDistrictAverages('My_Climate_Data_5yr', 'projects/ee-mustafaasghar66/assets/Pakistan_Climate_2019_2024');
  }
});

// Button 3: Get Summary Statistics (bonus button)
var summaryButton = ui.Button({
  label: '📊 Show Summary Statistics',
  style: {
    width: '280px',
    margin: '5px 0',
    backgroundColor: '#17a2b8',
    color: 'black'
  },
  onClick: function() {
    statusLabel.setValue('📊 Calculating summary statistics...');
    
    // Simply call your function
    getDistrictAveragesSummary();
  }
});

// Add all components to the panel
controlPanel.add(titleLabel);
controlPanel.add(ui.Label('Start Year:'));
controlPanel.add(startYearTextbox);
controlPanel.add(ui.Label('End Year:'));
controlPanel.add(endYearTextbox);
controlPanel.add(statusLabel);
controlPanel.add(processButton);
controlPanel.add(exportButton);
controlPanel.add(summaryButton);

// Add instructions
var instructionsLabel = ui.Label({
  value: 'Instructions:\n1. Set year range\n2. Click "Start Processing"\n3. Wait for completion\n4. Click "Export" to save data',
  style: {
    fontSize: '11px',
    color: '#888888',
    margin: '10px 0 0 0',
    whiteSpace: 'pre'
  }
});
controlPanel.add(instructionsLabel);

// Add the panel to the map
Map.add(controlPanel);