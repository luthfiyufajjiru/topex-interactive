let data = [];

const RenderTable = () => {
  jspreadsheet(document.getElementById("spreadsheet"), {
    data: data,
    minDimensions: [4, 10],
    defaultColWidth: 100,
    lazyLoading: true,
    lazyColumns: true,
    tableOverflow: true,
    tableWidth: "fit-content",
    columns: [
      { type: "number", title: "Longitude", width: 200 },
      { type: "number", title: "Latitude", width: 200 },
      { type: "number", title: "Elevation", width: 200 },
      { type: "number", title: "Gravity", width: 200 }
    ]
  })
  return jspreadsheet.getElement(document.getElementById("spreadsheet"))[0]["jspreadsheet"]
}

const GetMyTable = () => {
  return jspreadsheet.getElement(document.getElementById("spreadsheet"))[0]["jspreadsheet"]
}

export { RenderTable, GetMyTable }