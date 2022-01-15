var blankdata = [];

for (var i = 0; i < 10; i++) {
  blankdata.push({ 0: "", 1: "", 2: "", 3: "" });
}

let data = [];

jspreadsheet(document.getElementById("spreadsheet"), {
  data: data,
  minDimensions: [4, 10],
  defaultColWidth: 100,
  tableOverflow: true,
  tableWidth: "800px",
  columns: [
    { type: "number", title: "Longitude", width: 200 },
    { type: "number", title: "Latitude", width: 200 },
    { type: "number", title: "Elevation", width: 200 },
    { type: "number", title: "Gravity", width: 200 }
  ]
});

let myTable = jspreadsheet.getElement(
  document.getElementById("spreadsheet")
)[0]["jspreadsheet"];

let L = window.L;

var gmap = L.tileLayer(
    "http://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}",
    {
      attribution: "google"
    }
  ),
  map = new L.Map("map", {
    center: new L.LatLng(0, 120),
    zoom: 4.4
  }),
  drawnItems = L.featureGroup().addTo(map);

L.control
  .layers(
    {
      google: gmap.addTo(map)
    },
    {
      drawlayer: drawnItems
    },
    {
      position: "topleft",
      collapsed: false
    }
  )
  .addTo(map);
map.addControl(
  new L.Control.Draw({
    edit: {
      featureGroup: drawnItems,
      poly: {
        allowIntersection: false
      }
    },
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true
      }
    }
  })
);

let layerCount = 0;

let bindCoordinates = () => {
  for (var i in map._layers[32]._layers) {
    var _ = map._layers[32]._layers[i]._latlngs[0];
    return _.map((a) => {
      return { ...a };
    });
  }
};

let boundaries;

let north = document.getElementById("north");
let south = document.getElementById("south");
let west = document.getElementById("west");
let east = document.getElementById("east");

map.on(L.Draw.Event.CREATED, function (event) {
  var layer = event.layer;
  if (layerCount < 1) {
    drawnItems.addLayer(layer);
    layerCount++;
    boundaries = layer.getBounds();
    north.value = boundaries.getNorth();
    west.value = boundaries.getWest();
    east.value = boundaries.getEast();
    south.value = boundaries.getSouth();

    north.removeAttribute("disabled");
    west.removeAttribute("disabled");
    east.removeAttribute("disabled");
    south.removeAttribute("disabled");
  }
});

map.on(L.Draw.Event.EDITRESIZE, function (event) {
  var layer = event.layer;
  boundaries = layer.getBounds();
  north.value = boundaries.getNorth();
  west.value = boundaries.getWest();
  east.value = boundaries.getEast();
  south.value = boundaries.getSouth();
});

map.on(L.Draw.Event.EDITMOVE, function (event) {
  var layer = event.layer;
  boundaries = layer.getBounds();
  north.value = boundaries.getNorth();
  west.value = boundaries.getWest();
  east.value = boundaries.getEast();
  south.value = boundaries.getSouth();
});

map.on(L.Draw.Event.EDITED, function (event) {
  boundaries = event.layers.getLayers()[0].getBounds();
  north.value = boundaries.getNorth();
  west.value = boundaries.getWest();
  east.value = boundaries.getEast();
  south.value = boundaries.getSouth();
});

map.on(L.Draw.Event.DELETED, function (event) {
  layerCount--;
  north.value = "";
  west.value = "";
  east.value = "";
  south.value = "";

  north.disabled = true;
  east.disabled = true;
  west.disabled = true;
  south.disabled = true;

  myTable.setData(blankdata);
});

north.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(north.value);
    if (val > boundaries._northEast.lat) {
      boundaries._northEast.lat += parseFloat(north.step);
    } else if (val < boundaries._northEast.lat) {
      boundaries._northEast.lat -= parseFloat(north.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

south.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(south.value);
    if (val > boundaries._southWest.lat) {
      boundaries._southWest.lat += parseFloat(south.step);
    } else if (val < boundaries._southWest.lat) {
      boundaries._southWest.lat -= parseFloat(south.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

west.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(west.value);
    if (val > boundaries._southWest.lng) {
      boundaries._southWest.lng += parseFloat(west.step);
    } else if (val < boundaries._southWest.lng) {
      boundaries._southWest.lng -= parseFloat(west.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

east.addEventListener("change", () => {
  if (boundaries != null) {
    let val = parseFloat(east.value);
    if (val > boundaries._northEast.lng) {
      boundaries._northEast.lng += parseFloat(east.step);
    } else if (val < boundaries._northEast.lng) {
      boundaries._northEast.lng -= parseFloat(east.step);
    }
    drawnItems.getLayers()[0].setBounds(boundaries);
  }
});

let withGravity = false;

document.getElementById("data-switch").addEventListener("change", () => {
  if (withGravity) {
    withGravity = false;
  } else {
    withGravity = true;
  }
});

let baseUri = "https://topex-downloader-api.herokuapp.com/api/v1/";

async function fetchData(mode) {
  let endpoint = baseUri + `${mode}?`;
  endpoint += `north=${parseFloat(north.value)}&`;
  endpoint += `west=${parseFloat(west.value)}&`;
  endpoint += `east=${parseFloat(east.value)}&`;
  endpoint += `south=${parseFloat(south.value)}`;

  let result;

  try {
    const response = await fetch(endpoint);
    if (response.ok) {
      const jsonResponse = await response.json();
      result = jsonResponse;
    }
  } catch (error) {
    console.log(error);
  }
  return result;
}

let fetchTopex = async () => {
  let _elevation;

  if (withGravity) {
    let _gravity;

    _elevation = await fetchData("elevation").then(async (r) => {
      return await r;
    });

    _gravity = await fetchData("gravity").then(async (r) => {
      return await r;
    });

    if (_gravity.length == _elevation.length) {
      let _data = [];

      for (var i = 0; i < _elevation.length; i++) {
        if (
          _elevation[i].longitude === _gravity[i].longitude &&
          _elevation[i].latitude === _gravity[i].latitude
        ) {
          _data.push({
            0: _elevation[i].longitude,
            1: _elevation[i].latitude,
            2: _elevation[i].value,
            3: _gravity[i].value
          });
        }
      }
      myTable.setData(_data);
    }
  } else if (!withGravity) {
    _elevation = await fetchData("elevation").then(async (r) => {
      return await r;
    });

    let _data = _elevation.map((i) => {
      return { 0: i.longitude, 1: i.latitude, 2: i.value };
    });

    myTable.setData(_data);
  }
};

let fetchButton = document.getElementById("fetch-data");

fetchButton.addEventListener("click", () => {
  fetchTopex();
});
