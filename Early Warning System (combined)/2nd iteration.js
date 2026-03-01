// ===========================================================================================
// EARLY WARNING SYSTEM: DISTRICT-LEVEL WEATHER ANOMALIES IN PAKISTAN
// 2nd Iteration: Custom Thresholds, Per-Day Standardization, Enhanced District Info
// Single Map with 3 Toggleable Layers (Past 90-Day, 16-Day Forecast, Combined)
// ===========================================================================================

// --- DATA SOURCES ---
var pakistanDistricts = ee.FeatureCollection('projects/ee-mustafaasghar66/assets/gadm36_PAK_3');
var dataFC = ee.FeatureCollection('projects/ee-mustafaasghar66/assets/Pakistan_Climate_2014_2024');

// --- CONFIGURATION ---
var today = ee.Date(Date.now());
var forecastEndDate = today.advance(16, 'day');
var MONTHS_TO_INCLUDE = 3; // Fixed at 90 days (3 months)
var PAST_DAYS = 90;
var FORECAST_DAYS = 16;

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

// Current threshold values (will be updated by dropdowns)
var currentRedThreshold = 5;   // Default: +5 mm/day for precipitation
var currentBlueThreshold = -5; // Default: -5 mm/day for precipitation

print("Today's date:", today);
print("Early Warning System: 2nd Iteration");
print("Analysis Period: Past 90 days + 16-day forecast");
print("Values shown in per-day units");


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
       '• Layer 1: Past 90-Day Anomaly (per day)\n' +
       '   Daily deviation of last 3 months from baseline\n\n' +
       '• Layer 2: 16-Day Forecast Anomaly (per day)\n' +
       '   Daily deviation of upcoming forecast from baseline\n\n' +
       '• Layer 3: Combined Anomaly (per day)\n' +
       '   Average of past and forecast daily deviations\n\n' +
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
  style: { margin: '5px 0 15px 0', width: '340px' },
  onChange: function(value) {
    updateThresholdDropdowns(value);
  }
});
panel.add(parameterSelect);

// --- CUSTOM COLOR THRESHOLD DROPDOWNS ---
panel.add(ui.Label('Set Anomaly Color Thresholds (per day):', 
  {fontWeight: 'bold', fontSize: '14px', margin: '10px 0 5px 0'}));

panel.add(ui.Label('Values beyond these thresholds will be shown as max red/blue.', 
  {fontSize: '11px', margin: '0 0 10px 0', color: '#888', fontStyle: 'italic'}));

// Red threshold label and dropdown
var redThresholdLabel = ui.Label('🔴 Above Baseline (Red) Threshold:', 
  {fontSize: '13px', margin: '0 0 3px 0', color: '#b2182b', fontWeight: 'bold'});
panel.add(redThresholdLabel);

var redThresholdSelect = ui.Select({
  items: [
    {label: '+1 mm/day', value: 1},
    {label: '+2 mm/day', value: 2},
    {label: '+5 mm/day', value: 5},
    {label: '+10 mm/day', value: 10},
    {label: '+15 mm/day', value: 15},
    {label: '+20 mm/day', value: 20}
  ],
  value: 5,
  style: { margin: '0 0 10px 0', width: '340px' },
  onChange: function(value) {
    currentRedThreshold = value;
  }
});
panel.add(redThresholdSelect);

// Blue threshold label and dropdown
var blueThresholdLabel = ui.Label('🔵 Below Baseline (Blue) Threshold:', 
  {fontSize: '13px', margin: '0 0 3px 0', color: '#2166ac', fontWeight: 'bold'});
panel.add(blueThresholdLabel);

var blueThresholdSelect = ui.Select({
  items: [
    {label: '-1 mm/day', value: -1},
    {label: '-2 mm/day', value: -2},
    {label: '-5 mm/day', value: -5},
    {label: '-10 mm/day', value: -10},
    {label: '-15 mm/day', value: -15},
    {label: '-20 mm/day', value: -20}
  ],
  value: -5,
  style: { margin: '0 0 15px 0', width: '340px' },
  onChange: function(value) {
    currentBlueThreshold = value;
  }
});
panel.add(blueThresholdSelect);

// Function to update threshold dropdown options based on parameter
function updateThresholdDropdowns(parameter) {
  if (parameter === 'precipitation') {
    redThresholdSelect.items().reset([
      {label: '+1 mm/day', value: 1},
      {label: '+2 mm/day', value: 2},
      {label: '+5 mm/day', value: 5},
      {label: '+10 mm/day', value: 10},
      {label: '+15 mm/day', value: 15},
      {label: '+20 mm/day', value: 20}
    ]);
    redThresholdSelect.setValue(5);
    currentRedThreshold = 5;
    
    blueThresholdSelect.items().reset([
      {label: '-1 mm/day', value: -1},
      {label: '-2 mm/day', value: -2},
      {label: '-5 mm/day', value: -5},
      {label: '-10 mm/day', value: -10},
      {label: '-15 mm/day', value: -15},
      {label: '-20 mm/day', value: -20}
    ]);
    blueThresholdSelect.setValue(-5);
    currentBlueThreshold = -5;
  } else {
    // Temperature thresholds
    redThresholdSelect.items().reset([
      {label: '+1 °C/day', value: 1},
      {label: '+2 °C/day', value: 2},
      {label: '+3 °C/day', value: 3},
      {label: '+5 °C/day', value: 5},
      {label: '+8 °C/day', value: 8},
      {label: '+10 °C/day', value: 10}
    ]);
    redThresholdSelect.setValue(3);
    currentRedThreshold = 3;
    
    blueThresholdSelect.items().reset([
      {label: '-1 °C/day', value: -1},
      {label: '-2 °C/day', value: -2},
      {label: '-3 °C/day', value: -3},
      {label: '-5 °C/day', value: -5},
      {label: '-8 °C/day', value: -8},
      {label: '-10 °C/day', value: -10}
    ]);
    blueThresholdSelect.setValue(-3);
    currentBlueThreshold = -3;
  }
}

// Generate Button
var analyzeButton = ui.Button({
  label: 'Generate Early Warning Maps',
  onClick: function() { 
    var parameter = parameterSelect.getValue(); 
    if (parameter) { 
      clearDistrictPanel();
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

// Data source info
var dateInfo = ui.Label({ 
  value: '\nData: ECMWF ERA5-Land Aggregated (historical) & NOAA GFS (forecast)\nBaseline: 10-year average (2014-2024)\nAll values standardized to per-day units', 
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

function showDistrictLoadingIndicator(districtName) {
  clearDistrictPanel();
  keepRotating = true;
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
  districtLoadingSymbol = ui.Label({ 
    value: '🌍', 
    style: { fontSize: '24px', color: '#3498db', textAlign: 'center', fontWeight: 'bold' } 
  });
  districtInfoPanel.add(districtInfoTitle).add(loadingMessage).add(districtLoadingSymbol);
  panel.add(districtInfoPanel);
  panelDistrictWidgets.push(districtInfoPanel);
  
  var rotationSymbols = ['🌍', '🌎', '🌏']; 
  var currentSymbolIndex = 0;
  var rotateSymbol = function() { 
    if (districtLoadingSymbol && districtInfoPanel && keepRotating) { 
      currentSymbolIndex = (currentSymbolIndex + 1) % rotationSymbols.length; 
      districtLoadingSymbol.setValue(rotationSymbols[currentSymbolIndex]); 
      ui.util.setTimeout(rotateSymbol, 400); 
    } 
  };
  ui.util.setTimeout(rotateSymbol, 400);
}

function showDistrictInfo(title, content) {
  keepRotating = false;
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
  districtLoadingSymbol = null;
}

function getMonthName(date) {
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return ee.List(months).get(date.get('month').subtract(1));
}


// ===========================================================================================
// CORE CALCULATION LOGIC (PAST + FUTURE + COMBINED)
// Now stores calculated value, baseline, and diff; all standardized to per-day
// ===========================================================================================
function calculateCombinedAnomaly(district, parameter, gfsData, historicalData, era5List) {
  var districtName = ee.Feature(district).get('NAME_3');
  var districtGeometry = ee.Feature(district).geometry();
  var districtHistoricalData = historicalData.filter(ee.Filter.eq('district_name', districtName)).first();

  return ee.Algorithms.If(ee.Algorithms.IsEqual(districtHistoricalData, null), 
    ee.Feature(district).set({
      'combined_diff': -999, 'forecast_diff': -999, 'past_diff': -999,
      'forecast_value': -999, 'forecast_baseline': -999,
      'past_value': -999, 'past_baseline': -999,
      'combined_value': -999, 'combined_baseline': -999,
      'debug': 'no_historical'
    }),
    (function() {
      
      // --- PART 1: FUTURE (16-Day Forecast Logic) ---
      var latestForecastRun = gfsData.sort('creation_time', false).first().get('creation_time');
      var latestForecast = gfsData.filter(ee.Filter.eq('creation_time', latestForecastRun));
      var forecastDiff;

      // A. GFS Forecast Value (total over 16 days)
      var forecastValueTotal;
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
        forecastValueTotal = ee.Number(ee.Algorithms.If(forecastValueRaw, forecastValueRaw, 0));
      } else {
        var meanImg = latestForecast.select('temperature_2m_above_ground').mean();
        var val = meanImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: districtGeometry, scale: 27830, bestEffort: true}).get('temperature_2m_above_ground');
        forecastValueTotal = ee.Number(ee.Algorithms.If(val, val, 0)); 
      }

      // B. Weighted Historical Baseline (Forecast Period) - total over 16 days
      var startDay = today.get('day');
      var startMonth = today.get('month');
      var endMonth = forecastEndDate.get('month');
      var histForecastValueTotal;
      
      if (parameter === 'precipitation') {
         var cols = ee.List(['rainfall_jan', 'rainfall_feb', 'rainfall_mar', 'rainfall_apr', 'rainfall_may', 'rainfall_jun','rainfall_jul', 'rainfall_aug', 'rainfall_sep', 'rainfall_oct', 'rainfall_nov', 'rainfall_dec']);
         histForecastValueTotal = ee.Number(ee.Algorithms.If(startMonth.neq(endMonth),
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
         histForecastValueTotal = ee.Number(ee.Algorithms.If(startMonth.neq(endMonth),
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
      
      // Per-day values for forecast
      var forecastValuePerDay, forecastBaselinePerDay, forecastDiffPerDay;
      if (parameter === 'precipitation') {
        forecastValuePerDay = forecastValueTotal.divide(FORECAST_DAYS);
        forecastBaselinePerDay = histForecastValueTotal.divide(FORECAST_DAYS);
        forecastDiffPerDay = forecastValuePerDay.subtract(forecastBaselinePerDay);
      } else {
        // Temperature: forecastValueTotal is already mean temp (in K), convert to C
        forecastValuePerDay = forecastValueTotal.subtract(273.15);
        forecastBaselinePerDay = histForecastValueTotal;
        forecastDiffPerDay = forecastValuePerDay.subtract(forecastBaselinePerDay);
      }


      // --- PART 2: PAST (ERA5 Logic - Fixed at 3 months = ~90 days) ---
      var calculateEraValues = function(img) {
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
             obsNum = obsNum.multiply(1000); // Convert m to mm
         } else {
             obsNum = ee.Number(ee.Algorithms.If(obsVal, obsNum.subtract(273.15), histVal));
         }
         // Return a list: [observed_value, historical_baseline]
         return ee.List([obsNum, histVal]);
      };

      var vals1 = ee.List(calculateEraValues(era5List.get(0)));
      var vals2 = ee.List(calculateEraValues(era5List.get(1)));
      var vals3 = ee.List(calculateEraValues(era5List.get(2)));
      
      var pastObsTotal, pastBaseTotal, pastDiffPerDay, pastValuePerDay, pastBaselinePerDay;
      
      if (parameter === 'precipitation') {
        // Sum observed and baseline over 3 months, then divide by 90 for per-day
        pastObsTotal = ee.Number(vals1.get(0)).add(ee.Number(vals2.get(0))).add(ee.Number(vals3.get(0)));
        pastBaseTotal = ee.Number(vals1.get(1)).add(ee.Number(vals2.get(1))).add(ee.Number(vals3.get(1)));
        pastValuePerDay = pastObsTotal.divide(PAST_DAYS);
        pastBaselinePerDay = pastBaseTotal.divide(PAST_DAYS);
        pastDiffPerDay = pastValuePerDay.subtract(pastBaselinePerDay);
      } else {
        // Temperature: average over 3 months (already in °C per month, so average is per-day equivalent)
        pastObsTotal = ee.Number(vals1.get(0)).add(ee.Number(vals2.get(0))).add(ee.Number(vals3.get(0)));
        pastBaseTotal = ee.Number(vals1.get(1)).add(ee.Number(vals2.get(1))).add(ee.Number(vals3.get(1)));
        pastValuePerDay = pastObsTotal.divide(3);      // Average temp over 3 months
        pastBaselinePerDay = pastBaseTotal.divide(3);
        pastDiffPerDay = pastValuePerDay.subtract(pastBaselinePerDay);
      }
      
      // --- PART 3: COMBINE (average of per-day anomalies) ---
      var combinedDiffPerDay = pastDiffPerDay.add(forecastDiffPerDay).divide(2);
      var combinedValuePerDay = pastValuePerDay.add(forecastValuePerDay).divide(2);
      var combinedBaselinePerDay = pastBaselinePerDay.add(forecastBaselinePerDay).divide(2);

      return ee.Feature(district).set({
        // Per-day anomaly differences (used for map coloring)
        'combined_diff': combinedDiffPerDay,
        'forecast_diff': forecastDiffPerDay,
        'past_diff': pastDiffPerDay,
        // Per-day calculated values
        'forecast_value': forecastValuePerDay,
        'forecast_baseline': forecastBaselinePerDay,
        'past_value': pastValuePerDay,
        'past_baseline': pastBaselinePerDay,
        'combined_value': combinedValuePerDay,
        'combined_baseline': combinedBaselinePerDay,
        // District name
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
      updateLoadingIndicator("Please wait while data is being loaded, do not press on Generate Early Warning Maps button again...");
      
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
// VISUALIZATION - SINGLE MAP WITH 3 LAYERS (User-Defined Thresholds)
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
  
  // Use user-defined thresholds instead of auto-scaling
  createSingleMapWithLayers(fc, currentRedThreshold, currentBlueThreshold, parameter);
  hideLoadingIndicator();
}


function createSingleMapWithLayers(fc, redThreshold, blueThreshold, parameter) {
  // Create map
  mainMap = ui.Map();
  mainMap.setCenter(69.3451, 30.3753, 6);
  mainMap.setOptions('ROADMAP');
  
  // Color palette: Blue (below) -> Green (normal) -> Red (above)
  var palette = ['#2166ac', '#67a9cf', '#a6dba0', '#4daf4a', '#fdae61', '#ef8a62', '#b2182b'];
  
  // Normalize values based on user-defined thresholds
  // Maps: blueThreshold -> 0, 0 -> 3, redThreshold -> 6
  
  // Layer 1: Past 90-Day Anomaly (per day)
  var pastLayer = fc.map(function(f) {
    var val = ee.Number(f.get('past_diff'));
    // Normalize: blue threshold = 0, zero = 3, red threshold = 6
    var normalized = ee.Algorithms.If(val.gte(0),
      val.divide(redThreshold).multiply(3).add(3).min(6),
      val.divide(Math.abs(blueThreshold)).multiply(3).add(3).max(0)
    );
    return f.set('color_index', normalized);
  });
  
  // Layer 2: 16-Day Forecast Anomaly (per day)
  var forecastLayer = fc.map(function(f) {
    var val = ee.Number(f.get('forecast_diff'));
    var normalized = ee.Algorithms.If(val.gte(0),
      val.divide(redThreshold).multiply(3).add(3).min(6),
      val.divide(Math.abs(blueThreshold)).multiply(3).add(3).max(0)
    );
    return f.set('color_index', normalized);
  });
  
  // Layer 3: Combined Anomaly (per day)
  var combinedLayer = fc.map(function(f) {
    var val = ee.Number(f.get('combined_diff'));
    var normalized = ee.Algorithms.If(val.gte(0),
      val.divide(redThreshold).multiply(3).add(3).min(6),
      val.divide(Math.abs(blueThreshold)).multiply(3).add(3).max(0)
    );
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
  mainMap.addLayer(pastImage.clip(pakistanDistricts), visParams, 'Layer 1: Past 90-Day Anomaly (per day)', false);
  mainMap.addLayer(forecastImage.clip(pakistanDistricts), visParams, 'Layer 2: 16-Day Forecast Anomaly (per day)', false);
  mainMap.addLayer(combinedImage.clip(pakistanDistricts), visParams, 'Layer 3: Combined Anomaly (per day)', true);
  mainMap.addLayer(boundaries, {}, 'District Boundaries', true);
  
  // Add legend with user-defined thresholds
  addLegend(mainMap, parameter, redThreshold, blueThreshold);
  
  // Add click handler
  addClickHandler(mainMap, fc, parameter);
  
  // Add title label
  var titleLabel = ui.Label('Early Warning System: Weather Anomalies (Per Day)', {
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
// LEGEND (Updated with user-defined thresholds)
// ===========================================================================================
function addLegend(map, parameter, redThreshold, blueThreshold) {
  var legend = ui.Panel({
    style: {
      position: 'bottom-right',
      padding: '15px 20px',
      backgroundColor: 'white',
      border: '2px solid #333'
    }
  });

  var unit = parameter === 'precipitation' ? 'mm/day' : '°C/day';
  
  legend.add(ui.Label({
    value: '📊 Anomaly Legend (Per Day)',
    style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 12px 0'}
  }));

  var palette = ['#2166ac', '#67a9cf', '#a6dba0', '#4daf4a', '#fdae61', '#ef8a62', '#b2182b'];
  
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
  
  // Threshold labels
  var labelPanel = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
  labelPanel.add(ui.Label({
    value: '🔵 ≤ ' + blueThreshold + ' ' + unit, 
    style: {fontSize: '13px', margin: '8px 0 0 0', color: '#2166ac', fontWeight: 'bold'}
  }));
  labelPanel.add(ui.Label({value: '       ', style: {margin: '0'}}));
  labelPanel.add(ui.Label({
    value: '0 ' + unit, 
    style: {fontSize: '13px', margin: '8px 0 0 0', color: '#4daf4a', fontWeight: 'bold'}
  }));
  labelPanel.add(ui.Label({value: '       ', style: {margin: '0'}}));
  labelPanel.add(ui.Label({
    value: '🔴 ≥ +' + redThreshold + ' ' + unit, 
    style: {fontSize: '13px', margin: '8px 0 0 0', color: '#b2182b', fontWeight: 'bold'}
  }));
  legend.add(labelPanel);
  
  legend.add(ui.Label({
    value: 'Units: ' + unit + ' (anomaly per day)',
    style: {fontSize: '12px', margin: '8px 0 0 0', color: '#666', fontStyle: 'italic'}
  }));

  map.add(legend);
}


// ===========================================================================================
// CLICK HANDLER - Enhanced: Shows Calculated Value, Baseline, and Difference
// ===========================================================================================
function addClickHandler(map, fc, parameter) {
  map.onClick(function(coords) {
    showDistrictLoadingIndicator();
    
    var point = ee.Geometry.Point([coords.lon, coords.lat]);
    var clickedDistrict = fc.filterBounds(point).first();
    
    clickedDistrict.evaluate(function(feature, err) {
      if (err || !feature) {
        showDistrictInfo('Click on a District', 'Click on any district to see detailed anomaly information.');
        return;
      }
      
      var props = feature.properties;
      var unit = parameter === 'precipitation' ? 'mm/day' : '°C/day';
      
      // Helper to format values
      var fmt = function(val) {
        if (val === undefined || val === null || val === -999) return 'N/A';
        return val.toFixed(2);
      };
      
      var fmtDiff = function(val) {
        if (val === undefined || val === null || val === -999) return 'N/A';
        var prefix = val > 0 ? '+' : '';
        return prefix + val.toFixed(2);
      };
      
      var pastStatus = getAnomalyStatus(props.past_diff);
      var forecastStatus = getAnomalyStatus(props.forecast_diff);
      var combinedStatus = getAnomalyStatus(props.combined_diff);
      
      var content = 
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '📅 Past 90 Days (per day):\n' +
        '   Observed:     ' + fmt(props.past_value) + ' ' + unit + '\n' +
        '   Baseline:     ' + fmt(props.past_baseline) + ' ' + unit + '\n' +
        '   Difference:  ' + fmtDiff(props.past_diff) + ' ' + unit + ' ' + pastStatus + '\n\n' +
        '🔮 16-Day Forecast (per day):\n' +
        '   Forecasted:  ' + fmt(props.forecast_value) + ' ' + unit + '\n' +
        '   Baseline:     ' + fmt(props.forecast_baseline) + ' ' + unit + '\n' +
        '   Difference:  ' + fmtDiff(props.forecast_diff) + ' ' + unit + ' ' + forecastStatus + '\n\n' +
        '📊 Combined (per day average):\n' +
        '   Value:         ' + fmt(props.combined_value) + ' ' + unit + '\n' +
        '   Baseline:     ' + fmt(props.combined_baseline) + ' ' + unit + '\n' +
        '   Difference:  ' + fmtDiff(props.combined_diff) + ' ' + unit + ' ' + combinedStatus + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
      
      showDistrictInfo(props.district_name || 'District', content);
    });
  });
}

// Simple status based on whether value is above or below baseline
function getAnomalyStatus(value) {
  if (value === undefined || value === null) return '';
  if (value > 0) return '↑ Above';
  if (value < 0) return '↓ Below';
  return '— At Baseline';
}


// Map initialization happens in createSingleMapWithLayers() after user clicks Generate button
