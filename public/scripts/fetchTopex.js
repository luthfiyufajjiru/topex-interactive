import fetchData from './fetchData.js'

let withGravity = false

document.getElementById("data-switch").addEventListener("change", () => {
  if (withGravity) {
    withGravity = false;
  } else {
    withGravity = true;
  }
});

const RenderWarning = (msg) => {
  $('body').prepend(
    `<div class="oaerror danger">
      <strong>Application Error</strong> - ${msg} Please try again.
    </div>`
  );

  setTimeout(function() {
    $('.oaerror').fadeOut();
  }, 2000);
  
  setTimeout(function() {
    $('.oaerror').remove();
  }, 2100);
  
}

let fetchTopex = async (myTable, workonline) => {
  let _elevation;

  if (withGravity && workonline)
  {
    let _gravity
    let _err1
    let _err2
    
    await Promise.all([
      fetchData("elevation", workonline)
      .then(r => r)
      .catch(err => { _err1 = err.message }),

      fetchData("gravity", workonline)
      .then(r => r)
      .catch(err => { _err2 = err.message })
    ])
    .then((res) => {
      _elevation = res[0]
      _gravity = res[1]
    })

    if( _err1 != null || _err2 != null)
    {
      if( _err1 == _err2)
      {
        RenderWarning(_err1)
      }
    } 
    else if (_gravity.length == _elevation.length) {
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
  }
  else if(withGravity && !workonline)
  {
    await fetchData("gravity", workonline)
  }
  else if (!withGravity) {
    _elevation = await fetchData("elevation", workonline).then(async (r) => {
      return await r;
    }).catch(err => {
      RenderWarning(err.message)
    });

    let _data = _elevation.map((i) => {
      return { 0: i.longitude, 1: i.latitude, 2: i.value };
    });

    myTable.setData(_data);
  }
};

export default fetchTopex