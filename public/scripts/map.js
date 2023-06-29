let north = document.getElementById("north");
let south = document.getElementById("south");
let west = document.getElementById("west");
let east = document.getElementById("east");

let layerCount = 0;
let boundaries;

function disableCoordinatesForm(status) {
    north.disabled = status;
    east.disabled = status;
    west.disabled = status;
    south.disabled = status;
}

function assignFormFromBoundaries(boundaries) {
    north.value = boundaries.getNorth();
    west.value = boundaries.getWest();
    east.value = boundaries.getEast();
    south.value = boundaries.getSouth();
}

function updateStepBoundaries(northval = null, southval = null, eastval = null, westval = null) {
    north.min = southval == null ? north.min : southval
    south.max = northval == null ? south.min : northval
    east.min = westval == null ? east.min : westval
    west.max = eastval == null ? west.min : eastval
}

var gmap = L.tileLayer("https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}", { attribution: "google" })

function initMap(map, deletedMapCallback) {
    var drawnItems = L.featureGroup().addTo(map)
    L.control.layers({ google: gmap.addTo(map) }, { drawlayer: drawnItems }, { position: "topleft", collapsed: false }).addTo(map);
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
    )
    map.on(L.Draw.Event.CREATED, function (event) {
        var layer = event.layer;
        if (layerCount < 1) {
            drawnItems.addLayer(layer);
            layerCount++;
            boundaries = layer.getBounds();
            assignFormFromBoundaries(boundaries)
            updateStepBoundaries(north.value, south.value, east.value, west.value)
            disableCoordinatesForm(false)
            $("#fetch-data").prop("disabled", false);
        }
    });
    map.on(L.Draw.Event.EDITRESIZE, function (event) {
        var layer = event.layer;
        boundaries = layer.getBounds();
        assignFormFromBoundaries(boundaries)
        updateStepBoundaries(north.value, south.value, east.value, west.value)
    });
    map.on(L.Draw.Event.EDITMOVE, function (event) {
        var layer = event.layer;
        boundaries = layer.getBounds();
        assignFormFromBoundaries(boundaries)
        updateStepBoundaries(north.value, south.value, east.value, west.value)
    });
    map.on(L.Draw.Event.EDITED, function (event) {
        boundaries = event.layers.getLayers()[0].getBounds();
        assignFormFromBoundaries(boundaries)
        updateStepBoundaries(north.value, south.value, east.value, west.value)
    });
    map.on(L.Draw.Event.DELETED, function (event) {
        layerCount--;
        north.value = "";
        west.value = "";
        east.value = "";
        south.value = "";

        disableCoordinatesForm(true)
        deletedMapCallback(event)
    });
    north.addEventListener("change", () => {
        if (boundaries != null) {
            let val = parseFloat(north.value);
            boundaries._northEast.lat = val;
            drawnItems.getLayers()[0].setBounds(boundaries);
            updateStepBoundaries(north.value, south.value, east.value, west.value)
        }
    });
    south.addEventListener("change", () => {
        if (boundaries != null) {
            let val = parseFloat(south.value);
            boundaries._southWest.lat = val;
            drawnItems.getLayers()[0].setBounds(boundaries);
            updateStepBoundaries(north.value, south.value, east.value, west.value)
        }
    });
    west.addEventListener("change", () => {
        if (boundaries != null) {
            let val = parseFloat(west.value);
            boundaries._southWest.lng = val;
            drawnItems.getLayers()[0].setBounds(boundaries);
            updateStepBoundaries(north.value, south.value, east.value, west.value)
        }
    });
    east.addEventListener("change", () => {
        if (boundaries != null) {
            let val = parseFloat(east.value);
            boundaries._northEast.lng = val;
            drawnItems.getLayers()[0].setBounds(boundaries);
            updateStepBoundaries(north.value, south.value, east.value, west.value)
        }
    });
}

export { initMap }
