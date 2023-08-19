$('nav').click(function(){
  window.location = './index.html'
})

let L = window.L;
let csv

function ShowError(input, isFatal){
  $("#download-status").hide()
  $("#error-status").empty()
  $("#error-status").text(input)
  $("#error-status").show()
  if (!isFatal){
    setTimeout(function(){
      $("#error-status").hide()
      $("#download-status").show()
    },250)
  }
}

function AppendRow(input) {  
  $("#data-table").find("tbody").append(input)
}

function SetCSV(inp){
  csv = inp
}

function HideSaveButton(){
  $("#save-wrapper").hide(800)
}

window.ShowError = ShowError
window.AppendRow = AppendRow
window.SetCSV = SetCSV
window.HideSaveButton = HideSaveButton