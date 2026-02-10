// ===========================================================================================
// EARLY WARNING SYSTEM: DISTRICT-LEVEL WEATHER ANOMALIES IN PAKISTAN
// Single Map with 3 Toggleable Layers (Past 90-Day, 16-Day Forecast, Combined)
// ===========================================================================================

// --- DATA SOURCES ---
var pakistanDistricts = ee.FeatureCollection('projects/ee-mustafaasghar66/assets/gadm36_PAK_3');
var dataFC = ee.FeatureCollection('projects/ee-mustafaasghar66/assets/Pakistan_Climate_2014_2024');

// --- CONFIGURATION ---
var today = ee.Date(Date.now());
var forecastEndDate = today.advance(16, 'day');
var MONTHS_TO_INCLUDE = 3; // Fixed at 90 days (3 months)

// 1. GFS DATASET (Future 16-day forecast)
var gfsDataset = ee.ImageCollection('NOAA/GFS0P25')
  .filterDate(today.advance(-1, 'day'), today.advance(1, 'day'))
  .filter(ee.Filter.lte('forecast_hours', 384))
  .filter(ee.Filter.gte('forecast_hours', 0));

// 2. ERA5 DATASET (Past) - Last 3 months available
var era5Dataset = ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
  .select(["total_precipitation_sum", "temperature_2m"])
  .filterDate("2020-01-01", today); 
var latestEra5Images = era5Dataset.sort('system:time_start', false).limit(3);

// Global UI Variables
var loadingLabel = null;
var loadingPanel = null;
var districtInfoPanel = null;
var districtInfoTitle = null;
var panelDistrictWidgets = [];
var keepRotating = true;
var districtLoadingSymbol = null;
var mainMap = null;

print("Today's date:", today);
print("Early Warning System: Single Map with 3 Layers");
print("Analysis Period: Past 90 days + 16-day forecast");


// ===========================================================================================
// UI SETUP
// ===========================================================================================
var panel = ui.Panel({ style: {width: '380px', padding: '20px'} });

// Title
panel.add(ui.Label({
  value: '🌍 Early Warning System',
  style: {fontSize: '22px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#2c3e50'}
}));

panel.add(ui.Label({
  value: 'District-Level Weather Anomalies in Pakistan',
  style: {fontSize: '14px', margin: '0 0 20px 0', color: '#7f8c8d', fontStyle: 'italic'}
}));

// Description
panel.add(ui.Label({
  value: 'This early warning system uses global datasets (ERA5 + GFS) to detect weather anomalies at the district level.\n\n' +
       'The map displays three toggleable layers:\n\n' +
       '• Layer 1: Past 90-Day Anomaly\n' +
       '   Deviation of last 3 months from baseline\n\n' +
       '• Layer 2: 16-Day Forecast Anomaly\n' +
       '   Deviation of upcoming forecast from baseline\n\n' +
       '• Layer 3: Combined 90+16 Day Anomaly\n' +
       '   Sum of past and forecast deviations\n\n' +
       'Use the layer controls (top right of map) to toggle layers on/off.',
  style: { fontSize: '13px', margin: '0 0 20px 0', whiteSpace: 'pre-line', color: '#555' }
}));

// Parameter Selection
panel.add(ui.Label('Select Weather Parameter:', {fontWeight: 'bold', fontSize: '15px', margin: '0 0 5px 0'}));
var parameterSelect = ui.Select({
  items: [
    {label: 'Precipitation (mm)', value: 'precipitation'}, 
    {label: 'Temperature (°C)', value: 'temperature'}
  ],
  value: 'precipitation',
  style: { margin: '5px 0 20px 0', width: '340px' }
});
panel.add(parameterSelect);

// Generate Button - FIXED: Removed blue border, made text permanently black
var analyzeButton = ui.Button({
  label: '🔮 Generate Early Warning Map',
  onClick: function() { 
    var parameter = parameterSelect.getValue(); 
    if (parameter) { 
      clearDistrictPanel(); // Clear any existing district info before regenerating
      updateVisualizationWithBatching(parameter); 
    } 
  },
  style: { 
    margin: '10px 0 0 0', 
    width: '340px', 
    fontWeight: 'bold', 
    fontSize: '15px',
    backgroundColor: '#f0f0f0', 
    color: '#000000',
    padding: '1px'
  }
});
panel.add(analyzeButton);

// Color Legend explanation
// panel.add(ui.Label({
//   value: '\n📊 Color Legend:\n' +
//       '🔵 Blue: Below Baseline (deficit/cooler)\n' +
//       '🟢 Green: Near Baseline (normal)\n' +
//       '🔴 Red: Above Baseline (excess/warmer)',
//   style: { fontSize: '12px', margin: '15px 0 0 0', whiteSpace: 'pre-line', color: '#666' }
// }));

// Data source info
var dateInfo = ui.Label({ 
  value: '\nData: ECMWF ERA5-Land Aggregated (historical) & NOAA GFS (forecast)\nBaseline: 10-year average (2014-2024)', 
  style: { fontSize: '11px', margin: '10px 0 0 0', fontStyle: 'italic', color: '#888' }
});
panel.add(dateInfo);

ui.root.insert(0, panel);


// ===========================================================================================
// UI HELPER FUNCTIONS
// ===========================================================================================
function showLoadingIndicator(message) {
  hideLoadingIndicator();
  loadingPanel = ui.Panel({ 
    style: { backgroundColor: '#e8f4fd', border: '2px solid #3498db', margin: '15px 0', padding: '15px', borderRadius: '5px' } 
  });
  var loadingTitle = ui.Label({ 
    value: '⏳ Processing Data...', 
    style: { fontSize: '15px', fontWeight: 'bold', color: '#2980b9', margin: '0 0 5px 0' } 
  });
  loadingLabel = ui.Label({ 
    value: message || 'Analyzing ERA5 and GFS data...', 
    style: { fontSize: '13px', color: '#34495e', margin: '0 0 10px 0' } 
  });
  var loadingSymbol = ui.Label({ 
    value: '🌍', 
    style: { fontSize: '24px', color: '#3498db', textAlign: 'center', fontWeight: 'bold' } 
  });
  loadingPanel.add(loadingTitle).add(loadingLabel).add(loadingSymbol);
  
  var insertIndex = panel.widgets().indexOf(analyzeButton) + 1;
  panel.insert(insertIndex, loadingPanel);
  
  var rotationSymbols = ['🌍', '🌎', '🌏']; 
  var currentSymbolIndex = 0;
  var rotateSymbol = function() { 
    if (loadingSymbol && loadingPanel) { 
      currentSymbolIndex = (currentSymbolIndex + 1) % rotationSymbols.length; 
      loadingSymbol.setValue(rotationSymbols[currentSymbolIndex]); 
      ui.util.setTimeout(rotateSymbol, 400); 
    } 
  };
  ui.util.setTimeout(rotateSymbol, 400);
}

function updateLoadingIndicator(message) { 
  if (loadingLabel) { loadingLabel.setValue(message); } 
}

function hideLoadingIndicator() { 
  if (loadingPanel) { 
    panel.remove(loadingPanel); 
    loadingPanel = null; 
    loadingLabel = null; 
  } 
}

// NEW: Show loading indicator specifically for district data fetching
function showDistrictLoadingIndicator(districtName) {
  clearDistrictPanel();
  districtInfoPanel = ui.Panel({ 
    style: { backgroundColor: '#e8f4fd', border: '2px solid #3498db', margin: '15px 0', padding: '15px', borderRadius: '5px' } 
  });
  districtInfoTitle = ui.Label({ 
    value: '⏳ Loading District Data...', 
    style: { fontSize: '15px', fontWeight: 'bold', color: '#2980b9', margin: '0 0 10px 0' } 
  });
  var messageText = districtName ? 
    'Please wait while we load data for ' + districtName + ' district...' :
    'Please wait while we load district data...';
  var loadingMessage = ui.Label({ 
    value: messageText, 
    style: { fontSize: '13px', color: '#34495e', fontStyle: 'italic' } 
  });
  districtInfoPanel.add(districtInfoTitle).add(loadingMessage);
  panel.add(districtInfoPanel);
  panelDistrictWidgets.push(districtInfoPanel);
}

function showDistrictInfo(title, content) {
  clearDistrictPanel();
  districtInfoPanel = ui.Panel({ 
    style: { backgroundColor: '#f0f9ff', border: '2px solid #3498db', margin: '15px 0', padding: '15px', borderRadius: '5px' } 
  });
  districtInfoTitle = ui.Label({ 
    value: '📍 ' + title, 
    style: { fontSize: '15px', fontWeight: 'bold', color: '#2980b9', margin: '0 0 10px 0' } 
  });
  var infoLabel = ui.Label(content, { 
    whiteSpace: 'pre-line', 
    fontSize: '13px', 
    color: '#34495e'
  });
  districtInfoPanel.add(districtInfoTitle).add(infoLabel);
  panel.add(districtInfoPanel);
  panelDistrictWidgets.push(districtInfoPanel);
}

function clearDistrictPanel() { 
  panelDistrictWidgets.forEach(function(widget) { 
    panel.remove(widget); 
  }); 
  panelDistrictWidgets = []; 
  districtLoadingSymbol = null; // Clear the loading symbol reference
}

function getMonthName(date) {
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return ee.List(months).get(date.get('month').subtract(1));
}


// ===========================================================================================
// CORE CALCULATION LOGIC (PAST + FUTURE + COMBINED)
// ===========================================================================================
function calculateCombinedAnomaly(district, parameter, gfsData, historicalData, era5List) {
  var districtName = ee.Feature(district).get('NAME_3');
  var districtGeometry = ee.Feature(district).geometry();
  var districtHistoricalData = historicalData.filter(ee.Filter.eq('district_name', districtName)).first();

  return ee.Algorithms.If(ee.Algorithms.IsEqual(districtHistoricalData, null), 
    ee.Feature(district).set({ 'combined_diff': -999, 'forecast_diff': -999, 'past_diff': -999, 'debug': 'no_historical' }),
    (function() {
      
      // --- PART 1: FUTURE (16-Day Forecast Logic) ---
      var latestForecastRun = gfsData.sort('creation_time', false).first().get('creation_time');
      var latestForecast = gfsData.filter(ee.Filter.eq('creation_time', latestForecastRun));
      var forecastDiff;

      // A. GFS Forecast Value
      var forecastValue;
      if (parameter === 'precipitation') {
        var gfsBand = 'precipitation_rate';
        var hourlyValues = ee.List.sequence(1, 120).map(function(hour) {
          var img = latestForecast.filter(ee.Filter.eq('forecast_hours', hour)).first();
          return ee.Algorithms.If(img, (function(){
             var rate = ee.Image(img).select(gfsBand).reduceRegion({reducer: ee.Reducer.mean(), geometry: districtGeometry, scale: 27830, bestEffort: true}).get(gfsBand);
             var sanitizedRate = ee.Number(ee.Algorithms.If(rate, rate, 0));
             return sanitizedRate.multiply(3600);
          })(), 0);
        });
        var threeValues = ee.List.sequence(123, 384, 3).map(function(hour) {
          var img = latestForecast.filter(ee.Filter.eq('forecast_hours', hour)).first();
          return ee.Algorithms.If(img, (function(){
             var rate = ee.Image(img).select(gfsBand).reduceRegion({reducer: ee.Reducer.mean(), geometry: districtGeometry, scale: 27830, bestEffort: true}).get(gfsBand);
             var sanitizedRate = ee.Number(ee.Algorithms.If(rate, rate, 0));
             return sanitizedRate.multiply(10800);
          })(), 0);
        });
        var forecastValueRaw = ee.Number(hourlyValues.reduce(ee.Reducer.sum())).add(ee.Number(threeValues.reduce(ee.Reducer.sum())));
        forecastValue = ee.Number(ee.Algorithms.If(forecastValueRaw, forecastValueRaw, 0));
      } else {
        var meanImg = latestForecast.select('temperature_2m_above_ground').mean();
        var val = meanImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: districtGeometry, scale: 27830, bestEffort: true}).get('temperature_2m_above_ground');
        forecastValue = ee.Number(ee.Algorithms.If(val, val, 0)); 
      }

      // B. Weighted Historical Baseline (Forecast Period)
      var startDay = today.get('day');
      var startMonth = today.get('month');
      var endMonth = forecastEndDate.get('month');
      var histForecastValue;
      
      if (parameter === 'precipitation') {
         var cols = ee.List(['rainfall_jan', 'rainfall_feb', 'rainfall_mar', 'rainfall_apr', 'rainfall_may', 'rainfall_jun','rainfall_jul', 'rainfall_aug', 'rainfall_sep', 'rainfall_oct', 'rainfall_nov', 'rainfall_dec']);
         histForecastValue = ee.Number(ee.Algorithms.If(startMonth.neq(endMonth),
            (function(){
               var daysList = ee.List([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
               var d1Total = ee.Number(daysList.get(startMonth.subtract(1)));
               var d1Current = d1Total.subtract(startDay).add(1);
               var v1 = ee.Number(districtHistoricalData.get(cols.get(startMonth.subtract(1))));
               var p1 = v1.divide(d1Total).multiply(d1Current);
               var d2Current = ee.Number(16).subtract(d1Current);
               var d2Total = ee.Number(daysList.get(endMonth.subtract(1)));
               var v2 = ee.Number(districtHistoricalData.get(cols.get(endMonth.subtract(1))));
               var p2 = v2.divide(d2Total).multiply(d2Current);
               return p1.add(p2);
            })(),
            (function(){
               var v = ee.Number(districtHistoricalData.get(cols.get(startMonth.subtract(1))));
               var is31DayMonth = startMonth.eq(1).or(startMonth.eq(3)).or(startMonth.eq(5)).or(startMonth.eq(7)).or(startMonth.eq(8)).or(startMonth.eq(10)).or(startMonth.eq(12));
               var daysInMonth = ee.Number(ee.Algorithms.If(is31DayMonth, 31, ee.Algorithms.If(startMonth.eq(2), 28, 30)));
               return v.divide(daysInMonth).multiply(16); 
            })()
         ));
      } else {
         var cols = ee.List(['temperature_jan', 'temperature_feb', 'temperature_mar', 'temperature_apr', 'temperature_may', 'temperature_jun','temperature_jul', 'temperature_aug', 'temperature_sep', 'temperature_oct', 'temperature_nov', 'temperature_dec']);
         histForecastValue = ee.Number(ee.Algorithms.If(startMonth.neq(endMonth),
            (function(){
               var d1Current = ee.Number(30).subtract(startDay).add(1);
               var v1 = ee.Number(districtHistoricalData.get(cols.get(startMonth.subtract(1))));
               var d2Current = ee.Number(16).subtract(d1Current);
               var v2 = ee.Number(districtHistoricalData.get(cols.get(endMonth.subtract(1))));
               return (v1.multiply(d1Current).add(v2.multiply(d2Current))).divide(16);
            })(),
            ee.Number(districtHistoricalData.get(cols.get(startMonth.subtract(1))))
         ));
      }
      forecastDiff = forecastValue.subtract(histForecastValue);


      // --- PART 2: PAST (ERA5 Logic - Fixed at 3 months) ---
      var calculateEraDiff = function(img) {
         var eraDate = ee.Date(ee.Image(img).get('system:time_start'));
         var mColName = getMonthName(eraDate);
         var histCol = parameter === 'precipitation' ? 
             ee.String('rainfall_').cat(mColName) : 
             ee.String('temperature_').cat(mColName);
         
         var histVal = ee.Number(districtHistoricalData.get(histCol));
         var band = parameter === 'precipitation' ? 'total_precipitation_sum' : 'temperature_2m';
         var obsVal = ee.Image(img).select(band).reduceRegion({
             reducer: ee.Reducer.mean(),
             geometry: districtGeometry, scale: 11132, bestEffort: true
         }).get(band);
         
         var obsNum = ee.Number(ee.Algorithms.If(obsVal, obsVal, 0));
         if (parameter === 'precipitation') {
             obsNum = obsNum.multiply(1000); 
         } else {
             obsNum = ee.Number(ee.Algorithms.If(obsVal, obsNum.subtract(273.15), histVal));
         }
         return obsNum.subtract(histVal);
      };

      var diff1 = calculateEraDiff(era5List.get(0));
      var diff2 = calculateEraDiff(era5List.get(1));
      var diff3 = calculateEraDiff(era5List.get(2));
      
      // Sum all 3 months (fixed at 90 days)
      var pastDiffTotal = diff1.add(diff2).add(diff3);
      
      // --- PART 3: COMBINE ---
      var finalCombinedDiff = forecastDiff.add(pastDiffTotal);

      return ee.Feature(district).set({
        'combined_diff': finalCombinedDiff,
        'forecast_diff': forecastDiff,
        'past_diff': pastDiffTotal,
        'district_name': districtName
      });

    })()
  );
}


// ===========================================================================================
// BATCH PROCESSING
// ===========================================================================================
function updateVisualizationWithBatching(parameter) {
  showLoadingIndicator("Initializing Early Warning System...");
  
  var era5List = latestEra5Images.toList(3); 

  pakistanDistricts.toList(pakistanDistricts.size()).evaluate(function(districtsList) {
    var BATCH_SIZE = 5; 
    var processedFeatures = []; 
    var total = districtsList.length;
    var numBatches = Math.ceil(total / BATCH_SIZE);

    function processBatch(startIndex) {
      if (startIndex >= total) { 
        finalizeVisualization(processedFeatures, parameter); 
        return; 
      }
      
      var currentBatchNumber = Math.floor(startIndex / BATCH_SIZE) + 1;
      updateLoadingIndicator("Processing districts: Batch " + currentBatchNumber + " of " + numBatches + "...");
      
      var end = Math.min(startIndex + BATCH_SIZE, total);
      var batchCol = ee.FeatureCollection(districtsList.slice(startIndex, end));
      
      var result = batchCol.map(function(d) { 
          return calculateCombinedAnomaly(d, parameter, gfsDataset, dataFC, era5List); 
      });

      result.evaluate(function(batch, err) {
        if (err) { 
          print('Batch Error:', err); 
        } else if (batch && batch.features) { 
          processedFeatures = processedFeatures.concat(batch.features); 
        }
        ui.util.setTimeout(function() { processBatch(end); }, 100);
      });
    }
    processBatch(0);
  });
}


// ===========================================================================================
// VISUALIZATION - SINGLE MAP WITH 3 LAYERS
// ===========================================================================================
function finalizeVisualization(features, parameter) {
  updateLoadingIndicator("Creating map layers...");
  
  var valid = features.filter(function(f) { 
    return f.properties.combined_diff !== -999 && f.properties.combined_diff !== undefined && 
           f.properties.combined_diff !== null && f.properties.forecast_diff !== -999 && 
           f.properties.past_diff !== -999; 
  });
  
  if (valid.length === 0) { 
    print("No valid data found."); 
    hideLoadingIndicator(); 
    return; 
  }
  
  var fc = ee.FeatureCollection(valid);
  
  // Get arrays for each metric to calculate max values
  var pastDiffs = fc.aggregate_array('past_diff');
  var forecastDiffs = fc.aggregate_array('forecast_diff');
  var combinedDiffs = fc.aggregate_array('combined_diff');
  
  ee.Dictionary({
    past: pastDiffs,
    forecast: forecastDiffs,
    combined: combinedDiffs
  }).evaluate(function(result) {
    // Calculate max for each layer (for color scaling)
    var maxPast = result.past.reduce(function(a, b) { return Math.max(Math.abs(a), Math.abs(b)); }, 0);
    var maxForecast = result.forecast.reduce(function(a, b) { return Math.max(Math.abs(a), Math.abs(b)); }, 0);
    var maxCombined = result.combined.reduce(function(a, b) { return Math.max(Math.abs(a), Math.abs(b)); }, 0);
    
    if(maxPast === 0) maxPast = 1;
    if(maxForecast === 0) maxForecast = 1;
    if(maxCombined === 0) maxCombined = 1;
    
    // Create the single map with 3 layers
    createSingleMapWithLayers(fc, maxPast, maxForecast, maxCombined, parameter);
    hideLoadingIndicator();
  });
}


function createSingleMapWithLayers(fc, maxPast, maxForecast, maxCombined, parameter) {
  // Create map
  mainMap = ui.Map();
  mainMap.setCenter(69.3451, 30.3753, 6);
  mainMap.setOptions('ROADMAP');
  
  // Color palette: Blue (below) -> Green (normal) -> Red (above)
  var palette = ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'];
  
  // Create styled layers for each metric
  // Layer 1: Past 90-Day Anomaly
  var pastLayer = fc.map(function(f) {
    var val = ee.Number(f.get('past_diff'));
    var normalized = val.divide(maxPast).add(1).divide(2).multiply(6).min(6).max(0);
    return f.set('color_index', normalized);
  });
  
  // Layer 2: 16-Day Forecast Anomaly  
  var forecastLayer = fc.map(function(f) {
    var val = ee.Number(f.get('forecast_diff'));
    var normalized = val.divide(maxForecast).add(1).divide(2).multiply(6).min(6).max(0);
    return f.set('color_index', normalized);
  });
  
  // Layer 3: Combined 90+16 Day Anomaly
  var combinedLayer = fc.map(function(f) {
    var val = ee.Number(f.get('combined_diff'));
    var normalized = val.divide(maxCombined).add(1).divide(2).multiply(6).min(6).max(0);
    return f.set('color_index', normalized);
  });
  
  // Create paint images for each layer
  var pastImage = pastLayer.reduceToImage(['color_index'], ee.Reducer.first());
  var forecastImage = forecastLayer.reduceToImage(['color_index'], ee.Reducer.first());
  var combinedImage = combinedLayer.reduceToImage(['color_index'], ee.Reducer.first());
  
  // Visualization parameters
  var visParams = {min: 0, max: 6, palette: palette};
  
  // Add district boundaries
  var boundaries = pakistanDistricts.style({color: '000000', width: 1, fillColor: '00000000'});
  
  // Add layers to map (Combined layer visible by default, others hidden)
  mainMap.addLayer(pastImage.clip(pakistanDistricts), visParams, 'Layer 1: Past 90-Day Anomaly', false);
  mainMap.addLayer(forecastImage.clip(pakistanDistricts), visParams, 'Layer 2: 16-Day Forecast Anomaly', false);
  mainMap.addLayer(combinedImage.clip(pakistanDistricts), visParams, 'Layer 3: Combined 90+16 Day Anomaly', true);
  mainMap.addLayer(boundaries, {}, 'District Boundaries', true);
  
  // Add legend
  addLegend(mainMap, parameter, maxCombined);
  
  // Add click handler
  addClickHandler(mainMap, fc, parameter);
  
  // Add title label
  var titleLabel = ui.Label('Early Warning System: Weather Anomalies', {
    position: 'top-center', 
    fontSize: '18px', 
    fontWeight: 'bold', 
    backgroundColor: 'white', 
    padding: '8px 15px',
    border: '1px solid #ccc'
  });
  mainMap.add(titleLabel);
  
  // Add layer instructions
  var instructionLabel = ui.Label('💡 Use the Layers panel (top right) to toggle different views', {
    position: 'bottom-left', 
    fontSize: '12px', 
    backgroundColor: 'rgba(255,255,255,0.9)', 
    padding: '5px 10px',
    color: '#666'
  });
  mainMap.add(instructionLabel);
  
  // Update root with panel and map
  ui.root.clear();
  ui.root.add(panel);
  ui.root.add(mainMap);
}


// ===========================================================================================
// LEGEND
// ===========================================================================================
function addLegend(map, parameter, maxVal) {
  var legend = ui.Panel({
    style: {
      position: 'bottom-right',
      padding: '15px 20px',
      backgroundColor: 'white',
      border: '2px solid #333'
    }
  });

  var unit = parameter === 'precipitation' ? 'mm' : '°C';
  
  legend.add(ui.Label({
    value: '📊 Anomaly Legend',
    style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 12px 0'}
  }));

  var palette = ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7', '#fddbc7', '#ef8a62', '#b2182b'];
  
  var colorBar = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
  
  palette.forEach(function(color, i) {
    colorBar.add(ui.Label({
      value: '',
      style: {
        backgroundColor: color,
        padding: '20px 18px',
        margin: '0'
      }
    }));
  });
  
  legend.add(colorBar);
  
  var labelPanel = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
  labelPanel.add(ui.Label({value: '🔵 Below Baseline', style: {fontSize: '14px', margin: '8px 0 0 0', color: '#2166ac', fontWeight: 'bold'}}));
  labelPanel.add(ui.Label({value: '          ', style: {margin: '0'}}));
  labelPanel.add(ui.Label({value: '🔴 Above Baseline', style: {fontSize: '14px', margin: '8px 0 0 0', color: '#b2182b', fontWeight: 'bold'}}));
  legend.add(labelPanel);
  
  legend.add(ui.Label({
    value: 'Units: ' + unit,
    style: {fontSize: '13px', margin: '8px 0 0 0', color: '#666', fontStyle: 'italic'}
  }));

  map.add(legend);
}


// ===========================================================================================
// CLICK HANDLER - FIXED: Added loading indicator for district data fetching
// ===========================================================================================
function addClickHandler(map, fc, parameter) {
  map.onClick(function(coords) {
    // Show loading indicator IMMEDIATELY without district name
    showDistrictLoadingIndicator();
    
    var point = ee.Geometry.Point([coords.lon, coords.lat]);
    var clickedDistrict = fc.filterBounds(point).first();
    
    // Now fetch the full district data
    clickedDistrict.evaluate(function(feature, err) {
      if (err || !feature) {
        showDistrictInfo('Click on a District', 'Click on any district to see detailed anomaly information.');
        return;
      }
      
      var props = feature.properties;
      var unit = parameter === 'precipitation' ? 'mm' : '°C';
      
      var pastVal = props.past_diff !== undefined ? props.past_diff.toFixed(2) : 'N/A';
      var forecastVal = props.forecast_diff !== undefined ? props.forecast_diff.toFixed(2) : 'N/A';
      var combinedVal = props.combined_diff !== undefined ? props.combined_diff.toFixed(2) : 'N/A';
      
      var pastStatus = getAnomalyStatus(props.past_diff);
      var forecastStatus = getAnomalyStatus(props.forecast_diff);
      var combinedStatus = getAnomalyStatus(props.combined_diff);
      
      var content = 
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '📊 Past 90-Day Anomaly:\n' +
        '   ' + pastVal + ' ' + unit + ' ' + pastStatus + '\n\n' +
        '🔮 16-Day Forecast Anomaly:\n' +
        '   ' + forecastVal + ' ' + unit + ' ' + forecastStatus + '\n\n' +
        '⚡ Combined 90+16 Day Anomaly:\n' +
        '   ' + combinedVal + ' ' + unit + ' ' + combinedStatus + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
      
      showDistrictInfo(props.district_name || 'District', content);
    });
  });
}

// Simple status based on whether value is above or below baseline
function getAnomalyStatus(value) {
  if (value === undefined || value === null) return '';
  if (value > 0) return '🔴 (Above Baseline)';
  if (value < 0) return '🔵 (Below Baseline)';
  return '(At Baseline)';
}


// Map initialization happens in createSingleMapWithLayers() after user clicks Generate button