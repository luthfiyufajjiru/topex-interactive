let data = [];

const RenderTable = () => {
  let width =  200

  if(window.innerWidth > 1100)
  {
    width = 250
  }
  else if(window.innerWidth > 1280)
  {
    width = 300
  }
  else if(window.innerWidth > 1600)
  {
    width = 400
  }

  jspreadsheet(document.getElementById("spreadsheet"), {
    data: data,
    minDimensions: [4, 10],
    defaultColWidth: 100,
    lazyLoading: true,
    lazyColumns: true,
    tableOverflow: true,
    columns: [
      { type: "number", title: "Longitude", width: width },
      { type: "number", title: "Latitude", width: width },
      { type: "number", title: "Elevation", width: width },
      { type: "number", title: "Gravity", width: width }
    ]
  })
  return jspreadsheet.getElement(document.getElementById("spreadsheet"))[0]["jspreadsheet"]
}

const GetMyTable = () => {
  return jspreadsheet.getElement(document.getElementById("spreadsheet"))[0]["jspreadsheet"]
}

export { RenderTable, GetMyTable }