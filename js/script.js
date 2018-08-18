"use strict";

(function() {
  let DATA = {};
  let TOTAL_COST = 0;
  let FULL_SCHEDULE = null;

  const STEP_LENGTH = 1;
  const STEP_RATES = {};
  const FIXED_SCHEDULE = {};
  const OPT_DEVICES = [];
  const FULL_DAY_DEVICES = [];
  const PERIODS = {
    day: [{
      from: 7,
      to: 21,
    }],
    night: [{
      from: 21,
      to: 24,
    },{
      from: 0,
      to: 7,
    }],
  };
  const OUTPUT = {};

  function loadJSON(callback) {
    const xobj = new XMLHttpRequest();
    xobj.overrideMimeType("application/json");
    xobj.open('GET', 'data/input.json', true);
    xobj.onreadystatechange = function () {
      if (xobj.readyState === 4 && xobj.status === 200) {
        callback(xobj.responseText);
      }
    };
    xobj.send(null);
  }

  function init(res) {
    DATA = JSON.parse(res);
    if (!errors()){
      getRatesByTimeStep();
      divideDevices();
      initSchedule();
      finalCalculations();
      prepareOutputObject();
      displayResults();
    }
  };

  function errors(){
    if (!DATA){
      alert("Missing input data");
      return true;
    } else if (!DATA.rates || DATA.rates.length === 0) {
      alert("Missing data about electricity rates");
      return true;
    } else if (!DATA.devices || DATA.devices.length === 0) {
      alert("Missing data about devices");
      return true;
    } else if (!DATA.maxPower || DATA.maxPower <= 0) {
      alert("Max power consumption is not set or incorrect");
      return true;
    } else if (!PERIODS || typeof(PERIODS) !== 'object') {
      alert("Information about day periods time frames is not set");
      return true;
    }
    return false;
  };

  function getRatesByTimeStep() {
    for ( const index in DATA.rates){
      const rate = DATA.rates[index]
      let from = rate.from;
      if (rate.from > rate.to){
        from -= 24;
      }
      for (let i = 0; (from + i * STEP_LENGTH) < rate.to; i ++ ){
        const moment = rate.from + i * STEP_LENGTH < 24 ? rate.from + i * STEP_LENGTH : rate.from + i * STEP_LENGTH - 24
        STEP_RATES[moment] = rate.value;
      }
    }
  };

  function divideDevices() {
    for (let i = 0; i < DATA.devices.length; i++){
      const device = DATA.devices[i];
      if (device.duration >= 24) {
        FULL_DAY_DEVICES.push(device)
      } else if (device.duration < 24 && device.duration > 0){
        OPT_DEVICES.push(device)
      } else {
        alert('device '+device.name+'was excluded from calculations due to incorrect working sequence duration')
      }
    }
  };

  function initSchedule() {
    for (let time in STEP_RATES){
      const devices = [];
      let power = 0;
      for (let i = 0; i < FULL_DAY_DEVICES.length; i++){
        const device = FULL_DAY_DEVICES[i];
        devices.push(device.id);
        power += device.power;
      }
      FIXED_SCHEDULE[time] = {activeDevices: devices, usedPower: power};
    }
  };

  function finalCalculations() {
    const possibleSchedule = {...FIXED_SCHEDULE};
    if (OPT_DEVICES.length > 0){
      trySchedule(possibleSchedule, 0);
    } else {
      calculateScheduleCost(possibleSchedule);
    }
  };

  function trySchedule(scheduleState, deviceIndex){
    const device = OPT_DEVICES[deviceIndex];
    if (!device){
      calculateScheduleCost(scheduleState);
      return;
    }

    let modes = [{from: 0, to: 24}] // time frame for devices without specified mode
    if (device.mode){
      modes = PERIODS[device.mode]; // if device have specified mode then use time frames of mode
    }
    for (const i in modes){ //for each time frame in device mode array
      const mode = modes[i];

      for (let j = mode.from; j < mode.to; j += STEP_LENGTH){ // for each step in current time frame
        const subState = JSON.parse(JSON.stringify(scheduleState)); // copy received schedule
        const startTime = j;  // current step start time
        let ok = true;

        for (let k = 0; k < device.duration; k += STEP_LENGTH) {  // for each step in device working circle duration
          const momentIndex = (startTime + k * STEP_LENGTH) < 24 ? (startTime + k * STEP_LENGTH) : (startTime + k * STEP_LENGTH - 24);
          const moment = subState[momentIndex]; // select schedule step
          moment.activeDevices.push(device.id); // add device to selected step
          moment.usedPower += device.power;   // update step power consumption
          if (moment.usedPower > DATA.maxPower){  // stop calculation of current schedule if exceeded max power limit
            ok = false;
            break;
          }
        }
        if (ok){
          trySchedule(subState, deviceIndex + 1); // add device to schedule calculations
        }
      }
    }
  }

  function calculateScheduleCost(schedule){
    let cost = 0;
    for (const key in schedule){
      cost += schedule[key].usedPower * STEP_RATES[key] * STEP_LENGTH;
    }
    cost = cost / 1000;
    if (TOTAL_COST === 0 || cost < TOTAL_COST) {
      TOTAL_COST = cost;
      FULL_SCHEDULE = schedule
    }
  }

  function prepareOutputObject(){
    OUTPUT['schedule'] = {};
    OUTPUT['consumedEnergy'] = {
      "value": TOTAL_COST,
      "devices": {}
    };
    for (const key in FULL_SCHEDULE) {
      OUTPUT.schedule[key] = FULL_SCHEDULE[key].activeDevices;
      for (let i = 0; i < FULL_SCHEDULE[key].activeDevices.length; i++){
        const id = FULL_SCHEDULE[key].activeDevices[i];
        const cost = STEP_RATES[key] * STEP_LENGTH * DATA.devices.find(d => d.id === id).power;
        if (OUTPUT.consumedEnergy.devices[id]){
          OUTPUT.consumedEnergy.devices[id] = OUTPUT.consumedEnergy.devices[id] + cost
        } else {
          OUTPUT.consumedEnergy.devices[id] = cost
        }
      }
    }
    for (const key in OUTPUT.consumedEnergy.devices){
      OUTPUT.consumedEnergy.devices[key] = OUTPUT.consumedEnergy.devices[key] / 1000;
    }
  }

  function displayResults(){
    const scheduleTable = document.getElementById('schedule-table');
    const tableBody = document.createElement('tbody');

    for (const key in OUTPUT.schedule){
      const row = document.createElement("tr");
      const time = document.createElement('td');
      const devices = document.createElement('td');
      time.innerText = key;
      for (let i = 0; i < OUTPUT.schedule[key].length; i++){
        devices.innerText = devices.innerText + DATA.devices.find(d => (d.id === OUTPUT.schedule[key][i])).name + ', '
      }
      row.appendChild(time);
      row.appendChild(devices);
      tableBody.appendChild(row);
    }
    scheduleTable.appendChild(tableBody);

    const charges = document.getElementById('charges');
    const costBody = document.createElement('tbody');
    for (const id in OUTPUT.consumedEnergy.devices){
      const device = DATA.devices.find(d => (d.id === id));
      const row = document.createElement("tr");
      const name = document.createElement('td');
      const cost = document.createElement('td');
      name.innerText = device.name;
      cost.innerText = OUTPUT.consumedEnergy.devices[id];
      row.appendChild(name);
      row.appendChild(cost);
      costBody.appendChild(row);
    }
    const row = document.createElement("tr");
    const name = document.createElement('td');
    const cost = document.createElement('td');
    row.appendChild(name);
    row.appendChild(cost);
    name.innerText = 'TOTAL';
    cost.innerText = TOTAL_COST.toString();
    costBody.appendChild(row);
    charges.appendChild(costBody);
  }

  loadJSON(init);
})();