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

export {disableCoordinatesForm, assignFormFromBoundaries, updateStepBoundaries}