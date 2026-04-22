
var pakistanDistricts = ee.FeatureCollection('projects/ee-mustafaasghar66/assets/gadm36_PAK_3');
var BASELINE_10YR = ee.FeatureCollection('projects/ee-mustafaasghar66/assets/Pakistan_Climate_2014_2024');
// 20-year baseline asset (placeholder - replace asset ID when available)
var BASELINE_20YR = null; // Will be set to: ee.FeatureCollection('projects/ee-mustafaasghar66/assets/Pakistan_Climate_2004_2024')

// --- DYNAMIC CONFIGURATION (updated by UI controls) ---
var today = ee.Date(Date.now()); // overridden by replay date picker
var PAST_DAYS = 90;  // updated by past-days dropdown
var FORECAST_DAYS = 16; // updated by forecast dropdown
var dataFC = BASELINE_10YR; // updated by baseline toggle

// Global UI state
var loadingLabel = null;
var loadingPanel = null;
var districtInfoPanel = null;
var districtInfoTitle = null;
var panelDistrictWidgets = [];
var keepRotating = true;
var districtLoadingSymbol = null;
var mainMap = null;
var currentRedThreshold = 5;
var currentBlueThreshold = -5;
var lastComputedFC = null; // stores result FeatureCollection for CSV export
var currentParameter = 'precipitation';

print('Customizable Early Warning System — 3rd Iteration');
print('Supports: dynamic windows, baseline toggle, historical replay, CSV export');


// ===========================================================================================
// UI SETUP
// ===========================================================================================
var panel = ui.Panel({ style: { width: '390px', padding: '20px' } });

// Title
panel.add(ui.Label({
  value: 'Early Warning System',
  style: { fontSize: '20px', fontWeight: 'bold', margin: '0 0 3px 0', color: '#2c3e50' }
}));
panel.add(ui.Label({
  value: 'District-Level Weather Monitoring in Pakistan',
  style: { fontSize: '13px', margin: '0 0 8px 0', color: '#7f8c8d', fontStyle: 'italic' }
}));
panel.add(ui.Label({
  value: 'A flexible tool to detect unusual weather patterns for disaster preparedness, smart agriculture, and flood prediction.\n\n' +
    'Customize your analysis:\n' +
    '• Choose how many past and forecast days to look at\n' +
    '• Switch between different historical climate baselines\n' +
    '• Use the Historical Replay to see data from any date in the past\n\n' +
    'Explore the map:\n' +
    '• Toggle between 3 map layers (Past, Forecast, Combined)\n' +
    '• Click any district to see detailed anomaly statistics',
  style: { fontSize: '12px', margin: '0 0 15px 0', color: '#555', whiteSpace: 'pre-line' }
}));

panel.add(ui.Label('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  { fontSize: '10px', color: '#ccc', margin: '0 0 12px 0' }));

// ── WEATHER PARAMETER ──────────────────────────────────────────────────────────
panel.add(ui.Label('Weather Parameter:', { fontWeight: 'bold', fontSize: '13px', margin: '0 0 3px 0' }));
var parameterSelect = ui.Select({
  items: [
    { label: 'Precipitation (mm)', value: 'precipitation' },
    { label: 'Temperature (°C)', value: 'temperature' }
  ],
  value: 'precipitation',
  style: { margin: '0 0 12px 0', width: '350px' },
  onChange: function (value) {
    currentParameter = value;
    updateThresholdDropdowns(value);
  }
});
panel.add(parameterSelect);

// ── PAST OBSERVATION WINDOW ────────────────────────────────────────────────────
panel.add(ui.Label('Past Observation Window:', { fontWeight: 'bold', fontSize: '13px', margin: '0 0 3px 0' }));
panel.add(ui.Label('Any number of days — partial months are pro-rated automatically.',
  { fontSize: '11px', color: '#888', fontStyle: 'italic', margin: '0 0 3px 0' }));
var pastDaysItems = [];
for (var d = 5; d <= 180; d += 5) {
  var lbl = d + ' days';
  if (d === 90) lbl += ' — default';
  pastDaysItems.push({ label: lbl, value: d });
}
var pastDaysSelect = ui.Select({
  items: pastDaysItems,
  value: 90,
  style: { margin: '0 0 12px 0', width: '350px' },
  onChange: function (value) {
    PAST_DAYS = value;
  }
});
panel.add(pastDaysSelect);

// ── FORECAST WINDOW ────────────────────────────────────────────────────────────
panel.add(ui.Label('Forecast Window:', { fontWeight: 'bold', fontSize: '13px', margin: '0 0 3px 0' }));
var forecastDaysSelect = ui.Select({
  items: [
    { label: '1 day', value: 1 },
    { label: '3 days', value: 3 },
    { label: '5 days', value: 5 },
    { label: '7 days', value: 7 },
    { label: '10 days', value: 10 },
    { label: '16 days — default', value: 16 }
  ],
  value: 16,
  style: { margin: '0 0 12px 0', width: '350px' },
  onChange: function (value) {
    FORECAST_DAYS = value;
  }
});
panel.add(forecastDaysSelect);

// ── HISTORICAL BASELINE PERIOD ─────────────────────────────────────────────────
panel.add(ui.Label('Historical Baseline Period:', { fontWeight: 'bold', fontSize: '13px', margin: '0 0 3px 0' }));
var baselineSelect = ui.Select({
  items: [
    { label: '10-Year Baseline (2014–2024) — default', value: '10yr' },
    { label: '20-Year Baseline (2004–2024) — coming soon', value: '20yr' }
  ],
  value: '10yr',
  style: { margin: '0 0 3px 0', width: '350px' },
  onChange: function (value) {
    if (value === '20yr') {
      baselineNote.setValue('⚠️ 20-year baseline asset not yet available. Falling back to 10-year baseline.');
      dataFC = BASELINE_10YR;
    } else {
      baselineNote.setValue('');
      dataFC = BASELINE_10YR;
    }
  }
});
panel.add(baselineSelect);
var baselineNote = ui.Label('', { fontSize: '11px', color: '#c0392b', margin: '0 0 12px 0' });
panel.add(baselineNote);

// ── ANOMALY COLOR THRESHOLDS ───────────────────────────────────────────────────
var thresholdsTitle = ui.Label('Anomaly Color Thresholds:',
  { fontWeight: 'bold', fontSize: '13px', margin: '0 0 3px 0' });
panel.add(thresholdsTitle);
panel.add(ui.Label('Districts beyond these thresholds show maximum red/blue.',
  { fontSize: '11px', color: '#888', fontStyle: 'italic', margin: '0 0 5px 0' }));

var redThresholdSelect = ui.Select({
  items: [
    { label: '+1 mm/day', value: 1 }, { label: '+2 mm/day', value: 2 },
    { label: '+5 mm/day', value: 5 }, { label: '+10 mm/day', value: 10 },
    { label: '+15 mm/day', value: 15 }, { label: '+20 mm/day', value: 20 }
  ],
  value: 5,
  style: { margin: '0 0 5px 0', width: '350px' },
  onChange: function (value) { currentRedThreshold = value; }
});
panel.add(ui.Label('🔴 Above Baseline Threshold:',
  { fontSize: '12px', color: '#b2182b', fontWeight: 'bold', margin: '0 0 2px 0' }));
panel.add(redThresholdSelect);

var blueThresholdSelect = ui.Select({
  items: [
    { label: '-1 mm/day', value: -1 }, { label: '-2 mm/day', value: -2 },
    { label: '-5 mm/day', value: -5 }, { label: '-10 mm/day', value: -10 },
    { label: '-15 mm/day', value: -15 }, { label: '-20 mm/day', value: -20 }
  ],
  value: -5,
  style: { margin: '0 0 12px 0', width: '350px' },
  onChange: function (value) { currentBlueThreshold = value; }
});
panel.add(ui.Label('🔵 Below Baseline Threshold:',
  { fontSize: '12px', color: '#2166ac', fontWeight: 'bold', margin: '0 0 2px 0' }));
panel.add(blueThresholdSelect);

function updateThresholdDropdowns(parameter) {
  if (parameter === 'precipitation') {
    thresholdsTitle.setValue('Anomaly Color Thresholds (mm/day):');
    redThresholdSelect.items().reset([
      { label: '+1 mm/day', value: 1 }, { label: '+2 mm/day', value: 2 },
      { label: '+5 mm/day', value: 5 }, { label: '+10 mm/day', value: 10 },
      { label: '+15 mm/day', value: 15 }, { label: '+20 mm/day', value: 20 }
    ]);
    redThresholdSelect.setValue(5); currentRedThreshold = 5;
    blueThresholdSelect.items().reset([
      { label: '-1 mm/day', value: -1 }, { label: '-2 mm/day', value: -2 },
      { label: '-5 mm/day', value: -5 }, { label: '-10 mm/day', value: -10 },
      { label: '-15 mm/day', value: -15 }, { label: '-20 mm/day', value: -20 }
    ]);
    blueThresholdSelect.setValue(-5); currentBlueThreshold = -5;
  } else {
    thresholdsTitle.setValue('Anomaly Color Thresholds (°C):');
    redThresholdSelect.items().reset([
      { label: '+1 °C', value: 1 }, { label: '+2 °C', value: 2 },
      { label: '+5 °C', value: 5 }, { label: '+10 °C', value: 10 },
      { label: '+20 °C', value: 20 }, { label: '+40 °C', value: 40 }
    ]);
    redThresholdSelect.setValue(2); currentRedThreshold = 2;
    blueThresholdSelect.items().reset([
      { label: '-1 °C', value: -1 }, { label: '-2 °C', value: -2 },
      { label: '-5 °C', value: -5 }, { label: '-10 °C', value: -10 },
      { label: '-20 °C', value: -20 }, { label: '-40 °C', value: -40 }
    ]);
    blueThresholdSelect.setValue(-2); currentBlueThreshold = -2;
  }
}

// ── HISTORICAL REPLAY DATE PICKER ──────────────────────────────────────────────
panel.add(ui.Label('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  { fontSize: '10px', color: '#ccc', margin: '5px 0 10px 0' }));
panel.add(ui.Label(' Historical Replay:',
  { fontWeight: 'bold', fontSize: '13px', margin: '0 0 3px 0', color: '#111111ff' }));
panel.add(ui.Label(
  'Select a past date to replay the system. Leave as-is to use today\'s date.',
  { fontSize: '11px', color: '#888', fontStyle: 'italic', margin: '0 0 8px 0' }));

// --- Year dropdown ---
var currentYear = new Date().getFullYear();
var yearItems = [];
for (var y = 2015; y <= currentYear; y++) {
  yearItems.push({ label: '' + y, value: y });
}
var replayYearSelect = ui.Select({
  items: yearItems,
  placeholder: 'Year',
  style: { width: '110px', margin: '0 5px 5px 0' }
});

// --- Month dropdown ---
var monthLabels = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
var monthItems = [];
for (var m = 0; m < 12; m++) {
  monthItems.push({ label: monthLabels[m], value: m + 1 });
}
var replayMonthSelect = ui.Select({
  items: monthItems,
  placeholder: 'Month',
  style: { width: '130px', margin: '0 5px 5px 0' }
});

// --- Day dropdown (updates dynamically based on month/year) ---
var replayDaySelect = ui.Select({
  items: [],
  placeholder: 'Day',
  style: { width: '80px', margin: '0 0 5px 0' }
});

// Helper: rebuild day dropdown when month or year changes
function updateDayDropdown() {
  var yr = replayYearSelect.getValue();
  var mo = replayMonthSelect.getValue();
  if (!yr || !mo) return;
  var daysInMonth = new Date(yr, mo, 0).getDate(); // JS trick: day 0 of next month = last day
  var dayItems = [];
  for (var dd = 1; dd <= daysInMonth; dd++) {
    dayItems.push({ label: '' + dd, value: dd });
  }
  replayDaySelect.items().reset(dayItems);
  // If previously selected day exceeds new month length, reset
  var currentDay = replayDaySelect.getValue();
  if (currentDay && currentDay > daysInMonth) {
    replayDaySelect.setValue(null);
  }
}
replayYearSelect.onChange(function () { updateDayDropdown(); });
replayMonthSelect.onChange(function () { updateDayDropdown(); });

// Layout: Year, Month, Day in a horizontal row
var dateRow = ui.Panel({
  widgets: [replayYearSelect, replayMonthSelect, replayDaySelect],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: { margin: '0 0 5px 0' }
});
panel.add(dateRow);

var replayModeLabel = ui.Label('Mode: Using today\'s date (live mode)',
  { fontSize: '11px', color: '#27ae60', margin: '0 0 8px 0', fontWeight: 'bold' });
panel.add(replayModeLabel);

var useReplayDateBtn = ui.Button({
  label: 'Use Selected Replay Date',
  onClick: function () {
    var yr = replayYearSelect.getValue();
    var mo = replayMonthSelect.getValue();
    var dy = replayDaySelect.getValue();
    if (yr && mo && dy) {
      today = ee.Date.fromYMD(yr, mo, dy);
      var moName = monthLabels[mo - 1];
      replayModeLabel.setValue('Mode: ⏪ Replaying from ' + moName + ' ' + dy + ', ' + yr);
      replayModeLabel.style().set('color', '#c0392b');
    } else {
      replayModeLabel.setValue('⚠️ Please select Year, Month, and Day');
      replayModeLabel.style().set('color', '#e67e22');
    }
  },
  style: { margin: '0 0 3px 0', width: '350px' }
});
panel.add(useReplayDateBtn);

var resetTodayBtn = ui.Button({
  label: 'Reset to Today\'s Date',
  onClick: function () {
    today = ee.Date(Date.now());
    replayYearSelect.setValue(null, false);
    replayMonthSelect.setValue(null, false);
    replayDaySelect.setValue(null, false);
    replayModeLabel.setValue('Mode: Using today\'s date (live mode)');
    replayModeLabel.style().set('color', '#27ae60');
  },
  style: { margin: '0 0 12px 0', width: '350px' }
});
panel.add(resetTodayBtn);

panel.add(ui.Label('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  { fontSize: '10px', color: '#ccc', margin: '0 0 10px 0' }));

// ── GENERATE BUTTON ────────────────────────────────────────────────────────────
var analyzeButton = ui.Button({
  label: '▶ Generate Early Warning Maps',
  onClick: function () {
    var parameter = parameterSelect.getValue();
    if (parameter) {
      clearDistrictPanel();
      if (mainMap) { mainMap.layers().reset(); }
      updateVisualizationWithBatching(parameter);
    }
  },
  style: {
    margin: '0 0 5px 0', width: '350px',
    fontWeight: 'bold', fontSize: '15px',
    backgroundColor: '#2c3e50', color: '#0c0c0cff', padding: '1px'
  }
});
panel.add(analyzeButton);

// ── CSV EXPORT BUTTON ──────────────────────────────────────────────────────────
var exportButton = ui.Button({
  label: '💾 Export Results as CSV',
  onClick: function () {
    if (!lastComputedFC) {
      panel.add(ui.Label('⚠️ Generate the map first before exporting.',
        { fontSize: '12px', color: '#c0392b', margin: '5px 0' }));
      return;
    }
    Export.table.toDrive({
      collection: lastComputedFC,
      description: 'EWS_District_Anomalies',
      fileFormat: 'CSV',
      selectors: [
        'district_name',
        'past_value', 'past_baseline', 'past_diff',
        'forecast_value', 'forecast_baseline', 'forecast_diff',
        'combined_value', 'combined_baseline', 'combined_diff'
      ]
    });
    panel.add(ui.Label('✅ CSV export task submitted! Check the GEE Tasks tab.',
      { fontSize: '12px', color: '#27ae60', margin: '5px 0', fontWeight: 'bold' }));
  },
  style: { margin: '0 0 10px 0', width: '350px', color: '#27ae60' }
});
panel.add(exportButton);

// Data source note
panel.add(ui.Label(
  'Data: ECMWF ERA5-Land (historical) & NOAA GFS 0.25° (forecast)\n' +
  'Baseline: 10-year monthly averages (2014–2024)',
  { fontSize: '11px', color: '#aaa', fontStyle: 'italic', whiteSpace: 'pre-line', margin: '5px 0 0 0' }
));

ui.root.insert(0, panel);
Map.setCenter(69.3451, 30.3753, 6);


// ===========================================================================================
// UI HELPER FUNCTIONS
// ===========================================================================================
function showLoadingIndicator(message) {
  hideLoadingIndicator();
  loadingPanel = ui.Panel({
    style: {
      backgroundColor: '#e8f4fd', border: '2px solid #3498db',
      margin: '15px 0', padding: '15px'
    }
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

  var syms = ['🌍', '🌎', '🌏']; var si = 0;
  var rot = function () {
    if (loadingSymbol && loadingPanel) {
      si = (si + 1) % syms.length;
      loadingSymbol.setValue(syms[si]);
      ui.util.setTimeout(rot, 400);
    }
  };
  ui.util.setTimeout(rot, 400);
}

function updateLoadingIndicator(msg) { if (loadingLabel) loadingLabel.setValue(msg); }

function hideLoadingIndicator() {
  if (loadingPanel) { panel.remove(loadingPanel); loadingPanel = null; loadingLabel = null; }
}

function showDistrictLoadingIndicator(districtName) {
  clearDistrictPanel();
  keepRotating = true;
  districtInfoPanel = ui.Panel({
    style: {
      backgroundColor: '#e8f4fd', border: '2px solid #3498db',
      margin: '15px 0', padding: '15px'
    }
  });
  districtInfoTitle = ui.Label({
    value: '⏳ Loading District Data...',
    style: { fontSize: '15px', fontWeight: 'bold', color: '#2980b9', margin: '0 0 10px 0' }
  });
  var msg = districtName ?
    'Loading data for ' + districtName + ' district...' :
    'Loading district data...';
  var loadingMessage = ui.Label({ value: msg, style: { fontSize: '13px', color: '#34495e', fontStyle: 'italic' } });
  districtLoadingSymbol = ui.Label({
    value: '🌍', style: { fontSize: '24px', color: '#3498db', textAlign: 'center', fontWeight: 'bold' }
  });
  districtInfoPanel.add(districtInfoTitle).add(loadingMessage).add(districtLoadingSymbol);
  panel.add(districtInfoPanel);
  panelDistrictWidgets.push(districtInfoPanel);

  var syms = ['🌍', '🌎', '🌏']; var si = 0;
  var rot = function () {
    if (districtLoadingSymbol && districtInfoPanel && keepRotating) {
      si = (si + 1) % syms.length;
      districtLoadingSymbol.setValue(syms[si]);
      ui.util.setTimeout(rot, 400);
    }
  };
  ui.util.setTimeout(rot, 400);
}

function showDistrictInfo(title, content) {
  keepRotating = false;
  clearDistrictPanel();
  districtInfoPanel = ui.Panel({
    style: {
      backgroundColor: '#f0f9ff', border: '2px solid #3498db',
      margin: '15px 0', padding: '15px'
    }
  });
  districtInfoTitle = ui.Label({
    value: '📍 ' + title,
    style: { fontSize: '15px', fontWeight: 'bold', color: '#2980b9', margin: '0 0 10px 0' }
  });
  var infoLabel = ui.Label(content, { whiteSpace: 'pre-line', fontSize: '13px', color: '#34495e' });
  districtInfoPanel.add(districtInfoTitle).add(infoLabel);
  panel.add(districtInfoPanel);
  panelDistrictWidgets.push(districtInfoPanel);
}

function clearDistrictPanel() {
  panelDistrictWidgets.forEach(function (w) { panel.remove(w); });
  panelDistrictWidgets = [];
  districtLoadingSymbol = null;
}

function getMonthName(date) {
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return ee.List(months).get(date.get('month').subtract(1));
}


// ===========================================================================================
// CORE CALCULATION LOGIC
// ===========================================================================================
function calculateCombinedAnomaly(district, parameter, gfsData, historicalData, era5List,
  pastDays, forecastDays, referenceDate, forecastEnd) {
  var districtName = ee.Feature(district).get('NAME_3');
  var districtGeom = ee.Feature(district).geometry();
  var histData = historicalData.filter(ee.Filter.eq('district_name', districtName)).first();

  return ee.Algorithms.If(ee.Algorithms.IsEqual(histData, null),
    ee.Feature(district).set({
      'combined_diff': -999, 'forecast_diff': -999, 'past_diff': -999,
      'forecast_value': -999, 'forecast_baseline': -999,
      'past_value': -999, 'past_baseline': -999,
      'combined_value': -999, 'combined_baseline': -999,
      'debug': 'no_historical'
    }),
    (function () {

      // ── PART 1: FORECAST ─────────────────────────────────────────────────────
      var maxForecastHour = forecastDays * 24;
      var latestRun = gfsData.sort('creation_time', false).first().get('creation_time');
      var latestForecast = gfsData.filter(ee.Filter.eq('creation_time', latestRun));

      var forecastValueTotal;
      if (parameter === 'precipitation') {
        var gfsBand = 'precipitation_rate';
        var hourSeq = ee.List.sequence(1, Math.min(forecastDays * 24, 120));
        var hourlyValues = hourSeq.map(function (hour) {
          var img = latestForecast.filter(ee.Filter.eq('forecast_hours', hour)).first();
          return ee.Algorithms.If(img, (function () {
            var eeImg = ee.Image(img);
            var hasBand = eeImg.bandNames().contains(gfsBand);
            return ee.Algorithms.If(hasBand, (function() {
              var rate = eeImg.select(gfsBand).reduceRegion({
                reducer: ee.Reducer.mean(), geometry: districtGeom, scale: 27830, bestEffort: true
              }).get(gfsBand);
              return ee.Number(ee.Algorithms.If(rate, rate, 0)).multiply(3600);
            })(), 0);
          })(), 0);
        });
        var threeHourStart = Math.min(123, maxForecastHour);
        var threeValues = ee.List.sequence(threeHourStart, maxForecastHour, 3).map(function (hour) {
          var img = latestForecast.filter(ee.Filter.eq('forecast_hours', hour)).first();
          return ee.Algorithms.If(img, (function () {
            var eeImg = ee.Image(img);
            var hasBand = eeImg.bandNames().contains(gfsBand);
            return ee.Algorithms.If(hasBand, (function() {
              var rate = eeImg.select(gfsBand).reduceRegion({
                reducer: ee.Reducer.mean(), geometry: districtGeom, scale: 27830, bestEffort: true
              }).get(gfsBand);
              return ee.Number(ee.Algorithms.If(rate, rate, 0)).multiply(10800);
            })(), 0);
          })(), 0);
        });
        var raw = ee.Number(hourlyValues.reduce(ee.Reducer.sum()))
          .add(ee.Number(threeValues.reduce(ee.Reducer.sum())));
        forecastValueTotal = ee.Number(ee.Algorithms.If(raw, raw, 0));
      } else {
        var meanImg = latestForecast.select('temperature_2m_above_ground').mean();
        var val = meanImg.reduceRegion({
          reducer: ee.Reducer.mean(), geometry: districtGeom, scale: 27830, bestEffort: true
        }).get('temperature_2m_above_ground');
        forecastValueTotal = ee.Number(ee.Algorithms.If(val, val, 0));
      }

      // Forecast Historical Baseline
      var startDay = referenceDate.get('day');
      var startMonth = referenceDate.get('month');
      var endMonth = forecastEnd.get('month');
      var histForecastValueTotal;

      if (parameter === 'precipitation') {
        var rcols = ee.List(['rainfall_jan', 'rainfall_feb', 'rainfall_mar', 'rainfall_apr',
          'rainfall_may', 'rainfall_jun', 'rainfall_jul', 'rainfall_aug',
          'rainfall_sep', 'rainfall_oct', 'rainfall_nov', 'rainfall_dec']);
        histForecastValueTotal = ee.Number(ee.Algorithms.If(startMonth.neq(endMonth),
          (function () {
            var daysList = ee.List([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
            var d1Total = ee.Number(daysList.get(startMonth.subtract(1)));
            var d1Current = d1Total.subtract(startDay).add(1);
            var v1 = ee.Number(histData.get(rcols.get(startMonth.subtract(1))));
            var p1 = v1.divide(d1Total).multiply(d1Current);
            var d2Current = ee.Number(forecastDays).subtract(d1Current);
            var d2Total = ee.Number(daysList.get(endMonth.subtract(1)));
            var v2 = ee.Number(histData.get(rcols.get(endMonth.subtract(1))));
            var p2 = v2.divide(d2Total).multiply(d2Current);
            return p1.add(p2);
          })(),
          (function () {
            var v = ee.Number(histData.get(rcols.get(startMonth.subtract(1))));
            var is31 = startMonth.eq(1).or(startMonth.eq(3)).or(startMonth.eq(5))
              .or(startMonth.eq(7)).or(startMonth.eq(8)).or(startMonth.eq(10))
              .or(startMonth.eq(12));
            var dInMonth = ee.Number(ee.Algorithms.If(is31, 31, ee.Algorithms.If(startMonth.eq(2), 28, 30)));
            return v.divide(dInMonth).multiply(forecastDays);
          })()
        ));
      } else {
        var tcols = ee.List(['temperature_jan', 'temperature_feb', 'temperature_mar',
          'temperature_apr', 'temperature_may', 'temperature_jun',
          'temperature_jul', 'temperature_aug', 'temperature_sep',
          'temperature_oct', 'temperature_nov', 'temperature_dec']);
        histForecastValueTotal = ee.Number(ee.Algorithms.If(startMonth.neq(endMonth),
          (function () {
            var d1Current = ee.Number(30).subtract(startDay).add(1);
            var v1 = ee.Number(histData.get(tcols.get(startMonth.subtract(1))));
            var d2Current = ee.Number(forecastDays).subtract(d1Current);
            var v2 = ee.Number(histData.get(tcols.get(endMonth.subtract(1))));
            return (v1.multiply(d1Current).add(v2.multiply(d2Current))).divide(forecastDays);
          })(),
          ee.Number(histData.get(tcols.get(startMonth.subtract(1))))
        ));
      }

      // Standardize forecast values
      var forecastValueStd, forecastBaselineStd, forecastDiffStd;
      if (parameter === 'precipitation') {
        forecastValueStd = forecastValueTotal.divide(forecastDays);
        forecastBaselineStd = histForecastValueTotal.divide(forecastDays);
        forecastDiffStd = forecastValueStd.subtract(forecastBaselineStd);
      } else {
        forecastValueStd = forecastValueTotal;
        forecastBaselineStd = histForecastValueTotal;
        forecastDiffStd = forecastValueStd.subtract(forecastBaselineStd);
      }

      // ── PART 2: PAST (ERA5) — pro-rated partial months ─────────────────────────
      // Walk backward from referenceDate by pastDays to find pastStart.
      // We must fetch from the 1st of that month because ERA5 system:time_start is always the 1st.
      var pastStart = referenceDate.advance(ee.Number(pastDays).multiply(-1), 'day');
      var pastMonthStart = ee.Date.fromYMD(pastStart.get('year'), pastStart.get('month'), 1);
      
      var daysInMonthList = ee.List([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
      var monthNames = ee.List(['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                                'jul', 'aug', 'sep', 'oct', 'nov', 'dec']);
      var band = parameter === 'precipitation' ? 'total_precipitation_sum' : 'temperature_2m';
      var colPrefix = parameter === 'precipitation' ? 'rainfall_' : 'temperature_';

      // Get all ERA5 monthly images that overlap the past window
      var era5Past = era5List
        .filterDate(pastMonthStart, referenceDate.advance(1, 'month'))
        .sort('system:time_start', true);
      var era5PastArray = era5Past.toList(era5Past.size());

      // For each monthly image, compute the fraction of the month that
      // falls inside [pastStart, referenceDate] and pro-rate values.
      var proRatedVals = era5PastArray.map(function (img) {
        var eraImg = ee.Image(img);
        var eraDate = ee.Date(eraImg.get('system:time_start'));
        var monthNum = eraDate.get('month');  // 1-12
        var totalDaysInMonth = ee.Number(daysInMonthList.get(monthNum.subtract(1)));
        var monthStart = ee.Date.fromYMD(eraDate.get('year'), monthNum, 1);
        var monthEnd = monthStart.advance(1, 'month');

        // Clip the month boundaries to the [pastStart, referenceDate] window
        var windowStart = ee.Date(ee.Algorithms.If(
          monthStart.millis().gt(pastStart.millis()), monthStart, pastStart));
        var windowEnd = ee.Date(ee.Algorithms.If(
          monthEnd.millis().lt(referenceDate.millis()), monthEnd, referenceDate));
        var coveredDays = windowEnd.difference(windowStart, 'day').max(0);
        var fraction = coveredDays.divide(totalDaysInMonth);

        // Observed ERA5 value for this month
        var obsVal = eraImg.select(band).reduceRegion({
          reducer: ee.Reducer.mean(), geometry: districtGeom, scale: 11132, bestEffort: true
        }).get(band);
        var obsNum = ee.Number(ee.Algorithms.If(obsVal, obsVal, 0));
        if (parameter === 'precipitation') {
          obsNum = obsNum.multiply(1000);  // m → mm
        } else {
          obsNum = obsNum.subtract(273.15); // K → °C
        }

        // Baseline value from the historical asset for this month
        var mColName = ee.String(colPrefix).cat(ee.String(monthNames.get(monthNum.subtract(1))));
        var baseVal = ee.Number(histData.get(mColName));

        // Pro-rate: multiply full-month value by fraction of days covered
        var obsProRated = obsNum.multiply(fraction);
        var baseProRated = baseVal.multiply(fraction);

        return ee.List([obsProRated, baseProRated, coveredDays]);
      });

      // Aggregate across all months
      var pastObsSum = proRatedVals.iterate(function (triple, acc) {
        return ee.Number(acc).add(ee.Number(ee.List(triple).get(0)));
      }, ee.Number(0));
      var pastBaseSum = proRatedVals.iterate(function (triple, acc) {
        return ee.Number(acc).add(ee.Number(ee.List(triple).get(1)));
      }, ee.Number(0));
      var pastCoveredDays = proRatedVals.iterate(function (triple, acc) {
        return ee.Number(acc).add(ee.Number(ee.List(triple).get(2)));
      }, ee.Number(0));
      pastObsSum = ee.Number(pastObsSum);
      pastBaseSum = ee.Number(pastBaseSum);
      pastCoveredDays = ee.Number(pastCoveredDays).max(1); // avoid divide-by-0

      // Standardize: per-day for precipitation, day-weighted average for temperature
      var pastValueStd, pastBaselineStd, pastDiffStd;
      if (parameter === 'precipitation') {
        pastValueStd = pastObsSum.divide(pastCoveredDays);
        pastBaselineStd = pastBaseSum.divide(pastCoveredDays);
        pastDiffStd = pastValueStd.subtract(pastBaselineStd);
      } else {
        pastValueStd = pastObsSum.divide(pastCoveredDays);
        pastBaselineStd = pastBaseSum.divide(pastCoveredDays);
        pastDiffStd = pastValueStd.subtract(pastBaselineStd);
      }

      // ── PART 3: COMBINE (weighted average) ────────────────────────────────────
      var totalDays = pastDays + forecastDays;
      var combinedValueStd = pastValueStd.multiply(pastDays).add(forecastValueStd.multiply(forecastDays)).divide(totalDays);
      var combinedBaselineStd = pastBaselineStd.multiply(pastDays).add(forecastBaselineStd.multiply(forecastDays)).divide(totalDays);
      var combinedDiffStd = combinedValueStd.subtract(combinedBaselineStd);

      return ee.Feature(district).set({
        'combined_diff': combinedDiffStd,
        'forecast_diff': forecastDiffStd,
        'past_diff': pastDiffStd,
        'forecast_value': forecastValueStd,
        'forecast_baseline': forecastBaselineStd,
        'past_value': pastValueStd,
        'past_baseline': pastBaselineStd,
        'combined_value': combinedValueStd,
        'combined_baseline': combinedBaselineStd,
        'district_name': districtName
      });
    })()
  );
}


// ===========================================================================================
// BATCH PROCESSING
// ===========================================================================================
function updateVisualizationWithBatching(parameter) {
  showLoadingIndicator('Initializing Early Warning System...');

  // Snapshot dynamic values at the time Generate is clicked
  var refDate = today;
  var fcastDays = FORECAST_DAYS;
  var pastDays = PAST_DAYS;
  var fcastEnd = refDate.advance(fcastDays, 'day');
  var historicalFC = dataFC;

  // ERA5: pull images covering the past window (with extra month margin)
  var era5Dataset = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
    .select(['total_precipitation_sum', 'temperature_2m'])
    .filterDate('2010-01-01', refDate);
  var era5Sorted = era5Dataset.sort('system:time_start', false);

  // GFS: filter to latest run and selected forecast horizon
  var gfsDataset = ee.ImageCollection('NOAA/GFS0P25')
    .filterDate(refDate.advance(-1, 'day'), refDate.advance(1, 'day'))
    .filter(ee.Filter.lte('forecast_hours', fcastDays * 24))
    .filter(ee.Filter.gte('forecast_hours', 0));

  pakistanDistricts.toList(pakistanDistricts.size()).evaluate(function (districtsList) {
    var BATCH_SIZE = 5;
    var processed = [];
    var total = districtsList.length;

    function processBatch(startIndex) {
      if (startIndex >= total) {
        finalizeVisualization(processed, parameter, pastDays, fcastDays);
        return;
      }
      updateLoadingIndicator('Please wait while data is loading — do not click Generate again...');
      var end = Math.min(startIndex + BATCH_SIZE, total);
      var batchCol = ee.FeatureCollection(districtsList.slice(startIndex, end));
      var result = batchCol.map(function (d) {
        return calculateCombinedAnomaly(
          d, parameter, gfsDataset, historicalFC, era5Sorted,
          pastDays, fcastDays, refDate, fcastEnd
        );
      });
      result.evaluate(function (batch, err) {
        if (err) {
          print('❌ Error during batch calculation:', err);
        }
        if (!err && batch && batch.features) {
          processed = processed.concat(batch.features);
        }
        ui.util.setTimeout(function () { processBatch(end); }, 100);
      });
    }
    processBatch(0);
  });
}


// ===========================================================================================
// VISUALIZATION
// ===========================================================================================
function finalizeVisualization(features, parameter, pastDays, forecastDays) {
  updateLoadingIndicator('Creating map layers...');
  var valid = features.filter(function (f) {
    return f.properties.combined_diff !== -999 &&
      f.properties.combined_diff !== undefined &&
      f.properties.combined_diff !== null &&
      f.properties.forecast_diff !== -999 &&
      f.properties.past_diff !== -999;
  });
  if (valid.length === 0) { print('No valid data found.'); hideLoadingIndicator(); return; }

  var fc = ee.FeatureCollection(valid);
  lastComputedFC = fc; // store for CSV export
  createSingleMapWithLayers(fc, currentRedThreshold, currentBlueThreshold, parameter, pastDays, forecastDays);
  hideLoadingIndicator();
}


function createSingleMapWithLayers(fc, redThreshold, blueThreshold, parameter, pastDays, forecastDays) {
  mainMap = ui.Map();
  mainMap.setCenter(69.3451, 30.3753, 6);
  mainMap.setOptions('ROADMAP');

  var palette = ['#2166ac', '#67a9cf', '#a6dba0', '#4daf4a', '#fdae61', '#ef8a62', '#b2182b'];

  function makeLayer(diffProp) {
    return fc.map(function (f) {
      var val = ee.Number(f.get(diffProp));
      var normalized = ee.Algorithms.If(val.gte(0),
        val.divide(redThreshold).multiply(3).add(3).min(6),
        val.divide(Math.abs(blueThreshold)).multiply(3).add(3).max(0)
      );
      return f.set('color_index', normalized);
    });
  }

  var pastLayer = makeLayer('past_diff');
  var forecastLayer = makeLayer('forecast_diff');
  var combinedLayer = makeLayer('combined_diff');

  var pastImage = pastLayer.reduceToImage(['color_index'], ee.Reducer.first());
  var forecastImage = forecastLayer.reduceToImage(['color_index'], ee.Reducer.first());
  var combinedImage = combinedLayer.reduceToImage(['color_index'], ee.Reducer.first());
  var visParams = { min: 0, max: 6, palette: palette };
  var boundaries = pakistanDistricts.style({ color: '000000', width: 1, fillColor: '00000000' });

  var pastLabel = 'Layer 1: Past ' + pastDays + '-Day Anomaly';
  var forecastLabel = 'Layer 2: ' + forecastDays + '-Day Forecast Anomaly';
  var combinedLabel = 'Layer 3: Combined Anomaly (Weighted Avg)';

  mainMap.addLayer(pastImage.clip(pakistanDistricts), visParams, pastLabel, false);
  mainMap.addLayer(forecastImage.clip(pakistanDistricts), visParams, forecastLabel, false);
  mainMap.addLayer(combinedImage.clip(pakistanDistricts), visParams, combinedLabel, true);
  mainMap.addLayer(boundaries, {}, 'District Boundaries', true);

  addLegend(mainMap, parameter, redThreshold, blueThreshold);
  addClickHandler(mainMap, fc, parameter, pastDays, forecastDays);

  mainMap.add(ui.Label('🌍 Customizable Early Warning System — District Anomalies', {
    position: 'top-center', fontSize: '16px', fontWeight: 'bold',
    backgroundColor: 'white', padding: '8px 15px', border: '1px solid #ccc'
  }));
  mainMap.add(ui.Label('💡 Toggle layers top-right  |  Click any district for details', {
    position: 'bottom-left', fontSize: '12px',
    backgroundColor: 'rgba(255,255,255,0.9)', padding: '5px 10px', color: '#666'
  }));

  ui.root.clear();
  ui.root.add(panel);
  ui.root.add(mainMap);
}


// ===========================================================================================
// LEGEND
// ===========================================================================================
function addLegend(map, parameter, redThreshold, blueThreshold) {
  var legend = ui.Panel({
    style: {
      position: 'bottom-right', padding: '15px 20px',
      backgroundColor: 'white', border: '2px solid #333'
    }
  });
  var unit = parameter === 'precipitation' ? 'mm/day' : '°C';
  var legendTitle = parameter === 'precipitation' ? '📊 Anomaly Legend (Per Day)' : '📊 Anomaly Legend';
  legend.add(ui.Label({ value: legendTitle, style: { fontWeight: 'bold', fontSize: '16px', margin: '0 0 10px 0' } }));

  var palette = ['#2166ac', '#67a9cf', '#a6dba0', '#4daf4a', '#fdae61', '#ef8a62', '#b2182b'];
  var colorBar = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal') });
  palette.forEach(function (color) {
    colorBar.add(ui.Label({ value: '', style: { backgroundColor: color, padding: '18px 16px', margin: '0' } }));
  });
  legend.add(colorBar);

  var labelRow = ui.Panel({ layout: ui.Panel.Layout.flow('horizontal') });
  labelRow.add(ui.Label({
    value: '🔵 ≤ ' + blueThreshold + ' ' + unit,
    style: { fontSize: '12px', margin: '6px 0 0 0', color: '#2166ac', fontWeight: 'bold' }
  }));
  labelRow.add(ui.Label({ value: '      ', style: { margin: '0' } }));
  labelRow.add(ui.Label({
    value: '0 ' + unit,
    style: { fontSize: '12px', margin: '6px 0 0 0', color: '#4daf4a', fontWeight: 'bold' }
  }));
  labelRow.add(ui.Label({ value: '      ', style: { margin: '0' } }));
  labelRow.add(ui.Label({
    value: '🔴 ≥ +' + redThreshold + ' ' + unit,
    style: { fontSize: '12px', margin: '6px 0 0 0', color: '#b2182b', fontWeight: 'bold' }
  }));
  legend.add(labelRow);

  var unitNote = parameter === 'precipitation' ?
    'Units: ' + unit + ' (anomaly per day)' : 'Units: ' + unit + ' (anomaly from baseline)';
  legend.add(ui.Label({
    value: unitNote,
    style: { fontSize: '11px', margin: '6px 0 0 0', color: '#666', fontStyle: 'italic' }
  }));
  map.add(legend);
}


// ===========================================================================================
// CLICK HANDLER
// ===========================================================================================
function addClickHandler(map, fc, parameter, pastDays, forecastDays) {
  map.onClick(function (coords) {
    showDistrictLoadingIndicator();
    var point = ee.Geometry.Point([coords.lon, coords.lat]);
    var clicked = fc.filterBounds(point).first();
    clicked.evaluate(function (feature, err) {
      if (err || !feature) {
        showDistrictInfo('Click on a District', 'Click any district to see anomaly details.');
        return;
      }
      var props = feature.properties;
      var unit = parameter === 'precipitation' ? 'mm/day' : '°C';

      var fmt = function (v) {
        if (v === undefined || v === null || v === -999) return 'N/A';
        return v.toFixed(2);
      };
      var fmtDiff = function (v) {
        if (v === undefined || v === null || v === -999) return 'N/A';
        return (v > 0 ? '+' : '') + v.toFixed(2);
      };

      var pastStatus = getAnomalyStatus(props.past_diff);
      var forecastStatus = getAnomalyStatus(props.forecast_diff);
      var combinedStatus = getAnomalyStatus(props.combined_diff);

      var perDayLabel = parameter === 'precipitation' ? ' (per day)' : '';
      var combinedLbl = parameter === 'precipitation' ? ' (weighted avg/day)' : ' (weighted avg)';

      var content =
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        'Past ' + pastDays + ' Days' + perDayLabel + ':\n' +
        '   Observed:     ' + fmt(props.past_value) + ' ' + unit + '\n' +
        '   Baseline:     ' + fmt(props.past_baseline) + ' ' + unit + '\n' +
        '   Difference:  ' + fmtDiff(props.past_diff) + ' ' + unit + ' ' + pastStatus + '\n\n' +
        forecastDays + '-Day Forecast' + perDayLabel + ':\n' +
        '   Forecasted:  ' + fmt(props.forecast_value) + ' ' + unit + '\n' +
        '   Baseline:     ' + fmt(props.forecast_baseline) + ' ' + unit + '\n' +
        '   Difference:  ' + fmtDiff(props.forecast_diff) + ' ' + unit + ' ' + forecastStatus + '\n\n' +
        'Combined' + combinedLbl + ':\n' +
        '   Value:         ' + fmt(props.combined_value) + ' ' + unit + '\n' +
        '   Baseline:     ' + fmt(props.combined_baseline) + ' ' + unit + '\n' +
        '   Difference:  ' + fmtDiff(props.combined_diff) + ' ' + unit + ' ' + combinedStatus + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      showDistrictInfo(props.district_name || 'District', content);
    });
  });
}

function getAnomalyStatus(value) {
  if (value === undefined || value === null) return '';
  if (value > 0) return '(Above Baseline)';
  if (value < 0) return '(Below Baseline)';
  return '(At Baseline)';
}
