import fetchData from './fetchData.js'
import myTable from './Spreadsheets/index.js'

let withGravity = false;

document.getElementById("data-switch").addEventListener("change", () => {
  if (withGravity) {
    withGravity = false;
  } else {
    withGravity = true;
  }
});

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

export default fetchTopex